import { Router, Request, Response } from "express";
import crypto from "crypto";
import { query, queryOne } from "../db";
import { authMiddleware } from "../middleware/auth";
import { logger } from "../utils/logger";
import { getAuthUrl, exchangeCode } from "../integrations/bling/auth";
import { syncCustomers, syncOrders, syncProducts, syncStock, syncNfEntrada, syncContasPagar, incrementalSync, syncProductCategories, fetchCategoryMap, syncProductImages, syncProductGtins } from "../integrations/bling/sync";
import { syncWahaVipBulk } from "../integrations/whatsapp/waha";
import { syncLogisticaObjetos } from "../integrations/bling/logistica";
import { getNuvemShopAuthUrl, exchangeNuvemShopCode, getNuvemShopToken } from "../integrations/nuvemshop/auth";
import { syncNuvemShop, registerNsWebhooks, syncNsProducts } from "../integrations/nuvemshop/sync";
import { sendOrderConfirmationEmail, sendPaymentApprovedEmail, sendShippingEmail } from "../services/storefront-email.service";
import { buildFlowEmail, getFlowSubject } from "../services/flow.service";
import { sendEmail } from "../integrations/resend/email";
import { detectarRegiao } from "../utils/regiao";

export const syncRouter = Router();

// ── OAuth state store (in-memory, 5-min TTL) ──────────────────
const oauthStates = new Map<string, number>();

// ── Throttle para endpoint de teste de email (60s por tipo+customer+destino) ──
const testeEmailThrottle = new Map<string, number>();
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
      const { total: products } = await syncProducts();
      const stock = await syncStock();
      const nfEntrada = await syncNfEntrada();
      const contasPagar = await syncContasPagar();

      // Sync categorias→produtos (mapeia qual produto pertence a qual categoria)
      try {
        const { getValidToken } = await import("../integrations/bling/auth");
        const token = await getValidToken();
        const categoryMap = await fetchCategoryMap(token, true);
        const catUpdated = await syncProductCategories(token, categoryMap);
        logger.info("Sync categorias→produtos finalizado", { catUpdated });
      } catch (catErr: any) {
        logger.warn("Sync categorias→produtos falhou", { error: catErr.message });
      }

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

// ── POST /api/sync/bling/categorias — sync categorias→produtos ──

syncRouter.post("/bling/categorias", authMiddleware, async (req: Request, res: Response) => {
  logger.info("Sync categorias→produtos iniciado", { user: (req as any).user?.email });
  res.json({ message: "Sync categorias→produtos iniciado em background." });

  try {
    const { getValidToken } = await import("../integrations/bling/auth");
    const token = await getValidToken();
    const categoryMap = await fetchCategoryMap(token, true);
    const updated = await syncProductCategories(token, categoryMap);
    logger.info("Sync categorias→produtos finalizado", { updated, categorias: categoryMap.size });
  } catch (err: any) {
    logger.error("Sync categorias→produtos falhou", { error: err.message });
  }
});

// ── POST /api/sync/bling/imagens — busca imagens HD via detalhe do produto ──
// O sync por listing só salva miniaturas (/t/). Este endpoint faz GET /produtos/{id}
// para cada produto sem imagem HD e atualiza com a URL completa (link do S3 sem /t/).
// Passa blingIds[] no body para processar apenas produtos específicos (opcional).

syncRouter.post("/bling/imagens", authMiddleware, async (req: Request, res: Response) => {
  const { blingIds } = req.body as { blingIds?: string[] }
  logger.info("Sync imagens HD iniciado", { user: (req as any).user?.email, blingIds: blingIds?.length ?? "todos" });
  res.json({ message: "Sync imagens HD iniciado em background. Acompanhe pelos logs." });

  try {
    const result = await syncProductImages(blingIds)
    logger.info("Sync imagens HD finalizado", result)
  } catch (err: any) {
    logger.error("Sync imagens HD falhou", { error: err.message })
  }
});

