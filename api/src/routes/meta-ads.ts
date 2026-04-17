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
import {
  criarCampanhaCompleta,
  atualizarStatusCampanha,
  arquivarCampanha,
  type CampanhaObjetivo,
  type CampanhaCTA,
} from "../integrations/meta/campaigns";

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

// ── Fase 3: Criação de campanhas ──────────────────────────────

const criarCampanhaSchema = z.object({
  nome: z.string().min(3).max(100),
  objetivo: z.enum(["OUTCOME_SALES", "OUTCOME_TRAFFIC", "OUTCOME_AWARENESS"]),
  orcamentoDiario: z.number().min(5).max(10000),   // R$ 5 a R$ 10.000/dia
  dataInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dataFim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  publicoIds: z.array(z.string()).optional(),
  urlDestino: z.string().url(),
  imagemUrl: z.string().url(),
  titulo: z.string().min(1).max(40),
  texto: z.string().min(1).max(600),
  cta: z.enum(["SHOP_NOW", "LEARN_MORE", "SIGN_UP", "GET_OFFER"]).optional(),
  idadeMin: z.number().min(13).max(65).optional(),
  idadeMax: z.number().min(13).max(65).optional(),
});

// POST /api/meta-ads/campanhas/criar
metaAdsRouter.post("/campanhas/criar", async (req: Request, res: Response) => {
  if (!isMetaConfigured()) {
    res.status(503).json({ error: "Meta Ads não configurado" });
    return;
  }

  const parsed = criarCampanhaSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  try {
    const result = await criarCampanhaCompleta(parsed.data as Parameters<typeof criarCampanhaCompleta>[0]);
    logger.info("Meta Campaigns: campanha criada com sucesso", { campanhaId: result.campanhaId, nome: result.nome });
    res.json({ ok: true, ...result });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    logger.error("Meta Campaigns: falha ao criar campanha", { error: msg });
    res.status(500).json({ error: msg });
  }
});

// PUT /api/meta-ads/campanhas/:id/status
metaAdsRouter.put("/campanhas/:id/status", async (req: Request, res: Response) => {
  if (!isMetaConfigured()) {
    res.status(503).json({ error: "Meta Ads não configurado" });
    return;
  }

  const schema = z.object({ status: z.enum(["ACTIVE", "PAUSED"]) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "status deve ser ACTIVE ou PAUSED" });
    return;
  }

  try {
    await atualizarStatusCampanha(req.params.id, parsed.data.status);
    res.json({ ok: true, campanhaId: req.params.id, status: parsed.data.status });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    logger.error("Meta Campaigns: falha ao atualizar status", { error: msg });
    res.status(500).json({ error: msg });
  }
});

// DELETE /api/meta-ads/campanhas/:id
metaAdsRouter.delete("/campanhas/:id", async (req: Request, res: Response) => {
  if (!isMetaConfigured()) {
    res.status(503).json({ error: "Meta Ads não configurado" });
    return;
  }

  try {
    await arquivarCampanha(req.params.id);
    res.json({ ok: true, campanhaId: req.params.id });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    logger.error("Meta Campaigns: falha ao arquivar campanha", { error: msg });
    res.status(500).json({ error: msg });
  }
});

// ── Insights acumulativos de campanhas ────────────────────────

// GET /api/meta-ads/insights
metaAdsRouter.get("/insights", async (_req: Request, res: Response) => {
  const rows = await query<{
    id: string; tipo: string; categoria: string; impacto: string;
    titulo: string; descricao: string | null; campanha_ref: string | null;
    dados_json: Record<string, unknown> | null; criado_em: string;
  }>(
    `SELECT id, tipo, categoria, impacto, titulo, descricao, campanha_ref, dados_json, criado_em
     FROM marketing.meta_campaign_insights
     ORDER BY criado_em DESC
     LIMIT 100`
  );
  res.json({ insights: rows });
});

// POST /api/meta-ads/insights — adicionar insight manual
const insightManualSchema = z.object({
  categoria: z.enum(["publico", "criativo", "orcamento", "plataforma", "objetivo", "regiao", "geral"]),
  impacto: z.enum(["positivo", "negativo", "neutro", "dica"]),
  titulo: z.string().min(5).max(300),
  descricao: z.string().max(2000).optional(),
  campanha_ref: z.string().max(200).optional(),
});

