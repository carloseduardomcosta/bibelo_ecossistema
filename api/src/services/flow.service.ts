import { query, queryOne } from "../db";
import { logger } from "../utils/logger";
import { sendEmail } from "../integrations/resend/email";
import { getNuvemShopToken, nsRequest } from "../integrations/nuvemshop/auth";
import { gerarLinkDescadastro, proxyImageUrl } from "../routes/email";

import crypto from "crypto";

// ── Sanitização HTML (anti-XSS em templates de email) ──────────
function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

// ── Gerar cupom único por lead via NuvemShop API ────────────────

async function gerarCupomUnico(
  nome: string,
  tipo: "percentage" | "absolute",
  valor: number,
  validadeDias: number,
): Promise<string | null> {
  try {
    const token = await getNuvemShopToken();
    if (!token) return null;

    // Gera código único: BIB-NOME-XXXX
    const nomeClean = nome.replace(/[^a-zA-Z]/g, "").toUpperCase().slice(0, 6) || "LEAD";
    const hash = crypto.randomBytes(2).toString("hex").toUpperCase();
    const code = `BIB-${nomeClean}-${hash}`;

    // Data de expiração
    const endDate = new Date(Date.now() + validadeDias * 86400000);
    const endDateStr = endDate.toISOString().split("T")[0];

    await nsRequest<{ id: number }>("post", "coupons", token, {
      code,
      type: tipo,
      value: String(valor),
      max_uses: 1,
      first_consumer_purchase: true,
      end_date: endDateStr,
      valid: true,
      combines_with_other_discounts: false,
    });

    logger.info("Cupom único criado na NuvemShop", { code, tipo, valor, endDate: endDateStr });
    return code;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("Erro ao criar cupom único", { error: msg, nome, tipo, valor });
    return null;
  }
}

// ── Types ──────────────────────────────────────────────────────

interface FlowStep {
  tipo: "email" | "whatsapp" | "wait" | "condicao";
  template?: string;
  delay_horas: number;
  // Campos de condição (só quando tipo === "condicao"):
  condicao?: "email_aberto" | "email_clicado" | "comprou" | "visitou_site" | "viu_produto" | "abandonou_cart" | "score_minimo";
  ref_step?: number;    // qual email step verificar (para email_aberto/email_clicado)
  parametros?: Record<string, unknown>;
  sim?: number;         // índice do step se TRUE (-1 = completar fluxo)
  nao?: number;         // índice do step se FALSE (-1 = completar fluxo)
  proximo?: number;     // override do próximo step para qualquer tipo (-1 = completar, undefined = +1)
}

interface Flow {
  id: string;
  nome: string;
  gatilho: string;
  gatilho_config: Record<string, unknown>;
  steps: FlowStep[];
  ativo: boolean;
}

interface FlowExecution {
  id: string;
  flow_id: string;
  customer_id: string;
  step_atual: number;
  status: string;
  metadata: Record<string, unknown>;
  proximo_step_em: string | null;
}

// ── Trigger: avalia se existe fluxo ativo para o gatilho ───────

export async function triggerFlow(
  gatilho: string,
  customerId: string,
  metadata: Record<string, unknown> = {}
): Promise<string[]> {
  const flows = await query<Flow>(
    "SELECT id, nome, gatilho, gatilho_config, steps, ativo FROM marketing.flows WHERE gatilho = $1 AND ativo = true",
    [gatilho]
  );

  if (flows.length === 0) return [];

  // Busca dados do cliente antes de disparar — valida email e opt-out
  const customer = await queryOne<{ email: string | null; email_optout: boolean }>(
    "SELECT email, email_optout FROM crm.customers WHERE id = $1",
    [customerId]
  );

  if (!customer) {
    logger.warn("triggerFlow: cliente não encontrado", { customerId, gatilho });
    return [];
  }

  // LGPD: não cria execução se cliente fez opt-out de email
  if (customer.email_optout) {
    logger.info("triggerFlow: cliente fez opt-out, fluxo não criado", { customerId, gatilho });
    return [];
  }

  // Não cria fluxo se cliente não tem email (todos os fluxos dependem de email por ora)
  if (!customer.email) {
    logger.info("triggerFlow: cliente sem email, fluxo não criado", { customerId, gatilho });
    return [];
  }

  // Rate limit: max 1 email por 12h por cliente (across all flows)
  const recentEmail = await queryOne<{ id: string }>(
    `SELECT fse.id FROM marketing.flow_step_executions fse
     JOIN marketing.flow_executions fe ON fe.id = fse.execution_id
     WHERE fe.customer_id = $1 AND fse.tipo = 'email' AND fse.status = 'concluido'
       AND fse.executado_em > NOW() - INTERVAL '12 hours'
     LIMIT 1`,
    [customerId]
  );

  if (recentEmail) {
    logger.info("triggerFlow: cliente recebeu email há menos de 12h, fluxo adiado", { customerId, gatilho });
    return [];
  }

  const executionIds: string[] = [];

  for (const flow of flows) {
    let steps: FlowStep[];
    try {
      steps = typeof flow.steps === "string" ? JSON.parse(flow.steps) : flow.steps;
    } catch {
      logger.error("Fluxo com steps inválidos", { flowId: flow.id });
      continue;
    }

    // Filtra steps de whatsapp (ainda não implementado)
    steps = steps.filter((s) => s.tipo !== "whatsapp");
    if (steps.length === 0) {
      logger.warn("Fluxo sem steps válidos após filtrar whatsapp", { flowId: flow.id });
      continue;
    }

    const firstStep = steps[0] as FlowStep | undefined;

    // Calcula quando executar o primeiro step
    const delayMs = Math.max((firstStep?.delay_horas || 0), 0) * 3600 * 1000;
    const proximoStepEm = new Date(Date.now() + delayMs);

    // Janela temporal: permite re-engajamento após 90 dias (em vez de UNIQUE lifetime)
    const existing = await queryOne<{ id: string; status: string; iniciado_em: string }>(
      `SELECT id, status, iniciado_em FROM marketing.flow_executions
       WHERE flow_id = $1 AND customer_id = $2
       ORDER BY iniciado_em DESC LIMIT 1`,
      [flow.id, customerId]
    );

    if (existing) {
      const daysSince = (Date.now() - new Date(existing.iniciado_em).getTime()) / (1000 * 86400);
      if (daysSince < 90) {
        logger.info("Fluxo já executado nos últimos 90 dias", { flowId: flow.id, customerId, daysSince: Math.round(daysSince) });
        continue;
      }
    }

    // INSERT — sem ON CONFLICT, pois já validamos janela acima
    const execution = await queryOne<{ id: string }>(
      `INSERT INTO marketing.flow_executions (flow_id, customer_id, step_atual, status, metadata, proximo_step_em)
       VALUES ($1, $2, 0, 'ativo', $3, $4)
       RETURNING id`,
      [flow.id, customerId, JSON.stringify(metadata), proximoStepEm]
    );

    if (!execution) continue;

    // Cria step execution para o primeiro step
    if (firstStep) {
      await query(
        `INSERT INTO marketing.flow_step_executions (execution_id, step_index, tipo, status, agendado_para)
         VALUES ($1, 0, $2, 'pendente', $3)`,
        [execution.id, firstStep.tipo, proximoStepEm]
      );
    }

    // Atualiza contador do fluxo
    await query(
      "UPDATE marketing.flows SET total_ativos = total_ativos + 1, atualizado_em = NOW() WHERE id = $1",
      [flow.id]
    );

    executionIds.push(execution.id);
    logger.info("Fluxo disparado", { flowId: flow.id, flowNome: flow.nome, customerId, executionId: execution.id });
  }

  return executionIds;
}

// ── Avaliar condição comportamental ──────────────────────────────

