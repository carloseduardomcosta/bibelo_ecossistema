import { Router, Request, Response } from "express";
import { z } from "zod";
import { query, queryOne } from "../db";
import { authMiddleware } from "../middleware/auth";
import { logger } from "../utils/logger";
import { buildFlowEmail } from "../services/flow.service";

export const flowsRouter = Router();
flowsRouter.use(authMiddleware);

// ── GET /api/flows/stats/overview — resumo geral (ANTES de /:id) ──

flowsRouter.get("/stats/overview", async (_req: Request, res: Response) => {
  const stats = await queryOne<Record<string, unknown>>(
    `SELECT
       (SELECT COUNT(*) FROM marketing.flows WHERE ativo = true) AS fluxos_ativos,
       (SELECT COUNT(*) FROM marketing.flow_executions WHERE status = 'ativo') AS execucoes_ativas,
       (SELECT COUNT(*) FROM marketing.flow_executions WHERE status = 'concluido' AND concluido_em > NOW() - INTERVAL '7 days') AS concluidas_7d,
       (SELECT COUNT(*) FROM marketing.flow_executions WHERE status = 'erro' AND concluido_em > NOW() - INTERVAL '7 days') AS erros_7d,
       (SELECT COUNT(*) FROM marketing.pedidos_pendentes WHERE convertido = false AND notificado = false) AS carrinhos_pendentes,
       (SELECT COUNT(*) FROM marketing.pedidos_pendentes WHERE notificado = true AND convertido = false) AS carrinhos_notificados,
       (SELECT COUNT(*) FROM marketing.pedidos_pendentes WHERE convertido = true) AS carrinhos_convertidos,
       (SELECT COUNT(*) FROM marketing.flow_step_executions WHERE tipo = 'email' AND status = 'concluido' AND executado_em > NOW() - INTERVAL '24 hours') AS emails_hoje`
  );

  res.json(stats);
});

// ── GET /api/flows/stats/reminders — stats do lembrete de verificação ──

flowsRouter.get("/stats/reminders", async (_req: Request, res: Response) => {
  const stats = await queryOne<Record<string, unknown>>(
    `SELECT
       (SELECT COUNT(*) FROM marketing.leads WHERE email_verificado = false) AS pendentes_count,
       (SELECT COUNT(*) FROM marketing.leads WHERE email_verificado = false AND lembretes_enviados >= 1) AS lembrete_1_enviado,
       (SELECT COUNT(*) FROM marketing.leads WHERE email_verificado = false AND lembretes_enviados >= 2) AS lembrete_2_enviado,
       (SELECT COUNT(*) FROM marketing.leads WHERE email_verificado = true) AS verificados_total,
       (SELECT COUNT(*) FROM marketing.leads) AS leads_total`
  );

  const pendentes = await query<{ id: string; nome: string; email: string; cupom: string | null; lembretes_enviados: number; ultimo_lembrete_em: string | null; criado_em: string }>(
    `SELECT id, nome, email, cupom, lembretes_enviados, ultimo_lembrete_em, criado_em
     FROM marketing.leads
     WHERE email_verificado = false
     ORDER BY criado_em DESC
     LIMIT 20`
  );

  res.json({ ...stats, pendentes });
});

// ── GET /api/flows/upcoming — próximos emails agendados ───────

// Mapeamento de condição para descrição legível
const condicaoDescricoes: Record<string, string> = {
  email_aberto: "Se abriu o email",
  email_clicado: "Se clicou no email",
  comprou: "Se comprou",
  visitou_site: "Se visitou o site",
  viu_produto: "Se viu o produto",
  abandonou_cart: "Se abandonou o carrinho",
  score_minimo: "Se atingiu score mínimo",
};

interface FlowStepUpcoming {
  tipo: "email" | "whatsapp" | "wait" | "condicao";
  template?: string;
  delay_horas: number;
  condicao?: string;
  sim?: number;
  nao?: number;
  proximo?: number;
  ref_step?: number;
  parametros?: Record<string, unknown>;
}

