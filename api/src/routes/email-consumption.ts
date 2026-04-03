import { Router, Request, Response } from "express";
import { query, queryOne } from "../db";
import { logger } from "../utils/logger";
import { authMiddleware } from "../middleware/auth";
import { getSesAccountStats } from "../integrations/ses/client";
import { getEmailProvider } from "../integrations/resend/email";

export const emailConsumptionRouter = Router();
emailConsumptionRouter.use(authMiddleware);

// ── GET /api/email-consumption/overview ─────────────────────────
// Dashboard principal: KPIs, cota SES, envios por período
emailConsumptionRouter.get("/overview", async (req: Request, res: Response) => {
  const periodo = (req.query.periodo as string) || "30d";

  // Calcular data de início baseado no período
  const diasMap: Record<string, number> = {
    "7d": 7, "15d": 15, "30d": 30, "3m": 90, "6m": 180, "1a": 365,
  };
  const dias = diasMap[periodo] || 30;

  try {
    // Dados do provider ativo
    const provider = getEmailProvider();
    const sesStats = provider === "ses" ? await getSesAccountStats() : null;

    // Total de emails enviados no período (campaign_sends + flow_step_executions)
    const totais = await queryOne<{
      total_enviados: number;
      total_entregues: number;
      total_abertos: number;
      total_cliques: number;
      total_bounces: number;
      total_spam: number;
    }>(`
      SELECT
        COUNT(*) FILTER (WHERE status IN ('enviado','entregue')) AS total_enviados,
        COUNT(*) FILTER (WHERE status = 'entregue') AS total_entregues,
        COUNT(*) FILTER (WHERE aberto_em IS NOT NULL) AS total_abertos,
        COUNT(*) FILTER (WHERE clicado_em IS NOT NULL) AS total_cliques,
        COUNT(*) FILTER (WHERE status = 'bounce') AS total_bounces,
        COUNT(*) FILTER (WHERE status = 'spam') AS total_spam
      FROM marketing.campaign_sends
      WHERE enviado_em >= NOW() - make_interval(days => $1)
    `, [dias]);

    // Emails de fluxo no período
    const flowTotais = await queryOne<{ total_flow: number }>(`
      SELECT COUNT(*) AS total_flow
      FROM marketing.flow_step_executions
      WHERE status = 'concluido'
        AND executado_em >= NOW() - make_interval(days => $1)
        AND resultado->>'messageId' IS NOT NULL
    `, [dias]);

    // Total geral (campanhas + fluxos)
    const totalGeral = (totais?.total_enviados || 0) + (flowTotais?.total_flow || 0);

    // Período anterior para comparação
    const totaisAnterior = await queryOne<{ total_anterior: number }>(`
      SELECT COUNT(*) FILTER (WHERE status IN ('enviado','entregue')) AS total_anterior
      FROM marketing.campaign_sends
      WHERE enviado_em >= NOW() - make_interval(days => $1)
        AND enviado_em < NOW() - make_interval(days => $2)
    `, [dias * 2, dias]);

    const flowAnterior = await queryOne<{ total_anterior: number }>(`
      SELECT COUNT(*) AS total_anterior
      FROM marketing.flow_step_executions
      WHERE status = 'concluido'
        AND executado_em >= NOW() - make_interval(days => $1)
        AND executado_em < NOW() - make_interval(days => $2)
        AND resultado->>'messageId' IS NOT NULL
    `, [dias * 2, dias]);

    const totalAnterior = (totaisAnterior?.total_anterior || 0) + (flowAnterior?.total_anterior || 0);
    const variacao = totalAnterior > 0 ? Math.round(((totalGeral - totalAnterior) / totalAnterior) * 100) : 0;

    // Custo estimado SES ($0.10 por 1000 emails)
    const custoSes = totalGeral * 0.0001; // $0.10 / 1000
    const custoResend = 0; // grátis até 3000, depois $20/mês

    res.json({
      provider,
      ses: sesStats,
      periodo,
      dias,
      kpis: {
        total_enviados: totalGeral,
        total_campanhas: totais?.total_enviados || 0,
        total_fluxos: flowTotais?.total_flow || 0,
        total_entregues: totais?.total_entregues || 0,
        total_abertos: totais?.total_abertos || 0,
        total_cliques: totais?.total_cliques || 0,
        total_bounces: totais?.total_bounces || 0,
        total_spam: totais?.total_spam || 0,
        taxa_abertura: totais?.total_enviados ? Math.round((totais.total_abertos / totais.total_enviados) * 100) : 0,
        taxa_clique: totais?.total_abertos ? Math.round((totais.total_cliques / totais.total_abertos) * 100) : 0,
        taxa_bounce: totalGeral ? Math.round(((totais?.total_bounces || 0) / totalGeral) * 100 * 10) / 10 : 0,
        variacao,
        custo_estimado: provider === "ses" ? custoSes : custoResend,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro";
    logger.error("Erro ao buscar consumo de email", { error: msg });
    res.status(500).json({ error: "Erro ao buscar dados de consumo" });
  }
});

// ── GET /api/email-consumption/daily ────────────────────────────
// Envios por dia (para gráfico de barras)
emailConsumptionRouter.get("/daily", async (req: Request, res: Response) => {
  const periodo = (req.query.periodo as string) || "30d";
  const diasMap: Record<string, number> = {
    "7d": 7, "15d": 15, "30d": 30, "3m": 90, "6m": 180, "1a": 365,
  };
  const dias = diasMap[periodo] || 30;

  try {
    // Campanhas por dia
    const campanhasDia = await query<{
      dia: string; enviados: number; entregues: number; abertos: number; bounces: number;
    }>(`
      SELECT
        TO_CHAR(enviado_em, 'YYYY-MM-DD') AS dia,
        COUNT(*) FILTER (WHERE status IN ('enviado','entregue')) AS enviados,
        COUNT(*) FILTER (WHERE status = 'entregue') AS entregues,
        COUNT(*) FILTER (WHERE aberto_em IS NOT NULL) AS abertos,
        COUNT(*) FILTER (WHERE status = 'bounce') AS bounces
      FROM marketing.campaign_sends
      WHERE enviado_em >= NOW() - make_interval(days => $1)
      GROUP BY dia
      ORDER BY dia
    `, [dias]);

    // Fluxos por dia
    const fluxosDia = await query<{ dia: string; enviados: number }>(`
      SELECT
        TO_CHAR(executado_em, 'YYYY-MM-DD') AS dia,
        COUNT(*) AS enviados
      FROM marketing.flow_step_executions
      WHERE status = 'concluido'
        AND executado_em >= NOW() - make_interval(days => $1)
        AND resultado->>'messageId' IS NOT NULL
      GROUP BY dia
      ORDER BY dia
    `, [dias]);

    // Merge: combinar campanhas + fluxos por dia
    const fluxoMap = new Map(fluxosDia.map((f) => [f.dia, f.enviados]));
    const allDays = new Set([
      ...campanhasDia.map((c) => c.dia),
      ...fluxosDia.map((f) => f.dia),
    ]);

    const campMap = new Map(campanhasDia.map((c) => [c.dia, c]));

    const daily = Array.from(allDays).sort().map((dia) => {
      const camp = campMap.get(dia);
      return {
        dia,
        campanhas: Number(camp?.enviados || 0),
        fluxos: Number(fluxoMap.get(dia) || 0),
        total: Number(camp?.enviados || 0) + Number(fluxoMap.get(dia) || 0),
        entregues: Number(camp?.entregues || 0),
        abertos: Number(camp?.abertos || 0),
        bounces: Number(camp?.bounces || 0),
      };
    });

    res.json({ periodo, dias, daily });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro";
    logger.error("Erro ao buscar consumo diário", { error: msg });
    res.status(500).json({ error: "Erro ao buscar dados diários" });
  }
});

// ── GET /api/email-consumption/by-type ──────────────────────────
// Distribuição por tipo (campanha, fluxo, teste)
emailConsumptionRouter.get("/by-type", async (req: Request, res: Response) => {
  const periodo = (req.query.periodo as string) || "30d";
  const diasMap: Record<string, number> = {
    "7d": 7, "15d": 15, "30d": 30, "3m": 90, "6m": 180, "1a": 365,
  };
  const dias = diasMap[periodo] || 30;

  try {
    const campanhas = await queryOne<{ total: number }>(`
      SELECT COUNT(*) AS total FROM marketing.campaign_sends
      WHERE enviado_em >= NOW() - make_interval(days => $1) AND status IN ('enviado','entregue')
    `, [dias]);

    const fluxos = await queryOne<{ total: number }>(`
      SELECT COUNT(*) AS total FROM marketing.flow_step_executions
      WHERE status = 'concluido' AND executado_em >= NOW() - make_interval(days => $1)
        AND resultado->>'messageId' IS NOT NULL
    `, [dias]);

    // Top campanhas por volume
    const topCampanhas = await query<{
      id: string; nome: string; total_envios: number; total_abertos: number; total_cliques: number; enviado_em: string;
    }>(`
      SELECT c.id, c.nome, c.total_envios, c.total_abertos, c.total_cliques, c.enviado_em
      FROM marketing.campaigns c
      WHERE c.enviado_em >= NOW() - make_interval(days => $1) AND c.total_envios > 0
      ORDER BY c.total_envios DESC
      LIMIT 10
    `, [dias]);

    // Top fluxos por volume
    const topFluxos = await query<{
      nome: string; total: number;
    }>(`
      SELECT f.nome, COUNT(*) AS total
      FROM marketing.flow_step_executions fse
      JOIN marketing.flow_executions fe ON fe.id = fse.execution_id
      JOIN marketing.flows f ON f.id = fe.flow_id
      WHERE fse.status = 'concluido'
        AND fse.executado_em >= NOW() - make_interval(days => $1)
        AND fse.resultado->>'messageId' IS NOT NULL
      GROUP BY f.nome
      ORDER BY total DESC
      LIMIT 10
    `, [dias]);

    res.json({
      periodo,
      distribuicao: [
        { tipo: "Campanhas", total: Number(campanhas?.total || 0) },
        { tipo: "Fluxos Automáticos", total: Number(fluxos?.total || 0) },
      ],
      topCampanhas,
      topFluxos,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro";
    logger.error("Erro ao buscar distribuição de emails", { error: msg });
    res.status(500).json({ error: "Erro ao buscar distribuição" });
  }
});

// ── GET /api/email-consumption/monthly ──────────────────────────
// Consumo mensal (para gráfico de evolução e custo)
emailConsumptionRouter.get("/monthly", async (_req: Request, res: Response) => {
  try {
    const monthly = await query<{
      mes: string; campanhas: number; fluxos: number;
    }>(`
      SELECT meses.mes,
        COALESCE(camp.total, 0) AS campanhas,
        COALESCE(flow.total, 0) AS fluxos
      FROM (
        SELECT TO_CHAR(d, 'YYYY-MM') AS mes
        FROM generate_series(NOW() - INTERVAL '12 months', NOW(), '1 month') d
      ) meses
      LEFT JOIN (
        SELECT TO_CHAR(enviado_em, 'YYYY-MM') AS mes, COUNT(*) AS total
        FROM marketing.campaign_sends
        WHERE status IN ('enviado','entregue') AND enviado_em >= NOW() - INTERVAL '12 months'
        GROUP BY mes
      ) camp ON camp.mes = meses.mes
      LEFT JOIN (
        SELECT TO_CHAR(executado_em, 'YYYY-MM') AS mes, COUNT(*) AS total
        FROM marketing.flow_step_executions
        WHERE status = 'concluido' AND executado_em >= NOW() - INTERVAL '12 months'
          AND resultado->>'messageId' IS NOT NULL
        GROUP BY mes
      ) flow ON flow.mes = meses.mes
      ORDER BY meses.mes
    `);

    const provider = getEmailProvider();

    const result = monthly.map((m) => {
      const total = Number(m.campanhas) + Number(m.fluxos);
      return {
        mes: m.mes,
        campanhas: Number(m.campanhas),
        fluxos: Number(m.fluxos),
        total,
        custo_ses: Math.round(total * 0.0001 * 100) / 100, // $0.10/1000
        custo_resend: total <= 3000 ? 0 : 20, // free tier ou $20
      };
    });

    res.json({ provider, monthly: result });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro";
    logger.error("Erro ao buscar consumo mensal", { error: msg });
    res.status(500).json({ error: "Erro ao buscar dados mensais" });
  }
});