async function evaluateCondition(
  condicao: string,
  executionId: string,
  customerId: string,
  refStep?: number,
  parametros?: Record<string, unknown>,
): Promise<boolean> {
  // Buscar timestamp de início do fluxo (janela temporal)
  const exec = await queryOne<{ iniciado_em: string }>(
    "SELECT iniciado_em FROM marketing.flow_executions WHERE id = $1",
    [executionId],
  );
  const flowStart = exec?.iniciado_em || new Date().toISOString();

  switch (condicao) {
    case "email_aberto":
    case "email_clicado": {
      if (refStep === undefined) {
        logger.warn("evaluateCondition: ref_step obrigatório para " + condicao, { executionId });
        return false;
      }
      // Buscar messageId do email enviado no step referenciado
      const stepExec = await queryOne<{ resultado: Record<string, unknown> }>(
        `SELECT resultado FROM marketing.flow_step_executions
         WHERE execution_id = $1 AND step_index = $2 AND tipo = 'email' AND status = 'concluido'`,
        [executionId, refStep],
      );
      const messageId = stepExec?.resultado?.messageId as string | undefined;
      if (!messageId) {
        logger.warn("evaluateCondition: messageId não encontrado no step " + refStep, { executionId });
        return false;
      }
      const tipoEvento = condicao === "email_aberto" ? "opened" : "clicked";
      const event = await queryOne<{ id: string }>(
        `SELECT id FROM marketing.email_events
         WHERE message_id = $1 AND tipo = $2 LIMIT 1`,
        [messageId, tipoEvento],
      );
      return !!event;
    }

    case "comprou": {
      const order = await queryOne<{ total: string }>(
        `SELECT (
          (SELECT COUNT(*) FROM sync.nuvemshop_orders WHERE customer_id = $1 AND webhook_em > $2) +
          (SELECT COUNT(*) FROM sync.bling_orders WHERE customer_id = $1 AND criado_bling > $2)
        )::text AS total`,
        [customerId, flowStart],
      );
      return parseInt(order?.total || "0", 10) > 0;
    }

    case "visitou_site": {
      const visit = await queryOne<{ id: string }>(
        `SELECT id FROM crm.tracking_events
         WHERE customer_id = $1 AND evento IN ('page_view', 'product_view', 'add_to_cart', 'checkout_start')
           AND criado_em > $2 LIMIT 1`,
        [customerId, flowStart],
      );
      return !!visit;
    }

    case "viu_produto": {
      const resourceId = parametros?.resource_id as string | undefined;
      const conditions = [`customer_id = $1`, `evento = 'product_view'`, `criado_em > $2`];
      const params: unknown[] = [customerId, flowStart];
      if (resourceId) {
        conditions.push(`resource_id = $3`);
        params.push(resourceId);
      }
      const pv = await queryOne<{ id: string }>(
        `SELECT id FROM crm.tracking_events WHERE ${conditions.join(" AND ")} LIMIT 1`,
        params,
      );
      return !!pv;
    }

    case "abandonou_cart": {
      const cart = await queryOne<{ id: string }>(
        `SELECT id FROM marketing.pedidos_pendentes
         WHERE customer_id = $1 AND convertido = false LIMIT 1`,
        [customerId],
      );
      return !!cart;
    }

    case "score_minimo": {
      const minimo = (parametros?.minimo as number) || 50;
      const score = await queryOne<{ score: number }>(
        `SELECT score FROM crm.customer_scores WHERE customer_id = $1 AND score >= $2`,
        [customerId, minimo],
      );
      return !!score;
    }

    default:
      logger.warn("evaluateCondition: condição desconhecida", { condicao, executionId });
      return false;
  }
}

// ── Executar um step específico ────────────────────────────────

export async function executeStep(executionId: string): Promise<boolean> {
  const execution = await queryOne<FlowExecution>(
    `SELECT fe.id, fe.flow_id, fe.customer_id, fe.step_atual, fe.status, fe.metadata, fe.proximo_step_em
     FROM marketing.flow_executions fe WHERE fe.id = $1 AND fe.status = 'ativo'`,
    [executionId]
  );

  if (!execution) {
    logger.warn("Execução não encontrada ou não ativa", { executionId });
    return false;
  }

  const flow = await queryOne<Flow>(
    "SELECT id, nome, gatilho, gatilho_config, steps, ativo FROM marketing.flows WHERE id = $1",
    [execution.flow_id]
  );

  if (!flow) return false;

  const steps: FlowStep[] = typeof flow.steps === "string" ? JSON.parse(flow.steps) : flow.steps;
  const currentStep = steps[execution.step_atual];

  if (!currentStep) {
    await completeExecution(executionId, execution.flow_id);
    return true;
  }

  // Busca dados do cliente
  const customer = await queryOne<{ id: string; nome: string; email: string | null; telefone: string | null; email_optout: boolean }>(
    "SELECT id, nome, email, telefone, email_optout FROM crm.customers WHERE id = $1",
    [execution.customer_id]
  );

  if (!customer) {
    await failExecution(executionId, "Cliente não encontrado");
    return false;
  }

  // LGPD: se o cliente fez opt-out, cancela a execução do fluxo (não envia nada)
  if (customer.email_optout && currentStep.tipo === "email") {
    logger.info("Fluxo cancelado: cliente fez opt-out de email", { executionId, email: customer.email });
    await completeExecution(executionId, execution.flow_id);
    await query(
      `UPDATE marketing.flow_step_executions SET status = 'ignorado', resultado = '{"motivo":"email_optout"}'::jsonb
       WHERE execution_id = $1 AND step_index = $2`,
      [executionId, execution.step_atual]
    );
    return true;
  }

  // Inteligência: pula step de cupom/lembrete se o lead já comprou (cupom já foi usado)
  const tplName = (currentStep.template || "").toLowerCase();
  if (currentStep.tipo === "email" && (tplName.includes("cupom") || tplName.includes("lembrete cupom"))) {
    const hasOrder = await queryOne<{ total: string }>(
      `SELECT ((SELECT COUNT(*) FROM sync.nuvemshop_orders WHERE customer_id = $1) +
               (SELECT COUNT(*) FROM sync.bling_orders WHERE customer_id = $1))::text AS total`,
      [execution.customer_id]
    );
    if (parseInt(hasOrder?.total || "0", 10) > 0) {
      logger.info("Step de cupom ignorado: cliente já comprou", { executionId, customerId: execution.customer_id });
      await query(
        `UPDATE marketing.flow_step_executions SET status = 'ignorado', resultado = '{"motivo":"ja_comprou"}'::jsonb
         WHERE execution_id = $1 AND step_index = $2`,
        [executionId, execution.step_atual]
      );
      await advanceFlow(executionId, execution, steps);
      return true;
    }
  }

  // Marca step como executando
  await query(
    `UPDATE marketing.flow_step_executions SET status = 'executando', executado_em = NOW()
     WHERE execution_id = $1 AND step_index = $2`,
    [executionId, execution.step_atual]
  );

  try {
    let resultado: Record<string, unknown> = {};

    switch (currentStep.tipo) {
      case "email":
        resultado = await executeEmailStep(customer, currentStep, execution.metadata);
        break;

      case "whatsapp":
        resultado = await executeWhatsAppStep(customer, currentStep, execution.metadata);
        break;

      case "wait":
        // Wait steps são tratados pelo agendamento — quando chegam aqui, o delay já passou
        resultado = { waited: true };
        break;

      case "condicao": {
        const passed = await evaluateCondition(
          currentStep.condicao || "",
          executionId,
          execution.customer_id,
          currentStep.ref_step,
          currentStep.parametros,
        );
        const targetIndex = passed ? (currentStep.sim ?? -1) : (currentStep.nao ?? -1);
        const condResultado = {
          evaluated: true,
          passed,
          condicao: currentStep.condicao,
          ref_step: currentStep.ref_step,
          targetIndex,
        };

        logger.info("Condição avaliada", {
          executionId,
          condicao: currentStep.condicao,
          passou: passed,
          proximoIndex: targetIndex,
        });

        // Marca step como concluído e avança com branching (early return)
        await query(
          `UPDATE marketing.flow_step_executions SET status = 'concluido', resultado = $3, executado_em = NOW()
           WHERE execution_id = $1 AND step_index = $2`,
          [executionId, execution.step_atual, JSON.stringify(condResultado)],
        );
        await advanceFlow(executionId, execution, steps, targetIndex);
        return true;
      }

      default:
        logger.warn("Tipo de step desconhecido", { tipo: currentStep.tipo });
        resultado = { skipped: true };
    }

    // Marca step como concluído
    await query(
      `UPDATE marketing.flow_step_executions SET status = 'concluido', resultado = $3
       WHERE execution_id = $1 AND step_index = $2`,
      [executionId, execution.step_atual, JSON.stringify(resultado)]
    );

    // Avança para próximo step
    await advanceFlow(executionId, execution, steps);

    return true;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    logger.error("Erro ao executar step do fluxo", {
      executionId, stepIndex: execution.step_atual, error: message,
    });

    // Retry 1x para steps de email (erros temporários do Resend)
    if (currentStep.tipo === "email") {
      const stepExec = await queryOne<{ resultado: unknown }>(
        `SELECT resultado FROM marketing.flow_step_executions WHERE execution_id = $1 AND step_index = $2`,
        [executionId, execution.step_atual]
      );
      const prevResult = stepExec?.resultado as Record<string, unknown> | null;
      const alreadyRetried = prevResult && (prevResult as Record<string, unknown>).retried;

      if (!alreadyRetried) {
        logger.info("Retry de email em 5s", { executionId, stepIndex: execution.step_atual });
        await query(
          `UPDATE marketing.flow_step_executions SET status = 'pendente', resultado = '{"retried":true}'::jsonb
           WHERE execution_id = $1 AND step_index = $2`,
          [executionId, execution.step_atual]
        );
        // Reagenda para 5 minutos
        await query(
          `UPDATE marketing.flow_executions SET proximo_step_em = NOW() + INTERVAL '5 minutes' WHERE id = $1`,
          [executionId]
        );
        return false;
      }
    }

    await query(
      `UPDATE marketing.flow_step_executions SET status = 'erro', resultado = $3
       WHERE execution_id = $1 AND step_index = $2`,
      [executionId, execution.step_atual, JSON.stringify({ error: message })]
    );

    // Não falha a execução inteira — tenta avançar
    await advanceFlow(executionId, execution, steps);
    return false;
  }
}