/**
 * A partir do step_atual, percorre os steps do fluxo para determinar
 * qual será o próximo email a ser disparado.
 */
function analyzeUpcomingEmail(
  steps: FlowStepUpcoming[],
  stepAtual: number,
): {
  proximo_tipo: string;
  proximo_template: string | null;
  template_alternativo: string | null;
  condicao_descricao: string | null;
} {
  if (stepAtual < 0 || stepAtual >= steps.length) {
    return { proximo_tipo: "desconhecido", proximo_template: null, template_alternativo: null, condicao_descricao: null };
  }

  const step = steps[stepAtual];

  // Se o step atual é email, esse é o próximo
  if (step.tipo === "email") {
    return {
      proximo_tipo: "email",
      proximo_template: step.template || null,
      template_alternativo: null,
      condicao_descricao: null,
    };
  }

  // Se é wait, o email virá DEPOIS do wait — buscar o step seguinte
  if (step.tipo === "wait") {
    const nextIndex = step.proximo !== undefined ? step.proximo : stepAtual + 1;
    if (nextIndex === -1 || nextIndex >= steps.length) {
      return { proximo_tipo: "wait", proximo_template: null, template_alternativo: null, condicao_descricao: null };
    }
    const nextStep = steps[nextIndex];
    if (nextStep.tipo === "email") {
      return {
        proximo_tipo: "wait",
        proximo_template: nextStep.template || null,
        template_alternativo: null,
        condicao_descricao: `Aguardando ${step.delay_horas}h → ${nextStep.template || "email"}`,
      };
    }
    if (nextStep.tipo === "condicao") {
      // Após o wait vem uma condição — resolver templates em profundidade
      const simIndex = nextStep.sim ?? -1;
      const naoIndex = nextStep.nao ?? -1;
      const resolveT = (idx: number, d = 0): string | null => {
        if (idx === -1 || idx >= steps.length || d > 5) return null;
        const s = steps[idx];
        if (s.tipo === "email") return s.template || null;
        if (s.tipo === "wait") return resolveT(s.proximo !== undefined ? s.proximo : idx + 1, d + 1);
        if (s.tipo === "condicao") return resolveT(s.nao ?? -1, d + 1) || resolveT(s.sim ?? -1, d + 1);
        return null;
      };
      const simTemplate = resolveT(simIndex);
      const naoTemplate = resolveT(naoIndex);
      const descBase = condicaoDescricoes[nextStep.condicao || ""] || nextStep.condicao || "condição";
      return {
        proximo_tipo: "wait",
        proximo_template: naoTemplate || simTemplate,
        template_alternativo: naoTemplate && simTemplate && naoTemplate !== simTemplate ? simTemplate : null,
        condicao_descricao: `Aguardando ${step.delay_horas}h → ${descBase} → sim: ${simTemplate || (simIndex === -1 ? "encerra" : `step ${simIndex}`)}, não: ${naoTemplate || (naoIndex === -1 ? "encerra" : `step ${naoIndex}`)}`,
      };
    }
    return {
      proximo_tipo: "wait",
      proximo_template: nextStep.template || null,
      template_alternativo: null,
      condicao_descricao: `Aguardando ${step.delay_horas}h → step tipo ${nextStep.tipo}`,
    };
  }

  // Se é condicao, listar os dois caminhos possíveis
  if (step.tipo === "condicao") {
    const simIndex = step.sim ?? -1;
    const naoIndex = step.nao ?? -1;

    // Resolve template buscando em profundidade (segue condições e waits, max 5 níveis)
    const resolveTemplate = (idx: number, depth = 0): string | null => {
      if (idx === -1 || idx >= steps.length || depth > 5) return null;
      const s = steps[idx];
      if (s.tipo === "email") return s.template || null;
      if (s.tipo === "wait") {
        const afterWait = s.proximo !== undefined ? s.proximo : idx + 1;
        return resolveTemplate(afterWait, depth + 1);
      }
      if (s.tipo === "condicao") {
        // Preferir caminho "não" (mais comum), fallback para "sim"
        const naoIdx = s.nao ?? -1;
        const simIdx = s.sim ?? -1;
        return resolveTemplate(naoIdx, depth + 1) || resolveTemplate(simIdx, depth + 1);
      }
      return null;
    };

    const simTemplate = resolveTemplate(simIndex);
    const naoTemplate = resolveTemplate(naoIndex);

    const descBase = condicaoDescricoes[step.condicao || ""] || step.condicao || "condição";
    const descSim = simTemplate || (simIndex === -1 ? "encerra" : `step ${simIndex}`);
    const descNao = naoTemplate || (naoIndex === -1 ? "encerra" : `step ${naoIndex}`);

    return {
      proximo_tipo: "condicao",
      proximo_template: naoTemplate || simTemplate,
      template_alternativo: naoTemplate && simTemplate && naoTemplate !== simTemplate ? simTemplate : null,
      condicao_descricao: `${descBase} → sim: ${descSim}, não: ${descNao}`,
    };
  }

  return { proximo_tipo: step.tipo, proximo_template: null, template_alternativo: null, condicao_descricao: null };
}

