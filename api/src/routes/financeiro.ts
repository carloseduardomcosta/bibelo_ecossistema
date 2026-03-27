import { Router, Request, Response } from "express";
import { z } from "zod";
import { query, queryOne } from "../db";
import { authMiddleware } from "../middleware/auth";

export const financeiroRouter = Router();
financeiroRouter.use(authMiddleware);

// ══════════════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════════════

function formatMesRef(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
}

// ══════════════════════════════════════════════════════════════
// DASHBOARD FINANCEIRO
// ══════════════════════════════════════════════════════════════

const dashboardSchema = z.object({
  periodo: z.enum(["mes_atual", "mes_anterior", "3m", "6m", "1a", "total"]).default("mes_atual"),
});

financeiroRouter.get("/dashboard", async (req: Request, res: Response) => {
  const parse = dashboardSchema.safeParse(req.query);
  if (!parse.success) { res.status(400).json({ error: "Parâmetros inválidos" }); return; }

  const { periodo } = parse.data;
  let dateFilter = "";
  const params: unknown[] = [];

  if (periodo === "mes_atual") {
    dateFilter = "AND l.data >= DATE_TRUNC('month', CURRENT_DATE) AND l.data < DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month'";
  } else if (periodo === "mes_anterior") {
    dateFilter = "AND l.data >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month' AND l.data < DATE_TRUNC('month', CURRENT_DATE)";
  } else if (periodo === "3m") {
    dateFilter = "AND l.data >= CURRENT_DATE - INTERVAL '3 months'";
  } else if (periodo === "6m") {
    dateFilter = "AND l.data >= CURRENT_DATE - INTERVAL '6 months'";
  } else if (periodo === "1a") {
    dateFilter = "AND l.data >= CURRENT_DATE - INTERVAL '1 year'";
  }
  // total = sem filtro

  // Totais
  const totais = await queryOne<{ receitas: string; despesas: string; saldo: string }>(`
    SELECT
      COALESCE(SUM(CASE WHEN l.tipo = 'receita' AND l.status != 'cancelado' THEN l.valor END), 0)::text AS receitas,
      COALESCE(SUM(CASE WHEN l.tipo = 'despesa' AND l.status != 'cancelado' THEN l.valor END), 0)::text AS despesas,
      (COALESCE(SUM(CASE WHEN l.tipo = 'receita' AND l.status != 'cancelado' THEN l.valor END), 0)
       - COALESCE(SUM(CASE WHEN l.tipo = 'despesa' AND l.status != 'cancelado' THEN l.valor END), 0))::text AS saldo
    FROM financeiro.lancamentos l
    WHERE l.status != 'cancelado' ${dateFilter}
  `, params);

  // Totais período anterior (para variação)
  let dateFilterAnterior = "";
  if (periodo === "mes_atual") {
    dateFilterAnterior = "AND l.data >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month' AND l.data < DATE_TRUNC('month', CURRENT_DATE)";
  } else if (periodo === "mes_anterior") {
    dateFilterAnterior = "AND l.data >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '2 months' AND l.data < DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month'";
  } else if (periodo === "3m") {
    dateFilterAnterior = "AND l.data >= CURRENT_DATE - INTERVAL '6 months' AND l.data < CURRENT_DATE - INTERVAL '3 months'";
  }

  const totaisAnterior = await queryOne<{ receitas: string; despesas: string }>(`
    SELECT
      COALESCE(SUM(CASE WHEN l.tipo = 'receita' AND l.status != 'cancelado' THEN l.valor END), 0)::text AS receitas,
      COALESCE(SUM(CASE WHEN l.tipo = 'despesa' AND l.status != 'cancelado' THEN l.valor END), 0)::text AS despesas
    FROM financeiro.lancamentos l
    WHERE l.status != 'cancelado' ${dateFilterAnterior}
  `, []);

  const receitaAtual = parseFloat(totais?.receitas || "0");
  const receitaAnterior = parseFloat(totaisAnterior?.receitas || "0");
  const despesaAtual = parseFloat(totais?.despesas || "0");
  const despesaAnterior = parseFloat(totaisAnterior?.despesas || "0");

  const variacaoReceita = receitaAnterior > 0 ? Math.round(((receitaAtual - receitaAnterior) / receitaAnterior) * 100) : 0;
  const variacaoDespesa = despesaAnterior > 0 ? Math.round(((despesaAtual - despesaAnterior) / despesaAnterior) * 100) : 0;

  // Receitas por categoria
  const receitasPorCategoria = await query(`
    SELECT c.nome as categoria, c.cor, SUM(l.valor)::text as valor
    FROM financeiro.lancamentos l
    JOIN financeiro.categorias c ON c.id = l.categoria_id
    WHERE l.tipo = 'receita' AND l.status != 'cancelado' ${dateFilter}
    GROUP BY c.nome, c.cor ORDER BY SUM(l.valor) DESC
  `, params);

  // Despesas por categoria
  const despesasPorCategoria = await query(`
    SELECT c.nome as categoria, c.cor, SUM(l.valor)::text as valor
    FROM financeiro.lancamentos l
    JOIN financeiro.categorias c ON c.id = l.categoria_id
    WHERE l.tipo = 'despesa' AND l.status != 'cancelado' ${dateFilter}
    GROUP BY c.nome, c.cor ORDER BY SUM(l.valor) DESC
  `, params);

  // Resumo mensal (últimos 12 meses)
  const resumoMensal = await query(`
    SELECT
      TO_CHAR(DATE_TRUNC('month', l.data), 'YYYY-MM') as mes,
      TO_CHAR(DATE_TRUNC('month', l.data), 'Mon/YY') as mes_label,
      COALESCE(SUM(CASE WHEN l.tipo = 'receita' THEN l.valor END), 0)::text AS receitas,
      COALESCE(SUM(CASE WHEN l.tipo = 'despesa' THEN l.valor END), 0)::text AS despesas,
      (COALESCE(SUM(CASE WHEN l.tipo = 'receita' THEN l.valor END), 0)
       - COALESCE(SUM(CASE WHEN l.tipo = 'despesa' THEN l.valor END), 0))::text AS saldo
    FROM financeiro.lancamentos l
    WHERE l.status != 'cancelado' AND l.data >= CURRENT_DATE - INTERVAL '12 months'
    GROUP BY DATE_TRUNC('month', l.data)
    ORDER BY DATE_TRUNC('month', l.data)
  `, []);

  // Total vendas (qtd)
  const vendasInfo = await queryOne<{ total_vendas: string; ticket_medio: string }>(`
    SELECT
      COALESCE(SUM(l.qtd_vendas), 0)::text AS total_vendas,
      CASE WHEN SUM(l.qtd_vendas) > 0
        THEN ROUND(SUM(l.valor) / SUM(l.qtd_vendas), 2)::text
        ELSE '0'
      END AS ticket_medio
    FROM financeiro.lancamentos l
    WHERE l.tipo = 'receita' AND l.status != 'cancelado' AND l.qtd_vendas > 0 ${dateFilter}
  `, params);

  // Despesas fixas totais
  const despFixas = await queryOne<{ total: string }>(`
    SELECT COALESCE(SUM(valor), 0)::text AS total FROM financeiro.despesas_fixas WHERE ativo = true
  `, []);

  // Ponto de equilíbrio
  const ticketMedio = parseFloat(vendasInfo?.ticket_medio || "0");
  const despFixasTotal = parseFloat(despFixas?.total || "0");
  const pontoEquilibrio = ticketMedio > 0 ? Math.ceil(despFixasTotal / ticketMedio) : 0;

  res.json({
    receitas: parseFloat(totais?.receitas || "0"),
    despesas: parseFloat(totais?.despesas || "0"),
    saldo: parseFloat(totais?.saldo || "0"),
    variacao_receita: variacaoReceita,
    variacao_despesa: variacaoDespesa,
    total_vendas: parseInt(vendasInfo?.total_vendas || "0", 10),
    ticket_medio: ticketMedio,
    despesas_fixas_mensal: despFixasTotal,
    ponto_equilibrio: pontoEquilibrio,
    receitas_por_categoria: receitasPorCategoria,
    despesas_por_categoria: despesasPorCategoria,
    resumo_mensal: resumoMensal,
  });
});

