import { SESv2Client, SendEmailCommand, GetAccountCommand } from "@aws-sdk/client-sesv2";
import { logger } from "../../utils/logger";

// ── Client SES v2 (cached) ─────────────────────────────────────

let cachedClient: SESv2Client | null = null;

function getClient(): SESv2Client | null {
  if (cachedClient) return cachedClient;
  const accessKeyId = process.env.AWS_SES_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SES_SECRET_ACCESS_KEY;
  const region = process.env.AWS_SES_REGION || "sa-east-1";

  if (!accessKeyId || !secretAccessKey) return null;

  cachedClient = new SESv2Client({
    region,
    credentials: { accessKeyId, secretAccessKey },
  });
  return cachedClient;
}

export function isSesConfigured(): boolean {
  return !!process.env.AWS_SES_ACCESS_KEY_ID && !!process.env.AWS_SES_SECRET_ACCESS_KEY;
}

// ── Enviar email via SES ────────────────────────────────────────

interface SesSendParams {
  from: string;
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  tags?: Array<{ name: string; value: string }>;
}

export async function sesSendEmail(params: SesSendParams): Promise<{ id: string }> {
  const client = getClient();
  if (!client) throw new Error("AWS SES não configurado");

  const configSet = process.env.AWS_SES_CONFIGURATION_SET || "bibelocrm-tracking";

  // Tags SES: máx 50, key/value alfanumérico + _ - . (sem espaços)
  const sesTags = (params.tags || []).map((t) => ({
    Name: t.name.replace(/[^a-zA-Z0-9_\-.]/g, "_"),
    Value: t.value.replace(/[^a-zA-Z0-9_\-.]/g, "_"),
  }));

  const command = new SendEmailCommand({
    FromEmailAddress: params.from,
    Destination: { ToAddresses: [params.to] },
    ReplyToAddresses: params.replyTo ? [params.replyTo] : undefined,
    Content: {
      Simple: {
        Subject: { Data: params.subject, Charset: "UTF-8" },
        Body: {
          Html: { Data: params.html, Charset: "UTF-8" },
          ...(params.text ? { Text: { Data: params.text, Charset: "UTF-8" } } : {}),
        },
      },
    },
    EmailTags: sesTags,
    ConfigurationSetName: configSet,
  });

  // Retry 1x em erro temporário
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await client.send(command);
      const messageId = result.MessageId || `ses-${Date.now()}`;
      return { id: messageId };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro SES";
      const isTemporary = msg.includes("Throttling") || msg.includes("ServiceUnavailable") || msg.includes("TooManyRequests");

      if (isTemporary && attempt === 0) {
        logger.warn("SES erro temporário — retentando em 3s", { error: msg, to: params.to });
        await new Promise((r) => setTimeout(r, 3000));
        continue;
      }
      throw err;
    }
  }

  throw new Error("SES: falha após retries");
}

// ── Consultar cota e uso da conta ───────────────────────────────

export interface SesAccountStats {
  maxSendRate: number;       // emails/segundo
  max24HourSend: number;     // cota 24h
  sentLast24Hours: number;   // enviados nas últimas 24h
  sendingEnabled: boolean;
  productionAccess: boolean;
}

export async function getSesAccountStats(): Promise<SesAccountStats | null> {
  const client = getClient();
  if (!client) return null;

  try {
    const result = await client.send(new GetAccountCommand({}));
    return {
      maxSendRate: result.SendQuota?.MaxSendRate || 0,
      max24HourSend: result.SendQuota?.Max24HourSend || 0,
      sentLast24Hours: result.SendQuota?.SentLast24Hours || 0,
      sendingEnabled: result.SendingEnabled || false,
      productionAccess: result.ProductionAccessEnabled || false,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro";
    logger.error("Erro ao consultar conta SES", { error: msg });
    return null;
  }
}
