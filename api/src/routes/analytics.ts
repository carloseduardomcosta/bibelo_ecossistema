import { Router, Request, Response } from "express";
import { query, queryOne } from "../db";
import { authMiddleware } from "../middleware/auth";

export const analyticsRouter = Router();
analyticsRouter.use(authMiddleware);

// ── GET /api/analytics/overview — KPIs com comparativo ──────────

analyticsRouter.get("/overview", async (_req: Request, res: Response) => {
  // Mês atual e anterior
  const mesAtual = await queryOne<{ pedidos: string; receita: string; ticket: string }>(`
    SELECT COUNT(*)::text AS pedidos,
           COALESCE(SUM(valor), 0)::text AS receita,
           COALESCE(AVG(valor) FILTER (WHERE valor > 0), 0)::text AS ticket
    FROM sync.bling_orders
    WHERE criado_bling >= date_trunc('month', CURRENT_DATE)
  `);

  const mesAnterior = await queryOne<{ pedidos: string; receita: string; ticket: string }>(`
    SELECT COUNT(*)::text AS pedidos,
           COALESCE(SUM(valor), 0)::text AS receita,
           COALESCE(AVG(valor) FILTER (WHERE valor > 0), 0)::text AS ticket
    FROM sync.bling_orders
    WHERE criado_bling >= date_trunc('month', CURRENT_DATE) - INTERVAL '1 month'
      AND criado_bling < date_trunc('month', CURRENT_DATE)
  `);

  const totalClientes = await queryOne<{ total: string; novos_mes: string; novos_anterior: string }>(`
    SELECT COUNT(*)::text AS total,
           COUNT(*) FILTER (WHERE criado_em >= date_trunc('month', CURRENT_DATE))::text AS novos_mes,
           COUNT(*) FILTER (
             WHERE criado_em >= date_trunc('month', CURRENT_DATE) - INTERVAL '1 month'
               AND criado_em < date_trunc('month', CURRENT_DATE)
           )::text AS novos_anterior
    FROM crm.customers WHERE ativo = true
  `);

  const receitaTotal = await queryOne<{ total: string }>(`
    SELECT COALESCE(SUM(valor), 0)::text AS total FROM sync.bling_orders
  `);

  // Estoque alertas
  const estoque = await queryOne<{ sem_estoque: string; estoque_baixo: string; total_produtos: string }>(`
    SELECT
      COUNT(*) FILTER (WHERE COALESCE(s.saldo, 0) = 0)::text AS sem_estoque,
      COUNT(*) FILTER (WHERE COALESCE(s.saldo, 0) > 0 AND COALESCE(s.saldo, 0) <= 5)::text AS estoque_baixo,
      COUNT(*)::text AS total_produtos
    FROM sync.bling_products p
    LEFT JOIN (SELECT product_id, SUM(saldo_fisico) AS saldo FROM sync.bling_stock GROUP BY product_id) s
      ON s.product_id = p.id
    WHERE p.ativo = true
  `);

  // Segmentos
  const segmentos = await query<{ segmento: string; total: string }>(`
    SELECT segmento, COUNT(*)::text AS total
    FROM crm.customer_scores GROUP BY segmento ORDER BY total DESC
  `);

  const recAtual = parseFloat(mesAtual?.receita || "0");
  const recAnterior = parseFloat(mesAnterior?.receita || "0");
  const pedAtual = parseInt(mesAtual?.pedidos || "0", 10);
  const pedAnterior = parseInt(mesAnterior?.pedidos || "0", 10);
  const ticketAtual = parseFloat(mesAtual?.ticket || "0");
  const ticketAnterior = parseFloat(mesAnterior?.ticket || "0");
  const novosAtual = parseInt(totalClientes?.novos_mes || "0", 10);
  const novosAnterior = parseInt(totalClientes?.novos_anterior || "0", 10);

  function variacao(atual: number, anterior: number): number {
    if (anterior === 0) return atual > 0 ? 100 : 0;
    return Math.round(((atual - anterior) / anterior) * 1000) / 10;
  }

  res.json({
    receita_mes: recAtual,
    receita_mes_anterior: recAnterior,
    receita_variacao: variacao(recAtual, recAnterior),
    receita_total: parseFloat(receitaTotal?.total || "0"),

    pedidos_mes: pedAtual,
    pedidos_mes_anterior: pedAnterior,
    pedidos_variacao: variacao(pedAtual, pedAnterior),

    ticket_medio: ticketAtual,
    ticket_anterior: ticketAnterior,
    ticket_variacao: variacao(ticketAtual, ticketAnterior),

    total_clientes: parseInt(totalClientes?.total || "0", 10),
    novos_clientes_mes: novosAtual,
    novos_clientes_anterior: novosAnterior,
    novos_variacao: variacao(novosAtual, novosAnterior),

    total_produtos: parseInt(estoque?.total_produtos || "0", 10),
    sem_estoque: parseInt(estoque?.sem_estoque || "0", 10),
    estoque_baixo: parseInt(estoque?.estoque_baixo || "0", 10),

    segmentos: segmentos.map((r) => ({ segmento: r.segmento, total: parseInt(r.total, 10) })),
  });
});

