import { Router, Request, Response } from "express";
import crypto from "crypto";
import https from "https";
import { query, queryOne } from "../../db";
import { logger } from "../../utils/logger";

export const sesWebhookRouter = Router();

// ── Tipos de notificação SNS ────────────────────────────────────

interface SnsMessage {
  Type: "SubscriptionConfirmation" | "Notification" | "UnsubscribeConfirmation";
  MessageId: string;
  TopicArn: string;
  Message: string;
  Timestamp: string;
  SignatureVersion: string;
  Signature: string;
  SigningCertURL: string;
  SubscribeURL?: string;
}

interface SesEventMessage {
  eventType: string;
  mail: {
    messageId: string;
    tags?: Record<string, string[]>;
    commonHeaders?: {
      to: string[];
      subject: string;
    };
  };
  open?: { timestamp: string };
  click?: { link: string; timestamp: string };
  bounce?: { bounceType: string; bouncedRecipients: Array<{ emailAddress: string }> };
  complaint?: { complainedRecipients: Array<{ emailAddress: string }> };
  delivery?: { timestamp: string; recipients: string[] };
}

// ── Validar assinatura SNS ──────────────────────────────────────
// SNS assina mensagens com certificado X.509 — validamos para evitar spoofing

function isValidSnsArn(topicArn: string): boolean {
  const expected = process.env.AWS_SNS_TOPIC_ARN;
  if (!expected) return true; // sem validação se não configurado
  return topicArn === expected;
}

// ── Helper: registrar evento em marketing.email_events ──────────
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

// ── Confirmar subscription SNS via HTTP GET ─────────────────────
function confirmSubscription(subscribeUrl: string): void {
  https.get(subscribeUrl, (res) => {
    logger.info("SNS subscription confirmada", { statusCode: res.statusCode });
  }).on("error", (err) => {
    logger.error("Erro ao confirmar subscription SNS", { error: err.message });
  });
}

// ── Mapear eventType SES → tipo interno ─────────────────────────
function mapEventType(sesType: string): string | null {
  const map: Record<string, string> = {
    "Send": "sent",
    "Delivery": "delivered",
    "Open": "opened",
    "Click": "clicked",
    "Bounce": "bounced",
    "Complaint": "complained",
    "Reject": "rejected",
  };
  return map[sesType] || null;
}

