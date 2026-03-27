import { Router, Request, Response } from "express";
import axios from "axios";
import { z } from "zod";
import { query, queryOne } from "../db";
import { authMiddleware } from "../middleware/auth";
import { logger } from "../utils/logger";
import { getValidToken, BLING_API } from "../integrations/bling/auth";

export const contasPagarRouter = Router();
contasPagarRouter.use(authMiddleware);

// ── Schemas ─────────────────────────────────────────────────────

const createSchema = z.object({
  contato_id: z.string().min(1, "Fornecedor obrigatorio"),
  valor: z.number().positive("Valor deve ser maior que zero"),
  vencimento: z.string().min(1, "Vencimento obrigatorio"),
  data_emissao: z.string().optional(),
  competencia: z.string().optional(),
  numero_documento: z.string().optional(),
  historico: z.string().optional(),
  forma_pagamento_id: z.string().optional(),
});

const updateSchema = createSchema.partial();

// ── POST /api/contas-pagar — criar no Bling ─────────────────────

contasPagarRouter.post("/", async (req: Request, res: Response) => {
  const parse = createSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: "Dados invalidos", detalhes: parse.error.errors });
    return;
  }

  const { contato_id, valor, vencimento, data_emissao, competencia, numero_documento, historico, forma_pagamento_id } = parse.data;

  try {
    const token = await getValidToken();
    const body: Record<string, unknown> = {
      contato: { id: parseInt(contato_id, 10) },
      valor,
      vencimento,
      dataEmissao: data_emissao || vencimento,
      competencia: competencia || vencimento,
    };

    if (numero_documento) body.numeroDocumento = numero_documento;
    if (historico) body.historico = historico;
    if (forma_pagamento_id) body.formaPagamento = { id: parseInt(forma_pagamento_id, 10) };

    const { data } = await axios.post(`${BLING_API}/contas/pagar`, body, {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    });

    logger.info("Conta a pagar criada no Bling", { blingId: data.data?.id, user: req.user?.email });

    // Salva localmente tambem
    if (data.data?.id) {
      await query(
        `INSERT INTO sync.bling_contas_pagar (bling_id, situacao, vencimento, valor, numero_documento, historico, contato_bling_id, sincronizado_em)
         VALUES ($1, 1, $2, $3, $4, $5, $6, NOW())
         ON CONFLICT (bling_id) DO NOTHING`,
        [String(data.data.id), vencimento, valor, numero_documento || null, historico || null, contato_id]
      );
    }

    res.status(201).json({ id: data.data?.id, message: "Conta criada no Bling" });
  } catch (err: unknown) {
    const axiosErr = err as { response?: { data?: { error?: { message?: string; fields?: unknown[] } } } };
    const msg = axiosErr.response?.data?.error?.message || "Erro ao criar conta no Bling";
    logger.error("Erro ao criar conta a pagar", { error: msg });
    res.status(400).json({ error: msg, detalhes: axiosErr.response?.data?.error?.fields });
  }
});

// ── PUT /api/contas-pagar/:id — editar no Bling ────────────────

