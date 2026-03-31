import { Router, Request, Response } from "express";
import { z } from "zod";
import { query, queryOne } from "../db";
import { authMiddleware } from "../middleware/auth";
import { logger } from "../utils/logger";

export const flowsRouter = Router();
flowsRouter.use(authMiddleware);

// ── GET /api/flows/stats/overview — resumo geral (ANTES de /:id) ──

flowsRouter.get("/stats/overview", async (_req: Request, res: Response) => {
  const stats = await queryOne<Record<string, unknown>>(
    `SELECT
       (SELECT COUNT(*) FROM marketing.flows WHERE ativo = true) AS fluxos_ativos,
       (SELECT COUNT(*) FROM marketing.flow_executions WHERE status = 'ativo') AS execucoes_ativas,
       (SELECT COUNT(*) FROM marketing.flow_executions WHERE status = 'concluido' AND concluido_em > NOW() - INTERVAL '7 days') AS concluidas_7d,
       (SELECT COUNT(*) FROM marketing.flow_executions WHERE status = 'erro' AND concluido_em > NOW() - INTERVAL '7 days') AS erros_7d,
       (SELECT COUNT(*) FROM marketing.pedidos_pendentes WHERE convertido = false AND notificado = false) AS carrinhos_pendentes,
       (SELECT COUNT(*) FROM marketing.pedidos_pendentes WHERE notificado = true AND convertido = false) AS carrinhos_notificados,
       (SELECT COUNT(*) FROM marketing.pedidos_pendentes WHERE convertido = true) AS carrinhos_convertidos`
  );

  res.json(stats);
});

// ── GET /api/flows — listar fluxos ────────────────────────────

flowsRouter.get("/", async (_req: Request, res: Response) => {
  const flows = await query<Record<string, unknown>>(
    `SELECT f.*,
       (SELECT COUNT(*) FROM marketing.flow_executions fe WHERE fe.flow_id = f.id AND fe.status = 'ativo') AS execucoes_ativas,
       (SELECT COUNT(*) FROM marketing.flow_executions fe WHERE fe.flow_id = f.id AND fe.status = 'concluido') AS execucoes_concluidas,
       (SELECT COUNT(*) FROM marketing.flow_executions fe WHERE fe.flow_id = f.id AND fe.status = 'erro') AS execucoes_erro
     FROM marketing.flows f
     ORDER BY f.ativo DESC, f.criado_em DESC`
  );

  res.json(flows);
});

// ── GET /api/flows/:id — detalhes + execuções recentes ────────

flowsRouter.get("/:id", async (req: Request, res: Response) => {
  const flow = await queryOne<Record<string, unknown>>(
    "SELECT * FROM marketing.flows WHERE id = $1",
    [req.params.id]
  );

  if (!flow) {
    res.status(404).json({ error: "Fluxo não encontrado" });
    return;
  }

  const executions = await query<Record<string, unknown>>(
    `SELECT fe.*, c.nome AS customer_nome, c.email AS customer_email
     FROM marketing.flow_executions fe
     JOIN crm.customers c ON c.id = fe.customer_id
     WHERE fe.flow_id = $1
     ORDER BY fe.iniciado_em DESC
     LIMIT 50`,
    [req.params.id]
  );

  res.json({ ...flow, executions });
});

// ── POST /api/flows — criar fluxo ────────────────────────────

// Sanitiza HTML em strings (anti-XSS stored)
function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, "").trim();
}

const createSchema = z.object({
  nome: z.string().min(3).max(100).transform(stripHtml),
  descricao: z.string().optional().transform((v) => v ? stripHtml(v) : v),
  gatilho: z.enum(["order.first", "order.paid", "order.abandoned", "customer.created", "customer.inactive"]),
  gatilho_config: z.record(z.unknown()).optional(),
  steps: z.array(z.object({
    tipo: z.enum(["email", "whatsapp", "wait", "condicao"]),
    template: z.string().optional(),
    delay_horas: z.number().min(0),
  })).min(1),
  ativo: z.boolean().optional(),
});

