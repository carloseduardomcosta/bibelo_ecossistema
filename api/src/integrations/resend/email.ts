import { Resend } from "resend";
import { queryOne, query } from "../../db";
import { logger } from "../../utils/logger";
import { gerarLinkDescadastro } from "../../routes/email";
import { sesSendEmail, isSesConfigured } from "../ses/client";

// ── Sanitização HTML (anti-XSS em templates de email) ──────────
function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

// ── Provider ativo (ses ou resend) ──────────────────────────────
export function getEmailProvider(): "ses" | "resend" {
  const provider = (process.env.EMAIL_PROVIDER || "resend").toLowerCase();
  if (provider === "ses" && isSesConfigured()) return "ses";
  return "resend";
}

// ── Client Resend (inicializa só se tiver API key, cached) ──────

let cachedClient: Resend | null = null;

function getClient(): Resend | null {
  if (cachedClient) return cachedClient;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey === "PREENCHER") {
    return null;
  }
  cachedClient = new Resend(apiKey);
  return cachedClient;
}

// ── Verificar se algum provider de email está configurado ───────

export function isEmailConfigured(): boolean {
  if (getEmailProvider() === "ses") return isSesConfigured();
  const key = process.env.RESEND_API_KEY;
  return !!key && key !== "PREENCHER";
}

/** @deprecated Usar isEmailConfigured() */
export function isResendConfigured(): boolean {
  return isEmailConfigured();
}

// ── Enviar email individual (dual provider: SES ou Resend) ──────

interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  tags?: Array<{ name: string; value: string }>;
}

