import { query, queryOne } from "../db";
import { logger } from "../utils/logger";
import { sendEmail } from "../integrations/resend/email";
import { getNuvemShopToken, nsRequest } from "../integrations/nuvemshop/auth";
import { gerarLinkDescadastro, proxyImageUrl, warmProxyImage } from "../routes/email";

import crypto from "crypto";
import { escHtml } from "../utils/sanitize";
import { type Regiao, detectarRegiao, bannerFretep, textoFreteInline, itemFreteHtml } from "../utils/regiao";
import { verificarEPersistirVip, getGrupoVipTotal } from "../integrations/whatsapp/waha";
import { createNotificacaoOperador } from "./notificacoes-operador.service";
import { validateEmailContext } from "./email-validation.service";
export { checkHighIntentClients, checkVipInactivos, sendOperatorDailySummary } from "./notificacoes-operador.service";

const GRUPO_VIP_URL = "https://chat.whatsapp.com/DzOJHBZ2vECF1taXiRRv6g";

// ── Gerar cupom único por lead via NuvemShop API ────────────────

async function gerarCupomUnico(
  nome: string,
  tipo: "percentage" | "absolute",
  valor: number,
  validadeDias: number,
  primeiraCompra = true,  // false para clientes que já compraram
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
      first_consumer_purchase: primeiraCompra,
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
  condicao?: "email_aberto" | "email_clicado" | "comprou" | "visitou_site" | "viu_produto" | "abandonou_cart" | "score_minimo" | "membro_grupo_vip"
           | "dias_sem_compra" | "total_pedidos_minimo" | "engajamento_email_zero" | "valor_carrinho_minimo" | "nao";
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

  // Rate limit: max 1 email por 12h por cliente — exceto gatilhos transacionais
  // Transacionais (pós-compra, carrinho, boas-vindas, grupo VIP) são urgentes e não devem ser bloqueados
  const gatilhosTransacionais = ["order.paid", "order.first", "order.abandoned", "order.delivered", "vip.joined"];
  if (!gatilhosTransacionais.includes(gatilho)) {
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
  }

  const executionIds: string[] = [];

  for (const flow of flows) {
    // Leads VIP (form) já recebem boas-vindas inline — pular fluxo lead.captured de boas-vindas
    // NÃO pular fluxos vip.joined (entrada real no grupo WA) mesmo com fonte="grupo_vip"
    if (metadata.fonte === "grupo_vip" && flow.gatilho === "lead.captured" && flow.nome.toLowerCase().includes("boas-vindas")) {
      logger.info("triggerFlow: pular boas-vindas lead.captured para lead VIP (já recebeu inline)", { flowId: flow.id, customerId });
      continue;
    }

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

    case "membro_grupo_vip": {
      // Verifica se o customer está no grupo VIP do WhatsApp via WAHA (read-only)
      // Cache: Redis 30min (lista) + banco 24h (por customer)
      const cust = await queryOne<{ telefone: string | null }>(
        "SELECT telefone FROM crm.customers WHERE id = $1",
        [customerId],
      );
      if (!cust?.telefone) return false;
      const resultado = await verificarEPersistirVip(customerId, cust.telefone);
      // null = indeterminado (WAHA não configurado ou timeout) → assume não membro
      return resultado === true;
    }

    // ── Novas condições (migration 054/055) ──────────────────────

    case "dias_sem_compra": {
      // true quando MAX(criado_em) de order_items é NULL (nunca comprou) ou > N dias atrás
      const dias = (parametros?.dias as number) || 30;
      const row = await queryOne<{ ultima: string | null }>(
        "SELECT MAX(criado_em)::text AS ultima FROM crm.order_items WHERE customer_id = $1",
        [customerId],
      );
      if (!row?.ultima) return true; // nunca comprou
      const diffDias = (Date.now() - new Date(row.ultima).getTime()) / 86_400_000;
      return diffDias > dias;
    }

    case "total_pedidos_minimo": {
      // true quando o cliente tem >= N pedidos distintos em order_items
      const minimo = (parametros?.minimo as number) ?? 1;
      const row = await queryOne<{ total: string }>(
        "SELECT COUNT(DISTINCT order_id)::text AS total FROM crm.order_items WHERE customer_id = $1",
        [customerId],
      );
      return parseInt(row?.total || "0", 10) >= minimo;
    }

    case "engajamento_email_zero": {
      // true quando o cliente não abriu nenhum email nos últimos 30 dias.
      // NOTA: quando true, o executeStep persiste _skip_emails: true no metadata da execução.
      // Isso faz com que TODOS os steps de email subsequentes nesta execução sejam pulados
      // como camada de segurança adicional ao branching do fluxo.
      // ATENÇÃO: nao(engajamento_email_zero) avalia corretamente o inverso,
      // mas NÃO ativa o flag _skip_emails — a proteção só existe na forma positiva.
      const row = await queryOne<{ total: string }>(
        `SELECT COUNT(*)::text AS total FROM marketing.email_events
         WHERE customer_id = $1 AND tipo = 'opened' AND criado_em >= NOW() - INTERVAL '30 days'`,
        [customerId],
      );
      return parseInt(row?.total || "0", 10) === 0;
    }

    case "valor_carrinho_minimo": {
      // true quando o carrinho pendente mais recente tem valor < N (ou não existe carrinho)
      const minimo = (parametros?.minimo as number) ?? 0;
      const row = await queryOne<{ valor: string | null }>(
        `SELECT valor::text FROM marketing.pedidos_pendentes
         WHERE customer_id = $1 AND convertido = false
         ORDER BY criado_em DESC LIMIT 1`,
        [customerId],
      );
      if (!row?.valor) return true; // sem carrinho = abaixo do mínimo
      return parseFloat(row.valor) < minimo;
    }

    case "nao": {
      // Negação de qualquer outra condição. Exemplo: nao(comprou), nao(membro_grupo_vip).
      // Parâmetros são passados inalterados para a condição interna.
      // NOTA: nao(engajamento_email_zero) inverte corretamente, mas NÃO propaga _skip_emails.
      const inner = (parametros?.condicao as string) || "";
      if (!inner) {
        logger.warn("evaluateCondition nao(): parâmetro 'condicao' ausente", { executionId });
        return false;
      }
      const innerResult = await evaluateCondition(inner, executionId, customerId, refStep, parametros);
      return !innerResult;
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
     FROM marketing.flow_executions fe WHERE fe.id = $1 AND fe.status IN ('ativo', 'executando')`,
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
  const customer = await queryOne<{ id: string; nome: string; email: string | null; telefone: string | null; email_optout: boolean; estado: string | null }>(
    "SELECT id, nome, email, telefone, email_optout, estado FROM crm.customers WHERE id = $1",
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

  // Dedup: pula step se cliente já recebeu este template nas últimas 72h (fluxo ou campanha)
  if (currentStep.tipo === "email" && currentStep.template) {
    const recentSameTemplate = await queryOne<{ id: string }>(
      `SELECT id FROM crm.interactions
       WHERE customer_id = $1
         AND tipo = 'email_enviado'
         AND (
           metadata->>'template' = $2
           OR metadata->>'template_nome' = $2
         )
         AND criado_em > NOW() - INTERVAL '72 hours'
       LIMIT 1`,
      [execution.customer_id, currentStep.template]
    );
    if (recentSameTemplate) {
      logger.info("Step de email ignorado: mesmo template enviado nas últimas 72h", {
        executionId,
        template: currentStep.template,
        customerId: execution.customer_id,
      });
      await query(
        `UPDATE marketing.flow_step_executions SET status = 'ignorado', resultado = $1::jsonb
         WHERE execution_id = $2 AND step_index = $3`,
        [JSON.stringify({ motivo: "template_recente", template: currentStep.template }), executionId, execution.step_atual]
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

    // Detecta região do cliente para personalização de e-mails (frete grátis Sul/SE)
    const regiaoCliente = detectarRegiao({ estado: customer.estado, telefone: customer.telefone });

    switch (currentStep.tipo) {
      case "email":
        resultado = await executeEmailStep(customer, currentStep, execution.metadata, regiaoCliente);
        break;

      case "whatsapp":
        resultado = await executeWhatsAppStep(customer, currentStep, {
          ...execution.metadata,
          _flow_gatilho: flow.gatilho,
          _flow_nome: flow.nome,
        });
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

        // Proteção adicional para engajamento_email_zero: persiste flag no metadata
        // para que executeEmailStep pule emails mesmo que o designer esqueça de rotear o branch
        if (currentStep.condicao === "engajamento_email_zero" && passed) {
          const updatedMeta = { ...execution.metadata, _skip_emails: true };
          await query(
            "UPDATE marketing.flow_executions SET metadata = $2 WHERE id = $1",
            [executionId, JSON.stringify(updatedMeta)],
          );
        }

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

  // Atualiza execução — volta para 'ativo' para o worker processar o próximo step
  await query(
    `UPDATE marketing.flow_executions SET step_atual = $2, proximo_step_em = $3, status = 'ativo'
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
  metadata: Record<string, unknown>,
  regiao: Regiao = null
): Promise<Record<string, unknown>> {
  if (!customer.email) {
    return { skipped: true, reason: "Cliente sem email" };
  }

  // Proteção extra: se engajamento_email_zero foi true nesta execução, pula todos os emails.
  // Garante que nenhum email saia mesmo que o fluxo não rotear o branch corretamente.
  if (metadata._skip_emails === true) {
    return { skipped: true, reason: "engajamento_email_zero" };
  }

  // Garantir que customer_id esteja no metadata (necessário para cross-sell/recompra)
  if (!metadata.customer_id) metadata.customer_id = customer.id;

  // Busca template pelo nome
  const template = await queryOne<{ id: string; assunto: string; html: string; texto: string }>(
    "SELECT id, assunto, html, texto FROM marketing.templates WHERE nome ILIKE $1 AND ativo = true LIMIT 1",
    [`%${step.template || ""}%`]
  );

  // ── Enriquecer metadata com status VIP real do banco ──────────
  // vip_confirmado: lido diretamente de crm.customers.vip_grupo_wp
  // Substitui a dependência de metadata.fonte === "grupo_vip" nos templates
  if (metadata.vip_confirmado === undefined) {
    const vipRow = await queryOne<{ vip_grupo_wp: boolean | null }>(
      "SELECT vip_grupo_wp FROM crm.customers WHERE id = $1",
      [customer.id],
    );
    metadata.vip_confirmado = vipRow?.vip_grupo_wp === true;
  }

  // Se o cliente já é VIP e o step é o email FOMO/grupo VIP, pular inteiramente.
  // Ela já está no grupo — não faz sentido enviar nenhuma versão do email.
  // O fluxo avança normalmente para o próximo step via proximo/+1.
  const tplNome = (step.template || "").toLowerCase();
  if (metadata.vip_confirmado === true && (tplNome.includes("fomo") || tplNome.includes("convite vip") || tplNome.includes("lead convite"))) {
    logger.info("Skip email grupo VIP: cliente já é membro", { customerId: customer.id, template: step.template });
    return { skipped: true, reason: "ja_membro_vip" };
  }

  // ── Verificar histórico de compras do cliente ─────────────────
  // ja_comprou: usado pelos templates para adaptar mensagens de "primeira compra"
  if (metadata.ja_comprou === undefined) {
    const scoreData = await queryOne<{ total_pedidos: string }>(
      "SELECT total_pedidos::text FROM crm.customer_scores WHERE customer_id = $1",
      [customer.id]
    );
    const totalPedidos = parseInt(scoreData?.total_pedidos || "0", 10);
    metadata.ja_comprou = totalPedidos >= 1;

    // Para templates de agradecimento/pós-compra de 1ª compra: gerar cupom de próxima compra
    const tplLowerPre = (step.template || "").toLowerCase();
    const isAgradecimentoPre = tplLowerPre.includes("agradecimento") || tplLowerPre.includes("obrigad") || (tplLowerPre.includes("pós-compra") && !tplLowerPre.includes("cross"));
    if (isAgradecimentoPre && !metadata.cupom && totalPedidos <= 1) {
      metadata.primeira_compra = true;
      const cupom = await gerarCupomUnico(customer.nome, "percentage", 10, 30, false);
      if (cupom) {
        metadata.cupom = cupom;
        logger.info("Cupom 10% OFF próxima compra gerado", { cupom, customerId: customer.id });
      }
    }
  }

  // Valida contexto antes de construir e enviar — bloqueia envios sem dados mínimos
  const validation = await validateEmailContext(step.template || "", customer.id, metadata);
  if (!validation.ok) {
    return { skipped: true, reason: validation.motivo || "contexto_invalido" };
  }

  if (!template) {
    // Usa templates built-in ricos (com fotos, recovery_url, etc.)
    _currentRecipientEmail = customer.email || "";
    const html = await buildFlowEmail(customer.nome, step.template || "", metadata, regiao);
    const subject = getFlowSubject(step.template || "", customer.nome, metadata);

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

    // Se cliente já comprou, gerar cupom sem restrição de primeira compra
    const cupomUnico = await gerarCupomUnico(customer.nome, cupomTipo, cupomValor, cupomDias, !metadata.ja_comprou);
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
    unsub_link: gerarLinkDescadastro(customer.email),
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
    [customer.id, `Email automático: ${step.template || "genérico"}`, JSON.stringify({ messageId: result.id, templateId: template.id, assunto: subject, template: step.template })]
  );

  return { sent: true, messageId: result.id, templateId: template.id, ...(isCupomDesconto && cupomFinal ? { cupomGerado: cupomFinal } : {}) };
}

// ── Executar step de WhatsApp ──────────────────────────────────

async function executeWhatsAppStep(
  customer: { id: string; nome: string; telefone: string | null },
  step: FlowStep,
  metadata: Record<string, unknown>
): Promise<Record<string, unknown>> {
  if (!customer.telefone) {
    return { skipped: true, reason: "Cliente sem telefone" };
  }

  const gatilho = metadata._flow_gatilho as string | undefined;
  const flowNome = metadata._flow_nome as string | undefined;
  const template = step.template || "";

  // Cria notificação para o operador enviar manualmente via wa.me
  const notifId = await createNotificacaoOperador({
    tipo: "whatsapp_step",
    customerId: customer.id,
    nomeCliente: customer.nome,
    telefone: customer.telefone,
    titulo: `💬 WhatsApp pendente — ${customer.nome}${template ? ` (${template})` : ""}`,
    descricao: flowNome ? `Fluxo: ${flowNome}` : undefined,
    dados: {
      template,
      gatilho: gatilho || null,
      flow_nome: flowNome || null,
      metadata_resumo: Object.fromEntries(
        Object.entries(metadata)
          .filter(([k]) => !k.startsWith("_"))
          .slice(0, 6)
      ),
    },
  });

  logger.info("WhatsApp step → notificação operador criada", {
    customerId: customer.id,
    template,
    notifId,
  });

  return { notificacao_criada: true, notif_id: notifId };
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
  // Passa pelo proxy do nosso domínio (evita bloqueio de imagens de CDN externo + converte webp→jpg)
  return proxyImageUrl(safe);
}

// ── Limpar URL de produto (remove fbclid, UTMs de ads, params redundantes) ──

function cleanProductUrl(url: string | undefined | null): string {
  if (!url) return "https://www.papelariabibelo.com.br";
  try {
    const parsed = new URL(url.trim());
    // Remove params de tracking de ads/meta que poluem a URL
    const removeParams = ["fbclid", "media_type", "utm_source", "utm_campaign", "utm_medium", "utm_content", "utm_term", "utm_id", "variant"];
    removeParams.forEach(p => parsed.searchParams.delete(p));
    // Adiciona nossos UTMs de email
    parsed.searchParams.set("utm_source", "email");
    parsed.searchParams.set("utm_medium", "flow");
    return parsed.toString();
  } catch {
    return url.trim();
  }
}

// ── Email context: email do destinatário para link de descadastro ──
let _currentRecipientEmail = "";

// ── Title Case para nomes vindos do Bling (geralmente ALL CAPS) ──

function toTitleCase(text: string): string {
  if (!text) return text;
  // Só converte se a string tiver 3+ chars maiúsculos seguidos (heurística de ALL CAPS)
  if (!/[A-ZÁÉÍÓÚÂÊÔÃÕ]{3}/.test(text)) return text;
  return text
    .toLowerCase()
    .replace(/(?:^|\s|[-/])([a-záéíóúâêôãõ])/g, (_, c) => _.replace(c, c.toUpperCase()));
}

// ── SVG placeholder para produtos sem imagem ──────────────────────

function imgPlaceholder(width = 280, height = 280): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect width="${width}" height="${height}" rx="12" fill="#ffe5ec"/>
    <text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" font-size="48" font-family="serif">🎀</text>
  </svg>`;
}

function imgPlaceholderDataUrl(width = 280, height = 280): string {
  const svg = imgPlaceholder(width, height);
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

// ── Email base wrapper ─────────────────────────────────────────

function emailWrapper(content: string, email?: string, preheader?: string): string {
  const recipientEmail = email || _currentRecipientEmail;
  const unsubLink = recipientEmail ? gerarLinkDescadastro(recipientEmail) : "#";
  // Preheader: texto oculto que aparece como preview no cliente de email
  const preheaderHtml = preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;color:#ffffff;line-height:1px;">${escHtml(preheader.slice(0, 150))}&nbsp;‌​‌​‌​‌​‌​‌​‌​‌​‌​‌​‌​</div>`
    : "";
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>*{font-family:Jost,'Segoe UI',Arial,sans-serif;}</style>
</head>
<body style="margin:0;padding:0;background:#ffe5ec;">
${preheaderHtml}
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
      <p style="margin:8px 0 0;"><a href="https://www.papelariabibelo.com.br/privacidade/" style="color:#ccc;text-decoration:none;font-size:10px;">Política de Privacidade</a> · <a href="https://www.papelariabibelo.com.br/termos-de-uso/" style="color:#ccc;text-decoration:none;font-size:10px;">Termos de Uso</a></p>
      <p style="margin:6px 0 0;"><a href="${unsubLink}" style="color:#ccc;text-decoration:underline;font-size:10px;">Não quero mais receber emails</a></p>
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

function buildCartProductsTable(itens: Array<Record<string, unknown>>, valor?: string): string {
  if (itens.length === 0) return "";
  const rows = itens.map((item: Record<string, unknown>) => {
    const itemName = escHtml(String(item.name || "Produto"));
    const imgUrl = safeImageUrl(item.image_url as string);
    const imgTag = imgUrl
      ? `<img src="${imgUrl}" alt="${itemName}" style="width:70px;height:70px;object-fit:cover;border-radius:8px;border:1px solid #eee;" />`
      : `<div style="width:70px;height:70px;background:#ffe5ec;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:24px;">🎀</div>`;
    const price = item.price ? formatBRL(item.price) : "";
    const qty = item.quantity || item.qtd || 1;
    return `<tr>
      <td style="padding:10px 0;border-bottom:1px solid #f0f0f0;vertical-align:top;width:80px;">${imgTag}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;vertical-align:top;">
        <p style="margin:0 0 4px;font-weight:600;color:#333;">${itemName}</p>
        <p style="margin:0;color:#888;font-size:13px;">Qtd: ${qty}${price ? ` · ${price}` : ""}</p>
      </td>
    </tr>`;
  }).join("");

  return `
  <table style="width:100%;border-collapse:collapse;margin:20px 0;">
    ${rows}
  </table>
  ${valor ? `<p style="text-align:right;font-size:18px;font-weight:700;color:#fe68c4;margin:10px 0;">Total: ${valor}</p>` : ""}`;
}

function buildAbandonedCartEmail(nome: string, metadata: Record<string, unknown>, regiao: Regiao = null): string {
  const valor = formatBRL(metadata.valor);
  const recoveryUrl = (metadata.recovery_url as string) || "https://www.papelariabibelo.com.br";
  const itens = Array.isArray(metadata.itens) ? metadata.itens : [];

  return emailWrapper(`
    <p style="font-size:16px;color:#333;">Oi, <strong>${escHtml(nome || "Cliente")}</strong>! 👋</p>
    <p style="font-size:15px;color:#555;line-height:1.6;">
      Seus itens estão reservados no carrinho, mas não vão ficar lá para sempre!
      Finalize antes que alguém leve.
    </p>
    ${buildCartProductsTable(itens, valor)}
    <div style="background:#fff7c1;border-radius:10px;padding:14px;text-align:center;margin:20px 0;">
      ${bannerFretep(regiao)}
    </div>
    ${ctaButton("Finalizar minha compra", recoveryUrl)}
    <p style="font-size:13px;color:#999;text-align:center;">
      O link acima leva direto para o seu carrinho com todos os itens.
    </p>
  `, undefined, "Seus itens ainda estão reservados — finalize antes que esgotem!");
}

// ── Template: Última Chance ────────────────────────────────────

function buildLastChanceEmail(nome: string, metadata: Record<string, unknown>, regiao: Regiao = null): string {
  const valor = formatBRL(metadata.valor);
  const recoveryUrl = (metadata.recovery_url as string) || "https://www.papelariabibelo.com.br";
  const itens = Array.isArray(metadata.itens) ? metadata.itens : [];

  return emailWrapper(`
    <p style="font-size:16px;color:#333;">Oi, <strong>${escHtml(nome || "Cliente")}</strong>!</p>
    <div style="background:#FFF3E0;border-left:4px solid #FF9800;padding:16px 20px;border-radius:8px;margin:20px 0;">
      <p style="margin:0;color:#E65100;font-weight:700;font-size:16px;">⏰ Última chance — estoque quase esgotado!</p>
      <p style="margin:6px 0 0;color:#E65100;font-size:13px;">Outros clientes estão visualizando os mesmos produtos agora.</p>
    </div>
    ${buildCartProductsTable(itens, valor)}
    <div style="background:#fff7c1;border-radius:10px;padding:14px;text-align:center;margin:20px 0;">
      ${bannerFretep(regiao)}
    </div>
    ${ctaButton("Garantir meus produtos agora", recoveryUrl)}
    <p style="font-size:13px;color:#999;text-align:center;">
      Seu carrinho será liberado em breve. Não perca!
    </p>
  `, undefined, "⏰ Última chance — estoque quase esgotando!");
}

// ── Template: Carrinho Reenvio (abordagem social proof) ───────

function buildCartReminderEmail(nome: string, metadata: Record<string, unknown>, regiao: Regiao = null): string {
  const valor = formatBRL(metadata.valor);
  const recoveryUrl = (metadata.recovery_url as string) || "https://www.papelariabibelo.com.br";
  const itens = Array.isArray(metadata.itens) ? metadata.itens : [];

  return emailWrapper(`
    <p style="font-size:16px;color:#333;">Oi, <strong>${escHtml(nome || "Cliente")}</strong>! 💕</p>
    <p style="font-size:15px;color:#555;line-height:1.6;">
      Separamos seus itens com carinho, mas eles não vão ficar reservados para sempre.
    </p>
    ${buildCartProductsTable(itens, valor)}
    <div style="background:#E8F5E9;border-radius:10px;padding:16px;margin:20px 0;">
      <p style="font-size:14px;color:#2E7D32;margin:0;text-align:center;font-weight:600;">⭐ 4.9 no Google · +500 clientes satisfeitas</p>
      <p style="font-size:12px;color:#4CAF50;margin:6px 0 0;text-align:center;font-style:italic;">"Produtos lindos, entrega rápida e embalagem impecável!"</p>
    </div>
    <div style="background:#fff7c1;border-radius:10px;padding:14px;text-align:center;margin:16px 0;">
      ${bannerFretep(regiao)}
    </div>
    ${ctaButton("Voltar ao meu carrinho", recoveryUrl)}
  `, undefined, "+500 clientes aprovam — seus itens ainda estão esperando!");
}

// ── Template: Cupom Recuperação Carrinho (5% OFF) ─────────────

function buildCartCouponEmail(nome: string, metadata: Record<string, unknown>): string {
  const valor = formatBRL(metadata.valor);
  const recoveryUrl = (metadata.recovery_url as string) || "https://www.papelariabibelo.com.br";
  const itens = Array.isArray(metadata.itens) ? metadata.itens : [];
  const cupom = escHtml(String(metadata.cupom || ""));

  return emailWrapper(`
    <p style="font-size:16px;color:#333;">Oi, <strong>${escHtml(nome || "Cliente")}</strong>! 🎁</p>
    <p style="font-size:15px;color:#555;line-height:1.6;">
      Sabemos que às vezes precisamos de um empurrãozinho. Preparamos um
      <strong>desconto exclusivo</strong> para você finalizar sua compra:
    </p>
    <div style="background:linear-gradient(135deg,#ffe5ec,#fff7c1);border:2px dashed #fe68c4;border-radius:12px;padding:24px;text-align:center;margin:24px 0;">
      <p style="font-size:13px;color:#888;margin:0;text-transform:uppercase;letter-spacing:1px;">Seu cupom exclusivo</p>
      <p style="font-size:32px;font-weight:700;color:#fe68c4;margin:8px 0;letter-spacing:2px;">${cupom || "5% OFF"}</p>
      <p style="font-size:14px;color:#555;margin:0;">Válido por <strong>24 horas</strong> · Apenas para você</p>
    </div>
    ${buildCartProductsTable(itens, valor)}
    ${ctaButton("Usar cupom e finalizar compra", recoveryUrl)}
    <p style="font-size:12px;color:#999;text-align:center;">
      Aplique o código no checkout. Cupom válido para uma única compra.
    </p>
  `, undefined, `🎁 Desconto exclusivo ${cupom || "5% OFF"} — só para você, por 24h!`);
}

// ── Template: Pós-compra Agradecimento ────────────────────────

function buildThankYouEmail(nome: string, metadata: Record<string, unknown>): string {
  const cupom = metadata.cupom ? escHtml(String(metadata.cupom)) : "";
  const isPrimeiraCompra = metadata.primeira_compra === true;
  const isVip = metadata.vip_confirmado === true;

  const cupomBlock = cupom ? `
    <div style="background:linear-gradient(135deg,#ffe5ec,#fff7c1);border:2px dashed #fe68c4;border-radius:12px;padding:24px;text-align:center;margin:24px 0;">
      <p style="font-size:13px;color:#888;margin:0;text-transform:uppercase;letter-spacing:1px;">Presente especial pra você</p>
      <p style="font-size:28px;font-weight:700;color:#fe68c4;margin:8px 0;letter-spacing:2px;">${cupom}</p>
      <p style="font-size:15px;color:#555;margin:0;font-weight:600;">10% OFF na sua próxima compra</p>
      <p style="font-size:12px;color:#999;margin:6px 0 0;">Cupom de uso único · Válido por 30 dias</p>
    </div>` : "";

  const vipBlock = isVip ? `
    <div style="background:linear-gradient(135deg,#fef6fa,#ffe5ec);border-radius:12px;padding:18px;text-align:center;margin:20px 0;border:1px solid #fce4ec;">
      <p style="font-size:22px;margin:0;">👑💕</p>
      <p style="font-size:14px;font-weight:700;color:#fe68c4;margin:8px 0 4px;">Você é do Clube VIP Bibelô!</p>
      <p style="font-size:13px;color:#666;margin:0;line-height:1.5;">
        Seu pedido recebe um mimo surpresa especialmente para membros do clube.
        Fique de olho no grupo do WhatsApp para novidades exclusivas 🎀
      </p>
    </div>` : "";

  return emailWrapper(`
    <p style="font-size:16px;color:#333;">Oi, <strong>${escHtml(nome || "Cliente")}</strong>! 💕</p>
    <p style="font-size:15px;color:#555;line-height:1.6;">
      ${isPrimeiraCompra
        ? "Que alegria ter você como cliente! Sua primeira compra na Bibelô tem um significado especial pra gente."
        : "Obrigada por comprar na Bibelô de novo! Cada pedido nos mostra que estamos no caminho certo."}
    </p>
    <p style="font-size:15px;color:#555;line-height:1.6;">
      Seu pedido já está sendo preparado com todo carinho e atenção.
      A gente ama cuidar de cada detalhe — do produto à embalagem.
    </p>
    <div style="background:#fef6fa;border-radius:12px;padding:20px;text-align:center;margin:20px 0;">
      <p style="font-size:36px;margin:0;">🎀📦</p>
      <p style="color:#fe68c4;font-weight:700;font-size:16px;margin:10px 0 4px;">Pedido confirmado!</p>
      <p style="color:#888;font-size:13px;margin:0;">Já estamos separando tudo com carinho</p>
    </div>
    ${vipBlock}
    ${cupomBlock}
    <p style="font-size:15px;color:#555;line-height:1.6;">
      A Bibelô é feita de pessoas que amam papelaria tanto quanto você.
      Estamos sempre aqui — no WhatsApp, no Instagram ou por e-mail.
    </p>
    ${ctaButton("Conhecer mais produtos", "https://www.papelariabibelo.com.br/novidades")}
    <p style="font-size:13px;color:#999;text-align:center;margin-top:16px;">
      Obrigada pela confiança 💕
    </p>
  `, undefined, "Seu pedido está sendo preparado com todo carinho 🎀");
}

// ── Helper: grid de produtos reais do tracking ───────────────

export async function buildNfProductsGrid(limit = 4): Promise<string> {
  // 1. Busca candidatos de TODAS as NFs (mais recente primeiro), 3x o limite para ter margem
  const candidatos = await query<{
    ns_nome: string; ns_preco: string; ns_url: string | null; ns_id: string;
  }>(
    `SELECT DISTINCT ON (COALESCE(ns.dados_raw->>'canonical_url', ni.descricao))
       ns.nome as ns_nome,
       ns.preco::text as ns_preco,
       ns.dados_raw->>'canonical_url' as ns_url,
       ns.ns_id::text as ns_id
     FROM financeiro.notas_entrada_itens ni
     JOIN financeiro.notas_entrada ne ON ne.id = ni.nota_id AND ne.status != 'cancelada'
     LEFT JOIN LATERAL (
       SELECT p.sku
       FROM sync.bling_products p
       WHERE p.sku = ni.codigo_produto
         OR LOWER(p.nome) LIKE '%' || LOWER(SUBSTRING(ni.descricao FROM 1 FOR 20)) || '%'
       LIMIT 1
     ) bp ON true
     LEFT JOIN LATERAL (
       SELECT np.nome, np.preco, np.dados_raw, np.estoque, np.ns_id
       FROM sync.nuvemshop_products np
       WHERE np.sku = bp.sku
         OR LOWER(np.nome) LIKE '%' || LOWER(SUBSTRING(ni.descricao FROM 1 FOR 20)) || '%'
       ORDER BY similarity(LOWER(np.nome), LOWER(ni.descricao)) DESC
       LIMIT 1
     ) ns ON true
     WHERE ns.nome IS NOT NULL
       AND ns.preco > 0
       AND (ns.estoque IS NULL OR ns.estoque > 0)
     ORDER BY COALESCE(ns.dados_raw->>'canonical_url', ni.descricao),
       ne.data_emissao DESC NULLS LAST`,
    []
  );

  if (candidatos.length === 0) return "";

  // 2. Valida cada candidato na NuvemShop API: precisa ter imagem + link + preço
  //    Percorre até ter `limit` produtos validados, depois para
  interface ValidProduct { nome: string; preco: string; img: string; link: string }
  const valid: ValidProduct[] = [];
  const seenUrls = new Set<string>();

  let token: Awaited<ReturnType<typeof getNuvemShopToken>> = null;
  try { token = await getNuvemShopToken(); } catch { /* sem token */ }

  for (const c of candidatos) {
    if (valid.length >= limit) break;

    // Deduplica por URL
    const urlKey = c.ns_url || c.ns_nome;
    if (seenUrls.has(urlKey)) continue;

    // Precisa ter link no site
    if (!c.ns_url) continue;

    // Valida imagem fresca via NuvemShop API
    let imgSrc = "";
    if (token) {
      try {
        const term = encodeURIComponent(c.ns_nome.substring(0, 30));
        const res = await nsRequest<Array<{ id: number; images?: Array<{ src: string }>; canonical_url?: string }>>(
          "get", `/products?q=${term}&fields=id,images,canonical_url&per_page=1`, token
        );
        const p = res?.[0];
        if (p?.images?.[0]?.src) {
          imgSrc = p.images[0].src;
        }
      } catch { /* API falhou, pula este produto */ }
    }

    // Só inclui se tiver imagem confirmada
    if (!imgSrc) continue;

    // Aquece o cache antes de usar — garante que o arquivo existe quando o email for lido
    await warmProxyImage(imgSrc);

    seenUrls.add(urlKey);
    valid.push({
      nome: c.ns_nome,
      preco: `R$ ${Number(c.ns_preco).toFixed(2).replace(".", ",")}`,
      img: safeImageUrl(imgSrc),
      link: cleanProductUrl(c.ns_url),
    });
  }

  if (valid.length === 0) return "";

  return valid.map(p => `
      <a href="${p.link}" style="display:block;text-decoration:none;background:#fff;border:1px solid #f0e0f0;border-radius:12px;padding:14px;margin:10px 0;box-shadow:0 1px 4px rgba(0,0,0,0.04);">
        <table width="100%" cellpadding="0" cellspacing="0"><tr>
          <td width="90" style="vertical-align:top;">
            <img src="${p.img}" alt="${escHtml(toTitleCase(p.nome))}" width="80" height="80" style="width:80px;height:80px;object-fit:cover;border-radius:10px;display:block;" />
          </td>
          <td style="vertical-align:middle;padding-left:14px;">
            <p style="font-size:14px;color:#333;font-weight:600;margin:0 0 4px;line-height:1.3;">${escHtml(toTitleCase(p.nome))}</p>
            <p style="font-size:15px;color:#fe68c4;font-weight:700;margin:0 0 6px;">${p.preco}</p>
            <span style="font-size:12px;color:#fe68c4;font-weight:600;">Ver produto →</span>
          </td>
        </tr></table>
      </a>`).join("");
}

/** Retorna dados brutos dos produtos da última NF (para landing pages) */
export async function getNfProducts(limit = 8): Promise<Array<{ nome: string; preco: string; img: string; link: string }>> {
  const candidatos = await query<{
    ns_nome: string; ns_preco: string; ns_url: string | null; ns_id: string;
  }>(
    `SELECT DISTINCT ON (COALESCE(ns.dados_raw->>'canonical_url', ni.descricao))
       ns.nome as ns_nome,
       ns.preco::text as ns_preco,
       ns.dados_raw->>'canonical_url' as ns_url,
       ns.ns_id::text as ns_id
     FROM financeiro.notas_entrada_itens ni
     JOIN financeiro.notas_entrada ne ON ne.id = ni.nota_id AND ne.status != 'cancelada'
     LEFT JOIN LATERAL (
       SELECT p.sku
       FROM sync.bling_products p
       WHERE p.sku = ni.codigo_produto
         OR LOWER(p.nome) LIKE '%' || LOWER(SUBSTRING(ni.descricao FROM 1 FOR 20)) || '%'
       LIMIT 1
     ) bp ON true
     LEFT JOIN LATERAL (
       SELECT np.nome, np.preco, np.dados_raw, np.estoque, np.ns_id
       FROM sync.nuvemshop_products np
       WHERE np.sku = bp.sku
         OR LOWER(np.nome) LIKE '%' || LOWER(SUBSTRING(ni.descricao FROM 1 FOR 20)) || '%'
       ORDER BY similarity(LOWER(np.nome), LOWER(ni.descricao)) DESC
       LIMIT 1
     ) ns ON true
     WHERE ns.nome IS NOT NULL
       AND ns.preco > 0
       AND (ns.estoque IS NULL OR ns.estoque > 0)
     ORDER BY COALESCE(ns.dados_raw->>'canonical_url', ni.descricao),
       ne.data_emissao DESC NULLS LAST`,
    []
  );

  if (candidatos.length === 0) return [];

  const valid: Array<{ nome: string; preco: string; img: string; link: string }> = [];
  const seenUrls = new Set<string>();

  let token: Awaited<ReturnType<typeof getNuvemShopToken>> = null;
  try { token = await getNuvemShopToken(); } catch { /* sem token */ }

  for (const c of candidatos) {
    if (valid.length >= limit) break;
    const urlKey = c.ns_url || c.ns_nome;
    if (seenUrls.has(urlKey)) continue;
    if (!c.ns_url) continue;

    let imgSrc = "";
    if (token) {
      try {
        const term = encodeURIComponent(c.ns_nome.substring(0, 30));
        const res = await nsRequest<Array<{ id: number; images?: Array<{ src: string }> }>>(
          "get", `/products?q=${term}&fields=id,images&per_page=1`, token
        );
        if (res?.[0]?.images?.[0]?.src) imgSrc = res[0].images[0].src;
      } catch { /* API falhou */ }
    }

    if (!imgSrc) continue;
    seenUrls.add(urlKey);
    valid.push({
      nome: c.ns_nome,
      preco: `R$ ${Number(c.ns_preco).toFixed(2).replace(".", ",")}`,
      img: imgSrc.replace(/^http:\/\//i, "https://"),
      link: cleanProductUrl(c.ns_url),
    });
  }

  return valid;
}

// ── Template: Boas-vindas ──────────────────────────────────────

async function buildWelcomeEmail(nome: string, regiao: Regiao = null): Promise<string> {
  const productsGrid = await buildNfProductsGrid(3);

  return emailWrapper(`
    <p style="font-size:16px;color:#333;">Oi, <strong>${escHtml(nome || "Cliente")}</strong>! 🎀</p>
    <p style="font-size:15px;color:#555;line-height:1.6;">
      Seja muito bem-vinda à <strong>Papelaria Bibelô</strong>!
      Estamos felizes em ter você com a gente.
    </p>
    <p style="font-size:15px;color:#555;line-height:1.6;">
      Na nossa loja você encontra tudo em papelaria, organização e presentes
      que encantam. Olha o que está bombando:
    </p>
    ${productsGrid}
    <div style="background:#fff7c1;border-radius:10px;padding:14px;text-align:center;margin:20px 0;">
      ${bannerFretep(regiao)}
    </div>
    ${ctaButton("Conhecer a loja", "https://www.papelariabibelo.com.br")}
    <p style="font-size:13px;color:#999;text-align:center;">
      Nos siga no Instagram: <a href="https://instagram.com/papelariabibelo" style="color:#fe68c4;">@papelariabibelo</a>
    </p>
  `, undefined, "Veja o que está bombando na Papelaria Bibelô 🎀");
}

// ── Template: Reativação de Inativo ────────────────────────────

async function buildReactivationEmail(nome: string, regiao: Regiao = null, metadata: Record<string, unknown> = {}): Promise<string> {
  const productsGrid = await buildNfProductsGrid(4);
  const ultimoProduto = metadata.ultimo_produto ? escHtml(toTitleCase(String(metadata.ultimo_produto))) : null;
  const diasSemCompra = typeof metadata.dias_sem_compra === "number" ? metadata.dias_sem_compra : null;

  const saudadeTexto = ultimoProduto && diasSemCompra
    ? `Você comprou <strong>${ultimoProduto}</strong> há ${diasSemCompra} dias e sentimos sua falta!`
    : ultimoProduto
    ? `Da última vez você levou <strong>${ultimoProduto}</strong> — e você sumiu! 😢`
    : "Faz um tempinho que você não aparece por aqui e sentimos sua falta!";

  return emailWrapper(`
    <p style="font-size:16px;color:#333;">Oi, <strong>${escHtml(nome || "Cliente")}</strong>! 👋</p>
    <p style="font-size:15px;color:#555;line-height:1.6;">${saudadeTexto}</p>
    <div style="background:#FCE4EC;border-radius:8px;padding:20px;text-align:center;margin:20px 0;">
      <p style="font-size:40px;margin:0;">💌</p>
      <p style="color:#C2185B;font-weight:600;margin:10px 0 0;">Temos novidades esperando por você!</p>
    </div>
    ${productsGrid}
    <div style="background:#fff7c1;border-radius:10px;padding:14px;text-align:center;margin:20px 0;">
      ${bannerFretep(regiao)}
    </div>
    ${ctaButton("Ver novidades", "https://www.papelariabibelo.com.br")}
  `, undefined, "Sentimos sua falta! Novidades esperando por você 💌");
}

// ── Template: Lead Quente (add_to_cart sem compra) ────────────

function buildLeadCartEmail(nome: string, metadata: Record<string, unknown>): string {
  const cupom = (metadata.cupom as string) || "BIBELO10";
  const jaComprou = metadata.ja_comprou === true;
  const productName = (metadata.resource_nome as string) || "";
  const productImg = safeImageUrl(metadata.resource_imagem as string);
  const productUrl = cleanProductUrl(metadata.recovery_url as string);

  const productBlock = productName ? `
    <div style="background:#fef6fa;border-radius:12px;padding:20px;text-align:center;margin:20px 0;">
      ${productImg ? `<a href="${productUrl}" style="text-decoration:none;"><img src="${productImg}" alt="${productName}" style="max-width:250px;width:100%;height:auto;border-radius:12px;margin-bottom:12px;" /></a>` : ""}
      <p style="font-size:16px;font-weight:600;color:#333;margin:0;">${productName}</p>
    </div>` : "";

  return emailWrapper(`
    <p style="font-size:16px;color:#333;">Oi, <strong>${escHtml(nome || "Cliente")}</strong>! 👋</p>
    <p style="font-size:15px;color:#555;line-height:1.6;">
      Vimos que você se interessou por algo na nossa loja${productName ? ` — <strong>${productName}</strong>` : ""}!
    </p>
    ${productBlock}
    <p style="font-size:15px;color:#555;line-height:1.6;">
      ${jaComprou
        ? "Separamos um desconto exclusivo pra você finalizar:"
        : "Lembra do seu cupom de boas-vindas? Ele ainda está ativo:"}
    </p>
    <div style="background:#fff3e0;border:2px dashed #fe68c4;border-radius:10px;padding:18px;text-align:center;margin:20px 0;">
      <p style="font-size:14px;color:#888;margin:0 0 6px;">Use o cupom:</p>
      <p style="font-size:26px;font-weight:800;color:#fe68c4;margin:0;letter-spacing:2px;">${cupom}</p>
      <p style="font-size:14px;color:#888;margin:6px 0 0;">
        ${jaComprou ? "10% de desconto exclusivo!" : "10% de desconto na primeira compra!"}
      </p>
    </div>
    ${ctaButton("Aproveitar agora", productUrl)}
    <p style="font-size:13px;color:#999;text-align:center;">
      Frete calculado no carrinho.${jaComprou ? "" : " Cupom válido para primeira compra."}
    </p>
  `, undefined, "Seu cupom exclusivo ainda está ativo — use antes que expire! ⏰");
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
      const img = safeImageUrl(p.resource_imagem);
      const link = cleanProductUrl(p.pagina);
      const preco = p.resource_preco ? `R$ ${Number(p.resource_preco).toFixed(2).replace(".", ",")}` : "";
      return `
        <a href="${link}" style="display:block;text-decoration:none;background:#fff;border:1px solid #f0e0f0;border-radius:10px;padding:12px;margin:8px 0;">
          <table width="100%" cellpadding="0" cellspacing="0"><tr>
            <td width="70" style="vertical-align:top;">
              <img src="${img}" alt="" width="60" height="60" style="width:60px;height:60px;object-fit:cover;border-radius:8px;" />
            </td>
            <td style="vertical-align:middle;padding-left:12px;">
              <p style="font-size:14px;color:#333;font-weight:600;margin:0 0 4px;">${escHtml(p.resource_nome)}</p>
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
    <p style="font-size:16px;color:#333;">Oi, <strong>${escHtml(nome || "Cliente")}</strong>! ✨</p>
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
  const cupom = (metadata.cupom as string) || "BIBELO10";

  return emailWrapper(`
    <p style="font-size:16px;color:#333;">Oi, <strong>${escHtml(nome || "Cliente")}</strong>! ⏰</p>
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
    <p style="font-size:16px;color:#333;">Oi, <strong>${escHtml(nome || "Cliente")}</strong>! ⭐</p>
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

// ── Template: Novidades da Semana ─────────────────────────────

async function buildNewsEmail(nome: string, regiao: Regiao = null): Promise<string> {
  const productsHtml = await buildNfProductsGrid(4);

  const fallback = !productsHtml ? `
      <div style="background:#fef6fa;border-radius:12px;padding:20px;margin:10px 0;">
        <p style="font-size:15px;color:#555;margin:0 0 10px;">🎀 Agendas e planners decorados</p>
        <p style="font-size:15px;color:#555;margin:0 0 10px;">✏️ Canetas e marcadores fofos</p>
        <p style="font-size:15px;color:#555;margin:0 0 10px;">📒 Cadernos e blocos especiais</p>
        <p style="font-size:15px;color:#555;margin:0;">🎁 Presentes criativos e kits</p>
      </div>` : "";

  return emailWrapper(`
    <p style="font-size:16px;color:#333;">Oi, <strong>${escHtml(nome || "Cliente")}</strong>! 🆕</p>
    <p style="font-size:15px;color:#555;line-height:1.6;">
      Chegaram <strong>novidades fresquinhas</strong> na Papelaria Bibelô!
      Dá uma olhada no que separamos para você esta semana:
    </p>
    ${productsHtml || fallback}
    <div style="background:#fff7c1;border-radius:10px;padding:14px;text-align:center;margin:20px 0;">
      ${bannerFretep(regiao)}
    </div>
    ${ctaButton("Ver todas as novidades", "https://www.papelariabibelo.com.br")}
  `);
}

// ── Template: Lead Cupom Exclusivo ────────────────────────────

function buildLeadCouponEmail(nome: string, metadata: Record<string, unknown>): string {
  const cupom = escHtml(String(metadata.cupom || "BIBELO10"));
  const jaComprou = metadata.ja_comprou === true;

  return emailWrapper(`
    <p style="font-size:16px;color:#333;">Oi, <strong>${escHtml(nome || "Cliente")}</strong>! 🎁</p>
    <p style="font-size:15px;color:#555;line-height:1.6;">
      Você faz parte do <strong>Clube Bibelô</strong> e preparamos algo especial:
      ${jaComprou ? "um cupom exclusivo pra você!" : "um cupom exclusivo para a sua primeira compra!"}
    </p>
    <div style="background:linear-gradient(135deg,#ffe5ec,#fff7c1);border:2px dashed #fe68c4;border-radius:12px;padding:24px;text-align:center;margin:24px 0;">
      <p style="font-size:13px;color:#888;margin:0;text-transform:uppercase;letter-spacing:1px;">Seu cupom exclusivo</p>
      <p style="font-size:32px;font-weight:700;color:#fe68c4;margin:8px 0;letter-spacing:2px;">${cupom}</p>
      <p style="font-size:14px;color:#555;margin:0;">
        ${jaComprou ? "Desconto exclusivo · Use no checkout" : "Desconto na primeira compra · Use no checkout"}
      </p>
    </div>
    <p style="font-size:15px;color:#555;line-height:1.6;">
      Temos agendas, cadernos, canetas e presentes que vão te encantar.
      É só aplicar o cupom no carrinho!
    </p>
    ${ctaButton("Usar meu cupom agora", "https://www.papelariabibelo.com.br")}
    <p style="font-size:13px;color:#999;text-align:center;">
      ${jaComprou ? "Cupom de uso único." : "Cupom válido para primeira compra. Não acumulável."}
    </p>
  `);
}

// ── Template: FOMO Grupo VIP WhatsApp ─────────────────────────

function buildFomoVipEmail(nome: string, metadata: Record<string, unknown> = {}, regiao: Regiao = null, membrosVip = 115): string {
  const isVip = metadata.vip_confirmado === true || metadata.fonte === "grupo_vip";

  if (isVip) {
    // Já é VIP — mostrar benefícios de compra e urgência
    return emailWrapper(`
      <p style="font-size:16px;color:#333;">Oi, <strong>${escHtml(nome || "Cliente")}</strong>! 🔥</p>
      <p style="font-size:15px;color:#555;line-height:1.6;">
        Como membro do <strong>Clube VIP Bibelô</strong>, você tem acesso
        antecipado às nossas novidades — e essa semana tem coisa boa!
      </p>
      <div style="background:linear-gradient(135deg,#E8F5E9,#fff7c1);border-radius:12px;padding:20px;text-align:center;margin:20px 0;">
        <p style="font-size:32px;margin:0;">🎀✨</p>
        <p style="font-size:16px;color:#2E7D32;font-weight:700;margin:10px 0 4px;">Vantagens VIP ativas</p>
        <p style="font-size:13px;color:#555;margin:0;line-height:1.6;">
          ${metadata.ja_comprou ? "Desconto exclusivo" : "10% OFF na 1ª compra"} · ${textoFreteInline(regiao)}<br/>
          Mimo surpresa em todo pedido · Lançamentos antes de todo mundo
        </p>
      </div>
      <p style="font-size:15px;color:#555;line-height:1.6;">
        Semana passada, alguns lançamentos esgotaram em poucas horas.
        As VIPs que compram primeiro sempre garantem! 💕
      </p>
      ${ctaButton("Ver novidades na loja", "https://www.papelariabibelo.com.br/?utm_source=email&utm_medium=flow&utm_campaign=vip_fomo")}
    `, undefined, "Novidades exclusivas para membros VIP Bibelô 🔥");
  }

  // Lead normal — convencer a entrar no grupo
  return emailWrapper(`
    <p style="font-size:16px;color:#333;">Oi, <strong>${escHtml(nome || "Cliente")}</strong>! 🔥</p>
    <p style="font-size:15px;color:#555;line-height:1.6;">
      Sabia que a Papelaria Bibelô tem um <strong>grupo VIP no WhatsApp</strong>
      com mais de ${membrosVip} membros?
    </p>
    <div style="background:linear-gradient(135deg,#E8F5E9,#fff7c1);border-radius:12px;padding:20px;text-align:center;margin:20px 0;">
      <p style="font-size:32px;margin:0;">💬✨</p>
      <p style="font-size:16px;color:#2E7D32;font-weight:700;margin:10px 0 4px;">Grupo VIP · +${membrosVip} membros</p>
      <p style="font-size:13px;color:#555;margin:0;">Lançamentos antecipados · Promoções exclusivas · Esgota rápido!</p>
    </div>
    <p style="font-size:15px;color:#555;line-height:1.6;">
      As membros do grupo sempre garantem os produtos antes de todo mundo.
      Semana passada, alguns lançamentos esgotaram em poucas horas!
    </p>
    ${ctaButton("Entrar no grupo VIP agora", GRUPO_VIP_URL)}
    <p style="font-size:13px;color:#999;text-align:center;">
      Vagas limitadas. Sem spam — só novidades e ofertas exclusivas.
    </p>
  `, undefined, `+${membrosVip} membros já garantiram acesso antecipado às novidades!`);
}

// ── Template: Produto Visitado ─────────────────────────────────

function buildProductVisitedEmail(nome: string, metadata: Record<string, unknown>, regiao: Regiao = null): string {
  const productName = escHtml(String(metadata.resource_nome || ""));
  const productImg = safeImageUrl(metadata.resource_imagem as string);
  const productUrl = cleanProductUrl((metadata.resource_url as string) || (metadata.pagina as string));
  const productPrice = metadata.resource_preco ? formatBRL(metadata.resource_preco) : "";

  const productBlock = productName ? `
    <div style="background:#fef6fa;border-radius:12px;padding:20px;text-align:center;margin:20px 0;">
      ${productImg ? `<a href="${productUrl}" style="text-decoration:none;"><img src="${productImg}" alt="${productName}" style="max-width:280px;width:100%;height:auto;border-radius:12px;margin-bottom:12px;" /></a>` : ""}
      <p style="font-size:16px;font-weight:600;color:#333;margin:0;">${productName}</p>
      ${productPrice ? `<p style="font-size:18px;font-weight:700;color:#fe68c4;margin:8px 0 0;">${productPrice}</p>` : ""}
    </div>` : "";

  return emailWrapper(`
    <p style="font-size:16px;color:#333;">Oi, <strong>${escHtml(nome || "Cliente")}</strong>! 👀</p>
    <p style="font-size:15px;color:#555;line-height:1.6;">
      Notamos que você está de olho ${productName ? `em <strong>${productName}</strong>` : "em algo especial"}.
      Bom gosto! Esse é um dos nossos favoritos.
    </p>
    ${productBlock}
    <div style="background:#fff7c1;border-radius:10px;padding:14px;text-align:center;margin:20px 0;">
      ${bannerFretep(regiao)}
    </div>
    ${ctaButton(productName ? "Ver este produto" : "Voltar à loja", productUrl)}
  `, undefined, productName ? `${productName} ainda disponível — confira antes que esgote!` : "Produtos que chamaram sua atenção estão esperando!");
}

// ── Template: Convite VIP WhatsApp ────────────────────────────

function buildVipInviteEmail(nome: string, metadata: Record<string, unknown> = {}, regiao: Regiao = null): string {
  const isVip = metadata.vip_confirmado === true || metadata.fonte === "grupo_vip";

  if (isVip) {
    // Já é VIP — reforçar engajamento com a loja
    return emailWrapper(`
      <p style="font-size:16px;color:#333;">Oi, <strong>${escHtml(nome || "Cliente")}</strong>! 🎀</p>
      <p style="font-size:15px;color:#555;line-height:1.6;">
        Que bom ter você no <strong>Clube VIP Bibelô</strong>!
        Preparamos uma seleção especial pra você conhecer a loja.
      </p>
      <div style="background:#fef6fa;border-radius:12px;padding:24px;text-align:center;margin:20px 0;">
        <p style="font-size:36px;margin:0;">🎁💕</p>
        <p style="font-size:18px;color:#fe68c4;font-weight:700;margin:12px 0 6px;">
          ${metadata.ja_comprou ? "Vantagens exclusivas pra você" : "Sua 1ª compra especial"}
        </p>
        <p style="font-size:14px;color:#555;margin:0;line-height:1.5;">
          ${metadata.ja_comprou
            ? `${textoFreteInline(regiao)}<br/>Mimo surpresa em todo pedido · Desconto exclusivo para membros`
            : `Use o cupom <strong style="color:#fe68c4;">BIBELO10</strong> e ganhe 10% OFF<br/>${textoFreteInline(regiao)}<br/>Mimo surpresa em todo pedido`
          }
        </p>
      </div>
      ${ctaButton("Conhecer a loja", "https://www.papelariabibelo.com.br/?utm_source=email&utm_medium=flow&utm_campaign=vip_convite")}
    `, undefined, "Você é VIP Bibelô — benefícios exclusivos esperando por você 🎁");
  }

  // Lead normal — convite para o grupo
  return emailWrapper(`
    <p style="font-size:16px;color:#333;">Oi, <strong>${escHtml(nome || "Cliente")}</strong>! 🎀</p>
    <p style="font-size:15px;color:#555;line-height:1.6;">
      Gostamos tanto de ter você por aqui que queremos te convidar para
      o nosso <strong>grupo VIP no WhatsApp</strong>!
    </p>
    <div style="background:#fef6fa;border-radius:12px;padding:24px;text-align:center;margin:20px 0;">
      <p style="font-size:36px;margin:0;">🎀💬</p>
      <p style="font-size:18px;color:#fe68c4;font-weight:700;margin:12px 0 6px;">Convite exclusivo</p>
      <p style="font-size:14px;color:#555;margin:0;line-height:1.5;">
        Lançamentos antes de todo mundo<br/>
        Promoções só para o grupo<br/>
        Dicas de papelaria e organização
      </p>
    </div>
    ${ctaButton("Aceitar convite VIP", GRUPO_VIP_URL)}
    <p style="font-size:13px;color:#999;text-align:center;">
      Grupo com +115 membros. Sem spam, prometemos! 💕
    </p>
  `, undefined, "Convite exclusivo para o Grupo VIP Bibelô no WhatsApp 🎀");
}

// ── Template: Boas-vindas VIP (disparado pelo webhook vip.joined) ─

function buildVipWelcomeEmail(nome: string, metadata: Record<string, unknown> = {}, regiao: Regiao = null): string {
  const jaComprou = !!metadata.ja_comprou;
  const ultimoProduto = metadata.ultimo_produto ? toTitleCase(String(metadata.ultimo_produto)) : null;
  const ultimasCompras = Array.isArray(metadata.ultimas_compras)
    ? (metadata.ultimas_compras as Array<{ nome: string }>).slice(0, 3)
    : [];

  const saudacaoPersonalizada = ultimoProduto
    ? `Que alegria ter você no <strong>Clube VIP Bibelô</strong>! Da última vez você levou <strong>${escHtml(ultimoProduto)}</strong> — agora como VIP tem vantagens ainda melhores 💕`
    : `Que alegria ter você no <strong>Clube VIP Bibelô</strong>! Preparamos benefícios exclusivos pra quem faz parte do nosso grupo.`;

  const ultimasComprasHtml = ultimasCompras.length > 1 ? `
    <div style="margin:16px 0;padding:12px 16px;background:#fafafa;border-radius:10px;border:1px solid #fee;">
      <p style="font-size:12px;color:#999;margin:0 0 6px;text-transform:uppercase;letter-spacing:0.5px;">Seus últimos pedidos conosco</p>
      ${ultimasCompras.map(p => `<p style="font-size:13px;color:#555;margin:2px 0;">• ${escHtml(toTitleCase(p.nome))}</p>`).join("")}
    </div>` : "";

  return emailWrapper(`
    <p style="font-size:16px;color:#333;">Oi, <strong>${escHtml(nome || "Cliente")}</strong>! 🎀</p>
    <p style="font-size:15px;color:#555;line-height:1.6;">${saudacaoPersonalizada}</p>
    ${ultimasComprasHtml}
    <div style="background:linear-gradient(135deg,#fef6fa,#fff7c1);border-radius:14px;padding:24px;text-align:center;margin:20px 0;">
      <p style="font-size:36px;margin:0;">🎁✨</p>
      <p style="font-size:18px;color:#fe68c4;font-weight:700;margin:12px 0 8px;">Seus benefícios VIP</p>
      <p style="font-size:14px;color:#555;margin:0;line-height:1.8;">
        ${jaComprou
          ? `Frete especial para Sul e Sudeste · Acesso antecipado a lançamentos<br/>Mimo surpresa em todo pedido · Promoções só para o grupo`
          : `Use o cupom <strong style="color:#fe68c4;font-size:16px;">BIBELO10</strong> e ganhe <strong>10% OFF</strong> na 1ª compra<br/>${textoFreteInline(regiao)} · Mimo surpresa em todo pedido<br/>Acesso antecipado a lançamentos`
        }
      </p>
    </div>
    ${!jaComprou ? `
    <div style="background:#fff;border:2px dashed #fe68c4;border-radius:12px;padding:16px;text-align:center;margin:16px 0;">
      <p style="font-size:13px;color:#888;margin:0 0 4px;">Seu cupom VIP</p>
      <p style="font-size:28px;font-weight:700;color:#fe68c4;letter-spacing:2px;margin:0;">BIBELO10</p>
      <p style="font-size:12px;color:#aaa;margin:6px 0 0;">10% OFF · válido para 1ª compra</p>
    </div>` : ""}
    ${ctaButton("Explorar a loja agora", "https://www.papelariabibelo.com.br/?utm_source=email&utm_medium=flow&utm_campaign=vip_welcome")}
    <p style="font-size:13px;color:#999;text-align:center;">
      Fique de olho no grupo — novidades chegam por lá primeiro! 💕
    </p>
  `, undefined, "Bem-vinda ao Clube VIP! Seus benefícios exclusivos estão ativos 🎁");
}

// ── Template: Pedido de Avaliação (Google + NuvemShop) ────────

function buildReviewRequestEmail(nome: string, metadata: Record<string, unknown>): string {
  const itens = Array.isArray(metadata.itens) ? metadata.itens as Array<Record<string, unknown>> : [];

  // Montar cards dos produtos comprados (para avaliação na loja)
  let productsHtml = "";
  if (itens.length > 0) {
    const cards = itens.slice(0, 4).map((item) => {
      const itemName = escHtml(String(item.name || "Produto"));
      const imgUrl = safeImageUrl(item.image_url as string);
      const productId = item.product_id;
      const productUrl = productId
        ? `https://www.papelariabibelo.com.br/produtos/${productId}/?utm_source=email&utm_medium=flow&utm_campaign=avaliacao#reviews`
        : "https://www.papelariabibelo.com.br";
      return `
        <a href="${productUrl}" style="display:block;text-decoration:none;background:#fef6fa;border:1px solid #f0e0f0;border-radius:10px;padding:10px;margin:6px 0;">
          <table width="100%" cellpadding="0" cellspacing="0"><tr>
            <td width="55" style="vertical-align:middle;">
              ${imgUrl ? `<img src="${imgUrl}" alt="" width="50" height="50" style="width:50px;height:50px;object-fit:cover;border-radius:8px;" />` : `<div style="width:50px;height:50px;background:#ffe5ec;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:20px;">🎀</div>`}
            </td>
            <td style="vertical-align:middle;padding-left:10px;">
              <p style="font-size:13px;color:#333;font-weight:600;margin:0;">${itemName}</p>
              <p style="font-size:11px;color:#fe68c4;margin:4px 0 0;font-weight:600;">Avaliar este produto →</p>
            </td>
          </tr></table>
        </a>`;
    }).join("");

    productsHtml = `
      <p style="font-size:14px;color:#555;font-weight:600;margin:20px 0 8px;">Avalie seus produtos na nossa loja:</p>
      ${cards}`;
  }

  return emailWrapper(`
    <p style="font-size:16px;color:#333;">Oi, <strong>${escHtml(nome || "Cliente")}</strong>! 💕</p>
    <p style="font-size:15px;color:#555;line-height:1.6;">
      Seus produtos já chegaram! Esperamos que você tenha amado cada um.
      A sua opinião é muito importante — ela ajuda outras pessoas a descobrirem a Bibelô.
    </p>

    <div style="background:#fff7c1;border-radius:12px;padding:24px;text-align:center;margin:24px 0;">
      <p style="font-size:36px;margin:0;">⭐⭐⭐⭐⭐</p>
      <p style="font-size:16px;color:#333;font-weight:700;margin:10px 0 4px;">Conta pra gente: o que achou?</p>
      <p style="font-size:13px;color:#555;margin:0;">Leva menos de 1 minuto e faz toda a diferença!</p>
    </div>

    ${ctaButton("Avaliar no Google", "https://g.page/r/CdahFa43hhIXEAE/review")}
    <p style="font-size:12px;color:#999;text-align:center;margin:8px 0 0;">
      Avaliação rápida pelo Google — ajuda a Bibelô a ser encontrada por mais pessoas
    </p>

    ${productsHtml}

    <div style="background:#fef6fa;border-radius:10px;padding:16px;text-align:center;margin:24px 0;">
      <p style="font-size:13px;color:#555;margin:0;">
        Teve algum problema com o pedido? Fale com a gente antes de avaliar!
      </p>
      <p style="font-size:13px;margin:6px 0 0;">
        <a href="https://wa.me/5547933862514?text=Oi!%20Preciso%20de%20ajuda%20com%20meu%20pedido" style="color:#fe68c4;text-decoration:none;font-weight:600;">
          Falar pelo WhatsApp →
        </a>
      </p>
    </div>
  `);
}

// ── Template: Lembrete de Avaliação (reenvio gentil) ──────────

function buildReviewReminderEmail(nome: string, metadata: Record<string, unknown>): string {
  return emailWrapper(`
    <p style="font-size:16px;color:#333;">Oi, <strong>${escHtml(nome || "Cliente")}</strong>!</p>
    <p style="font-size:15px;color:#555;line-height:1.6;">
      Passando só pra lembrar: sua avaliação ainda está esperando! 😊
    </p>
    <p style="font-size:15px;color:#555;line-height:1.6;">
      Sabemos que o dia a dia é corrido, mas leva menos de 1 minuto
      e ajuda muito outras pessoas que amam papelaria a nos encontrar.
    </p>
    <div style="background:linear-gradient(135deg,#fff7c1,#ffe5ec);border-radius:12px;padding:20px;text-align:center;margin:20px 0;">
      <p style="font-size:28px;margin:0;">⭐💕</p>
      <p style="font-size:15px;color:#333;font-weight:700;margin:8px 0 4px;">Sua opinião vale muito pra nós</p>
      <p style="font-size:12px;color:#888;margin:0;">23 clientes já avaliaram com 5 estrelas</p>
    </div>
    ${ctaButton("Avaliar agora (1 min)", "https://g.page/r/CdahFa43hhIXEAE/review")}
  `);
}

// ── Build email por template name ──────────────────────────────

export async function buildFlowEmail(nome: string, templateName: string, metadata: Record<string, unknown>, regiao: Regiao = null): Promise<string> {
  const lower = (templateName || "").toLowerCase();

  // Lead quente ANTES de carrinho abandonado (ambos contêm "carrinho")
  if (lower.includes("lead quente") || lower.includes("lead interessado")) {
    return buildLeadCartEmail(nome, metadata);
  }
  if (lower.includes("cupom recupera")) {
    return buildCartCouponEmail(nome, metadata);
  }
  if (lower.includes("carrinho reenvio") || lower.includes("carrinho lembrete")) {
    return buildCartReminderEmail(nome, metadata, regiao);
  }
  if (lower.includes("carrinho abandonado") || lower.includes("recuperação")) {
    return buildAbandonedCartEmail(nome, metadata, regiao);
  }
  if (lower.includes("última chance") || lower.includes("ultima chance")) {
    return buildLastChanceEmail(nome, metadata, regiao);
  }
  if (lower.includes("agradecimento") || lower.includes("obrigad") || lower.includes("pós-compra")) {
    return buildThankYouEmail(nome, metadata);
  }
  if (lower.includes("boas-vindas") || lower.includes("welcome") || lower.includes("bem-vind")) {
    return await buildWelcomeEmail(nome, regiao);
  }
  if (lower.includes("reativação") || lower.includes("saudade") || lower.includes("inativ") || lower.includes("sentimos")) {
    return await buildReactivationEmail(nome, regiao, metadata);
  }
  if (lower.includes("novidades") || lower.includes("semana")) {
    return await buildNewsEmail(nome, regiao);
  }
  if (lower.includes("lead cupom") || lower.includes("cupom exclusi")) {
    return buildLeadCouponEmail(nome, metadata);
  }
  if (lower.includes("fomo") || lower.includes("grupo vip")) {
    const totalWaha = await getGrupoVipTotal();
    const membrosVip = totalWaha > 0 ? totalWaha : 115;
    metadata.membros_vip = membrosVip;
    return buildFomoVipEmail(nome, metadata, regiao, membrosVip);
  }
  if (lower.includes("produto visitado") || lower.includes("viu produto")) {
    return buildProductVisitedEmail(nome, metadata, regiao);
  }
  if (lower.includes("convite vip") || lower.includes("convite whatsapp")) {
    return buildVipInviteEmail(nome, metadata, regiao);
  }
  if (lower.includes("boas-vindas vip") || lower.includes("bem-vinda vip")) {
    return buildVipWelcomeEmail(nome, metadata, regiao);
  }
  if (lower.includes("lembrete") && (lower.includes("avalia") || lower.includes("review"))) {
    return buildReviewReminderEmail(nome, metadata);
  }
  if (lower.includes("avaliação") || lower.includes("review") || lower.includes("pedido de avalia")) {
    return buildReviewRequestEmail(nome, metadata);
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
  if (lower.includes("cross-sell") || lower.includes("combina com") || lower.includes("complemento")) {
    return await buildCrossSellEmail(nome, metadata);
  }
  if (lower.includes("recompra") || lower.includes("repor") || lower.includes("favoritos")) {
    return await buildRepurchaseEmail(nome, metadata);
  }
  if (lower.includes("carrinho tracking") || lower.includes("itens esperando")) {
    return buildTrackingCartEmail(nome, metadata, regiao);
  }

  // Fallback genérico
  logger.warn("buildFlowEmail: template sem match, usando fallback", { templateName });
  return emailWrapper(`
    <p style="font-size:16px;color:#333;">Oi, <strong>${escHtml(nome || "Cliente")}</strong>!</p>
    <p style="font-size:15px;color:#555;line-height:1.6;">
      Temos novidades especiais para você na Papelaria Bibelô! Venha conferir.
    </p>
    ${ctaButton("Visitar a loja", "https://www.papelariabibelo.com.br")}
  `);
}

// ── Subject por template name ──────────────────────────────────

export function getFlowSubject(templateName: string, nome: string, metadata: Record<string, unknown> = {}): string {
  const lower = (templateName || "").toLowerCase();

  // Lead quente ANTES de carrinho (ambos contêm "carrinho")
  if (lower.includes("lead quente") || lower.includes("lead interessado")) {
    return `${nome || "Oi"}, vimos que você gostou! Use seu cupom 🛍️`;
  }
  if (lower.includes("cupom recupera")) {
    return `🎁 ${nome || "Oi"}, um presente para você finalizar sua compra!`;
  }
  if (lower.includes("carrinho reenvio") || lower.includes("carrinho lembrete")) {
    return `${nome || "Oi"}, +500 clientes aprovam — seus itens ainda estão aqui! 💕`;
  }
  if (lower.includes("carrinho") || lower.includes("recuperação")) {
    return `${nome || "Oi"}, seus itens estão reservados! 🛒`;
  }
  if (lower.includes("última chance") || lower.includes("ultima chance")) {
    return `⏰ Última chance, ${nome || "Cliente"} — estoque quase esgotado!`;
  }
  if (lower.includes("agradecimento") || lower.includes("pós-compra")) {
    return `Obrigada pela confiança, ${nome || "Cliente"}! 💕`;
  }
  if (lower.includes("boas-vindas")) {
    return `Bem-vinda à Papelaria Bibelô, ${nome || "Cliente"}! 🎀`;
  }
  if (lower.includes("reativação") || lower.includes("inativ") || lower.includes("sentimos")) {
    return `Sentimos sua falta, ${nome || "Cliente"}! 💌`;
  }
  if (lower.includes("novidades") || lower.includes("semana")) {
    return `${nome || "Oi"}, novidades fresquinhas na Bibelô! 🆕`;
  }
  if (lower.includes("lead cupom") || lower.includes("cupom exclusi")) {
    return `🎁 ${nome || "Oi"}, seu cupom exclusivo está esperando!`;
  }
  if (lower.includes("fomo") || lower.includes("grupo vip")) {
    if (metadata.vip_confirmado === true || metadata.fonte === "grupo_vip") {
      return `${nome || "Oi"}, novidades exclusivas pra você, VIP! 🔥`;
    }
    return `${nome || "Oi"}, +${metadata.membros_vip ?? 115} membros já garantiram — e você? 🔥`;
  }
  if (lower.includes("produto visitado") || lower.includes("viu produto")) {
    return `${nome || "Oi"}, ainda de olho? Temos boas notícias! 👀`;
  }
  if (lower.includes("boas-vindas vip") || lower.includes("bem-vinda vip")) {
    return `Bem-vinda ao Clube VIP Bibelô, ${nome || "Cliente"}! 🎀`;
  }
  if (lower.includes("convite vip") || lower.includes("convite whatsapp")) {
    if (metadata.vip_confirmado === true || metadata.fonte === "grupo_vip") {
      return `${nome || "Oi"}, sua 1ª compra VIP com 10% OFF! 🎁`;
    }
    return `${nome || "Oi"}, você foi convidada para o grupo VIP! 🎀`;
  }
  if (lower.includes("lembrete") && (lower.includes("avalia") || lower.includes("review"))) {
    return `${nome || "Oi"}, sua avaliação ainda está esperando! ⭐`;
  }
  if (lower.includes("avaliação") || lower.includes("review") || lower.includes("pedido de avalia")) {
    return `${nome || "Oi"}, conta pra gente: o que achou? ⭐`;
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
  if (lower.includes("cross-sell") || lower.includes("combina com") || lower.includes("complemento")) {
    return `${nome || "Oi"}, produtos que combinam com sua compra! ✨`;
  }
  if (lower.includes("recompra") || lower.includes("repor") || lower.includes("favoritos")) {
    return `${nome || "Oi"}, hora de repor seus favoritos! 🎀`;
  }
  if (lower.includes("lembrete recompra") || lower.includes("favoritos esperando")) {
    return `${nome || "Oi"}, seus favoritos estão esperando! 💕`;
  }
  if (lower.includes("carrinho tracking") || lower.includes("itens esperando")) {
    return `${nome || "Oi"}, seus itens estão esperando no carrinho! 🛒`;
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

    // Carrinho de alto valor → alerta para o operador enviar WhatsApp manual
    if (cart.valor >= 80) {
      const customerData = await queryOne<{ nome: string; telefone: string | null }>(
        "SELECT nome, telefone FROM crm.customers WHERE id = $1",
        [cart.customer_id]
      );
      if (customerData?.telefone) {
        await createNotificacaoOperador({
          tipo: "carrinho_abandonado_alto_valor",
          customerId: cart.customer_id,
          nomeCliente: customerData.nome,
          telefone: customerData.telefone,
          titulo: `🛒 Carrinho R$ ${Number(cart.valor).toFixed(2).replace(".", ",")} — ${customerData.nome}`,
          descricao: `Pedido #${cart.ns_order_id}`,
          dados: {
            valor: cart.valor,
            ns_order_id: cart.ns_order_id,
            itens: Array.isArray(itens) ? itens.slice(0, 3) : [],
            recovery_url: recoveryUrl || null,
          },
        });
      }
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
    const productUrl = cleanProductUrl(lead.pagina);

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
    const productUrl = cleanProductUrl(item.pagina);

    const executionIds = await triggerFlow("product.interested", item.customer_id, {
      resource_id: item.resource_id,
      resource_nome: item.resource_nome,
      resource_preco: item.resource_preco,
      resource_imagem: item.resource_imagem,
      pagina: productUrl,       // lido por buildProductVisitedEmail
      recovery_url: productUrl, // compatibilidade
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

// ══════════════════════════════════════════════════════════════════
// LEMBRETE DE VERIFICAÇÃO — leads que não confirmaram o email
// ══════════════════════════════════════════════════════════════════

import { gerarLinkVerificacao } from "../routes/leads";

/**
 * Verifica leads não confirmados e reenvia email de verificação.
 * Máx 2 lembretes: 1º após 3h, 2º após 24h.
 */
export async function checkUnverifiedLeads(): Promise<number> {
  const leads = await query<{
    id: string;
    email: string;
    nome: string | null;
    cupom: string | null;
    lembretes_enviados: number;
    criado_em: string;
    telefone: string | null;
    customer_estado: string | null;
    customer_telefone: string | null;
  }>(
    `SELECT l.id, l.email, l.nome, l.cupom, l.lembretes_enviados, l.criado_em,
            l.telefone, c.estado AS customer_estado, c.telefone AS customer_telefone
     FROM marketing.leads l
     LEFT JOIN crm.customers c ON c.id = l.customer_id
     WHERE l.email_verificado = false
       AND l.lembretes_enviados < 2
       AND (
         (l.lembretes_enviados = 0 AND l.criado_em < NOW() - INTERVAL '3 hours')
         OR
         (l.lembretes_enviados = 1 AND l.ultimo_lembrete_em < NOW() - INTERVAL '24 hours')
       )
     ORDER BY l.criado_em ASC
     LIMIT 10`
  );

  if (!leads.length) return 0;

  let enviados = 0;

  for (const lead of leads) {
    try {
      const link = gerarLinkVerificacao(lead.email);
      const nomeDisplay = escHtml((lead.nome || "Cliente").replace(/[<>"'&]/g, ""));
      const isClube = lead.cupom === "CLUBEBIBELO";
      const regiaoLead = detectarRegiao({
        estado: lead.customer_estado,
        telefone: lead.customer_telefone || lead.telefone,
      });
      const isSegundo = lead.lembretes_enviados === 1;

      const subject = isSegundo
        ? `⏰ ${nomeDisplay}, seu ${isClube ? "desconto de 10%" : "cupom"} vai expirar!`
        : `💌 ${nomeDisplay}, você esqueceu de confirmar seu ${isClube ? "desconto de 10%" : "cupom"}!`;

      const urgencia = isSegundo
        ? "Este é nosso <strong>último lembrete</strong> — não queremos que você perca essa oportunidade!"
        : "Notamos que você ainda não confirmou seu e-mail. Falta só um clique!";

      await sendEmail({
        to: lead.email,
        subject,
        html: `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>*{font-family:Jost,'Segoe UI',Arial,sans-serif;}</style>
</head>
<body style="margin:0;padding:0;background:#ffe5ec;">
<div style="max-width:600px;margin:0 auto;padding:20px 10px;">
  <div style="background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 20px 60px rgba(254,104,196,0.15);">
    <div style="background:linear-gradient(160deg,#ffe5ec 0%,#fff7c1 50%,#ffe5ec 100%);padding:32px 30px;text-align:center;position:relative;overflow:hidden;">
      <div style="position:absolute;top:-20px;right:-20px;width:80px;height:80px;background:rgba(254,104,196,0.06);border-radius:50%;"></div>
      <img src="https://webhook.papelariabibelo.com.br/logo.png" alt="Papelaria Bibelô" width="52" height="52" style="width:52px;height:52px;border-radius:50%;border:2px solid rgba(254,104,196,0.3);margin-bottom:12px;" />
      ${isSegundo ? '<div style="background:#ff6b6b;color:#fff;display:inline-block;padding:5px 16px;border-radius:50px;font-size:11px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:12px;">ÚLTIMO LEMBRETE</div>' : '<div style="background:linear-gradient(135deg,#fe68c4,#f472b6);color:#fff;display:inline-block;padding:5px 16px;border-radius:50px;font-size:11px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:12px;">LEMBRETE</div>'}
      <h1 style="color:#2d2d2d;margin:0 0 6px;font-size:26px;font-weight:600;font-family:Cormorant Garamond,Georgia,serif;line-height:1.2;">${isSegundo ? "Última chance!" : "Ainda dá tempo!"}</h1>
      <p style="color:#999;margin:0;font-size:13px;">Seu ${isClube ? "desconto de 10% está esperando" : "cupom está esperando"}</p>
    </div>
    <div style="height:3px;background:linear-gradient(90deg,#fe68c4,#f472b6,#fe68c4);"></div>
    <div style="padding:32px 30px;text-align:center;">
      <p style="color:#333;font-size:16px;line-height:1.6;margin:0 0 8px;">
        Oi, <strong style="color:#fe68c4;">${nomeDisplay}</strong>! 👋
      </p>
      <p style="color:#555;font-size:15px;line-height:1.7;margin:0 0 24px;">
        ${urgencia}
      </p>
      ${isClube ? `
      <div style="background:linear-gradient(135deg,#ffe5ec,#fff7c1);border-radius:12px;padding:16px 20px;margin:0 0 24px;text-align:left;">
        <p style="margin:0 0 6px;font-size:13px;color:#555;">🏷️ 10% de desconto na 1ª compra</p>
        ${itemFreteHtml(regiaoLead, "margin:0 0 6px;font-size:13px;color:#555;")}
        <p style="margin:0 0 6px;font-size:13px;color:#555;">🎁 Mimo surpresa em toda compra</p>
        <p style="margin:0;font-size:13px;color:#555;">✨ Novidades antes de todo mundo</p>
      </div>` : ''}
      <a href="${link}" style="display:inline-block;background:linear-gradient(135deg,#fe68c4,#f472b6);color:#fff;padding:16px 44px;border-radius:50px;text-decoration:none;font-weight:600;font-size:16px;box-shadow:0 4px 15px rgba(254,104,196,0.3);">
        Confirmar agora →
      </a>
      <p style="color:#aaa;font-size:12px;margin:20px 0 0;">
        Se você não se cadastrou na Papelaria Bibelô, ignore este e-mail.
      </p>
    </div>
    <div style="padding:14px 30px;background:#fafafa;text-align:center;border-top:1px solid #ffe5ec;">
      <p style="color:#bbb;font-size:11px;margin:0;">Papelaria Bibelô · <span style="color:#fe68c4;">papelariabibelo.com.br</span></p>
      <p style="color:#ccc;font-size:10px;margin:4px 0 0;"><a href="https://www.papelariabibelo.com.br/privacidade/" style="color:#ccc;text-decoration:none;">Política de Privacidade</a> · <a href="https://www.papelariabibelo.com.br/termos-de-uso/" style="color:#ccc;text-decoration:none;">Termos de Uso</a></p>
    </div>
  </div>
</div>
</body>
</html>`,
        tags: [{ name: "type", value: "lead_reminder" }],
      });

      await query(
        `UPDATE marketing.leads
         SET lembretes_enviados = lembretes_enviados + 1,
             ultimo_lembrete_em = NOW()
         WHERE id = $1`,
        [lead.id]
      );

      enviados++;
      logger.info("Lembrete de verificação enviado", {
        email: lead.email,
        lembrete: lead.lembretes_enviados + 1,
        leadId: lead.id,
      });
    } catch (err) {
      logger.warn("Falha ao enviar lembrete de verificação", {
        email: lead.email,
        error: String(err),
      });
    }
  }

  if (enviados > 0) {
    logger.info("Lembretes de verificação enviados", { total: leads.length, enviados });
  }
  return enviados;
}

// ══════════════════════════════════════════════════════════════════
// CARRINHO ABANDONADO VIA TRACKING (sem depender de checkout NuvemShop)
// ══════════════════════════════════════════════════════════════════

export async function checkTrackingCartAbandoned(): Promise<number> {
  // Buscar visitantes que fizeram add_to_cart há mais de 30min mas não fizeram checkout
  // E que têm um customer vinculado (via visitor_customers)
  const abandoned = await query<{
    visitor_id: string; customer_id: string; nome: string; email: string;
    produtos: number; ultimo_add: string;
  }>(`
    SELECT
      te.visitor_id,
      vc.customer_id,
      c.nome,
      c.email,
      COUNT(DISTINCT te.resource_nome) AS produtos,
      MAX(te.criado_em) AS ultimo_add
    FROM crm.tracking_events te
    JOIN crm.visitor_customers vc ON vc.visitor_id = te.visitor_id
    JOIN crm.customers c ON c.id = vc.customer_id
    WHERE te.evento = 'add_to_cart'
      AND te.criado_em >= NOW() - INTERVAL '4 hours'
      AND te.criado_em <= NOW() - INTERVAL '30 minutes'
      AND c.email IS NOT NULL
      AND c.email_optout = false
      -- Sem checkout após o add_to_cart
      AND NOT EXISTS (
        SELECT 1 FROM crm.tracking_events te2
        WHERE te2.visitor_id = te.visitor_id
          AND te2.evento IN ('checkout', 'purchase')
          AND te2.criado_em > te.criado_em
      )
      -- Não já notificado por esse fluxo recentemente
      AND NOT EXISTS (
        SELECT 1 FROM marketing.flow_executions fe
        JOIN marketing.flows f ON f.id = fe.flow_id
        WHERE f.gatilho = 'cart.tracking'
          AND fe.customer_id = vc.customer_id
          AND fe.iniciado_em > NOW() - INTERVAL '24 hours'
      )
    GROUP BY te.visitor_id, vc.customer_id, c.nome, c.email
    ORDER BY MAX(te.criado_em) DESC
    LIMIT 10
  `);

  if (abandoned.length === 0) return 0;

  let triggered = 0;

  for (const cart of abandoned) {
    // Buscar os produtos que adicionou ao carrinho
    const itens = await query<{ nome: string; preco: number }>(`
      SELECT DISTINCT resource_nome AS nome, resource_preco::float AS preco
      FROM crm.tracking_events
      WHERE visitor_id = $1 AND evento = 'add_to_cart'
        AND criado_em >= NOW() - INTERVAL '4 hours'
        AND resource_nome IS NOT NULL
      ORDER BY preco DESC
      LIMIT 4
    `, [cart.visitor_id]);

    const executionIds = await triggerFlow("cart.tracking", cart.customer_id, {
      customer_id: cart.customer_id,
      visitor_id: cart.visitor_id,
      produtos_carrinho: itens,
      total_produtos: cart.produtos,
    });

    if (executionIds.length > 0) {
      triggered++;
      logger.info("Carrinho tracking abandonado detectado", {
        customerId: cart.customer_id,
        nome: cart.nome,
        produtos: cart.produtos,
      });
    }
  }

  return triggered;
}

// ══════════════════════════════════════════════════════════════════
// RECOMPRA INTELIGENTE — Dispara para clientes com ciclo de recompra
// ══════════════════════════════════════════════════════════════════

export async function checkRepurchaseDue(): Promise<number> {
  // Busca clientes com ciclo de recompra identificado que estão "atrasados"
  // Critério: dias_desde_ultima >= frequencia_dias * 0.8 (avisa ANTES de atrasar)
  // Só clientes com 2+ pedidos (recorrente, alto_valor, vip)
  const candidates = await query<{
    customer_id: string; nome: string; email: string;
    frequencia_dias: number; dias_sem_compra: number; total_pedidos: number;
  }>(`
    SELECT c.id AS customer_id, c.nome, c.email,
      cs.frequencia_dias,
      EXTRACT(DAY FROM NOW() - cs.ultima_compra)::int AS dias_sem_compra,
      cs.total_pedidos
    FROM crm.customers c
    JOIN crm.customer_scores cs ON cs.customer_id = c.id
    WHERE cs.total_pedidos >= 2
      AND cs.frequencia_dias IS NOT NULL
      AND cs.frequencia_dias > 0
      AND cs.ultima_compra IS NOT NULL
      AND c.email IS NOT NULL
      AND c.email_optout = false
      AND EXTRACT(DAY FROM NOW() - cs.ultima_compra) >= (cs.frequencia_dias * 0.8)
      AND cs.segmento IN ('recorrente', 'alto_valor', 'vip')
    ORDER BY cs.ltv DESC
    LIMIT 20
  `);

  if (candidates.length === 0) return 0;

  let triggered = 0;

  for (const c of candidates) {
    // Buscar produtos que o cliente costuma comprar (comprou 2+ vezes)
    // Prioriza produtos com imagem HD na NuvemShop
    const produtosFrequentes = await query<{
      sku: string; nome: string; valor: number; vezes: number;
    }>(`
      SELECT sub.sku, sub.nome, sub.valor, sub.vezes
      FROM (
        SELECT sku, nome,
          ROUND(AVG(valor_unitario), 2)::float AS valor,
          COUNT(*)::int AS vezes
        FROM crm.order_items
        WHERE customer_id = $1 AND sku IS NOT NULL
        GROUP BY sku, nome
        HAVING COUNT(*) >= 2
      ) sub
      LEFT JOIN sync.nuvemshop_products np ON LOWER(np.sku) = LOWER(sub.sku)
      ORDER BY
        CASE WHEN np.imagens IS NOT NULL AND jsonb_array_length(np.imagens) > 0 THEN 0 ELSE 1 END,
        sub.vezes DESC
      LIMIT 4
    `, [c.customer_id]);

    // Se não tem produtos frequentes, pula
    if (produtosFrequentes.length === 0) continue;

    const executionIds = await triggerFlow("order.recompra", c.customer_id, {
      customer_id: c.customer_id,
      frequencia_dias: c.frequencia_dias,
      dias_sem_compra: c.dias_sem_compra,
      produtos_frequentes: produtosFrequentes,
    });

    if (executionIds.length > 0) {
      triggered++;
      logger.info("Recompra inteligente disparada", {
        customerId: c.customer_id,
        nome: c.nome,
        frequencia: c.frequencia_dias,
        diasSemCompra: c.dias_sem_compra,
        produtos: produtosFrequentes.length,
      });
    }
  }

  return triggered;
}

// ── Helper: buscar imagens HD (NuvemShop > Bling) ────────────────

async function fetchProductImages(skus: string[]): Promise<Record<string, string>> {
  if (skus.length === 0) return {};
  const imgs: Record<string, string> = {};

  // Prioridade 1: NuvemShop (1024x1024 HD)
  const nsRows = await query<{ sku: string; img: string }>(
    `SELECT sku, imagens->0 #>> '{}' AS img FROM sync.nuvemshop_products WHERE LOWER(sku) = ANY($1) AND imagens IS NOT NULL AND jsonb_array_length(imagens) > 0`,
    [skus.map(s => s.toLowerCase())],
  );
  for (const r of nsRows) if (r.img) imgs[r.sku.toUpperCase()] = r.img;

  // Prioridade 2: Bling → converter thumbnail para CDN NuvemShop HD
  // Bling URL: .../t/{hash}?... → NuvemShop CDN: .../products/{hash}-...-1024-1024.jpg
  const missing = skus.filter(s => !imgs[s] && !imgs[s.toUpperCase()]);
  if (missing.length > 0) {
    const blingRows = await query<{ sku: string; img: string }>(
      `SELECT sku, imagens->0->>'url' AS img FROM sync.bling_products WHERE sku = ANY($1) AND imagens IS NOT NULL AND jsonb_array_length(imagens) > 0`,
      [missing],
    );
    for (const r of blingRows) {
      if (!r.img) continue;
      // Extrair hash do thumbnail Bling e montar URL HD via CDN NuvemShop
      const hashMatch = r.img.match(/\/t\/([a-f0-9]{32})/);
      if (hashMatch) {
        imgs[r.sku] = `https://dcdn-us.mitiendanube.com/stores/007/290/881/products/${hashMatch[1]}-1024-1024.jpg`;
      } else {
        imgs[r.sku] = r.img; // fallback para URL original
      }
    }
  }

  // Fallback: variantes filhas sem imagem → tenta SKU pai (remove sufixo _COR, _VARIANTE)
  const stillMissing = skus.filter(s => !imgs[s] && !imgs[s.toUpperCase()] && !imgs[s.toLowerCase()]);
  if (stillMissing.length > 0) {
    const parentSkus = stillMissing.map(s => s.replace(/_[A-Z0-9]{1,20}$/, "")).filter(p => p.length > 0);
    if (parentSkus.length > 0) {
      const parentRows = await query<{ sku: string; img: string }>(
        `SELECT sku, imagens->0->>'url' AS img FROM sync.bling_products WHERE sku = ANY($1) AND imagens IS NOT NULL AND jsonb_array_length(imagens) > 0`,
        [parentSkus],
      );
      const parentImgs: Record<string, string> = {};
      for (const r of parentRows) {
        if (!r.img) continue;
        const hashMatch = r.img.match(/\/t\/([a-f0-9]{32})/);
        parentImgs[r.sku] = hashMatch
          ? `https://dcdn-us.mitiendanube.com/stores/007/290/881/products/${hashMatch[1]}-1024-1024.jpg`
          : r.img;
      }
      for (const sku of stillMissing) {
        const parentSku = sku.replace(/_[A-Z0-9]{1,20}$/, "");
        if (parentImgs[parentSku]) imgs[sku] = parentImgs[parentSku];
      }
    }
  }

  // Normalizar: garantir que o SKU original (case-sensitive) tenha a imagem
  const result: Record<string, string> = {};
  for (const sku of skus) {
    result[sku] = imgs[sku] || imgs[sku.toUpperCase()] || imgs[sku.toLowerCase()] || "";
  }
  return result;
}

// ── Helper: buscar URL da NuvemShop para um produto ──────────────
// Passo 1: cache local (sync.nuvemshop_products) — SKU exato + prefixo pai
// Passo 2: API NuvemShop para os ainda não resolvidos — persiste resultado no cache
// SKU real: sem espaços, curto. Nome-como-SKU: tem espaços ou é muito longo.
function isValidSku(sku: string): boolean {
  return !sku.includes(" ") && sku.length < 60;
}

// Passo 3: slug do nome com VARIANTE_RE (último recurso se API falhar/timeout)

const VARIANTE_RE_URL = /\s+(Cor(?:\/[A-Za-zÀ-ɏ]+)?|Tinta|Estampa|Miolo|Tamanho|Modelo|Tipo|Embalagem|Aroma|Fragrância|Fragr[aâ]ncia|Sabor|Forma|S[ée]rie)\s*:.*$/i;

function nomeToSlug(nome: string): string {
  return nome
    .replace(VARIANTE_RE_URL, "")
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^\w\s-]/g, " ")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

type UrlRow = { sku: string; canonical: string | null; handle: string | null };
const NS_PROD_BASE = "https://www.papelariabibelo.com.br/produtos/";

// Extrai URL de um registro NuvemShop (canonical_url tem precedência)
function urlFromRow(r: { canonical: string | null; handle: string | null }): string {
  if (r.canonical) return r.canonical;
  if (r.handle) return `${NS_PROD_BASE}${r.handle}/`;
  return "";
}

// Passo 1a: query por SKU exato
async function cacheQueryExact(lookupSkus: string[]): Promise<Record<string, string>> {
  if (lookupSkus.length === 0) return {};
  const rows = await query<UrlRow>(
    `SELECT sku, dados_raw->>'canonical_url' AS canonical, dados_raw->'handle'->>'pt' AS handle
     FROM sync.nuvemshop_products WHERE LOWER(sku) = ANY($1)`,
    [lookupSkus.map(s => s.toLowerCase())],
  );
  const map: Record<string, string> = {};
  for (const r of rows) {
    const url = urlFromRow(r);
    if (url) map[r.sku.toUpperCase()] = url;
  }
  return map;
}

// Passo 1b: query por prefixo de SKU pai (ex: CANET_BRW_UNC_0001%)
async function cacheQueryPrefix(sku: string): Promise<string> {
  const prefix = sku.replace(/_[A-Z0-9]{1,20}$/, "");
  if (prefix === sku) return ""; // sem sufixo removível
  const rows = await query<UrlRow>(
    `SELECT sku, dados_raw->>'canonical_url' AS canonical, dados_raw->'handle'->>'pt' AS handle
     FROM sync.nuvemshop_products WHERE UPPER(sku) LIKE $1 LIMIT 1`,
    [`${prefix}%`],
  );
  return rows[0] ? urlFromRow(rows[0]) : "";
}

// Passo 2: API NuvemShop + persiste no cache
async function apiLookup(sku: string): Promise<string> {
  if (!isValidSku(sku)) return "";  // nome-como-SKU: pular API, usar fallback nomeToSlug

  const token = await getNuvemShopToken();
  if (!token) return "";

  type NsProduct = {
    id: number; handle: Record<string, string> | string; canonical_url?: string;
    variants: Array<{ sku: string }>; [k: string]: unknown;
  };

  // Timeout de 3s — não trava a geração do email se API lenta
  const timeoutPromise = new Promise<NsProduct[]>((_, reject) =>
    setTimeout(() => reject(new Error("timeout")), 3000)
  );

  let products: NsProduct[];
  try {
    products = await Promise.race([
      nsRequest<NsProduct[]>("get", `products?sku=${encodeURIComponent(sku)}&per_page=5`, token),
      timeoutPromise,
    ]);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "timeout") {
      logger.warn("fetchProductUrls: timeout na API NuvemShop", { sku });
    } else {
      logger.warn("fetchProductUrls: erro na API NuvemShop", { sku, error: msg });
    }
    return "";
  }

  if (!products || products.length === 0) return "";

  const prod = products[0];

  // Validar match: pelo menos um variant deve ter o SKU buscado.
  // Sem essa verificação, a API retorna o primeiro produto do catálogo como falso positivo.
  const skuUpper = sku.toUpperCase();
  const skuParent = skuUpper.replace(/_[A-Z0-9]{1,20}$/, "");
  const variantMatch = (prod.variants as Array<{ sku: string }>).find(v => {
    const vUp = (v.sku || "").toUpperCase();
    return vUp === skuUpper || vUp === skuParent;
  });
  if (!variantMatch) {
    logger.warn("fetchProductUrls: match inválido — nenhum variant bate com o SKU buscado", {
      sku, nsId: prod.id, variantSkus: (prod.variants as Array<{ sku: string }>).map(v => v.sku).slice(0, 5),
    });
    return "";
  }

  const handle = typeof prod.handle === "object" ? (prod.handle as Record<string, string>).pt || "" : String(prod.handle || "");
  const url = prod.canonical_url || (handle ? `${NS_PROD_BASE}${handle}/` : "");
  if (!url) return "";

  // Persiste no cache para as próximas chamadas (ns_id como chave de conflito)
  const nsId = String(prod.id);
  const matchedSku = variantMatch.sku || sku;
  await query(
    `INSERT INTO sync.nuvemshop_products (ns_id, nome, sku, preco, custo, estoque, imagens, publicado, dados_raw, sincronizado_em)
     VALUES ($1, $2, $3, 0, 0, NULL, '[]', true, $4, NOW())
     ON CONFLICT (ns_id) DO UPDATE SET dados_raw = $4, sincronizado_em = NOW()`,
    [nsId, String((prod.name as Record<string, string>)?.pt || prod.name || matchedSku), matchedSku, JSON.stringify(prod)],
  ).catch(e => logger.warn("fetchProductUrls: erro ao persistir cache NS", { sku, error: String(e) }));

  logger.info("fetchProductUrls: URL resolvida via API NuvemShop", { sku, url, nsId });
  return url;
}

async function fetchProductUrls(skus: string[]): Promise<Record<string, string>> {
  if (skus.length === 0) return {};

  // Passo 1: cache local — SKU exato
  const resolved: Record<string, string> = await cacheQueryExact(skus);

  // Para os não resolvidos: prefixo do SKU pai no cache
  const afterExact = skus.filter(s => !resolved[s.toUpperCase()]);
  for (const sku of afterExact) {
    const url = await cacheQueryPrefix(sku);
    if (url) resolved[sku.toUpperCase()] = url;
  }

  // Passo 2: API NuvemShop para os ainda sem URL
  const afterCache = skus.filter(s => !resolved[s.toUpperCase()]);
  for (const sku of afterCache) {
    const url = await apiLookup(sku);
    if (url) resolved[sku.toUpperCase()] = url;
  }

  // Sem URL verificada → retorna "" para que o email use o fallback /novidades
  // (evita URLs geradas de nome Bling que podem não existir na NS e causam 404)
  const result: Record<string, string> = {};
  for (const sku of skus) {
    result[sku] = resolved[sku.toUpperCase()] || "";
  }
  return result;
}

// ══════════════════════════════════════════════════════════════════
// CROSS-SELL — Email com produtos complementares
// ══════════════════════════════════════════════════════════════════

async function buildCrossSellEmail(nome: string, metadata: Record<string, unknown>): Promise<string> {
  const customerId = metadata.customer_id as string;
  if (!customerId) {
    return emailWrapper(`
      <p style="font-size:16px;color:#333;">Oi, <strong>${escHtml(nome || "Cliente")}</strong>!</p>
      <p style="font-size:15px;color:#555;line-height:1.6;">
        Selecionamos produtos que combinam com você! Venha conferir as novidades da Bibelô.
      </p>
      ${ctaButton("Ver novidades", "https://www.papelariabibelo.com.br/novidades?utm_source=email&utm_medium=flow&utm_campaign=cross_sell")}
    `);
  }

  // Buscar itens da última compra do cliente (Bling ou NuvemShop)
  const itensDaUltimaCompra = await query<{
    sku: string | null; nome: string; image_url: string | null;
  }>(`
    SELECT sku, nome, image_url
    FROM crm.order_items
    WHERE customer_id = $1
      AND criado_em = (
        SELECT MAX(oi2.criado_em) FROM crm.order_items oi2 WHERE oi2.customer_id = $1
      )
    ORDER BY posicao
  `, [customerId]);

  const skusComprados: string[] = [];
  const itensComprados: Array<{ nome: string; sku: string }> = [];
  for (const item of itensDaUltimaCompra) {
    if (item.sku) {
      skusComprados.push(item.sku);
      itensComprados.push({ nome: item.nome, sku: item.sku });
    } else {
      itensComprados.push({ nome: item.nome, sku: "" });
    }
  }

  // Collaborative filtering por nome_base — agrupa variantes (Cor:X, Tinta:X, etc.)
  // antes de recomendar, evitando sugerir "caneta azul → caneta vermelha"
  const VARIANTE_RE = `\\s+(Cor(?:/[A-Za-z\\u00C0-\\u024F]+)?|Tinta|Estampa|Miolo|Tamanho|Modelo|Tipo|Embalagem|Aroma|Fragrância|Fragr[aâ]ncia|Sabor|Forma|S[ée]rie)\\s*:.*$`;

  let recomendacoes: Array<{ sku: string; nome: string; valor: number; img: string | null }> = [];

  if (skusComprados.length > 0) {
    const recs = await query<{ sku: string; nome: string; valor: number }>(`
      WITH
      -- Nome base do cliente (sem sufixo de variante)
      base_comprada AS (
        SELECT
          sku,
          REGEXP_REPLACE(nome, '${VARIANTE_RE}', '', 'i') AS nome_base
        FROM crm.order_items
        WHERE customer_id = $2
      ),
      -- Co-compras: produtos que aparecem no mesmo pedido que os SKUs do cliente
      co_compras AS (
        SELECT
          b.sku AS sku_recom,
          b.nome AS nome_recom,
          REGEXP_REPLACE(b.nome, '${VARIANTE_RE}', '', 'i') AS nome_base_recom,
          b.valor_unitario AS valor,
          COUNT(*) AS frequencia
        FROM crm.order_items a
        JOIN crm.order_items b
          ON a.order_id = b.order_id AND a.source = b.source AND a.sku != b.sku
        WHERE a.sku = ANY($1::text[])
          AND b.sku IS NOT NULL AND b.sku != '' AND b.sku != '-' AND LENGTH(b.sku) > 1
          AND b.customer_id != $2   -- exclui pedidos do próprio cliente
        GROUP BY b.sku, b.nome, b.valor_unitario
      ),
      -- Deduplica variantes: mantém só 1 SKU por nome_base (o mais frequente)
      dedup AS (
        SELECT DISTINCT ON (nome_base_recom)
          sku_recom, nome_recom, nome_base_recom, valor,
          SUM(frequencia) OVER (PARTITION BY nome_base_recom) AS freq_total
        FROM co_compras
        ORDER BY nome_base_recom, frequencia DESC
      )
      SELECT
        d.sku_recom AS sku,
        d.nome_recom AS nome,
        ROUND(AVG(d.valor), 2)::float AS valor
      FROM dedup d
      -- Excluir produtos com mesmo nome_base que o cliente já comprou
      WHERE NOT EXISTS (
        SELECT 1 FROM base_comprada bc WHERE bc.nome_base = d.nome_base_recom
      )
      AND d.sku_recom != ALL($1::text[])
      GROUP BY d.sku_recom, d.nome_recom, d.freq_total
      ORDER BY d.freq_total DESC
      LIMIT 4
    `, [skusComprados, customerId]);

    if (recs.length > 0) {
      const imgs = await fetchProductImages(recs.map(r => r.sku));
      recomendacoes = recs.map(r => ({ ...r, img: imgs[r.sku] || null }));
    }
  }

  // Fallback: produtos mais populares que o cliente nunca comprou (por nome_base)
  if (recomendacoes.length === 0) {
    const topRows = await query<{ sku: string; nome: string; valor: number }>(`
      WITH historico_cliente AS (
        SELECT REGEXP_REPLACE(nome, '${VARIANTE_RE}', '', 'i') AS nome_base
        FROM crm.order_items WHERE customer_id = $2
      )
      SELECT DISTINCT ON (REGEXP_REPLACE(nome, '${VARIANTE_RE}', '', 'i'))
        sku, nome, ROUND(AVG(valor_unitario) OVER (PARTITION BY sku), 2)::float AS valor
      FROM crm.order_items
      WHERE sku IS NOT NULL AND sku != '' AND sku != '-' AND LENGTH(sku) > 1
        AND sku != ALL($1::text[])
        AND criado_em >= NOW() - INTERVAL '2 months'
        AND REGEXP_REPLACE(nome, '${VARIANTE_RE}', '', 'i') NOT IN (SELECT nome_base FROM historico_cliente)
      ORDER BY REGEXP_REPLACE(nome, '${VARIANTE_RE}', '', 'i'), COUNT(*) OVER (PARTITION BY sku) DESC
      LIMIT 4
    `, [skusComprados, customerId]);

    const imgs2 = await fetchProductImages(topRows.map(r => r.sku));
    recomendacoes = topRows.map(r => ({ ...r, img: imgs2[r.sku] || null }));
  }

  // Buscar URLs da NuvemShop para links clicáveis (fallback: slug gerado do nome)
  const allSkus = recomendacoes.map(r => r.sku);
  const allNomes = recomendacoes.map(r => r.nome);
  const urls = await fetchProductUrls(allSkus);

  // Montar HTML dos produtos recomendados
  let productsHtml = "";
  if (recomendacoes.length > 0) {
    const cards = recomendacoes.map((p, i) => {
      const imgTag = p.img
        ? `<img src="${safeImageUrl(p.img)}" alt="${escHtml(p.nome)}" style="width:100%;height:140px;object-fit:contain;border-radius:8px;margin-bottom:8px;" />`
        : `<div style="width:100%;height:140px;background:#ffe5ec;border-radius:8px;margin-bottom:8px;display:flex;align-items:center;justify-content:center;font-size:40px;">🎀</div>`;

      const prodUrl = urls[p.sku]
        ? `${urls[p.sku]}?utm_source=email&utm_medium=flow&utm_campaign=cross_sell&utm_content=produto_${i + 1}`
        : `https://www.papelariabibelo.com.br/novidades?utm_source=email&utm_medium=flow&utm_campaign=cross_sell`;

      const nomeDisplay = toTitleCase(p.nome.length > 50 ? p.nome.slice(0, 47) + "..." : p.nome);
      return `<td style="width:50%;padding:6px;vertical-align:top;">
        <a href="${prodUrl}" style="text-decoration:none;display:block;">
        <div style="background:#fafafa;border-radius:12px;padding:12px;text-align:center;border:1px solid #fee;">
          ${imgTag}
          <p style="font-size:12px;color:#333;margin:0 0 4px;line-height:1.3;min-height:32px;">${escHtml(nomeDisplay)}</p>
          <p style="font-size:15px;color:#fe68c4;font-weight:700;margin:0;">${formatBRL(p.valor)}</p>
          <span style="display:inline-block;background:linear-gradient(135deg,#fe68c4,#f472b6);color:#fff;padding:6px 16px;border-radius:20px;font-size:11px;font-weight:600;margin-top:8px;">Quero esse!</span>
        </div>
        </a>
      </td>`;
    });

    // Grid 2x2
    productsHtml = `<table style="width:100%;border-collapse:collapse;margin:16px 0;"><tr>${cards.slice(0, 2).join("")}</tr>`;
    if (cards.length > 2) {
      productsHtml += `<tr>${cards.slice(2, 4).join("")}</tr>`;
    }
    productsHtml += "</table>";
  }

  // Mencionar o que compraram
  const compradosText = itensComprados.length > 0
    ? itensComprados.slice(0, 2).map(i => {
        const nomeFormatado = toTitleCase(i.nome.length > 40 ? i.nome.slice(0, 37) + "..." : i.nome);
        return `<strong>${escHtml(nomeFormatado)}</strong>`;
      }).join(", ")
    : "sua última compra";

  return emailWrapper(`
    <p style="font-size:16px;color:#333;">Oi, <strong>${escHtml(nome || "Cliente")}</strong>! 💕</p>
    <p style="font-size:15px;color:#555;line-height:1.6;">
      Adoramos sua compra de ${compradosText}!
      Separamos produtos que <strong>combinam perfeitamente</strong> com o que você levou:
    </p>
    <div style="background:linear-gradient(135deg,#fff7c1,#ffe5ec);border-radius:12px;padding:2px;">
      <div style="text-align:center;padding:10px;">
        <span style="background:#fe68c4;color:#fff;padding:4px 14px;border-radius:20px;font-size:12px;font-weight:600;">Combina com você ✨</span>
      </div>
      ${productsHtml}
    </div>
    ${ctaButton("Ver todos os produtos", "https://www.papelariabibelo.com.br/novidades?utm_source=email&utm_medium=flow&utm_campaign=cross_sell&utm_content=cta_ver_produtos")}
    <p style="font-size:13px;color:#999;text-align:center;">
      Aproveite enquanto tem em estoque! 🎀
    </p>
  `, undefined, `Produtos que combinam com ${compradosText.replace(/<[^>]+>/g, "")} ✨`);
}

// ══════════════════════════════════════════════════════════════════
// RECOMPRA INTELIGENTE — Email com produtos que o cliente costuma comprar
// ══════════════════════════════════════════════════════════════════

async function buildRepurchaseEmail(nome: string, metadata: Record<string, unknown>): Promise<string> {
  const produtosFrequentes = (metadata.produtos_frequentes as Array<{ sku: string; nome: string; valor: number; vezes: number }>) || [];
  const diasSemCompra = metadata.dias_sem_compra as number || 0;

  if (produtosFrequentes.length === 0) {
    return emailWrapper(`
      <p style="font-size:16px;color:#333;">Oi, <strong>${escHtml(nome || "Cliente")}</strong>! 🎀</p>
      <p style="font-size:15px;color:#555;line-height:1.6;">
        Faz um tempinho que você não aparece! Temos novidades esperando por você.
      </p>
      ${ctaButton("Ver novidades", "https://www.papelariabibelo.com.br/novidades?utm_source=email&utm_medium=flow&utm_campaign=recompra")}
    `, undefined, "Hora de repor seus favoritos — estoque reservado para você 💕");
  }

  // Buscar imagens HD e URLs dos produtos frequentes
  const skus = produtosFrequentes.map(p => p.sku);
  const imgs = await fetchProductImages(skus);
  const urls = await fetchProductUrls(skus);

  // Montar grid de produtos
  const cards = produtosFrequentes.map((p, i) => {
    const imgTag = imgs[p.sku]
      ? `<img src="${safeImageUrl(imgs[p.sku])}" alt="${escHtml(p.nome)}" style="width:100%;height:140px;object-fit:contain;border-radius:8px;margin-bottom:8px;" />`
      : `<div style="width:100%;height:140px;background:#ffe5ec;border-radius:8px;margin-bottom:8px;display:flex;align-items:center;justify-content:center;font-size:40px;">🎀</div>`;

    const prodUrl = urls[p.sku]
      ? `${urls[p.sku]}?utm_source=email&utm_medium=flow&utm_campaign=recompra&utm_content=produto_${i + 1}`
      : `https://www.papelariabibelo.com.br/novidades?utm_source=email&utm_medium=flow&utm_campaign=recompra`;

    const nomeRecompra = toTitleCase(p.nome.length > 50 ? p.nome.slice(0, 47) + "..." : p.nome);
    return `<td style="width:50%;padding:6px;vertical-align:top;">
      <a href="${prodUrl}" style="text-decoration:none;display:block;">
      <div style="background:#fafafa;border-radius:12px;padding:12px;text-align:center;border:1px solid #fee;">
        ${imgTag}
        <p style="font-size:12px;color:#333;margin:0 0 4px;line-height:1.3;min-height:32px;">${escHtml(nomeRecompra)}</p>
        <p style="font-size:15px;color:#fe68c4;font-weight:700;margin:0;">${formatBRL(p.valor)}</p>
        <p style="font-size:10px;color:#999;margin:4px 0 0;">Você já comprou ${p.vezes}x</p>
        <span style="display:inline-block;background:linear-gradient(135deg,#fe68c4,#f472b6);color:#fff;padding:6px 16px;border-radius:20px;font-size:11px;font-weight:600;margin-top:6px;">Comprar de novo</span>
      </div>
      </a>
    </td>`;
  });

  let productsHtml = `<table style="width:100%;border-collapse:collapse;margin:16px 0;"><tr>${cards.slice(0, 2).join("")}</tr>`;
  if (cards.length > 2) productsHtml += `<tr>${cards.slice(2, 4).join("")}</tr>`;
  productsHtml += "</table>";

  return emailWrapper(`
    <p style="font-size:16px;color:#333;">Oi, <strong>${escHtml(nome || "Cliente")}</strong>! 🎀</p>
    <p style="font-size:15px;color:#555;line-height:1.6;">
      ${diasSemCompra > 30
        ? `Faz <strong>${diasSemCompra} dias</strong> desde sua última compra! Seus produtos favoritos estão esperando:`
        : `Hora de repor seus <strong>queridinhos</strong>? Separamos os produtos que você mais gosta:`
      }
    </p>
    <div style="background:linear-gradient(135deg,#fff7c1,#ffe5ec);border-radius:12px;padding:2px;">
      <div style="text-align:center;padding:12px 10px 4px;">
        <span style="background:#fe68c4;color:#fff;padding:5px 16px;border-radius:20px;font-size:12px;font-weight:600;letter-spacing:0.5px;">Seus favoritos 💕</span>
      </div>
      ${productsHtml}
    </div>
    ${ctaButton("Visitar a loja", "https://www.papelariabibelo.com.br/novidades?utm_source=email&utm_medium=flow&utm_campaign=recompra&utm_content=cta_visitar")}
    <p style="font-size:13px;color:#999;text-align:center;">
      Garantimos estoque reservado para nossas clientes fiéis! 💖
    </p>
  `, undefined, "Hora de repor seus favoritos — estoque reservado para você 💕");
}

// ══════════════════════════════════════════════════════════════════
// CARRINHO TRACKING — Email para quem adicionou ao carrinho mas não fez checkout
// ══════════════════════════════════════════════════════════════════

function buildTrackingCartEmail(nome: string, metadata: Record<string, unknown>, regiao: Regiao = null): string {
  const produtos = (metadata.produtos_carrinho as Array<{ nome: string; preco: number }>) || [];

  let productsHtml = "";
  if (produtos.length > 0) {
    const rows = produtos.map(p => {
      const preco = formatBRL(p.preco);
      return `<tr>
        <td style="padding:8px 0;border-bottom:1px solid #fee;">
          <span style="font-size:13px;color:#333;">${escHtml(p.nome.length > 50 ? p.nome.slice(0, 47) + "..." : p.nome)}</span>
        </td>
        <td style="padding:8px 0;border-bottom:1px solid #fee;text-align:right;">
          <span style="font-size:14px;color:#fe68c4;font-weight:700;">${preco}</span>
        </td>
      </tr>`;
    });
    productsHtml = `<table style="width:100%;border-collapse:collapse;margin:16px 0;">${rows.join("")}</table>`;
  }

  return emailWrapper(`
    <p style="font-size:16px;color:#333;">Oi, <strong>${escHtml(nome || "Cliente")}</strong>! 🛒</p>
    <p style="font-size:15px;color:#555;line-height:1.6;">
      Vimos que você estava dando uma olhada nos nossos produtos e adicionou alguns ao carrinho.
      Eles ainda estão esperando por você!
    </p>
    ${productsHtml}
    <div style="background:#fff7c1;border-radius:10px;padding:14px;text-align:center;margin:16px 0;">
      ${bannerFretep(regiao)}
    </div>
    ${ctaButton("Finalizar minha compra", "https://www.papelariabibelo.com.br/produtos?utm_source=email&utm_medium=flow&utm_campaign=cart_tracking&utm_content=cta_finalizar")}
    <p style="font-size:13px;color:#999;text-align:center;">
      Precisa de ajuda? <a href="https://wa.me/5547933862514" style="color:#fe68c4;text-decoration:none;">Fale com a gente no WhatsApp</a> 💬
    </p>
  `);
}
