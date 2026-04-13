import crypto from "crypto";
import axios from "axios";
import { logger } from "../../utils/logger";

// ── Meta Conversions API (server-side events) ─────────────────
// Envia eventos de conversão direto ao Meta — não depende do pixel
// do cliente (resistente a bloqueadores de anúncio e iOS privacy).

const META_GRAPH_URL = "https://graph.facebook.com/v25.0";
const PIXEL_ID = process.env.META_PIXEL_ID || "1380166206444041";

function hashSHA256(value: string): string {
  return crypto.createHash("sha256").update(value.toLowerCase().trim()).digest("hex");
}

export type ConversionsEventName = "Purchase" | "AddToCart" | "InitiateCheckout";

export interface ConversionsEventData {
  email?: string;
  phone?: string;
  orderId?: string;
  value?: number;
  currency?: string;
  contentIds?: string[];
  contentName?: string;
  numItems?: number;
  /** IP real do cliente — melhora match rate */
  clientIp?: string;
  /** user-agent do cliente — melhora match rate */
  userAgent?: string;
  /** URL onde o evento ocorreu */
  eventSourceUrl?: string;
}

export async function sendMetaConversionEvent(
  eventName: ConversionsEventName,
  data: ConversionsEventData,
): Promise<void> {
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) return;

  const userData: Record<string, string | undefined> = {};
  if (data.email) userData.em = hashSHA256(data.email);
  if (data.phone) userData.ph = hashSHA256(data.phone.replace(/\D/g, ""));
  if (data.clientIp) userData.client_ip_address = data.clientIp;
  if (data.userAgent) userData.client_user_agent = data.userAgent;

  // Remover campos undefined para não enviar ruído ao Meta
  const cleanUserData = Object.fromEntries(
    Object.entries(userData).filter(([, v]) => v !== undefined),
  ) as Record<string, string>;

  const event: Record<string, unknown> = {
    event_name: eventName,
    event_time: Math.floor(Date.now() / 1000),
    action_source: "website",
    user_data: cleanUserData,
    custom_data: {
      currency: data.currency || "BRL",
      value: data.value ?? 0,
      ...(data.orderId && { order_id: data.orderId }),
      ...(data.contentIds?.length && { content_ids: data.contentIds }),
      ...(data.contentName && { content_name: data.contentName }),
      ...(data.numItems && { num_items: data.numItems }),
    },
  };

  if (data.eventSourceUrl) event.event_source_url = data.eventSourceUrl;

  try {
    await axios.post(
      `${META_GRAPH_URL}/${PIXEL_ID}/events`,
      { data: [event], access_token: token },
      { timeout: 10000 },
    );
    logger.info(`Meta CAPI: ${eventName} enviado`, {
      orderId: data.orderId,
      value: data.value,
      hasEmail: !!data.email,
    });
  } catch (err: unknown) {
    // Nunca relança — evento de analytics não deve interromper o fluxo principal
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    logger.error(`Meta CAPI: falha ao enviar ${eventName}`, { error: msg });
  }
}
