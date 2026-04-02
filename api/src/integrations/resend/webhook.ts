import { Router, Request, Response } from "express";
import crypto from "crypto";
import { query, queryOne } from "../../db";
import { logger } from "../../utils/logger";

export const resendWebhookRouter = Router();

// ── Tipos de evento do Resend ─────────────────────────────────
// Docs: https://resend.com/docs/dashboard/webhooks/introduction
// Eventos: email.sent, email.delivered, email.opened, email.clicked,
//          email.bounced, email.complained, email.delivery_delayed

interface ResendWebhookPayload {
  type: string;
  created_at: string;
  data: {
    email_id: string;
    from: string;
    to: string[];
    subject: string;
    created_at: string;
    tags?: Record<string, string>;
    click?: { link: string };
  };
}

// ── Verificação Svix (Resend usa Svix para assinar webhooks) ──
// Headers: svix-id, svix-timestamp, svix-signature (formato: "v1,<base64>")
// Payload assinado: "{svix-id}.{svix-timestamp}.{body}"
// Secret: "whsec_..." → base64 decode da parte após "whsec_"
function verifySvixSignature(body: string, headers: Record<string, string | string[] | undefined>): boolean {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return true; // sem secret, aceita (dev)

  const svixId = headers["svix-id"] as string;
  const svixTimestamp = headers["svix-timestamp"] as string;
  const svixSignature = headers["svix-signature"] as string;

  if (!svixId || !svixTimestamp || !svixSignature) return false;

  // Tolerância de timestamp: 5 minutos
  const ts = parseInt(svixTimestamp, 10);
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > 300) return false;

  // Decodificar secret (remove prefixo "whsec_" e decodifica base64)
  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ""), "base64");

  // Assinar: "{svix-id}.{svix-timestamp}.{body}"
  const toSign = `${svixId}.${svixTimestamp}.${body}`;
  const expected = crypto.createHmac("sha256", secretBytes).update(toSign).digest("base64");

  // svix-signature pode ter múltiplas assinaturas: "v1,<sig1> v1,<sig2>"
  const signatures = svixSignature.split(" ");
  for (const sig of signatures) {
    const [version, value] = sig.split(",", 2);
    if (version !== "v1" || !value) continue;
    try {
      if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(value))) {
        return true;
      }
    } catch { /* tamanhos diferentes */ }
  }
  return false;
}

// ── POST /api/webhooks/resend ─────────────────────────────────
resendWebhookRouter.post("/", async (req: Request, res: Response) => {
  const rawBody = JSON.stringify(req.body);

  // Verificar assinatura Svix se secret configurado
  if (process.env.RESEND_WEBHOOK_SECRET && !verifySvixSignature(rawBody, req.headers)) {
    logger.warn("Resend webhook: assinatura Svix inválida");
    res.status(401).json({ error: "Assinatura inválida" });
    return;
  }

  const payload = req.body as ResendWebhookPayload;
  const { type, data } = payload;

  if (!type || !data?.email_id) {
    res.status(400).json({ error: "Payload inválido" });
    return;
  }

  const emailId = data.email_id;

  logger.info("Resend webhook recebido", {
    type,
    emailId,
    to: data.to?.[0],
  });

  try {
    switch (type) {
      case "email.opened": {
        // Atualizar campaign_sends
        const send = await queryOne<{ id: string; campaign_id: string }>(
          `UPDATE marketing.campaign_sends
           SET aberto_em = COALESCE(aberto_em, NOW())
           WHERE message_id = $1 AND aberto_em IS NULL
           RETURNING id, campaign_id`,
          [emailId],
        );

        if (send) {
          // Incrementar total_abertos da campanha
          await query(
            `UPDATE marketing.campaigns
             SET total_abertos = (
               SELECT COUNT(*) FROM marketing.campaign_sends
               WHERE campaign_id = $1 AND aberto_em IS NOT NULL
             )
             WHERE id = $1`,
            [send.campaign_id],
          );
          logger.info("Resend webhook: email aberto", {
            emailId,
            campaignId: send.campaign_id,
          });
        }
        break;
      }

      case "email.clicked": {
        // Atualizar campaign_sends
        const send = await queryOne<{ id: string; campaign_id: string }>(
          `UPDATE marketing.campaign_sends
           SET clicado_em = COALESCE(clicado_em, NOW())
           WHERE message_id = $1 AND clicado_em IS NULL
           RETURNING id, campaign_id`,
          [emailId],
        );

        if (send) {
          // Incrementar total_cliques da campanha
          await query(
            `UPDATE marketing.campaigns
             SET total_cliques = (
               SELECT COUNT(*) FROM marketing.campaign_sends
               WHERE campaign_id = $1 AND clicado_em IS NOT NULL
             )
             WHERE id = $1`,
            [send.campaign_id],
          );
          logger.info("Resend webhook: link clicado", {
            emailId,
            campaignId: send.campaign_id,
            link: data.click?.link,
          });
        }
        break;
      }

      case "email.bounced": {
        // Marcar como bounce
        const send = await queryOne<{ id: string; campaign_id: string; customer_id: string }>(
          `UPDATE marketing.campaign_sends
           SET status = 'bounce'
           WHERE message_id = $1
           RETURNING id, campaign_id, customer_id`,
          [emailId],
        );

        if (send) {
          logger.warn("Resend webhook: email bounce", {
            emailId,
            campaignId: send.campaign_id,
          });
        }
        break;
      }

      case "email.complained": {
        // Spam complaint → opt-out automático (LGPD)
        const send = await queryOne<{ id: string; customer_id: string }>(
          `UPDATE marketing.campaign_sends
           SET status = 'spam'
           WHERE message_id = $1
           RETURNING id, customer_id`,
          [emailId],
        );

        if (send) {
          // Ativar opt-out para respeitar o complaint
          await query(
            `UPDATE crm.customers SET email_optout = true WHERE id = $1`,
            [send.customer_id],
          );
          logger.warn("Resend webhook: spam complaint → opt-out ativado", {
            emailId,
            customerId: send.customer_id,
          });
        }
        break;
      }

      case "email.delivered": {
        // Atualizar status para entregue
        await query(
          `UPDATE marketing.campaign_sends
           SET status = 'entregue'
           WHERE message_id = $1 AND status = 'enviado'`,
          [emailId],
        );
        break;
      }

      default:
        logger.info("Resend webhook: evento ignorado", { type });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    logger.error("Resend webhook: erro ao processar", { type, emailId, error: msg });
    res.status(500).json({ error: "Erro ao processar webhook" });
    return;
  }

  res.json({ received: true });
});
