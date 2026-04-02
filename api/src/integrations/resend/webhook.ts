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

// ── Helper: registrar evento detalhado em marketing.email_events ──
async function registrarEvento(
  send: { id: string; campaign_id: string; customer_id: string },
  messageId: string,
  tipo: string,
  link?: string,
) {
  await query(
    `INSERT INTO marketing.email_events (campaign_send_id, campaign_id, customer_id, message_id, tipo, link)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [send.id, send.campaign_id, send.customer_id, messageId, tipo, link || null],
  );
}

// ── Fallback: registrar evento para emails de fluxo (sem campanha) ──
async function registrarEventoFluxo(
  messageId: string,
  tipo: string,
  link?: string,
): Promise<boolean> {
  const flowStep = await queryOne<{ customer_id: string }>(
    `SELECT fe.customer_id
     FROM marketing.flow_step_executions fse
     JOIN marketing.flow_executions fe ON fe.id = fse.execution_id
     WHERE fse.resultado->>'messageId' = $1
     LIMIT 1`,
    [messageId],
  );
  if (!flowStep) return false;

  await query(
    `INSERT INTO marketing.email_events (customer_id, message_id, tipo, link)
     VALUES ($1, $2, $3, $4)`,
    [flowStep.customer_id, messageId, tipo, link || null],
  );
  return true;
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
        // Buscar send pelo message_id
        const send = await queryOne<{ id: string; campaign_id: string; customer_id: string }>(
          `SELECT id, campaign_id, customer_id FROM marketing.campaign_sends WHERE message_id = $1`,
          [emailId],
        );

        if (send) {
          // Registrar evento detalhado (cada abertura)
          await registrarEvento(send, emailId, "opened");

          // Atualizar primeira abertura no resumo
          await query(
            `UPDATE marketing.campaign_sends SET aberto_em = COALESCE(aberto_em, NOW()) WHERE id = $1`,
            [send.id],
          );

          // Recalcular total_abertos da campanha
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
        } else {
          // Fallback: email de fluxo automático
          const tracked = await registrarEventoFluxo(emailId, "opened");
          if (tracked) logger.info("Resend webhook: flow email aberto", { emailId });
        }
        break;
      }

      case "email.clicked": {
        const clickedLink = data.click?.link || null;

        // Buscar send pelo message_id
        const send = await queryOne<{ id: string; campaign_id: string; customer_id: string }>(
          `SELECT id, campaign_id, customer_id FROM marketing.campaign_sends WHERE message_id = $1`,
          [emailId],
        );

        if (send) {
          // Registrar evento detalhado com o link clicado
          await registrarEvento(send, emailId, "clicked", clickedLink || undefined);

          // Atualizar primeiro clique no resumo
          await query(
            `UPDATE marketing.campaign_sends SET clicado_em = COALESCE(clicado_em, NOW()) WHERE id = $1`,
            [send.id],
          );

          // Recalcular total_cliques da campanha
          await query(
            `UPDATE marketing.campaigns
             SET total_cliques = (
               SELECT COUNT(DISTINCT cs.id) FROM marketing.campaign_sends cs
               WHERE cs.campaign_id = $1 AND cs.clicado_em IS NOT NULL
             )
             WHERE id = $1`,
            [send.campaign_id],
          );
          logger.info("Resend webhook: link clicado", {
            emailId,
            campaignId: send.campaign_id,
            link: clickedLink,
          });
        } else {
          // Fallback: email de fluxo automático
          const tracked = await registrarEventoFluxo(emailId, "clicked", clickedLink || undefined);
          if (tracked) logger.info("Resend webhook: flow link clicado", { emailId, link: clickedLink });
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
          await registrarEvento(send, emailId, "bounced");
          logger.warn("Resend webhook: email bounce", {
            emailId,
            campaignId: send.campaign_id,
          });
        } else {
          const tracked = await registrarEventoFluxo(emailId, "bounced");
          if (tracked) logger.warn("Resend webhook: flow email bounce", { emailId });
        }
        break;
      }

      case "email.complained": {
        // Spam complaint → opt-out automático (LGPD)
        const send = await queryOne<{ id: string; campaign_id: string; customer_id: string }>(
          `UPDATE marketing.campaign_sends
           SET status = 'spam'
           WHERE message_id = $1
           RETURNING id, campaign_id, customer_id`,
          [emailId],
        );

        if (send) {
          await registrarEvento(send, emailId, "complained");
          // Ativar opt-out para respeitar o complaint
          await query(
            `UPDATE crm.customers SET email_optout = true WHERE id = $1`,
            [send.customer_id],
          );
          logger.warn("Resend webhook: spam complaint → opt-out ativado", {
            emailId,
            customerId: send.customer_id,
          });
        } else {
          // Fluxo: spam complaint também ativa opt-out
          const flowStep = await queryOne<{ customer_id: string }>(
            `SELECT fe.customer_id
             FROM marketing.flow_step_executions fse
             JOIN marketing.flow_executions fe ON fe.id = fse.execution_id
             WHERE fse.resultado->>'messageId' = $1 LIMIT 1`,
            [emailId],
          );
          if (flowStep) {
            await query(
              `INSERT INTO marketing.email_events (customer_id, message_id, tipo) VALUES ($1, $2, 'complained')`,
              [flowStep.customer_id, emailId],
            );
            await query(`UPDATE crm.customers SET email_optout = true WHERE id = $1`, [flowStep.customer_id]);
            logger.warn("Resend webhook: flow spam complaint → opt-out ativado", { emailId, customerId: flowStep.customer_id });
          }
        }
        break;
      }

      case "email.delivered": {
        // Buscar send para registrar evento
        const send = await queryOne<{ id: string; campaign_id: string; customer_id: string }>(
          `UPDATE marketing.campaign_sends
           SET status = 'entregue'
           WHERE message_id = $1 AND status = 'enviado'
           RETURNING id, campaign_id, customer_id`,
          [emailId],
        );

        if (send) {
          await registrarEvento(send, emailId, "delivered");
        } else {
          await registrarEventoFluxo(emailId, "delivered");
        }
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
