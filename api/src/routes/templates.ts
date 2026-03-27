import { Router, Request, Response } from "express";
import { z } from "zod";
import { query, queryOne } from "../db";
import { authMiddleware } from "../middleware/auth";
import { logger } from "../utils/logger";

export const templatesRouter = Router();
templatesRouter.use(authMiddleware);

// ── Schemas ─────────────────────────────────────────────────────

const createSchema = z.object({
  nome: z.string().min(2).max(100),
  canal: z.enum(["email", "whatsapp"]),
  categoria: z.string().max(50).optional(),
  assunto: z.string().max(255).optional(),
  html: z.string().optional(),
  texto: z.string().optional(),
  variaveis: z.array(z.string()).optional(),
});

const updateSchema = createSchema.partial();

// ── GET /api/templates — lista ──────────────────────────────────

templatesRouter.get("/", async (req: Request, res: Response) => {
  const canal = req.query.canal as string | undefined;

  const conditions: string[] = ["ativo = true"];
  const params: unknown[] = [];

  if (canal) {
    conditions.push("canal = $1");
    params.push(canal);
  }

  const rows = await query(
    `SELECT * FROM marketing.templates
     WHERE ${conditions.join(" AND ")}
     ORDER BY criado_em DESC`,
    params
  );

  res.json({ data: rows });
});

// ── GET /api/templates/:id ──────────────────────────────────────

templatesRouter.get("/:id", async (req: Request, res: Response) => {
  const template = await queryOne(
    "SELECT * FROM marketing.templates WHERE id = $1",
    [req.params.id]
  );

  if (!template) {
    res.status(404).json({ error: "Template não encontrado" });
    return;
  }

  res.json(template);
});

// ── POST /api/templates — criar ─────────────────────────────────

templatesRouter.post("/", async (req: Request, res: Response) => {
  const parse = createSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: "Dados inválidos", detalhes: parse.error.errors });
    return;
  }

  const { nome, canal, categoria, assunto, html, texto, variaveis } = parse.data;

  const template = await queryOne(
    `INSERT INTO marketing.templates (nome, canal, categoria, assunto, html, texto, variaveis)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [nome, canal, categoria || null, assunto || null, html || null, texto || null, JSON.stringify(variaveis || [])]
  );

  logger.info("Template criado", { id: (template as { id: string }).id, nome, user: req.user?.email });
  res.status(201).json(template);
});

// ── PUT /api/templates/:id — atualizar ──────────────────────────

templatesRouter.put("/:id", async (req: Request, res: Response) => {
  const parse = updateSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: "Dados inválidos", detalhes: parse.error.errors });
    return;
  }

  const existing = await queryOne(
    "SELECT id FROM marketing.templates WHERE id = $1",
    [req.params.id]
  );

  if (!existing) {
    res.status(404).json({ error: "Template não encontrado" });
    return;
  }

  const data = { ...parse.data };
  if (data.variaveis) {
    (data as Record<string, unknown>).variaveis = JSON.stringify(data.variaveis);
  }

  const entries = Object.entries(data).filter(([, v]) => v !== undefined);
  if (entries.length === 0) {
    res.status(400).json({ error: "Nenhum campo para atualizar" });
    return;
  }

  const sets = entries.map(([k], i) => `${k} = $${i + 1}`);
  const values = entries.map(([, v]) => v);
  values.push(req.params.id);

  const updated = await queryOne(
    `UPDATE marketing.templates SET ${sets.join(", ")}
     WHERE id = $${values.length} RETURNING *`,
    values
  );

  logger.info("Template atualizado", { id: req.params.id, user: req.user?.email });
  res.json(updated);
});

// ── DELETE /api/templates/:id — soft delete ─────────────────────

templatesRouter.delete("/:id", async (req: Request, res: Response) => {
  const existing = await queryOne(
    "SELECT id FROM marketing.templates WHERE id = $1 AND ativo = true",
    [req.params.id]
  );

  if (!existing) {
    res.status(404).json({ error: "Template não encontrado" });
    return;
  }

  await query(
    "UPDATE marketing.templates SET ativo = false WHERE id = $1",
    [req.params.id]
  );

  logger.info("Template desativado", { id: req.params.id, user: req.user?.email });
  res.json({ message: "Template removido" });
});