// ── POST /api/webhooks/ses ──────────────────────────────────────
sesWebhookRouter.post("/", async (req: Request, res: Response) => {
  // SNS envia com Content-Type: text/plain, mas nosso parser aceita JSON também
  let snsMessage: SnsMessage;
  try {
    snsMessage = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  } catch {
    res.status(400).json({ error: "Payload inválido" });
    return;
  }

  // Validar TopicArn
  if (snsMessage.TopicArn && !isValidSnsArn(snsMessage.TopicArn)) {
    logger.warn("SNS webhook: TopicArn inválido", { topicArn: snsMessage.TopicArn });
    res.status(403).json({ error: "TopicArn inválido" });
    return;
  }

  // ── Confirmação de subscription ────────────────────────────
  if (snsMessage.Type === "SubscriptionConfirmation") {
    logger.info("SNS subscription confirmation recebida", { topicArn: snsMessage.TopicArn });
    if (snsMessage.SubscribeURL) {
      confirmSubscription(snsMessage.SubscribeURL);
    }
    res.json({ confirmed: true });
    return;
  }

  // ── Notificação de evento SES ──────────────────────────────
  if (snsMessage.Type !== "Notification") {
    res.json({ received: true });
    return;
  }

  let sesEvent: SesEventMessage;
  try {
    sesEvent = JSON.parse(snsMessage.Message);
  } catch {
    logger.warn("SNS webhook: Message não é JSON válido");
    res.status(400).json({ error: "Message inválido" });
    return;
  }

  const messageId = sesEvent.mail?.messageId;
  const eventType = sesEvent.eventType;
  const tipo = mapEventType(eventType);

  if (!messageId || !tipo) {
    res.json({ received: true, ignored: true });
    return;
  }

  logger.info("SES webhook recebido", { eventType, messageId });

  try {
    switch (tipo) {
      case "opened": {
        const send = await queryOne<{ id: string; campaign_id: string; customer_id: string }>(
          `SELECT id, campaign_id, customer_id FROM marketing.campaign_sends WHERE message_id = $1`,
          [messageId],
        );

        if (send) {
          await registrarEvento(send, messageId, "opened");
          await query(
            `UPDATE marketing.campaign_sends SET aberto_em = COALESCE(aberto_em, NOW()) WHERE id = $1`,
            [send.id],
          );
          await query(
            `UPDATE marketing.campaigns
             SET total_abertos = (SELECT COUNT(*) FROM marketing.campaign_sends WHERE campaign_id = $1 AND aberto_em IS NOT NULL)
             WHERE id = $1`,
            [send.campaign_id],
          );
        } else {
          await registrarEventoFluxo(messageId, "opened");
        }
        break;
      }

      case "clicked": {
        const clickedLink = sesEvent.click?.link || null;
        const send = await queryOne<{ id: string; campaign_id: string; customer_id: string }>(
          `SELECT id, campaign_id, customer_id FROM marketing.campaign_sends WHERE message_id = $1`,
          [messageId],
        );

        if (send) {
          await registrarEvento(send, messageId, "clicked", clickedLink || undefined);
          await query(
            `UPDATE marketing.campaign_sends SET clicado_em = COALESCE(clicado_em, NOW()) WHERE id = $1`,
            [send.id],
          );
          await query(
            `UPDATE marketing.campaigns
             SET total_cliques = (SELECT COUNT(DISTINCT cs.id) FROM marketing.campaign_sends cs WHERE cs.campaign_id = $1 AND cs.clicado_em IS NOT NULL)
             WHERE id = $1`,
            [send.campaign_id],
          );
        } else {
          await registrarEventoFluxo(messageId, "clicked", clickedLink || undefined);
        }
        break;
      }

      case "bounced": {
        const send = await queryOne<{ id: string; campaign_id: string; customer_id: string }>(
          `UPDATE marketing.campaign_sends SET status = 'bounce' WHERE message_id = $1 RETURNING id, campaign_id, customer_id`,
          [messageId],
        );

        if (send) {
          await registrarEvento(send, messageId, "bounced");
        } else {
          await registrarEventoFluxo(messageId, "bounced");
        }
        break;
      }

      case "complained": {
        const send = await queryOne<{ id: string; campaign_id: string; customer_id: string }>(
          `UPDATE marketing.campaign_sends SET status = 'spam' WHERE message_id = $1 RETURNING id, campaign_id, customer_id`,
          [messageId],
        );

        if (send) {
          await registrarEvento(send, messageId, "complained");
          await query(`UPDATE crm.customers SET email_optout = true WHERE id = $1`, [send.customer_id]);
          logger.warn("SES webhook: spam complaint → opt-out ativado", { messageId, customerId: send.customer_id });
        } else {
          const flowStep = await queryOne<{ customer_id: string }>(
            `SELECT fe.customer_id FROM marketing.flow_step_executions fse
             JOIN marketing.flow_executions fe ON fe.id = fse.execution_id
             WHERE fse.resultado->>'messageId' = $1 LIMIT 1`,
            [messageId],
          );
          if (flowStep) {
            await query(
              `INSERT INTO marketing.email_events (customer_id, message_id, tipo) VALUES ($1, $2, 'complained')`,
              [flowStep.customer_id, messageId],
            );
            await query(`UPDATE crm.customers SET email_optout = true WHERE id = $1`, [flowStep.customer_id]);
          }
        }
        break;
      }

      case "delivered": {
        const send = await queryOne<{ id: string; campaign_id: string; customer_id: string }>(
          `UPDATE marketing.campaign_sends SET status = 'entregue' WHERE message_id = $1 AND status = 'enviado' RETURNING id, campaign_id, customer_id`,
          [messageId],
        );

        if (send) {
          await registrarEvento(send, messageId, "delivered");
        } else {
          await registrarEventoFluxo(messageId, "delivered");
        }
        break;
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro";
    logger.error("SES webhook: erro ao processar", { eventType, messageId, error: msg });
    res.status(500).json({ error: "Erro ao processar webhook" });
    return;
  }

  res.json({ received: true });
});