// ══════════════════════════════════════════════════════════════
// LANÇAMENTOS — CRUD
// ══════════════════════════════════════════════════════════════

const listLancamentosSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  tipo: z.enum(["receita", "despesa"]).optional(),
  status: z.enum(["realizado", "programado", "cancelado"]).optional(),
  categoria_id: z.string().uuid().optional(),
  mes: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  search: z.string().optional(),
});

financeiroRouter.get("/lancamentos", async (req: Request, res: Response) => {
  const parse = listLancamentosSchema.safeParse(req.query);
  if (!parse.success) { res.status(400).json({ error: "Parâmetros inválidos" }); return; }

  const { page, limit, tipo, status, categoria_id, mes, search } = parse.data;
  const offset = (page - 1) * limit;
  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (tipo) { conditions.push(`l.tipo = $${idx}`); params.push(tipo); idx++; }
  if (status) { conditions.push(`l.status = $${idx}`); params.push(status); idx++; }
  if (categoria_id) { conditions.push(`l.categoria_id = $${idx}`); params.push(categoria_id); idx++; }
  if (mes) { conditions.push(`TO_CHAR(l.data, 'YYYY-MM') = $${idx}`); params.push(mes); idx++; }
  if (search) { conditions.push(`(l.descricao ILIKE $${idx} OR l.observacoes ILIKE $${idx})`); params.push(`%${search}%`); idx++; }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const countResult = await queryOne<{ total: string }>(
    `SELECT COUNT(*)::text AS total FROM financeiro.lancamentos l ${where}`, params
  );
  const total = parseInt(countResult?.total || "0", 10);

  params.push(limit, offset);
  const rows = await query(`
    SELECT l.*, c.nome as categoria_nome, c.cor as categoria_cor, c.icone as categoria_icone
    FROM financeiro.lancamentos l
    JOIN financeiro.categorias c ON c.id = l.categoria_id
    ${where}
    ORDER BY l.data DESC, l.criado_em DESC
    LIMIT $${idx} OFFSET $${idx + 1}
  `, params);

  res.json({ data: rows, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
});

financeiroRouter.get("/lancamentos/:id", async (req: Request, res: Response) => {
  const row = await queryOne(`
    SELECT l.*, c.nome as categoria_nome, c.cor as categoria_cor
    FROM financeiro.lancamentos l
    JOIN financeiro.categorias c ON c.id = l.categoria_id
    WHERE l.id = $1
  `, [req.params.id]);
  if (!row) { res.status(404).json({ error: "Lançamento não encontrado" }); return; }
  res.json(row);
});

const createLancamentoSchema = z.object({
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  descricao: z.string().min(1).max(500),
  categoria_id: z.string().uuid(),
  tipo: z.enum(["receita", "despesa"]),
  valor: z.number().positive(),
  status: z.enum(["realizado", "programado", "cancelado"]).default("realizado"),
  observacoes: z.string().optional(),
  qtd_vendas: z.number().int().min(0).optional(),
  forma_pagamento: z.string().max(30).optional(),
});

financeiroRouter.post("/lancamentos", async (req: Request, res: Response) => {
  const parse = createLancamentoSchema.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: "Dados inválidos", details: parse.error.flatten() }); return; }

  const d = parse.data;
  const row = await queryOne(`
    INSERT INTO financeiro.lancamentos (data, descricao, categoria_id, tipo, valor, status, observacoes, qtd_vendas, forma_pagamento, criado_por)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *
  `, [d.data, d.descricao, d.categoria_id, d.tipo, d.valor, d.status, d.observacoes || null, d.qtd_vendas || null, d.forma_pagamento || null, req.user?.userId || null]);

  res.status(201).json(row);
});

