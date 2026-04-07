import { Router, Request, Response } from "express";
import { z } from "zod";
import { query, queryOne } from "../db";
import { logger } from "../utils/logger";
import { authMiddleware } from "../middleware/auth";
import rateLimit from "express-rate-limit";
import { resolveGeo } from "../utils/geoip";

export const trackingRouter = Router();

// ── Filtro de tráfego interno/testes ─────────────────────────
// Exclui: customers de teste, IPs do admin (via .env)
// NÃO exclui 172.21.% — eventos antigos gravados com IP do Docker proxy
const INTERNAL_FILTER = `
  AND NOT EXISTS (
    SELECT 1 FROM crm.customers c2
    WHERE c2.id = t.customer_id
      AND (c2.canal_origem = 'teste' OR c2.email LIKE '%+teste@%')
  )
`;

// IPs de rede Docker interna (proxy) — quando o request vem desses, usamos X-Forwarded-For
const DOCKER_NETS = ["172.21.", "172.22.", "172.23.", "10.0.", "192.168."];
function isDockerProxy(ip: string | undefined): boolean {
  if (!ip) return false;
  return DOCKER_NETS.some(net => ip.includes(net));
}

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
  evento: z.enum(["page_view", "product_view", "category_view", "add_to_cart", "search", "checkout_start", "banner_click", "popup_view", "popup_submit"]),
  pagina: z.string().max(2000).optional(),
  pagina_tipo: z.enum(["home", "product", "category", "cart", "checkout", "search", "other"]).optional(),
  resource_id: z.string().max(100).optional(),
  resource_nome: z.string().max(300).optional(),
  resource_preco: z.number().optional(),
  resource_imagem: z.string().max(1000).optional(),
  referrer: z.string().max(2000).optional(),
  metadata: z.record(z.unknown()).optional(),
  utm_source: z.string().max(100).optional(),
  utm_medium: z.string().max(100).optional(),
  utm_campaign: z.string().max(200).optional(),
  utm_content: z.string().max(200).optional(),
  utm_term: z.string().max(200).optional(),
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

  // Bloquear bots/crawlers pelo User-Agent do request HTTP
  const userAgent = (req.headers["user-agent"] || "").toLowerCase();
  if (/facebookexternalhit|facebot|facebookbot|metainspector|googlebot|bingbot|yandexbot|baiduspider|twitterbot|linkedinbot|slurp|duckduckbot|ia_archiver|semrushbot|ahrefsbot|mj12bot|dotbot|petalbot|bytespider|headlesschrome|phantomjs/.test(userAgent)) {
    res.json({ ok: true });
    return;
  }

  // Busca customer_id vinculado ao visitor
  const link = await queryOne<{ customer_id: string }>(
    "SELECT customer_id FROM crm.visitor_customers WHERE visitor_id = $1",
    [d.visitor_id]
  );

  // Se request vem do proxy Docker/Nginx, confia no X-Forwarded-For (IP real do visitante)
  // Caso contrário usa socket (previne spoofing em acesso direto)
  const socketIp = req.socket.remoteAddress || "";
  const realIp = isDockerProxy(socketIp)
    ? (req.headers["x-forwarded-for"]?.toString().split(",")[0].trim() || socketIp)
    : socketIp;

  // Ignora tráfego interno (admin) — não grava no banco
  if (getInternalIps().includes(realIp)) {
    res.json({ ok: true });
    return;
  }

  const geo = resolveGeo(realIp);

  await query(
    `INSERT INTO crm.tracking_events
     (visitor_id, customer_id, evento, pagina, pagina_tipo, resource_id, resource_nome,
      resource_preco, resource_imagem, referrer, metadata,
      ip, geo_city, geo_region, geo_country, geo_lat, geo_lon,
      utm_source, utm_medium, utm_campaign, utm_content, utm_term)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)`,
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
      d.utm_source || null,
      d.utm_medium || null,
      d.utm_campaign || null,
      d.utm_content || null,
      d.utm_term || null,
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

  // Busca cliente pelo email (case-insensitive)
  const customer = await queryOne<{ id: string }>(
    "SELECT id FROM crm.customers WHERE LOWER(email) = LOWER($1)",
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
            t.metadata, t.referrer, t.ip, t.criado_em, t.geo_city, t.geo_region, t.geo_country,
            c.nome AS customer_nome, c.email AS customer_email
     FROM crm.tracking_events t
     LEFT JOIN crm.customers c ON c.id = t.customer_id
     WHERE t.criado_em > NOW() - INTERVAL '24 hours'
       ${INTERNAL_FILTER} ${ipFilter}
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
  const ips = getInternalIps();
  const ipFilter = ips.length > 0
    ? `AND (ip IS NULL OR ip::text NOT IN (${ips.map((_, i) => `$${i + 2}`).join(",")}))`
    : "";

  const byRegion = await query<{ region: string; total: number; visitors: number }>(
    `SELECT geo_region AS region,
            COUNT(*)::int AS total,
            COUNT(DISTINCT visitor_id)::int AS visitors
     FROM crm.tracking_events t
     WHERE geo_country = 'BR' AND geo_region IS NOT NULL
       AND criado_em > NOW() - $1::int * INTERVAL '1 day'
       ${INTERNAL_FILTER} ${ipFilter}
     GROUP BY geo_region
     ORDER BY visitors DESC`,
    [dias, ...ips]
  );

  const byCity = await query<{ city: string; region: string; total: number; visitors: number }>(
    `SELECT geo_city AS city, geo_region AS region,
            COUNT(*)::int AS total,
            COUNT(DISTINCT visitor_id)::int AS visitors
     FROM crm.tracking_events t
     WHERE geo_city IS NOT NULL
       AND criado_em > NOW() - $1::int * INTERVAL '1 day'
       ${INTERNAL_FILTER} ${ipFilter}
     GROUP BY geo_city, geo_region
     ORDER BY visitors DESC
     LIMIT 15`,
    [dias, ...ips]
  );

  const byCountry = await query<{ country: string; visitors: number }>(
    `SELECT geo_country AS country,
            COUNT(DISTINCT visitor_id)::int AS visitors
     FROM crm.tracking_events t
     WHERE geo_country IS NOT NULL
       AND criado_em > NOW() - $1::int * INTERVAL '1 day'
       ${INTERNAL_FILTER} ${ipFilter}
     GROUP BY geo_country
     ORDER BY visitors DESC
     LIMIT 20`,
    [dias, ...ips]
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

// ── GET /api/tracking/vendas-recentes — vendas para sininho ───
trackingRouter.get("/vendas-recentes", authMiddleware, async (req: Request, res: Response) => {
  const horas = parseInt(String(req.query.horas || "48"), 10);
  const rows = await query<{
    ns_id: string;
    numero: string;
    valor: string;
    status: string;
    cupom: string | null;
    webhook_em: string;
    itens: unknown[];
    nome: string | null;
    email: string | null;
  }>(
    `SELECT ns.ns_id, ns.numero, ns.valor::text, ns.status, ns.cupom, ns.webhook_em,
            ns.itens, c.nome, c.email
     FROM sync.nuvemshop_orders ns
     LEFT JOIN crm.customers c ON c.id = ns.customer_id
     WHERE ns.webhook_em > NOW() - make_interval(hours => $1)
       AND ns.status IN ('paid', 'open')
     ORDER BY ns.webhook_em DESC
     LIMIT 10`,
    [horas]
  );
  res.json({ vendas: rows });
});

// ── GET /api/tracking/analytics — inteligência de tráfego ────

trackingRouter.get("/analytics", authMiddleware, async (req: Request, res: Response) => {
  const dias = Math.min(parseInt(String(req.query.dias || "14"), 10), 365);
  const ips = getInternalIps();
  // ipFilter com $1 = dias (queries que usam make_interval)
  const ipFilter = ips.length > 0
    ? `AND (t.ip IS NULL OR t.ip::text NOT IN (${ips.map((_, i) => `$${i + 2}`).join(",")}))`
    : "";
  // ipFilterNoParam para queries sem parâmetro de dias (intervalo hardcoded)
  const ipFilterNoParam = ips.length > 0
    ? `AND (t.ip IS NULL OR t.ip::text NOT IN (${ips.map((_, i) => `$${i + 1}`).join(",")}))`
    : "";

  // 1. Heatmap — 7 dias da semana × 24 horas
  const heatmap = await query<{ dia_semana: number; hora: number; total: number }>(
    `SELECT EXTRACT(DOW FROM t.criado_em)::int AS dia_semana,
            EXTRACT(HOUR FROM t.criado_em)::int AS hora,
            COUNT(*)::int AS total
     FROM crm.tracking_events t
     WHERE t.criado_em > NOW() - make_interval(days => $1)
       ${INTERNAL_FILTER} ${ipFilter}
     GROUP BY dia_semana, hora
     ORDER BY dia_semana, hora`,
    [dias, ...ips]
  );

  // 2. Por hora — visitantes nas últimas 24h (gráfico de barras ao vivo)
  const por_hora = await query<{ hora: number; eventos: number; visitors: number }>(
    `SELECT EXTRACT(HOUR FROM t.criado_em)::int AS hora,
            COUNT(*)::int AS eventos,
            COUNT(DISTINCT t.visitor_id)::int AS visitors
     FROM crm.tracking_events t
     WHERE t.criado_em > NOW() - INTERVAL '24 hours'
       ${INTERNAL_FILTER} ${ipFilterNoParam}
     GROUP BY hora
     ORDER BY hora`,
    [...ips]
  );

  // 3. Por dia — visitantes + eventos + carrinhos + compras (gráfico de linha/área)
  const por_dia = await query<{
    dia: string; eventos: number; visitors: number; carrinhos: number; compras: number;
  }>(
    `SELECT DATE(t.criado_em)::text AS dia,
            COUNT(*)::int AS eventos,
            COUNT(DISTINCT t.visitor_id)::int AS visitors,
            COUNT(DISTINCT CASE WHEN t.evento = 'add_to_cart' THEN t.visitor_id END)::int AS carrinhos,
            COUNT(CASE WHEN t.evento = 'purchase' THEN 1 END)::int AS compras
     FROM crm.tracking_events t
     WHERE t.criado_em > NOW() - make_interval(days => $1)
       ${INTERNAL_FILTER} ${ipFilter}
     GROUP BY dia
     ORDER BY dia`,
    [dias, ...ips]
  );

  // 4. Fontes — top origens de tráfego (referrer agrupado)
  const fontesRaw = await query<{ referrer: string | null; total: number }>(
    `SELECT t.referrer, COUNT(*)::int AS total
     FROM crm.tracking_events t
     WHERE t.criado_em > NOW() - make_interval(days => $1)
       ${INTERNAL_FILTER} ${ipFilter}
     GROUP BY t.referrer
     ORDER BY total DESC`,
    [dias, ...ips]
  );

  // Agrupar referrers por hostname amigável
  const fonteMap = new Map<string, number>();
  for (const row of fontesRaw) {
    let nome = "Direto";
    if (row.referrer) {
      try {
        const host = new URL(row.referrer).hostname.toLowerCase();
        if (host.includes("instagram")) nome = "Instagram";
        else if (host.includes("facebook") || host.includes("fb.com")) nome = "Facebook";
        else if (host.includes("google")) nome = "Google";
        else if (host.includes("tiktok")) nome = "TikTok";
        else if (host.includes("pinterest")) nome = "Pinterest";
        else if (host.includes("youtube")) nome = "YouTube";
        else if (host.includes("twitter") || host.includes("x.com")) nome = "Twitter/X";
        else if (host.includes("whatsapp") || host.includes("wa.me")) nome = "WhatsApp";
        else if (host.includes("papelariabibelo")) nome = "Bibelô (interno)";
        else nome = host;
      } catch {
        nome = "Outro";
      }
    }
    fonteMap.set(nome, (fonteMap.get(nome) || 0) + Number(row.total));
  }
  const fontes = Array.from(fonteMap.entries())
    .map(([fonte, total]) => ({ fonte, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);

  // 5. Pico — hora e dia com mais visitantes
  const picoHora = await queryOne<{ hora: number; visitors: number }>(
    `SELECT EXTRACT(HOUR FROM t.criado_em)::int AS hora,
            COUNT(DISTINCT t.visitor_id)::int AS visitors
     FROM crm.tracking_events t
     WHERE t.criado_em > NOW() - make_interval(days => $1)
       ${INTERNAL_FILTER} ${ipFilter}
     GROUP BY hora
     ORDER BY visitors DESC
     LIMIT 1`,
    [dias, ...ips]
  );

  const picoDia = await queryOne<{ dia_semana: number; visitors: number }>(
    `SELECT EXTRACT(DOW FROM t.criado_em)::int AS dia_semana,
            COUNT(DISTINCT t.visitor_id)::int AS visitors
     FROM crm.tracking_events t
     WHERE t.criado_em > NOW() - make_interval(days => $1)
       ${INTERNAL_FILTER} ${ipFilter}
     GROUP BY dia_semana
     ORDER BY visitors DESC
     LIMIT 1`,
    [dias, ...ips]
  );

  const diasSemana = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
  const pico = {
    hora: picoHora?.hora ?? null,
    hora_visitors: picoHora?.visitors ?? 0,
    dia_semana: picoDia?.dia_semana ?? null,
    dia_semana_nome: picoDia ? diasSemana[picoDia.dia_semana] : null,
    dia_visitors: picoDia?.visitors ?? 0,
  };

  // 6. Insights automáticos
  const insights: string[] = [];

  // Insight: hora de pico
  if (picoHora) {
    insights.push(`Horário de pico: ${picoHora.hora}h com ${picoHora.visitors} visitantes únicos nos últimos ${dias} dias.`);
  }

  // Insight: dia de pico
  if (picoDia) {
    insights.push(`Dia mais movimentado: ${diasSemana[picoDia.dia_semana]} com ${picoDia.visitors} visitantes.`);
  }

  // Insight: tendência de tráfego (última semana vs semana anterior)
  const semanaAtual = await queryOne<{ visitors: number }>(
    `SELECT COUNT(DISTINCT t.visitor_id)::int AS visitors
     FROM crm.tracking_events t
     WHERE t.criado_em > NOW() - INTERVAL '7 days'
       ${INTERNAL_FILTER} ${ipFilterNoParam}`,
    [...ips]
  );
  const semanaAnterior = await queryOne<{ visitors: number }>(
    `SELECT COUNT(DISTINCT t.visitor_id)::int AS visitors
     FROM crm.tracking_events t
     WHERE t.criado_em BETWEEN NOW() - INTERVAL '14 days' AND NOW() - INTERVAL '7 days'
       ${INTERNAL_FILTER} ${ipFilterNoParam}`,
    [...ips]
  );

  const visAtual = semanaAtual?.visitors ?? 0;
  const visAnterior = semanaAnterior?.visitors ?? 0;
  if (visAnterior > 0) {
    const variacao = Math.round(((visAtual - visAnterior) / visAnterior) * 100);
    if (variacao > 0) {
      insights.push(`Tráfego crescendo: +${variacao}% de visitantes esta semana vs semana anterior (${visAtual} vs ${visAnterior}).`);
    } else if (variacao < 0) {
      insights.push(`Tráfego em queda: ${variacao}% de visitantes esta semana vs semana anterior (${visAtual} vs ${visAnterior}).`);
    } else {
      insights.push(`Tráfego estável: mesma quantidade de visitantes esta semana e na anterior (${visAtual}).`);
    }
  }

  // Insight: dia da semana que mais converte (add_to_cart)
  const melhorConversao = await queryOne<{ dia_semana: number; carrinhos: number; visitors: number }>(
    `SELECT EXTRACT(DOW FROM t.criado_em)::int AS dia_semana,
            COUNT(DISTINCT CASE WHEN t.evento = 'add_to_cart' THEN t.visitor_id END)::int AS carrinhos,
            COUNT(DISTINCT t.visitor_id)::int AS visitors
     FROM crm.tracking_events t
     WHERE t.criado_em > NOW() - make_interval(days => $1)
       ${INTERNAL_FILTER} ${ipFilter}
     GROUP BY dia_semana
     ORDER BY carrinhos DESC
     LIMIT 1`,
    [dias, ...ips]
  );
  if (melhorConversao && melhorConversao.carrinhos > 0) {
    const taxa = melhorConversao.visitors > 0
      ? Math.round((melhorConversao.carrinhos / melhorConversao.visitors) * 100)
      : 0;
    insights.push(`${diasSemana[melhorConversao.dia_semana]} é o dia que mais converte: ${melhorConversao.carrinhos} carrinhos (${taxa}% dos visitantes do dia).`);
  }

  // Insight: produto mais visto sem compra (oportunidade)
  const produtoOportunidade = await queryOne<{ resource_nome: string; views: number }>(
    `SELECT t.resource_nome, COUNT(*)::int AS views
     FROM crm.tracking_events t
     WHERE t.evento = 'product_view'
       AND t.resource_id IS NOT NULL
       AND t.criado_em > NOW() - make_interval(days => $1)
       AND t.resource_id NOT IN (
         SELECT t2.resource_id FROM crm.tracking_events t2
         WHERE t2.evento = 'purchase' AND t2.resource_id IS NOT NULL
           AND t2.criado_em > NOW() - make_interval(days => $1)
       )
       ${INTERNAL_FILTER} ${ipFilter}
     GROUP BY t.resource_nome
     ORDER BY views DESC
     LIMIT 1`,
    [dias, ...ips]
  );
  if (produtoOportunidade && produtoOportunidade.views > 0) {
    insights.push(`Oportunidade: "${produtoOportunidade.resource_nome}" teve ${produtoOportunidade.views} visualizações mas nenhuma compra — considere destaque ou desconto.`);
  }

  // Insight: principal fonte de tráfego
  if (fontes.length > 0 && fontes[0].fonte !== "Direto") {
    insights.push(`Principal fonte de tráfego externo: ${fontes[0].fonte} com ${fontes[0].total} eventos.`);
  } else if (fontes.length > 1) {
    insights.push(`Principal fonte de tráfego externo: ${fontes[1]?.fonte || "N/A"} com ${fontes[1]?.total || 0} eventos.`);
  }

  res.json({ dias, heatmap, por_hora, por_dia, fontes, pico, insights });
});