contasPagarRouter.put("/:id", async (req: Request, res: Response) => {
  const parse = updateSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: "Dados invalidos", detalhes: parse.error.errors });
    return;
  }

  const blingId = req.params.id;

  // Busca dados atuais pra merge
  const existing = await queryOne<Record<string, unknown>>(
    "SELECT * FROM sync.bling_contas_pagar WHERE bling_id = $1",
    [blingId]
  );
  if (!existing) {
    res.status(404).json({ error: "Conta nao encontrada" });
    return;
  }

  try {
    const token = await getValidToken();
    const d = parse.data;
    const body: Record<string, unknown> = {
      contato: { id: parseInt(d.contato_id || String(existing.contato_bling_id), 10) },
      valor: d.valor || existing.valor,
      vencimento: d.vencimento || existing.vencimento,
      dataEmissao: d.data_emissao || existing.data_emissao || d.vencimento || existing.vencimento,
      competencia: d.competencia || d.vencimento || existing.vencimento,
    };

    if (d.numero_documento) body.numeroDocumento = d.numero_documento;
    if (d.historico) body.historico = d.historico;
    if (d.forma_pagamento_id) body.formaPagamento = { id: parseInt(d.forma_pagamento_id, 10) };

    await axios.put(`${BLING_API}/contas/pagar/${blingId}`, body, {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    });

    // Atualiza localmente
    const updates: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (d.valor) { updates.push(`valor = $${idx}`); values.push(d.valor); idx++; }
    if (d.vencimento) { updates.push(`vencimento = $${idx}`); values.push(d.vencimento); idx++; }
    if (d.numero_documento) { updates.push(`numero_documento = $${idx}`); values.push(d.numero_documento); idx++; }
    if (d.historico) { updates.push(`historico = $${idx}`); values.push(d.historico); idx++; }

    if (updates.length > 0) {
      values.push(blingId);
      await query(
        `UPDATE sync.bling_contas_pagar SET ${updates.join(", ")}, sincronizado_em = NOW() WHERE bling_id = $${idx}`,
        values
      );
    }

    logger.info("Conta a pagar atualizada no Bling", { blingId, user: req.user?.email });
    res.json({ message: "Conta atualizada" });
  } catch (err: unknown) {
    const axiosErr = err as { response?: { data?: { error?: { message?: string } } } };
    const msg = axiosErr.response?.data?.error?.message || "Erro ao atualizar";
    res.status(400).json({ error: msg });
  }
});

// ── DELETE /api/contas-pagar/:id — deletar no Bling ─────────────

contasPagarRouter.delete("/:id", async (req: Request, res: Response) => {
  const blingId = req.params.id;

  try {
    const token = await getValidToken();
    await axios.delete(`${BLING_API}/contas/pagar/${blingId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    // Remove localmente
    await query("DELETE FROM sync.bling_contas_pagar WHERE bling_id = $1", [blingId]);

    logger.info("Conta a pagar deletada no Bling", { blingId, user: req.user?.email });
    res.json({ message: "Conta removida" });
  } catch (err: unknown) {
    const axiosErr = err as { response?: { data?: { error?: { message?: string } } } };
    const msg = axiosErr.response?.data?.error?.message || "Erro ao deletar";
    res.status(400).json({ error: msg });
  }
});

// ── POST /api/contas-pagar/:id/pagar — registrar pagamento ─────

contasPagarRouter.post("/:id/pagar", async (req: Request, res: Response) => {
  const blingId = req.params.id;
  const dataPagamento = (req.body.data_pagamento as string) || new Date().toISOString().split("T")[0];

  const conta = await queryOne<{ valor: number; contato_bling_id: string }>(
    "SELECT valor, contato_bling_id FROM sync.bling_contas_pagar WHERE bling_id = $1",
    [blingId]
  );

  if (!conta) {
    res.status(404).json({ error: "Conta nao encontrada" });
    return;
  }

  try {
    const token = await getValidToken();

    // Cria bordero no Bling (registra pagamento)
    await axios.post(`${BLING_API}/borderos`, {
      data: dataPagamento,
      pagamentos: [{
        contaPagar: { id: parseInt(blingId, 10) },
        valorPago: conta.valor,
      }],
    }, {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    });

    // Atualiza localmente
    await query(
      `UPDATE sync.bling_contas_pagar
       SET situacao = 2, data_pagamento = $2, valor_pago = $3, sincronizado_em = NOW()
       WHERE bling_id = $1`,
      [blingId, dataPagamento, conta.valor]
    );

    logger.info("Conta a pagar marcada como paga", { blingId, dataPagamento, user: req.user?.email });
    res.json({ message: "Pagamento registrado no Bling" });
  } catch (err: unknown) {
    const axiosErr = err as { response?: { data?: { error?: { message?: string } } } };
    const msg = axiosErr.response?.data?.error?.message || "Erro ao registrar pagamento";
    logger.error("Erro ao registrar pagamento", { blingId, error: msg });
    res.status(400).json({ error: msg });
  }
});
