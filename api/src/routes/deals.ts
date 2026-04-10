import { Router, Request, Response } from "express";
import { z } from "zod";
import { query, queryOne } from "../db";
import { authMiddleware } from "../middleware/auth";
import { logger } from "../utils/logger";

export const dealsRouter = Router();
dealsRouter.use(authMiddleware);

const ETAPAS = ["prospeccao", "contato", "proposta", "negociacao", "fechado_ganho", "fechado_perdido"] as const;

// ── GET /api/deals — lista com filtros ──────────────────────────

const listSchema = z.object({
  etapa: z.string().optional(),
  search: z.string().optional(),
});

dealsRouter.get("/", async (req: Request, res: Response) => {
  const parse = listSchema.safeParse(req.query);
  if (!parse.success) { res.status(400).json({ error: "Parâmetros inválidos" }); return; }

  const { etapa, search } = parse.data;
  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (etapa) { conditions.push(`d.etapa = $${idx}`); params.push(etapa); idx++; }
  if (search) { conditions.push(`(d.titulo ILIKE $${idx} OR c.nome ILIKE $${idx})`); params.push(`%${search}%`); idx++; }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const rows = await query(`
    SELECT d.*, c.nome as cliente_nome, c.email as cliente_email, c.telefone as cliente_telefone
    FROM crm.deals d
    JOIN crm.customers c ON c.id = d.customer_id
    ${where}
    ORDER BY d.criado_em DESC
  `, params);

  res.json({ data: rows });
});

// ── GET /api/deals/boasvindas-recentes — notificações do sininho ──
// Retorna deals criados via formulários do boasvindas nas últimas 72h

dealsRouter.get("/boasvindas-recentes", async (_req: Request, res: Response) => {
  const rows = await query<{
    id: string; titulo: string; etapa: string; origem: string;
    notas: string; criado_em: string;
    cliente_nome: string; cliente_email: string; cliente_telefone: string;
  }>(`
    SELECT d.id, d.titulo, d.etapa, d.origem, d.notas, d.criado_em,
           c.nome AS cliente_nome, c.email AS cliente_email, c.telefone AS cliente_telefone
    FROM crm.deals d
    JOIN crm.customers c ON c.id = d.customer_id
    WHERE d.origem IN ('parcerias_b2b', 'grupo_vip', 'formulario')
      AND d.criado_em > NOW() - INTERVAL '72 hours'
    ORDER BY d.criado_em DESC
    LIMIT 20
  `, []);

  res.json({ deals: rows });
});

// ── GET /api/deals/kanban — agrupado por etapa ──────────────────

dealsRouter.get("/kanban", async (_req: Request, res: Response) => {
  const rows = await query<{
    id: string; titulo: string; valor: string; etapa: string;
    probabilidade: number; fechamento_previsto: string;
    notas: string; customer_id: string; cliente_nome: string;
    cliente_email: string; cliente_telefone: string; criado_em: string;
  }>(`
    SELECT d.*, c.nome as cliente_nome, c.email as cliente_email, c.telefone as cliente_telefone
    FROM crm.deals d
    JOIN crm.customers c ON c.id = d.customer_id
    WHERE d.etapa NOT IN ('fechado_perdido')
    ORDER BY d.valor DESC
  `, []);

  const kanban: Record<string, typeof rows> = {};
  for (const e of ETAPAS) kanban[e] = [];
  for (const row of rows) {
    if (kanban[row.etapa]) kanban[row.etapa].push(row);
  }

  // KPIs
  const total = rows.length;
  const valorTotal = rows.reduce((s, r) => s + parseFloat(r.valor || "0"), 0);
  const valorPonderado = rows.reduce((s, r) => s + parseFloat(r.valor || "0") * (r.probabilidade / 100), 0);

  res.json({
    kanban,
    kpis: {
      total_deals: total,
      valor_total: Math.round(valorTotal * 100) / 100,
      valor_ponderado: Math.round(valorPonderado * 100) / 100,
    },
    etapas: ETAPAS,
  });
});

