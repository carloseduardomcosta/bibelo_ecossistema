import { Router, Request, Response } from "express";
import { z } from "zod";
import { query, queryOne } from "../db";
import { logger } from "../utils/logger";
import { authMiddleware } from "../middleware/auth";
import rateLimit from "express-rate-limit";
import { resolveGeo } from "../utils/geoip";

export const trackingRouter = Router();

// ── Filtro de tráfego interno/testes ─────────────────────────
// Exclui: IPs Docker internos, customers de teste, IPs do admin (via .env)
const INTERNAL_FILTER = `
  AND t.ip::text NOT LIKE '172.21.%'
  AND t.ip::text NOT LIKE '163.116.%'
  AND t.ip::text NOT LIKE '167.238.%'
  AND NOT EXISTS (
    SELECT 1 FROM crm.customers c2
    WHERE c2.id = t.customer_id
      AND (c2.canal_origem = 'teste' OR c2.email LIKE '%+teste@%')
  )
`;

function getInternalIps(): string[] {
  return (process.env.INTERNAL_IPS || "").split(",").map(ip => ip.trim()).filter(Boolean);
}

// ── Rate limit para endpoints públicos ────────────────────────

const publicLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60, // 1 evento por segundo
  message: { error: "Rate limit" },
});

// ════════════════════════════════════════════════════════════════
// ENDPOINTS PÚBLICOS (sem auth — chamados pelo script JS)
// ════════════════════════════════════════════════════════════════

// ── POST /api/tracking/event — registrar evento ───────────────

const eventSchema = z.object({
  visitor_id: z.string().max(100),
  evento: z.enum(["page_view", "product_view", "category_view", "add_to_cart", "search", "checkout_start"]),
  pagina: z.string().max(2000).optional(),
  pagina_tipo: z.enum(["home", "product", "category", "cart", "checkout", "search", "other"]).optional(),
  resource_id: z.string().max(100).optional(),
  resource_nome: z.string().max(300).optional(),
  resource_preco: z.number().optional(),
  resource_imagem: z.string().max(1000).optional(),
  referrer: z.string().max(2000).optional(),
  metadata: z.record(z.unknown()).optional(),
});