export async function sendEmail(params: SendEmailParams): Promise<{ id: string } | null> {
  // Mock em ambiente de teste
  if (process.env.VITEST === "true" || process.env.MOCK_EMAIL === "true") {
    const fakeId = `mock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    logger.info("Email mock enviado", { id: fakeId, to: params.to, subject: params.subject });
    return { id: fakeId };
  }

  const rawFrom = process.env.EMAIL_FROM || "noreply@papelariabibelo.com.br";
  const from = rawFrom.includes("<") ? rawFrom : `Papelaria Bibelô <${rawFrom}>`;
  const replyTo = params.replyTo || process.env.EMAIL_REPLY_TO || "contato@papelariabibelo.com.br";
  const provider = getEmailProvider();

  // ── SES ────────────────────────────────────────────────────
  if (provider === "ses") {
    try {
      const result = await sesSendEmail({
        from,
        to: params.to,
        subject: params.subject,
        html: params.html,
        text: params.text,
        replyTo,
        tags: params.tags,
      });
      logger.info("Email enviado via SES", { id: result.id, to: params.to, subject: params.subject });
      return result;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro SES";
      logger.error("Erro ao enviar email via SES", { error: msg, to: params.to });
      throw new Error(msg);
    }
  }

  // ── Resend (fallback) ──────────────────────────────────────
  const client = getClient();
  if (!client) {
    logger.warn("Nenhum provider de email configurado", { to: params.to, subject: params.subject });
    return null;
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    const { data, error } = await client.emails.send({
      from,
      to: params.to,
      subject: params.subject,
      html: params.html,
      text: params.text,
      reply_to: replyTo,
      tags: params.tags,
    });

    if (error) {
      const msg = error.message || "";
      const isTemporary = msg.includes("rate") || msg.includes("429") || msg.includes("500") || msg.includes("503") || msg.includes("timeout");

      if (isTemporary && attempt === 0) {
        logger.warn("Resend erro temporário — retentando em 3s", { error: msg, to: params.to });
        await new Promise((r) => setTimeout(r, 3000));
        continue;
      }

      logger.error("Erro ao enviar email via Resend", { error: msg, to: params.to, attempt });
      throw new Error(msg);
    }

    logger.info("Email enviado via Resend", { id: data?.id, to: params.to, subject: params.subject });
    return data ? { id: data.id } : null;
  }

  return null;
}

// ── Enviar campanha para segmento ───────────────────────────────

export async function sendCampaignEmails(campaignId: string): Promise<{ sent: number; failed: number }> {
  if (!isEmailConfigured()) {
    throw new Error("Nenhum provider de email configurado (SES ou Resend)");
  }

  // Busca campanha com template
  const campaign = await queryOne<{
    id: string; nome: string; canal: string;
    template_id: string | null; segment_id: string | null;
  }>(
    "SELECT id, nome, canal, template_id, segment_id FROM marketing.campaigns WHERE id = $1",
    [campaignId]
  );

  if (!campaign) throw new Error("Campanha não encontrada");
  if (campaign.canal !== "email") throw new Error("Campanha não é de email");
  if (!campaign.template_id) throw new Error("Campanha sem template");

  // Busca template
  const template = await queryOne<{
    assunto: string; html: string; texto: string;
  }>(
    "SELECT assunto, html, texto FROM marketing.templates WHERE id = $1 AND ativo = true",
    [campaign.template_id]
  );

  if (!template) throw new Error("Template não encontrado ou inativo");

  // Busca envios pendentes — EXCLUI clientes que fizeram opt-out (LGPD)
  const sends = await query<{
    id: string; customer_id: string; email: string; nome: string;
  }>(
    `SELECT cs.id, cs.customer_id, c.email, c.nome
     FROM marketing.campaign_sends cs
     JOIN crm.customers c ON c.id = cs.customer_id
     WHERE cs.campaign_id = $1 AND cs.status = 'pendente' AND c.email IS NOT NULL
       AND c.email_optout = false`,
    [campaignId]
  );

  // Marca opt-out como "ignorado" nos sends
  await query(
    `UPDATE marketing.campaign_sends SET status = 'ignorado'
     WHERE campaign_id = $1 AND status = 'pendente'
       AND customer_id IN (SELECT id FROM crm.customers WHERE email_optout = true)`,
    [campaignId]
  );

  let sent = 0;
  let failed = 0;

  for (const send of sends) {
    try {
      // Substitui variáveis no template (inclui link de descadastro LGPD)
      const unsubLink = gerarLinkDescadastro(send.email);
      const nomeSeguro = escHtml(send.nome || "Cliente");
      const emailSeguro = escHtml(send.email);

      const html = (template.html || "")
        .replace(/\{\{nome\}\}/g, nomeSeguro)
        .replace(/\{\{email\}\}/g, emailSeguro)
        .replace(/\{\{unsub_link\}\}/g, unsubLink);

      const subject = (template.assunto || campaign.nome)
        .replace(/\{\{nome\}\}/g, send.nome || "Cliente");

      const result = await sendEmail({
        to: send.email,
        subject,
        html,
        text: template.texto?.replace(/\{\{nome\}\}/g, send.nome || "Cliente"),
        tags: [
          { name: "campaign_id", value: campaignId },
          { name: "customer_id", value: send.customer_id },
        ],
      });

      await query(
        `UPDATE marketing.campaign_sends
         SET status = 'enviado', message_id = $2, enviado_em = NOW()
         WHERE id = $1`,
        [send.id, result?.id || null]
      );

      sent++;

      // Pequeno delay para não estourar rate limit do Resend
      await new Promise((r) => setTimeout(r, 100));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro";
      logger.error("Falha ao enviar email de campanha", {
        sendId: send.id, email: send.email, error: msg,
      });

      await query(
        "UPDATE marketing.campaign_sends SET status = 'erro' WHERE id = $1",
        [send.id]
      );

      failed++;
    }
  }

  // Atualiza totais da campanha — marca concluída quando não há mais pendentes
  const pendentes = await queryOne<{ count: number }>(
    "SELECT COUNT(*)::int AS count FROM marketing.campaign_sends WHERE campaign_id = $1 AND status = 'pendente'",
    [campaignId]
  );

  await query(
    `UPDATE marketing.campaigns
     SET total_envios = total_envios + $2,
         status = CASE WHEN $3 = 0 THEN 'concluida' ELSE status END,
         atualizado_em = NOW()
     WHERE id = $1`,
    [campaignId, sent, pendentes?.count || 0]
  );

  logger.info("Campanha de email processada", { campaignId, sent, failed });
  return { sent, failed };
}

// ── Status da integração ────────────────────────────────────────

export async function getResendStatus(): Promise<{
  configured: boolean;
  provider: string;
  from: string;
  reply_to: string;
  plan_limit: string;
}> {
  const provider = getEmailProvider();
  return {
    configured: isEmailConfigured(),
    provider,
    from: process.env.EMAIL_FROM || "noreply@papelariabibelo.com.br",
    reply_to: process.env.EMAIL_REPLY_TO || "contato@papelariabibelo.com.br",
    plan_limit: provider === "ses" ? "Ilimitado (pay-per-use)" : "3.000 emails/mes (gratis)",
  };
}
