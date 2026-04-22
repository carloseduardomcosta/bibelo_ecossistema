import { Router, Request, Response } from "express";
import { z } from "zod";
import { query, queryOne } from "../db";
import { authMiddleware } from "../middleware/auth";

// ── Operador: notificações com contexto WhatsApp (crm.notificacoes_operador) ──

export const notificacoesRouter = Router();
notificacoesRouter.use(authMiddleware);

// ── GET / — listar notificações (mais recentes primeiro) ───────────

notificacoesRouter.get("/", async (req: Request, res: Response) => {
  const schema = z.object({
    limit: z.coerce.number().int().min(1).max(100).default(50),
    apenas_nao_lidas: z.enum(["1", "0"]).optional(),
  });
  const parse = schema.safeParse(req.query);
  if (!parse.success) { res.status(400).json({ error: "Parâmetros inválidos" }); return; }

  const { limit, apenas_nao_lidas } = parse.data;
  const where = apenas_nao_lidas === "1" ? "WHERE lida = FALSE" : "";

  const rows = await query(
    `SELECT id, tipo, titulo, corpo, link, lida, criado_em
       FROM public.notificacoes
       ${where}
      ORDER BY criado_em DESC
      LIMIT $1`,
    [limit]
  );

  const total_nao_lidas = await queryOne<{ total: string }>(
    "SELECT COUNT(*)::text AS total FROM public.notificacoes WHERE lida = FALSE"
  );

  res.json({
    data: rows,
    total_nao_lidas: parseInt(total_nao_lidas?.total || "0"),
  });
});

// ── PUT /lida-tudo — marcar todas como lidas ───────────────────────
// DEVE ser registrado ANTES de /:id/lida para evitar conflito de rota

notificacoesRouter.put("/lida-tudo", async (_req: Request, res: Response) => {
  await query("UPDATE public.notificacoes SET lida = TRUE WHERE lida = FALSE");
  res.json({ ok: true });
});

// ── PUT /:id/lida — marcar uma como lida ──────────────────────────

notificacoesRouter.put("/:id/lida", async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) {
    res.status(400).json({ error: "ID inválido" });
    return;
  }
  const updated = await queryOne(
    "UPDATE public.notificacoes SET lida = TRUE WHERE id = $1 RETURNING id",
    [id]
  );
  if (!updated) { res.status(404).json({ error: "Notificação não encontrada" }); return; }
  res.json({ ok: true });
});

// ── GET /operador — listar notificações do operador ───────────────────────────
// Suporta ?status=pendente|enviado|ignorado (default: pendente)
// Diferente de GET / que lista public.notificacoes (sino do CRM)

notificacoesRouter.get("/operador", async (req: Request, res: Response) => {
  const schema = z.object({
    status: z.enum(["pendente", "enviado", "ignorado"]).default("pendente"),
    tipo: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(200).default(100),
  });
  const parse = schema.safeParse(req.query);
  if (!parse.success) { res.status(400).json({ error: "Parâmetros inválidos" }); return; }

  const { status, tipo, limit } = parse.data;

  const rows = await query(
    `SELECT
       no2.id, no2.tipo, no2.customer_id, no2.titulo, no2.descricao,
       no2.dados, no2.whatsapp, no2.link_direto, no2.status,
       no2.created_at, no2.updated_at,
       c.nome AS customer_nome
     FROM crm.notificacoes_operador no2
     LEFT JOIN crm.customers c ON c.id = no2.customer_id
     WHERE no2.status = $1
       ${tipo ? "AND no2.tipo = $3" : ""}
     ORDER BY no2.created_at DESC
     LIMIT $2`,
    tipo ? [status, limit, tipo] : [status, limit],
  );

  const totais = await query<{ status: string; total: string }>(
    `SELECT status, COUNT(*)::text AS total FROM crm.notificacoes_operador GROUP BY status`
  );
  const contagem: Record<string, number> = {};
  for (const t of totais) contagem[t.status] = parseInt(t.total, 10);

  res.json({ data: rows, contagem });
});

// ── PATCH /operador/:id — atualizar status de notificação do operador ─────────

notificacoesRouter.patch("/operador/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) {
    res.status(400).json({ error: "ID inválido" });
    return;
  }

  const schema = z.object({
    status: z.enum(["enviado", "ignorado"]),
  });
  const parse = schema.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: parse.error.flatten() }); return; }

  const updated = await queryOne(
    `UPDATE crm.notificacoes_operador
     SET status = $2, updated_at = NOW()
     WHERE id = $1 RETURNING id`,
    [id, parse.data.status],
  );

  if (!updated) { res.status(404).json({ error: "Notificação não encontrada" }); return; }
  res.json({ ok: true });
});