trackingRouter.post("/event", publicLimiter, async (req: Request, res: Response) => {
  // sendBeacon envia como text/plain — parse manual se necessário
  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { res.status(400).json({ ok: false }); return; }
  }
  const parsed = eventSchema.safeParse(body);
  if (!parsed.success) {
    res.status(400).json({ ok: false });
    return;
  }

  const d = parsed.data;

  // Busca customer_id vinculado ao visitor
  const link = await queryOne<{ customer_id: string }>(
    "SELECT customer_id FROM crm.visitor_customers WHERE visitor_id = $1",
    [d.visitor_id]
  );

  // Usa IP real do socket (não X-Forwarded-For) para prevenir spoofing em endpoint público
  const realIp = req.socket.remoteAddress || req.ip;
  const geo = resolveGeo(realIp);

  await query(
    `INSERT INTO crm.tracking_events
     (visitor_id, customer_id, evento, pagina, pagina_tipo, resource_id, resource_nome,
      resource_preco, resource_imagem, referrer, metadata,
      ip, geo_city, geo_region, geo_country, geo_lat, geo_lon)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
    [
      d.visitor_id,
      link?.customer_id || null,
      d.evento,
      d.pagina || null,
      d.pagina_tipo || null,
      d.resource_id || null,
      d.resource_nome || null,
      d.resource_preco || null,
      d.resource_imagem ? d.resource_imagem.replace(/^http:\/\//i, "https://") : null,
      d.referrer || null,
      JSON.stringify(d.metadata || {}),
      geo?.ip || null,
      geo?.city || null,
      geo?.region || null,
      geo?.country || null,
      geo?.lat || null,
      geo?.lon || null,
    ]
  );

  res.json({ ok: true });
});

// ── POST /api/tracking/identify — vincular visitor a customer ─

const identifySchema = z.object({
  visitor_id: z.string().max(100),
  email: z.string().email(),
});

trackingRouter.post("/identify", publicLimiter, async (req: Request, res: Response) => {
  const parsed = identifySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false });
    return;
  }

  const { visitor_id, email } = parsed.data;

  // Busca cliente pelo email
  const customer = await queryOne<{ id: string }>(
    "SELECT id FROM crm.customers WHERE email = $1",
    [email]
  );

  if (!customer) {
    // Resposta genérica — não revela se email existe (previne enumeration)
    res.json({ ok: true });
    return;
  }

  // Salva vínculo
  await query(
    `INSERT INTO crm.visitor_customers (visitor_id, customer_id)
     VALUES ($1, $2)
     ON CONFLICT (visitor_id) DO UPDATE SET customer_id = $2, vinculado_em = NOW()`,
    [visitor_id, customer.id]
  );

  // Atualiza eventos anteriores desse visitor
  await query(
    "UPDATE crm.tracking_events SET customer_id = $2 WHERE visitor_id = $1 AND customer_id IS NULL",
    [visitor_id, customer.id]
  );

  logger.info("Visitor vinculado a cliente", { visitor_id, customerId: customer.id });
  // Resposta genérica idêntica — não revela se email existe
  res.json({ ok: true });
});

// ════════════════════════════════════════════════════════════════
// ENDPOINTS PROTEGIDOS (painel CRM)
// ════════════════════════════════════════════════════════════════

// ── GET /api/tracking/timeline — feed real-time de eventos ────

trackingRouter.get("/timeline", authMiddleware, async (req: Request, res: Response) => {
  const limit = Math.min(parseInt(String(req.query.limit || "50"), 10), 200);
  const offset = parseInt(String(req.query.offset || "0"), 10);
  const ips = getInternalIps();

  const ipFilter = ips.length > 0
    ? `AND (t.ip IS NULL OR t.ip::text NOT IN (${ips.map((_, i) => `$${i + 3}`).join(",")}))`
    : "";

  const events = await query<Record<string, unknown>>(
    `SELECT t.id, t.visitor_id, t.evento, t.pagina, t.pagina_tipo,
            t.resource_id, t.resource_nome, t.resource_preco, t.resource_imagem,
            t.metadata, t.criado_em, t.geo_city, t.geo_region, t.geo_country,
            c.nome AS customer_nome, c.email AS customer_email
     FROM crm.tracking_events t
     LEFT JOIN crm.customers c ON c.id = t.customer_id
     WHERE TRUE ${INTERNAL_FILTER} ${ipFilter}
     ORDER BY t.criado_em DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset, ...ips]
  );

  res.json(events);
});

// ── GET /api/tracking/stats — KPIs de tracking ───────────────