// ── Avançar para o próximo step ────────────────────────────────

async function advanceFlow(
  executionId: string,
  execution: FlowExecution,
  steps: FlowStep[],
  targetIndex?: number,
): Promise<void> {
  // Prioridade: targetIndex (branching) > proximo (goto) > +1 (linear)
  const currentStep = steps[execution.step_atual];
  const nextIndex = targetIndex !== undefined
    ? targetIndex
    : currentStep?.proximo !== undefined
      ? currentStep.proximo
      : execution.step_atual + 1;

  // -1 = completar o fluxo (ex: comprou → para)
  if (nextIndex === -1 || nextIndex >= steps.length) {
    await completeExecution(executionId, execution.flow_id);
    return;
  }

  // Proteção contra índice inválido
  if (nextIndex < 0) {
    logger.error("advanceFlow: índice inválido", { executionId, targetIndex: nextIndex });
    await completeExecution(executionId, execution.flow_id);
    return;
  }

  const nextStep = steps[nextIndex];
  const delayMs = (nextStep.delay_horas || 0) * 3600 * 1000;
  const proximoStepEm = new Date(Date.now() + delayMs);

  // Atualiza execução
  await query(
    `UPDATE marketing.flow_executions SET step_atual = $2, proximo_step_em = $3
     WHERE id = $1`,
    [executionId, nextIndex, proximoStepEm]
  );

  // Cria step execution para o próximo
  await query(
    `INSERT INTO marketing.flow_step_executions (execution_id, step_index, tipo, status, agendado_para)
     VALUES ($1, $2, $3, 'pendente', $4)`,
    [executionId, nextIndex, nextStep.tipo, proximoStepEm]
  );

  logger.info("Fluxo avançado", { executionId, nextIndex, tipo: nextStep.tipo, agendadoPara: proximoStepEm });
}

// ── Concluir execução ──────────────────────────────────────────

async function completeExecution(executionId: string, flowId: string): Promise<void> {
  await query(
    "UPDATE marketing.flow_executions SET status = 'concluido', concluido_em = NOW() WHERE id = $1",
    [executionId]
  );
  await query(
    "UPDATE marketing.flows SET total_ativos = GREATEST(total_ativos - 1, 0), total_conversoes = total_conversoes + 1 WHERE id = $1",
    [flowId]
  );
  logger.info("Fluxo concluído", { executionId, flowId });
}

async function failExecution(executionId: string, motivo: string): Promise<void> {
  await query(
    "UPDATE marketing.flow_executions SET status = 'erro', concluido_em = NOW(), metadata = metadata || $2 WHERE id = $1",
    [executionId, JSON.stringify({ erro: motivo })]
  );
  logger.error("Fluxo falhou", { executionId, motivo });
}

// ── Executar step de email ─────────────────────────────────────

async function executeEmailStep(
  customer: { id: string; nome: string; email: string | null },
  step: FlowStep,
  metadata: Record<string, unknown>
): Promise<Record<string, unknown>> {
  if (!customer.email) {
    return { skipped: true, reason: "Cliente sem email" };
  }

  // Busca template pelo nome
  const template = await queryOne<{ id: string; assunto: string; html: string; texto: string }>(
    "SELECT id, assunto, html, texto FROM marketing.templates WHERE nome ILIKE $1 AND ativo = true LIMIT 1",
    [`%${step.template || ""}%`]
  );

  if (!template) {
    // Usa templates built-in ricos (com fotos, recovery_url, etc.)
    _currentRecipientEmail = customer.email || "";
    const html = await buildFlowEmail(customer.nome, step.template || "", metadata);
    const subject = getFlowSubject(step.template || "", customer.nome);

    const result = await sendEmail({
      to: customer.email,
      subject,
      html,
      tags: [
        { name: "flow", value: "true" },
        { name: "template_type", value: (step.template || "generico").replace(/[^a-zA-Z0-9_-]/g, "_") },
        { name: "customer_id", value: customer.id },
      ],
    });

    if (!result?.id) {
      throw new Error("Email não foi enviado — Resend retornou null");
    }

    // Registra interação na timeline do cliente
    await query(
      `INSERT INTO crm.interactions (customer_id, tipo, canal, descricao, metadata)
       VALUES ($1, 'email_enviado', 'email', $2, $3)`,
      [customer.id, `Email automático: ${step.template || "genérico"}`, JSON.stringify({ messageId: result.id, template: step.template })]
    );

    return { sent: true, messageId: result.id, templateUsed: "built-in" };
  }

  // Usa template do banco (marketing.templates)
  // Adicionar UTMs ao recovery_url para rastreabilidade
  const rawRecoveryUrl = (metadata.recovery_url as string) || "";
  const tplSlug = (step.template || "email").toLowerCase().replace(/[^a-z0-9]+/g, "_");
  const recoveryUrl = rawRecoveryUrl
    ? `${rawRecoveryUrl}${rawRecoveryUrl.includes("?") ? "&" : "?"}utm_source=email&utm_medium=flow&utm_campaign=${tplSlug}&utm_content=cta_recovery`
    : "";

  // ── Cupom único: gerar via NuvemShop API para templates de desconto ──
  const tplLower = (step.template || "").toLowerCase();
  const isCupomDesconto = tplLower.includes("cupom recupera") || tplLower.includes("cupom exclusi") || tplLower.includes("reativa") && tplLower.includes("cupom");
  let cupomFinal = String(metadata.cupom || "");

  if (isCupomDesconto) {
    // Determinar tipo e valor do cupom pelo template
    let cupomTipo: "percentage" | "absolute" = "percentage";
    let cupomValor = 10;
    let cupomDias = 2;

    if (tplLower.includes("recupera")) {
      cupomValor = 5; cupomDias = 1;  // Carrinho abandonado: 5%, 24h
    } else if (tplLower.includes("reativa")) {
      cupomValor = 10; cupomDias = 7;  // Reativação: 10%, 7 dias
    } else {
      cupomValor = 10; cupomDias = 2;  // Nutrição lead: 10%, 48h
    }

    const cupomUnico = await gerarCupomUnico(customer.nome, cupomTipo, cupomValor, cupomDias);
    if (cupomUnico) {
      cupomFinal = cupomUnico;
      logger.info("Cupom único gerado para email", { cupom: cupomUnico, template: step.template, customerId: customer.id });
    }
  }

  // Variáveis para HTML (escapadas) e texto plano (sem escape)
  const rawVars: Record<string, string> = {
    nome: customer.nome || "Cliente",
    email: customer.email,
    valor: formatBRL(metadata.valor),
    itens: formatItens(metadata.itens),
    recovery_url: recoveryUrl,
    numero: String(metadata.numero || metadata.ns_order_id || ""),
    codigo: String(metadata.codigo_rastreio || metadata.codigo || ""),
    prazo: String(metadata.prazo || ""),
    cupom: cupomFinal,
    produto: String(metadata.resource_nome || ""),
    senha_temp: String(metadata.senha_temp || ""),
  };
  // URLs e valores numéricos não precisam escape; nomes e textos sim
  const htmlSafeKeys = new Set(["nome", "email", "produto", "itens"]);
  const vars: Record<string, string> = {};
  for (const [k, v] of Object.entries(rawVars)) {
    vars[k] = htmlSafeKeys.has(k) ? escHtml(v) : v;
  }

  let html = template.html || "";
  let subject = template.assunto || step.template || "";
  for (const [key, val] of Object.entries(vars)) {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, "g");
    html = html.replace(regex, val);
    subject = subject.replace(regex, rawVars[key]); // subject usa valor sem escape HTML
  }

  const result = await sendEmail({
    to: customer.email,
    subject,
    html,
    text: template.texto ? Object.entries(rawVars).reduce((t, [k, v]) => t.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), v), template.texto) : undefined,
    tags: [
      { name: "flow", value: "true" },
      { name: "template_id", value: template.id },
      { name: "customer_id", value: customer.id },
    ],
  });

  if (!result?.id) {
    throw new Error("Email não foi enviado — Resend retornou null");
  }

  // Registra interação na timeline do cliente
  await query(
    `INSERT INTO crm.interactions (customer_id, tipo, canal, descricao, metadata)
     VALUES ($1, 'email_enviado', 'email', $2, $3)`,
    [customer.id, `Email automático: ${step.template || "genérico"}`, JSON.stringify({ messageId: result.id, templateId: template.id, assunto: subject })]
  );

  return { sent: true, messageId: result.id, templateId: template.id, ...(isCupomDesconto && cupomFinal ? { cupomGerado: cupomFinal } : {}) };
}

