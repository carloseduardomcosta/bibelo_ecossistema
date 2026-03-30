import { Router, Request, Response } from "express";
import { query, queryOne } from "../db";
import { authMiddleware } from "../middleware/auth";

export const ordersRouter = Router();
ordersRouter.use(authMiddleware);

// ── GET /api/orders/stats — KPIs de pedidos ───────────────────

ordersRouter.get("/stats", async (req: Request, res: Response) => {
  const dias = Math.min(Number(req.query.dias) || 30, 365);

  const stats = await queryOne<Record<string, unknown>>(`
    WITH periodo AS (
      SELECT
        COUNT(*) AS total,
        COALESCE(SUM(valor), 0) AS receita,
        COALESCE(AVG(valor), 0) AS ticket_medio,
        COUNT(*) FILTER (WHERE canal = 'fisico') AS fisico,
        COUNT(*) FILTER (WHERE canal IN ('nuvemshop', 'online')) AS online,
        COUNT(*) FILTER (WHERE canal = 'shopee') AS shopee
      FROM sync.bling_orders
      WHERE status = '1' AND criado_bling >= CURRENT_DATE - make_interval(days => $1)
    ),
    anterior AS (
      SELECT COUNT(*) AS total, COALESCE(SUM(valor), 0) AS receita
      FROM sync.bling_orders
      WHERE status = '1'
        AND criado_bling >= CURRENT_DATE - make_interval(days => $1 * 2)
        AND criado_bling < CURRENT_DATE - make_interval(days => $1)
    ),
    ns AS (
      SELECT COUNT(*) AS total, COALESCE(SUM(valor), 0) AS receita
      FROM sync.nuvemshop_orders
      WHERE status = 'paid' AND webhook_em >= CURRENT_DATE - make_interval(days => $1)
    )
    SELECT
      p.total::int AS total_pedidos,
      p.receita::numeric(12,2) AS receita,
      p.ticket_medio::numeric(12,2) AS ticket_medio,
      p.fisico::int AS fisico,
      p.online::int AS online,
      p.shopee::int AS shopee,
      a.total::int AS anterior_total,
      a.receita::numeric(12,2) AS anterior_receita,
      ns.total::int AS ns_total,
      ns.receita::numeric(12,2) AS ns_receita,
      CASE WHEN a.total > 0 THEN ROUND((p.total - a.total) * 100.0 / a.total, 1) ELSE 0 END AS variacao_pedidos,
      CASE WHEN a.receita > 0 THEN ROUND((p.receita - a.receita) * 100.0 / a.receita, 1) ELSE 0 END AS variacao_receita
    FROM periodo p, anterior a, ns
  `, [dias]);

  res.json(stats);
});

// ── GET /api/orders — lista paginada de pedidos ──────────────

