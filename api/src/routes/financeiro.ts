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

// ── Helpers de filtro por período (usados em Bling e lançamentos) ──

function blingDateFilter(periodo: string): string {
  if (periodo === "mes_atual") return "AND o.criado_bling >= DATE_TRUNC('month', CURRENT_DATE) AND o.criado_bling < DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month'";
  if (periodo === "mes_anterior") return "AND o.criado_bling >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month' AND o.criado_bling < DATE_TRUNC('month', CURRENT_DATE)";
  if (periodo === "3m") return "AND o.criado_bling >= CURRENT_DATE - INTERVAL '3 months'";
  if (periodo === "6m") return "AND o.criado_bling >= CURRENT_DATE - INTERVAL '6 months'";
  if (periodo === "1a") return "AND o.criado_bling >= CURRENT_DATE - INTERVAL '1 year'";
  return "";
}

function lancDateFilter(periodo: string): string {
  if (periodo === "mes_atual") return "AND l.data >= DATE_TRUNC('month', CURRENT_DATE) AND l.data < DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month'";
  if (periodo === "mes_anterior") return "AND l.data >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month' AND l.data < DATE_TRUNC('month', CURRENT_DATE)";
  if (periodo === "3m") return "AND l.data >= CURRENT_DATE - INTERVAL '3 months'";
  if (periodo === "6m") return "AND l.data >= CURRENT_DATE - INTERVAL '6 months'";
  if (periodo === "1a") return "AND l.data >= CURRENT_DATE - INTERVAL '1 year'";
  return "";
}

