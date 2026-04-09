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
// BLING LOJA (StoreFront)
// ══════════════════════════════════════════════════════════════

syncRouter.post("/bling-loja", authMiddleware, async (_req: Request, res: Response) => {
  const { syncLojaCompleta } = await import("../integrations/bling/loja-sync");
  logger.info("Bling Loja sync manual iniciado");
  res.json({ message: "Sync loja iniciado em background. Acompanhe pelos logs." });

  try {
    const result = await syncLojaCompleta();
    logger.info("Bling Loja sync concluído", result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro";
    logger.error("Bling Loja sync falhou", { error: message });
  }
});

syncRouter.post("/bling-loja/categorias", authMiddleware, async (_req: Request, res: Response) => {
  const { syncCategoriasToLoja } = await import("../integrations/bling/loja-sync");
  res.json({ message: "Sync categorias iniciado" });
  try {
    const result = await syncCategoriasToLoja();
    logger.info("Bling Loja categorias sync", result);
  } catch (err: unknown) {
    logger.error("Bling Loja categorias falhou", { error: err instanceof Error ? err.message : "" });
  }
});

syncRouter.post("/bling-loja/produtos", authMiddleware, async (_req: Request, res: Response) => {
  const { syncProdutosToLoja } = await import("../integrations/bling/loja-sync");
  res.json({ message: "Sync produtos iniciado" });
  try {
    const result = await syncProdutosToLoja();
    logger.info("Bling Loja produtos sync", result);
  } catch (err: unknown) {
    logger.error("Bling Loja produtos falhou", { error: err instanceof Error ? err.message : "" });
  }
});

// ══════════════════════════════════════════════════════════════
// MEDUSA
// ══════════════════════════════════════════════════════════════

// Sync manual Medusa (respeita kill switch + config)
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

// Kill switch + configuração do sync Medusa
syncRouter.get("/medusa/config", authMiddleware, async (_req: Request, res: Response) => {
  const row = await queryOne<{ ultimo_id: string }>(
    "SELECT ultimo_id FROM sync.sync_state WHERE fonte = 'medusa-sync'"
  );
  const config = row ? JSON.parse(row.ultimo_id) : { enabled: false, mode: "dry-run", max_products: 100 };
  res.json({ config });
});

syncRouter.post("/medusa/config", authMiddleware, async (req: Request, res: Response) => {
  const { setSyncConfig } = await import("../integrations/medusa/sync");
  const { enabled, mode, max_products } = req.body;
  await setSyncConfig({
    ...(enabled !== undefined ? { enabled } : {}),
    ...(mode ? { mode } : {}),
    ...(max_products ? { max_products } : {}),
  });
  res.json({ message: "Config atualizada", config: req.body });
});

// Kill switch rápido: parar sync
syncRouter.post("/medusa/stop", authMiddleware, async (_req: Request, res: Response) => {
  const { setSyncConfig } = await import("../integrations/medusa/sync");
  await setSyncConfig({ enabled: false });
  logger.warn("MEDUSA SYNC: PARADO via kill switch");
  res.json({ message: "Sync Medusa PARADO" });
});

// Logs do sync Medusa (monitoramento)
syncRouter.get("/medusa/logs", authMiddleware, async (req: Request, res: Response) => {
  const limit = parseInt(req.query.limit as string) || 20;
  const rows = await query(
    "SELECT * FROM sync.medusa_sync_log ORDER BY criado_em DESC LIMIT $1",
    [limit]
  );
  res.json({ logs: rows });
});

// ══════════════════════════════════════════════════════════════
// MELHOR ENVIO
// ══════════════════════════════════════════════════════════════

// Endpoint interno (chamado pelo Medusa callback OAuth2) — sem auth (rede Docker interna)
syncRouter.post("/internal/melhorenvio-token", async (req: Request, res: Response) => {
  const { access_token, refresh_token, expires_in } = req.body;

  if (!access_token || !refresh_token) {
    res.status(400).json({ error: "access_token e refresh_token obrigatórios" });
    return;
  }

  try {
    const tokenData = JSON.stringify({
      access_token,
      refresh_token,
      expires_in: expires_in || 2592000,
      expires_at: new Date(Date.now() + (expires_in || 2592000) * 1000).toISOString(),
      connected_at: new Date().toISOString(),
    });

    await query(
      `INSERT INTO sync.sync_state (fonte, ultimo_id, ultima_sync)
       VALUES ('melhorenvio', $1, NOW())
       ON CONFLICT (fonte) DO UPDATE SET
         ultimo_id = $1,
         ultima_sync = NOW()`,
      [tokenData]
    );

    logger.info("Melhor Envio: token salvo no sync_state");
    res.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro ao salvar token";
    logger.error("Melhor Envio: erro ao salvar token", { error: message });
    res.status(500).json({ error: message });
  }
});

// GET token (chamado pelo Medusa fulfillment provider — rede Docker interna)
syncRouter.get("/internal/melhorenvio-token", async (_req: Request, res: Response) => {
  try {
    const row = await queryOne<{ ultimo_id: string }>(
      "SELECT ultimo_id FROM sync.sync_state WHERE fonte = 'melhorenvio'"
    );

    if (!row?.ultimo_id) {
      res.status(404).json({ error: "Token Melhor Envio não encontrado" });
      return;
    }

    const tokenData = JSON.parse(row.ultimo_id);
    res.json({ access_token: tokenData.access_token });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro ao buscar token";
    logger.error("Melhor Envio: erro ao buscar token", { error: message });
    res.status(500).json({ error: message });
  }
});

// Recebe pedido do Medusa e cria no Bling (rede Docker interna)
syncRouter.post("/internal/medusa-order", async (req: Request, res: Response) => {
  const order = req.body;

  if (!order?.medusa_order_id || !order?.items?.length) {
    res.status(400).json({ error: "medusa_order_id e items obrigatórios" });
    return;
  }

  try {
    const { getValidToken, BLING_API } = await import("../integrations/bling/auth");
    const { rateLimitedGet } = await import("../integrations/bling/sync");
    const axios = (await import("axios")).default;
    const token = await getValidToken();

    const addr = order.shipping_address || {};
    const numero = `MDS-${order.display_id || Date.now()}`;
    const dataHoje = new Date().toISOString().split("T")[0];

    // Buscar ou criar contato no Bling pelo email
    let contatoId: number | undefined;
    if (order.email) {
      await new Promise(r => setTimeout(r, 350)); // rate limit
      try {
        const searchRes = await axios.get(
          `${BLING_API}/contatos?pesquisa=${encodeURIComponent(order.email)}&limite=1`,
          { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 }
        );
        contatoId = searchRes.data?.data?.[0]?.id;
      } catch { /* contato não encontrado */ }

      if (!contatoId) {
        await new Promise(r => setTimeout(r, 350));
        try {
          const nome = [addr.first_name, addr.last_name].filter(Boolean).join(" ") || "Cliente Loja Online";
          const createRes = await axios.post(
            `${BLING_API}/contatos`,
            {
              nome,
              tipo: "F",
              fantasia: nome,
              email: order.email,
              telefone: addr.phone || "",
              endereco: {
                endereco: addr.address_1 || "",
                numero: "",
                bairro: "",
                municipio: addr.city || "",
                uf: addr.province || "",
                cep: (addr.postal_code || "").replace(/\D/g, ""),
                pais: "Brasil",
              },
            },
            { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, timeout: 15000 }
          );
          contatoId = createRes.data?.data?.id;
          logger.info(`Medusa → Bling: contato criado id=${contatoId}`);
        } catch (err: any) {
          logger.warn(`Medusa → Bling: erro ao criar contato: ${err?.response?.data ? JSON.stringify(err.response.data) : err.message}`);
        }
      }
    }

    const blingOrder: Record<string, unknown> = {
      numero,
      data: dataHoje,
      contato: contatoId ? { id: contatoId } : {
        nome: [addr.first_name, addr.last_name].filter(Boolean).join(" ") || "Cliente Loja Online",
        tipoPessoa: "F",
      },
      itens: order.items.map((item: any) => ({
        codigo: item.sku || "",
        descricao: item.title || "",
        quantidade: item.quantity || 1,
        valor: (item.unit_price || 0) / 100,
        desconto: 0,
      })),
      parcelas: [
        {
          valor: (order.total || 0) / 100,
          dataVencimento: dataHoje,
        },
      ],
      transporte: {
        fretePorConta: 0,
        transportadora: order.shipping_method || "Melhor Envio",
      },
    };

    // Criar pedido no Bling
    const blingRes = await axios.post(
      `${BLING_API}/pedidos/vendas`,
      blingOrder,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        timeout: 15000,
      }
    );

    const blingId = blingRes.data?.data?.id;
    logger.info(`Medusa → Bling: pedido ${numero} criado (bling_id=${blingId})`);

    // Salvar referência no banco
    await query(
      `INSERT INTO sync.bling_orders (bling_id, numero, valor, status, canal, itens, criado_bling)
       VALUES ($1, $2, $3, 'em_aberto', 'medusa', $4, NOW())
       ON CONFLICT (bling_id) DO NOTHING`,
      [
        String(blingId),
        numero,
        (order.total || 0) / 100,
        JSON.stringify(order.items),
      ]
    );

    // Gerar etiqueta Melhor Envio em background (não bloqueia response)
    res.json({ ok: true, bling_order_id: blingId, numero });

    // Após responder, tentar gerar etiqueta
    if (order.shipping_address?.postal_code) {
      try {
        const { createShippingLabel } = await import("../integrations/melhorenvio/shipping");
        const labelResult = await createShippingLabel({
          numero,
          email: order.email || "",
          total: order.total || 0,
          items: order.items,
          shipping_address: order.shipping_address,
          shipping_service: order.shipping_service || "pac",
        });
        logger.info(
          `Medusa → ME: etiqueta ${numero} gerada (cart=${labelResult.me_cart_id} label=${labelResult.label_url})`
        );
      } catch (labelErr: any) {
        // Etiqueta falhou mas pedido no Bling foi criado — log e segue
        logger.warn(
          `Medusa → ME: etiqueta ${numero} falhou: ${labelErr.message}. Pedido Bling OK.`
        );
      }
    }
    return;
  } catch (err: unknown) {
    const axiosErr = err as any;
    const message = axiosErr?.response?.data
      ? JSON.stringify(axiosErr.response.data)
      : (err instanceof Error ? err.message : "Erro ao criar pedido no Bling");
    logger.error("Medusa → Bling: erro ao criar pedido", { error: message });
    res.status(502).json({ error: message });
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
