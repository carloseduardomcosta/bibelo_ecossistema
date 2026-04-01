import { Router, Request, Response } from "express";
import crypto from "crypto";
import { query, queryOne } from "../db";
import { authMiddleware } from "../middleware/auth";
import { logger } from "../utils/logger";
import { getAuthUrl, exchangeCode } from "../integrations/bling/auth";
import { syncCustomers, syncOrders, syncProducts, syncStock, syncNfEntrada, syncContasPagar, incrementalSync } from "../integrations/bling/sync";
import { getNuvemShopAuthUrl, exchangeNuvemShopCode, getNuvemShopToken } from "../integrations/nuvemshop/auth";
import { syncNuvemShop, registerNsWebhooks } from "../integrations/nuvemshop/sync";

export const syncRouter = Router();

// ── OAuth state store (in-memory, 5-min TTL) ──────────────────
const oauthStates = new Map<string, number>();
const OAUTH_STATE_TTL_MS = 5 * 60 * 1000;

function generateOAuthState(): string {
  const state = crypto.randomBytes(16).toString("hex");
  oauthStates.set(state, Date.now());
  return state;
}

function validateOAuthState(state: string): boolean {
  const created = oauthStates.get(state);
  if (!created) return false;
  oauthStates.delete(state);
  if (Date.now() - created > OAUTH_STATE_TTL_MS) return false;
  // Cleanup expired entries
  for (const [key, ts] of oauthStates) {
    if (Date.now() - ts > OAUTH_STATE_TTL_MS) oauthStates.delete(key);
  }
  return true;
}

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

  // Verifica se NuvemShop tem token configurado
  const nsState = await queryOne<{ ultimo_id: string }>(
    "SELECT ultimo_id FROM sync.sync_state WHERE fonte = 'nuvemshop'"
  );

  let nuvemshopConnected = false;
  let nuvemshopStoreId: number | null = null;
  if (nsState?.ultimo_id) {
    try {
      const tokens = JSON.parse(nsState.ultimo_id);
      nuvemshopConnected = !!tokens.access_token;
      nuvemshopStoreId = tokens.store_id || null;
    } catch { /* sem tokens */ }
  }

  res.json({
    integracoes: states,
    bling_conectado: blingConnected,
    nuvemshop_conectado: nuvemshopConnected,
    nuvemshop_store_id: nuvemshopStoreId,
    logs_recentes: recentLogs,
  });
});

// ── POST /api/sync/bling — sync manual ──────────────────────────

syncRouter.post("/bling", authMiddleware, async (req: Request, res: Response) => {
  const tipo = (req.query.tipo as string) || "incremental";

  logger.info("Sync Bling manual iniciado", { tipo, user: req.user?.email });

  // Responde imediatamente e roda sync em background (evita timeout HTTP)
  res.json({ message: `Sync ${tipo} iniciado em background. Acompanhe pelos logs.` });

  try {
    if (tipo === "full") {
      const customers = await syncCustomers();
      const orders = await syncOrders();
      const products = await syncProducts();
      const stock = await syncStock();
      const nfEntrada = await syncNfEntrada();
      const contasPagar = await syncContasPagar();
      logger.info("Sync completo finalizado", { customers, orders, products, stock, nfEntrada, contasPagar });
    } else {
      const result = await incrementalSync();
      logger.info("Sync incremental finalizado", { ...result });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro na sincronização";
    logger.error("Sync Bling manual falhou", { error: message });
  }
});

// ══════════════════════════════════════════════════════════════
// NUVEMSHOP
// ══════════════════════════════════════════════════════════════

// ── GET /api/auth/nuvemshop — URL de autorização ──────────────

syncRouter.get("/auth/nuvemshop", authMiddleware, (_req: Request, res: Response) => {
  const url = getNuvemShopAuthUrl();
  res.json({ url });
});

// ── GET /api/auth/nuvemshop/callback — callback OAuth ─────────

syncRouter.get("/auth/nuvemshop/callback", async (req: Request, res: Response) => {
  const code = req.query.code as string;

  if (!code) {
    res.status(400).json({ error: "Código de autorização não fornecido" });
    return;
  }

  try {
    const result = await exchangeNuvemShopCode(code);
    logger.info("NuvemShop OAuth callback: token salvo", { store_id: result.user_id });

    // Registra webhooks automaticamente
    try {
      await registerNsWebhooks();
    } catch (err: unknown) {
      logger.warn("Falha ao registrar webhooks NS após OAuth", { error: err instanceof Error ? err.message : "Erro" });
    }

    const appUrl = process.env.APP_URL || "http://localhost:3000";
    res.redirect(`${appUrl}/sync?nuvemshop=connected`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro no OAuth";
    logger.error("NuvemShop OAuth callback falhou", { error: message });

    const appUrl = process.env.APP_URL || "http://localhost:3000";
    res.redirect(`${appUrl}/sync?nuvemshop=error`);
  }
});

// ── POST /api/sync/nuvemshop — sync manual ────────────────────

syncRouter.post("/nuvemshop", authMiddleware, async (_req: Request, res: Response) => {
  const token = await getNuvemShopToken();
  if (!token) {
    res.status(400).json({ error: "NuvemShop não conectada. Autorize primeiro." });
    return;
  }

  logger.info("Sync NuvemShop manual iniciado");
  res.json({ message: "Sync NuvemShop iniciado em background. Acompanhe pelos logs." });

  try {
    const result = await syncNuvemShop();
    logger.info("Sync NuvemShop manual finalizado", { ...result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro na sincronização";
    logger.error("Sync NuvemShop manual falhou", { error: message });
  }
});

// ══════════════════════════════════════════════════════════════
// MEDUSA
// ══════════════════════════════════════════════════════════════

syncRouter.post("/medusa", authMiddleware, async (_req: Request, res: Response) => {
  const { syncBlingToMedusa } = await import("../integrations/medusa/sync");
  logger.info("Sync Medusa manual iniciado");
  res.json({ message: "Sync Medusa iniciado em background. Acompanhe pelos logs." });

  try {
    const result = await syncBlingToMedusa();
    logger.info("Sync Medusa manual finalizado", { ...result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro na sincronização";
    logger.error("Sync Medusa manual falhou", { error: message });
  }
});

// ══════════════════════════════════════════════════════════════
// BLING
// ══════════════════════════════════════════════════════════════

// ── GET /api/auth/bling — redireciona para OAuth Bling ──────────

syncRouter.get("/auth/bling", authMiddleware, (_req: Request, res: Response) => {
  const state = generateOAuthState();
  const url = getAuthUrl(state);
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

  if (!state || !validateOAuthState(state)) {
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
