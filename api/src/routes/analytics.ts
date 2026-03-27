import { Router, Request, Response } from "express";
import { query, queryOne } from "../db";
import { authMiddleware } from "../middleware/auth";

export const analyticsRouter = Router();
analyticsRouter.use(authMiddleware);

// ── Helper: converte periodo em intervalo SQL ───────────────────

function periodoToInterval(periodo?: string): { intervalo: string; dias: number } {
  switch (periodo) {
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

  // Período atual
  const atual = await queryOne<{ pedidos: string; receita: string; ticket: string }>(`
    SELECT COUNT(*)::text AS pedidos,
           COALESCE(SUM(valor), 0)::text AS receita,
           COALESCE(AVG(valor) FILTER (WHERE valor > 0), 0)::text AS ticket
    FROM sync.bling_orders
    WHERE criado_bling >= NOW() - INTERVAL '${intervalo}'
  `);

  // Período anterior (mesma duração, antes do atual)
  const anterior = await queryOne<{ pedidos: string; receita: string; ticket: string }>(`
    SELECT COUNT(*)::text AS pedidos,
           COALESCE(SUM(valor), 0)::text AS receita,
           COALESCE(AVG(valor) FILTER (WHERE valor > 0), 0)::text AS ticket
    FROM sync.bling_orders
    WHERE criado_bling >= NOW() - INTERVAL '${dias * 2} days'
      AND criado_bling < NOW() - INTERVAL '${intervalo}'
  `);

  // Clientes que compraram no período (ativos de verdade)
  const clientesPeriodo = await queryOne<{ compraram: string; compraram_anterior: string }>(`
    SELECT
      COUNT(DISTINCT customer_id) FILTER (WHERE criado_bling >= NOW() - INTERVAL '${intervalo}')::text AS compraram,
      COUNT(DISTINCT customer_id) FILTER (
        WHERE criado_bling >= NOW() - INTERVAL '${dias * 2} days'
          AND criado_bling < NOW() - INTERVAL '${intervalo}'
      )::text AS compraram_anterior
    FROM sync.bling_orders
    WHERE customer_id IS NOT NULL
  `);

  const totalClientes = await queryOne<{ total: string; novos: string; novos_anterior: string }>(`
    SELECT COUNT(*)::text AS total,
           COUNT(*) FILTER (WHERE criado_em >= NOW() - INTERVAL '${intervalo}')::text AS novos,
           COUNT(*) FILTER (
             WHERE criado_em >= NOW() - INTERVAL '${dias * 2} days'
               AND criado_em < NOW() - INTERVAL '${intervalo}'
           )::text AS novos_anterior
    FROM crm.customers WHERE ativo = true
  `);

  const receitaTotal = await queryOne<{ total: string }>(`
    SELECT COALESCE(SUM(valor), 0)::text AS total FROM sync.bling_orders
  `);

  // Despesas no período (do módulo financeiro)
  const despesasPeriodo = await queryOne<{ total: string; anterior: string }>(`
    SELECT
      COALESCE(SUM(valor) FILTER (WHERE data >= (CURRENT_DATE - INTERVAL '${intervalo}')::date), 0)::text AS total,
      COALESCE(SUM(valor) FILTER (
        WHERE data >= (CURRENT_DATE - INTERVAL '${dias * 2} days')::date
          AND data < (CURRENT_DATE - INTERVAL '${intervalo}')::date
      ), 0)::text AS anterior
    FROM financeiro.lancamentos
    WHERE tipo = 'despesa' AND status != 'cancelado'
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
    WHERE criado_bling >= NOW() - INTERVAL '${intervalo}' AND criado_bling IS NOT NULL
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
    WHERE o.criado_bling >= NOW() - INTERVAL '${intervalo}'
    GROUP BY c.id, c.nome
    ORDER BY SUM(o.valor) DESC
    LIMIT 10
  `);

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

  // Filtro por mes: vencimento dentro do mes selecionado
  let cpDateFilter = "";
  if (mes && /^\d{4}-\d{2}$/.test(mes)) {
    cpDateFilter = `AND vencimento >= '${mes}-01'::date AND vencimento < ('${mes}-01'::date + INTERVAL '1 month')`;
  } else {
    const { intervalo } = periodoToInterval(req.query.periodo as string);
    if (req.query.periodo) cpDateFilter = `AND vencimento >= NOW() - INTERVAL '${intervalo}'`;
  }

  const conditions: string[] = [];
  if (status === "pendente") conditions.push("situacao = 1");
  else if (status === "pago") conditions.push("situacao = 2");
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const resumo = await queryOne<{
    total: string; pendentes: string; pagas: string;
    valor_pendente: string; valor_pago: string;
    vencidas: string; valor_vencido: string;
  }>(`
    SELECT
      COUNT(*)::text AS total,
      COUNT(*) FILTER (WHERE situacao = 1)::text AS pendentes,
      COUNT(*) FILTER (WHERE situacao = 2)::text AS pagas,
      COALESCE(SUM(valor) FILTER (WHERE situacao = 1), 0)::text AS valor_pendente,
      COALESCE(SUM(valor_pago) FILTER (WHERE situacao = 2), 0)::text AS valor_pago,
      COUNT(*) FILTER (WHERE situacao = 1 AND vencimento < CURRENT_DATE)::text AS vencidas,
      COALESCE(SUM(valor) FILTER (WHERE situacao = 1 AND vencimento < CURRENT_DATE), 0)::text AS valor_vencido
    FROM sync.bling_contas_pagar
    WHERE 1=1 ${cpDateFilter}
  `);

  const contas = await query<{
    bling_id: string; situacao: number; vencimento: string; valor: number;
    numero_documento: string; historico: string; contato_nome: string;
    forma_pagamento: string; data_pagamento: string; valor_pago: number;
  }>(`
    SELECT bling_id, situacao, vencimento, valor, numero_documento, historico,
           contato_nome, forma_pagamento, data_pagamento, valor_pago
    FROM sync.bling_contas_pagar
    ${where} ${where ? cpDateFilter : cpDateFilter.replace("AND", "WHERE")}
    ORDER BY CASE WHEN situacao = 1 AND vencimento < CURRENT_DATE THEN 0
                  WHEN situacao = 1 THEN 1
                  ELSE 2 END,
             vencimento ASC
    LIMIT 100
  `);

  const porFornecedor = await query<{ fornecedor: string; total: string; valor: string }>(`
    SELECT COALESCE(NULLIF(contato_nome, ''), 'Não informado') AS fornecedor,
           COUNT(*)::text AS total,
           COALESCE(SUM(valor), 0)::text AS valor
    FROM sync.bling_contas_pagar
    WHERE 1=1 ${cpDateFilter}
    GROUP BY contato_nome
    ORDER BY SUM(valor) DESC
    LIMIT 10
  `);

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
  const dateFilter = intervalo !== "1 month" || req.query.periodo ? `WHERE p.data_vencimento >= NOW() - INTERVAL '${intervalo}'` : "";
  const dateFilterAnd = dateFilter ? `AND p.data_vencimento >= NOW() - INTERVAL '${intervalo}'` : "";

  const porForma = await query<{ forma: string; total_pedidos: string; valor_total: string }>(`
    SELECT
      COALESCE(p.forma_descricao, 'Não informado') AS forma,
      COUNT(DISTINCT p.order_bling_id)::text AS total_pedidos,
      COALESCE(SUM(p.valor), 0)::text AS valor_total
    FROM sync.bling_order_parcelas p
    ${dateFilter}
    GROUP BY p.forma_descricao
    ORDER BY SUM(p.valor) DESC
  `);

  const porMes = await query<{ mes: string; forma: string; valor: string }>(`
    SELECT
      TO_CHAR(p.data_vencimento, 'YYYY-MM') AS mes,
      COALESCE(p.forma_descricao, 'Outros') AS forma,
      SUM(p.valor)::text AS valor
    FROM sync.bling_order_parcelas p
    WHERE p.data_vencimento IS NOT NULL ${dateFilterAnd}
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
  const nfeDateFilter = req.query.periodo ? `AND data_emissao >= NOW() - INTERVAL '${intervalo}'` : "";

  const resumo = await queryOne<{
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
    WHERE 1=1 ${nfeDateFilter}
  `);

  const porMes = await query<{ mes: string; quantidade: string; valor: string }>(`
    SELECT
      TO_CHAR(data_emissao, 'YYYY-MM') AS mes,
      COUNT(*)::text AS quantidade,
      COALESCE(SUM(valor_total), 0)::text AS valor
    FROM sync.bling_nfe
    WHERE data_emissao IS NOT NULL AND situacao IN (4, 6) ${nfeDateFilter}
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