financeiroRouter.put("/lancamentos/:id", async (req: Request, res: Response) => {
  const updateSchema = createLancamentoSchema.partial();
  const parse = updateSchema.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: "Dados inválidos" }); return; }

  const entries = Object.entries(parse.data).filter(([, v]) => v !== undefined);
  if (entries.length === 0) { res.status(400).json({ error: "Nenhum campo para atualizar" }); return; }

  const sets = entries.map(([k], i) => `${k} = $${i + 1}`);
  const values: unknown[] = entries.map(([, v]) => v);
  values.push(req.params.id);

  const updated = await queryOne(`
    UPDATE financeiro.lancamentos SET ${sets.join(", ")} WHERE id = $${values.length} RETURNING *
  `, values);

  if (!updated) { res.status(404).json({ error: "Lançamento não encontrado" }); return; }
  res.json(updated);
});

financeiroRouter.delete("/lancamentos/:id", async (req: Request, res: Response) => {
  const updated = await queryOne(`
    UPDATE financeiro.lancamentos SET status = 'cancelado' WHERE id = $1 RETURNING *
  `, [req.params.id]);
  if (!updated) { res.status(404).json({ error: "Lançamento não encontrado" }); return; }
  res.json(updated);
});

// ══════════════════════════════════════════════════════════════
// CATEGORIAS
// ══════════════════════════════════════════════════════════════

