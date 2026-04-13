import { Router, Request, Response } from "express";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth";
import { logger } from "../utils/logger";
import { query } from "../db";
import {
  isMetaConfigured,
  getAdAccountId,
  getAccountInfo,
  getCampaigns,
  getInsights,
  periodoToRange,
  extractAction,
  metaGet,
} from "../integrations/meta/client";
import { syncMetaAds } from "../services/meta.service";
import { syncAudiences, listAudiences, AUDIENCE_SEGMENTS } from "../integrations/meta/audiences";

export const metaAdsRouter = Router();
metaAdsRouter.use(authMiddleware);

const periodoSchema = z.object({
  periodo: z.enum(["1d", "3d", "7d", "15d", "30d", "3m"]).default("7d"),
});

// ── Status da conexão ─────────────────────────────────────────

metaAdsRouter.get("/status", async (_req: Request, res: Response) => {
  if (!isMetaConfigured()) {
    res.json({ connected: false, message: "Meta Ads não configurado — adicione META_ACCESS_TOKEN e META_AD_ACCOUNT_ID no .env" });
    return;
  }

  try {
    const account = await getAccountInfo();
    res.json({ connected: true, account });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    logger.error("Meta Ads status erro", { error: msg });
    res.json({ connected: false, error: msg });
  }
});

// ── Overview (KPIs + dados diários) ──────────────────────────

metaAdsRouter.get("/overview", async (req: Request, res: Response) => {
  if (!isMetaConfigured()) {
    res.status(503).json({ error: "Meta Ads não configurado" });
    return;
  }

  const parse = periodoSchema.safeParse(req.query);
  if (!parse.success) {
    res.status(400).json({ error: "Período inválido" });
    return;
  }

  try {
    const range = periodoToRange(parse.data.periodo);
    const accountId = getAdAccountId();

    // KPIs agregados + dados diários em paralelo
    const [insights, daily] = await Promise.all([
      getInsights(accountId, { time_range: range }),
      getInsights(accountId, {
        time_range: range,
        time_increment: "1",
        fields: "spend,impressions,clicks,reach,actions",
      }),
    ]);

    const kpi = insights[0] || null;

    // Extrair métricas de ações (conversões)
    let conversoes = null;
    if (kpi) {
      conversoes = {
        compras: extractAction(kpi.actions, "purchase"),
        add_to_cart: extractAction(kpi.actions, "add_to_cart"),
        checkout: extractAction(kpi.actions, "initiate_checkout"),
        leads: extractAction(kpi.actions, "lead"),
        link_clicks: extractAction(kpi.actions, "link_click"),
        page_views: extractAction(kpi.actions, "landing_page_view"),
        roas: kpi.purchase_roas?.[0]?.value ? parseFloat(kpi.purchase_roas[0].value) : 0,
      };
    }

    res.json({ kpis: kpi, conversoes, daily });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro";
    logger.error("Meta Ads overview erro", { error: msg });
    res.status(500).json({ error: msg });
  }
});

// ── Campanhas com insights ───────────────────────────────────

metaAdsRouter.get("/campaigns", async (req: Request, res: Response) => {
  if (!isMetaConfigured()) {
    res.status(503).json({ error: "Meta Ads não configurado" });
    return;
  }

  const parse = periodoSchema.safeParse(req.query);
  if (!parse.success) {
    res.status(400).json({ error: "Período inválido" });
    return;
  }

  try {
    const range = periodoToRange(parse.data.periodo);
    const accountId = getAdAccountId();

    const [campaigns, insights] = await Promise.all([
      getCampaigns(),
      getInsights(accountId, {
        time_range: range,
        level: "campaign",
        fields: "campaign_id,campaign_name,spend,impressions,reach,clicks,ctr,cpc,cpm,actions,purchase_roas",
      }),
    ]);

    // Mapear insights por campaign_id
    const insightsMap = new Map(
      insights.map((i) => [i.campaign_id, i]),
    );

    const merged = campaigns.map((c) => ({
      ...c,
      insights: insightsMap.get(c.id) || null,
    }));

    res.json(merged);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro";
    logger.error("Meta Ads campaigns erro", { error: msg });
    res.status(500).json({ error: msg });
  }
});

