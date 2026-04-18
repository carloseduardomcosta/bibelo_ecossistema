import { Router, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { query, queryOne } from "../../db";
import { logger } from "../../utils/logger";

export const evolutionWebhookRouter = Router();

const limiter = rateLimit({ windowMs: 60_000, max: 300, standardHeaders: true, legacyHeaders: false });

// Formata JID WhatsApp → telefone limpo: "5547999999999@s.whatsapp.net" → "5547999999999"
function jidToPhone(jid: string): string {
  return jid.replace(/@s\.whatsapp\.net$/, "").replace(/@.*$/, "");
}

// Busca nome do contato na Evolution API
async function fetchContactName(phone: string): Promise<string | null> {
  const url = process.env.EVOLUTION_API_URL;
  const key = process.env.EVOLUTION_API_KEY;
  const instance = process.env.EVOLUTION_INSTANCE;
  if (!url || !key || !instance) return null;

  try {
    const res = await fetch(`${url}/chat/fetchProfile/${instance}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": key },
      body: JSON.stringify({ number: phone }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = await res.json() as { pushName?: string; name?: string };
    return data.pushName || data.name || null;
  } catch {
    return null;
  }
}

// Valida que o evento veio da instância correta
function autenticar(req: Request): boolean {
  const apikey = req.headers["apikey"] as string | undefined;
  const expected = process.env.EVOLUTION_API_KEY;
  if (!expected) return false;
  return apikey === expected;
}

// POST /api/webhooks/evolution
evolutionWebhookRouter.post("/", limiter, async (req: Request, res: Response) => {
  if (!autenticar(req)) {
    logger.warn("Evolution webhook: apikey inválida");
    return res.status(401).json({ error: "Não autorizado" });
  }

  const { event, data } = req.body as {
    event?: string;
    data?: {
      id?: string;
      participants?: string[];
      action?: string;
    };
  };

  res.status(200).json({ ok: true });

  if (event !== "GROUP_PARTICIPANTS_UPDATE") return;
  if (data?.action !== "add") return;

  const grupoEsperado = process.env.EVOLUTION_CLUBE_VIP_GROUP_JID;
  if (grupoEsperado && data?.id !== grupoEsperado) return;

  const participants = data?.participants ?? [];

  for (const jid of participants) {
    if (!jid.endsWith("@s.whatsapp.net")) continue;

    const telefone = jidToPhone(jid);

    try {
      // Verifica se já existe por whatsapp_jid ou telefone
      const existente = await queryOne<{ id: string }>(
        `SELECT id FROM crm.customers
         WHERE whatsapp_jid = $1 OR telefone = $2
         LIMIT 1`,
        [jid, telefone]
      );

      if (existente) {
        // Só atualiza o JID se ainda não tinha
        await query(
          `UPDATE crm.customers
           SET whatsapp_jid = COALESCE(whatsapp_jid, $1), atualizado_em = NOW()
           WHERE id = $2`,
          [jid, existente.id]
        );
        await query(
          `INSERT INTO crm.interactions (customer_id, tipo, canal, descricao, metadata)
           VALUES ($1, 'whatsapp_grupo', 'whatsapp', 'Entrou no Clube VIP', $2::jsonb)`,
          [existente.id, JSON.stringify({ grupo_jid: data?.id, action: "add" })]
        );
        logger.info("Evolution: membro do Clube VIP vinculado ao customer existente", { telefone, customerId: existente.id });
        continue;
      }

      // Novo contato — tenta buscar nome na Evolution
      const nome = await fetchContactName(telefone);

      const novo = await queryOne<{ id: string }>(
        `INSERT INTO crm.customers
           (nome, telefone, whatsapp_jid, canal_origem, ativo)
         VALUES ($1, $2, $3, 'whatsapp_clube_vip', true)
         RETURNING id`,
        [nome ?? `WhatsApp ${telefone}`, telefone, jid]
      );

      if (novo) {
        await query(
          `INSERT INTO crm.interactions (customer_id, tipo, canal, descricao, metadata)
           VALUES ($1, 'whatsapp_grupo', 'whatsapp', 'Entrou no Clube VIP', $2::jsonb)`,
          [novo.id, JSON.stringify({ grupo_jid: data?.id, action: "add", nome_whatsapp: nome })]
        );
        logger.info("Evolution: novo membro do Clube VIP salvo", { telefone, nome, customerId: novo.id });
      }
    } catch (err) {
      logger.error("Evolution webhook: erro ao processar participante", { jid, err });
    }
  }
});
