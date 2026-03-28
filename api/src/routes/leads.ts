import { Router, Request, Response } from "express";
import { z } from "zod";
import { query, queryOne } from "../db";
import { logger } from "../utils/logger";
import { upsertCustomer } from "../services/customer.service";
import { triggerFlow } from "../services/flow.service";
import { authMiddleware } from "../middleware/auth";
import rateLimit from "express-rate-limit";

export const leadsRouter = Router();

// ── Rate limit agressivo para endpoints públicos ──────────────

const publicLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { error: "Muitas requisições — tente novamente em 1 minuto" },
});

// ════════════════════════════════════════════════════════════════
// ENDPOINTS PÚBLICOS (sem auth, usados pelo script JS no site)
// ════════════════════════════════════════════════════════════════

// ── GET /api/leads/config — retorna popup ativo ───────────────

leadsRouter.get("/config", publicLimiter, async (_req: Request, res: Response) => {
  const popups = await query<Record<string, unknown>>(
    "SELECT id, titulo, subtitulo, tipo, delay_segundos, campos, cupom, desconto_texto FROM marketing.popup_config WHERE ativo = true ORDER BY tipo"
  );

  res.json({ popups });
});

// ── POST /api/leads/capture — capturar lead ───────────────────

const captureSchema = z.object({
  email: z.string().email(),
  nome: z.string().max(200).optional(),
  telefone: z.string().max(30).optional(),
  popup_id: z.string().max(50).optional(),
  visitor_id: z.string().max(100).optional(),
  pagina: z.string().max(500).optional(),
});

leadsRouter.post("/capture", publicLimiter, async (req: Request, res: Response) => {
  const parsed = captureSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Email inválido" });
    return;
  }

  const { email, nome, telefone, popup_id, visitor_id, pagina } = parsed.data;

  // Busca cupom do popup
  let cupom: string | null = null;
  if (popup_id) {
    const popup = await queryOne<{ cupom: string }>(
      "SELECT cupom FROM marketing.popup_config WHERE id = $1 AND ativo = true",
      [popup_id]
    );
    cupom = popup?.cupom || null;

    // Incrementa contadores do popup
    await query(
      "UPDATE marketing.popup_config SET capturas = capturas + 1 WHERE id = $1",
      [popup_id]
    );
  }

  // Verifica se lead já existe
  const existing = await queryOne<{ id: string; customer_id: string | null }>(
    "SELECT id, customer_id FROM marketing.leads WHERE email = $1",
    [email]
  );

  if (existing) {
    // Lead já capturado — retorna cupom mesmo assim (boa UX)
    res.json({ ok: true, cupom, mensagem: "Você já está cadastrada!" });
    return;
  }

  // Cria ou vincula cliente no CRM
  const customer = await upsertCustomer({
    nome: nome || email.split("@")[0],
    email,
    telefone: telefone || undefined,
    canal_origem: "popup",
  });

  // Salva lead
  await query(
    `INSERT INTO marketing.leads (email, nome, telefone, fonte, popup_id, cupom, visitor_id, pagina, customer_id)
     VALUES ($1, $2, $3, 'popup', $4, $5, $6, $7, $8)`,
    [email, nome || null, telefone || null, popup_id || null, cupom, visitor_id || null, pagina || null, customer.id]
  );

  // Dispara fluxo de boas-vindas com cupom
  await triggerFlow("lead.captured", customer.id, {
    email,
    nome: nome || customer.nome,
    cupom: cupom || "",
    fonte: "popup",
    popup_id: popup_id || "",
  });

  logger.info("Lead capturado", { email, popup_id, cupom, customerId: customer.id });
  const desconto = cupom === "BIBELO10" ? "10%" : "7%";
  res.json({ ok: true, cupom, mensagem: cupom ? `Use o cupom ${cupom} para ${desconto} OFF!` : "Cadastro realizado!" });
});

// ── POST /api/leads/view — registrar exibição do popup ────────

leadsRouter.post("/view", publicLimiter, async (req: Request, res: Response) => {
  const { popup_id } = req.body;
  if (popup_id) {
    await query(
      "UPDATE marketing.popup_config SET exibicoes = exibicoes + 1 WHERE id = $1",
      [popup_id]
    );
  }
  res.json({ ok: true });
});

