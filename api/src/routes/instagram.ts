import { Router, Request, Response } from "express";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth";
import { logger } from "../utils/logger";
import { query, queryOne } from "../db";
import { getIgProfile, syncInstagram } from "../integrations/meta/instagram";

export const instagramRouter = Router();
instagramRouter.use(authMiddleware);

// ── Schemas ───────────────────────────────────────────────────

const periodoSchema = z.object({
  periodo: z.enum(["7d", "15d", "30d", "3m", "6m", "1a"]).default("30d"),
});

function periodoDias(p: string): number {
  const map: Record<string, number> = {
    "7d": 7, "15d": 15, "30d": 30, "3m": 90, "6m": 180, "1a": 365,
  };
  return map[p] || 30;
}

// ── Status da conexão ─────────────────────────────────────────

instagramRouter.get("/status", async (_req: Request, res: Response) => {
  try {
    const profile = await getIgProfile();
    const lastSync = await queryOne<{ ultima_sync: string; total_sincronizados: number }>(
      "SELECT ultima_sync, total_sincronizados FROM sync.sync_state WHERE fonte = 'instagram_user_id'"
    );
    res.json({
      connected: true,
      profile: {
        name:            profile.name,
        username:        profile.username,
        followers_count: profile.followers_count,
        media_count:     profile.media_count,
        biography:       profile.biography,
        website:         profile.website,
      },
      ig_user_id: profile.id,
      ultimo_sync: lastSync?.ultima_sync || null,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    logger.error("Instagram status erro", { error: msg });
    res.json({ connected: false, error: msg });
  }
});

// ── Overview: KPIs + evolução diária do banco ─────────────────

instagramRouter.get("/overview", async (req: Request, res: Response) => {
  const parse = periodoSchema.safeParse(req.query);
  if (!parse.success) { res.status(400).json({ error: "Período inválido" }); return; }

  const dias = periodoDias(parse.data.periodo);

  try {
    // Série temporal diária
    const diario = await query<{
      data: string;
      impressoes: number;
      alcance: number;
      visitas_perfil: number;
      seguidores: number;
      cliques_site: number;
    }>(
      `SELECT data, impressoes, alcance, visitas_perfil, seguidores, cliques_site
       FROM marketing.instagram_insights_daily
       WHERE data >= CURRENT_DATE - make_interval(days => $1)
       ORDER BY data`,
      [dias]
    );

    // KPIs agregados do período
    const [kpis] = await query<{
      total_impressoes:     number;
      total_alcance:        number;
      total_visitas:        number;
      total_cliques:        number;
      seguidores_inicio:    number;
      seguidores_fim:       number;
      crescimento:          number;
    }>(
      `SELECT
         COALESCE(SUM(impressoes), 0)                                          AS total_impressoes,
         COALESCE(SUM(alcance), 0)                                             AS total_alcance,
         COALESCE(SUM(visitas_perfil), 0)                                      AS total_visitas,
         COALESCE(SUM(cliques_site), 0)                                        AS total_cliques,
         COALESCE((SELECT seguidores FROM marketing.instagram_insights_daily
                   WHERE data >= CURRENT_DATE - make_interval(days => $1)
                   ORDER BY data ASC LIMIT 1), 0)                              AS seguidores_inicio,
         COALESCE((SELECT seguidores FROM marketing.instagram_insights_daily
                   ORDER BY data DESC LIMIT 1), 0)                             AS seguidores_fim,
         COALESCE((SELECT seguidores FROM marketing.instagram_insights_daily ORDER BY data DESC LIMIT 1), 0)
         - COALESCE((SELECT seguidores FROM marketing.instagram_insights_daily
                     WHERE data >= CURRENT_DATE - make_interval(days => $1)
                     ORDER BY data ASC LIMIT 1), 0)                            AS crescimento
       FROM marketing.instagram_insights_daily
       WHERE data >= CURRENT_DATE - make_interval(days => $1)`,
      [dias]
    );

    // Engagement médio dos posts do período
    const [engagementMedia] = await query<{ media: number; total_posts: number }>(
      `SELECT ROUND(AVG(engagement_rate), 2) AS media, COUNT(*)::int AS total_posts
       FROM marketing.instagram_posts
       WHERE publicado_em >= NOW() - make_interval(days => $1)`,
      [dias]
    );

    res.json({
      kpis: {
        ...kpis,
        engagement_medio: engagementMedia?.media || 0,
        total_posts:      engagementMedia?.total_posts || 0,
      },
      diario,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro";
    logger.error("Instagram overview erro", { error: msg });
    res.status(500).json({ error: msg });
  }
});

// ── Posts com métricas ────────────────────────────────────────

const postsSchema = z.object({
  periodo: z.enum(["7d", "15d", "30d", "3m", "6m", "1a"]).default("30d"),
  sort: z.enum(["engagement", "alcance", "impressoes", "salvamentos", "recente"]).default("engagement"),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

instagramRouter.get("/posts", async (req: Request, res: Response) => {
  const parse = postsSchema.safeParse(req.query);
  if (!parse.success) { res.status(400).json({ error: "Parâmetros inválidos" }); return; }

  const { periodo, sort, limit } = parse.data;
  const dias = periodoDias(periodo);

  const orderMap: Record<string, string> = {
    engagement:  "engagement_rate DESC",
    alcance:     "alcance DESC",
    impressoes:  "impressoes DESC",
    salvamentos: "salvamentos DESC",
    recente:     "publicado_em DESC",
  };

  try {
    const posts = await query(
      `SELECT ig_media_id, tipo, caption, permalink, thumbnail_url, media_url,
              publicado_em, curtidas, comentarios, compartilhados, salvamentos,
              impressoes, alcance, plays, engagement_rate
       FROM marketing.instagram_posts
       WHERE publicado_em >= NOW() - make_interval(days => $1)
       ORDER BY ${orderMap[sort]}
       LIMIT $2`,
      [dias, limit]
    );
    res.json(posts);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro";
    logger.error("Instagram posts erro", { error: msg });
    res.status(500).json({ error: msg });
  }
});

// ── Audiência ─────────────────────────────────────────────────

instagramRouter.get("/audience", async (_req: Request, res: Response) => {
  try {
    // Snapshot mais recente
    const [latest] = await query<{ snapshot_em: string }>(
      `SELECT snapshot_em FROM marketing.instagram_audience ORDER BY snapshot_em DESC LIMIT 1`
    );

    if (!latest) {
      res.json({ snapshot_em: null, gender_age: [], cities: [], countries: [] });
      return;
    }

    const [genderAge, cities, countries] = await Promise.all([
      query<{ chave: string; valor: number }>(
        `SELECT chave, valor FROM marketing.instagram_audience
         WHERE snapshot_em = $1 AND tipo = 'gender_age' ORDER BY valor DESC`,
        [latest.snapshot_em]
      ),
      query<{ chave: string; valor: number }>(
        `SELECT chave, valor FROM marketing.instagram_audience
         WHERE snapshot_em = $1 AND tipo = 'city' ORDER BY valor DESC LIMIT 10`,
        [latest.snapshot_em]
      ),
      query<{ chave: string; valor: number }>(
        `SELECT chave, valor FROM marketing.instagram_audience
         WHERE snapshot_em = $1 AND tipo = 'country' ORDER BY valor DESC LIMIT 5`,
        [latest.snapshot_em]
      ),
    ]);

    res.json({
      snapshot_em: latest.snapshot_em,
      gender_age:  genderAge,
      cities,
      countries,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro";
    logger.error("Instagram audience erro", { error: msg });
    res.status(500).json({ error: msg });
  }
});

// ── Sync manual ───────────────────────────────────────────────

instagramRouter.post("/sync", async (_req: Request, res: Response) => {
  try {
    // Roda em background — não bloqueia o response
    syncInstagram()
      .then((r) => logger.info("Instagram sync manual concluído", r))
      .catch((e) => logger.error("Instagram sync manual falhou", { error: String(e) }));

    res.json({ ok: true, message: "Sync iniciado em background" });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro";
    logger.error("Instagram sync manual erro", { error: msg });
    res.status(500).json({ error: msg });
  }
});

// ── Status do sync ────────────────────────────────────────────

instagramRouter.get("/sync-status", async (_req: Request, res: Response) => {
  try {
    const [lastSync] = await query<{ criado_em: string; status: string; registros: number }>(
      `SELECT criado_em, status, registros FROM sync.sync_logs
       WHERE tipo = 'instagram-sync' ORDER BY criado_em DESC LIMIT 1`
    );

    const [totais] = await query<{
      dias: string;
      posts: string;
      audience_snapshots: string;
    }>(
      `SELECT
         (SELECT COUNT(*)::text FROM marketing.instagram_insights_daily) AS dias,
         (SELECT COUNT(*)::text FROM marketing.instagram_posts)           AS posts,
         (SELECT COUNT(DISTINCT snapshot_em)::text FROM marketing.instagram_audience) AS audience_snapshots`
    );

    res.json({
      ultimo_sync:        lastSync || null,
      total_dias:         parseInt(totais?.dias || "0"),
      total_posts:        parseInt(totais?.posts || "0"),
      audience_snapshots: parseInt(totais?.audience_snapshots || "0"),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro";
    logger.error("Instagram sync-status erro", { error: msg });
    res.status(500).json({ error: msg });
  }
});