// ── Executar step de WhatsApp ──────────────────────────────────

async function executeWhatsAppStep(
  customer: { id: string; nome: string; telefone: string | null },
  step: FlowStep,
  _metadata: Record<string, unknown>
): Promise<Record<string, unknown>> {
  if (!customer.telefone) {
    return { skipped: true, reason: "Cliente sem telefone" };
  }

  // Evolution API ainda pendente — loga e pula
  const evolutionUrl = process.env.EVOLUTION_API_URL;
  const evolutionKey = process.env.EVOLUTION_API_KEY;

  if (!evolutionUrl || !evolutionKey || evolutionKey === "PREENCHER") {
    logger.warn("Evolution API não configurada — WhatsApp step pulado", {
      customerId: customer.id,
      template: step.template,
    });
    return { skipped: true, reason: "Evolution API não configurada" };
  }

  // TODO: implementar envio via Evolution API quando estiver configurada
  // const response = await fetch(`${evolutionUrl}/message/sendText/bibelocrm`, { ... });
  return { skipped: true, reason: "Evolution API pendente de implementação" };
}

// ── Helpers ────────────────────────────────────────────────────

function formatBRL(value: unknown): string {
  const num = Number(value);
  if (isNaN(num)) return "";
  return `R$ ${num.toFixed(2).replace(".", ",")}`;
}

function formatItens(itens: unknown): string {
  if (!itens || !Array.isArray(itens)) return "";
  return itens
    .map((item: Record<string, unknown>) => `${item.name || item.nome || "Produto"} (${item.quantity || item.qtd || 1}x)`)
    .join(", ");
}

// ── Normalizar URL de imagem (HTTPS + fallback formato) ───────