flowsRouter.get("/upcoming", async (_req: Request, res: Response) => {
  try {
    const executions = await query<{
      execution_id: string;
      flow_id: string;
      fluxo_nome: string;
      steps: FlowStepUpcoming[] | string;
      cliente_nome: string;
      cliente_email: string;
      proximo_step_em: string;
      step_atual: number;
      metadata: Record<string, unknown> | string;
    }>(
      `SELECT
         fe.id AS execution_id,
         fe.flow_id,
         f.nome AS fluxo_nome,
         f.steps,
         c.nome AS cliente_nome,
         c.email AS cliente_email,
         fe.proximo_step_em,
         fe.step_atual,
         fe.metadata
       FROM marketing.flow_executions fe
       JOIN marketing.flows f ON f.id = fe.flow_id
       JOIN crm.customers c ON c.id = fe.customer_id
       WHERE fe.status = 'ativo'
         AND fe.proximo_step_em IS NOT NULL
       ORDER BY fe.proximo_step_em ASC
       LIMIT 100`
    );

    const upcoming = executions.map(async (exec) => {
      const steps: FlowStepUpcoming[] = typeof exec.steps === "string"
        ? JSON.parse(exec.steps)
        : exec.steps;
      const metadata = (typeof exec.metadata === "string" ? JSON.parse(exec.metadata) : exec.metadata) || {};

      const analysis = analyzeUpcomingEmail(steps, exec.step_atual);

      let preview_html: string | null = null;
      if (analysis.proximo_template) {
        try {
          // Enriquecer metadata para preview realista
          const tplLow = (analysis.proximo_template || "").toLowerCase();
          const isAgradecimento = tplLow.includes("agradecimento") || tplLow.includes("pós-compra");
          if (isAgradecimento) {
            const scoreData = await queryOne<{ total_pedidos: string }>(
              "SELECT total_pedidos::text FROM crm.customer_scores WHERE customer_id = (SELECT customer_id FROM marketing.flow_executions WHERE id = $1)",
              [exec.execution_id]
            );
            const totalPedidos = parseInt(scoreData?.total_pedidos || "0", 10);
            if (totalPedidos <= 2) {
              metadata.primeira_compra = true;
              metadata.cupom = metadata.cupom || "BIB-EXEMPLO-0000";
            }
          }
          preview_html = await buildFlowEmail(
            exec.cliente_nome || "Cliente",
            analysis.proximo_template,
            metadata
          );
        } catch { /* preview falhou, retorna null */ }
      }

      return {
        execution_id: exec.execution_id,
        fluxo_nome: exec.fluxo_nome,
        cliente_nome: exec.cliente_nome,
        cliente_email: exec.cliente_email,
        proximo_step_em: exec.proximo_step_em,
        step_atual: exec.step_atual,
        proximo_tipo: analysis.proximo_tipo,
        proximo_template: analysis.proximo_template,
        template_alternativo: analysis.template_alternativo,
        condicao_descricao: analysis.condicao_descricao,
        preview_html,
      };
    });

    const resolved = await Promise.all(upcoming);
    res.json({ upcoming: resolved });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    logger.error("Erro ao buscar upcoming flows", { error: message });
    res.status(500).json({ error: "Erro ao buscar próximos emails agendados" });
  }
});