trackingRouter.get("/stats", authMiddleware, async (_req: Request, res: Response) => {
  const ips = getInternalIps();
  const ipFilter = ips.length > 0
    ? `AND (t.ip IS NULL OR t.ip::text NOT IN (${ips.map((_, i) => `$${i + 1}`).join(",")}))`
    : "";

  const stats = await queryOne<Record<string, unknown>>(
    `SELECT
       (SELECT COUNT(*) FROM crm.tracking_events t WHERE t.criado_em > NOW() - INTERVAL '24 hours' ${INTERNAL_FILTER} ${ipFilter}) AS eventos_24h,
       (SELECT COUNT(*) FROM crm.tracking_events t WHERE t.criado_em > NOW() - INTERVAL '7 days' ${INTERNAL_FILTER} ${ipFilter}) AS eventos_7d,
       (SELECT COUNT(DISTINCT t.visitor_id) FROM crm.tracking_events t WHERE t.criado_em > NOW() - INTERVAL '24 hours' ${INTERNAL_FILTER} ${ipFilter}) AS visitantes_24h,
       (SELECT COUNT(DISTINCT t.visitor_id) FROM crm.tracking_events t WHERE t.criado_em > NOW() - INTERVAL '7 days' ${INTERNAL_FILTER} ${ipFilter}) AS visitantes_7d,
       (SELECT COUNT(*) FROM crm.tracking_events t WHERE t.evento = 'product_view' AND t.criado_em > NOW() - INTERVAL '24 hours' ${INTERNAL_FILTER} ${ipFilter}) AS produtos_vistos_24h,
       (SELECT COUNT(*) FROM crm.tracking_events t WHERE t.evento = 'add_to_cart' AND t.criado_em > NOW() - INTERVAL '24 hours' ${INTERNAL_FILTER} ${ipFilter}) AS add_cart_24h,
       (SELECT COUNT(DISTINCT t.customer_id) FROM crm.tracking_events t WHERE t.customer_id IS NOT NULL AND t.criado_em > NOW() - INTERVAL '7 days' ${INTERNAL_FILTER} ${ipFilter}) AS clientes_identificados_7d`,
    [...ips]
  );

  // Top produtos visualizados
  const topProdutos = await query<Record<string, unknown>>(
    `SELECT t.resource_id, t.resource_nome, t.resource_preco, t.resource_imagem, COUNT(*) AS views
     FROM crm.tracking_events t
     WHERE t.evento = 'product_view' AND t.resource_id IS NOT NULL AND t.criado_em > NOW() - INTERVAL '7 days'
       ${INTERNAL_FILTER} ${ipFilter}
     GROUP BY t.resource_id, t.resource_nome, t.resource_preco, t.resource_imagem
     ORDER BY views DESC
     LIMIT 10`,
    [...ips]
  );

  // Eventos por tipo (últimos 7 dias)
  const porTipo = await query<Record<string, unknown>>(
    `SELECT t.evento, COUNT(*) AS total
     FROM crm.tracking_events t
     WHERE t.criado_em > NOW() - INTERVAL '7 days'
       ${INTERNAL_FILTER} ${ipFilter}
     GROUP BY t.evento
     ORDER BY total DESC`,
    [...ips]
  );

  res.json({ ...stats, topProdutos, porTipo });
});

// ── GET /api/tracking/visitor/:vid — histórico de um visitante ─

trackingRouter.get("/visitor/:vid", authMiddleware, async (req: Request, res: Response) => {
  const events = await query<Record<string, unknown>>(
    `SELECT t.*, c.nome AS customer_nome, c.email AS customer_email
     FROM crm.tracking_events t
     LEFT JOIN crm.customers c ON c.id = t.customer_id
     WHERE t.visitor_id = $1
     ORDER BY t.criado_em DESC
     LIMIT 100`,
    [req.params.vid]
  );

  res.json(events);
});

// ── GET /api/tracking/geo — geolocalização dos visitantes ─────

trackingRouter.get("/geo", authMiddleware, async (req: Request, res: Response) => {
  const dias = Math.min(parseInt(String(req.query.dias || "30"), 10), 365);

  const byRegion = await query<{ region: string; total: number; visitors: number }>(
    `SELECT geo_region AS region,
            COUNT(*)::int AS total,
            COUNT(DISTINCT visitor_id)::int AS visitors
     FROM crm.tracking_events
     WHERE geo_country = 'BR' AND geo_region IS NOT NULL
       AND criado_em > NOW() - $1::int * INTERVAL '1 day'
     GROUP BY geo_region
     ORDER BY visitors DESC`,
    [dias]
  );

  const byCity = await query<{ city: string; region: string; total: number; visitors: number }>(
    `SELECT geo_city AS city, geo_region AS region,
            COUNT(*)::int AS total,
            COUNT(DISTINCT visitor_id)::int AS visitors
     FROM crm.tracking_events
     WHERE geo_city IS NOT NULL
       AND criado_em > NOW() - $1::int * INTERVAL '1 day'
     GROUP BY geo_city, geo_region
     ORDER BY visitors DESC
     LIMIT 15`,
    [dias]
  );

  const byCountry = await query<{ country: string; visitors: number }>(
    `SELECT geo_country AS country,
            COUNT(DISTINCT visitor_id)::int AS visitors
     FROM crm.tracking_events
     WHERE geo_country IS NOT NULL
       AND criado_em > NOW() - $1::int * INTERVAL '1 day'
     GROUP BY geo_country
     ORDER BY visitors DESC
     LIMIT 20`,
    [dias]
  );

  res.json({ dias, byRegion, byCity, byCountry });
});

