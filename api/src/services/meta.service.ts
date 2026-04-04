import { query } from "../db";
import { logger } from "../utils/logger";
import {
  isMetaConfigured,
  getAdAccountId,
  getCampaigns,
  getInsights,
  extractAction,
  type MetaInsight,
} from "../integrations/meta/client";

// ── Sync completo: Meta → Banco ────────────────────────────────
// Puxa últimos 30 dias de dados e faz UPSERT no banco.
// Chamado pelo BullMQ a cada 6h + manual via API.

export async function syncMetaAds(): Promise<{
  campaigns: number;
  dailyInsights: number;
  demographics: number;
  geographic: number;
  platforms: number;
}> {
  if (!isMetaConfigured()) {
    logger.warn("Meta Ads sync ignorado — não configurado");
    return { campaigns: 0, dailyInsights: 0, demographics: 0, geographic: 0, platforms: 0 };
  }

  const accountId = getAdAccountId();
  const now = new Date();
  const since = new Date(now.getTime() - 30 * 86400000).toISOString().split("T")[0];
  const until = now.toISOString().split("T")[0];
  const range = { since, until };

  let campaignCount = 0;
  let dailyCount = 0;
  let demoCount = 0;
  let geoCount = 0;
  let platCount = 0;

  try {
    // ── 1. Sync campanhas ────────────────────────────────────
    const campaigns = await getCampaigns();
    for (const c of campaigns) {
      await query(
        `INSERT INTO marketing.meta_campaigns (id, nome, status, objetivo, orcamento_diario, orcamento_total, inicio_em, fim_em, criado_meta_em, atualizado_em)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
         ON CONFLICT (id) DO UPDATE SET
           nome = $2, status = $3, objetivo = $4, orcamento_diario = $5, orcamento_total = $6,
           inicio_em = $7, fim_em = $8, atualizado_em = NOW()`,
        [
          c.id,
          c.name,
          c.status,
          c.objective,
          c.daily_budget ? (parseFloat(c.daily_budget) / 100).toFixed(2) : null,
          c.lifetime_budget ? (parseFloat(c.lifetime_budget) / 100).toFixed(2) : null,
          c.start_time || null,
          c.stop_time || null,
          c.created_time || null,
        ]
      );
      campaignCount++;
    }

    // ── 2. Insights diários por campanha ─────────────────────
    const campaignInsights = await getInsights(accountId, {
      time_range: range,
      level: "campaign",
      time_increment: "1",
      fields: "campaign_id,campaign_name,spend,impressions,reach,clicks,ctr,cpc,cpm,actions,purchase_roas",
    });

    for (const ins of campaignInsights) {
      if (!ins.campaign_id) continue;

      // Garantir que a campanha existe
      await query(
        `INSERT INTO marketing.meta_campaigns (id, nome, status) VALUES ($1, $2, 'UNKNOWN')
         ON CONFLICT (id) DO NOTHING`,
        [ins.campaign_id, ins.campaign_name || ins.campaign_id]
      );

      const compras = extractAction(ins.actions, "purchase");
      const addToCart = extractAction(ins.actions, "add_to_cart");
      const checkout = extractAction(ins.actions, "initiate_checkout");
      const leads = extractAction(ins.actions, "lead");
      const linkClicks = extractAction(ins.actions, "link_click");
      const pageViews = extractAction(ins.actions, "landing_page_view");
      const roas = ins.purchase_roas?.[0]?.value ? parseFloat(ins.purchase_roas[0].value) : 0;

      await query(
        `INSERT INTO marketing.meta_insights_daily
           (campaign_id, data, investimento, impressoes, alcance, cliques, ctr, cpc, cpm,
            compras, add_to_cart, checkout, leads, link_clicks, page_views, roas, acoes, sincronizado_em)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW())
         ON CONFLICT (campaign_id, data) DO UPDATE SET
           investimento=$3, impressoes=$4, alcance=$5, cliques=$6, ctr=$7, cpc=$8, cpm=$9,
           compras=$10, add_to_cart=$11, checkout=$12, leads=$13, link_clicks=$14, page_views=$15,
           roas=$16, acoes=$17, sincronizado_em=NOW()`,
        [
          ins.campaign_id,
          ins.date_start,
          parseFloat(ins.spend || "0"),
          parseInt(ins.impressions || "0"),
          parseInt(ins.reach || "0"),
          parseInt(ins.clicks || "0"),
          parseFloat(ins.ctr || "0"),
          parseFloat(ins.cpc || "0"),
          parseFloat(ins.cpm || "0"),
          compras, addToCart, checkout, leads, linkClicks, pageViews, roas,
          JSON.stringify(ins.actions || []),
        ]
      );
      dailyCount++;
    }

    // ── 3. Insights conta por dia ────────────────────────────
    const accountDaily = await getInsights(accountId, {
      time_range: range,
      time_increment: "1",
      fields: "spend,impressions,reach,clicks,ctr,cpc,cpm,actions,purchase_roas",
    });

    for (const ins of accountDaily) {
      const compras = extractAction(ins.actions, "purchase");
      const roas = ins.purchase_roas?.[0]?.value ? parseFloat(ins.purchase_roas[0].value) : 0;

      await query(
        `INSERT INTO marketing.meta_insights_account
           (data, investimento, impressoes, alcance, cliques, ctr, cpc, cpm, compras, roas, sincronizado_em)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
         ON CONFLICT (data) DO UPDATE SET
           investimento=$2, impressoes=$3, alcance=$4, cliques=$5, ctr=$6, cpc=$7, cpm=$8,
           compras=$9, roas=$10, sincronizado_em=NOW()`,
        [
          ins.date_start,
          parseFloat(ins.spend || "0"),
          parseInt(ins.impressions || "0"),
          parseInt(ins.reach || "0"),
          parseInt(ins.clicks || "0"),
          parseFloat(ins.ctr || "0"),
          parseFloat(ins.cpc || "0"),
          parseFloat(ins.cpm || "0"),
          compras, roas,
        ]
      );
    }

    // ── 4. Breakdown demográfico ─────────────────────────────
    const demographics = await getInsights(accountId, {
      time_range: range,
      breakdowns: "age,gender",
      time_increment: "1",
      fields: "spend,impressions,reach,clicks,ctr,cpc",
    });

    for (const d of demographics) {
      await query(
        `INSERT INTO marketing.meta_demographics
           (data, faixa_etaria, genero, investimento, impressoes, alcance, cliques, ctr, cpc, sincronizado_em)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
         ON CONFLICT (data, faixa_etaria, genero) DO UPDATE SET
           investimento=$4, impressoes=$5, alcance=$6, cliques=$7, ctr=$8, cpc=$9, sincronizado_em=NOW()`,
        [
          d.date_start,
          d.age || "unknown",
          d.gender || "unknown",
          parseFloat(d.spend || "0"),
          parseInt(d.impressions || "0"),
          parseInt(d.reach || "0"),
          parseInt(d.clicks || "0"),
          parseFloat(d.ctr || "0"),
          parseFloat(d.cpc || "0"),
        ]
      );
      demoCount++;
    }

    // ── 5. Breakdown geográfico ──────────────────────────────
    const geographic = await getInsights(accountId, {
      time_range: range,
      breakdowns: "region",
      time_increment: "1",
      fields: "spend,impressions,reach,clicks,ctr,cpc",
    });

    for (const g of geographic) {
      await query(
        `INSERT INTO marketing.meta_geographic
           (data, regiao, investimento, impressoes, alcance, cliques, ctr, cpc, sincronizado_em)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
         ON CONFLICT (data, regiao) DO UPDATE SET
           investimento=$3, impressoes=$4, alcance=$5, cliques=$6, ctr=$7, cpc=$8, sincronizado_em=NOW()`,
        [
          g.date_start,
          (g.region || "Outro").replace(/, Brazil$/, "").replace(/State of /, ""),
          parseFloat(g.spend || "0"),
          parseInt(g.impressions || "0"),
          parseInt(g.reach || "0"),
          parseInt(g.clicks || "0"),
          parseFloat(g.ctr || "0"),
          parseFloat(g.cpc || "0"),
        ]
      );
      geoCount++;
    }

    // ── 6. Breakdown por plataforma ──────────────────────────
    const platforms = await getInsights(accountId, {
      time_range: range,
      breakdowns: "publisher_platform",
      time_increment: "1",
      fields: "spend,impressions,reach,clicks,ctr,cpc,cpm",
    });

    for (const p of platforms) {
      await query(
        `INSERT INTO marketing.meta_platforms
           (data, plataforma, investimento, impressoes, alcance, cliques, ctr, cpc, cpm, sincronizado_em)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
         ON CONFLICT (data, plataforma) DO UPDATE SET
           investimento=$3, impressoes=$4, alcance=$5, cliques=$6, ctr=$7, cpc=$8, cpm=$9, sincronizado_em=NOW()`,
        [
          p.date_start,
          p.publisher_platform || "unknown",
          parseFloat(p.spend || "0"),
          parseInt(p.impressions || "0"),
          parseInt(p.reach || "0"),
          parseInt(p.clicks || "0"),
          parseFloat(p.ctr || "0"),
          parseFloat(p.cpc || "0"),
          parseFloat(p.cpm || "0"),
        ]
      );
      platCount++;
    }

    logger.info("Meta Ads sync concluído", {
      campaigns: campaignCount,
      dailyInsights: dailyCount,
      demographics: demoCount,
      geographic: geoCount,
      platforms: platCount,
    });

    return {
      campaigns: campaignCount,
      dailyInsights: dailyCount,
      demographics: demoCount,
      geographic: geoCount,
      platforms: platCount,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    logger.error("Meta Ads sync falhou", { error: msg });
    throw err;
  }
}
