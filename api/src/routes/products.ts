import { Router, Request, Response } from "express";
import { z } from "zod";
import { query, queryOne } from "../db";
import { authMiddleware } from "../middleware/auth";

export const productsRouter = Router();
productsRouter.use(authMiddleware);

// ── Schemas ─────────────────────────────────────────────────────

const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  categoria: z.string().optional(),
  ativo: z.coerce.boolean().optional(),
});

// ── GET /api/products — lista paginada ──────────────────────────

productsRouter.get("/", async (req: Request, res: Response) => {
  const parse = listSchema.safeParse(req.query);
  if (!parse.success) {
    res.status(400).json({ error: "Parâmetros inválidos" });
    return;
  }

  const { page, limit, search, categoria, ativo } = parse.data;
  const offset = (page - 1) * limit;

  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (ativo !== undefined) {
    conditions.push(`p.ativo = $${idx}`);
    params.push(ativo);
    idx++;
  }

  if (search) {
    conditions.push(`(p.nome ILIKE $${idx} OR p.sku ILIKE $${idx})`);
    params.push(`%${search}%`);
    idx++;
  }

  if (categoria) {
    conditions.push(`p.categoria = $${idx}`);
    params.push(categoria);
    idx++;
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const countResult = await queryOne<{ total: string }>(
    `SELECT COUNT(*)::text AS total FROM sync.bling_products p ${where}`,
    params
  );
  const total = parseInt(countResult?.total || "0", 10);

  params.push(limit, offset);
  const rows = await query(
    `SELECT
       p.id, p.bling_id, p.nome, p.sku, p.preco_custo, p.preco_venda,
       p.categoria, p.imagens, p.ativo, p.tipo, p.unidade,
       COALESCE(s.estoque_total, 0) AS estoque_total,
       CASE WHEN p.preco_venda > 0
         THEN ROUND((p.preco_venda - p.preco_custo) / p.preco_venda * 100, 1)
         ELSE 0
       END AS margem_percentual
     FROM sync.bling_products p
     LEFT JOIN (
       SELECT product_id, SUM(saldo_fisico) AS estoque_total
       FROM sync.bling_stock
       GROUP BY product_id
     ) s ON s.product_id = p.id
     ${where}
     ORDER BY p.nome ASC
     LIMIT $${idx} OFFSET $${idx + 1}`,
    params
  );

  res.json({
    data: rows,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

// ── GET /api/products/categories — categorias distintas ─────────

productsRouter.get("/categories", async (_req: Request, res: Response) => {
  const rows = await query<{ categoria: string }>(
    `SELECT DISTINCT categoria FROM sync.bling_products
     WHERE categoria IS NOT NULL AND ativo = true
     ORDER BY categoria`
  );
  res.json({ data: rows.map((r) => r.categoria) });
});

// ── GET /api/products/stock-overview — resumo de estoque ────────

productsRouter.get("/stock-overview", async (_req: Request, res: Response) => {
  const totals = await queryOne<{
    total_produtos: string;
    total_ativos: string;
    sem_estoque: string;
    estoque_baixo: string;
    valor_estoque_custo: string;
    valor_estoque_venda: string;
  }>(`
    SELECT
      COUNT(*)::text AS total_produtos,
      COUNT(*) FILTER (WHERE p.ativo)::text AS total_ativos,
      COUNT(*) FILTER (WHERE p.ativo AND COALESCE(s.saldo, 0) = 0)::text AS sem_estoque,
      COUNT(*) FILTER (WHERE p.ativo AND COALESCE(s.saldo, 0) > 0 AND COALESCE(s.saldo, 0) <= 5)::text AS estoque_baixo,
      COALESCE(SUM(p.preco_custo * COALESCE(s.saldo, 0)), 0)::text AS valor_estoque_custo,
      COALESCE(SUM(p.preco_venda * COALESCE(s.saldo, 0)), 0)::text AS valor_estoque_venda
    FROM sync.bling_products p
    LEFT JOIN (
      SELECT product_id, SUM(saldo_fisico) AS saldo
      FROM sync.bling_stock GROUP BY product_id
    ) s ON s.product_id = p.id
  `);

  const porCategoria = await query<{
    categoria: string;
    qtd_produtos: string;
    estoque_total: string;
  }>(`
    SELECT
      COALESCE(p.categoria, 'Sem categoria') AS categoria,
      COUNT(*)::text AS qtd_produtos,
      COALESCE(SUM(s.saldo), 0)::text AS estoque_total
    FROM sync.bling_products p
    LEFT JOIN (
      SELECT product_id, SUM(saldo_fisico) AS saldo
      FROM sync.bling_stock GROUP BY product_id
    ) s ON s.product_id = p.id
    WHERE p.ativo = true
    GROUP BY p.categoria
    ORDER BY SUM(s.saldo) DESC NULLS LAST
  `);

  res.json({
    total_produtos: parseInt(totals?.total_produtos || "0", 10),
    total_ativos: parseInt(totals?.total_ativos || "0", 10),
    sem_estoque: parseInt(totals?.sem_estoque || "0", 10),
    estoque_baixo: parseInt(totals?.estoque_baixo || "0", 10),
    valor_estoque_custo: parseFloat(totals?.valor_estoque_custo || "0"),
    valor_estoque_venda: parseFloat(totals?.valor_estoque_venda || "0"),
    por_categoria: porCategoria.map((r) => ({
      categoria: r.categoria,
      qtd_produtos: parseInt(r.qtd_produtos, 10),
      estoque_total: parseFloat(r.estoque_total),
    })),
  });
});

// ── GET /api/products/stock-alerts — produtos críticos ───────────

productsRouter.get("/stock-alerts", async (_req: Request, res: Response) => {
  const rows = await query<{
    id: string; nome: string; sku: string; categoria: string;
    preco_venda: number; preco_custo: number; saldo: string;
  }>(`
    SELECT p.id, p.nome, p.sku, COALESCE(p.categoria, 'Sem categoria') AS categoria,
           p.preco_venda, p.preco_custo,
           COALESCE(s.saldo, 0)::text AS saldo
    FROM sync.bling_products p
    LEFT JOIN (SELECT product_id, SUM(saldo_fisico) AS saldo FROM sync.bling_stock GROUP BY product_id) s
      ON s.product_id = p.id
    WHERE p.ativo = true AND COALESCE(s.saldo, 0) <= 5
    ORDER BY COALESCE(s.saldo, 0) ASC, p.preco_venda DESC
    LIMIT 100
  `);

  const semEstoque = rows.filter((r) => parseFloat(r.saldo) === 0);
  const estoqueBaixo = rows.filter((r) => parseFloat(r.saldo) > 0);

  res.json({
    sem_estoque: semEstoque.map((r) => ({ ...r, saldo: parseFloat(r.saldo) })),
    estoque_baixo: estoqueBaixo.map((r) => ({ ...r, saldo: parseFloat(r.saldo) })),
    valor_perdido: semEstoque.reduce((s, r) => s + r.preco_venda, 0),
    custo_reposicao: semEstoque.reduce((s, r) => s + r.preco_custo, 0),
  });
});

// ── GET /api/products/:id — detalhe do produto ──────────────────

productsRouter.get("/:id", async (req: Request, res: Response) => {
  const product = await queryOne(
    `SELECT p.*,
       CASE WHEN p.preco_venda > 0
         THEN ROUND((p.preco_venda - p.preco_custo) / p.preco_venda * 100, 1)
         ELSE 0
       END AS margem_percentual
     FROM sync.bling_products p WHERE p.id = $1`,
    [req.params.id]
  );

  if (!product) {
    res.status(404).json({ error: "Produto não encontrado" });
    return;
  }

  const estoque = await query(
    `SELECT deposito_nome, saldo_fisico, saldo_virtual
     FROM sync.bling_stock WHERE product_id = $1
     ORDER BY deposito_nome`,
    [req.params.id]
  );

  // Vendas deste produto (via itens dos pedidos)
  const prod = product as { sku: string; bling_id: string };
  const vendas = await queryOne<{
    total_vendido: string;
    receita_total: string;
    ultima_venda: string;
  }>(`
    SELECT
      COALESCE(SUM((item->>'quantidade')::numeric), 0)::text AS total_vendido,
      COALESCE(SUM((item->>'quantidade')::numeric * (item->>'valor')::numeric), 0)::text AS receita_total,
      MAX(o.criado_bling)::text AS ultima_venda
    FROM sync.bling_orders o,
         jsonb_array_elements(o.itens) AS item
    WHERE (item->>'codigo' = $1 OR item->'produto'->>'id' = $2)
      AND o.status NOT IN ('cancelado', 'devolvido')
  `, [prod.sku || '', prod.bling_id]);

  const totalVendido = parseFloat(vendas?.total_vendido || "0");
  const receitaTotal = parseFloat(vendas?.receita_total || "0");
  const custoTotal = totalVendido * (prod as unknown as { preco_custo: number }).preco_custo;

  res.json({
    ...product,
    estoque,
    vendas: {
      total_vendido: totalVendido,
      receita_total: receitaTotal,
      custo_total: custoTotal,
      lucro_total: receitaTotal - custoTotal,
      ultima_venda: vendas?.ultima_venda || null,
    },
  });
});

// ── GET /api/products/profitability — análise de lucratividade ──

productsRouter.get("/analytics/profitability", async (req: Request, res: Response) => {
  const limit = Math.min(Number(req.query.limit) || 20, 100);

  // Top produtos por receita
  const topProdutos = await query<{
    bling_id: string;
    nome: string;
    sku: string;
    preco_custo: number;
    quantidade_vendida: string;
    receita: string;
  }>(`
    SELECT
      p.bling_id, p.nome, p.sku, p.preco_custo,
      SUM((item->>'quantidade')::numeric)::text AS quantidade_vendida,
      SUM((item->>'quantidade')::numeric * (item->>'valor')::numeric)::text AS receita
    FROM sync.bling_orders o,
         jsonb_array_elements(o.itens) AS item
    JOIN sync.bling_products p ON (p.sku = item->>'codigo' OR p.bling_id = item->'produto'->>'id')
    WHERE o.status NOT IN ('cancelado', 'devolvido')
    GROUP BY p.bling_id, p.nome, p.sku, p.preco_custo
    ORDER BY SUM((item->>'quantidade')::numeric * (item->>'valor')::numeric) DESC
    LIMIT $1
  `, [limit]);

  const formattedTop = topProdutos.map((p) => {
    const receita = parseFloat(p.receita);
    const qtd = parseFloat(p.quantidade_vendida);
    const custo = qtd * p.preco_custo;
    const lucro = receita - custo;
    return {
      bling_id: p.bling_id,
      nome: p.nome,
      sku: p.sku,
      quantidade_vendida: qtd,
      receita,
      custo,
      lucro,
      margem_percentual: receita > 0 ? Math.round((lucro / receita) * 1000) / 10 : 0,
    };
  });

  const receitaTotal = formattedTop.reduce((s, p) => s + p.receita, 0);
  const custoTotal = formattedTop.reduce((s, p) => s + p.custo, 0);
  const lucroTotal = receitaTotal - custoTotal;

  // Por categoria
  const porCategoria = await query<{
    categoria: string;
    receita: string;
    quantidade: string;
  }>(`
    SELECT
      COALESCE(p.categoria, 'Sem categoria') AS categoria,
      SUM((item->>'quantidade')::numeric * (item->>'valor')::numeric)::text AS receita,
      SUM((item->>'quantidade')::numeric)::text AS quantidade
    FROM sync.bling_orders o,
         jsonb_array_elements(o.itens) AS item
    JOIN sync.bling_products p ON (p.sku = item->>'codigo' OR p.bling_id = item->'produto'->>'id')
    WHERE o.status NOT IN ('cancelado', 'devolvido')
    GROUP BY p.categoria
    ORDER BY SUM((item->>'quantidade')::numeric * (item->>'valor')::numeric) DESC
  `);

  res.json({
    resumo: {
      receita_total: receitaTotal,
      custo_total: custoTotal,
      lucro_bruto: lucroTotal,
      margem_media: receitaTotal > 0 ? Math.round((lucroTotal / receitaTotal) * 1000) / 10 : 0,
    },
    top_produtos: formattedTop,
    por_categoria: porCategoria.map((c) => ({
      categoria: c.categoria,
      receita: parseFloat(c.receita),
      quantidade: parseFloat(c.quantidade),
    })),
  });
});