// ── Demográfico (idade + gênero) ─────────────────────────────

metaAdsRouter.get("/demographics", async (req: Request, res: Response) => {
  if (!isMetaConfigured()) {
    res.status(503).json({ error: "Meta Ads não configurado" });
    return;
  }

  const parse = periodoSchema.safeParse(req.query);
  if (!parse.success) {
    res.status(400).json({ error: "Período inválido" });
    return;
  }

  try {
    const range = periodoToRange(parse.data.periodo);
    const accountId = getAdAccountId();

    const data = await getInsights(accountId, {
      time_range: range,
      breakdowns: "age,gender",
      fields: "spend,impressions,clicks,reach,actions,ctr,cpc",
    });

    res.json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro";
    logger.error("Meta Ads demographics erro", { error: msg });
    res.status(500).json({ error: msg });
  }
});

// ── Geográfico (por região/estado) ───────────────────────────

metaAdsRouter.get("/geographic", async (req: Request, res: Response) => {
  if (!isMetaConfigured()) {
    res.status(503).json({ error: "Meta Ads não configurado" });
    return;
  }

  const parse = periodoSchema.safeParse(req.query);
  if (!parse.success) {
    res.status(400).json({ error: "Período inválido" });
    return;
  }

  try {
    const range = periodoToRange(parse.data.periodo);
    const accountId = getAdAccountId();

    const data = await getInsights(accountId, {
      time_range: range,
      breakdowns: "region",
      fields: "spend,impressions,clicks,reach,actions,ctr,cpc",
    });

    res.json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro";
    logger.error("Meta Ads geographic erro", { error: msg });
    res.status(500).json({ error: msg });
  }
});

// ── Plataformas (Facebook, Instagram, etc.) ──────────────────

metaAdsRouter.get("/platforms", async (req: Request, res: Response) => {
  if (!isMetaConfigured()) {
    res.status(503).json({ error: "Meta Ads não configurado" });
    return;
  }

  const parse = periodoSchema.safeParse(req.query);
  if (!parse.success) {
    res.status(400).json({ error: "Período inválido" });
    return;
  }

  try {
    const range = periodoToRange(parse.data.periodo);
    const accountId = getAdAccountId();

    const data = await getInsights(accountId, {
      time_range: range,
      breakdowns: "publisher_platform",
      fields: "spend,impressions,clicks,reach,ctr,cpc,cpm,actions",
    });

    res.json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro";
    logger.error("Meta Ads platforms erro", { error: msg });
    res.status(500).json({ error: msg });
  }
});

// ══════════════════════════════════════════════════════════════
// ENDPOINTS COM DADOS DO BANCO (histórico persistido)
// ══════════════════════════════════════════════════════════════

// ── Sync manual ──────────────────────────────────────────────

metaAdsRouter.post("/sync", async (_req: Request, res: Response) => {
  if (!isMetaConfigured()) {
    res.status(503).json({ error: "Meta Ads não configurado" });
    return;
  }

  try {
    const result = await syncMetaAds();
    res.json({ ok: true, ...result });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro";
    logger.error("Meta Ads sync manual erro", { error: msg });
    res.status(500).json({ error: msg });
  }
});

// ── Histórico de insights do banco ───────────────────────────

const historicoSchema = z.object({
  periodo: z.enum(["1d", "3d", "7d", "15d", "30d", "3m", "6m", "1a"]).default("30d"),
});

function periodoDias(p: string): number {
  const map: Record<string, number> = { "1d": 1, "3d": 3, "7d": 7, "15d": 15, "30d": 30, "3m": 90, "6m": 180, "1a": 365 };
  return map[p] || 30;
}

