import { query, queryOne } from "../db";
import { logger } from "../utils/logger";
import { sendEmail } from "../integrations/resend/email";
import { getNuvemShopToken, nsRequest } from "../integrations/nuvemshop/auth";

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
    // Usa templates built-in ricos (com fotos, recovery_url, etc.)
    const html = buildFlowEmail(customer.nome, step.template || "", metadata);
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

    return { sent: true, messageId: result?.id, templateUsed: "built-in" };
  }

  // Usa template do banco (marketing.templates)
  const recoveryUrl = (metadata.recovery_url as string) || "";
  const html = (template.html || "")
    .replace(/\{\{nome\}\}/g, customer.nome || "Cliente")
    .replace(/\{\{email\}\}/g, customer.email)
    .replace(/\{\{valor\}\}/g, formatBRL(metadata.valor))
    .replace(/\{\{itens\}\}/g, formatItens(metadata.itens))
    .replace(/\{\{recovery_url\}\}/g, recoveryUrl);

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

// ── Email base wrapper ─────────────────────────────────────────

function emailWrapper(content: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'Segoe UI',Arial,sans-serif;">
<div style="max-width:600px;margin:0 auto;background:#fff;">
  <!-- Header -->
  <div style="background:linear-gradient(135deg,#E91E63,#F06292);padding:30px 20px;text-align:center;">
    <h1 style="color:#fff;margin:0;font-size:28px;font-weight:700;">Papelaria Bibelô</h1>
    <p style="color:rgba(255,255,255,0.9);margin:5px 0 0;font-size:14px;">Encantando momentos com papelaria</p>
  </div>
  <!-- Content -->
  <div style="padding:30px 25px;">
    ${content}
  </div>
  <!-- Footer -->
  <div style="background:#f9f9f9;padding:20px;text-align:center;border-top:1px solid #eee;">
    <p style="color:#999;font-size:12px;margin:0;">Papelaria Bibelô — Teresina, PI</p>
    <p style="color:#bbb;font-size:11px;margin:5px 0 0;">
      <a href="https://www.papelariabibelo.com.br" style="color:#E91E63;text-decoration:none;">papelariabibelo.com.br</a>
    </p>
  </div>
</div>
</body>
</html>`;
}

// ── Botão CTA ──────────────────────────────────────────────────

function ctaButton(text: string, url: string): string {
  return `<div style="text-align:center;margin:25px 0;">
    <a href="${url}" style="background:#E91E63;color:#fff;padding:14px 32px;text-decoration:none;border-radius:8px;font-size:16px;font-weight:600;display:inline-block;">
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
      const imgUrl = (item.image_url as string) || "";
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
      Nos siga no Instagram: <a href="https://instagram.com/papelariabibelo" style="color:#E91E63;">@papelariabibelo</a>
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

// ── Build email por template name ──────────────────────────────

function buildFlowEmail(nome: string, templateName: string, metadata: Record<string, unknown>): string {
  const lower = (templateName || "").toLowerCase();

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
  return `Novidades da Papelaria Bibelô para você!`;
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