financeiroRouter.get("/categorias", async (_req: Request, res: Response) => {
  const rows = await query(`
    SELECT c.*,
      (SELECT COUNT(*)::text FROM financeiro.lancamentos l WHERE l.categoria_id = c.id AND l.status != 'cancelado') as total_lancamentos
    FROM financeiro.categorias c
    WHERE c.ativo = true
    ORDER BY c.tipo, c.ordem, c.nome
  `, []);
  res.json({ data: rows });
});

financeiroRouter.post("/categorias", async (req: Request, res: Response) => {
  const schema = z.object({
    nome: z.string().min(1).max(100),
    tipo: z.enum(["receita", "despesa"]),
    cor: z.string().max(7).optional(),
    icone: z.string().max(50).optional(),
  });
  const parse = schema.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: "Dados inválidos" }); return; }

  const d = parse.data;
  const row = await queryOne(`
    INSERT INTO financeiro.categorias (nome, tipo, cor, icone) VALUES ($1, $2, $3, $4) RETURNING *
  `, [d.nome, d.tipo, d.cor || "#8B5CF6", d.icone || null]);
  res.status(201).json(row);
});

// ══════════════════════════════════════════════════════════════
// DESPESAS FIXAS
// ══════════════════════════════════════════════════════════════

financeiroRouter.get("/despesas-fixas", async (_req: Request, res: Response) => {
  const rows = await query(`
    SELECT df.*, c.nome as categoria_nome, c.cor as categoria_cor, c.icone as categoria_icone
    FROM financeiro.despesas_fixas df
    JOIN financeiro.categorias c ON c.id = df.categoria_id
    WHERE df.ativo = true
    ORDER BY df.dia_vencimento
  `, []);

  const totalMensal = rows.reduce((sum: number, r: any) => sum + parseFloat(r.valor), 0);
  res.json({ data: rows, total_mensal: totalMensal });
});

financeiroRouter.post("/despesas-fixas", async (req: Request, res: Response) => {
  const schema = z.object({
    descricao: z.string().min(1).max(255),
    categoria_id: z.string().uuid(),
    valor: z.number().positive(),
    dia_vencimento: z.number().int().min(1).max(31),
    observacoes: z.string().optional(),
    data_inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    data_fim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  });
  const parse = schema.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: "Dados inválidos" }); return; }

  const d = parse.data;
  const row = await queryOne(`
    INSERT INTO financeiro.despesas_fixas (descricao, categoria_id, valor, dia_vencimento, observacoes, data_inicio, data_fim)
    VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *
  `, [d.descricao, d.categoria_id, d.valor, d.dia_vencimento, d.observacoes || null, d.data_inicio || null, d.data_fim || null]);
  res.status(201).json(row);
});

