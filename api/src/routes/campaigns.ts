import { Router, Request, Response } from "express";
import { z } from "zod";
import { query, queryOne } from "../db";
import { authMiddleware } from "../middleware/auth";
import { logger } from "../utils/logger";

export const campaignsRouter = Router();
campaignsRouter.use(authMiddleware);

// ── Schemas ─────────────────────────────────────────────────────

const createSchema = z.object({
  nome: z.string().min(2).max(255),
  canal: z.enum(["email", "whatsapp"]),
  template_id: z.string().uuid().optional(),
  segment_id: z.string().uuid().optional(),
  agendado_em: z.string().datetime().optional(),
});

const updateSchema = createSchema.partial().extend({
  status: z.enum(["rascunho", "agendada", "pausada"]).optional(),
});

const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.string().optional(),
  canal: z.string().optional(),
});

// ── GET /api/campaigns — lista paginada ─────────────────────────

campaignsRouter.get("/", async (req: Request, res: Response) => {
  const parse = listSchema.safeParse(req.query);
  if (!parse.success) {
    res.status(400).json({ error: "Parâmetros inválidos", detalhes: parse.error.errors });
    return;
  }

  const { page, limit, status, canal } = parse.data;
  const offset = (page - 1) * limit;

  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (status) {
    conditions.push(`c.status = $${idx}`);
    params.push(status);
    idx++;
  }
  if (canal) {
    conditions.push(`c.canal = $${idx}`);
    params.push(canal);
    idx++;
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const countResult = await queryOne<{ total: string }>(
    `SELECT COUNT(*)::text AS total FROM marketing.campaigns c ${where}`,
    params
  );
  const total = parseInt(countResult?.total || "0", 10);

  params.push(limit, offset);
  const rows = await query(
    `SELECT c.*, t.nome AS template_nome, s.nome AS segment_nome
     FROM marketing.campaigns c
     LEFT JOIN marketing.templates t ON t.id = c.template_id
     LEFT JOIN crm.segments s ON s.id = c.segment_id
     ${where}
     ORDER BY c.criado_em DESC
     LIMIT $${idx} OFFSET $${idx + 1}`,
    params
  );

  res.json({
    data: rows,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

// ── GET /api/campaigns/:id — detalhes ───────────────────────────

campaignsRouter.get("/:id", async (req: Request, res: Response) => {
  const campaign = await queryOne(
    `SELECT c.*, t.nome AS template_nome, s.nome AS segment_nome
     FROM marketing.campaigns c
     LEFT JOIN marketing.templates t ON t.id = c.template_id
     LEFT JOIN crm.segments s ON s.id = c.segment_id
     WHERE c.id = $1`,
    [req.params.id]
  );

  if (!campaign) {
    res.status(404).json({ error: "Campanha não encontrada" });
    return;
  }

  const sends = await query(
    `SELECT status, COUNT(*)::text AS total
     FROM marketing.campaign_sends
     WHERE campaign_id = $1
     GROUP BY status`,
    [req.params.id]
  );

  res.json({ ...campaign, sends_por_status: sends });
});

// ── POST /api/campaigns — criar ─────────────────────────────────

campaignsRouter.post("/", async (req: Request, res: Response) => {
  const parse = createSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: "Dados inválidos", detalhes: parse.error.errors });
    return;
  }

  const { nome, canal, template_id, segment_id, agendado_em } = parse.data;
  const status = agendado_em ? "agendada" : "rascunho";

  const campaign = await queryOne(
    `INSERT INTO marketing.campaigns (nome, canal, template_id, segment_id, status, agendado_em)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [nome, canal, template_id || null, segment_id || null, status, agendado_em || null]
  );

  logger.info("Campanha criada", { id: (campaign as { id: string }).id, nome, user: req.user?.email });
  res.status(201).json(campaign);
});

// ── PUT /api/campaigns/:id — atualizar ──────────────────────────

campaignsRouter.put("/:id", async (req: Request, res: Response) => {
  const parse = updateSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: "Dados inválidos", detalhes: parse.error.errors });
    return;
  }

  const existing = await queryOne<{ id: string; status: string }>(
    "SELECT id, status FROM marketing.campaigns WHERE id = $1",
    [req.params.id]
  );

  if (!existing) {
    res.status(404).json({ error: "Campanha não encontrada" });
    return;
  }

  if (existing.status === "enviando" || existing.status === "concluida") {
    res.status(400).json({ error: `Não é possível editar campanha com status "${existing.status}"` });
    return;
  }

  const entries = Object.entries(parse.data).filter(([, v]) => v !== undefined);
  if (entries.length === 0) {
    res.status(400).json({ error: "Nenhum campo para atualizar" });
    return;
  }

  const sets = entries.map(([k], i) => `${k} = $${i + 1}`);
  const values = entries.map(([, v]) => v);
  values.push(req.params.id);

  const updated = await queryOne(
    `UPDATE marketing.campaigns SET ${sets.join(", ")}, atualizado_em = NOW()
     WHERE id = $${values.length} RETURNING *`,
    values
  );

  logger.info("Campanha atualizada", { id: req.params.id, user: req.user?.email });
  res.json(updated);
});

// ── POST /api/campaigns/:id/send — disparar campanha ────────────

campaignsRouter.post("/:id/send", async (req: Request, res: Response) => {
  const campaign = await queryOne<{
    id: string; status: string; canal: string;
    template_id: string | null; segment_id: string | null;
  }>(
    "SELECT id, status, canal, template_id, segment_id FROM marketing.campaigns WHERE id = $1",
    [req.params.id]
  );

  if (!campaign) {
    res.status(404).json({ error: "Campanha não encontrada" });
    return;
  }

  if (campaign.status !== "rascunho" && campaign.status !== "agendada") {
    res.status(400).json({ error: `Campanha com status "${campaign.status}" não pode ser disparada` });
    return;
  }

  if (!campaign.template_id) {
    res.status(400).json({ error: "Campanha precisa de um template antes de disparar" });
    return;
  }

  // Busca clientes do segmento (ou todos ativos se sem segmento)
  let customers: { id: string }[];
  if (campaign.segment_id) {
    customers = await query<{ id: string }>(
      `SELECT c.id FROM crm.customers c
       JOIN crm.customer_scores cs ON cs.customer_id = c.id
       JOIN crm.segments s ON s.id = $1
       WHERE c.ativo = true AND cs.segmento = s.nome`,
      [campaign.segment_id]
    );
  } else {
    customers = await query<{ id: string }>(
      "SELECT id FROM crm.customers WHERE ativo = true"
    );
  }

  if (customers.length === 0) {
    res.status(400).json({ error: "Nenhum cliente encontrado para esta campanha" });
    return;
  }

  // Cria registros de envio
  const values = customers.map((_, i) => `($1, $${i + 2}, 'pendente')`).join(", ");
  const params = [campaign.id, ...customers.map((c) => c.id)];

  await query(
    `INSERT INTO marketing.campaign_sends (campaign_id, customer_id, status)
     VALUES ${values}
     ON CONFLICT (campaign_id, customer_id) DO NOTHING`,
    params
  );

  // Atualiza status da campanha
  await query(
    `UPDATE marketing.campaigns
     SET status = 'enviando', enviado_em = NOW(), total_envios = $2, atualizado_em = NOW()
     WHERE id = $1`,
    [campaign.id, customers.length]
  );

  logger.info("Campanha disparada", {
    id: campaign.id,
    canal: campaign.canal,
    total: customers.length,
    user: req.user?.email,
  });

  // TODO: enfileirar envio real (Resend/Evolution) via BullMQ
  res.json({
    message: "Campanha disparada",
    total_envios: customers.length,
  });
});
