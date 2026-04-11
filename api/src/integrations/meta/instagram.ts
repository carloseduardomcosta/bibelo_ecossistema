import { metaGet } from "./client";
import { query, queryOne } from "../../db";
import { logger } from "../../utils/logger";

// ── Constantes ────────────────────────────────────────────────

const IG_USER_ID = "17841478800595116";

// ── Tipos ─────────────────────────────────────────────────────

export interface IgInsightValue {
  value: number;
  end_time: string;
}

export interface IgInsightMetric {
  name: string;
  period: string;
  values: IgInsightValue[];
  id: string;
}

export interface IgMedia {
  id: string;
  media_type: string;
  caption?: string;
  permalink?: string;
  thumbnail_url?: string;
  media_url?: string;
  timestamp: string;
  like_count: number;
  comments_count: number;
}

export interface IgMediaInsight {
  name: string;
  values?: Array<{ value: number }>;
  value?: number | Record<string, number>;
  id: string;
}

// ── Helper: data → Unix timestamp ────────────────────────────

function toUnix(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}

function dateFromUnix(unix: number): string {
  return new Date(unix * 1000).toISOString().split("T")[0];
}

// ── Buscar ID salvo no banco ──────────────────────────────────

export async function getIgUserId(): Promise<string> {
  const row = await queryOne<{ ultimo_id: string }>(
    "SELECT ultimo_id FROM sync.sync_state WHERE fonte = 'instagram_user_id'"
  );
  return row?.ultimo_id || IG_USER_ID;
}

// ── Perfil básico ─────────────────────────────────────────────

export async function getIgProfile(): Promise<{
  name: string;
  username: string;
  followers_count: number;
  media_count: number;
  biography: string;
  website: string;
  id: string;
}> {
  const igId = await getIgUserId();
  return metaGet(`/${igId}`, {
    fields: "name,username,followers_count,media_count,biography,website",
  });
}

// ── Métricas diárias de conta ─────────────────────────────────
// Na Graph API v25+, métricas se dividem em dois grupos:
// Grupo A (time series nativas, period=day): reach, follower_count, follows_and_unfollows
// Grupo B (requerem metric_type=total_value): views, profile_views, website_clicks, profile_links_taps

export async function getAccountInsights(
  sinceDate: Date,
  untilDate: Date
): Promise<IgInsightMetric[]> {
  const igId = await getIgUserId();
  const since = toUnix(sinceDate);
  const until = toUnix(untilDate);

  // Grupo A — time series diário nativo (reach e follower_count são os únicos que funcionam sem metric_type)
  const timeSeriesData = await metaGet<{ data: IgInsightMetric[] }>(`/${igId}/insights`, {
    metric: "reach,follower_count",
    period: "day",
    since,
    until,
  });

  // Grupo B — totais por período (metric_type=total_value)
  let totalValueData: IgInsightMetric[] = [];
  try {
    const tvResp = await metaGet<{ data: IgInsightMetric[] }>(`/${igId}/insights`, {
      metric: "views,profile_views,website_clicks,profile_links_taps,follows_and_unfollows",
      metric_type: "total_value",
      period: "day",
      since,
      until,
    });
    totalValueData = tvResp.data || [];
  } catch {
    logger.warn("Métricas total_value não disponíveis — conta pode ser nova");
  }

  return [...(timeSeriesData.data || []), ...totalValueData];
}

// ── Posts com métricas básicas ────────────────────────────────

export async function getMediaList(limit = 50): Promise<IgMedia[]> {
  const igId = await getIgUserId();
  const data = await metaGet<{ data: IgMedia[] }>(`/${igId}/media`, {
    fields: "id,media_type,caption,permalink,thumbnail_url,media_url,timestamp,like_count,comments_count",
    limit,
  });
  return data.data || [];
}

// ── Insights de um post específico ───────────────────────────
// Métricas variam por media_type:
// IMAGE/CAROUSEL: impressions, reach, saved, shares
// VIDEO/REEL: + video_views, ig_reels_avg_watch_time