// ── GET /api/deals/:id — detalhe ────────────────────────────────

dealsRouter.get("/:id", async (req: Request, res: Response) => {
  const deal = await queryOne(`
    SELECT d.*, c.nome as cliente_nome, c.email as cliente_email, c.telefone as cliente_telefone
    FROM crm.deals d
    JOIN crm.customers c ON c.id = d.customer_id
    WHERE d.id = $1
  `, [req.params.id]);
  if (!deal) { res.status(404).json({ error: "Deal não encontrado" }); return; }
  res.json(deal);
});

// ── POST /api/deals — criar ─────────────────────────────────────

const createSchema = z.object({
  customer_id: z.string().uuid(),
  titulo: z.string().min(1).max(255),
  valor: z.number().min(0).default(0),
  etapa: z.enum(ETAPAS).default("prospeccao"),
  origem: z.string().max(50).optional(),
  probabilidade: z.number().int().min(0).max(100).default(50),
  fechamento_previsto: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notas: z.string().optional(),
});

dealsRouter.post("/", async (req: Request, res: Response) => {
  const parse = createSchema.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: "Dados inválidos", details: parse.error.flatten() }); return; }

  const d = parse.data;
  const deal = await queryOne(`
    INSERT INTO crm.deals (customer_id, titulo, valor, etapa, origem, probabilidade, fechamento_previsto, notas)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *
  `, [d.customer_id, d.titulo, d.valor, d.etapa, d.origem || null, d.probabilidade, d.fechamento_previsto || null, d.notas || null]);

  logger.info("Deal criado", { id: (deal as { id: string }).id, titulo: d.titulo });
  res.status(201).json(deal);
});

// ── PUT /api/deals/:id — atualizar ──────────────────────────────

dealsRouter.put("/:id", async (req: Request, res: Response) => {
  const updateSchema = createSchema.partial();
  const parse = updateSchema.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: "Dados inválidos" }); return; }

  const ALLOWED_DEAL = ["titulo","valor","etapa","origem","probabilidade","fechamento_previsto","notas"];
  const safeEntries = Object.entries(parse.data).filter(([k, v]) => v !== undefined && ALLOWED_DEAL.includes(k));
  if (safeEntries.length === 0) { res.status(400).json({ error: "Nenhum campo" }); return; }

  const sets = safeEntries.map(([k], i) => `"${k}" = $${i + 1}`);
  const values: unknown[] = safeEntries.map(([, v]) => v);
  values.push(req.params.id);

  const updated = await queryOne(`
    UPDATE crm.deals SET ${sets.join(", ")} WHERE id = $${values.length} RETURNING *
  `, values);
  if (!updated) { res.status(404).json({ error: "Deal não encontrado" }); return; }
  res.json(updated);
});

// ── PATCH /api/deals/:id/etapa — mover entre etapas (drag) ─────

const moveSchema = z.object({
  etapa: z.enum(ETAPAS),
});

dealsRouter.patch("/:id/etapa", async (req: Request, res: Response) => {
  const parse = moveSchema.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: "Etapa inválida" }); return; }

  const updated = await queryOne(`
    UPDATE crm.deals SET etapa = $1 WHERE id = $2 RETURNING *
  `, [parse.data.etapa, req.params.id]);
  if (!updated) { res.status(404).json({ error: "Deal não encontrado" }); return; }
  res.json(updated);
});

// ── DELETE /api/deals/:id — remover ─────────────────────────────

dealsRouter.delete("/:id", async (req: Request, res: Response) => {
  const deleted = await queryOne(`DELETE FROM crm.deals WHERE id = $1 RETURNING id`, [req.params.id]);
  if (!deleted) { res.status(404).json({ error: "Deal não encontrado" }); return; }
  res.json({ message: "Deal removido" });
});
