import { Router, Request, Response } from "express";
import crypto from "crypto";
import { query } from "../../db";
import { logger } from "../../utils/logger";
import { normalizarTelefone } from "./waha";

export const wahaWebhookRouter = Router();

// ── HMAC validation (WAHA envia X-Webhook-Hmac-Token com sha512) ──

function validarHmac(req: Request): boolean {
  const key = process.env.WAHA_WEBHOOK_HMAC_KEY || "";
  if (!key) return true; // sem chave configurada = sem validação (aceita tudo)

  const token = req.headers["x-webhook-hmac-token"] as string | undefined;
  if (!token) return false;

  const expected = crypto
    .createHmac("sha512", key)
    .update((req as any).rawBody ?? Buffer.alloc(0))
    .digest("hex");

  try {
    const a = Buffer.from(expected);
    const b = Buffer.from(token);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// ── Tipos do payload WAHA ─────────────────────────────────────────

type WahaParticipant = { id: string; phoneNumber?: string };

type WahaWebhookBody = {
  event?: string;
  payload?: {
    id?: string;       // JID do grupo
    action?: string;   // "add" | "remove" | "promote" | "demote"
    participants?: WahaParticipant[];
  };
};

// ── Handler ──────────────────────────────────────────────────────

wahaWebhookRouter.post("/", async (req: Request, res: Response) => {
  if (!validarHmac(req)) {
    logger.warn("WAHA webhook: assinatura inválida", {
      ip: req.ip,
      hmacHeader: req.headers["x-webhook-hmac-token"] ? "presente" : "ausente",
    });
    return res.status(401).json({ error: "Assinatura inválida" });
  }

  // Responde imediatamente — processamento em background
  res.json({ ok: true });

  const body = req.body as WahaWebhookBody;

  if (body?.event !== "group.v2.participants") return;

  const grupoVipJid = process.env.WAHA_GRUPO_VIP_JID || "";
  if (!grupoVipJid || body.payload?.id !== grupoVipJid) return;

  const action       = body.payload?.action;
  const participants = body.payload?.participants ?? [];

  // Apenas add/remove alteram membership. promote/demote = mudança de admin
  if (action !== "add" && action !== "remove") return;

  const isVip = action === "add";

  for (const p of participants) {
    // phoneNumber = "5547XXXXXXXX@s.whatsapp.net" (modo LID — preferencial)
    // id          = "5547XXXXXXXX@c.us"           (modo clássico)
    const raw = p.phoneNumber
      ? p.phoneNumber.split("@")[0]
      : p.id.includes("@lid") ? null : p.id.split("@")[0];

    if (!raw) continue;

    const n = normalizarTelefone(raw);
    if (!n) continue;

    // Busca por número normalizado com DDI ou sem DDI
    const semDdi = n.startsWith("55") ? n.slice(2) : n;

    const customers = await query<{ id: string }>(
      `SELECT id FROM crm.customers
       WHERE telefone IS NOT NULL
         AND (
           REGEXP_REPLACE(telefone, '[^0-9]', '', 'g') = $1
           OR REGEXP_REPLACE(telefone, '[^0-9]', '', 'g') = $2
         )`,
      [n, semDdi],
    );

    for (const c of customers) {
      await query(
        `UPDATE crm.customers
         SET vip_grupo_wp = $2, vip_grupo_wp_em = NOW()
         WHERE id = $1`,
        [c.id, isVip],
      );
      logger.info("WAHA webhook: vip_grupo_wp atualizado", {
        customerId: c.id,
        vip: isVip,
        action,
      });
    }

    if (customers.length === 0) {
      logger.info("WAHA webhook: nenhum cliente encontrado para o número", { n });
    }
  }
});