function safeImageUrl(url: string | undefined | null): string {
  if (!url) return "";
  let safe = url.trim();
  // Força HTTPS (Gmail bloqueia HTTP em emails)
  safe = safe.replace(/^http:\/\//i, "https://");
  // Passa pelo proxy do nosso domínio (evita bloqueio de imagens de CDN externo)
  return proxyImageUrl(safe);
}

// ── Email context: email do destinatário para link de descadastro ──
let _currentRecipientEmail = "";

// ── Email base wrapper ─────────────────────────────────────────

function emailWrapper(content: string, email?: string): string {
  const recipientEmail = email || _currentRecipientEmail;
  const unsubLink = recipientEmail ? gerarLinkDescadastro(recipientEmail) : "#";
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>@import url('https://fonts.googleapis.com/css2?family=Jost:wght@400;500;600;700&display=swap');*{font-family:Jost,'Segoe UI',Arial,sans-serif;}</style>
</head>
<body style="margin:0;padding:0;background:#ffe5ec;">
<div style="max-width:600px;margin:0 auto;padding:20px 10px;">
  <div style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 8px 30px rgba(254,104,196,0.12);">
    <!-- Header -->
    <div style="background:linear-gradient(135deg,#fff7c1,#ffe5ec);padding:40px 30px;text-align:center;border-bottom:3px solid #fe68c4;">
      <a href="https://www.papelariabibelo.com.br" target="_blank" style="text-decoration:none;">
        <img src="https://webhook.papelariabibelo.com.br/logo.png" alt="Papelaria Bibelô" style="width:80px;height:80px;border-radius:50%;border:3px solid #fe68c4;" />
      </a>
      <h1 style="color:#fe68c4;margin:10px 0 0;font-size:28px;font-weight:700;">Papelaria Bibelô</h1>
      <p style="color:#888;margin:5px 0 0;font-size:14px;font-weight:500;">Encantando momentos com papelaria</p>
    </div>
    <!-- Content -->
    <div style="padding:35px 30px;">
      ${content}
      <p style="font-size:13px;color:#999;text-align:center;margin:24px 0 0;">Dúvidas? Fale conosco: <a href="https://wa.me/5547933862514" style="color:#fe68c4;text-decoration:none;">(47) 9 3386-2514</a></p>
    </div>
    <!-- Footer -->
    <div style="background:#fff7c1;padding:24px 30px;text-align:center;border-top:1px solid #fee;">
      <p style="color:#777;font-size:13px;margin:0;font-weight:500;">Papelaria Bibelô</p>
      <p style="color:#aaa;font-size:11px;margin:4px 0 0;">CNPJ 63.961.764/0001-63 · contato@papelariabibelo.com.br · (47) 9 3386-2514</p>
      <p style="margin:8px 0 0;"><a href="https://www.papelariabibelo.com.br" style="color:#fe68c4;text-decoration:none;font-size:12px;font-weight:500;">papelariabibelo.com.br</a> · <a href="https://instagram.com/papelariabibelo" style="color:#fe68c4;text-decoration:none;font-size:12px;">@papelariabibelo</a></p>
      <p style="margin:10px 0 0;"><a href="${unsubLink}" style="color:#ccc;text-decoration:underline;font-size:10px;">Não quero mais receber emails</a></p>
    </div>
  </div>
</div>
</body>
</html>`;
}

// ── Botão CTA ──────────────────────────────────────────────────

function ctaButton(text: string, url: string): string {
  return `<div style="text-align:center;margin:28px 0;">
    <a href="${url}" style="background:linear-gradient(135deg,#fe68c4,#f472b6);color:#fff;padding:16px 40px;text-decoration:none;border-radius:50px;font-size:16px;font-weight:600;display:inline-block;box-shadow:0 4px 15px rgba(254,104,196,0.35);">
      ${text}
    </a>
  </div>`;
}

// ── Template: Carrinho Abandonado ──────────────────────────────

function buildAbandonedCartEmail(nome: string, metadata: Record<string, unknown>): string {
  const valor = formatBRL(metadata.valor);
  const recoveryUrl = (metadata.recovery_url as string) || "https://www.papelariabibelo.com.br";
  const itens = Array.isArray(metadata.itens) ? metadata.itens : [];

  let productsHtml = "";
  if (itens.length > 0) {
    const rows = itens.map((item: Record<string, unknown>) => {
      const imgUrl = safeImageUrl(item.image_url as string);
      const imgTag = imgUrl
        ? `<img src="${imgUrl}" alt="${item.name}" style="width:70px;height:70px;object-fit:cover;border-radius:8px;border:1px solid #eee;" />`
        : `<div style="width:70px;height:70px;background:#f0f0f0;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:24px;">📦</div>`;
      const price = item.price ? formatBRL(item.price) : "";
      const qty = item.quantity || item.qtd || 1;

      return `<tr>
        <td style="padding:10px 0;border-bottom:1px solid #f0f0f0;vertical-align:top;width:80px;">${imgTag}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;vertical-align:top;">
          <p style="margin:0 0 4px;font-weight:600;color:#333;">${item.name || "Produto"}</p>
          <p style="margin:0;color:#888;font-size:13px;">Qtd: ${qty}${price ? ` · ${price}` : ""}</p>
        </td>
      </tr>`;
    }).join("");

    productsHtml = `
    <table style="width:100%;border-collapse:collapse;margin:20px 0;">
      ${rows}
    </table>
    ${valor ? `<p style="text-align:right;font-size:18px;font-weight:700;color:#333;margin:10px 0;">Total: ${valor}</p>` : ""}`;
  }

  return emailWrapper(`
    <p style="font-size:16px;color:#333;">Oi, <strong>${nome || "Cliente"}</strong>! 👋</p>
    <p style="font-size:15px;color:#555;line-height:1.6;">
      Notamos que você deixou alguns itens especiais no seu carrinho.
      Eles ainda estão esperando por você!
    </p>
    ${productsHtml}
    ${ctaButton("Finalizar minha compra", recoveryUrl)}
    <p style="font-size:13px;color:#999;text-align:center;">
      O link acima leva direto para o seu carrinho com todos os itens selecionados.
    </p>
  `);
}

// ── Template: Última Chance ────────────────────────────────────

function buildLastChanceEmail(nome: string, metadata: Record<string, unknown>): string {
  const valor = formatBRL(metadata.valor);
  const recoveryUrl = (metadata.recovery_url as string) || "https://www.papelariabibelo.com.br";
  const itens = Array.isArray(metadata.itens) ? metadata.itens : [];
  const nomesProdutos = itens.map((i: Record<string, unknown>) => i.name || "produto").join(", ");

  return emailWrapper(`
    <p style="font-size:16px;color:#333;">Oi, <strong>${nome || "Cliente"}</strong>!</p>
    <div style="background:#FFF3E0;border-left:4px solid #FF9800;padding:15px 20px;border-radius:4px;margin:20px 0;">
      <p style="margin:0;color:#E65100;font-weight:600;font-size:15px;">⏰ Seus itens estão quase esgotando!</p>
    </div>
    <p style="font-size:15px;color:#555;line-height:1.6;">
      ${nomesProdutos ? `Os produtos <strong>${nomesProdutos}</strong> continuam` : "Seus itens continuam"}
      no seu carrinho${valor ? ` (${valor})` : ""}, mas o estoque está acabando.
    </p>
    <p style="font-size:15px;color:#555;line-height:1.6;">
      Não queremos que você perca! Finalize sua compra agora:
    </p>
    ${ctaButton("Garantir meus produtos", recoveryUrl)}
  `);
}

// ── Template: Pós-compra Agradecimento ────────────────────────

function buildThankYouEmail(nome: string, metadata: Record<string, unknown>): string {
  const valor = formatBRL(metadata.valor);

  return emailWrapper(`
    <p style="font-size:16px;color:#333;">Oi, <strong>${nome || "Cliente"}</strong>! 💕</p>
    <p style="font-size:15px;color:#555;line-height:1.6;">
      Muito obrigada pela sua compra${valor ? ` de <strong>${valor}</strong>` : ""}!
      Seu pedido já está sendo preparado com todo carinho.
    </p>
    <div style="background:#E8F5E9;border-radius:8px;padding:20px;text-align:center;margin:20px 0;">
      <p style="font-size:40px;margin:0;">📦✨</p>
      <p style="color:#2E7D32;font-weight:600;margin:10px 0 0;">Pedido confirmado!</p>
    </div>
    <p style="font-size:15px;color:#555;line-height:1.6;">
      Qualquer dúvida, estamos à disposição pelo WhatsApp ou e-mail.
      Esperamos que você adore os produtos!
    </p>
    ${ctaButton("Ver mais produtos", "https://www.papelariabibelo.com.br")}
  `);
}

// ── Template: Boas-vindas ──────────────────────────────────────

function buildWelcomeEmail(nome: string): string {
  return emailWrapper(`
    <p style="font-size:16px;color:#333;">Oi, <strong>${nome || "Cliente"}</strong>! 🎀</p>
    <p style="font-size:15px;color:#555;line-height:1.6;">
      Seja muito bem-vinda à <strong>Papelaria Bibelô</strong>!
      Estamos felizes em ter você com a gente.
    </p>
    <p style="font-size:15px;color:#555;line-height:1.6;">
      Na nossa loja você encontra tudo em papelaria, organização e presentes
      que encantam. Dá uma olhada nas novidades:
    </p>
    ${ctaButton("Conhecer a loja", "https://www.papelariabibelo.com.br")}
    <p style="font-size:13px;color:#999;text-align:center;">
      Nos siga no Instagram: <a href="https://instagram.com/papelariabibelo" style="color:#fe68c4;">@papelariabibelo</a>
    </p>
  `);
}

// ── Template: Reativação de Inativo ────────────────────────────

function buildReactivationEmail(nome: string): string {
  return emailWrapper(`
    <p style="font-size:16px;color:#333;">Oi, <strong>${nome || "Cliente"}</strong>! 👋</p>
    <p style="font-size:15px;color:#555;line-height:1.6;">
      Faz um tempinho que você não aparece por aqui e sentimos sua falta!
    </p>
    <div style="background:#FCE4EC;border-radius:8px;padding:20px;text-align:center;margin:20px 0;">
      <p style="font-size:40px;margin:0;">💌</p>
      <p style="color:#C2185B;font-weight:600;margin:10px 0 0;">Temos novidades para você!</p>
    </div>
    <p style="font-size:15px;color:#555;line-height:1.6;">
      Adicionamos muitos produtos novos na loja. Vem conferir o que preparamos
      especialmente para quem ama papelaria!
    </p>
    ${ctaButton("Ver novidades", "https://www.papelariabibelo.com.br")}
  `);
}

// ── Template: Lead Quente (add_to_cart sem compra) ────────────

function buildLeadCartEmail(nome: string, metadata: Record<string, unknown>): string {
  const cupom = (metadata.cupom as string) || "CLUBEBIBELO";
  const productName = (metadata.resource_nome as string) || "";
  const productImg = safeImageUrl(metadata.resource_imagem as string);
  const productUrl = (metadata.recovery_url as string) || "https://www.papelariabibelo.com.br";

  const productBlock = productName ? `
    <div style="background:#fef6fa;border-radius:12px;padding:20px;text-align:center;margin:20px 0;">
      ${productImg ? `<a href="${productUrl}" style="text-decoration:none;"><img src="${productImg}" alt="${productName}" style="max-width:250px;width:100%;height:auto;border-radius:12px;margin-bottom:12px;" /></a>` : ""}
      <p style="font-size:16px;font-weight:600;color:#333;margin:0;">${productName}</p>
    </div>` : "";

  return emailWrapper(`
    <p style="font-size:16px;color:#333;">Oi, <strong>${nome || "Cliente"}</strong>! 👋</p>
    <p style="font-size:15px;color:#555;line-height:1.6;">
      Vimos que você se interessou por algo na nossa loja${productName ? ` — <strong>${productName}</strong>` : ""}!
    </p>
    ${productBlock}
    <p style="font-size:15px;color:#555;line-height:1.6;">
      Lembra do seu cupom de boas-vindas? Ele ainda está ativo:
    </p>
    <div style="background:#fff3e0;border:2px dashed #fe68c4;border-radius:10px;padding:18px;text-align:center;margin:20px 0;">
      <p style="font-size:14px;color:#888;margin:0 0 6px;">Use o cupom:</p>
      <p style="font-size:26px;font-weight:800;color:#fe68c4;margin:0;letter-spacing:2px;">${cupom}</p>
      <p style="font-size:14px;color:#888;margin:6px 0 0;">10% de desconto na primeira compra!</p>
    </div>
    ${ctaButton("Aproveitar agora", productUrl)}
    <p style="font-size:13px;color:#999;text-align:center;">
      Frete calculado no carrinho. Cupom válido para primeira compra.
    </p>
  `);
}

// ── Template: Produtos Populares (drip dia 2) ─────────────────

async function buildPopularProductsEmail(nome: string): Promise<string> {
  // Busca top 4 produtos mais vistos no tracking (últimos 30 dias)
  const topProducts = await query<{
    resource_nome: string; resource_preco: number; resource_imagem: string; pagina: string; views: string;
  }>(
    `SELECT resource_nome, MAX(resource_preco) AS resource_preco,
            MAX(resource_imagem) AS resource_imagem, MAX(pagina) AS pagina,
            COUNT(*)::text AS views
     FROM crm.tracking_events
     WHERE evento = 'product_view' AND resource_nome IS NOT NULL
       AND resource_imagem IS NOT NULL AND criado_em > NOW() - INTERVAL '30 days'
     GROUP BY resource_nome ORDER BY COUNT(*) DESC LIMIT 4`
  );

  let productsHtml = "";
  if (topProducts.length >= 2) {
    productsHtml = topProducts.map(p => {
      const img = (p.resource_imagem || "").replace(/^http:\/\//i, "https://");
      const link = p.pagina || "https://www.papelariabibelo.com.br";
      const preco = p.resource_preco ? `R$ ${Number(p.resource_preco).toFixed(2).replace(".", ",")}` : "";
      return `
        <a href="${link}" style="display:block;text-decoration:none;background:#fff;border:1px solid #f0e0f0;border-radius:10px;padding:12px;margin:8px 0;">
          <table width="100%" cellpadding="0" cellspacing="0"><tr>
            <td width="70" style="vertical-align:top;">
              <img src="${img}" alt="" width="60" height="60" style="width:60px;height:60px;object-fit:cover;border-radius:8px;" />
            </td>
            <td style="vertical-align:middle;padding-left:12px;">
              <p style="font-size:14px;color:#333;font-weight:600;margin:0 0 4px;">${p.resource_nome}</p>
              ${preco ? `<p style="font-size:14px;color:#fe68c4;font-weight:700;margin:0;">${preco}</p>` : ""}
            </td>
          </tr></table>
        </a>`;
    }).join("");
  } else {
    // Fallback: categorias genéricas se não houver dados suficientes
    productsHtml = `
      <div style="background:#fef6fa;border-radius:12px;padding:20px;margin:10px 0;">
        <p style="font-size:15px;color:#555;margin:0 0 10px;">🎀 Agendas e planners decorados</p>
        <p style="font-size:15px;color:#555;margin:0 0 10px;">✏️ Canetas e marcadores fofos</p>
        <p style="font-size:15px;color:#555;margin:0 0 10px;">📒 Cadernos e blocos especiais</p>
        <p style="font-size:15px;color:#555;margin:0;">🎁 Presentes criativos e kits</p>
      </div>`;
  }

  return emailWrapper(`
    <p style="font-size:16px;color:#333;">Oi, <strong>${nome || "Cliente"}</strong>! ✨</p>
    <p style="font-size:15px;color:#555;line-height:1.6;">
      Quer saber quais são os <strong>produtos mais amados</strong> pelas nossas clientes?
      Separamos os queridinhos da Papelaria Bibelô para você:
    </p>
    ${productsHtml}
    ${ctaButton("Ver todos os produtos", "https://www.papelariabibelo.com.br")}
    <p style="font-size:13px;color:#999;text-align:center;">
      Nos siga no Instagram: <a href="https://instagram.com/papelariabibelo" style="color:#fe68c4;">@papelariabibelo</a>
    </p>
  `);
}

// ── Template: Lembrete Cupom (drip dia 5) ─────────────────────

function buildCouponReminderEmail(nome: string, metadata: Record<string, unknown>): string {
  const cupom = (metadata.cupom as string) || "CLUBEBIBELO";

  return emailWrapper(`
    <p style="font-size:16px;color:#333;">Oi, <strong>${nome || "Cliente"}</strong>! ⏰</p>
    <p style="font-size:15px;color:#555;line-height:1.6;">
      Passando para lembrar: seu cupom de <strong>10% de desconto</strong>
      ainda está ativo, mas não vai durar para sempre!
    </p>
    <div style="background:linear-gradient(135deg,#fff3e0,#fce4ec);border-radius:12px;padding:24px;text-align:center;margin:20px 0;">
      <p style="font-size:14px;color:#888;margin:0 0 8px;">Seu cupom exclusivo:</p>
      <p style="font-size:30px;font-weight:800;color:#fe68c4;margin:0;letter-spacing:3px;">${cupom}</p>
      <p style="font-size:15px;color:#e65100;font-weight:600;margin:10px 0 0;">Aproveite antes que expire!</p>
    </div>
    <p style="font-size:15px;color:#555;line-height:1.6;">
      É só escolher seus produtos favoritos e aplicar o cupom no carrinho.
      Simples assim! 💕
    </p>
    ${ctaButton("Usar meu cupom agora", "https://www.papelariabibelo.com.br")}
  `);
}

// ── Template: Prova Social (drip dia 10) ──────────────────────

async function buildSocialProofEmail(nome: string, _metadata: Record<string, unknown>): Promise<string> {
  const { getCachedReviews } = await import("../integrations/google/reviews");
  const reviewData = await getCachedReviews();

  const stars = "⭐".repeat(Math.round(reviewData.overall_rating));
  const ratingText = reviewData.total_reviews > 0
    ? `${reviewData.overall_rating}/5 — ${reviewData.total_reviews} avaliações`
    : "5/5 estrelas";

  // Pega até 3 reviews com texto
  const reviewsWithText = reviewData.reviews.filter(r => r.text && r.text.length > 10).slice(0, 3);

  const reviewsHtml = reviewsWithText.map(r => {
    const reviewStars = "⭐".repeat(r.rating);
    const authorClean = (r.author_name || "Cliente").replace(/[<>"'&]/g, "");
    const textClean = (r.text || "").replace(/[<>"'&]/g, "").slice(0, 200);
    return `
      <div style="background:#f8f9fa;border-left:4px solid #fe68c4;padding:15px 20px;border-radius:4px;margin:12px 0;">
        <p style="font-size:14px;color:#555;margin:0;font-style:italic;">"${textClean}"</p>
        <p style="font-size:13px;color:#999;margin:8px 0 0;">${reviewStars} — <strong>${authorClean}</strong> via Google</p>
      </div>`;
  }).join("");

  return emailWrapper(`
    <p style="font-size:16px;color:#333;">Oi, <strong>${nome || "Cliente"}</strong>! ⭐</p>
    <p style="font-size:15px;color:#555;line-height:1.6;">
      Quem compra na Papelaria Bibelô, volta sempre!
      Veja o que nossas clientes estão dizendo:
    </p>

    <div style="background:#fff7c1;border-radius:12px;padding:16px 20px;text-align:center;margin:15px 0;">
      <p style="font-size:24px;margin:0 0 4px;">${stars}</p>
      <p style="font-size:16px;color:#333;font-weight:700;margin:0;">${ratingText}</p>
      <p style="font-size:11px;color:#999;margin:4px 0 0;">Powered by Google</p>
    </div>

    ${reviewsHtml}

    <p style="font-size:15px;color:#555;line-height:1.6;margin-top:20px;">
      Venha fazer parte desse time de clientes satisfeitas!
    </p>
    ${ctaButton("Quero experimentar!", "https://www.papelariabibelo.com.br")}
    <p style="font-size:13px;color:#999;text-align:center;">
      <a href="https://g.page/r/CdahFa43hhIXEAE/review" style="color:#fe68c4;text-decoration:none;">
        Veja todas as avaliações no Google →
      </a>
    </p>
  `);
}

// ── Build email por template name ──────────────────────────────

async function buildFlowEmail(nome: string, templateName: string, metadata: Record<string, unknown>): Promise<string> {
  const lower = (templateName || "").toLowerCase();

  // Lead quente ANTES de carrinho abandonado (ambos contêm "carrinho")
  if (lower.includes("lead quente") || lower.includes("lead interessado")) {
    return buildLeadCartEmail(nome, metadata);
  }
  if (lower.includes("carrinho abandonado") || lower.includes("recuperação")) {
    return buildAbandonedCartEmail(nome, metadata);
  }
  if (lower.includes("última chance") || lower.includes("ultima chance")) {
    return buildLastChanceEmail(nome, metadata);
  }
  if (lower.includes("agradecimento") || lower.includes("obrigad") || lower.includes("pós-compra")) {
    return buildThankYouEmail(nome, metadata);
  }
  if (lower.includes("boas-vindas") || lower.includes("welcome") || lower.includes("bem-vind")) {
    return buildWelcomeEmail(nome);
  }
  if (lower.includes("reativação") || lower.includes("saudade") || lower.includes("inativ")) {
    return buildReactivationEmail(nome);
  }
  if (lower.includes("produtos populares") || lower.includes("mais vendidos")) {
    return await buildPopularProductsEmail(nome);
  }
  if (lower.includes("lembrete cupom") || lower.includes("cupom expirando")) {
    return buildCouponReminderEmail(nome, metadata);
  }
  if (lower.includes("prova social") || lower.includes("avaliações")) {
    return await buildSocialProofEmail(nome, metadata);
  }

  // Fallback genérico
  return emailWrapper(`
    <p style="font-size:16px;color:#333;">Oi, <strong>${nome || "Cliente"}</strong>!</p>
    <p style="font-size:15px;color:#555;line-height:1.6;">
      Temos novidades especiais para você na Papelaria Bibelô! Venha conferir.
    </p>
    ${ctaButton("Visitar a loja", "https://www.papelariabibelo.com.br")}
  `);
}

// ── Subject por template name ──────────────────────────────────

function getFlowSubject(templateName: string, nome: string): string {
  const lower = (templateName || "").toLowerCase();

  // Lead quente ANTES de carrinho (ambos contêm "carrinho")
  if (lower.includes("lead quente") || lower.includes("lead interessado")) {
    return `${nome || "Oi"}, vimos que você gostou! Use seu cupom 🛍️`;
  }
  if (lower.includes("carrinho") || lower.includes("recuperação")) {
    return `${nome || "Oi"}, seus itens estão esperando! 🛒`;
  }
  if (lower.includes("última chance") || lower.includes("ultima chance")) {
    return `⏰ Última chance para garantir seus produtos, ${nome || "Cliente"}!`;
  }
  if (lower.includes("agradecimento") || lower.includes("pós-compra")) {
    return `Obrigada pela compra, ${nome || "Cliente"}! 💕`;
  }
  if (lower.includes("boas-vindas")) {
    return `Bem-vinda à Papelaria Bibelô, ${nome || "Cliente"}! 🎀`;
  }
  if (lower.includes("reativação") || lower.includes("inativ")) {
    return `Sentimos sua falta, ${nome || "Cliente"}! 💌`;
  }
  if (lower.includes("produtos populares") || lower.includes("mais vendidos")) {
    return `${nome || "Oi"}, esses são os queridinhos da Bibelô! ✨`;
  }
  if (lower.includes("lembrete cupom") || lower.includes("cupom expirando")) {
    return `⏰ ${nome || "Oi"}, seu cupom de desconto está acabando!`;
  }
  if (lower.includes("prova social") || lower.includes("avaliações")) {
    return `${nome || "Oi"}, veja o que nossas clientes estão dizendo! ⭐`;
  }
  return `Novidades da Papelaria Bibelô para você!`;
}

// ── Processar steps prontos (chamado pelo worker) ──────────────

export async function processReadySteps(): Promise<number> {
  // Cleanup: execuções travadas em 'executando' há mais de 30 min → volta para 'ativo'
  await query(
    `UPDATE marketing.flow_executions SET status = 'ativo'
     WHERE status = 'executando' AND proximo_step_em < NOW() - INTERVAL '30 minutes'`
  );

  // Lock atômico: marca como 'executando' e retorna IDs — previne workers concorrentes
  const executions = await query<{ id: string }>(
    `UPDATE marketing.flow_executions
     SET status = 'executando'
     WHERE id IN (
       SELECT id FROM marketing.flow_executions
       WHERE status = 'ativo' AND proximo_step_em <= NOW()
       ORDER BY proximo_step_em ASC
       LIMIT 50
       FOR UPDATE SKIP LOCKED
     )
     RETURNING id`
  );

  let processed = 0;

  for (const exec of executions) {
    // Restaura status para 'ativo' antes de executar (executeStep espera 'ativo')
    await query("UPDATE marketing.flow_executions SET status = 'ativo' WHERE id = $1", [exec.id]);
    const success = await executeStep(exec.id);
    if (success) processed++;
  }

  return processed;
}

// ── Detectar carrinhos abandonados ─────────────────────────────

export async function checkAbandonedCarts(): Promise<number> {
  // Busca pedidos pendentes que expiraram e não foram convertidos/notificados
  const abandoned = await query<{
    id: string; ns_order_id: string; customer_id: string; email: string;
    valor: number; itens: unknown; recovery_url: string | null; checkout_id: string | null;
  }>(
    `SELECT id, ns_order_id, customer_id, email, valor, itens, recovery_url, checkout_id
     FROM marketing.pedidos_pendentes
     WHERE convertido = false AND notificado = false AND expira_em <= NOW()
     LIMIT 20`
  );

  let triggered = 0;

  for (const cart of abandoned) {
    if (!cart.customer_id) continue;

    // Verifica se o pedido foi pago enquanto esperávamos (evita email após pagamento)
    const paidCheck = await queryOne<{ status: string }>(
      "SELECT status FROM sync.nuvemshop_orders WHERE ns_id = $1",
      [cart.ns_order_id]
    );
    if (paidCheck && paidCheck.status === "paid") {
      await query("UPDATE marketing.pedidos_pendentes SET convertido = true WHERE id = $1", [cart.id]);
      continue;
    }

    // Tenta buscar recovery_url se ainda não temos
    let recoveryUrl = cart.recovery_url;
    if (!recoveryUrl) {
      // Tenta API de checkouts abandonados
      recoveryUrl = await fetchRecoveryUrl(cart.ns_order_id);
      // Fallback: constrói URL a partir do pedido (id + token)
      if (!recoveryUrl) {
        recoveryUrl = await buildRecoveryUrlFromOrder(cart.ns_order_id);
      }
      if (recoveryUrl) {
        await query(
          "UPDATE marketing.pedidos_pendentes SET recovery_url = $2 WHERE id = $1",
          [cart.id, recoveryUrl]
        );
      }
    }

    const itens = typeof cart.itens === "string" ? JSON.parse(cart.itens) : cart.itens;

    const executionIds = await triggerFlow("order.abandoned", cart.customer_id, {
      ns_order_id: cart.ns_order_id,
      valor: cart.valor,
      itens,
      email: cart.email,
      recovery_url: recoveryUrl || `https://www.papelariabibelo.com.br`,
    });

    if (executionIds.length > 0) {
      triggered++;
      // Só marca como notificado se o fluxo foi efetivamente criado
      await query(
        "UPDATE marketing.pedidos_pendentes SET notificado = true WHERE id = $1",
        [cart.id]
      );
    }
  }

  logger.info("Carrinhos abandonados verificados", { total: abandoned.length, triggered });
  return triggered;
}