// ── GET /api/flows — listar fluxos ────────────────────────────

flowsRouter.get("/", async (_req: Request, res: Response) => {
  const flows = await query<Record<string, unknown>>(
    `SELECT f.*,
       COALESCE(ec.ativo, 0) AS execucoes_ativas,
       COALESCE(ec.concluido, 0) AS execucoes_concluidas,
       COALESCE(ec.erro, 0) AS execucoes_erro
     FROM marketing.flows f
     LEFT JOIN (
       SELECT flow_id,
         COUNT(*) FILTER (WHERE status = 'ativo') AS ativo,
         COUNT(*) FILTER (WHERE status = 'concluido') AS concluido,
         COUNT(*) FILTER (WHERE status = 'erro') AS erro
       FROM marketing.flow_executions
       GROUP BY flow_id
     ) ec ON ec.flow_id = f.id
     ORDER BY f.ativo DESC, f.criado_em DESC`
  );

  res.json(flows);
});

// ── GET /api/flows/:id — detalhes + execuções recentes ────────

flowsRouter.get("/:id", async (req: Request, res: Response) => {
  const flow = await queryOne<Record<string, unknown>>(
    "SELECT * FROM marketing.flows WHERE id = $1",
    [req.params.id]
  );

  if (!flow) {
    res.status(404).json({ error: "Fluxo não encontrado" });
    return;
  }

  const executions = await query<Record<string, unknown>>(
    `SELECT fe.*, c.nome AS customer_nome, c.email AS customer_email
     FROM marketing.flow_executions fe
     JOIN crm.customers c ON c.id = fe.customer_id
     WHERE fe.flow_id = $1
     ORDER BY fe.iniciado_em DESC
     LIMIT 50`,
    [req.params.id]
  );

  res.json({ ...flow, executions });
});

// ── POST /api/flows — criar fluxo ────────────────────────────

// Sanitiza HTML em strings (anti-XSS stored)
function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, "").trim();
}

// ── Schema de step (compartilhado) ──────────────────────────────

const stepSchema = z.object({
  tipo: z.enum(["email", "whatsapp", "wait", "condicao"]),
  template: z.string().optional(),
  delay_horas: z.number().min(0),
  condicao: z.enum(["email_aberto", "email_clicado", "comprou", "visitou_site", "viu_produto", "abandonou_cart", "score_minimo"]).optional(),
  ref_step: z.number().int().min(0).optional(),
  parametros: z.record(z.unknown()).optional(),
  sim: z.number().int().min(-1).optional(),
  nao: z.number().int().min(-1).optional(),
  proximo: z.number().int().min(-1).optional(),
});

type StepInput = z.infer<typeof stepSchema>;

// ── Validação de integridade dos steps condicionais ─────────────

function validateFlowSteps(steps: StepInput[]): string | null {
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (step.tipo === "condicao") {
      if (!step.condicao) return `Step ${i}: condicao requer campo 'condicao'`;
      if (step.sim === undefined || step.nao === undefined)
        return `Step ${i}: condicao requer 'sim' e 'nao'`;
      for (const target of [step.sim, step.nao]) {
        if (target !== -1 && (target < 0 || target >= steps.length))
          return `Step ${i}: índice ${target} fora dos limites (0-${steps.length - 1} ou -1)`;
        if (target === i)
          return `Step ${i}: condição não pode apontar para si mesma`;
      }
      if ((step.condicao === "email_aberto" || step.condicao === "email_clicado") && step.ref_step === undefined)
        return `Step ${i}: ${step.condicao} requer ref_step`;
      if (step.ref_step !== undefined) {
        if (step.ref_step < 0 || step.ref_step >= steps.length)
          return `Step ${i}: ref_step ${step.ref_step} fora dos limites`;
        if (steps[step.ref_step].tipo !== "email")
          return `Step ${i}: ref_step deve apontar para um step de email`;
        if (step.ref_step >= i)
          return `Step ${i}: ref_step deve apontar para step anterior`;
      }
    }
    // Validar proximo (goto) em qualquer step
    if (step.proximo !== undefined && step.proximo !== -1) {
      if (step.proximo < 0 || step.proximo >= steps.length)
        return `Step ${i}: proximo ${step.proximo} fora dos limites`;
      if (step.proximo === i)
        return `Step ${i}: proximo não pode apontar para si mesmo`;
    }
  }
  return null;
}