ordersRouter.get("/", async (req: Request, res: Response) => {
  const page = Math.max(1, parseInt(String(req.query.page || "1"), 10));
  const limit = 30;
  const offset = (page - 1) * limit;
  const search = String(req.query.search || "").trim();
  const canal = String(req.query.canal || "");
  const status = String(req.query.status || "");
  const periodo = String(req.query.periodo || "");
  const ordenar = String(req.query.ordenar || "recentes");

  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (search) {
    conditions.push(`(o.numero::text ILIKE $${idx} OR c.nome ILIKE $${idx} OR c.email ILIKE $${idx})`);
    params.push(`%${search}%`);
    idx++;
  }

  if (canal === "fisico") {
    conditions.push("o.canal = 'fisico'");
  } else if (canal === "online") {
    conditions.push("o.canal IN ('nuvemshop', 'online')");
  } else if (canal === "shopee") {
    conditions.push("o.canal = 'shopee'");
  }

  if (status === "ativo") {
    conditions.push("o.status = '1'");
  } else if (status === "cancelado") {
    conditions.push("o.status != '1'");
  }

  if (periodo) {
    const diasMap: Record<string, number> = { "7d": 7, "15d": 15, "30d": 30, "3m": 90, "6m": 180, "1a": 365 };
    const diasPeriodo = diasMap[periodo];
    if (diasPeriodo) {
      conditions.push(`o.criado_bling >= CURRENT_DATE - make_interval(days => $${idx})`);
      params.push(diasPeriodo);
      idx++;
    }
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  let orderBy = "o.criado_bling DESC";
  if (ordenar === "maior_valor") orderBy = "o.valor DESC";
  else if (ordenar === "menor_valor") orderBy = "o.valor ASC";
  else if (ordenar === "numero") orderBy = "o.numero DESC";

  params.push(limit, offset);

  const [orders, countResult] = await Promise.all([
    query<Record<string, unknown>>(
      `SELECT
        o.id, o.bling_id, o.numero, o.valor, o.status, o.canal,
        o.itens, o.criado_bling, o.sincronizado_em,
        c.id AS customer_id, c.nome AS cliente_nome, c.email AS cliente_email,
        c.telefone AS cliente_telefone,
        (SELECT string_agg(DISTINCT p.forma_descricao, ', ')
         FROM sync.bling_order_parcelas p WHERE p.order_bling_id = o.bling_id
        ) AS formas_pagamento,
        (SELECT COALESCE(SUM(p.valor), 0)
         FROM sync.bling_order_parcelas p WHERE p.order_bling_id = o.bling_id
        ) AS valor_parcelas
      FROM sync.bling_orders o
      LEFT JOIN crm.customers c ON c.id = o.customer_id
      ${where}
      ORDER BY ${orderBy}
      LIMIT $${idx} OFFSET $${idx + 1}`,
      params
    ),
    queryOne<{ total: string }>(
      `SELECT COUNT(*)::text AS total
       FROM sync.bling_orders o
       LEFT JOIN crm.customers c ON c.id = o.customer_id
       ${where}`,
      params.slice(0, -2)
    ),
  ]);

  const total = parseInt(countResult?.total || "0", 10);

  res.json({
    orders,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

// ── GET /api/orders/:id — detalhe do pedido ──────────────────

ordersRouter.get("/:id", async (req: Request, res: Response) => {
  const order = await queryOne<Record<string, unknown>>(
    `SELECT
      o.id, o.bling_id, o.numero, o.valor, o.status, o.canal,
      o.itens, o.criado_bling, o.sincronizado_em,
      c.id AS customer_id, c.nome AS cliente_nome, c.email AS cliente_email,
      c.telefone AS cliente_telefone, c.canal_origem AS cliente_canal
    FROM sync.bling_orders o
    LEFT JOIN crm.customers c ON c.id = o.customer_id
    WHERE o.id = $1`,
    [req.params.id]
  );

  if (!order) {
    res.status(404).json({ error: "Pedido não encontrado" });
    return;
  }

  // Itens detalhados com custo (NF de entrada → bling_products → fallback)
  const itensDetalhados = await query<Record<string, unknown>>(
    `SELECT
      i->>'descricao' AS descricao,
      i->>'codigo' AS sku,
      (i->>'valor')::numeric AS preco_venda,
      (i->>'quantidade')::numeric AS quantidade,
      (i->>'desconto')::numeric AS desconto,
      i->'produto'->>'id' AS produto_bling_id,
      bp.preco_custo AS custo_produto,
      bp.preco_venda AS preco_catalogo,
      bp.categoria,
      bp.dados_raw->>'imagemURL' AS imagem_url,
      (SELECT ni.valor_unitario
       FROM financeiro.notas_entrada_itens ni
       WHERE ni.codigo_produto = i->>'codigo'
       ORDER BY ni.id DESC LIMIT 1
      ) AS custo_nf
    FROM jsonb_array_elements($1::jsonb) AS i
    LEFT JOIN sync.bling_products bp ON bp.sku = i->>'codigo'`,
    [JSON.stringify(order.itens || [])]
  );

  // Parcelas/pagamento
  const parcelas = await query<Record<string, unknown>>(
    `SELECT forma_descricao, valor, data_vencimento
     FROM sync.bling_order_parcelas
     WHERE order_bling_id = $1
     ORDER BY data_vencimento`,
    [order.bling_id]
  );

  // Totais de custo
  let custoTotal = 0;
  for (const item of itensDetalhados) {
    const custo = Number(item.custo_nf) || Number(item.custo_produto) || 0;
    const qtd = Number(item.quantidade) || 1;
    custoTotal += custo * qtd;
  }

  res.json({
    ...order,
    itens_detalhados: itensDetalhados,
    parcelas,
    custo_total: custoTotal,
    lucro_estimado: Number(order.valor) - custoTotal,
    margem_percentual: Number(order.valor) > 0 ? Math.round((Number(order.valor) - custoTotal) / Number(order.valor) * 100) : 0,
  });
});
