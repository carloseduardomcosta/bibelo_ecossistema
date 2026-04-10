import crypto from "crypto";
import { Router, Request, Response } from "express";
import { query, queryOne } from "../../db";
import { logger } from "../../utils/logger";
import { upsertCustomer, calculateScore } from "../../services/customer.service";
import { getValidToken, BLING_API } from "./auth";
import { rateLimitedGet } from "./sync";

export const blingWebhookRouter = Router();

// ── Idempotency cache (60s TTL) ─────────────────────────────
const recentBlingEvents = new Map<string, number>();

// ── Mutex do sync Medusa ──────────────────────────────────────
// Evita N syncs paralelos quando múltiplos webhooks chegam em burst.
// Padrão "run + pending": se um sync está rodando e novo evento chega,
// marca pendente=true. Ao terminar, dispara mais 1 sync (e não mais).
let medusaSyncRunning = false;
let medusaSyncPending = false;

async function runMedusaSync(origem: string): Promise<void> {
  if (medusaSyncRunning) {
    medusaSyncPending = true;
    logger.info(`Bling webhook → Medusa sync já rodando, pendente marcado (origem: ${origem})`);
    return;
  }
  medusaSyncRunning = true;
  medusaSyncPending = false;
  try {
    const { syncBlingToMedusa } = await import("../medusa/sync");
    await syncBlingToMedusa();
    logger.info(`Bling webhook → Medusa sync concluído (origem: ${origem})`);
  } catch (err: any) {
    logger.warn(`Bling webhook → Medusa sync falhou: ${err.message}`);
  } finally {
    medusaSyncRunning = false;
    if (medusaSyncPending) {
      logger.info("Bling webhook → iniciando sync pendente acumulado");
      setImmediate(() => runMedusaSync("pendente"));
    }
  }
}

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

  if (!signature) {
    logger.warn("Bling webhook: sem assinatura HMAC — rejeitado");
    res.status(403).json({ error: "Assinatura HMAC obrigatória" });
    return;
  }

  const rawBodyBuf = (req as any).rawBody;
  if (!rawBodyBuf) {
    logger.warn("Bling webhook: rawBody ausente — não é possível validar HMAC com segurança");
    res.status(400).json({ error: "Corpo da requisição não disponível para validação" });
    return;
  }

  if (!validateBlingHMAC(rawBodyBuf.toString(), signature)) {
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

  // Webhook do Bling NÃO envia itens — buscar detalhe via API
  let itens: unknown[] = pedido.itens as unknown[] || [];
  let valorTotal = pedido.totalProdutos || pedido.total || 0;

  if (!itens.length) {
    try {
      const token = await getValidToken();
      const detail = await rateLimitedGet<{ data: Record<string, unknown> }>(
        `${BLING_API}/pedidos/vendas/${pedido.id}`,
        token
      );
      if (detail.data?.itens) {
        itens = detail.data.itens as unknown[];
      }
      if (detail.data?.total) {
        valorTotal = detail.data.total;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro";
      logger.warn("Bling webhook: erro ao buscar detalhe do pedido", { pedidoId: pedido.id, error: msg });
    }
  }

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
      valorTotal,
      (pedido.situacao as Record<string, unknown>)?.valor || evento,
      pedido.loja ? "online" : "fisico",
      JSON.stringify(itens),
      pedido.data || null,
    ]
  );

  if (customerId) {
    await calculateScore(customerId);
  }

  logger.info(`Bling webhook: pedido ${evento}`, { blingId: pedido.id, customerId, itens: itens.length });
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

// ── Processar evento de produto → sync individual para Medusa ─