metaAdsRouter.get("/historico/diario", async (req: Request, res: Response) => {
  const parse = historicoSchema.safeParse(req.query);
  if (!parse.success) { res.status(400).json({ error: "Período inválido" }); return; }

  const dias = periodoDias(parse.data.periodo);
  const data = await query(
    `SELECT data, investimento, impressoes, alcance, cliques, ctr, cpc, cpm, compras, roas
     FROM marketing.meta_insights_account
     WHERE data >= CURRENT_DATE - make_interval(days => $1)
     ORDER BY data`,
    [dias]
  );
  res.json(data);
});

metaAdsRouter.get("/historico/campanhas", async (req: Request, res: Response) => {
  const parse = historicoSchema.safeParse(req.query);
  if (!parse.success) { res.status(400).json({ error: "Período inválido" }); return; }

  const dias = periodoDias(parse.data.periodo);
  const data = await query(
    `SELECT c.id, c.nome, c.status, c.objetivo,
            COALESCE(SUM(i.investimento), 0) as investimento,
            COALESCE(SUM(i.impressoes), 0) as impressoes,
            COALESCE(SUM(i.alcance), 0) as alcance,
            COALESCE(SUM(i.cliques), 0) as cliques,
            CASE WHEN SUM(i.impressoes) > 0 THEN ROUND(SUM(i.cliques)::numeric / SUM(i.impressoes) * 100, 2) ELSE 0 END as ctr,
            CASE WHEN SUM(i.cliques) > 0 THEN ROUND(SUM(i.investimento) / SUM(i.cliques), 4) ELSE 0 END as cpc,
            COALESCE(SUM(i.compras), 0) as compras,
            COALESCE(SUM(i.leads), 0) as leads,
            COALESCE(SUM(i.link_clicks), 0) as link_clicks
     FROM marketing.meta_campaigns c
     LEFT JOIN marketing.meta_insights_daily i ON i.campaign_id = c.id AND i.data >= CURRENT_DATE - make_interval(days => $1)
     GROUP BY c.id, c.nome, c.status, c.objetivo
     ORDER BY investimento DESC`,
    [dias]
  );
  res.json(data);
});

metaAdsRouter.get("/historico/demografico", async (req: Request, res: Response) => {
  const parse = historicoSchema.safeParse(req.query);
  if (!parse.success) { res.status(400).json({ error: "Período inválido" }); return; }

  const dias = periodoDias(parse.data.periodo);
  const data = await query(
    `SELECT faixa_etaria, genero,
            SUM(investimento) as investimento,
            SUM(impressoes) as impressoes,
            SUM(alcance) as alcance,
            SUM(cliques) as cliques,
            CASE WHEN SUM(impressoes) > 0 THEN ROUND(SUM(cliques)::numeric / SUM(impressoes) * 100, 2) ELSE 0 END as ctr,
            CASE WHEN SUM(cliques) > 0 THEN ROUND(SUM(investimento) / SUM(cliques), 4) ELSE 0 END as cpc
     FROM marketing.meta_demographics
     WHERE data >= CURRENT_DATE - make_interval(days => $1)
     GROUP BY faixa_etaria, genero
     ORDER BY faixa_etaria, genero`,
    [dias]
  );
  res.json(data);
});

metaAdsRouter.get("/historico/geografico", async (req: Request, res: Response) => {
  const parse = historicoSchema.safeParse(req.query);
  if (!parse.success) { res.status(400).json({ error: "Período inválido" }); return; }

  const dias = periodoDias(parse.data.periodo);
  const data = await query(
    `SELECT regiao,
            SUM(investimento) as investimento,
            SUM(impressoes) as impressoes,
            SUM(alcance) as alcance,
            SUM(cliques) as cliques,
            CASE WHEN SUM(impressoes) > 0 THEN ROUND(SUM(cliques)::numeric / SUM(impressoes) * 100, 2) ELSE 0 END as ctr,
            CASE WHEN SUM(cliques) > 0 THEN ROUND(SUM(investimento) / SUM(cliques), 4) ELSE 0 END as cpc
     FROM marketing.meta_geographic
     WHERE data >= CURRENT_DATE - make_interval(days => $1)
     GROUP BY regiao
     ORDER BY investimento DESC`,
    [dias]
  );
  res.json(data);
});