export async function getMediaInsights(
  mediaId: string,
  mediaType: string
): Promise<IgMediaInsight[]> {
  // impressions removido na v22+. Métricas válidas para posts/carrosséis:
  const baseMetrics = ["reach", "saved", "shares", "likes", "comments"];

  if (mediaType === "VIDEO" || mediaType === "REEL") {
    baseMetrics.push("plays", "ig_reels_avg_watch_time");
  }

  try {
    const data = await metaGet<{ data: IgMediaInsight[] }>(`/${mediaId}/insights`, {
      metric: baseMetrics.join(","),
    });
    return data.data || [];
  } catch {
    // Alguns posts antigos não têm insights disponíveis
    logger.warn("Insights não disponíveis para media", { mediaId, mediaType });
    return [];
  }
}

// ── Audiência (period=lifetime) ───────────────────────────────

export async function getAudienceInsights(): Promise<IgInsightMetric[]> {
  const igId = await getIgUserId();
  const data = await metaGet<{ data: IgInsightMetric[] }>(`/${igId}/insights`, {
    metric: "audience_gender_age,audience_city,audience_country",
    period: "lifetime",
  });
  return data.data || [];
}

// ── Sync completo: conta + posts ──────────────────────────────

export async function syncInstagram(): Promise<{
  dias: number;
  posts: number;
  audiencia: boolean;
}> {
  logger.info("Instagram sync iniciado");

  // Janela: últimos 2 dias (overlap para não perder dados)
  const until = new Date();
  const since = new Date(until.getTime() - 2 * 86400000);

  // ── 1. Métricas diárias da conta ──────────────────────────
  let diasSalvos = 0;
  try {
    const insights = await getAccountInsights(since, until);

    // Agrupar valores por data
    const byDate = new Map<string, Record<string, number>>();

    for (const metric of insights) {
      // Grupo A: time series — values[] com end_time
      if (Array.isArray(metric.values) && metric.values.length > 0 && metric.values[0].end_time) {
        for (const point of metric.values) {
          const date = dateFromUnix(new Date(point.end_time).getTime() / 1000);
          if (!byDate.has(date)) byDate.set(date, {});
          byDate.get(date)![metric.name] = point.value || 0;
        }
        continue;
      }

      // Grupo B: total_value — grava no dia de ontem (referência do sync diário)
      const totalVal = (metric as unknown as { total_value?: { value: number } }).total_value;
      if (totalVal != null) {
        const yesterday = new Date(until.getTime() - 86400000).toISOString().split("T")[0];
        if (!byDate.has(yesterday)) byDate.set(yesterday, {});
        byDate.get(yesterday)![metric.name] = totalVal.value;
      }
    }

    for (const [date, values] of byDate.entries()) {
      await query(
        `INSERT INTO marketing.instagram_insights_daily
           (data, impressoes, alcance, visitas_perfil, seguidores,
            cliques_site, cliques_email, cliques_tel)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (data) DO UPDATE SET
           impressoes     = EXCLUDED.impressoes,
           alcance        = EXCLUDED.alcance,
           visitas_perfil = EXCLUDED.visitas_perfil,
           seguidores     = EXCLUDED.seguidores,
           cliques_site   = EXCLUDED.cliques_site,
           cliques_email  = EXCLUDED.cliques_email,
           cliques_tel    = EXCLUDED.cliques_tel`,
        [
          date,
          values.views || 0,
          values.reach || 0,
          values.profile_views || 0,
          values.follower_count || 0,
          values.website_clicks || 0,
          values.profile_links_taps || 0,
          values.follows_and_unfollows || 0,
        ]
      );
      diasSalvos++;
    }
  } catch (err) {
    logger.error("Erro ao sincronizar insights diários", { error: String(err) });
  }

  // ── 2. Posts ─────────────────────────────────────────────
  let postsSalvos = 0;
  try {
    const medias = await getMediaList(50);

    for (const media of medias) {
      const insights = await getMediaInsights(media.id, media.media_type);

      const getValue = (name: string): number => {
        const m = insights.find((i) => i.name === name);
        if (!m) return 0;
        // Formato varia: values[0].value ou value direto
        if (Array.isArray(m.values) && m.values.length > 0) {
          return typeof m.values[0].value === "number" ? m.values[0].value : 0;
        }
        return typeof m.value === "number" ? m.value : 0;
      };

      // Prefere dados de insights (mais precisos); fallback para listing se insights não disponível
      const curtidas      = getValue("likes")    || media.like_count     || 0;
      const comentarios   = getValue("comments") || media.comments_count || 0;
      const salvamentos   = getValue("saved");
      const compartilhados = getValue("shares");
      const alcance       = getValue("reach");
      const plays         = getValue("plays") || getValue("video_views");
      const impressoes    = alcance; // impressions removido na v22+; usa reach como proxy

      // Engagement rate = (interações) / alcance × 100; fallback por seguidores se alcance=0
      const totalEngajamento = curtidas + comentarios + salvamentos + compartilhados;
      const engagement_rate =
        alcance > 0
          ? Math.round((totalEngajamento / alcance) * 10000) / 100
          : 0;

      await query(
        `INSERT INTO marketing.instagram_posts
           (ig_media_id, tipo, caption, permalink, thumbnail_url, media_url,
            publicado_em, curtidas, comentarios, compartilhados, salvamentos,
            impressoes, alcance, plays, engagement_rate, atualizado_em)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,NOW())
         ON CONFLICT (ig_media_id) DO UPDATE SET
           curtidas        = EXCLUDED.curtidas,
           comentarios     = EXCLUDED.comentarios,
           compartilhados  = EXCLUDED.compartilhados,
           salvamentos     = EXCLUDED.salvamentos,
           impressoes      = EXCLUDED.impressoes,
           alcance         = EXCLUDED.alcance,
           plays           = EXCLUDED.plays,
           engagement_rate = EXCLUDED.engagement_rate,
           atualizado_em   = NOW()`,
        [
          media.id,
          media.media_type,
          media.caption || null,
          media.permalink || null,
          media.thumbnail_url || null,
          media.media_url || null,
          media.timestamp,
          curtidas,
          comentarios,
          compartilhados,
          salvamentos,
          impressoes,
          alcance,
          plays,
          engagement_rate,
        ]
      );
      postsSalvos++;
    }
  } catch (err) {
    logger.error("Erro ao sincronizar posts", { error: String(err) });
  }

  // ── 3. Audiência (semanal: só sincroniza 1x por semana) ──
  let audienciaSalva = false;
  try {
    const hoje = new Date().toISOString().split("T")[0];
    const diaSemana = new Date().getDay(); // 0=domingo

    if (diaSemana === 0) {
      const audienceMetrics = await getAudienceInsights();

      for (const metric of audienceMetrics) {
        const tipo =
          metric.name === "audience_gender_age" ? "gender_age" :
          metric.name === "audience_city"        ? "city"       :
          metric.name === "audience_country"     ? "country"    : metric.name;

        const valores = metric.values?.[0]?.value;
        if (!valores || typeof valores !== "object") continue;

        for (const [chave, valor] of Object.entries(valores as Record<string, number>)) {
          await query(
            `INSERT INTO marketing.instagram_audience (snapshot_em, tipo, chave, valor)
             VALUES ($1,$2,$3,$4)
             ON CONFLICT (snapshot_em, tipo, chave) DO UPDATE SET valor = EXCLUDED.valor`,
            [hoje, tipo, chave, valor]
          );
        }
        audienciaSalva = true;
      }
    }
  } catch (err) {
    logger.error("Erro ao sincronizar audiência", { error: String(err) });
  }

  // ── Atualiza sync_state ───────────────────────────────────
  await query(
    `UPDATE sync.sync_state SET ultima_sync = NOW(), total_sincronizados = $1
     WHERE fonte = 'instagram_user_id'`,
    [diasSalvos + postsSalvos]
  );

  logger.info("Instagram sync concluído", { diasSalvos, postsSalvos, audienciaSalva });
  return { dias: diasSalvos, posts: postsSalvos, audiencia: audienciaSalva };
}
