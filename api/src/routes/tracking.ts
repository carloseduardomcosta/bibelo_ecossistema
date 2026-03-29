import { Router, Request, Response } from "express";
import { z } from "zod";
import { query, queryOne } from "../db";
import { logger } from "../utils/logger";
import { authMiddleware } from "../middleware/auth";
import rateLimit from "express-rate-limit";

export const trackingRouter = Router();

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

  await query(
    `INSERT INTO crm.tracking_events
     (visitor_id, customer_id, evento, pagina, pagina_tipo, resource_id, resource_nome, resource_preco, resource_imagem, referrer, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      d.visitor_id,
      link?.customer_id || null,
      d.evento,
      d.pagina || null,
      d.pagina_tipo || null,
      d.resource_id || null,
      d.resource_nome || null,
      d.resource_preco || null,
      d.resource_imagem || null,
      d.referrer || null,
      JSON.stringify(d.metadata || {}),
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
    res.json({ ok: true, linked: false });
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

  logger.info("Visitor vinculado a cliente", { visitor_id, customerId: customer.id, email });
  res.json({ ok: true, linked: true });
});

// ════════════════════════════════════════════════════════════════
// ENDPOINTS PROTEGIDOS (painel CRM)
// ════════════════════════════════════════════════════════════════

// ── GET /api/tracking/timeline — feed real-time de eventos ────

trackingRouter.get("/timeline", authMiddleware, async (req: Request, res: Response) => {
  const limit = Math.min(parseInt(String(req.query.limit || "50"), 10), 200);
  const offset = parseInt(String(req.query.offset || "0"), 10);

  const events = await query<Record<string, unknown>>(
    `SELECT t.id, t.visitor_id, t.evento, t.pagina, t.pagina_tipo,
            t.resource_id, t.resource_nome, t.resource_preco, t.resource_imagem,
            t.metadata, t.criado_em,
            c.nome AS customer_nome, c.email AS customer_email
     FROM crm.tracking_events t
     LEFT JOIN crm.customers c ON c.id = t.customer_id
     ORDER BY t.criado_em DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );

  res.json(events);
});

// ── GET /api/tracking/stats — KPIs de tracking ───────────────

trackingRouter.get("/stats", authMiddleware, async (_req: Request, res: Response) => {
  const stats = await queryOne<Record<string, unknown>>(
    `SELECT
       (SELECT COUNT(*) FROM crm.tracking_events WHERE criado_em > NOW() - INTERVAL '24 hours') AS eventos_24h,
       (SELECT COUNT(*) FROM crm.tracking_events WHERE criado_em > NOW() - INTERVAL '7 days') AS eventos_7d,
       (SELECT COUNT(DISTINCT visitor_id) FROM crm.tracking_events WHERE criado_em > NOW() - INTERVAL '24 hours') AS visitantes_24h,
       (SELECT COUNT(DISTINCT visitor_id) FROM crm.tracking_events WHERE criado_em > NOW() - INTERVAL '7 days') AS visitantes_7d,
       (SELECT COUNT(*) FROM crm.tracking_events WHERE evento = 'product_view' AND criado_em > NOW() - INTERVAL '24 hours') AS produtos_vistos_24h,
       (SELECT COUNT(*) FROM crm.tracking_events WHERE evento = 'add_to_cart' AND criado_em > NOW() - INTERVAL '24 hours') AS add_cart_24h,
       (SELECT COUNT(DISTINCT customer_id) FROM crm.tracking_events WHERE customer_id IS NOT NULL AND criado_em > NOW() - INTERVAL '7 days') AS clientes_identificados_7d`
  );

  // Top produtos visualizados
  const topProdutos = await query<Record<string, unknown>>(
    `SELECT resource_id, resource_nome, resource_preco, resource_imagem, COUNT(*) AS views
     FROM crm.tracking_events
     WHERE evento = 'product_view' AND resource_id IS NOT NULL AND criado_em > NOW() - INTERVAL '7 days'
     GROUP BY resource_id, resource_nome, resource_preco, resource_imagem
     ORDER BY views DESC
     LIMIT 10`
  );

  // Eventos por tipo (últimos 7 dias)
  const porTipo = await query<Record<string, unknown>>(
    `SELECT evento, COUNT(*) AS total
     FROM crm.tracking_events
     WHERE criado_em > NOW() - INTERVAL '7 days'
     GROUP BY evento
     ORDER BY total DESC`
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
