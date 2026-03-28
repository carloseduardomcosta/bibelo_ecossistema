import crypto from "crypto";
import { Router, Request, Response } from "express";
import { query, queryOne } from "../../db";
import { logger } from "../../utils/logger";
import { upsertCustomer, calculateScore } from "../../services/customer.service";
import { getNuvemShopToken, nsRequest } from "./auth";

export const nuvemshopWebhookRouter = Router();

// ── Validate HMAC ──────────────────────────────────────────────
// NuvemShop assina com client_secret via HMAC-SHA256

function validateHMAC(payload: string, signature: string): boolean {
  const secret = process.env.NUVEMSHOP_CLIENT_SECRET || process.env.NUVEMSHOP_WEBHOOK_SECRET;
  if (!secret) return false;

  const computed = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(computed, "hex"),
      Buffer.from(signature, "hex")
    );
  } catch {
    return false;
  }
}

// ── Middleware de validação ─────────────────────────────────────

function webhookAuth(req: Request, res: Response, next: () => void): void {
  const signature = req.headers["x-linkedstore-hmac-sha256"] as string;

  if (!signature) {
    logger.warn("NuvemShop webhook: sem assinatura HMAC");
    // Aceita mesmo assim durante configuração inicial
    next();
    return;
  }

  const rawBody = JSON.stringify(req.body);
  if (!validateHMAC(rawBody, signature)) {
    logger.warn("NuvemShop webhook: HMAC inválido");
    res.status(401).json({ error: "Assinatura inválida" });
    return;
  }

  next();
}

// ── Buscar detalhes do objeto via API ──────────────────────────
// NuvemShop webhook envia apenas { store_id, event, id }

async function fetchOrderDetails(orderId: string): Promise<Record<string, unknown> | null> {
  const token = await getNuvemShopToken();
  if (!token) return null;

  try {
    return await nsRequest<Record<string, unknown>>("get", `orders/${orderId}`, token);
  } catch (err: unknown) {
    logger.warn("NuvemShop: falha ao buscar pedido", { orderId, error: err instanceof Error ? err.message : "Erro" });
    return null;
  }
}

async function fetchCustomerDetails(customerId: string): Promise<Record<string, unknown> | null> {
  const token = await getNuvemShopToken();
  if (!token) return null;

  try {
    return await nsRequest<Record<string, unknown>>("get", `customers/${customerId}`, token);
  } catch (err: unknown) {
    logger.warn("NuvemShop: falha ao buscar cliente", { customerId, error: err instanceof Error ? err.message : "Erro" });
    return null;
  }
}

// ── Process Order ─────────────────────────────────────────────

async function processOrder(resourceId: string, event: string): Promise<void> {
  const order = await fetchOrderDetails(resourceId);
  if (!order) return;

  const customer = order.customer as Record<string, unknown> | undefined;
  let customerId: string | null = null;

  if (customer) {
    const upserted = await upsertCustomer({
      nome: (customer.name as string) || "Sem nome",
      email: (customer.email as string) || undefined,
      telefone: (customer.phone as string) || undefined,
      canal_origem: "nuvemshop",
      nuvemshop_id: String(customer.id),
    });
    customerId = upserted.id;
  }

  const products = (order.products as Array<Record<string, unknown>>) || [];
  const valor = parseFloat(String(order.total || 0));

  if (event.includes("cancelled")) {
    await query(
      `UPDATE sync.nuvemshop_orders SET status = 'cancelled', processado = true WHERE ns_id = $1`,
      [resourceId]
    );
  } else {
    await query(
      `INSERT INTO sync.nuvemshop_orders (ns_id, customer_id, numero, valor, status, itens, processado)
       VALUES ($1, $2, $3, $4, $5, $6, true)
       ON CONFLICT (ns_id) DO UPDATE SET
         customer_id = $2, valor = $4, status = $5, itens = $6, processado = true`,
      [
        resourceId,
        customerId,
        String(order.number || ""),
        valor,
        (order.payment_status as string) || "pending",
        JSON.stringify(products),
      ]
    );
  }

  if (customerId) {
    await calculateScore(customerId);
  }

  logger.info(`NuvemShop webhook: pedido ${event}`, { orderId: resourceId, customerId });
}

// ── Process Customer ──────────────────────────────────────────

async function processCustomer(resourceId: string, event: string): Promise<void> {
  const customer = await fetchCustomerDetails(resourceId);
  if (!customer) return;

  await upsertCustomer({
    nome: (customer.name as string) || "Sem nome",
    email: (customer.email as string) || undefined,
    telefone: (customer.phone as string) || undefined,
    cpf: (customer.identification as string) || undefined,
    canal_origem: "nuvemshop",
    nuvemshop_id: String(customer.id),
  });

  logger.info(`NuvemShop webhook: cliente ${event}`, { customerId: resourceId });
}

// ── Webhook Route ──────────────────────────────────────────────

nuvemshopWebhookRouter.post("/", webhookAuth, async (req: Request, res: Response) => {
  const body = req.body;
  const event = (req.headers["x-event"] as string) || body.event || "";
  const resourceId = String(body.id || "");
  const storeId = body.store_id;

  logger.info("NuvemShop webhook recebido", { event, resourceId, storeId });

  try {
    // Log do evento
    await query(
      `INSERT INTO sync.sync_logs (fonte, tipo, status, registros, erro) VALUES ('nuvemshop', $1, 'ok', 1, NULL)`,
      [`webhook:${event}`]
    );

    if (event.startsWith("order/") && resourceId) {
      await processOrder(resourceId, event);
    } else if (event.startsWith("customer/") && resourceId) {
      await processCustomer(resourceId, event);
    } else {
      logger.info("NuvemShop webhook: evento não mapeado", { event });
    }

    // Atualiza sync_state
    await query(
      "UPDATE sync.sync_state SET ultima_sync = NOW(), total_sincronizados = total_sincronizados + 1 WHERE fonte = 'nuvemshop'",
      []
    );

    res.status(200).json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro ao processar webhook";
    logger.error("NuvemShop webhook erro", { event, error: message });

    await query(
      `INSERT INTO sync.sync_logs (fonte, tipo, status, registros, erro) VALUES ('nuvemshop', $1, 'erro', 0, $2)`,
      [event || "unknown", message]
    );

    res.status(500).json({ error: "Erro ao processar webhook" });
  }
});