financeiroRouter.get("/dashboard", async (req: Request, res: Response) => {
  const parse = dashboardSchema.safeParse(req.query);
  if (!parse.success) { res.status(400).json({ error: "Parâmetros inválidos" }); return; }

  const { periodo } = parse.data;
  const bFilter = blingDateFilter(periodo);
  const lFilter = lancDateFilter(periodo);

  // ── Receitas = Bling (vendas) + lançamentos manuais tipo receita ──
  const blingReceita = await queryOne<{ total: string; pedidos: string; ticket: string }>(`
    SELECT
      COALESCE(SUM(o.valor), 0)::text AS total,
      COUNT(*)::text AS pedidos,
      CASE WHEN COUNT(*) > 0 THEN ROUND(SUM(o.valor) / COUNT(*), 2)::text ELSE '0' END AS ticket
    FROM sync.bling_orders o
    WHERE 1=1 ${bFilter}
  `, []);

  const outrasReceitas = await queryOne<{ total: string }>(`
    SELECT COALESCE(SUM(l.valor), 0)::text AS total
    FROM financeiro.lancamentos l
    WHERE l.tipo = 'receita' AND l.status != 'cancelado' ${lFilter}
  `, []);

  // ── Despesas = lançamentos ──
  const despesas = await queryOne<{ total: string }>(`
    SELECT COALESCE(SUM(l.valor), 0)::text AS total
    FROM financeiro.lancamentos l
    WHERE l.tipo = 'despesa' AND l.status != 'cancelado' ${lFilter}
  `, []);

  const receitaBling = parseFloat(blingReceita?.total || "0");
  const receitaOutras = parseFloat(outrasReceitas?.total || "0");
  const receitaTotal = receitaBling + receitaOutras;
  const despesaTotal = parseFloat(despesas?.total || "0");
  const saldo = receitaTotal - despesaTotal;
  const totalPedidos = parseInt(blingReceita?.pedidos || "0", 10);
  const ticketMedio = parseFloat(blingReceita?.ticket || "0");

  // ── Variação período anterior ──
  let bFilterAnt = "";
  let lFilterAnt = "";
  if (periodo === "mes_atual") {
    bFilterAnt = "AND o.criado_bling >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month' AND o.criado_bling < DATE_TRUNC('month', CURRENT_DATE)";
    lFilterAnt = "AND l.data >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month' AND l.data < DATE_TRUNC('month', CURRENT_DATE)";
  } else if (periodo === "mes_anterior") {
    bFilterAnt = "AND o.criado_bling >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '2 months' AND o.criado_bling < DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month'";
    lFilterAnt = "AND l.data >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '2 months' AND l.data < DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month'";
  } else if (periodo === "3m") {
    bFilterAnt = "AND o.criado_bling >= CURRENT_DATE - INTERVAL '6 months' AND o.criado_bling < CURRENT_DATE - INTERVAL '3 months'";
    lFilterAnt = "AND l.data >= CURRENT_DATE - INTERVAL '6 months' AND l.data < CURRENT_DATE - INTERVAL '3 months'";
  }

  const blingAnt = await queryOne<{ total: string }>(`
    SELECT COALESCE(SUM(o.valor), 0)::text AS total FROM sync.bling_orders o WHERE 1=1 ${bFilterAnt}
  `, []);
  const outrasAnt = await queryOne<{ total: string }>(`
    SELECT COALESCE(SUM(l.valor), 0)::text AS total FROM financeiro.lancamentos l WHERE l.tipo = 'receita' AND l.status != 'cancelado' ${lFilterAnt}
  `, []);
  const despAnt = await queryOne<{ total: string }>(`
    SELECT COALESCE(SUM(l.valor), 0)::text AS total FROM financeiro.lancamentos l WHERE l.tipo = 'despesa' AND l.status != 'cancelado' ${lFilterAnt}
  `, []);

  const receitaAnterior = parseFloat(blingAnt?.total || "0") + parseFloat(outrasAnt?.total || "0");
  const despesaAnterior = parseFloat(despAnt?.total || "0");
  const variacaoReceita = receitaAnterior > 0 ? Math.round(((receitaTotal - receitaAnterior) / receitaAnterior) * 100) : 0;
  const variacaoDespesa = despesaAnterior > 0 ? Math.round(((despesaTotal - despesaAnterior) / despesaAnterior) * 100) : 0;

  // ── Receitas por categoria (Bling = "Vendas Bling", + categorias manuais) ──
  const receitasManuais = await query(`
    SELECT c.nome as categoria, c.cor, SUM(l.valor)::text as valor
    FROM financeiro.lancamentos l
    JOIN financeiro.categorias c ON c.id = l.categoria_id
    WHERE l.tipo = 'receita' AND l.status != 'cancelado' ${lFilter}
    GROUP BY c.nome, c.cor ORDER BY SUM(l.valor) DESC
  `, []);

  const receitasPorCategoria = [
    ...(receitaBling > 0 ? [{ categoria: "Vendas (Bling)", cor: "#10B981", valor: receitaBling.toFixed(2) }] : []),
    ...receitasManuais,
  ];

  // ── Despesas por categoria ──
  const despesasPorCategoria = await query(`
    SELECT c.nome as categoria, c.cor, SUM(l.valor)::text as valor
    FROM financeiro.lancamentos l
    JOIN financeiro.categorias c ON c.id = l.categoria_id
    WHERE l.tipo = 'despesa' AND l.status != 'cancelado' ${lFilter}
    GROUP BY c.nome, c.cor ORDER BY SUM(l.valor) DESC
  `, []);

  // ── Resumo mensal (combina Bling + lançamentos) ──
  const resumoMensal = await query(`
    WITH bling_mensal AS (
      SELECT
        DATE_TRUNC('month', o.criado_bling) as mes,
        COALESCE(SUM(o.valor), 0) AS receitas
      FROM sync.bling_orders o
      WHERE o.criado_bling >= CURRENT_DATE - INTERVAL '12 months'
      GROUP BY DATE_TRUNC('month', o.criado_bling)
    ),
    lanc_mensal AS (
      SELECT
        DATE_TRUNC('month', l.data) as mes,
        COALESCE(SUM(CASE WHEN l.tipo = 'receita' THEN l.valor END), 0) AS outras_receitas,
        COALESCE(SUM(CASE WHEN l.tipo = 'despesa' THEN l.valor END), 0) AS despesas
      FROM financeiro.lancamentos l
      WHERE l.status != 'cancelado' AND l.data >= CURRENT_DATE - INTERVAL '12 months'
      GROUP BY DATE_TRUNC('month', l.data)
    ),
    meses AS (
      SELECT mes FROM bling_mensal UNION SELECT mes FROM lanc_mensal
    )
    SELECT
      TO_CHAR(m.mes, 'YYYY-MM') as mes,
      TO_CHAR(m.mes, 'Mon/YY') as mes_label,
      (COALESCE(b.receitas, 0) + COALESCE(lm.outras_receitas, 0))::text AS receitas,
      COALESCE(lm.despesas, 0)::text AS despesas,
      (COALESCE(b.receitas, 0) + COALESCE(lm.outras_receitas, 0) - COALESCE(lm.despesas, 0))::text AS saldo
    FROM meses m
    LEFT JOIN bling_mensal b ON b.mes = m.mes
    LEFT JOIN lanc_mensal lm ON lm.mes = m.mes
    ORDER BY m.mes
  `, []);

  // ── Despesas fixas + ponto de equilíbrio ──
  const despFixas = await queryOne<{ total: string }>(`
    SELECT COALESCE(SUM(valor), 0)::text AS total FROM financeiro.despesas_fixas WHERE ativo = true
  `, []);
  const despFixasTotal = parseFloat(despFixas?.total || "0");
  const pontoEquilibrio = ticketMedio > 0 ? Math.ceil(despFixasTotal / ticketMedio) : 0;

  res.json({
    receitas: receitaTotal,
    despesas: despesaTotal,
    saldo,
    variacao_receita: variacaoReceita,
    variacao_despesa: variacaoDespesa,
    total_vendas: totalPedidos,
    ticket_medio: ticketMedio,
    despesas_fixas_mensal: despFixasTotal,
    ponto_equilibrio: pontoEquilibrio,
    receitas_por_categoria: receitasPorCategoria,
    despesas_por_categoria: despesasPorCategoria,
    resumo_mensal: resumoMensal,
    fonte_receitas: "bling",
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

  const ALLOWED_LANC = ["tipo","descricao","valor","data","status","categoria_id","observacoes","qtd_vendas","forma_pagamento"];
  const safeEntries = Object.entries(parse.data).filter(([k, v]) => v !== undefined && ALLOWED_LANC.includes(k));
  if (safeEntries.length === 0) { res.status(400).json({ error: "Nenhum campo para atualizar" }); return; }

  const sets = safeEntries.map(([k], i) => `"${k}" = $${i + 1}`);
  const values: unknown[] = safeEntries.map(([, v]) => v);
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

  const ALLOWED_DESP = ["descricao","valor","dia_vencimento","categoria_id","observacoes","ativo"];
  const safeEntries = Object.entries(parse.data).filter(([k, v]) => v !== undefined && ALLOWED_DESP.includes(k));
  if (safeEntries.length === 0) { res.status(400).json({ error: "Nenhum campo" }); return; }

  const sets = safeEntries.map(([k], i) => `"${k}" = $${i + 1}`);
  const values: unknown[] = safeEntries.map(([, v]) => v);
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

  const ALLOWED_EMB = ["nome","custo_unitario","unidade"];
  const safeEntries = Object.entries(parse.data).filter(([k, v]) => v !== undefined && ALLOWED_EMB.includes(k));
  if (safeEntries.length === 0) { res.status(400).json({ error: "Nenhum campo" }); return; }

  const sets = safeEntries.map(([k], i) => `"${k}" = $${i + 1}`);
  const values: unknown[] = safeEntries.map(([, v]) => v);
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

  const ALLOWED_CANAL = ["nome","taxa_venda_pct","taxa_fixa","taxa_pagamento_pct"];
  const safeEntries = Object.entries(parse.data).filter(([k, v]) => v !== undefined && ALLOWED_CANAL.includes(k));
  if (safeEntries.length === 0) { res.status(400).json({ error: "Nenhum campo" }); return; }

  const sets = safeEntries.map(([k], i) => `"${k}" = $${i + 1}`);
  const values: unknown[] = safeEntries.map(([, v]) => v);
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

// ══════════════════════════════════════════════════════════════
// DRE — Demonstração do Resultado do Exercício
// ══════════════════════════════════════════════════════════════

const dreSchema = z.object({
  mes: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  periodo: z.enum(["mes_atual", "mes_anterior", "3m", "6m", "1a", "total"]).default("mes_atual"),
});

financeiroRouter.get("/dre", async (req: Request, res: Response) => {
  const parse = dreSchema.safeParse(req.query);
  if (!parse.success) { res.status(400).json({ error: "Parâmetros inválidos" }); return; }

  const { mes, periodo } = parse.data;

  // Filtros de data
  let bFilter = "";
  let lFilter = "";

  if (mes) {
    bFilter = `AND o.criado_bling >= $1::date AND o.criado_bling < $1::date + INTERVAL '1 month'`;
    lFilter = `AND l.data >= $1::date AND l.data < $1::date + INTERVAL '1 month'`;
  } else {
    bFilter = blingDateFilter(periodo);
    lFilter = lancDateFilter(periodo);
  }

  // Receita Bruta (vendas Bling)
  const vendas = await queryOne<{ total: string; pedidos: string; ticket: string }>(`
    SELECT
      COALESCE(SUM(o.valor), 0)::text AS total,
      COUNT(*)::text AS pedidos,
      CASE WHEN COUNT(*) > 0 THEN ROUND(SUM(o.valor) / COUNT(*), 2)::text ELSE '0' END AS ticket
    FROM sync.bling_orders o WHERE 1=1 ${bFilter}
  `, mes ? [`${mes}-01`] : []);

  // Outras receitas manuais
  const outrasReceitas = await queryOne<{ total: string }>(`
    SELECT COALESCE(SUM(l.valor), 0)::text AS total
    FROM financeiro.lancamentos l
    WHERE l.tipo = 'receita' AND l.status != 'cancelado' ${lFilter}
  `, mes ? [`${mes}-01`] : []);

  // Despesas por categoria
  const despesasCat = await query<{ categoria: string; cor: string; valor: string }>(`
    SELECT c.nome as categoria, c.cor, SUM(l.valor)::text as valor
    FROM financeiro.lancamentos l
    JOIN financeiro.categorias c ON c.id = l.categoria_id
    WHERE l.tipo = 'despesa' AND l.status != 'cancelado' ${lFilter}
    GROUP BY c.nome, c.cor ORDER BY SUM(l.valor) DESC
  `, mes ? [`${mes}-01`] : []);

  // Custo de produtos (NFs de entrada contabilizadas)
  const custoNfs = await queryOne<{ total: string }>(`
    SELECT COALESCE(SUM(l.valor), 0)::text AS total
    FROM financeiro.lancamentos l
    WHERE l.tipo = 'despesa' AND l.status != 'cancelado' AND l.referencia_tipo = 'nf_entrada' ${lFilter}
  `, mes ? [`${mes}-01`] : []);

  // Despesas fixas do período
  const despFixas = await queryOne<{ total: string }>(`
    SELECT COALESCE(SUM(valor), 0)::text AS total FROM financeiro.despesas_fixas WHERE ativo = true
  `, []);

  const receitaBruta = parseFloat(vendas?.total || "0");
  const receitaOutras = parseFloat(outrasReceitas?.total || "0");
  const receitaTotal = receitaBruta + receitaOutras;
  const cmv = parseFloat(custoNfs?.total || "0"); // Custo de Mercadoria Vendida
  const lucroBruto = receitaTotal - cmv;

  // Separa despesas operacionais (excluindo CMV que já está em custoNfs)
  const despesasOp = despesasCat
    .filter((d: any) => d.categoria !== "Fornecedores")
    .reduce((sum: number, d: any) => sum + parseFloat(d.valor), 0);

  const despesasFixasMensal = parseFloat(despFixas?.total || "0");
  const lucroOperacional = lucroBruto - despesasOp;
  const lucroLiquido = lucroOperacional;
  const margemBruta = receitaTotal > 0 ? (lucroBruto / receitaTotal) * 100 : 0;
  const margemLiquida = receitaTotal > 0 ? (lucroLiquido / receitaTotal) * 100 : 0;

  res.json({
    receita_bruta: receitaBruta,
    outras_receitas: receitaOutras,
    receita_total: receitaTotal,
    cmv,
    lucro_bruto: lucroBruto,
    margem_bruta: Math.round(margemBruta * 10) / 10,
    despesas_operacionais: despesasOp,
    despesas_por_categoria: despesasCat,
    despesas_fixas_mensal: despesasFixasMensal,
    lucro_operacional: lucroOperacional,
    lucro_liquido: lucroLiquido,
    margem_liquida: Math.round(margemLiquida * 10) / 10,
    total_pedidos: parseInt(vendas?.pedidos || "0", 10),
    ticket_medio: parseFloat(vendas?.ticket || "0"),
  });
});

// ══════════════════════════════════════════════════════════════
// FLUXO DE CAIXA PROJETADO
// ══════════════════════════════════════════════════════════════

financeiroRouter.get("/fluxo-projetado", async (_req: Request, res: Response) => {
  // Histórico: últimos 6 meses de receitas e despesas
  const historico = await query<{ mes: string; receitas: string; despesas: string }>(`
    WITH bling_mensal AS (
      SELECT DATE_TRUNC('month', o.criado_bling) as mes, COALESCE(SUM(o.valor), 0) AS receitas
      FROM sync.bling_orders o
      WHERE o.criado_bling >= CURRENT_DATE - INTERVAL '6 months'
      GROUP BY DATE_TRUNC('month', o.criado_bling)
    ),
    lanc_mensal AS (
      SELECT DATE_TRUNC('month', l.data) as mes,
        COALESCE(SUM(CASE WHEN l.tipo = 'receita' THEN l.valor END), 0) AS outras_receitas,
        COALESCE(SUM(CASE WHEN l.tipo = 'despesa' THEN l.valor END), 0) AS despesas
      FROM financeiro.lancamentos l
      WHERE l.status != 'cancelado' AND l.data >= CURRENT_DATE - INTERVAL '6 months'
      GROUP BY DATE_TRUNC('month', l.data)
    ),
    meses AS (SELECT mes FROM bling_mensal UNION SELECT mes FROM lanc_mensal)
    SELECT
      TO_CHAR(m.mes, 'YYYY-MM') as mes,
      (COALESCE(b.receitas, 0) + COALESCE(lm.outras_receitas, 0))::text AS receitas,
      COALESCE(lm.despesas, 0)::text AS despesas
    FROM meses m
    LEFT JOIN bling_mensal b ON b.mes = m.mes
    LEFT JOIN lanc_mensal lm ON lm.mes = m.mes
    ORDER BY m.mes
  `, []);

  // Despesas fixas mensais (base para projeção)
  const despFixas = await queryOne<{ total: string }>(`
    SELECT COALESCE(SUM(valor), 0)::text AS total FROM financeiro.despesas_fixas WHERE ativo = true
  `, []);
  const despesasFixas = parseFloat(despFixas?.total || "0");

  // Calcula médias dos últimos 3 meses para projeção
  const ultimos3 = historico.slice(-3);
  const mediaReceitas = ultimos3.length > 0
    ? ultimos3.reduce((s, h) => s + parseFloat(h.receitas), 0) / ultimos3.length
    : 0;
  const mediaDespesasVar = ultimos3.length > 0
    ? ultimos3.reduce((s, h) => s + Math.max(0, parseFloat(h.despesas) - despesasFixas), 0) / ultimos3.length
    : 0;

  // Projeção: próximos 3 meses
  const projecao: { mes: string; mes_label: string; receitas: number; despesas: number; saldo: number; tipo: string }[] = [];
  const hoje = new Date();

  // Histórico formatado
  for (const h of historico) {
    const d = new Date(h.mes + "-01");
    const label = d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
    const rec = parseFloat(h.receitas);
    const desp = parseFloat(h.despesas);
    projecao.push({
      mes: h.mes,
      mes_label: label,
      receitas: Math.round(rec * 100) / 100,
      despesas: Math.round(desp * 100) / 100,
      saldo: Math.round((rec - desp) * 100) / 100,
      tipo: "realizado",
    });
  }

  // Projeção
  for (let i = 1; i <= 3; i++) {
    const futuro = new Date(hoje.getFullYear(), hoje.getMonth() + i, 1);
    const mesStr = `${futuro.getFullYear()}-${String(futuro.getMonth() + 1).padStart(2, "0")}`;
    const label = futuro.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
    const recProj = Math.round(mediaReceitas * 100) / 100;
    const despProj = Math.round((despesasFixas + mediaDespesasVar) * 100) / 100;
    projecao.push({
      mes: mesStr,
      mes_label: label,
      receitas: recProj,
      despesas: despProj,
      saldo: Math.round((recProj - despProj) * 100) / 100,
      tipo: "projetado",
    });
  }

  // Saldo acumulado
  let acumulado = 0;
  const fluxo = projecao.map((p) => {
    acumulado += p.saldo;
    return { ...p, saldo_acumulado: Math.round(acumulado * 100) / 100 };
  });

  res.json({
    fluxo,
    media_receitas_3m: Math.round(mediaReceitas * 100) / 100,
    media_despesas_3m: Math.round((despesasFixas + mediaDespesasVar) * 100) / 100,
    despesas_fixas_mensal: despesasFixas,
    despesas_variaveis_media: Math.round(mediaDespesasVar * 100) / 100,
  });
});

// ══════════════════════════════════════════════════════════════
// COMPARATIVO MÊS A MÊS
// ══════════════════════════════════════════════════════════════

const comparativoSchema = z.object({
  meses: z.coerce.number().int().min(2).max(12).default(6),
});

financeiroRouter.get("/comparativo", async (req: Request, res: Response) => {
  const parse = comparativoSchema.safeParse(req.query);
  if (!parse.success) { res.status(400).json({ error: "Parâmetros inválidos" }); return; }

  const { meses } = parse.data;

  // Receitas (Bling + manuais) por mês
  const dados = await query<{
    mes: string; mes_label: string;
    vendas_bling: string; outras_receitas: string; receita_total: string;
    despesas: string; saldo: string; pedidos: string; ticket: string;
  }>(`
    WITH periodos AS (
      SELECT generate_series(
        DATE_TRUNC('month', CURRENT_DATE) - ($1 - 1) * INTERVAL '1 month',
        DATE_TRUNC('month', CURRENT_DATE),
        '1 month'
      )::date AS mes
    ),
    bling_mensal AS (
      SELECT DATE_TRUNC('month', o.criado_bling)::date as mes,
        COALESCE(SUM(o.valor), 0) AS vendas,
        COUNT(*) AS pedidos,
        CASE WHEN COUNT(*) > 0 THEN ROUND(SUM(o.valor) / COUNT(*), 2) ELSE 0 END AS ticket
      FROM sync.bling_orders o
      WHERE o.criado_bling >= DATE_TRUNC('month', CURRENT_DATE) - $1 * INTERVAL '1 month'
      GROUP BY DATE_TRUNC('month', o.criado_bling)
    ),
    lanc_mensal AS (
      SELECT DATE_TRUNC('month', l.data)::date as mes,
        COALESCE(SUM(CASE WHEN l.tipo = 'receita' THEN l.valor END), 0) AS outras_receitas,
        COALESCE(SUM(CASE WHEN l.tipo = 'despesa' THEN l.valor END), 0) AS despesas
      FROM financeiro.lancamentos l
      WHERE l.status != 'cancelado' AND l.data >= DATE_TRUNC('month', CURRENT_DATE) - $1 * INTERVAL '1 month'
      GROUP BY DATE_TRUNC('month', l.data)
    )
    SELECT
      TO_CHAR(p.mes, 'YYYY-MM') as mes,
      TO_CHAR(p.mes, 'Mon/YY') as mes_label,
      COALESCE(b.vendas, 0)::text AS vendas_bling,
      COALESCE(lm.outras_receitas, 0)::text AS outras_receitas,
      (COALESCE(b.vendas, 0) + COALESCE(lm.outras_receitas, 0))::text AS receita_total,
      COALESCE(lm.despesas, 0)::text AS despesas,
      (COALESCE(b.vendas, 0) + COALESCE(lm.outras_receitas, 0) - COALESCE(lm.despesas, 0))::text AS saldo,
      COALESCE(b.pedidos, 0)::text AS pedidos,
      COALESCE(b.ticket, 0)::text AS ticket
    FROM periodos p
    LEFT JOIN bling_mensal b ON b.mes = p.mes
    LEFT JOIN lanc_mensal lm ON lm.mes = p.mes
    ORDER BY p.mes
  `, [meses]);

  // Despesas por categoria por mês
  const despCat = await query<{ mes: string; categoria: string; cor: string; valor: string }>(`
    SELECT
      TO_CHAR(l.data, 'YYYY-MM') as mes,
      c.nome as categoria, c.cor,
      SUM(l.valor)::text as valor
    FROM financeiro.lancamentos l
    JOIN financeiro.categorias c ON c.id = l.categoria_id
    WHERE l.tipo = 'despesa' AND l.status != 'cancelado'
      AND l.data >= DATE_TRUNC('month', CURRENT_DATE) - $1 * INTERVAL '1 month'
    GROUP BY TO_CHAR(l.data, 'YYYY-MM'), c.nome, c.cor
    ORDER BY TO_CHAR(l.data, 'YYYY-MM'), SUM(l.valor) DESC
  `, [meses]);

  // Calcula variação mês a mês
  const comparativo = dados.map((d, i) => {
    const anterior = i > 0 ? dados[i - 1] : null;
    const recAtual = parseFloat(d.receita_total);
    const recAnt = anterior ? parseFloat(anterior.receita_total) : 0;
    const despAtual = parseFloat(d.despesas);
    const despAnt = anterior ? parseFloat(anterior.despesas) : 0;

    return {
      ...d,
      variacao_receita: recAnt > 0 ? Math.round(((recAtual - recAnt) / recAnt) * 100) : null,
      variacao_despesa: despAnt > 0 ? Math.round(((despAtual - despAnt) / despAnt) * 100) : null,
      margem: recAtual > 0 ? Math.round(((recAtual - despAtual) / recAtual) * 100) : 0,
    };
  });

  res.json({
    meses: comparativo,
    despesas_por_categoria: despCat,
  });
});
