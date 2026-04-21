/**
 * WAHA — WhatsApp HTTP API (read-only)
 *
 * NUNCA enviar mensagens por aqui. Uso exclusivo: verificar membros do grupo VIP.
 *
 * Anti-ban:
 *  - Cache da lista de membros no Redis por 30 min (max ~2 chamadas/hora)
 *  - Cache por membro no banco (coluna vip_grupo_wp) — não consulta Redis para quem já foi verificado
 *  - Intervalo mínimo entre buscas: 60s (proteção contra burst)
 *  - Timeout de 10s por requisição
 */

import { logger } from "../../utils/logger";
import { cached } from "../../utils/cache";
import { query } from "../../db";

const WAHA_URL     = (process.env.WAHA_URL     || "").replace(/\/$/, "");
const WAHA_API_KEY = process.env.WAHA_API_KEY  || "";
const WAHA_SESSION = process.env.WAHA_SESSION  || "default";
const WAHA_GRUPO_VIP_JID = process.env.WAHA_GRUPO_VIP_JID || "";

// Cache Redis — lista completa de membros
const CACHE_KEY      = "waha:grupo_vip:participantes";
const CACHE_TTL_S    = 30 * 60; // 30 minutos

// Anti-ban: cooldown entre fetchs consecutivos
let ultimoFetch = 0;
const COOLDOWN_MS = 60_000; // 1 minuto mínimo entre chamadas ao WAHA

// ── Normalizar telefone → JID WhatsApp ──────────────────────────

export function normalizarTelefoneJid(telefone: string): string | null {
  if (!telefone) return null;
  const digits = telefone.replace(/\D/g, "");

  // Com código do país 55 (Brasil)
  if (digits.length === 13 && digits.startsWith("55")) return `${digits}@c.us`;
  if (digits.length === 12 && digits.startsWith("55")) return `${digits}@c.us`;

  // Sem código do país — DDD + número
  if (digits.length === 11) return `55${digits}@c.us`; // celular 9 dígitos
  if (digits.length === 10) return `55${digits}@c.us`; // fixo 8 dígitos

  return null;
}

// ── Buscar participantes do grupo via WAHA ───────────────────────

async function fetchParticipantesWaha(): Promise<string[]> {
  if (!WAHA_URL || !WAHA_GRUPO_VIP_JID) {
    logger.warn("WAHA: WAHA_URL ou WAHA_GRUPO_VIP_JID não configurados — verificação de grupo VIP desativada");
    return [];
  }

  const agora = Date.now();
  if (agora - ultimoFetch < COOLDOWN_MS) {
    // Dentro do cooldown — retorna vazio (chamador usará cache anterior)
    return [];
  }

  ultimoFetch = agora;

  try {
    const url = `${WAHA_URL}/api/${encodeURIComponent(WAHA_SESSION)}/groups/${encodeURIComponent(WAHA_GRUPO_VIP_JID)}`;
    const resp = await fetch(url, {
      method: "GET",
      headers: {
        "X-Api-Key": WAHA_API_KEY,
        "Accept": "application/json",
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!resp.ok) {
      logger.error("WAHA: erro HTTP ao buscar grupo VIP", { status: resp.status, url });
      return [];
    }

    const data = await resp.json() as { participants?: Array<{ id: string }> };
    const jids = (data.participants || []).map(p => p.id.toLowerCase());

    logger.info("WAHA: lista de membros do grupo VIP atualizada", { total: jids.length });
    return jids;
  } catch (err) {
    logger.error("WAHA: falha ao buscar participantes do grupo VIP", { err: String(err) });
    return [];
  }
}

// ── Obter set de participantes (com cache Redis 30min) ───────────

async function getParticipantes(): Promise<Set<string>> {
  const jids = await cached<string[]>(CACHE_KEY, CACHE_TTL_S, fetchParticipantesWaha);
  return new Set(jids);
}

// ── API pública: verificar se telefone é membro do grupo VIP ────

/**
 * Retorna:
 *  true  → é membro confirmado
 *  false → não é membro
 *  null  → não foi possível verificar (WAHA não configurado, timeout, etc.)
 */
export async function eMembroGrupoVip(telefone: string): Promise<boolean | null> {
  if (!WAHA_URL || !WAHA_GRUPO_VIP_JID) return null;

  const jid = normalizarTelefoneJid(telefone);
  if (!jid) return null;

  const participantes = await getParticipantes();
  if (participantes.size === 0) return null;

  return participantes.has(jid);
}

// ── Verificar e persistir resultado no banco ────────────────────

/**
 * Verifica membro e persiste em crm.customers.
 * Usa o campo `vip_grupo_wp` como cache de longa duração (24h).
 * Só chama WAHA se o campo for NULL ou estiver desatualizado.
 */
export async function verificarEPersistirVip(
  customerId: string,
  telefone: string,
): Promise<boolean | null> {
  // Verificar cache no banco (24h)
  const cached_row = await query<{ vip_grupo_wp: boolean | null; vip_grupo_wp_em: string | null }>(
    `SELECT vip_grupo_wp, vip_grupo_wp_em FROM crm.customers WHERE id = $1`,
    [customerId],
  );
  const row = cached_row[0];
  if (row?.vip_grupo_wp_em) {
    const idade = Date.now() - new Date(row.vip_grupo_wp_em).getTime();
    if (idade < 24 * 60 * 60 * 1000) {
      // Cache válido — retorna sem consultar WAHA
      return row.vip_grupo_wp ?? null;
    }
  }

  // Cache expirado ou ausente — consulta WAHA
  const resultado = await eMembroGrupoVip(telefone);
  if (resultado !== null) {
    await query(
      `UPDATE crm.customers SET vip_grupo_wp = $2, vip_grupo_wp_em = NOW() WHERE id = $1`,
      [customerId, resultado],
    );
  }
  return resultado;
}