financeiroRouter.put("/despesas-fixas/:id", async (req: Request, res: Response) => {
  const schema = z.object({
    descricao: z.string().min(1).max(255).optional(),
    categoria_id: z.string().uuid().optional(),
    valor: z.number().positive().optional(),
    dia_vencimento: z.number().int().min(1).max(31).optional(),
    observacoes: z.string().optional(),
    ativo: z.boolean().optional(),
  });
  const parse = schema.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: "Dados inválidos" }); return; }

  const entries = Object.entries(parse.data).filter(([, v]) => v !== undefined);
  if (entries.length === 0) { res.status(400).json({ error: "Nenhum campo" }); return; }

  const sets = entries.map(([k], i) => `${k} = $${i + 1}`);
  const values: unknown[] = entries.map(([, v]) => v);
  values.push(req.params.id);

  const updated = await queryOne(`
    UPDATE financeiro.despesas_fixas SET ${sets.join(", ")} WHERE id = $${values.length} RETURNING *
  `, values);
  if (!updated) { res.status(404).json({ error: "Despesa fixa não encontrada" }); return; }
  res.json(updated);
});

// ── Pagamentos de despesas fixas (controle mensal) ──────────

financeiroRouter.get("/despesas-fixas/alertas", async (_req: Request, res: Response) => {
  // Retorna despesas fixas do mês atual com status de pagamento
  const mesAtual = new Date();
  const mesRef = formatMesRef(mesAtual);
  const diaHoje = mesAtual.getDate();

  const rows = await query(`
    SELECT
      df.id, df.descricao, df.valor, df.dia_vencimento,
      c.nome as categoria_nome, c.cor as categoria_cor, c.icone as categoria_icone,
      p.id as pagamento_id, p.status as pagamento_status, p.data_pagamento, p.valor_pago,
      CASE
        WHEN p.status = 'pago' THEN 'pago'
        WHEN df.dia_vencimento < $1 AND (p.status IS NULL OR p.status = 'pendente') THEN 'atrasado'
        WHEN df.dia_vencimento <= $1 + 3 AND (p.status IS NULL OR p.status = 'pendente') THEN 'vence_em_breve'
        ELSE 'pendente'
      END as alerta
    FROM financeiro.despesas_fixas df
    JOIN financeiro.categorias c ON c.id = df.categoria_id
    LEFT JOIN financeiro.despesas_fixas_pagamentos p
      ON p.despesa_fixa_id = df.id AND p.mes_referencia = $2
    WHERE df.ativo = true
      AND (df.data_fim IS NULL OR df.data_fim >= CURRENT_DATE)
    ORDER BY
      CASE
        WHEN p.status = 'pago' THEN 3
        WHEN df.dia_vencimento < $1 THEN 0
        WHEN df.dia_vencimento <= $1 + 3 THEN 1
        ELSE 2
      END,
      df.dia_vencimento
  `, [diaHoje, mesRef]);

  const atrasados = rows.filter((r: any) => r.alerta === 'atrasado').length;
  const venceEmBreve = rows.filter((r: any) => r.alerta === 'vence_em_breve').length;
  const pagos = rows.filter((r: any) => r.alerta === 'pago').length;
  const pendentes = rows.filter((r: any) => r.alerta === 'pendente').length;

  res.json({
    data: rows,
    resumo: { atrasados, vence_em_breve: venceEmBreve, pagos, pendentes, total: rows.length },
    mes_referencia: mesRef,
  });
});

financeiroRouter.get("/despesas-fixas/pagamentos", async (req: Request, res: Response) => {
  const schema = z.object({
    mes: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  });
  const parse = schema.safeParse(req.query);
  if (!parse.success) { res.status(400).json({ error: "Parâmetros inválidos" }); return; }

  const mesRef = parse.data.mes ? `${parse.data.mes}-01` : formatMesRef(new Date());

  const rows = await query(`
    SELECT
      df.id as despesa_fixa_id, df.descricao, df.valor as valor_esperado, df.dia_vencimento,
      c.nome as categoria_nome, c.cor as categoria_cor,
      p.id as pagamento_id, p.status, p.data_pagamento, p.valor_pago, p.observacoes
    FROM financeiro.despesas_fixas df
    JOIN financeiro.categorias c ON c.id = df.categoria_id
    LEFT JOIN financeiro.despesas_fixas_pagamentos p
      ON p.despesa_fixa_id = df.id AND p.mes_referencia = $1
    WHERE df.ativo = true
    ORDER BY df.dia_vencimento
  `, [mesRef]);

  res.json({ data: rows, mes_referencia: mesRef });
});