// ── GET /api/tracking/funnel — funil do site ──────────────────

trackingRouter.get("/funnel", authMiddleware, async (req: Request, res: Response) => {
  const dias = parseInt(String(req.query.dias || "7"), 10);
  const ips = getInternalIps();
  const ipFilter = ips.length > 0
    ? `AND (t.ip IS NULL OR t.ip::text NOT IN (${ips.map((_, i) => `$${i + 2}`).join(",")}))`
    : "";

  const funnel = await queryOne<Record<string, unknown>>(
    `SELECT
       (SELECT COUNT(DISTINCT t.visitor_id) FROM crm.tracking_events t WHERE t.criado_em > NOW() - $1::int * INTERVAL '1 day' ${INTERNAL_FILTER} ${ipFilter}) AS visitantes,
       (SELECT COUNT(DISTINCT t.visitor_id) FROM crm.tracking_events t WHERE t.evento = 'product_view' AND t.criado_em > NOW() - $1::int * INTERVAL '1 day' ${INTERNAL_FILTER} ${ipFilter}) AS viram_produto,
       (SELECT COUNT(DISTINCT t.visitor_id) FROM crm.tracking_events t WHERE t.evento = 'add_to_cart' AND t.criado_em > NOW() - $1::int * INTERVAL '1 day' ${INTERNAL_FILTER} ${ipFilter}) AS add_carrinho,
       (SELECT COUNT(DISTINCT t.visitor_id) FROM crm.tracking_events t WHERE t.evento = 'checkout_start' AND t.criado_em > NOW() - $1::int * INTERVAL '1 day' ${INTERNAL_FILTER} ${ipFilter}) AS checkout,
       (SELECT COUNT(DISTINCT customer_id) FROM sync.bling_orders WHERE criado_bling > NOW() - $1::int * INTERVAL '1 day' AND canal NOT IN ('fisico') AND status NOT IN ('order.deleted', 'order.cancelled', 'desconhecido')) AS compraram`,
    [dias, ...ips]
  );

  const f = funnel || {};
  const visitantes = Number(f.visitantes) || 0;
  const viramProduto = Number(f.viram_produto) || 0;
  const addCarrinho = Number(f.add_carrinho) || 0;
  const checkout = Number(f.checkout) || 0;
  const compraram = Number(f.compraram) || 0;

  const steps = [
    { etapa: "Visitantes", total: visitantes, taxa: 100 },
    { etapa: "Viram produto", total: viramProduto, taxa: visitantes > 0 ? Math.round(viramProduto / visitantes * 100) : 0 },
    { etapa: "Add carrinho", total: addCarrinho, taxa: visitantes > 0 ? Math.round(addCarrinho / visitantes * 100) : 0 },
    { etapa: "Checkout", total: checkout, taxa: visitantes > 0 ? Math.round(checkout / visitantes * 100) : 0 },
    { etapa: "Compraram", total: compraram, taxa: visitantes > 0 ? Math.round(compraram / visitantes * 100) : 0 },
  ];

  res.json({ dias, steps, taxa_conversao_geral: visitantes > 0 ? Math.round(compraram / visitantes * 1000) / 10 : 0 });
});