// ── POST /api/sync/bling/gtins — backfill GTIN via detalhe do produto ──
// O listing do Bling não retorna gtin (ProdutosDadosBaseDTO). Somente
// GET /produtos/{id} retorna o gtin (ProdutosDados). Este endpoint faz
// o backfill para todos os produtos com gtin IS NULL.
// Passa blingIds[] no body para processar apenas produtos específicos.

syncRouter.post("/bling/gtins", authMiddleware, async (req: Request, res: Response) => {
  const { blingIds } = req.body as { blingIds?: string[] };
  logger.info("Sync GTINs iniciado", { user: (req as any).user?.email, blingIds: blingIds?.length ?? "todos" });
  res.json({ message: "Sync GTINs iniciado em background. Acompanhe pelos logs." });

  try {
    const result = await syncProductGtins(blingIds);
    logger.info("Sync GTINs finalizado", result);
  } catch (err: any) {
    logger.error("Sync GTINs falhou", { error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════
// NUVEMSHOP
// ══════════════════════════════════════════════════════════════

// ── POST /api/sync/bling/logistica — sync remessas e objetos logísticos ──

syncRouter.post("/bling/logistica", authMiddleware, async (req: Request, res: Response) => {
  const { logisticaId } = req.body as { logisticaId?: number };
  logger.info("Sync logística Bling iniciado", { user: (req as any).user?.email, logisticaId });
  res.json({ message: "Sync de objetos logísticos iniciado em background." });

  try {
    const result = await syncLogisticaObjetos(logisticaId);
    logger.info("Sync logística concluído", result);
  } catch (err: any) {
    logger.error("Erro no sync de logística", { error: err.message });
  }
});

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

// ── POST /api/sync/nuvemshop/produtos — cache completo de produtos NS ─
// Pagina todos os produtos publicados da NuvemShop e popula sync.nuvemshop_products.
// Necessário para que fetchProductUrls() resolva URLs sem chamar a API produto a produto.

syncRouter.post("/nuvemshop/produtos", authMiddleware, async (_req: Request, res: Response) => {
  const token = await getNuvemShopToken();
  if (!token) {
    res.status(400).json({ error: "NuvemShop não conectada. Autorize primeiro." });
    return;
  }

  logger.info("Sync produtos NuvemShop (cache URLs) iniciado em background");
  res.json({ message: "Sync de produtos NuvemShop iniciado em background. Acompanhe pelos logs." });

  try {
    const total = await syncNsProducts();
    logger.info("Sync produtos NuvemShop concluído", { total });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro";
    logger.error("Sync produtos NuvemShop falhou", { error: message });
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
// Auto-refresh: se faltam menos de 5 dias para expirar, renova automaticamente
syncRouter.get("/internal/melhorenvio-token", async (_req: Request, res: Response) => {
  try {
    const row = await queryOne<{ ultimo_id: string }>(
      "SELECT ultimo_id FROM sync.sync_state WHERE fonte = 'melhorenvio'"
    );

    if (!row?.ultimo_id) {
      res.status(404).json({ error: "Token Melhor Envio não encontrado" });
      return;
    }

    let tokenData = JSON.parse(row.ultimo_id);

    // Auto-refresh: se expira em menos de 5 dias, renovar
    const expiresAt = tokenData.expires_at ? new Date(tokenData.expires_at).getTime() : 0;
    const fiveDaysMs = 5 * 24 * 60 * 60 * 1000;

    if (expiresAt > 0 && expiresAt - Date.now() < fiveDaysMs && tokenData.refresh_token) {
      logger.info("Melhor Envio: token expira em breve, renovando automaticamente");
      try {
        const axios = (await import("axios")).default;
        const refreshRes = await axios.post(
          "https://melhorenvio.com.br/oauth/token",
          {
            grant_type: "refresh_token",
            client_id: process.env.ME_CLIENT_ID,
            client_secret: process.env.ME_CLIENT_SECRET,
            refresh_token: tokenData.refresh_token,
          },
          { headers: { "Accept": "application/json" }, timeout: 15000 }
        );

        const newToken = refreshRes.data;
        const newData = {
          access_token: newToken.access_token,
          refresh_token: newToken.refresh_token,
          expires_in: newToken.expires_in,
          expires_at: new Date(Date.now() + newToken.expires_in * 1000).toISOString(),
          connected_at: tokenData.connected_at,
          refreshed_at: new Date().toISOString(),
        };

        await query(
          "UPDATE sync.sync_state SET ultimo_id = $1 WHERE fonte = 'melhorenvio'",
          [JSON.stringify(newData)]
        );

        tokenData = newData;
        logger.info(`Melhor Envio: token renovado, expira em ${newData.expires_at}`);
      } catch (refreshErr: any) {
        logger.error(`Melhor Envio: falha no refresh do token: ${refreshErr.message}`);
        // Retorna o token atual mesmo se o refresh falhou
      }
    }

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

    // Após responder, enviar email de confirmação
    sendOrderConfirmationEmail({
      email: order.email,
      display_id: order.display_id || numero,
      total: order.total || 0,
      subtotal: order.subtotal,
      shipping_total: order.shipping_total,
      items: order.items,
      shipping_address: order.shipping_address,
      shipping_method: order.shipping_method,
      payment_method: order.payment_method || "Pix",
    }).catch((err: unknown) => {
      logger.warn(`Email confirmação pedido ${numero} falhou: ${err instanceof Error ? err.message : "erro"}`);
    });

    // Tentar gerar etiqueta
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

// ── POST /api/internal/medusa-payment — notificação de pagamento aprovado ──

syncRouter.post("/internal/medusa-payment", async (req: Request, res: Response) => {
  const { email, display_id, total, payment_method } = req.body;

  if (!email || !display_id) {
    res.status(400).json({ error: "email e display_id obrigatórios" });
    return;
  }

  logger.info(`Medusa → payment approved: pedido #${display_id} email=${email}`);

  sendPaymentApprovedEmail({
    email,
    display_id,
    total: total || 0,
    payment_method: payment_method || "Pix",
  }).catch((err: unknown) => {
    logger.warn(`Email pagamento pedido #${display_id} falhou: ${err instanceof Error ? err.message : "erro"}`);
  });

  // Notificar admin
  const adminEmail = process.env.ADMIN_EMAIL || "contato@papelariabibelo.com.br";
  if (adminEmail !== email) {
    sendPaymentApprovedEmail({
      email: adminEmail,
      display_id,
      total: total || 0,
      payment_method: payment_method || "Pix",
    }).catch(() => {});
  }

  res.json({ ok: true });
});

// ── POST /api/internal/medusa-shipping — notificação de envio com rastreio ──

syncRouter.post("/internal/medusa-shipping", async (req: Request, res: Response) => {
  const { email, display_id, tracking_code, carrier, tracking_url } = req.body;

  if (!email || !display_id || !tracking_code) {
    res.status(400).json({ error: "email, display_id e tracking_code obrigatórios" });
    return;
  }

  logger.info(`Medusa → shipping: pedido #${display_id} rastreio=${tracking_code} email=${email}`);

  sendShippingEmail({
    email,
    display_id,
    tracking_code,
    carrier: carrier || "Correios",
    tracking_url,
  }).catch((err: unknown) => {
    logger.warn(`Email envio pedido #${display_id} falhou: ${err instanceof Error ? err.message : "erro"}`);
  });

  res.json({ ok: true });
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

// ── POST /api/sync/waha/vip — sync membros grupo VIP WhatsApp ──

syncRouter.post("/waha/vip", authMiddleware, async (_req: Request, res: Response) => {
  logger.info("Sync WAHA VIP manual iniciado");
  res.json({ message: "Sync VIP iniciado em background. Acompanhe pelos logs." });

  try {
    const result = await syncWahaVipBulk();
    logger.info("Sync WAHA VIP concluído", result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro";
    logger.error("Sync WAHA VIP falhou", { error: message });
  }
});

// ── GET /api/email/preview/:tipo/:customerId ────────────────────
// Retorna o HTML do email gerado para o cliente, sem enviar.
// Útil para visualizar o template com dados reais antes de disparar.

syncRouter.get("/email/preview/:tipo/:customerId", authMiddleware, async (req: Request, res: Response) => {
  const { tipo, customerId } = req.params;

  const customer = await queryOne<{ id: string; nome: string; email: string | null; telefone: string | null; estado: string | null }>(
    "SELECT id, nome, email, telefone, estado FROM crm.customers WHERE id = $1",
    [customerId]
  ).catch(() => null);

  if (!customer) {
    res.status(404).json({ error: "Cliente não encontrado" });
    return;
  }

  try {
    const regiao = detectarRegiao({ estado: customer.estado, telefone: customer.telefone });
    const metadata: Record<string, unknown> = { customer_id: customerId };
    const html = await buildFlowEmail(customer.nome, tipo, metadata, regiao);
    const subject = getFlowSubject(tipo, customer.nome, metadata);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("X-Email-Subject", Buffer.from(subject).toString("base64"));
    res.send(html);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro";
    logger.error("Erro ao gerar preview de email", { tipo, customerId, error: message });
    res.status(500).json({ error: "Erro ao gerar preview", detalhe: message });
  }
});

// ── POST /api/email/teste/:tipo/:customerId ─────────────────────
// Envia o email para contato@papelariabibelo.com.br (nunca para o cliente real).
// Body opcional: { metadata: {}, para: "outro@dominio.com" }
// ?para= query param também aceito (apenas emails @papelariabibelo.com.br ou do admin).

syncRouter.post("/email/teste/:tipo/:customerId", authMiddleware, async (req: Request, res: Response) => {
  const { tipo, customerId } = req.params;
  const extraMetadata = (req.body?.metadata as Record<string, unknown>) || {};

  const customer = await queryOne<{ id: string; nome: string; email: string | null; telefone: string | null; estado: string | null }>(
    "SELECT id, nome, email, telefone, estado FROM crm.customers WHERE id = $1",
    [customerId]
  ).catch(() => null);

  if (!customer) {
    res.status(404).json({ error: "Cliente não encontrado" });
    return;
  }

  const ALLOWED_DOMAINS = ["papelariabibelo.com.br", "gmail.com"];
  const ADMIN_EMAILS = ["carloseduardocostatj@gmail.com", "carlos.macedo@unifique.com.br"];
  const paraRaw = (req.body?.para as string) || (req.query?.para as string) || "";
  const isAllowedEmail = paraRaw && (
    ALLOWED_DOMAINS.some(d => paraRaw.endsWith(`@${d}`)) ||
    ADMIN_EMAILS.includes(paraRaw)
  );
  const TESTE_EMAIL = isAllowedEmail ? paraRaw : "contato@papelariabibelo.com.br";

  // Idempotência: não reenviar o mesmo email de teste nos últimos 60s
  const throttleKey = `${tipo}:${customerId}:${TESTE_EMAIL}`;
  const lastSent = testeEmailThrottle.get(throttleKey);
  if (lastSent && Date.now() - lastSent < 60_000) {
    res.status(429).json({ error: "Email de teste já enviado nos últimos 60s. Aguarde antes de reenviar." });
    return;
  }
  testeEmailThrottle.set(throttleKey, Date.now());

  try {
    const regiao = detectarRegiao({ estado: customer.estado, telefone: customer.telefone });
    const metadata: Record<string, unknown> = { customer_id: customerId, ...extraMetadata };
    const html = await buildFlowEmail(customer.nome, tipo, metadata, regiao);
    const subject = getFlowSubject(tipo, customer.nome, metadata);

    const result = await sendEmail({
      to: TESTE_EMAIL,
      subject: `[TESTE] ${subject}`,
      html,
      tags: [{ name: "type", value: "email_teste" }],
    });

    logger.info("Email de teste enviado", { tipo, customerId, messageId: result?.id, para: TESTE_EMAIL });
    res.json({ ok: true, messageId: result?.id, para: TESTE_EMAIL, assunto: subject });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro";
    logger.error("Erro ao enviar email de teste", { tipo, customerId, error: message });
    res.status(500).json({ error: "Erro ao enviar email de teste", detalhe: message });
  }
});