financeiroRouter.post("/despesas-fixas/:id/pagar", async (req: Request, res: Response) => {
  const schema = z.object({
    mes_referencia: z.string().regex(/^\d{4}-\d{2}$/),
    valor_pago: z.number().positive().optional(),
    data_pagamento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    observacoes: z.string().optional(),
  });
  const parse = schema.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: "Dados inválidos" }); return; }

  const despesa = await queryOne<{ id: string; valor: string }>(`
    SELECT id, valor::text FROM financeiro.despesas_fixas WHERE id = $1 AND ativo = true
  `, [req.params.id]);
  if (!despesa) { res.status(404).json({ error: "Despesa fixa não encontrada" }); return; }

  const d = parse.data;
  const mesRef = `${d.mes_referencia}-01`;
  const valorPago = d.valor_pago || parseFloat(despesa.valor);
  const dataPagamento = d.data_pagamento || new Date().toISOString().split("T")[0];

  const row = await queryOne(`
    INSERT INTO financeiro.despesas_fixas_pagamentos (despesa_fixa_id, mes_referencia, valor_pago, data_pagamento, status, observacoes)
    VALUES ($1, $2, $3, $4, 'pago', $5)
    ON CONFLICT (despesa_fixa_id, mes_referencia) DO UPDATE SET
      valor_pago = EXCLUDED.valor_pago,
      data_pagamento = EXCLUDED.data_pagamento,
      status = 'pago',
      observacoes = EXCLUDED.observacoes
    RETURNING *
  `, [req.params.id, mesRef, valorPago, dataPagamento, d.observacoes || null]);

  res.json(row);
});

financeiroRouter.post("/despesas-fixas/:id/desfazer-pagamento", async (req: Request, res: Response) => {
  const schema = z.object({ mes_referencia: z.string().regex(/^\d{4}-\d{2}$/) });
  const parse = schema.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: "Dados inválidos" }); return; }

  const mesRef = `${parse.data.mes_referencia}-01`;
  const row = await queryOne(`
    UPDATE financeiro.despesas_fixas_pagamentos
    SET status = 'pendente', valor_pago = NULL, data_pagamento = NULL
    WHERE despesa_fixa_id = $1 AND mes_referencia = $2
    RETURNING *
  `, [req.params.id, mesRef]);

  if (!row) { res.status(404).json({ error: "Pagamento não encontrado" }); return; }
  res.json(row);
});

// ══════════════════════════════════════════════════════════════
// CUSTOS DE EMBALAGEM + KITS
// ══════════════════════════════════════════════════════════════

financeiroRouter.get("/embalagens", async (_req: Request, res: Response) => {
  const itens = await query(`
    SELECT * FROM financeiro.custos_embalagem WHERE ativo = true ORDER BY nome
  `, []);

  const kits = await query(`
    SELECT k.id, k.nome, k.descricao,
      json_agg(json_build_object(
        'embalagem_id', e.id,
        'embalagem_nome', e.nome,
        'custo_unitario', e.custo_unitario,
        'quantidade', ki.quantidade,
        'subtotal', ROUND(e.custo_unitario * ki.quantidade, 2)
      ) ORDER BY e.nome) as itens,
      ROUND(SUM(e.custo_unitario * ki.quantidade), 2)::text as custo_total
    FROM financeiro.kits_embalagem k
    JOIN financeiro.kit_itens ki ON ki.kit_id = k.id
    JOIN financeiro.custos_embalagem e ON e.id = ki.embalagem_id
    WHERE k.ativo = true
    GROUP BY k.id, k.nome, k.descricao
    ORDER BY k.nome
  `, []);

  res.json({ itens, kits });
});