// ════════════════════════════════════════════════════════════════
// ENDPOINTS PROTEGIDOS (painel CRM)
// ════════════════════════════════════════════════════════════════

// ── GET /api/leads — listar leads capturados ──────────────────

leadsRouter.get("/", authMiddleware, async (req: Request, res: Response) => {
  const page = parseInt(String(req.query.page || "1"), 10);
  const limit = 50;
  const offset = (page - 1) * limit;

  const [leads, countResult] = await Promise.all([
    query<Record<string, unknown>>(
      `SELECT l.*, c.nome AS customer_nome
       FROM marketing.leads l
       LEFT JOIN crm.customers c ON c.id = l.customer_id
       ORDER BY l.criado_em DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    ),
    queryOne<{ total: string }>("SELECT COUNT(*)::text AS total FROM marketing.leads"),
  ]);

  res.json({
    leads,
    total: parseInt(countResult?.total || "0", 10),
    page,
    pages: Math.ceil(parseInt(countResult?.total || "0", 10) / limit),
  });
});

// ── GET /api/leads/stats — KPIs de captura ────────────────────

leadsRouter.get("/stats", authMiddleware, async (_req: Request, res: Response) => {
  const stats = await queryOne<Record<string, unknown>>(
    `SELECT
       (SELECT COUNT(*) FROM marketing.leads) AS total_leads,
       (SELECT COUNT(*) FROM marketing.leads WHERE criado_em > NOW() - INTERVAL '7 days') AS leads_7d,
       (SELECT COUNT(*) FROM marketing.leads WHERE criado_em > NOW() - INTERVAL '30 days') AS leads_30d,
       (SELECT COUNT(*) FROM marketing.leads WHERE convertido = true) AS convertidos,
       (SELECT ROUND(COUNT(*) FILTER (WHERE convertido = true) * 100.0 / NULLIF(COUNT(*), 0), 1) FROM marketing.leads) AS taxa_conversao`
  );

  const popups = await query<Record<string, unknown>>(
    "SELECT id, titulo, tipo, ativo, exibicoes, capturas, ROUND(capturas * 100.0 / NULLIF(exibicoes, 0), 1) AS taxa FROM marketing.popup_config ORDER BY criado_em"
  );

  res.json({ ...stats, popups });
});

// ── PUT /api/leads/popups/:id — atualizar config do popup ─────

const updatePopupSchema = z.object({
  titulo: z.string().max(200).optional(),
  subtitulo: z.string().optional(),
  delay_segundos: z.number().min(0).optional(),
  cupom: z.string().max(50).optional(),
  desconto_texto: z.string().max(100).optional(),
  ativo: z.boolean().optional(),
});

leadsRouter.put("/popups/:id", authMiddleware, async (req: Request, res: Response) => {
  const parsed = updatePopupSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Dados inválidos" });
    return;
  }

  const fields: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  const data = parsed.data;
  if (data.titulo !== undefined) { fields.push(`titulo = $${idx++}`); values.push(data.titulo); }
  if (data.subtitulo !== undefined) { fields.push(`subtitulo = $${idx++}`); values.push(data.subtitulo); }
  if (data.delay_segundos !== undefined) { fields.push(`delay_segundos = $${idx++}`); values.push(data.delay_segundos); }
  if (data.cupom !== undefined) { fields.push(`cupom = $${idx++}`); values.push(data.cupom); }
  if (data.desconto_texto !== undefined) { fields.push(`desconto_texto = $${idx++}`); values.push(data.desconto_texto); }
  if (data.ativo !== undefined) { fields.push(`ativo = $${idx++}`); values.push(data.ativo); }

  if (fields.length === 0) {
    res.json({ ok: true });
    return;
  }

  values.push(req.params.id);
  const popup = await queryOne<Record<string, unknown>>(
    `UPDATE marketing.popup_config SET ${fields.join(", ")} WHERE id = $${idx} RETURNING *`,
    values
  );

  if (!popup) {
    res.status(404).json({ error: "Popup não encontrado" });
    return;
  }

  res.json(popup);
});