metaAdsRouter.post("/insights", async (req: Request, res: Response) => {
  const parsed = insightManualSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { categoria, impacto, titulo, descricao, campanha_ref } = parsed.data;
  const [row] = await query<{ id: string }>(
    `INSERT INTO marketing.meta_campaign_insights (tipo, categoria, impacto, titulo, descricao, campanha_ref)
     VALUES ('manual', $1, $2, $3, $4, $5)
     RETURNING id`,
    [categoria, impacto, titulo, descricao || null, campanha_ref || null]
  );
  logger.info("Meta Insights: insight manual adicionado", { id: row.id, titulo });
  res.json({ ok: true, id: row.id });
});

// DELETE /api/meta-ads/insights/:id
metaAdsRouter.delete("/insights/:id", async (req: Request, res: Response) => {
  await query(`DELETE FROM marketing.meta_campaign_insights WHERE id = $1`, [req.params.id]);
  res.json({ ok: true });
});

// POST /api/meta-ads/insights/gerar — auto-gerar insights a partir dos dados do banco
metaAdsRouter.post("/insights/gerar", async (_req: Request, res: Response) => {
  const insights: Array<{
    categoria: string; impacto: string; titulo: string; descricao: string;
    campanha_ref?: string; dados_json: Record<string, unknown>;
  }> = [];

  try {
    // ── 1. Plataforma: Instagram vs Facebook ──────────────────
    const plat = await query<{ plataforma: string; gasto: number; ctr: number; cpc: number; cliques: number }>(
      `SELECT plataforma,
              ROUND(SUM(investimento)::numeric, 2) as gasto,
              ROUND(AVG(ctr)::numeric, 4) as ctr,
              ROUND(AVG(cpc)::numeric, 2) as cpc,
              SUM(cliques) as cliques
       FROM marketing.meta_platforms
       WHERE plataforma IN ('instagram','facebook')
       GROUP BY plataforma`
    );
    const ig = plat.find(p => p.plataforma === "instagram");
    const fb = plat.find(p => p.plataforma === "facebook");
    if (ig && fb && Number(ig.cpc) > 0 && Number(fb.cpc) > 0) {
      const melhor = Number(ig.cpc) < Number(fb.cpc) ? "Instagram" : "Facebook";
      const pior = melhor === "Instagram" ? "Facebook" : "Instagram";
      const melhorCpc = melhor === "Instagram" ? ig.cpc : fb.cpc;
      const piorCpc = melhor === "Instagram" ? fb.cpc : ig.cpc;
      insights.push({
        categoria: "plataforma",
        impacto: "positivo",
        titulo: `${melhor} mais eficiente: CPC R$ ${melhorCpc} vs R$ ${piorCpc} no ${pior}`,
        descricao: `Com base em ${ig.cliques + fb.cliques} cliques totais, ${melhor} entrega cliques mais baratos. Priorize ${melhor} na distribuição de orçamento ou use Advantage+ para otimização automática.`,
        dados_json: { instagram: ig, facebook: fb },
      });
    }

    // ── 2. Faixa etária feminina mais responsiva ──────────────
    const demo = await query<{ faixa_etaria: string; genero: string; gasto: number; ctr: number; cpc: number; cliques: number }>(
      `SELECT faixa_etaria, genero,
              ROUND(SUM(investimento)::numeric, 2) as gasto,
              ROUND(AVG(ctr)::numeric, 4) as ctr,
              ROUND(AVG(cpc)::numeric, 2) as cpc,
              SUM(cliques) as cliques
       FROM marketing.meta_demographics
       WHERE genero = 'female'
       GROUP BY faixa_etaria, genero
       HAVING SUM(cliques) > 0
       ORDER BY AVG(ctr) DESC`
    );
    if (demo.length >= 2) {
      const top = demo[0];
      insights.push({
        categoria: "publico",
        impacto: "positivo",
        titulo: `Mulheres ${top.faixa_etaria} têm CTR ${Number(top.ctr).toFixed(2)}% — maior engajamento`,
        descricao: `Esta faixa demonstrou o melhor CTR entre mulheres nas campanhas analisadas. Considere criar um AdSet específico para ${top.faixa_etaria} com orçamento dedicado e criativo focado neste perfil.`,
        dados_json: { top_faixas: demo.slice(0, 3) },
      });
    }

    // ── 3. Objetivo: TRÁFEGO vs VENDAS ──────────────────────
    const objs = await query<{ objetivo: string; ctr_medio: number; cpc_medio: number; total_gasto: number }>(
      `SELECT mc.objetivo,
              ROUND(AVG(mi.ctr)::numeric, 4) as ctr_medio,
              ROUND(AVG(mi.cpc)::numeric, 2) as cpc_medio,
              ROUND(SUM(mi.investimento)::numeric, 2) as total_gasto
       FROM marketing.meta_campaigns mc
       JOIN marketing.meta_insights_daily mi ON mi.campaign_id = mc.id
       GROUP BY mc.objetivo
       HAVING SUM(mi.investimento) > 0`
    );
    const trafego = objs.find(o => o.objetivo === "OUTCOME_TRAFFIC");
    const vendas = objs.find(o => o.objetivo === "OUTCOME_SALES");
    if (trafego && vendas) {
      insights.push({
        categoria: "objetivo",
        impacto: "dica",
        titulo: `Campanhas de TRÁFEGO geraram CTR ${Number(trafego.ctr_medio).toFixed(2)}% vs ${Number(vendas.ctr_medio).toFixed(2)}% de VENDAS`,
        descricao: `Objetivo Tráfego aquece público com custo menor. Estratégia recomendada: campanha de Tráfego para novos públicos → retargeting com Vendas para quem visitou o site. Use o Pixel para criar audiência personalizada de visitantes.`,
        dados_json: { trafego, vendas },
      });
    }

    // ── 4. Campanha com melhor CPC ────────────────────────────
    const melhorCamp = await query<{ nome: string; cpc_medio: number; cliques: number; objetivo: string }>(
      `SELECT mc.nome, mc.objetivo,
              ROUND(AVG(mi.cpc)::numeric, 2) as cpc_medio,
              SUM(mi.cliques) as cliques
       FROM marketing.meta_campaigns mc
       JOIN marketing.meta_insights_daily mi ON mi.campaign_id = mc.id
       GROUP BY mc.id, mc.nome, mc.objetivo
       HAVING SUM(mi.cliques) > 5
       ORDER BY AVG(mi.cpc) ASC
       LIMIT 1`
    );
    if (melhorCamp.length > 0) {
      const c = melhorCamp[0];
      insights.push({
        categoria: "criativo",
        impacto: "positivo",
        titulo: `"${c.nome.substring(0, 60)}" teve o menor CPC: R$ ${c.cpc_medio}`,
        descricao: `Com ${c.cliques} cliques a R$ ${c.cpc_medio} cada, este criativo/configuração foi o mais eficiente. Reutilize elementos desta campanha (imagem, copy, público) nas próximas.`,
        campanha_ref: c.nome,
        dados_json: { campanha: c },
      });
    }

    // ── 5. Região com melhor CTR ──────────────────────────────
    const regioes = await query<{ regiao: string; ctr: number; cliques: number }>(
      `SELECT regiao, ROUND(AVG(ctr)::numeric, 4) as ctr, SUM(cliques) as cliques
       FROM marketing.meta_geographic
       GROUP BY regiao
       HAVING SUM(cliques) > 2
       ORDER BY AVG(ctr) DESC
       LIMIT 3`
    );
    if (regioes.length > 0) {
      const topRegioes = regioes.map(r => `${r.regiao} (${Number(r.ctr).toFixed(1)}%)`).join(", ");
      insights.push({
        categoria: "regiao",
        impacto: "positivo",
        titulo: `Melhores regiões por CTR: ${topRegioes}`,
        descricao: `Estas regiões demonstraram maior engajamento com os anúncios. Considere criar campanhas geo-segmentadas para estas regiões com mensagens específicas (ex: frete grátis Sul/Sudeste).`,
        dados_json: { regioes },
      });
    }

    // ── Inserir apenas os que ainda não existem (por título) ──
    let novos = 0;
    for (const ins of insights) {
      const existing = await query(
        `SELECT id FROM marketing.meta_campaign_insights WHERE titulo = $1 AND tipo = 'automatico'`,
        [ins.titulo]
      );
      if (existing.length === 0) {
        await query(
          `INSERT INTO marketing.meta_campaign_insights
             (tipo, categoria, impacto, titulo, descricao, campanha_ref, dados_json)
           VALUES ('automatico', $1, $2, $3, $4, $5, $6)`,
          [ins.categoria, ins.impacto, ins.titulo, ins.descricao,
           ins.campanha_ref || null, JSON.stringify(ins.dados_json)]
        );
        novos++;
      }
    }

    logger.info("Meta Insights: insights automáticos gerados", { total: insights.length, novos });
    res.json({ ok: true, gerados: insights.length, novos });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    logger.error("Meta Insights: falha ao gerar insights", { error: msg });
    res.status(500).json({ error: msg });
  }
});