financeiroRouter.put("/embalagens/:id", async (req: Request, res: Response) => {
  const schema = z.object({
    nome: z.string().max(255).optional(),
    custo_unitario: z.number().min(0).optional(),
    unidade: z.string().max(20).optional(),
  });
  const parse = schema.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: "Dados inválidos" }); return; }

  const entries = Object.entries(parse.data).filter(([, v]) => v !== undefined);
  if (entries.length === 0) { res.status(400).json({ error: "Nenhum campo" }); return; }

  const sets = entries.map(([k], i) => `${k} = $${i + 1}`);
  const values: unknown[] = entries.map(([, v]) => v);
  values.push(req.params.id);

  const updated = await queryOne(`
    UPDATE financeiro.custos_embalagem SET ${sets.join(", ")} WHERE id = $${values.length} RETURNING *
  `, values);
  if (!updated) { res.status(404).json({ error: "Item não encontrado" }); return; }
  res.json(updated);
});

// ══════════════════════════════════════════════════════════════
// SIMULADOR DE MARKETPLACE
// ══════════════════════════════════════════════════════════════

financeiroRouter.get("/canais", async (_req: Request, res: Response) => {
  const rows = await query(`
    SELECT * FROM financeiro.canais_venda WHERE ativo = true ORDER BY ordem
  `, []);
  res.json({ data: rows });
});

financeiroRouter.put("/canais/:id", async (req: Request, res: Response) => {
  const schema = z.object({
    nome: z.string().max(100).optional(),
    taxa_venda_pct: z.number().min(0).optional(),
    taxa_fixa: z.number().min(0).optional(),
    taxa_pagamento_pct: z.number().min(0).optional(),
  });
  const parse = schema.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: "Dados inválidos" }); return; }

  const entries = Object.entries(parse.data).filter(([, v]) => v !== undefined);
  if (entries.length === 0) { res.status(400).json({ error: "Nenhum campo" }); return; }

  const sets = entries.map(([k], i) => `${k} = $${i + 1}`);
  const values: unknown[] = entries.map(([, v]) => v);
  values.push(req.params.id);

  const updated = await queryOne(`
    UPDATE financeiro.canais_venda SET ${sets.join(", ")} WHERE id = $${values.length} RETURNING *
  `, values);
  if (!updated) { res.status(404).json({ error: "Canal não encontrado" }); return; }
  res.json(updated);
});

const simularSchema = z.object({
  preco_venda: z.number().positive(),
  custo_produto: z.number().min(0),
  custo_embalagem: z.number().min(0).default(0),
});

financeiroRouter.post("/simular", async (req: Request, res: Response) => {
  const parse = simularSchema.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: "Dados inválidos" }); return; }

  const { preco_venda, custo_produto, custo_embalagem } = parse.data;

  const canais = await query<{
    id: string; nome: string; taxa_venda_pct: string; taxa_fixa: string; taxa_pagamento_pct: string;
  }>(`SELECT * FROM financeiro.canais_venda WHERE ativo = true ORDER BY ordem`, []);

  const simulacoes = canais.map((canal) => {
    const taxaVendaPct = parseFloat(canal.taxa_venda_pct);
    const taxaFixa = parseFloat(canal.taxa_fixa);
    const taxaPagPct = parseFloat(canal.taxa_pagamento_pct);

    const taxaVenda = preco_venda * (taxaVendaPct / 100);
    const taxaPagamento = preco_venda * (taxaPagPct / 100) + taxaFixa;
    const custoTotal = custo_produto + custo_embalagem + taxaVenda + taxaPagamento;
    const valorReceber = preco_venda - taxaVenda - taxaPagamento;
    const lucroLiquido = valorReceber - custo_produto - custo_embalagem;
    const margemLucro = preco_venda > 0 ? (lucroLiquido / preco_venda) * 100 : 0;

    return {
      canal_id: canal.id,
      canal_nome: canal.nome,
      preco_venda,
      custo_produto,
      custo_embalagem,
      taxa_venda: Math.round(taxaVenda * 100) / 100,
      taxa_pagamento: Math.round(taxaPagamento * 100) / 100,
      custo_total: Math.round(custoTotal * 100) / 100,
      valor_receber: Math.round(valorReceber * 100) / 100,
      lucro_liquido: Math.round(lucroLiquido * 100) / 100,
      margem_lucro: Math.round(margemLucro * 100) / 100,
    };
  });

  res.json({ data: simulacoes });
});
