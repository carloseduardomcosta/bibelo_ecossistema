import { Router, Request, Response } from "express";
import { query, queryOne } from "../db";
import { authMiddleware } from "../middleware/auth";
import { logger } from "../utils/logger";
import { getAuthUrl, exchangeCode } from "../integrations/bling/auth";
import { syncCustomers, syncOrders, incrementalSync } from "../integrations/bling/sync";

export const syncRouter = Router();

// ── GET /api/sync/status — status das integrações ───────────────

syncRouter.get("/status", authMiddleware, async (_req: Request, res: Response) => {
  const states = await query<{
    fonte: string;
    ultima_sync: string | null;
    total_sincronizados: number;
  }>(
    "SELECT fonte, ultima_sync, total_sincronizados FROM sync.sync_state ORDER BY fonte"
  );

  const recentLogs = await query<{
    id: string;
    fonte: string;
    tipo: string;
    status: string;
    registros: number;
    erro: string | null;
    criado_em: string;
  }>(
    "SELECT * FROM sync.sync_logs ORDER BY criado_em DESC LIMIT 20"
  );

  // Verifica se Bling tem tokens configurados
  const blingState = await queryOne<{ ultimo_id: string }>(
    "SELECT ultimo_id FROM sync.sync_state WHERE fonte = 'bling'"
  );

  let blingConnected = false;
  if (blingState?.ultimo_id) {
    try {
      const tokens = JSON.parse(blingState.ultimo_id);
      blingConnected = !!tokens.access_token;
    } catch { /* sem tokens */ }
  }

  res.json({
    integracoes: states,
    bling_conectado: blingConnected,
    logs_recentes: recentLogs,
  });
});

// ── POST /api/sync/bling — sync manual ──────────────────────────

syncRouter.post("/bling", authMiddleware, async (req: Request, res: Response) => {
  const tipo = (req.query.tipo as string) || "incremental";

  logger.info("Sync Bling manual iniciado", { tipo, user: req.user?.email });

  try {
    if (tipo === "full") {
      const customers = await syncCustomers();
      const orders = await syncOrders();
      res.json({
        message: "Sync completo finalizado",
        customers,
        orders,
      });
    } else {
      const result = await incrementalSync();
      res.json({
        message: "Sync incremental finalizado",
        ...result,
      });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro na sincronização";
    logger.error("Sync Bling manual falhou", { error: message });
    res.status(500).json({ error: "Falha na sincronização com o Bling", detalhes: message });
  }
});

// ── GET /api/auth/bling — redireciona para OAuth Bling ──────────

syncRouter.get("/auth/bling", authMiddleware, (_req: Request, res: Response) => {
  const url = getAuthUrl();
  res.json({ url });
});

// ── GET /api/auth/bling/callback — callback OAuth Bling ─────────

syncRouter.get("/auth/bling/callback", async (req: Request, res: Response) => {
  const code = req.query.code as string;
  const state = req.query.state as string;

  if (!code) {
    res.status(400).json({ error: "Código de autorização não fornecido" });
    return;
  }

  if (state !== "bibelo") {
    res.status(400).json({ error: "State inválido" });
    return;
  }

  try {
    await exchangeCode(code);
    logger.info("Bling OAuth callback: tokens salvos com sucesso");

    // Redireciona para o frontend com sucesso
    const appUrl = process.env.APP_URL || "http://localhost:3000";
    res.redirect(`${appUrl}/sync?bling=connected`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro no OAuth";
    logger.error("Bling OAuth callback falhou", { error: message });

    const appUrl = process.env.APP_URL || "http://localhost:3000";
    res.redirect(`${appUrl}/sync?bling=error`);
  }
});