// ── Buscar recovery_url da NuvemShop ──────────────────────────

async function fetchRecoveryUrl(nsOrderId: string): Promise<string | null> {
  try {
    const token = await getNuvemShopToken();
    if (!token) return null;

    // Tenta buscar checkouts abandonados recentes
    const checkouts = await nsRequest<Array<Record<string, unknown>>>(
      "get",
      `checkouts?status=abandoned&per_page=50`,
      token
    );

    if (!Array.isArray(checkouts)) return null;

    // Busca checkout que corresponde ao pedido
    for (const checkout of checkouts) {
      const orderId = checkout.order_id ? String(checkout.order_id) : null;
      if (orderId === nsOrderId) {
        return (checkout.recovery_url as string) || (checkout.checkout_url as string) || null;
      }
    }

    return null;
  } catch (err: unknown) {
    logger.warn("Falha ao buscar recovery_url da NuvemShop", {
      nsOrderId,
      error: err instanceof Error ? err.message : "Erro",
    });
    return null;
  }
}

// ── Construir recovery_url a partir do pedido NuvemShop ───────

async function buildRecoveryUrlFromOrder(nsOrderId: string): Promise<string | null> {
  try {
    const token = await getNuvemShopToken();
    if (!token) return null;

    const order = await nsRequest<Record<string, unknown>>("get", `orders/${nsOrderId}`, token);
    const orderToken = order.token as string;

    if (orderToken) {
      return `https://www.papelariabibelo.com.br/checkout/v3/proxy/${nsOrderId}/${orderToken}`;
    }
    return null;
  } catch (err: unknown) {
    logger.warn("Falha ao buscar token do pedido NuvemShop", {
      nsOrderId,
      error: err instanceof Error ? err.message : "Erro",
    });
    return null;
  }
}

