import { Router, Request, Response } from "express";
import { z } from "zod";
import { query, queryOne } from "../db";
import { authMiddleware } from "../middleware/auth";

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
