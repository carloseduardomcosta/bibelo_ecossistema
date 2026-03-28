import crypto from "crypto";
import { Router, Request, Response } from "express";
import { query, queryOne } from "../../db";
import { logger } from "../../utils/logger";
import { upsertCustomer, calculateScore } from "../../services/customer.service";

export const blingWebhookRouter = Router();

// ── Validar HMAC do Bling ────────────────────────────────────
// Header: X-Bling-Signature-256: sha256=<hash>
// Hash = HMAC-SHA256(body, BLING_CLIENT_SECRET)

function validateBlingHMAC(payload: string, signature: string): boolean {
  const secret = process.env.BLING_CLIENT_SECRET;
  if (!secret) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");

  const received = signature.replace("sha256=", "");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, "hex"),
      Buffer.from(received, "hex")
    );
  } catch {
    return false;
  }
}

// ── Middleware de autenticação ────────────────────────────────

function blingWebhookAuth(req: Request, res: Response, next: () => void): void {
  const signature = req.headers["x-bling-signature-256"] as string;

  // Bling pode enviar sem assinatura em desenvolvimento — loggar mas aceitar
  if (!signature) {
    logger.warn("Bling webhook: sem assinatura HMAC");
    // Aceita mesmo assim para não perder eventos durante configuração
    next();
    return;
  }

  const rawBody = JSON.stringify(req.body);
  if (!validateBlingHMAC(rawBody, signature)) {
    logger.warn("Bling webhook: HMAC inválido");
    res.status(401).json({ error: "Assinatura inválida" });
    return;
  }

  next();
}

// ── Processar evento de contato ──────────────────────────────

async function processContato(data: Record<string, unknown>, evento: string): Promise<void> {
  const contato = data.contato as Record<string, unknown> | undefined;
  if (!contato) return;

  const customer = await upsertCustomer({
    nome: (contato.nome as string) || "Sem nome",
    email: (contato.email as string) || undefined,
    telefone: (contato.celular as string) || (contato.fone as string) || undefined,
    cpf: (contato.cpf_cnpj as string) || undefined,
    canal_origem: "bling",
    bling_id: String(contato.id),
  });

  await query(
    `INSERT INTO sync.bling_customers (bling_id, customer_id, dados_raw, ultima_sync)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (bling_id) DO UPDATE SET customer_id = $2, dados_raw = $3, ultima_sync = NOW()`,
    [String(contato.id), customer.id, JSON.stringify(contato)]
  );

  logger.info(`Bling webhook: contato ${evento}`, { blingId: contato.id, customerId: customer.id });
}

// ── Processar evento de pedido ───────────────────────────────

async function processPedido(data: Record<string, unknown>, evento: string): Promise<void> {
  // Webhook pode enviar pedido em data.pedido, data, ou diretamente no root
  const pedido = (data.pedido || data) as Record<string, unknown>;
  if (!pedido || !pedido.id) return;

  const contato = pedido.contato as Record<string, unknown> | undefined;
  let customerId: string | null = null;

  if (contato?.id) {
    const existing = await queryOne<{ customer_id: string }>(
      "SELECT customer_id FROM sync.bling_customers WHERE bling_id = $1",
      [String(contato.id)]
    );
    customerId = existing?.customer_id || null;
  }

  await query(
    `INSERT INTO sync.bling_orders (bling_id, customer_id, numero, valor, status, canal, itens, criado_bling)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (bling_id) DO UPDATE SET
       customer_id = $2, valor = $4, status = $5, itens = $7`,
    [
      String(pedido.id),
      customerId,
      pedido.numero || null,
      pedido.totalProdutos || pedido.total || 0,
      (pedido.situacao as Record<string, unknown>)?.valor || evento,
      pedido.loja ? "online" : "fisico",
      JSON.stringify(pedido.itens || []),
      pedido.data || null,
    ]
  );

  if (customerId) {
    await calculateScore(customerId);
  }

  logger.info(`Bling webhook: pedido ${evento}`, { blingId: pedido.id, customerId });
}

// ── Processar evento de estoque ──────────────────────────────

async function processEstoque(data: Record<string, unknown>): Promise<void> {
  const estoque = (data.estoque || data) as Record<string, unknown>;
  if (!estoque) return;

  const produtoId = estoque.produto as Record<string, unknown> | undefined;
  if (!produtoId?.id) return;

  const blingProductId = String(produtoId.id);

  // Busca o produto local
  const product = await queryOne<{ id: string }>(
    "SELECT id FROM sync.bling_products WHERE bling_id = $1",
    [blingProductId]
  );

  if (!product) return;

  const deposito = estoque.deposito as Record<string, unknown> | undefined;

  await query(
    `INSERT INTO sync.bling_stock (product_id, bling_product_id, deposito_id, deposito_nome, saldo_fisico, saldo_virtual, sincronizado_em)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     ON CONFLICT (bling_product_id, deposito_id) DO UPDATE SET
       saldo_fisico = $5, saldo_virtual = $6, sincronizado_em = NOW()`,
    [
      product.id,
      blingProductId,
      deposito?.id ? String(deposito.id) : "default",
      deposito?.descricao || "Principal",
      estoque.saldoFisico || 0,
      estoque.saldoVirtual || 0,
    ]
  );

  logger.info("Bling webhook: estoque atualizado", { blingProductId });
}

// ── Rota principal do webhook ────────────────────────────────

blingWebhookRouter.post("/", blingWebhookAuth, async (req: Request, res: Response) => {
  const body = req.body;
  const evento = (body.evento || body.event || "") as string;

  try {
    // Log do evento recebido
    await query(
      `INSERT INTO sync.sync_logs (fonte, tipo, status, registros, erro)
       VALUES ('bling', $1, 'ok', 1, NULL)`,
      [`webhook:${evento}`]
    );

    // Log payload para debug (temporário)
    logger.info("Bling webhook recebido", { evento, payload: JSON.stringify(body).slice(0, 1000) });

    // Mapeia eventos do Bling para handlers
    // Bling v3 envia: order.created, order.updated, stock.updated, product.created, etc.
    const ev = evento.toLowerCase();
    if (ev.startsWith("contato") || ev.startsWith("supplier") || ev.startsWith("fornecedor")) {
      await processContato(body.data || body, evento);
    } else if (ev.startsWith("order") || ev.startsWith("pedido")) {
      await processPedido(body.data || body, evento);
    } else if (ev.startsWith("stock") || ev.startsWith("estoque")) {
      await processEstoque(body.data || body);
    } else {
      logger.info("Bling webhook: evento não mapeado", { evento, body: JSON.stringify(body).slice(0, 500) });
    }

    // Atualiza sync_state
    await query(
      "UPDATE sync.sync_state SET ultima_sync = NOW(), total_sincronizados = total_sincronizados + 1 WHERE fonte = 'bling'",
      []
    );

    res.status(200).json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro ao processar webhook";
    logger.error("Bling webhook erro", { evento, error: message });

    await query(
      `INSERT INTO sync.sync_logs (fonte, tipo, status, registros, erro)
       VALUES ('bling', $1, 'erro', 0, $2)`,
      [`webhook:${evento}`, message]
    );

    res.status(500).json({ error: "Erro ao processar webhook" });
  }
});