metaAdsRouter.get("/historico/plataformas", async (req: Request, res: Response) => {
  const parse = historicoSchema.safeParse(req.query);
  if (!parse.success) { res.status(400).json({ error: "Período inválido" }); return; }

  const dias = periodoDias(parse.data.periodo);
  const data = await query(
    `SELECT plataforma,
            SUM(investimento) as investimento,
            SUM(impressoes) as impressoes,
            SUM(alcance) as alcance,
            SUM(cliques) as cliques,
            CASE WHEN SUM(impressoes) > 0 THEN ROUND(SUM(cliques)::numeric / SUM(impressoes) * 100, 2) ELSE 0 END as ctr,
            CASE WHEN SUM(cliques) > 0 THEN ROUND(SUM(investimento) / SUM(cliques), 4) ELSE 0 END as cpc
     FROM marketing.meta_platforms
     WHERE data >= CURRENT_DATE - make_interval(days => $1)
     GROUP BY plataforma
     ORDER BY investimento DESC`,
    [dias]
  );
  res.json(data);
});

// ══════════════════════════════════════════════════════════════
// CUSTOM AUDIENCES — Fase 2
// ══════════════════════════════════════════════════════════════

// ── Listar audiências ────────────────────────────────────────

metaAdsRouter.get("/audiences", async (_req: Request, res: Response) => {
  if (!isMetaConfigured()) {
    res.status(503).json({ error: "Meta Ads não configurado" });
    return;
  }
  try {
    const audiences = await listAudiences();
    // Enriquecer com contagem local de usuários por segmento
    const segmentCounts = await Promise.all(
      AUDIENCE_SEGMENTS.map(async (s) => {
        const [row] = await query<{ total: string }>(
          `SELECT COUNT(*)::text as total FROM (${
            // Extrair a query do segmento via queryFn e contar
            // Usa uma subquery wrapper para contar sem buscar os dados
            s.nome.includes("Leads")
              ? "SELECT email FROM marketing.leads WHERE email_verificado = true AND convertido = false"
              : s.nome.includes("Inativos")
              ? "SELECT c.email FROM crm.customers c INNER JOIN crm.customer_scores cs ON cs.customer_id = c.id WHERE c.email IS NOT NULL AND cs.total_pedidos > 0 AND cs.ultima_compra < NOW() - INTERVAL '90 days'"
              : s.nome.includes("Recentes")
              ? "SELECT c.email FROM crm.customers c INNER JOIN crm.customer_scores cs ON cs.customer_id = c.id WHERE c.email IS NOT NULL AND cs.ultima_compra >= NOW() - INTERVAL '30 days'"
              : "SELECT c.email FROM crm.customers c INNER JOIN crm.customer_scores cs ON cs.customer_id = c.id WHERE c.email IS NOT NULL AND cs.total_pedidos > 0"
          }) sub`,
        );
        return { nome: s.nome, total_crm: parseInt(row?.total || "0") };
      }),
    );
    res.json({ audiences, segmentCounts });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro";
    logger.error("Meta Audiences list erro", { error: msg });
    res.status(500).json({ error: msg });
  }
});

// ── Sincronizar audiências ───────────────────────────────────

metaAdsRouter.post("/audiences/sync", async (_req: Request, res: Response) => {
  if (!isMetaConfigured()) {
    res.status(503).json({ error: "Meta Ads não configurado" });
    return;
  }
  try {
    logger.info("Meta Audiences: sync manual iniciado");
    const results = await syncAudiences();
    const ok = results.filter((r) => !r.erro).length;
    const erros = results.filter((r) => r.erro).length;
    res.json({ ok: true, sincronizados: ok, erros, results });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro";
    logger.error("Meta Audiences sync erro", { error: msg });
    res.status(500).json({ error: msg });
  }
});

