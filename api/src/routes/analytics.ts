import { Router, Request, Response } from "express";
import { query, queryOne } from "../db";
import { authMiddleware } from "../middleware/auth";
import { getCachedReviews, refreshReviewsCache } from "../integrations/google/reviews";
import { cached } from "../utils/cache";
import { logger } from "../utils/logger";

export const analyticsRouter = Router();
analyticsRouter.use(authMiddleware);

// ── Helper: converte periodo em intervalo SQL ───────────────────

function periodoToInterval(periodo?: string): { intervalo: string; dias: number } {
  switch (periodo) {
    case "1d":  return { intervalo: "1 day", dias: 1 };
    case "3d":  return { intervalo: "3 days", dias: 3 };
    case "7d":  return { intervalo: "7 days", dias: 7 };
    case "15d": return { intervalo: "15 days", dias: 15 };
    case "30d": return { intervalo: "30 days", dias: 30 };
    case "3m":  return { intervalo: "3 months", dias: 90 };
    case "6m":  return { intervalo: "6 months", dias: 180 };
    case "1a":  return { intervalo: "12 months", dias: 365 };
    default:    return { intervalo: "1 month", dias: 30 };
  }
}

// ── GET /api/analytics/overview — KPIs com comparativo ──────────

analyticsRouter.get("/overview", async (req: Request, res: Response) => {
  const { intervalo, dias } = periodoToInterval(req.query.periodo as string);

  const diasAnterior = `${dias * 2} days`;

  // Período atual
  const atual = await queryOne<{ pedidos: string; receita: string; ticket: string }>(`
    SELECT COUNT(*)::text AS pedidos,
           COALESCE(SUM(valor), 0)::text AS receita,
           COALESCE(AVG(valor) FILTER (WHERE valor > 0), 0)::text AS ticket
    FROM sync.bling_orders
    WHERE criado_bling >= NOW() - $1::interval
  `, [intervalo]);

  // Período anterior (mesma duração, antes do atual)
  const anterior = await queryOne<{ pedidos: string; receita: string; ticket: string }>(`
    SELECT COUNT(*)::text AS pedidos,
           COALESCE(SUM(valor), 0)::text AS receita,
           COALESCE(AVG(valor) FILTER (WHERE valor > 0), 0)::text AS ticket
    FROM sync.bling_orders
    WHERE criado_bling >= NOW() - $1::interval
      AND criado_bling < NOW() - $2::interval
  `, [diasAnterior, intervalo]);

  // Clientes que compraram no período (ativos de verdade)
  const clientesPeriodo = await queryOne<{ compraram: string; compraram_anterior: string }>(`
    SELECT
      COUNT(DISTINCT customer_id) FILTER (WHERE criado_bling >= NOW() - $1::interval)::text AS compraram,
      COUNT(DISTINCT customer_id) FILTER (
        WHERE criado_bling >= NOW() - $2::interval
          AND criado_bling < NOW() - $1::interval
      )::text AS compraram_anterior
    FROM sync.bling_orders
    WHERE customer_id IS NOT NULL
  `, [intervalo, diasAnterior]);

  const totalClientes = await queryOne<{ total: string; novos: string; novos_anterior: string }>(`
    SELECT COUNT(*)::text AS total,
           COUNT(*) FILTER (WHERE criado_em >= NOW() - $1::interval)::text AS novos,
           COUNT(*) FILTER (
             WHERE criado_em >= NOW() - $2::interval
               AND criado_em < NOW() - $1::interval
           )::text AS novos_anterior
    FROM crm.customers WHERE ativo = true
  `, [intervalo, diasAnterior]);

  const receitaTotal = await queryOne<{ total: string }>(`
    SELECT COALESCE(SUM(valor), 0)::text AS total FROM sync.bling_orders
  `);

  // Despesas no período (do módulo financeiro)
  const despesasPeriodo = await queryOne<{ total: string; anterior: string }>(`
    SELECT
      COALESCE(SUM(valor) FILTER (WHERE data >= (CURRENT_DATE - $1::interval)::date), 0)::text AS total,
      COALESCE(SUM(valor) FILTER (
        WHERE data >= (CURRENT_DATE - $2::interval)::date
          AND data < (CURRENT_DATE - $1::interval)::date
      ), 0)::text AS anterior
    FROM financeiro.lancamentos
    WHERE tipo = 'despesa' AND status != 'cancelado'
  `, [intervalo, diasAnterior]);

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

  const recAtual = parseFloat(atual?.receita || "0");
  const recAnterior = parseFloat(anterior?.receita || "0");
  const pedAtual = parseInt(atual?.pedidos || "0", 10);
  const pedAnterior = parseInt(anterior?.pedidos || "0", 10);
  const ticketAtual = parseFloat(atual?.ticket || "0");
  const ticketAnterior = parseFloat(anterior?.ticket || "0");
  const novosAtual = parseInt(totalClientes?.novos || "0", 10);
  const novosAnterior = parseInt(totalClientes?.novos_anterior || "0", 10);
  const clientesCompraram = parseInt(clientesPeriodo?.compraram || "0", 10);
  const clientesCompraramAnt = parseInt(clientesPeriodo?.compraram_anterior || "0", 10);
  const despAtual = parseFloat(despesasPeriodo?.total || "0");
  const despAnterior = parseFloat(despesasPeriodo?.anterior || "0");

  function variacao(a: number, b: number): number {
    if (b === 0) return a > 0 ? 100 : 0;
    return Math.round(((a - b) / b) * 1000) / 10;
  }

  res.json({
    receita_periodo: recAtual,
    receita_anterior: recAnterior,
    receita_variacao: variacao(recAtual, recAnterior),
    receita_total: parseFloat(receitaTotal?.total || "0"),

    despesas_periodo: despAtual,
    despesas_anterior: despAnterior,
    despesas_variacao: variacao(despAtual, despAnterior),

    saldo_periodo: recAtual - despAtual,

    pedidos_periodo: pedAtual,
    pedidos_anterior: pedAnterior,
    pedidos_variacao: variacao(pedAtual, pedAnterior),

    ticket_medio: ticketAtual,
    ticket_anterior: ticketAnterior,
    ticket_variacao: variacao(ticketAtual, ticketAnterior),

    clientes_compraram: clientesCompraram,
    clientes_compraram_anterior: clientesCompraramAnt,
    clientes_compraram_variacao: variacao(clientesCompraram, clientesCompraramAnt),
    total_clientes: parseInt(totalClientes?.total || "0", 10),
    novos_clientes: novosAtual,
    novos_anterior: novosAnterior,
    novos_variacao: variacao(novosAtual, novosAnterior),

    total_produtos: parseInt(estoque?.total_produtos || "0", 10),
    sem_estoque: parseInt(estoque?.sem_estoque || "0", 10),
    estoque_baixo: parseInt(estoque?.estoque_baixo || "0", 10),

    segmentos: segmentos.map((r) => ({ segmento: r.segmento, total: parseInt(r.total, 10) })),
  });
});

// ── GET /api/analytics/revenue — receita por período ────────────