flowsRouter.post("/", async (req: Request, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Dados inválidos", details: parsed.error.flatten() });
    return;
  }

  const { nome, descricao, gatilho, gatilho_config, steps, ativo } = parsed.data;

  const flow = await queryOne<Record<string, unknown>>(
    `INSERT INTO marketing.flows (nome, descricao, gatilho, gatilho_config, steps, ativo)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [nome, descricao || null, gatilho, JSON.stringify(gatilho_config || {}), JSON.stringify(steps), ativo ?? false]
  );

  logger.info("Fluxo criado", { id: flow?.id, nome, gatilho });
  res.status(201).json(flow);
});

// ── PUT /api/flows/:id — atualizar fluxo ──────────────────────

const updateSchema = z.object({
  nome: z.string().min(3).max(100).transform(stripHtml).optional(),
  descricao: z.string().optional().transform((v) => v ? stripHtml(v) : v),
  gatilho_config: z.record(z.unknown()).optional(),
  steps: z.array(z.object({
    tipo: z.enum(["email", "whatsapp", "wait", "condicao"]),
    template: z.string().optional(),
    delay_horas: z.number().min(0),
  })).min(1).optional(),
});

flowsRouter.put("/:id", async (req: Request, res: Response) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Dados inválidos", details: parsed.error.flatten() });
    return;
  }

  const existing = await queryOne<{ id: string }>(
    "SELECT id FROM marketing.flows WHERE id = $1",
    [req.params.id]
  );

  if (!existing) {
    res.status(404).json({ error: "Fluxo não encontrado" });
    return;
  }

  const fields: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  const data = parsed.data;
  if (data.nome) { fields.push(`nome = $${idx++}`); values.push(data.nome); }
  if (data.descricao !== undefined) { fields.push(`descricao = $${idx++}`); values.push(data.descricao); }
  if (data.gatilho_config) { fields.push(`gatilho_config = $${idx++}`); values.push(JSON.stringify(data.gatilho_config)); }
  if (data.steps) { fields.push(`steps = $${idx++}`); values.push(JSON.stringify(data.steps)); }

  if (fields.length === 0) {
    res.json(existing);
    return;
  }

  fields.push(`atualizado_em = NOW()`);
  values.push(req.params.id);

  const flow = await queryOne<Record<string, unknown>>(
    `UPDATE marketing.flows SET ${fields.join(", ")} WHERE id = $${idx} RETURNING *`,
    values
  );

  logger.info("Fluxo atualizado", { id: req.params.id });
  res.json(flow);
});

// ── POST /api/flows/:id/toggle — ativar/desativar ─────────────

flowsRouter.post("/:id/toggle", async (req: Request, res: Response) => {
  const flow = await queryOne<Record<string, unknown>>(
    "UPDATE marketing.flows SET ativo = NOT ativo, atualizado_em = NOW() WHERE id = $1 RETURNING *",
    [req.params.id]
  );

  if (!flow) {
    res.status(404).json({ error: "Fluxo não encontrado" });
    return;
  }

  logger.info("Fluxo toggled", { id: req.params.id, ativo: flow.ativo });
  res.json(flow);
});

// ── GET /api/flows/:id/executions/:execId — detalhe execução ──

flowsRouter.get("/:id/executions/:execId", async (req: Request, res: Response) => {
  const execution = await queryOne<Record<string, unknown>>(
    `SELECT fe.*, c.nome AS customer_nome, c.email AS customer_email
     FROM marketing.flow_executions fe
     JOIN crm.customers c ON c.id = fe.customer_id
     WHERE fe.id = $1 AND fe.flow_id = $2`,
    [req.params.execId, req.params.id]
  );

  if (!execution) {
    res.status(404).json({ error: "Execução não encontrada" });
    return;
  }

  const steps = await query<Record<string, unknown>>(
    `SELECT * FROM marketing.flow_step_executions
     WHERE execution_id = $1 ORDER BY step_index ASC`,
    [req.params.execId]
  );

  res.json({ ...execution, steps });
});