// ── Diagnóstico do Pixel ─────────────────────────────────────

metaAdsRouter.get("/pixel/diagnostico", async (_req: Request, res: Response) => {
  if (!isMetaConfigured()) {
    res.status(503).json({ error: "Meta Ads não configurado" });
    return;
  }

  const PIXEL_ID = process.env.META_PIXEL_ID || "1380166206444041";
  const EVENTOS_ESPERADOS = ["PageView", "ViewContent", "AddToCart", "InitiateCheckout", "Purchase"];

  try {
    // Buscar stats das últimas 24h por evento
    const statsData = await metaGet<{ data: Array<{ aggregation: string; data: Array<{ value: string; count: number }> }> }>(
      `/${PIXEL_ID}/stats`,
      { aggregation: "event" }
    );

    // Consolidar contagens por evento
    const contagens: Record<string, number> = {};
    for (const hora of statsData.data || []) {
      for (const ev of hora.data || []) {
        contagens[ev.value] = (contagens[ev.value] || 0) + ev.count;
      }
    }

    // Montar status semáforo
    const eventos = EVENTOS_ESPERADOS.map((nome) => {
      const count = contagens[nome] || 0;
      let status: "verde" | "amarelo" | "vermelho";
      if (nome === "PageView" || nome === "ViewContent") {
        status = count > 0 ? "verde" : "vermelho";
      } else {
        // AddToCart, InitiateCheckout, Purchase — esperado menos tráfego
        status = count > 0 ? "verde" : "amarelo";
      }
      return { nome, count, status };
    });

    // Também buscar last_fired_time do pixel
    const pixelInfo = await metaGet<{ last_fired_time?: string; is_unavailable?: boolean }>(
      `/${PIXEL_ID}`,
      { fields: "last_fired_time,is_unavailable" }
    );

    const semaforo = eventos.every((e) => e.status !== "vermelho")
      ? "verde"
      : eventos.some((e) => e.status === "vermelho" && ["AddToCart", "InitiateCheckout", "Purchase"].includes(e.nome))
      ? "amarelo"
      : "vermelho";

    res.json({
      pixel_id: PIXEL_ID,
      ultimo_disparo: pixelInfo.last_fired_time || null,
      ativo: !pixelInfo.is_unavailable,
      semaforo,
      eventos,
      outros_eventos: Object.entries(contagens)
        .filter(([nome]) => !EVENTOS_ESPERADOS.includes(nome))
        .map(([nome, count]) => ({ nome, count })),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro";
    logger.error("Meta Ads pixel diagnostico erro", { error: msg });
    res.status(500).json({ error: msg });
  }
});

// ── Status do sync ───────────────────────────────────────────

metaAdsRouter.get("/sync-status", async (_req: Request, res: Response) => {
  const [lastSync] = await query<{ criado_em: string; status: string; registros: number }>(
    `SELECT criado_em, status, registros FROM sync.sync_logs
     WHERE tipo = 'meta-ads-sync' ORDER BY criado_em DESC LIMIT 1`
  );

  const [totalRows] = await query<{ total: string }>(
    `SELECT (
       (SELECT COUNT(*) FROM marketing.meta_insights_daily) +
       (SELECT COUNT(*) FROM marketing.meta_demographics) +
       (SELECT COUNT(*) FROM marketing.meta_geographic) +
       (SELECT COUNT(*) FROM marketing.meta_platforms)
     )::text as total`
  );

  const [campaigns] = await query<{ total: string }>(
    `SELECT COUNT(*)::text as total FROM marketing.meta_campaigns`
  );

  res.json({
    ultimo_sync: lastSync || null,
    total_registros: parseInt(totalRows?.total || "0"),
    total_campanhas: parseInt(campaigns?.total || "0"),
  });
});