analyticsRouter.get("/revenue", async (req: Request, res: Response) => {
  const { intervalo } = periodoToInterval(req.query.periodo as string);

  const rows = await query<{ mes: string; receita: string; pedidos: string }>(`
    SELECT
      TO_CHAR(date_trunc('month', criado_bling), 'YYYY-MM') AS mes,
      SUM(valor)::text AS receita,
      COUNT(*)::text AS pedidos
    FROM sync.bling_orders
    WHERE criado_bling >= NOW() - $1::interval AND criado_bling IS NOT NULL
    GROUP BY date_trunc('month', criado_bling)
    ORDER BY mes ASC
  `, [intervalo]);

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

// ── GET /api/analytics/segments-detail — segmentos com métricas ──

analyticsRouter.get("/segments-detail", async (_req: Request, res: Response) => {
  const rows = await query<{
    segmento: string; total: string; ltv_medio: string; ticket_medio: string; score_medio: string;
  }>(`
    SELECT segmento,
           COUNT(*)::text AS total,
           ROUND(AVG(ltv), 2)::text AS ltv_medio,
           ROUND(AVG(ticket_medio), 2)::text AS ticket_medio,
           ROUND(AVG(score))::text AS score_medio
    FROM crm.customer_scores
    GROUP BY segmento
    ORDER BY AVG(score) DESC
  `);

  res.json({
    data: rows.map((r) => ({
      segmento: r.segmento,
      total: parseInt(r.total, 10),
      ltv_medio: parseFloat(r.ltv_medio),
      ticket_medio: parseFloat(r.ticket_medio),
      score_medio: parseInt(r.score_medio, 10),
    })),
  });
});

// ── GET /api/analytics/insights — oportunidades e alertas ───────

analyticsRouter.get("/insights", async (req: Request, res: Response) => {
  const { intervalo } = periodoToInterval(req.query.periodo as string);

  // Clientes em risco de churn
  const clientesRisco = await query<{ id: string; nome: string; score: number }>(`
    SELECT c.id, c.nome, cs.score
    FROM crm.customers c
    JOIN crm.customer_scores cs ON cs.customer_id = c.id
    WHERE cs.segmento = 'inativo' OR cs.risco_churn IN ('alto', 'medio')
    ORDER BY cs.score ASC
    LIMIT 10
  `);

  // Top clientes por valor no período
  const topClientes = await query<{ id: string; nome: string; total_pedidos: string; valor_total: string }>(`
    SELECT c.id, c.nome,
           COUNT(o.id)::text AS total_pedidos,
           COALESCE(SUM(o.valor), 0)::text AS valor_total
    FROM crm.customers c
    JOIN sync.bling_orders o ON o.customer_id = c.id
    WHERE o.criado_bling >= NOW() - $1::interval
    GROUP BY c.id, c.nome
    ORDER BY SUM(o.valor) DESC
    LIMIT 10
  `, [intervalo]);

  // Produtos sem estoque de maior valor
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

// ── GET /api/analytics/contas-pagar — contas a pagar ────────────

analyticsRouter.get("/contas-pagar", async (req: Request, res: Response) => {
  const status = req.query.status as string | undefined;
  const mes = req.query.mes as string | undefined; // formato YYYY-MM

  // Build parameterized date filter
  let cpDateFilter = "";
  const cpDateParams: (string)[] = [];
  if (mes && /^\d{4}-\d{2}$/.test(mes)) {
    const mesDate = `${mes}-01`;
    cpDateFilter = `AND vencimento >= $NEXT::date AND vencimento < ($NEXT::date + INTERVAL '1 month')`;
    cpDateParams.push(mesDate, mesDate);
  } else {
    const { intervalo } = periodoToInterval(req.query.periodo as string);
    if (req.query.periodo) {
      cpDateFilter = `AND vencimento >= NOW() - $NEXT::interval`;
      cpDateParams.push(intervalo);
    }
  }

  // Helper to replace $NEXT placeholders with actual param indices
  function buildQuery(sql: string, baseParams: unknown[], dateFilter: string, dateParamValues: string[]): { sql: string; params: unknown[] } {
    const allParams = [...baseParams];
    let nextIdx = allParams.length + 1;
    let resolvedFilter = dateFilter;
    for (const val of dateParamValues) {
      resolvedFilter = resolvedFilter.replace("$NEXT", `$${nextIdx}`);
      allParams.push(val);
      nextIdx++;
    }
    return { sql: sql.replace("__DATE_FILTER__", resolvedFilter), params: allParams };
  }

  const conditions: string[] = [];
  if (status === "pendente") conditions.push("situacao = 1");
  else if (status === "pago") conditions.push("situacao = 2");

  const resumoQ = buildQuery(`
    SELECT
      COUNT(*)::text AS total,
      COUNT(*) FILTER (WHERE situacao = 1)::text AS pendentes,
      COUNT(*) FILTER (WHERE situacao = 2)::text AS pagas,
      COALESCE(SUM(valor) FILTER (WHERE situacao = 1), 0)::text AS valor_pendente,
      COALESCE(SUM(valor_pago) FILTER (WHERE situacao = 2), 0)::text AS valor_pago,
      COUNT(*) FILTER (WHERE situacao = 1 AND vencimento < CURRENT_DATE)::text AS vencidas,
      COALESCE(SUM(valor) FILTER (WHERE situacao = 1 AND vencimento < CURRENT_DATE), 0)::text AS valor_vencido
    FROM sync.bling_contas_pagar
    WHERE 1=1 __DATE_FILTER__
  `, [], cpDateFilter, [...cpDateParams]);

  const resumo = await queryOne<{
    total: string; pendentes: string; pagas: string;
    valor_pendente: string; valor_pago: string;
    vencidas: string; valor_vencido: string;
  }>(resumoQ.sql, resumoQ.params);

  // Build contas query with status filter + date filter
  const contasWhere = conditions.length > 0
    ? `WHERE ${conditions.join(" AND ")} `
    : (cpDateFilter ? "WHERE 1=1 " : "");
  const contasDatePart = conditions.length > 0
    ? cpDateFilter
    : (cpDateFilter ? cpDateFilter.replace("AND", "AND") : "");
  const contasQ = buildQuery(`
    SELECT bling_id, situacao, vencimento, valor, numero_documento, historico,
           contato_nome, forma_pagamento, data_pagamento, valor_pago
    FROM sync.bling_contas_pagar
    ${contasWhere}__DATE_FILTER__
    ORDER BY CASE WHEN situacao = 1 AND vencimento < CURRENT_DATE THEN 0
                  WHEN situacao = 1 THEN 1
                  ELSE 2 END,
             vencimento ASC
    LIMIT 100
  `, [], contasDatePart, [...cpDateParams]);

  const contas = await query<{
    bling_id: string; situacao: number; vencimento: string; valor: number;
    numero_documento: string; historico: string; contato_nome: string;
    forma_pagamento: string; data_pagamento: string; valor_pago: number;
  }>(contasQ.sql, contasQ.params);

  const fornecedorQ = buildQuery(`
    SELECT COALESCE(NULLIF(contato_nome, ''), 'Não informado') AS fornecedor,
           COUNT(*)::text AS total,
           COALESCE(SUM(valor), 0)::text AS valor
    FROM sync.bling_contas_pagar
    WHERE 1=1 __DATE_FILTER__
    GROUP BY contato_nome
    ORDER BY SUM(valor) DESC
    LIMIT 10
  `, [], cpDateFilter, [...cpDateParams]);

  const porFornecedor = await query<{ fornecedor: string; total: string; valor: string }>(fornecedorQ.sql, fornecedorQ.params);

  res.json({
    resumo: {
      total: parseInt(resumo?.total || "0", 10),
      pendentes: parseInt(resumo?.pendentes || "0", 10),
      pagas: parseInt(resumo?.pagas || "0", 10),
      valor_pendente: parseFloat(resumo?.valor_pendente || "0"),
      valor_pago: parseFloat(resumo?.valor_pago || "0"),
      vencidas: parseInt(resumo?.vencidas || "0", 10),
      valor_vencido: parseFloat(resumo?.valor_vencido || "0"),
    },
    contas,
    por_fornecedor: porFornecedor.map((r) => ({
      fornecedor: r.fornecedor,
      total: parseInt(r.total, 10),
      valor: parseFloat(r.valor),
    })),
  });
});

// ── GET /api/analytics/pagamentos — formas de pagamento ─────────

analyticsRouter.get("/pagamentos", async (req: Request, res: Response) => {
  const { intervalo } = periodoToInterval(req.query.periodo as string);
  const hasPeriodo = intervalo !== "1 month" || !!req.query.periodo;

  const porForma = hasPeriodo
    ? await query<{ forma: string; total_pedidos: string; valor_total: string }>(`
        SELECT
          COALESCE(p.forma_descricao, 'Não informado') AS forma,
          COUNT(DISTINCT p.order_bling_id)::text AS total_pedidos,
          COALESCE(SUM(p.valor), 0)::text AS valor_total
        FROM sync.bling_order_parcelas p
        WHERE p.data_vencimento >= NOW() - $1::interval
        GROUP BY p.forma_descricao
        ORDER BY SUM(p.valor) DESC
      `, [intervalo])
    : await query<{ forma: string; total_pedidos: string; valor_total: string }>(`
        SELECT
          COALESCE(p.forma_descricao, 'Não informado') AS forma,
          COUNT(DISTINCT p.order_bling_id)::text AS total_pedidos,
          COALESCE(SUM(p.valor), 0)::text AS valor_total
        FROM sync.bling_order_parcelas p
        GROUP BY p.forma_descricao
        ORDER BY SUM(p.valor) DESC
      `);

  const porMes = hasPeriodo
    ? await query<{ mes: string; forma: string; valor: string }>(`
        SELECT
          TO_CHAR(p.data_vencimento, 'YYYY-MM') AS mes,
          COALESCE(p.forma_descricao, 'Outros') AS forma,
          SUM(p.valor)::text AS valor
        FROM sync.bling_order_parcelas p
        WHERE p.data_vencimento IS NOT NULL AND p.data_vencimento >= NOW() - $1::interval
        GROUP BY TO_CHAR(p.data_vencimento, 'YYYY-MM'), p.forma_descricao
        ORDER BY mes ASC
      `, [intervalo])
    : await query<{ mes: string; forma: string; valor: string }>(`
        SELECT
          TO_CHAR(p.data_vencimento, 'YYYY-MM') AS mes,
          COALESCE(p.forma_descricao, 'Outros') AS forma,
          SUM(p.valor)::text AS valor
        FROM sync.bling_order_parcelas p
        WHERE p.data_vencimento IS NOT NULL
        GROUP BY TO_CHAR(p.data_vencimento, 'YYYY-MM'), p.forma_descricao
        ORDER BY mes ASC
      `);

  const totalGeral = porForma.reduce((s, r) => s + parseFloat(r.valor_total), 0);

  res.json({
    por_forma: porForma.map((r) => ({
      forma: r.forma,
      total_pedidos: parseInt(r.total_pedidos, 10),
      valor_total: parseFloat(r.valor_total),
      percentual: totalGeral > 0 ? Math.round(parseFloat(r.valor_total) / totalGeral * 1000) / 10 : 0,
    })),
    por_mes: porMes.map((r) => ({
      mes: r.mes,
      forma: r.forma,
      valor: parseFloat(r.valor),
    })),
    total_geral: totalGeral,
  });
});

// ── GET /api/analytics/nfe — NF-e emitidas ──────────────────────

analyticsRouter.get("/nfe", async (req: Request, res: Response) => {
  const { intervalo } = periodoToInterval(req.query.periodo as string);
  const hasPeriodo = !!req.query.periodo;

  const resumo = hasPeriodo
    ? await queryOne<{
        total: string; autorizadas: string; canceladas: string;
        valor_total: string; valor_autorizadas: string;
      }>(`
        SELECT
          COUNT(*)::text AS total,
          COUNT(*) FILTER (WHERE situacao IN (4, 6))::text AS autorizadas,
          COUNT(*) FILTER (WHERE situacao = 3)::text AS canceladas,
          COALESCE(SUM(valor_total), 0)::text AS valor_total,
          COALESCE(SUM(valor_total) FILTER (WHERE situacao IN (4, 6)), 0)::text AS valor_autorizadas
        FROM sync.bling_nfe
        WHERE data_emissao >= NOW() - $1::interval
      `, [intervalo])
    : await queryOne<{
        total: string; autorizadas: string; canceladas: string;
        valor_total: string; valor_autorizadas: string;
      }>(`
        SELECT
          COUNT(*)::text AS total,
          COUNT(*) FILTER (WHERE situacao IN (4, 6))::text AS autorizadas,
          COUNT(*) FILTER (WHERE situacao = 3)::text AS canceladas,
          COALESCE(SUM(valor_total), 0)::text AS valor_total,
          COALESCE(SUM(valor_total) FILTER (WHERE situacao IN (4, 6)), 0)::text AS valor_autorizadas
        FROM sync.bling_nfe
      `);

  const porMes = hasPeriodo
    ? await query<{ mes: string; quantidade: string; valor: string }>(`
        SELECT
          TO_CHAR(data_emissao, 'YYYY-MM') AS mes,
          COUNT(*)::text AS quantidade,
          COALESCE(SUM(valor_total), 0)::text AS valor
        FROM sync.bling_nfe
        WHERE data_emissao IS NOT NULL AND situacao IN (4, 6) AND data_emissao >= NOW() - $1::interval
        GROUP BY TO_CHAR(data_emissao, 'YYYY-MM')
        ORDER BY mes ASC
      `, [intervalo])
    : await query<{ mes: string; quantidade: string; valor: string }>(`
        SELECT
          TO_CHAR(data_emissao, 'YYYY-MM') AS mes,
          COUNT(*)::text AS quantidade,
          COALESCE(SUM(valor_total), 0)::text AS valor
        FROM sync.bling_nfe
        WHERE data_emissao IS NOT NULL AND situacao IN (4, 6)
        GROUP BY TO_CHAR(data_emissao, 'YYYY-MM')
        ORDER BY mes ASC
      `);

  const ultimas = await query<{
    numero: string; data_emissao: string; valor_total: number;
    contato_nome: string; situacao: number;
  }>(`
    SELECT numero, data_emissao, valor_total, contato_nome, situacao
    FROM sync.bling_nfe
    ORDER BY data_emissao DESC
    LIMIT 20
  `);

  res.json({
    resumo: {
      total: parseInt(resumo?.total || "0", 10),
      autorizadas: parseInt(resumo?.autorizadas || "0", 10),
      canceladas: parseInt(resumo?.canceladas || "0", 10),
      valor_total: parseFloat(resumo?.valor_total || "0"),
      valor_autorizadas: parseFloat(resumo?.valor_autorizadas || "0"),
    },
    por_mes: porMes.map((r) => ({
      mes: r.mes,
      quantidade: parseInt(r.quantidade, 10),
      valor: parseFloat(r.valor),
    })),
    ultimas,
  });
});

// ── GET /api/analytics/reviews — Google Reviews ──────────────

analyticsRouter.get("/reviews", async (_req: Request, res: Response) => {
  const data = await getCachedReviews();
  res.json(data);
});

// ── POST /api/analytics/reviews/refresh — Force refresh ──────

analyticsRouter.post("/reviews/refresh", async (_req: Request, res: Response) => {
  const data = await refreshReviewsCache();
  if (!data) {
    res.status(500).json({ error: "Falha ao atualizar reviews. Verifique GOOGLE_MAPS_API_KEY e GOOGLE_PLACE_ID." });
    return;
  }
  res.json(data);
});

// ── GET /api/analytics/funil — Funil de conversão ────────────────

analyticsRouter.get("/funil", async (req: Request, res: Response) => {
  try {
    const diasRaw = parseInt(req.query.dias as string, 10);
    const dias = (!isNaN(diasRaw) && diasRaw > 0 && diasRaw <= 365) ? diasRaw : 30;

    const [visitantes, produtos, carrinho, checkout, compras, leads] = await Promise.all([
      queryOne<{ total: string }>(
        `SELECT COUNT(DISTINCT visitor_id)::text AS total FROM crm.tracking_events WHERE criado_em >= NOW() - make_interval(days => $1)`,
        [dias]
      ),
      queryOne<{ total: string }>(
        `SELECT COUNT(DISTINCT visitor_id)::text AS total FROM crm.tracking_events WHERE evento = 'product_view' AND criado_em >= NOW() - make_interval(days => $1)`,
        [dias]
      ),
      queryOne<{ total: string }>(
        `SELECT COUNT(DISTINCT visitor_id)::text AS total FROM crm.tracking_events WHERE evento = 'add_to_cart' AND criado_em >= NOW() - make_interval(days => $1)`,
        [dias]
      ),
      queryOne<{ total: string }>(
        `SELECT COUNT(DISTINCT visitor_id)::text AS total FROM crm.tracking_events WHERE evento = 'checkout' AND criado_em >= NOW() - make_interval(days => $1)`,
        [dias]
      ),
      queryOne<{ total: string }>(
        `SELECT COUNT(DISTINCT visitor_id)::text AS total FROM crm.tracking_events WHERE evento = 'purchase' AND criado_em >= NOW() - make_interval(days => $1)`,
        [dias]
      ),
      queryOne<{ total: string }>(
        `SELECT COUNT(*)::text AS total FROM marketing.leads WHERE criado_em >= NOW() - make_interval(days => $1)`,
        [dias]
      ),
    ]);

    const v = parseInt(visitantes?.total || "0", 10);
    const p = parseInt(produtos?.total || "0", 10);
    const c = parseInt(carrinho?.total || "0", 10);
    const ch = parseInt(checkout?.total || "0", 10);
    const co = parseInt(compras?.total || "0", 10);
    const l = parseInt(leads?.total || "0", 10);

    function taxa(numerador: number, denominador: number): number {
      if (denominador === 0) return 0;
      return Math.round((numerador / denominador) * 1000) / 10;
    }

    res.json({
      periodo_dias: dias,
      etapas: [
        { nome: "Visitantes únicos",     valor: v,  icone: "👁" },
        { nome: "Visualizações produto", valor: p,  icone: "📦" },
        { nome: "Add to cart",           valor: c,  icone: "🛒" },
        { nome: "Checkout iniciado",     valor: ch, icone: "💳" },
        { nome: "Compras realizadas",    valor: co, icone: "✅" },
        { nome: "Leads capturados",      valor: l,  icone: "📧" },
      ],
      conversoes: [
        { de: "Visitantes únicos",     para: "Visualizações produto", taxa: taxa(p, v) },
        { de: "Visualizações produto", para: "Add to cart",           taxa: taxa(c, p) },
        { de: "Add to cart",           para: "Checkout iniciado",     taxa: taxa(ch, c) },
        { de: "Checkout iniciado",     para: "Compras realizadas",    taxa: taxa(co, ch) },
        { de: "Visitantes únicos",     para: "Leads capturados",      taxa: taxa(l, v) },
      ],
    });
  } catch (err) {
    logger.error("Erro ao carregar funil de conversão", { err });
    res.status(500).json({ error: "Erro interno. Tente novamente." });
  }
});

// ── GET /api/analytics/alertas-flows — Flows sem atividade ───────

analyticsRouter.get("/alertas-flows", async (_req: Request, res: Response) => {
  try {
    const rows = await query<{
      id: string; nome: string; gatilho: string;
      execucoes_7d: string; total_execucoes: string;
    }>(`
      SELECT f.id, f.nome, f.gatilho,
        COUNT(fe.id) FILTER (WHERE fe.iniciado_em >= NOW() - INTERVAL '7 days')::text AS execucoes_7d,
        COUNT(fe.id)::text AS total_execucoes
      FROM marketing.flows f
      LEFT JOIN marketing.flow_executions fe ON fe.flow_id = f.id
      WHERE f.ativo = true AND f.nome NOT ILIKE 'vitest%'
      GROUP BY f.id, f.nome, f.gatilho
      HAVING COUNT(fe.id) FILTER (WHERE fe.iniciado_em >= NOW() - INTERVAL '7 days') = 0
      ORDER BY f.nome
    `);

    res.json({
      flows_sem_atividade: rows.map((r) => ({
        id: r.id,
        nome: r.nome,
        gatilho: r.gatilho,
        execucoes_7d: parseInt(r.execucoes_7d, 10),
        total_execucoes: parseInt(r.total_execucoes, 10),
      })),
      total: rows.length,
    });
  } catch (err) {
    logger.error("Erro ao carregar alertas de flows", { err });
    res.status(500).json({ error: "Erro interno. Tente novamente." });
  }
});

// ── GET /api/analytics/forecast — Previsão de receita ────────────

analyticsRouter.get("/forecast", async (_req: Request, res: Response) => {
  try {
    const [stats3meses, mesAtualRow] = await Promise.all([
      queryOne<{ media_mensal: string | null; desvio_mensal: string | null }>(`
        SELECT
          AVG(receita_mes)::text AS media_mensal,
          STDDEV(receita_mes)::text AS desvio_mensal
        FROM (
          SELECT
            DATE_TRUNC('month', criado_bling) AS mes,
            SUM(valor) AS receita_mes
          FROM sync.bling_orders
          WHERE criado_bling >= DATE_TRUNC('month', NOW()) - INTERVAL '3 months'
            AND criado_bling < DATE_TRUNC('month', NOW())
            AND status NOT IN ('cancelado', 'devolvido')
          GROUP BY mes
        ) meses
      `),
      queryOne<{ receita_mes_atual: string }>(`
        SELECT COALESCE(SUM(valor), 0)::text AS receita_mes_atual
        FROM sync.bling_orders
        WHERE criado_bling >= DATE_TRUNC('month', NOW())
          AND status NOT IN ('cancelado', 'devolvido')
      `),
    ]);

    const mediaMensal = parseFloat(stats3meses?.media_mensal || "0");
    const desvioMensal = parseFloat(stats3meses?.desvio_mensal || "0");
    const receitaAteHoje = parseFloat(mesAtualRow?.receita_mes_atual || "0");

    // Projeção: extrapola receita atual para o fim do mês com base nos dias corridos
    const hoje = new Date();
    const diaDoMes = hoje.getDate();
    const diasNoMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate();
    const projetado = diaDoMes > 0 ? Math.round((receitaAteHoje / diaDoMes) * diasNoMes * 100) / 100 : 0;

    // Tendência: compara projetado com média dos últimos 3 meses
    let tendencia: "alta" | "estavel" | "queda" = "estavel";
    if (mediaMensal > 0) {
      const diff = (projetado - mediaMensal) / mediaMensal;
      if (diff > 0.1) tendencia = "alta";
      else if (diff < -0.1) tendencia = "queda";
    }

    // Confiança: depende de quantos meses têm dados e variabilidade
    const temHistorico = mediaMensal > 0;
    const desvioRelativo = mediaMensal > 0 ? desvioMensal / mediaMensal : 1;
    let confianca: "baixa" | "media" | "alta" = "baixa";
    if (temHistorico && desvioRelativo <= 0.2) confianca = "alta";
    else if (temHistorico && desvioRelativo <= 0.5) confianca = "media";

    res.json({
      mes_atual: {
        receita_ate_hoje: receitaAteHoje,
        projetado_fim_mes: projetado,
      },
      media_3_meses: mediaMensal,
      tendencia,
      confianca,
    });
  } catch (err) {
    logger.error("Erro ao calcular forecast", { err });
    res.status(500).json({ error: "Erro interno. Tente novamente." });
  }
});

// ══════════════════════════════════════════════════════════════════
// INTELIGÊNCIA — RFM, Conversão de Fluxos, ROI por Canal
// ══════════════════════════════════════════════════════════════════

// ── GET /api/analytics/rfm — Segmentação RFM completa ───────────

analyticsRouter.get("/rfm", async (_req: Request, res: Response) => {
  const data = await cached("analytics:rfm", 300, async () => {
  // Classificação RFM: divide em quintis (1-5) baseado na distribuição real
  const clientes = await query<{
    id: string; nome: string; email: string; canal_origem: string;
    ultima_compra: string; dias_sem_compra: number; frequencia_dias: number;
    total_pedidos: number; ltv: number; ticket_medio: number;
    score: number; segmento: string; risco_churn: string;
  }>(`
    SELECT
      c.id, c.nome, c.email, c.canal_origem,
      cs.ultima_compra,
      EXTRACT(DAY FROM NOW() - cs.ultima_compra)::int AS dias_sem_compra,
      COALESCE(cs.frequencia_dias, 0) AS frequencia_dias,
      COALESCE(cs.total_pedidos, 0) AS total_pedidos,
      COALESCE(cs.ltv, 0)::float AS ltv,
      COALESCE(cs.ticket_medio, 0)::float AS ticket_medio,
      COALESCE(cs.score, 0) AS score,
      COALESCE(cs.segmento, 'novo') AS segmento,
      COALESCE(cs.risco_churn, 'baixo') AS risco_churn
    FROM crm.customers c
    LEFT JOIN crm.customer_scores cs ON cs.customer_id = c.id
    WHERE c.ativo = true AND c.email IS NOT NULL
    ORDER BY cs.score DESC NULLS LAST
  `);

  // Calcular scores RFM (1-5) via percentis
  const comPedidos = clientes.filter(c => c.total_pedidos > 0);

  function quintil(arr: number[], val: number): number {
    if (arr.length === 0) return 1;
    const sorted = [...arr].sort((a, b) => a - b);
    const pos = sorted.filter(v => v <= val).length / sorted.length;
    if (pos <= 0.2) return 1;
    if (pos <= 0.4) return 2;
    if (pos <= 0.6) return 3;
    if (pos <= 0.8) return 4;
    return 5;
  }

  const diasArr = comPedidos.map(c => c.dias_sem_compra);
  const freqArr = comPedidos.map(c => c.total_pedidos);
  const monArr = comPedidos.map(c => c.ltv);

  // Classificação RFM → segmento descritivo
  function rfmSegmento(r: number, f: number, m: number): string {
    if (r >= 4 && f >= 4 && m >= 4) return "Campeões";
    if (r >= 3 && f >= 3 && m >= 3) return "Leais";
    if (r >= 4 && f <= 2) return "Novos Promissores";
    if (r >= 3 && f >= 2) return "Potenciais Leais";
    if (r <= 2 && f >= 3 && m >= 3) return "Em Risco";
    if (r <= 2 && f >= 4) return "Não Pode Perder";
    if (r <= 2 && f <= 2 && m <= 2) return "Perdidos";
    if (r <= 2 && f <= 2) return "Hibernando";
    return "Precisam Atenção";
  }

  const rfmClientes = comPedidos.map(c => {
    // Recência: INVERTIDO — menos dias = melhor = score maior
    const r = 6 - quintil(diasArr, c.dias_sem_compra);
    const f = quintil(freqArr, c.total_pedidos);
    const m = quintil(monArr, c.ltv);
    return {
      id: c.id,
      nome: c.nome,
      email: c.email,
      canal_origem: c.canal_origem,
      r, f, m,
      rfm_score: r + f + m,
      rfm_segmento: rfmSegmento(r, f, m),
      dias_sem_compra: c.dias_sem_compra,
      total_pedidos: c.total_pedidos,
      ltv: c.ltv,
      ticket_medio: c.ticket_medio,
      risco_churn: c.risco_churn,
    };
  });

  // Contagem por segmento RFM
  const segmentos: Record<string, { total: number; ltv_medio: number; ticket_medio: number }> = {};
  for (const c of rfmClientes) {
    if (!segmentos[c.rfm_segmento]) {
      segmentos[c.rfm_segmento] = { total: 0, ltv_medio: 0, ticket_medio: 0 };
    }
    segmentos[c.rfm_segmento].total++;
    segmentos[c.rfm_segmento].ltv_medio += c.ltv;
    segmentos[c.rfm_segmento].ticket_medio += c.ticket_medio;
  }

  const distribuicao = Object.entries(segmentos).map(([nome, data]) => ({
    segmento: nome,
    total: data.total,
    ltv_medio: Math.round(data.ltv_medio / data.total),
    ticket_medio: Math.round(data.ticket_medio / data.total),
  })).sort((a, b) => b.ltv_medio - a.ltv_medio);

  // Resumo geral
  const totalComPedidos = comPedidos.length;
  const totalSemPedidos = clientes.length - totalComPedidos;

  return {
    total_clientes: clientes.length,
    com_pedidos: totalComPedidos,
    sem_pedidos: totalSemPedidos,
    distribuicao,
    top_clientes: rfmClientes.slice(0, 20),
    em_risco: rfmClientes.filter(c => c.rfm_segmento === "Em Risco" || c.rfm_segmento === "Não Pode Perder")
      .sort((a, b) => b.ltv - a.ltv).slice(0, 10),
    perdidos: rfmClientes.filter(c => c.rfm_segmento === "Perdidos" || c.rfm_segmento === "Hibernando")
      .sort((a, b) => b.ltv - a.ltv).slice(0, 10),
  };
  });
  res.json(data);
});

// ── GET /api/analytics/flow-conversion — Funil de conversão ─────

analyticsRouter.get("/flow-conversion", async (req: Request, res: Response) => {
  const { intervalo } = periodoToInterval(req.query.periodo as string);

  // Métricas por fluxo: execuções, steps executados, emails abertos/clicados, conversões
  const fluxos = await query<{
    id: string; nome: string; gatilho: string; ativo: boolean;
    total_execucoes: number; total_concluidas: number;
    total_ativas: number; total_erro: number;
  }>(`
    SELECT
      f.id, f.nome, f.gatilho, f.ativo,
      COUNT(DISTINCT fe.id) FILTER (WHERE fe.iniciado_em >= NOW() - $1::interval) AS total_execucoes,
      COUNT(DISTINCT fe.id) FILTER (WHERE fe.status = 'concluido' AND fe.iniciado_em >= NOW() - $1::interval) AS total_concluidas,
      COUNT(DISTINCT fe.id) FILTER (WHERE fe.status = 'ativo' AND fe.iniciado_em >= NOW() - $1::interval) AS total_ativas,
      COUNT(DISTINCT fe.id) FILTER (WHERE fe.status = 'erro' AND fe.iniciado_em >= NOW() - $1::interval) AS total_erro
    FROM marketing.flows f
    LEFT JOIN marketing.flow_executions fe ON fe.flow_id = f.id
    GROUP BY f.id, f.nome, f.gatilho, f.ativo
    ORDER BY total_execucoes DESC
  `, [intervalo]);

  // Para cada fluxo: emails enviados, abertos, clicados, conversões
  const detalhes = await Promise.all(fluxos.map(async (fluxo) => {
    // Emails enviados neste fluxo
    const emailStats = await queryOne<{
      emails_enviados: number; emails_abertos: number; emails_clicados: number;
    }>(`
      SELECT
        COUNT(*) FILTER (WHERE fse.status = 'concluido' AND fse.tipo = 'email') AS emails_enviados,
        COUNT(DISTINCT fse.id) FILTER (
          WHERE fse.tipo = 'email' AND fse.status = 'concluido'
            AND EXISTS (
              SELECT 1 FROM marketing.email_events ee
              WHERE ee.message_id = fse.resultado->>'messageId' AND ee.tipo = 'opened'
            )
        ) AS emails_abertos,
        COUNT(DISTINCT fse.id) FILTER (
          WHERE fse.tipo = 'email' AND fse.status = 'concluido'
            AND EXISTS (
              SELECT 1 FROM marketing.email_events ee
              WHERE ee.message_id = fse.resultado->>'messageId' AND ee.tipo = 'clicked'
            )
        ) AS emails_clicados
      FROM marketing.flow_step_executions fse
      JOIN marketing.flow_executions fe ON fe.id = fse.execution_id
      WHERE fe.flow_id = $1 AND fe.iniciado_em >= NOW() - $2::interval
    `, [fluxo.id, intervalo]);

    // Conversões: clientes que compraram APÓS entrar no fluxo
    const conversoes = await queryOne<{ total: number; receita: number }>(`
      SELECT
        COUNT(DISTINCT fe.customer_id) AS total,
        COALESCE(SUM(sub.valor), 0)::float AS receita
      FROM marketing.flow_executions fe
      JOIN LATERAL (
        SELECT valor FROM sync.bling_orders bo
        WHERE bo.customer_id = fe.customer_id AND bo.criado_bling > fe.iniciado_em
        UNION ALL
        SELECT valor FROM sync.nuvemshop_orders no2
        WHERE no2.customer_id = fe.customer_id AND no2.webhook_em > fe.iniciado_em AND no2.status = 'paid'
      ) sub ON true
      WHERE fe.flow_id = $1 AND fe.iniciado_em >= NOW() - $2::interval
    `, [fluxo.id, intervalo]);

    return {
      ...fluxo,
      emails_enviados: Number(emailStats?.emails_enviados || 0),
      emails_abertos: Number(emailStats?.emails_abertos || 0),
      emails_clicados: Number(emailStats?.emails_clicados || 0),
      conversoes: Number(conversoes?.total || 0),
      receita_gerada: Number(conversoes?.receita || 0),
      taxa_conversao: fluxo.total_execucoes > 0
        ? Math.round((Number(conversoes?.total || 0) / Number(fluxo.total_execucoes)) * 100 * 10) / 10
        : 0,
      taxa_abertura: Number(emailStats?.emails_enviados || 0) > 0
        ? Math.round((Number(emailStats?.emails_abertos || 0) / Number(emailStats?.emails_enviados || 0)) * 100)
        : 0,
    };
  }));

  // Totais gerais
  const totais = {
    execucoes: detalhes.reduce((s, f) => s + Number(f.total_execucoes), 0),
    conversoes: detalhes.reduce((s, f) => s + f.conversoes, 0),
    receita: detalhes.reduce((s, f) => s + f.receita_gerada, 0),
    emails: detalhes.reduce((s, f) => s + f.emails_enviados, 0),
  };

  res.json({ detalhes, totais });
});

// ── GET /api/analytics/roi-canal — ROI por canal de aquisição ───

analyticsRouter.get("/roi-canal", async (req: Request, res: Response) => {
  const { intervalo, dias } = periodoToInterval(req.query.periodo as string);

  // ROI por canal de venda (onde o pedido foi feito)
  const porCanalVenda = await query<{
    canal: string; pedidos: number; receita: number; ticket_medio: number; clientes: number;
  }>(`
    SELECT
      COALESCE(NULLIF(canal, ''), 'desconhecido') AS canal,
      COUNT(*)::int AS pedidos,
      COALESCE(SUM(valor), 0)::float AS receita,
      ROUND(AVG(valor) FILTER (WHERE valor > 0), 2)::float AS ticket_medio,
      COUNT(DISTINCT customer_id)::int AS clientes
    FROM sync.bling_orders
    WHERE criado_bling >= NOW() - $1::interval
    GROUP BY COALESCE(NULLIF(canal, ''), 'desconhecido')
    ORDER BY receita DESC
  `, [intervalo]);

  // ROI por canal de origem (como o cliente chegou)
  const porCanalOrigem = await query<{
    canal_origem: string; total_clientes: number; compradores: number;
    taxa_conversao: number; receita_total: number; ltv_medio: number; ticket_medio: number;
  }>(`
    SELECT
      COALESCE(NULLIF(c.canal_origem, ''), 'desconhecido') AS canal_origem,
      COUNT(*)::int AS total_clientes,
      COUNT(*) FILTER (WHERE cs.total_pedidos > 0)::int AS compradores,
      CASE WHEN COUNT(*) > 0
        THEN ROUND(COUNT(*) FILTER (WHERE cs.total_pedidos > 0) * 100.0 / COUNT(*), 1)
        ELSE 0
      END::float AS taxa_conversao,
      COALESCE(SUM(cs.ltv) FILTER (WHERE cs.total_pedidos > 0), 0)::float AS receita_total,
      ROUND(AVG(cs.ltv) FILTER (WHERE cs.total_pedidos > 0), 0)::float AS ltv_medio,
      ROUND(AVG(cs.ticket_medio) FILTER (WHERE cs.total_pedidos > 0), 0)::float AS ticket_medio
    FROM crm.customers c
    LEFT JOIN crm.customer_scores cs ON cs.customer_id = c.id
    WHERE c.ativo = true
    GROUP BY COALESCE(NULLIF(c.canal_origem, ''), 'desconhecido')
    ORDER BY receita_total DESC
  `);

  // Receita por canal no período vs período anterior
  const receitaAtual = await queryOne<{ total: number }>(`
    SELECT COALESCE(SUM(valor), 0)::float AS total
    FROM sync.bling_orders WHERE criado_bling >= NOW() - $1::interval
  `, [intervalo]);

  const receitaAnterior = await queryOne<{ total: number }>(`
    SELECT COALESCE(SUM(valor), 0)::float AS total
    FROM sync.bling_orders
    WHERE criado_bling >= NOW() - make_interval(days => $1)
      AND criado_bling < NOW() - $2::interval
  `, [dias * 2, intervalo]);

  const variacao = (receitaAnterior?.total || 0) > 0
    ? Math.round(((receitaAtual?.total || 0) - (receitaAnterior?.total || 0)) / (receitaAnterior?.total || 1) * 100)
    : 0;

  // Evolução mensal por canal de venda (últimos 6 meses)
  const evolucaoMensal = await query<{
    mes: string; canal: string; receita: number; pedidos: number;
  }>(`
    SELECT
      TO_CHAR(criado_bling, 'YYYY-MM') AS mes,
      COALESCE(NULLIF(canal, ''), 'desconhecido') AS canal,
      SUM(valor)::float AS receita,
      COUNT(*)::int AS pedidos
    FROM sync.bling_orders
    WHERE criado_bling >= NOW() - INTERVAL '6 months'
    GROUP BY mes, canal
    ORDER BY mes, canal
  `);

  // Leads por fonte
  const leadsPorFonte = await query<{
    fonte: string; total: number; verificados: number; convertidos: number;
  }>(`
    SELECT
      COALESCE(fonte, 'desconhecido') AS fonte,
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE email_verificado = true)::int AS verificados,
      COUNT(*) FILTER (WHERE convertido = true)::int AS convertidos
    FROM marketing.leads
    GROUP BY COALESCE(fonte, 'desconhecido')
    ORDER BY total DESC
  `);

  res.json({
    receita_periodo: receitaAtual?.total || 0,
    variacao,
    por_canal_venda: porCanalVenda,
    por_canal_origem: porCanalOrigem,
    evolucao_mensal: evolucaoMensal,
    leads_por_fonte: leadsPorFonte,
  });
});

// ══════════════════════════════════════════════════════════════════
// CROSS-SELL — Produtos frequentemente comprados juntos
// ══════════════════════════════════════════════════════════════════

// ── GET /api/analytics/cross-sell — Pares frequentes + insights ──

analyticsRouter.get("/cross-sell", async (_req: Request, res: Response) => {
  const data = await cached("analytics:cross-sell", 600, async () => {
  // Top pares de produtos comprados juntos (excluindo variações do mesmo produto)
  const pares = await query<{
    sku_a: string; nome_a: string; valor_a: number;
    sku_b: string; nome_b: string; valor_b: number;
    vezes_juntos: number;
  }>(`
    WITH item_pairs AS (
      SELECT
        a.value->>'codigo' AS sku_a,
        a.value->>'descricao' AS nome_a,
        (a.value->>'valor')::numeric AS valor_a,
        b.value->>'codigo' AS sku_b,
        b.value->>'descricao' AS nome_b,
        (b.value->>'valor')::numeric AS valor_b
      FROM sync.bling_orders o,
        jsonb_array_elements(o.itens) WITH ORDINALITY AS a(value, ord_a),
        jsonb_array_elements(o.itens) WITH ORDINALITY AS b(value, ord_b)
      WHERE jsonb_array_length(o.itens) >= 2
        AND a.ord_a < b.ord_b
        AND a.value->>'codigo' IS NOT NULL
        AND b.value->>'codigo' IS NOT NULL
    )
    SELECT sku_a, nome_a, ROUND(AVG(valor_a), 2)::float AS valor_a,
           sku_b, nome_b, ROUND(AVG(valor_b), 2)::float AS valor_b,
           COUNT(*)::int AS vezes_juntos
    FROM item_pairs
    WHERE LEFT(sku_a, GREATEST(POSITION('_' IN sku_a) - 1, 4)) != LEFT(sku_b, GREATEST(POSITION('_' IN sku_b) - 1, 4))
    GROUP BY sku_a, nome_a, sku_b, nome_b
    HAVING COUNT(*) >= 2
    ORDER BY vezes_juntos DESC
    LIMIT 30
  `);

  // Stats gerais
  const stats = await queryOne<{
    total_pedidos: number; multi_item: number; media_itens: number;
  }>(`
    SELECT
      COUNT(*)::int AS total_pedidos,
      COUNT(*) FILTER (WHERE jsonb_array_length(itens) >= 2)::int AS multi_item,
      ROUND(AVG(jsonb_array_length(itens)), 1)::float AS media_itens
    FROM sync.bling_orders
    WHERE itens IS NOT NULL AND jsonb_array_length(itens) > 0
  `);

  // Produtos mais vendidos (para recomendar quando não há par)
  const topProdutos = await query<{
    sku: string; nome: string; valor: number; vendas: number;
  }>(`
    SELECT
      item->>'codigo' AS sku,
      item->>'descricao' AS nome,
      ROUND(AVG((item->>'valor')::numeric), 2)::float AS valor,
      COUNT(*)::int AS vendas
    FROM sync.bling_orders o,
      jsonb_array_elements(o.itens) AS item
    WHERE item->>'codigo' IS NOT NULL
      AND o.criado_bling >= NOW() - INTERVAL '3 months'
    GROUP BY item->>'codigo', item->>'descricao'
    ORDER BY vendas DESC
    LIMIT 20
  `);

  // Imagens dos produtos (do Bling)
  const skus = new Set([
    ...pares.flatMap(p => [p.sku_a, p.sku_b]),
    ...topProdutos.map(p => p.sku),
  ]);
  const imagensRows = await query<{ sku: string; img: string }>(
    `SELECT COALESCE(np.sku, bp.sku) AS sku,
            COALESCE(np.imagens->0 #>> '{}', bp.imagens->0->>'url') AS img
     FROM sync.bling_products bp
     LEFT JOIN sync.nuvemshop_products np ON LOWER(np.sku) = LOWER(bp.sku) AND np.imagens IS NOT NULL AND jsonb_array_length(np.imagens) > 0
     WHERE bp.sku = ANY($1) AND (bp.imagens IS NOT NULL AND jsonb_array_length(bp.imagens) > 0 OR np.imagens IS NOT NULL)`,
    [Array.from(skus)],
  );
  const imagens: Record<string, string> = {};
  for (const r of imagensRows) if (r.img) imagens[r.sku] = r.img;

  return {
    stats: {
      total_pedidos: stats?.total_pedidos || 0,
      multi_item: stats?.multi_item || 0,
      pct_multi: stats?.total_pedidos ? Math.round((stats.multi_item / stats.total_pedidos) * 100) : 0,
      media_itens: stats?.media_itens || 0,
    },
    pares: pares.map(p => ({
      ...p,
      img_a: imagens[p.sku_a] || null,
      img_b: imagens[p.sku_b] || null,
    })),
    top_produtos: topProdutos.map(p => ({
      ...p,
      img: imagens[p.sku] || null,
    })),
  };
  });
  res.json(data);
});

// ── GET /api/analytics/cross-sell/recommend/:customerId ─────────
// Recomendações para um cliente específico baseado em sua última compra

analyticsRouter.get("/cross-sell/recommend/:customerId", async (req: Request, res: Response) => {
  const { customerId } = req.params;

  // Última compra do cliente
  const ultimaCompra = await queryOne<{
    id: string; itens: any; criado_bling: string;
  }>(`
    SELECT id, itens, criado_bling
    FROM sync.bling_orders
    WHERE customer_id = $1 AND itens IS NOT NULL AND jsonb_array_length(itens) > 0
    ORDER BY criado_bling DESC LIMIT 1
  `, [customerId]);

  if (!ultimaCompra) {
    res.json({ recomendacoes: [], motivo: "Sem pedidos" });
    return;
  }

  // SKUs da última compra
  const skusComprados: string[] = [];
  for (const item of ultimaCompra.itens) {
    if (item.codigo) skusComprados.push(item.codigo);
  }

  if (skusComprados.length === 0) {
    res.json({ recomendacoes: [], motivo: "Pedido sem SKUs" });
    return;
  }

  // Buscar produtos frequentemente comprados junto com os itens da última compra
  const recomendacoes = await query<{
    sku: string; nome: string; valor: number; score: number;
  }>(`
    WITH comprados AS (
      SELECT unnest($1::text[]) AS sku
    ),
    pares AS (
      SELECT
        CASE WHEN a.value->>'codigo' = ANY($1::text[]) THEN b.value->>'codigo' ELSE a.value->>'codigo' END AS sku_recom,
        CASE WHEN a.value->>'codigo' = ANY($1::text[]) THEN b.value->>'descricao' ELSE a.value->>'descricao' END AS nome,
        CASE WHEN a.value->>'codigo' = ANY($1::text[]) THEN (b.value->>'valor')::numeric ELSE (a.value->>'valor')::numeric END AS valor
      FROM sync.bling_orders o,
        jsonb_array_elements(o.itens) WITH ORDINALITY AS a(value, ord_a),
        jsonb_array_elements(o.itens) WITH ORDINALITY AS b(value, ord_b)
      WHERE jsonb_array_length(o.itens) >= 2
        AND a.ord_a < b.ord_a
        AND (a.value->>'codigo' = ANY($1::text[]) OR b.value->>'codigo' = ANY($1::text[]))
    )
    SELECT sku_recom AS sku, nome, ROUND(AVG(valor), 2)::float AS valor, COUNT(*)::int AS score
    FROM pares
    WHERE sku_recom != ALL($1::text[])
      AND sku_recom IS NOT NULL
    GROUP BY sku_recom, nome
    ORDER BY score DESC
    LIMIT 6
  `, [skusComprados]);

  // Imagens
  const imgRows = await query<{ sku: string; img: string }>(
    `SELECT COALESCE(np.sku, bp.sku) AS sku,
            COALESCE(np.imagens->0 #>> '{}', bp.imagens->0->>'url') AS img
     FROM sync.bling_products bp
     LEFT JOIN sync.nuvemshop_products np ON LOWER(np.sku) = LOWER(bp.sku) AND np.imagens IS NOT NULL AND jsonb_array_length(np.imagens) > 0
     WHERE bp.sku = ANY($1) AND (bp.imagens IS NOT NULL AND jsonb_array_length(bp.imagens) > 0 OR np.imagens IS NOT NULL)`,
    [recomendacoes.map(r => r.sku)],
  );
  const imgs: Record<string, string> = {};
  for (const r of imgRows) if (r.img) imgs[r.sku] = r.img;

  // URL da NuvemShop para cada produto
  const nsRows = await query<{ sku: string; url: string }>(
    `SELECT bp.sku, 'https://www.papelariabibelo.com.br/produtos/' || bp.sku AS url
     FROM sync.bling_products bp WHERE bp.sku = ANY($1)`,
    [recomendacoes.map(r => r.sku)],
  );
  const urls: Record<string, string> = {};
  for (const r of nsRows) urls[r.sku] = r.url;

  res.json({
    customer_id: customerId,
    ultima_compra: ultimaCompra.criado_bling,
    skus_comprados: skusComprados,
    recomendacoes: recomendacoes.map(r => ({
      ...r,
      img: imgs[r.sku] || null,
      url: urls[r.sku] || null,
    })),
  });
});

// ── GET /api/analytics/timeline-unificado — feed único de todas as atividades ─

const JANELA_MAP: Record<string, string> = {
  "1h":  "1 hour",
  "24h": "24 hours",
  "7d":  "7 days",
  "30d": "30 days",
};

analyticsRouter.get("/timeline-unificado", authMiddleware, async (req: Request, res: Response) => {
  const janela = JANELA_MAP[String(req.query.janela || "24h")] || "24 hours";
  const limit  = Math.min(parseInt(String(req.query.limit  || "60"),  10), 200);
  const offset = parseInt(String(req.query.offset || "0"), 10);

  const rows = await query<{
    tipo: string; subtipo: string; descricao: string | null;
    detalhe: string | null; valor: number | null;
    customer_nome: string | null; customer_email: string | null;
    geo_city: string | null; geo_region: string | null;
    criado_em: string;
  }>(
    `SELECT tipo, subtipo, descricao, detalhe, valor,
            customer_nome, customer_email, geo_city, geo_region, criado_em
     FROM (
       -- ── Eventos de site (tracking) ──────────────────────────────
       SELECT
         'site'                   AS tipo,
         t.evento                 AS subtipo,
         COALESCE(t.resource_nome, t.pagina, t.evento) AS descricao,
         NULL::text               AS detalhe,
         t.resource_preco         AS valor,
         c.nome                   AS customer_nome,
         c.email                  AS customer_email,
         t.geo_city, t.geo_region,
         t.criado_em
       FROM crm.tracking_events t
       LEFT JOIN crm.customers c ON c.id = t.customer_id
       WHERE t.criado_em >= NOW() - $1::interval
         AND t.evento IN ('product_view','add_to_cart','popup_submit','banner_click','search','purchase')

       UNION ALL

       -- ── Emails enviados por fluxo ────────────────────────────────
       SELECT
         'email_fluxo'            AS tipo,
         f.nome                   AS subtipo,
         c.nome                   AS descricao,
         fse.resultado->>'template' AS detalhe,
         NULL::numeric            AS valor,
         c.nome                   AS customer_nome,
         c.email                  AS customer_email,
         NULL, NULL,
         fse.executado_em         AS criado_em
       FROM marketing.flow_step_executions fse
       JOIN marketing.flow_executions fe ON fe.id = fse.execution_id
       JOIN marketing.flows f            ON f.id  = fe.flow_id
       JOIN crm.customers c             ON c.id  = fe.customer_id
       WHERE fse.tipo = 'email' AND fse.status = 'concluido'
         AND fse.executado_em >= NOW() - $1::interval

       UNION ALL

       -- ── Interações de email (opens, clicks, bounces) ─────────────
       SELECT
         'email_interacao'        AS tipo,
         ee.tipo                  AS subtipo,
         COALESCE(c.nome, c.email) AS descricao,
         CASE WHEN ee.tipo = 'clicked' THEN ee.link ELSE NULL END AS detalhe,
         NULL::numeric            AS valor,
         c.nome                   AS customer_nome,
         c.email                  AS customer_email,
         NULL, NULL,
         ee.criado_em
       FROM marketing.email_events ee
       JOIN crm.customers c ON c.id = ee.customer_id
       WHERE ee.tipo IN ('opened','clicked','bounced','complained')
         AND ee.criado_em >= NOW() - $1::interval

       UNION ALL

       -- ── Novos leads capturados ───────────────────────────────────
       SELECT
         'lead'                   AS tipo,
         COALESCE(l.fonte, 'popup') AS subtipo,
         COALESCE(l.nome, l.email)  AS descricao,
         CASE WHEN l.email_verificado THEN 'verificado' ELSE 'pendente' END AS detalhe,
         NULL::numeric            AS valor,
         l.nome                   AS customer_nome,
         l.email                  AS customer_email,
         NULL, NULL,
         l.criado_em
       FROM marketing.leads l
       WHERE l.criado_em >= NOW() - $1::interval

       UNION ALL

       -- ── Vendas NuvemShop ─────────────────────────────────────────
       SELECT
         'venda'                  AS tipo,
         no.status                AS subtipo,
         c.nome                   AS descricao,
         no.numero                AS detalhe,
         no.valor                 AS valor,
         c.nome                   AS customer_nome,
         c.email                  AS customer_email,
         NULL, NULL,
         no.webhook_em            AS criado_em
       FROM sync.nuvemshop_orders no
       JOIN crm.customers c ON c.id = no.customer_id
       WHERE no.webhook_em >= NOW() - $1::interval
         AND no.status IN ('paid','pago','processing','completed','aprovado')

     ) combined
     ORDER BY criado_em DESC
     LIMIT $2 OFFSET $3`,
    [janela, limit, offset]
  );

  res.json(rows);
});

// ── GET /api/analytics/flow-activity — atividade de fluxos para o Dashboard ───

analyticsRouter.get("/flow-activity", async (req: Request, res: Response) => {
  const { intervalo } = periodoToInterval(req.query.periodo as string);

  const [recentSends, upcoming, activeFlows, eventCounts, recentEvents] = await Promise.all([
    // 1. Emails enviados recentemente via fluxos
    query<{
      customer_nome: string; customer_email: string;
      flow_nome: string; executado_em: string;
    }>(
      `SELECT c.nome AS customer_nome, c.email AS customer_email,
              f.nome AS flow_nome, fse.executado_em
       FROM marketing.flow_step_executions fse
       JOIN marketing.flow_executions fe ON fe.id = fse.execution_id
       JOIN marketing.flows f ON f.id = fe.flow_id
       JOIN crm.customers c ON c.id = fe.customer_id
       WHERE fse.tipo = 'email' AND fse.status = 'concluido'
         AND fse.executado_em >= NOW() - $1::interval
       ORDER BY fse.executado_em DESC
       LIMIT 20`,
      [intervalo]
    ),

    // 2. Próximos envios agendados
    query<{
      customer_nome: string; customer_email: string;
      flow_nome: string; step_tipo: string; agendado_para: string;
    }>(
      `SELECT c.nome AS customer_nome, c.email AS customer_email,
              f.nome AS flow_nome, fse.tipo AS step_tipo, fse.agendado_para
       FROM marketing.flow_step_executions fse
       JOIN marketing.flow_executions fe ON fe.id = fse.execution_id
       JOIN marketing.flows f ON f.id = fe.flow_id
       JOIN crm.customers c ON c.id = fe.customer_id
       WHERE fse.status = 'pendente' AND fse.agendado_para > NOW()
         AND fe.status IN ('ativo', 'executando')
       ORDER BY fse.agendado_para ASC
       LIMIT 15`
    ),

    // 3. Panorama dos fluxos ativos
    query<{
      id: string; nome: string; gatilho: string;
      execucoes_ativas: number; execucoes_concluidas: number;
      execucoes_erro: number; emails_enviados: number;
    }>(
      `SELECT f.id, f.nome, f.gatilho,
              COUNT(DISTINCT fe.id) FILTER (WHERE fe.status IN ('ativo','executando'))::int AS execucoes_ativas,
              COUNT(DISTINCT fe.id) FILTER (WHERE fe.status = 'concluido')::int AS execucoes_concluidas,
              COUNT(DISTINCT fe.id) FILTER (WHERE fe.status = 'erro')::int AS execucoes_erro,
              COUNT(DISTINCT fse.id) FILTER (
                WHERE fse.tipo = 'email' AND fse.status = 'concluido'
                  AND fse.executado_em >= NOW() - $1::interval
              )::int AS emails_enviados
       FROM marketing.flows f
       LEFT JOIN marketing.flow_executions fe ON fe.flow_id = f.id
       LEFT JOIN marketing.flow_step_executions fse ON fse.execution_id = fe.id
       WHERE f.ativo = true
       GROUP BY f.id, f.nome, f.gatilho
       ORDER BY execucoes_ativas DESC, emails_enviados DESC`,
      [intervalo]
    ),

    // 4a. Contagem de interações de email (fluxos + campanhas)
    queryOne<{ opened: number; clicked: number; bounced: number; complained: number }>(
      `SELECT
         COUNT(*) FILTER (WHERE tipo = 'opened')::int AS opened,
         COUNT(*) FILTER (WHERE tipo = 'clicked')::int AS clicked,
         COUNT(*) FILTER (WHERE tipo = 'bounced')::int AS bounced,
         COUNT(*) FILTER (WHERE tipo = 'complained')::int AS complained
       FROM marketing.email_events
       WHERE criado_em >= NOW() - $1::interval`,
      [intervalo]
    ),

    // 4b. Eventos recentes de interação
    query<{
      tipo: string; customer_nome: string | null;
      customer_email: string; link: string | null; criado_em: string;
    }>(
      `SELECT ee.tipo, c.nome AS customer_nome, c.email AS customer_email,
              ee.link, ee.criado_em
       FROM marketing.email_events ee
       LEFT JOIN crm.customers c ON c.id = ee.customer_id
       WHERE ee.criado_em >= NOW() - $1::interval
       ORDER BY ee.criado_em DESC
       LIMIT 20`,
      [intervalo]
    ),
  ]);

  res.json({
    recentSends,
    upcoming,
    activeFlows,
    emailInteractions: {
      ...(eventCounts || { opened: 0, clicked: 0, bounced: 0, complained: 0 }),
      recentEvents,
    },
  });
});
