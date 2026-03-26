import crypto from "crypto";
import { Router, Request, Response } from "express";
import { query, queryOne } from "../../db";
import { logger } from "../../utils/logger";
import { upsertCustomer, calculateScore } from "../../services/customer.service";

export const nuvemshopWebhookRouter = Router();

// ── Validate HMAC ──────────────────────────────────────────────

export function validateHMAC(payload: string, signature: string): boolean {
  const secret = process.env.NUVEMSHOP_WEBHOOK_SECRET!;
  const computed = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");
  return crypto.timingSafeEqual(
    Buffer.from(computed, "hex"),
    Buffer.from(signature, "hex")
  );
}

// ── Middleware de validação ─────────────────────────────────────

function webhookAuth(req: Request, res: Response, next: () => void): void {
  const signature = req.headers["x-linkedstore-hmac-sha256"] as string;
  if (!signature) {
    res.status(401).json({ error: "Assinatura ausente" });
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

// ── Process Order Created ──────────────────────────────────────

async function processOrderCreated(data: Record<string, unknown>): Promise<void> {
  const customer = data.customer as Record<string, unknown> | undefined;

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

  const products = (data.products as Array<Record<string, unknown>>) || [];

  await query(
    `INSERT INTO sync.nuvemshop_orders (ns_id, customer_id, numero, valor, status, itens, processado)
     VALUES ($1, $2, $3, $4, $5, $6, true)
     ON CONFLICT (ns_id) DO UPDATE SET
       customer_id = $2, valor = $4, status = $5, itens = $6, processado = true`,
    [
      String(data.id),
      customerId,
      String(data.number || ""),
      data.total || 0,
      data.payment_status || "pending",
      JSON.stringify(products),
    ]
  );

  if (customerId) {
    await calculateScore(customerId);
  }

  logger.info("NuvemShop: pedido criado processado", { orderId: data.id, customerId });
}

// ── Process Order Paid ─────────────────────────────────────────

async function processOrderPaid(data: Record<string, unknown>): Promise<void> {
  const order = await queryOne<{ customer_id: string }>(
    "SELECT customer_id FROM sync.nuvemshop_orders WHERE ns_id = $1",
    [String(data.id)]
  );

  await query(
    `UPDATE sync.nuvemshop_orders SET status = $1, processado = true WHERE ns_id = $2`,
    [data.payment_status || "paid", String(data.id)]
  );

  if (order?.customer_id) {
    await calculateScore(order.customer_id);
  }

  logger.info("NuvemShop: pedido pago processado", { orderId: data.id });
}

// ── Process Customer Created ───────────────────────────────────

async function processCustomerCreated(data: Record<string, unknown>): Promise<void> {
  await upsertCustomer({
    nome: (data.name as string) || "Sem nome",
    email: (data.email as string) || undefined,
    telefone: (data.phone as string) || undefined,
    canal_origem: "nuvemshop",
    nuvemshop_id: String(data.id),
  });

  logger.info("NuvemShop: cliente criado processado", { nsCustomerId: data.id });
}

// ── Webhook Route ──────────────────────────────────────────────

nuvemshopWebhookRouter.post("/", webhookAuth, async (req: Request, res: Response) => {
  const event = req.headers["x-event"] as string || req.body.event;
  const data = req.body;

  try {
    switch (event) {
      case "order/created":
        await processOrderCreated(data);
        break;
      case "order/paid":
        await processOrderPaid(data);
        break;
      case "customer/created":
        await processCustomerCreated(data);
        break;
      default:
        logger.info("NuvemShop webhook: evento ignorado", { event });
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