const createSchema = z.object({
  nome: z.string().min(3).max(100).transform(stripHtml),
  descricao: z.string().optional().transform((v) => v ? stripHtml(v) : v),
  gatilho: z.enum([
    "order.first", "order.paid", "order.abandoned", "order.delivered",
    "customer.created", "customer.inactive",
    "lead.captured", "lead.cart_abandoned",
    "product.interested",
  ]),
  gatilho_config: z.record(z.unknown()).optional(),
  steps: z.array(stepSchema).min(1),
  ativo: z.boolean().optional(),
});

flowsRouter.post("/", async (req: Request, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Dados inválidos", details: parsed.error.flatten() });
    return;
  }

  const { nome, descricao, gatilho, gatilho_config, steps, ativo } = parsed.data;

  // Validar integridade dos steps condicionais
  const stepError = validateFlowSteps(steps);
  if (stepError) {
    res.status(400).json({ error: stepError });
    return;
  }

  const flow = await queryOne<Record<string, unknown>>(
    `INSERT INTO marketing.flows (nome, descricao, gatilho, gatilho_config, steps, ativo)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [nome, descricao || null, gatilho, JSON.stringify(gatilho_config || {}), JSON.stringify(steps), ativo ?? false]
  );

  logger.info("Fluxo criado", { id: flow?.id, nome, gatilho });
  res.status(201).json(flow);
});

// ── PUT /api/flows/:id — atualizar fluxo ──────────────────────

const updateSchema = z.object({
  nome: z.string().min(3).max(100).transform(stripHtml).optional(),
  descricao: z.string().optional().transform((v) => v ? stripHtml(v) : v),
  gatilho_config: z.record(z.unknown()).optional(),
  steps: z.array(stepSchema).min(1).optional(),
  ativo: z.boolean().optional(),
});

flowsRouter.put("/:id", async (req: Request, res: Response) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Dados inválidos", details: parsed.error.flatten() });
    return;
  }

  // Validar steps condicionais se fornecidos
  if (parsed.data.steps) {
    const stepError = validateFlowSteps(parsed.data.steps);
    if (stepError) {
      res.status(400).json({ error: stepError });
      return;
    }
  }

  const existing = await queryOne<{ id: string }>(
    "SELECT id FROM marketing.flows WHERE id = $1",
    [req.params.id]
  );

  if (!existing) {
    res.status(404).json({ error: "Fluxo não encontrado" });
    return;
  }

  const fields: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  const data = parsed.data;
  if (data.nome) { fields.push(`nome = $${idx++}`); values.push(data.nome); }
  if (data.descricao !== undefined) { fields.push(`descricao = $${idx++}`); values.push(data.descricao); }
  if (data.gatilho_config) { fields.push(`gatilho_config = $${idx++}`); values.push(JSON.stringify(data.gatilho_config)); }
  if (data.steps) { fields.push(`steps = $${idx++}`); values.push(JSON.stringify(data.steps)); }

  if (fields.length === 0) {
    res.json(existing);
    return;
  }

  fields.push(`atualizado_em = NOW()`);
  values.push(req.params.id);

  const flow = await queryOne<Record<string, unknown>>(
    `UPDATE marketing.flows SET ${fields.join(", ")} WHERE id = $${idx} RETURNING *`,
    values
  );

  logger.info("Fluxo atualizado", { id: req.params.id });
  res.json(flow);
});

// ── POST /api/flows/:id/toggle — ativar/desativar ─────────────

flowsRouter.post("/:id/toggle", async (req: Request, res: Response) => {
  const flow = await queryOne<Record<string, unknown>>(
    "UPDATE marketing.flows SET ativo = NOT ativo, atualizado_em = NOW() WHERE id = $1 RETURNING *",
    [req.params.id]
  );

  if (!flow) {
    res.status(404).json({ error: "Fluxo não encontrado" });
    return;
  }

  logger.info("Fluxo toggled", { id: req.params.id, ativo: flow.ativo });
  res.json(flow);
});

// ── GET /api/flows/:id/step-stats — estatísticas por step ─────

flowsRouter.get("/:id/step-stats", async (req: Request, res: Response) => {
  const flowId = req.params.id;

  // Stats de execução por step
  const stepStats = await query<{
    step_index: number;
    tipo: string;
    total: string;
    concluidos: string;
    erros: string;
    ignorados: string;
    resultado_agg: Record<string, unknown>;
  }>(
    `SELECT
       fse.step_index,
       fse.tipo,
       COUNT(*)::text AS total,
       COUNT(*) FILTER (WHERE fse.status = 'concluido')::text AS concluidos,
       COUNT(*) FILTER (WHERE fse.status = 'erro')::text AS erros,
       COUNT(*) FILTER (WHERE fse.status = 'ignorado')::text AS ignorados,
       jsonb_build_object(
         'passed_true', COUNT(*) FILTER (WHERE (fse.resultado->>'passed')::boolean = true),
         'passed_false', COUNT(*) FILTER (WHERE (fse.resultado->>'passed')::boolean = false),
         'emails_enviados', COUNT(*) FILTER (WHERE fse.resultado->>'messageId' IS NOT NULL)
       ) AS resultado_agg
     FROM marketing.flow_step_executions fse
     JOIN marketing.flow_executions fe ON fe.id = fse.execution_id
     WHERE fe.flow_id = $1
     GROUP BY fse.step_index, fse.tipo
     ORDER BY fse.step_index`,
    [flowId],
  );

  // Templates usados nos steps de email
  const flow = await queryOne<{ steps: Array<{ tipo: string; template?: string }> }>(
    "SELECT steps FROM marketing.flows WHERE id = $1",
    [flowId],
  );

  const templates: Record<number, { nome: string; assunto: string; html: string }> = {};
  if (flow) {
    const steps = typeof flow.steps === "string" ? JSON.parse(flow.steps) : flow.steps;
    for (let i = 0; i < steps.length; i++) {
      if (steps[i].tipo === "email" && steps[i].template) {
        const tpl = await queryOne<{ nome: string; assunto: string; html: string }>(
          "SELECT nome, assunto, html FROM marketing.templates WHERE nome ILIKE $1 AND ativo = true LIMIT 1",
          [`%${steps[i].template}%`],
        );
        if (tpl) templates[i] = tpl;
      }
    }
  }

  res.json({ step_stats: stepStats, templates });
});

// ── GET /api/flows/:id/executions/:execId — detalhe execução ──

flowsRouter.get("/:id/executions/:execId", async (req: Request, res: Response) => {
  const execution = await queryOne<Record<string, unknown>>(
    `SELECT fe.*, c.nome AS customer_nome, c.email AS customer_email
     FROM marketing.flow_executions fe
     JOIN crm.customers c ON c.id = fe.customer_id
     WHERE fe.id = $1 AND fe.flow_id = $2`,
    [req.params.execId, req.params.id]
  );

  if (!execution) {
    res.status(404).json({ error: "Execução não encontrada" });
    return;
  }

  const steps = await query<Record<string, unknown>>(
    `SELECT * FROM marketing.flow_step_executions
     WHERE execution_id = $1 ORDER BY step_index ASC`,
    [req.params.execId]
  );

  res.json({ ...execution, steps });
});

