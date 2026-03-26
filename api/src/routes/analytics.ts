import { Router, Request, Response } from "express";
import { query, queryOne } from "../db";
import { authMiddleware } from "../middleware/auth";

export const analyticsRouter = Router();
analyticsRouter.use(authMiddleware);

// ── GET /api/analytics/overview — KPIs gerais ──────────────────

analyticsRouter.get("/overview", async (_req: Request, res: Response) => {
  const totalClientes = await queryOne<{ total: string }>(
    "SELECT COUNT(*)::text AS total FROM crm.customers WHERE ativo = true"
  );

  const receitaTotal = await queryOne<{ total: string }>(
    `SELECT COALESCE(SUM(valor), 0)::text AS total FROM (
       SELECT valor FROM sync.bling_orders
       UNION ALL
       SELECT valor FROM sync.nuvemshop_orders
     ) t`
  );

  const ticketMedio = await queryOne<{ media: string }>(
    `SELECT COALESCE(AVG(valor), 0)::text AS media FROM (
       SELECT valor FROM sync.bling_orders WHERE valor > 0
       UNION ALL
       SELECT valor FROM sync.nuvemshop_orders WHERE valor > 0
     ) t`
  );

  const novosEsteMes = await queryOne<{ total: string }>(
    `SELECT COUNT(*)::text AS total FROM crm.customers
     WHERE criado_em >= date_trunc('month', CURRENT_DATE) AND ativo = true`
  );

  res.json({
    total_clientes: parseInt(totalClientes?.total || "0", 10),
    receita_total: parseFloat(receitaTotal?.total || "0"),
    ticket_medio: parseFloat(ticketMedio?.media || "0"),
    novos_este_mes: parseInt(novosEsteMes?.total || "0", 10),
  });
});

// ── GET /api/analytics/revenue — receita mensal (12 meses) ────

analyticsRouter.get("/revenue", async (_req: Request, res: Response) => {
  const rows = await query<{ mes: string; receita: string }>(
    `SELECT
       TO_CHAR(date_trunc('month', data), 'YYYY-MM') AS mes,
       SUM(valor)::text AS receita
     FROM (
       SELECT valor, criado_bling AS data FROM sync.bling_orders WHERE criado_bling IS NOT NULL
       UNION ALL
       SELECT valor, webhook_em AS data FROM sync.nuvemshop_orders
     ) t
     WHERE data >= NOW() - INTERVAL '12 months'
     GROUP BY date_trunc('month', data)
     ORDER BY mes ASC`
  );

  res.json({
    data: rows.map((r) => ({
      mes: r.mes,
      receita: parseFloat(r.receita),
    })),
  });
});

// ── GET /api/analytics/segments — clientes por segmento ────────

analyticsRouter.get("/segments", async (_req: Request, res: Response) => {
  const rows = await query<{ segmento: string; total: string }>(
    `SELECT segmento, COUNT(*)::text AS total
     FROM crm.customer_scores
     GROUP BY segmento
     ORDER BY total DESC`
  );

  res.json({
    data: rows.map((r) => ({
      segmento: r.segmento,
      total: parseInt(r.total, 10),
    })),
  });
});
