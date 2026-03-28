import { query, queryOne } from "../db";
import { logger } from "../utils/logger";
import { sendEmail } from "../integrations/resend/email";

// ── Types ──────────────────────────────────────────────────────

interface FlowStep {
  tipo: "email" | "whatsapp" | "wait" | "condicao";
  template?: string;
  delay_horas: number;
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

  const executionIds: string[] = [];

  for (const flow of flows) {
    // Verifica se já existe execução ativa deste fluxo para este cliente
    const existing = await queryOne<{ id: string }>(
      "SELECT id FROM marketing.flow_executions WHERE flow_id = $1 AND customer_id = $2 AND status = 'ativo'",
      [flow.id, customerId]
    );

    if (existing) {
      logger.info("Fluxo já ativo para cliente, ignorando", { flowId: flow.id, customerId });
      continue;
    }

    const steps = typeof flow.steps === "string" ? JSON.parse(flow.steps) : flow.steps;
    const firstStep = steps[0] as FlowStep | undefined;

    // Calcula quando executar o primeiro step
    const delayMs = (firstStep?.delay_horas || 0) * 3600 * 1000;
    const proximoStepEm = new Date(Date.now() + delayMs);

    const execution = await queryOne<{ id: string }>(
      `INSERT INTO marketing.flow_executions (flow_id, customer_id, step_atual, status, metadata, proximo_step_em)
       VALUES ($1, $2, 0, 'ativo', $3, $4) RETURNING id`,
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
  const customer = await queryOne<{ id: string; nome: string; email: string | null; telefone: string | null }>(
    "SELECT id, nome, email, telefone FROM crm.customers WHERE id = $1",
    [execution.customer_id]
  );

  if (!customer) {
    await failExecution(executionId, "Cliente não encontrado");
    return false;
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

      case "condicao":
        // Placeholder para condições futuras
        resultado = { evaluated: true, passed: true };
        break;

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
  steps: FlowStep[]
): Promise<void> {
  const nextIndex = execution.step_atual + 1;

  if (nextIndex >= steps.length) {
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
    // Envia email genérico com o nome do template como assunto
    const result = await sendEmail({
      to: customer.email,
      subject: step.template || "Papelaria Bibelô",
      html: buildGenericEmail(customer.nome, step.template || "", metadata),
      tags: [
        { name: "flow", value: "true" },
        { name: "customer_id", value: customer.id },
      ],
    });

    return { sent: true, messageId: result?.id, templateUsed: "genérico" };
  }

  // Substitui variáveis no template
  const html = (template.html || "")
    .replace(/\{\{nome\}\}/g, customer.nome || "Cliente")
    .replace(/\{\{email\}\}/g, customer.email)
    .replace(/\{\{valor\}\}/g, String(metadata.valor || ""))
    .replace(/\{\{itens\}\}/g, formatItens(metadata.itens));

  const subject = (template.assunto || step.template || "")
    .replace(/\{\{nome\}\}/g, customer.nome || "Cliente");

  const result = await sendEmail({
    to: customer.email,
    subject,
    html,
    text: template.texto?.replace(/\{\{nome\}\}/g, customer.nome || "Cliente"),
    tags: [
      { name: "flow", value: "true" },
      { name: "template_id", value: template.id },
      { name: "customer_id", value: customer.id },
    ],
  });

  return { sent: true, messageId: result?.id, templateId: template.id };
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

function buildGenericEmail(nome: string, templateName: string, metadata: Record<string, unknown>): string {
  const valor = metadata.valor ? `R$ ${Number(metadata.valor).toFixed(2).replace(".", ",")}` : "";

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; padding: 20px 0;">
        <h1 style="color: #E91E63; font-size: 24px;">Papelaria Bibelô 🎀</h1>
      </div>
      <div style="padding: 20px; background: #fff; border-radius: 8px;">
        <p>Olá, <strong>${nome || "Cliente"}</strong>!</p>
        <p>${getGenericMessage(templateName, valor)}</p>
        <p style="margin-top: 20px;">
          <a href="https://papelariabibelo.com.br" style="background: #E91E63; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
            Visitar a loja
          </a>
        </p>
      </div>
      <div style="text-align: center; padding: 20px; color: #999; font-size: 12px;">
        Papelaria Bibelô — Teresina, PI
      </div>
    </div>
  `;
}

function getGenericMessage(templateName: string, valor: string): string {
  const lower = templateName.toLowerCase();
  if (lower.includes("boas-vindas") || lower.includes("welcome")) {
    return "Bem-vinda à Papelaria Bibelô! Estamos muito felizes em ter você conosco. Confira nossas novidades e promoções especiais.";
  }
  if (lower.includes("agradecimento") || lower.includes("obrigad")) {
    return `Obrigada pela sua compra${valor ? ` de ${valor}` : ""}! Seu pedido está sendo preparado com muito carinho. 💕`;
  }
  if (lower.includes("carrinho") || lower.includes("abandon")) {
    return `Você deixou alguns itens esperando${valor ? ` (${valor})` : ""}! Eles ainda estão disponíveis — finalize sua compra antes que acabem.`;
  }
  if (lower.includes("reativação") || lower.includes("saudade")) {
    return "Faz tempo que não nos visita! Temos muitas novidades esperando por você. Venha conferir!";
  }
  if (lower.includes("última chance")) {
    return `Os itens no seu carrinho${valor ? ` (${valor})` : ""} estão quase esgotando! Não perca a chance de garantir os seus.`;
  }
  return "Temos novidades especiais para você na Papelaria Bibelô! Venha conferir.";
}

function formatItens(itens: unknown): string {
  if (!itens || !Array.isArray(itens)) return "";
  return itens
    .map((item: Record<string, unknown>) => `${item.name || item.nome || "Produto"} (${item.quantity || item.qtd || 1}x)`)
    .join(", ");
}

// ── Processar steps prontos (chamado pelo worker) ──────────────

export async function processReadySteps(): Promise<number> {
  // Busca execuções ativas com próximo step vencido
  const executions = await query<{ id: string }>(
    `SELECT id FROM marketing.flow_executions
     WHERE status = 'ativo' AND proximo_step_em <= NOW()
     ORDER BY proximo_step_em ASC
     LIMIT 50`
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
    id: string; ns_order_id: string; customer_id: string; email: string; valor: number; itens: unknown;
  }>(
    `SELECT id, ns_order_id, customer_id, email, valor, itens
     FROM marketing.pedidos_pendentes
     WHERE convertido = false AND notificado = false AND expira_em <= NOW()
     LIMIT 20`
  );

  let triggered = 0;

  for (const cart of abandoned) {
    if (!cart.customer_id) continue;

    const executionIds = await triggerFlow("order.abandoned", cart.customer_id, {
      ns_order_id: cart.ns_order_id,
      valor: cart.valor,
      itens: cart.itens,
      email: cart.email,
    });

    if (executionIds.length > 0) {
      triggered++;
    }

    // Marca como notificado mesmo se não havia fluxo ativo
    await query(
      "UPDATE marketing.pedidos_pendentes SET notificado = true WHERE id = $1",
      [cart.id]
    );
  }

  logger.info("Carrinhos abandonados verificados", { total: abandoned.length, triggered });
  return triggered;
}

// ── Registrar pedido pendente (chamado pelo webhook) ───────────

export async function registerPendingOrder(
  nsOrderId: string,
  customerId: string | null,
  email: string | null,
  valor: number,
  itens: unknown
): Promise<void> {
  const delayHoras = 2; // padrão: considerar abandonado após 2h
  const expiraEm = new Date(Date.now() + delayHoras * 3600 * 1000);

  await query(
    `INSERT INTO marketing.pedidos_pendentes (ns_order_id, customer_id, email, valor, itens, expira_em)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (ns_order_id) DO UPDATE SET
       customer_id = COALESCE($2, marketing.pedidos_pendentes.customer_id),
       email = COALESCE($3, marketing.pedidos_pendentes.email),
       valor = $4, itens = $5`,
    [nsOrderId, customerId, email, valor, JSON.stringify(itens), expiraEm]
  );
}

// ── Marcar pedido como convertido (chamado quando order/paid) ──

export async function markOrderConverted(nsOrderId: string): Promise<void> {
  await query(
    "UPDATE marketing.pedidos_pendentes SET convertido = true WHERE ns_order_id = $1",
    [nsOrderId]
  );
}