async function processProduct(data: Record<string, unknown>, evento: string): Promise<void> {
  const produto = (data.produto || data) as Record<string, unknown>;
  if (!produto?.id) return;

  const blingProductId = String(produto.id);

  try {
    // Buscar dados completos do produto no Bling (o webhook só traz o ID)
    const token = await getValidToken();
    const detail = await rateLimitedGet<{ data: Record<string, unknown> }>(
      `${BLING_API}/produtos/${blingProductId}`,
      token
    );

    if (!detail.data) return;
    const prod = detail.data;

    // Buscar mapa de categorias para resolver o nome
    const categoriaObj = prod.categoria as { id?: number } | undefined;
    let categoriaName: string | null = null;
    let blingCategoryId: string | null = null;

    if (categoriaObj?.id && categoriaObj.id > 0) {
      blingCategoryId = String(categoriaObj.id);
      // Buscar nome da categoria
      const catRow = await queryOne<{ nome: string }>(
        "SELECT nome FROM sync.bling_medusa_categories WHERE bling_category_id = $1",
        [blingCategoryId]
      );
      categoriaName = catRow?.nome || null;
    }

    // Extrair imagens do detalhe (inclui midia.imagens completo!)
    const midia = prod.midia as Record<string, unknown> | undefined;
    const imagensInternas = (midia?.imagens as Record<string, unknown>)?.internas as Array<Record<string, unknown>> | undefined;
    const imagensExternas = (midia?.imagens as Record<string, unknown>)?.externas as Array<Record<string, unknown>> | undefined;
    let imagens = [
      ...(imagensInternas || []).map((img, i) => ({ url: img.link || img.linkMiniatura, ordem: i })),
      ...(imagensExternas || []).map((img, i) => ({ url: img.link, ordem: 100 + i })),
    ].filter((img) => img.url);

    if (imagens.length === 0 && prod.imagemURL) {
      imagens = [{ url: prod.imagemURL as string, ordem: 0 }];
    }

    const isDeleted = evento.includes("deleted");
    const isActive = !isDeleted && (prod.situacao === "A" || prod.situacao === "Ativo");

    // Upsert no banco local
    await query(
      `INSERT INTO sync.bling_products
       (bling_id, nome, sku, preco_custo, preco_venda, categoria, bling_category_id, imagens, ativo, tipo, unidade, peso_bruto, gtin, dados_raw, sincronizado_em)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
       ON CONFLICT (bling_id) DO UPDATE SET
         nome = $2, sku = $3, preco_custo = $4, preco_venda = $5, categoria = $6,
         bling_category_id = $7, imagens = $8, ativo = $9, tipo = $10, unidade = $11,
         peso_bruto = $12, gtin = $13, dados_raw = $14, sincronizado_em = NOW()`,
      [
        blingProductId,
        prod.nome || "Sem nome",
        prod.codigo || null,
        prod.precoCusto || 0,
        prod.preco || 0,
        categoriaName,
        blingCategoryId,
        JSON.stringify(imagens),
        isActive,
        prod.tipo || "P",
        prod.unidade || "UN",
        prod.pesoBruto || null,
        prod.gtin || null,
        JSON.stringify(prod),
      ]
    );

    logger.info(`Bling webhook: produto ${evento}`, { blingProductId, nome: prod.nome });

    // Propagar para o Medusa em background (não bloqueia resposta do webhook)
    // O sync lê do banco local (zero chamadas extras ao Bling)
    // Mutex runMedusaSync garante no máximo 1 sync ativo + 1 pendente por vez
    setImmediate(() => runMedusaSync(String(prod.nome || "produto")));
  } catch (err: any) {
    logger.error(`Bling webhook: erro ao processar produto ${blingProductId}: ${err.message}`);
  }
}

// ── Rota principal do webhook ────────────────────────────────

blingWebhookRouter.post("/", blingWebhookAuth, async (req: Request, res: Response) => {
  const body = req.body;
  const evento = (body.evento || body.event || "") as string;
  const resourceId = String(body.data?.id || body.data?.pedido?.id || body.data?.contato?.id || body.data?.estoque?.produto?.id || "unknown");

  // Idempotency: usa eventId do Bling quando disponível (único por evento genuíno).
  // Fallback para evento:resourceId só se não houver eventId.
  // Isso garante que uploads múltiplos de fotos (cada um com eventId diferente)
  // sejam todos processados — sem bloquear updates legítimos em sequência rápida.
  const blingEventId = (body.eventId || body.event_id || "") as string;
  const eventKey = blingEventId || `${evento}:${resourceId}`;
  const lastSeen = recentBlingEvents.get(eventKey);
  if (lastSeen && Date.now() - lastSeen < 60000) {
    logger.info("Bling webhook duplicado ignorado", { evento, resourceId, eventKey });
    res.json({ ok: true, duplicado: true });
    return;
  }
  recentBlingEvents.set(eventKey, Date.now());

  // Cleanup entradas antigas
  for (const [k, v] of recentBlingEvents) {
    if (Date.now() - v > 120000) recentBlingEvents.delete(k);
  }

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
    } else if (ev.startsWith("product") || ev.startsWith("produto")) {
      await processProduct(body.data || body, evento);
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