// ── Registrar pedido pendente (chamado pelo webhook) ───────────

export async function registerPendingOrder(
  nsOrderId: string,
  customerId: string | null,
  email: string | null,
  valor: number,
  itens: unknown,
  recoveryUrl?: string | null
): Promise<void> {
  const delayHoras = 2; // 2 horas para considerar abandono
  const expiraEm = new Date(Date.now() + delayHoras * 3600 * 1000);

  await query(
    `INSERT INTO marketing.pedidos_pendentes (ns_order_id, customer_id, email, valor, itens, expira_em, recovery_url)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (ns_order_id) DO UPDATE SET
       customer_id = COALESCE($2, marketing.pedidos_pendentes.customer_id),
       email = COALESCE($3, marketing.pedidos_pendentes.email),
       valor = $4, itens = $5, recovery_url = COALESCE($7, marketing.pedidos_pendentes.recovery_url)`,
    [nsOrderId, customerId, email, valor, JSON.stringify(itens), expiraEm, recoveryUrl || null]
  );
}

// ── Marcar pedido como convertido (chamado quando order/paid) ──

export async function markOrderConverted(nsOrderId: string): Promise<void> {
  await query(
    "UPDATE marketing.pedidos_pendentes SET convertido = true WHERE ns_order_id = $1",
    [nsOrderId]
  );
}

