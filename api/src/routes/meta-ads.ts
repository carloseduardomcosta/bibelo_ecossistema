import { Router, Request, Response } from "express";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth";
import { logger } from "../utils/logger";
import {
  isMetaConfigured,
  getAdAccountId,
  getAccountInfo,
  getCampaigns,
  getInsights,
  periodoToRange,
  extractAction,
} from "../integrations/meta/client";

export const metaAdsRouter = Router();
metaAdsRouter.use(authMiddleware);

const periodoSchema = z.object({
  periodo: z.enum(["7d", "15d", "30d", "3m"]).default("7d"),
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