// ── GET /api/analytics/revenue — receita mensal (12 meses) ──────

analyticsRouter.get("/revenue", async (_req: Request, res: Response) => {
  const rows = await query<{ mes: string; receita: string; pedidos: string }>(`
    SELECT
      TO_CHAR(date_trunc('month', criado_bling), 'YYYY-MM') AS mes,
      SUM(valor)::text AS receita,
      COUNT(*)::text AS pedidos
    FROM sync.bling_orders
    WHERE criado_bling >= NOW() - INTERVAL '12 months' AND criado_bling IS NOT NULL
    GROUP BY date_trunc('month', criado_bling)
    ORDER BY mes ASC
  `);

  res.json({
    data: rows.map((r) => ({
      mes: r.mes,
      receita: parseFloat(r.receita),
      pedidos: parseInt(r.pedidos, 10),
    })),
  });
});

// ── GET /api/analytics/segments — clientes por segmento ─────────

analyticsRouter.get("/segments", async (_req: Request, res: Response) => {
  const rows = await query<{ segmento: string; total: string }>(`
    SELECT segmento, COUNT(*)::text AS total
    FROM crm.customer_scores
    GROUP BY segmento ORDER BY total DESC
  `);

  res.json({
    data: rows.map((r) => ({
      segmento: r.segmento,
      total: parseInt(r.total, 10),
    })),
  });
});

// ── GET /api/analytics/insights — oportunidades e alertas ───────

analyticsRouter.get("/insights", async (_req: Request, res: Response) => {
  // Clientes em risco de churn (score baixo, compras antigas)
  const clientesRisco = await query<{ id: string; nome: string; score: number; ultima_compra: string }>(`
    SELECT c.id, c.nome, cs.score, cs.risco_churn,
           (SELECT MAX(o.criado_bling) FROM sync.bling_orders o
            JOIN sync.bling_customers bc ON bc.customer_id = c.id
            WHERE o.customer_id = c.id)::text AS ultima_compra
    FROM crm.customers c
    JOIN crm.customer_scores cs ON cs.customer_id = c.id
    WHERE cs.segmento = 'inativo' OR cs.risco_churn > 0.6
    ORDER BY cs.score ASC
    LIMIT 10
  `);

  // Top clientes por valor
  const topClientes = await query<{ id: string; nome: string; total_pedidos: string; valor_total: string }>(`
    SELECT c.id, c.nome,
           COUNT(o.id)::text AS total_pedidos,
           COALESCE(SUM(o.valor), 0)::text AS valor_total
    FROM crm.customers c
    JOIN sync.bling_orders o ON o.customer_id = c.id
    GROUP BY c.id, c.nome
    ORDER BY SUM(o.valor) DESC
    LIMIT 10
  `);

  // Produtos sem estoque que tem vendas (oportunidade perdida)
  const oportunidadesPerdidas = await query<{ nome: string; sku: string; preco_venda: number }>(`
    SELECT p.nome, p.sku, p.preco_venda
    FROM sync.bling_products p
    LEFT JOIN (SELECT product_id, SUM(saldo_fisico) AS saldo FROM sync.bling_stock GROUP BY product_id) s
      ON s.product_id = p.id
    WHERE p.ativo = true AND COALESCE(s.saldo, 0) = 0
    ORDER BY p.preco_venda DESC
    LIMIT 10
  `);

  // Categorias com melhor margem
  const categoriasTop = await query<{ categoria: string; qtd: string; margem_media: string }>(`
    SELECT COALESCE(categoria, 'Sem categoria') AS categoria,
           COUNT(*)::text AS qtd,
           ROUND(AVG(CASE WHEN preco_venda > 0 THEN (preco_venda - preco_custo) / preco_venda * 100 ELSE 0 END), 1)::text AS margem_media
    FROM sync.bling_products
    WHERE ativo = true AND preco_venda > 0
    GROUP BY categoria
    ORDER BY AVG(CASE WHEN preco_venda > 0 THEN (preco_venda - preco_custo) / preco_venda * 100 ELSE 0 END) DESC
    LIMIT 8
  `);

  res.json({
    clientes_risco: clientesRisco,
    top_clientes: topClientes.map((r) => ({
      ...r,
      total_pedidos: parseInt(r.total_pedidos, 10),
      valor_total: parseFloat(r.valor_total),
    })),
    oportunidades_perdidas: oportunidadesPerdidas,
    categorias_margem: categoriasTop.map((r) => ({
      categoria: r.categoria,
      qtd: parseInt(r.qtd, 10),
      margem_media: parseFloat(r.margem_media),
    })),
  });
});