// ── Detectar lead quente que não comprou (add_to_cart sem purchase) ──

export async function checkLeadCartAbandoned(): Promise<number> {
  // Busca leads que fizeram add_to_cart nas últimas 24h mas não compraram
  // e não foram notificados por este fluxo nas últimas 48h
  const hotLeads = await query<{
    customer_id: string;
    resource_nome: string;
    resource_preco: number;
    resource_imagem: string;
    resource_id: string;
    pagina: string;
    cupom: string;
  }>(
    `SELECT DISTINCT ON (t.customer_id)
       t.customer_id,
       t.resource_nome,
       t.resource_preco,
       t.resource_imagem,
       t.resource_id,
       t.pagina,
       COALESCE(l.cupom, 'CLUBEBIBELO') AS cupom
     FROM crm.tracking_events t
     JOIN marketing.leads l ON l.customer_id = t.customer_id
     WHERE t.evento = 'add_to_cart'
       AND t.customer_id IS NOT NULL
       AND t.criado_em > NOW() - INTERVAL '24 hours'
       AND t.criado_em < NOW() - INTERVAL '3 hours'
       -- Não comprou (sem pedido NuvemShop recente)
       AND NOT EXISTS (
         SELECT 1 FROM sync.nuvemshop_orders o
         WHERE o.customer_id = t.customer_id
           AND o.webhook_em > NOW() - INTERVAL '24 hours'
       )
       -- Não disparamos este fluxo recentemente
       AND NOT EXISTS (
         SELECT 1 FROM marketing.flow_executions fe
         JOIN marketing.flows f ON f.id = fe.flow_id
         WHERE f.gatilho = 'lead.cart_abandoned'
           AND fe.customer_id = t.customer_id
           AND fe.iniciado_em > NOW() - INTERVAL '48 hours'
       )
     ORDER BY t.customer_id, t.criado_em DESC
     LIMIT 20`
  );

  let triggered = 0;

  for (const lead of hotLeads) {
    const productUrl = lead.pagina || "https://www.papelariabibelo.com.br";

    const executionIds = await triggerFlow("lead.cart_abandoned", lead.customer_id, {
      resource_nome: lead.resource_nome,
      resource_preco: lead.resource_preco,
      resource_imagem: lead.resource_imagem,
      resource_id: lead.resource_id,
      cupom: lead.cupom,
      recovery_url: productUrl,
      itens: [{
        name: lead.resource_nome,
        price: lead.resource_preco,
        image_url: lead.resource_imagem,
        quantity: 1,
      }],
    });

    if (executionIds.length > 0) triggered++;
  }

  if (triggered > 0) {
    logger.info("Leads quentes sem compra detectados", { total: hotLeads.length, triggered });
  }
  return triggered;
}

// ── Detectar "visitou mas não comprou" ────────────────────────

export async function checkProductInterest(): Promise<number> {
  // Busca clientes identificados que viram o mesmo produto 2+ vezes nas últimas 24h
  // mas não compraram esse produto
  const interested = await query<{
    customer_id: string;
    resource_id: string;
    resource_nome: string;
    resource_preco: number;
    resource_imagem: string;
    views: string;
    pagina: string;
  }>(
    `SELECT
       t.customer_id,
       t.resource_id,
       t.resource_nome,
       t.resource_preco,
       t.resource_imagem,
       COUNT(*)::text AS views,
       MAX(t.pagina) AS pagina
     FROM crm.tracking_events t
     WHERE t.evento = 'product_view'
       AND t.customer_id IS NOT NULL
       AND t.resource_id IS NOT NULL
       AND t.criado_em > NOW() - INTERVAL '24 hours'
       -- Não comprou esse produto (não tem pedido NuvemShop nas últimas 24h)
       AND NOT EXISTS (
         SELECT 1 FROM sync.nuvemshop_orders o
         WHERE o.customer_id = t.customer_id
           AND o.webhook_em > NOW() - INTERVAL '24 hours'
       )
       -- Não disparamos fluxo product.interested para esse cliente nas últimas 48h
       AND NOT EXISTS (
         SELECT 1 FROM marketing.flow_executions fe
         JOIN marketing.flows f ON f.id = fe.flow_id
         WHERE f.gatilho = 'product.interested'
           AND fe.customer_id = t.customer_id
           AND fe.iniciado_em > NOW() - INTERVAL '48 hours'
       )
     GROUP BY t.customer_id, t.resource_id, t.resource_nome, t.resource_preco, t.resource_imagem
     HAVING COUNT(*) >= 2
     ORDER BY COUNT(*) DESC
     LIMIT 20`
  );

  let triggered = 0;

  for (const item of interested) {
    const productUrl = item.pagina || `https://www.papelariabibelo.com.br`;

    const executionIds = await triggerFlow("product.interested", item.customer_id, {
      resource_id: item.resource_id,
      resource_nome: item.resource_nome,
      resource_preco: item.resource_preco,
      resource_imagem: item.resource_imagem,
      recovery_url: productUrl,
      views: parseInt(item.views, 10),
      itens: [{
        name: item.resource_nome,
        price: item.resource_preco,
        image_url: item.resource_imagem,
        quantity: 1,
      }],
    });

    if (executionIds.length > 0) triggered++;
  }

  if (triggered > 0) {
    logger.info("Produtos interessados detectados", { total: interested.length, triggered });
  }
  return triggered;
}
