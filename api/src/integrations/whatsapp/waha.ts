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
import { cached, cacheGet, cacheSet } from "../../utils/cache";
import { query, queryOne } from "../../db";

const WAHA_URL           = (process.env.WAHA_URL     || "").replace(/\/$/, "");
const WAHA_API_KEY       = process.env.WAHA_API_KEY  || "";
const WAHA_SESSION       = process.env.WAHA_SESSION  || "default";
const WAHA_GRUPO_VIP_JID = process.env.WAHA_GRUPO_VIP_JID || "";

const CACHE_KEY       = "waha:grupo_vip:participantes";
const CACHE_KEY_TOTAL = "waha:grupo_vip:total";
const CACHE_TTL_S     = 30 * 60; // 30 minutos
const CACHE_TTL_TOTAL = 24 * 60 * 60; // 24h — o total do grupo muda pouco

let ultimoFetch = 0;
const COOLDOWN_MS = 60_000;

// ── Normalizar telefone → número limpo com DDI 55 ──────────────

export function normalizarTelefone(telefone: string): string | null {
  if (!telefone) return null;
  const digits = telefone.replace(/\D/g, "");

  if (digits.length === 13 && digits.startsWith("55")) return digits;
  if (digits.length === 12 && digits.startsWith("55")) return digits;
  if (digits.length === 11) return `55${digits}`;
  if (digits.length === 10) return `55${digits}`;

  return null;
}

/**
 * Retorna variantes do número para lidar com a adição do 9º dígito no Brasil.
 * Ex: "554788148811" (8 dígitos locais) → ["554788148811", "5547988148811"]
 *     "5547988148811" (9 dígitos locais) → ["5547988148811", "554788148811"]
 */
export function variantesNumero(n: string): string[] {
  const variants = [n];
  // 12 dígitos = 55 + DDD(2) + 8 dígitos → pode ter variante com 9
  if (n.length === 12 && n.startsWith("55")) {
    const ddd = n.slice(2, 4);
    const local = n.slice(4); // 8 dígitos
    variants.push(`55${ddd}9${local}`);
  }
  // 13 dígitos = 55 + DDD(2) + 9 + 8 dígitos → pode ter variante sem 9
  if (n.length === 13 && n.startsWith("55")) {
    const ddd = n.slice(2, 4);
    const com9 = n.slice(4); // 9 dígitos
    if (com9.startsWith("9")) variants.push(`55${ddd}${com9.slice(1)}`);
  }
  return variants;
}

// Mantém compatibilidade com código existente que usa @c.us
export function normalizarTelefoneJid(telefone: string): string | null {
  const n = normalizarTelefone(telefone);
  return n ? `${n}@c.us` : null;
}

// ── Buscar participantes via /participants (suporta addressingMode=lid) ──

async function fetchParticipantesWaha(): Promise<string[]> {
  if (!WAHA_URL || !WAHA_GRUPO_VIP_JID) {
    logger.warn("WAHA: WAHA_URL ou WAHA_GRUPO_VIP_JID não configurados — verificação VIP desativada");
    return [];
  }

  const agora = Date.now();
  if (agora - ultimoFetch < COOLDOWN_MS) return [];
  ultimoFetch = agora;

  try {
    // /participants retorna phoneNumber mesmo em grupos com addressingMode=lid
    const url = `${WAHA_URL}/api/${encodeURIComponent(WAHA_SESSION)}/groups/${encodeURIComponent(WAHA_GRUPO_VIP_JID)}/participants`;
    const resp = await fetch(url, {
      headers: { "X-Api-Key": WAHA_API_KEY, "Accept": "application/json" },
      signal: AbortSignal.timeout(10_000),
    });

    if (!resp.ok) {
      logger.error("WAHA: erro HTTP ao buscar participantes", { status: resp.status });
      return [];
    }

    type Participant = { id: string; phoneNumber?: string };
    const data = await resp.json() as Participant[];
    const participantes = Array.isArray(data) ? data : [];

    // Salvar o total bruto (inclui contas LID sem phoneNumber) antes de filtrar
    cacheSet(CACHE_KEY_TOTAL, CACHE_TTL_TOTAL, participantes.length).catch(() => {});

    const numeros: string[] = [];
    for (const p of participantes) {
      // phoneNumber = "5547XXXXXXXX@s.whatsapp.net" (modo LID — preferencial)
      // id          = "5547XXXXXXXX@c.us"           (modo clássico)
      const raw = p.phoneNumber
        ? p.phoneNumber.split("@")[0]
        : p.id.includes("@lid") ? null : p.id.split("@")[0];
      if (!raw) continue;
      const n = normalizarTelefone(raw);
      if (n) numeros.push(n);
    }

    logger.info("WAHA: lista de membros do grupo VIP atualizada", { total: numeros.length, totalBruto: participantes.length });
    return numeros;
  } catch (err) {
    logger.error("WAHA: falha ao buscar participantes do grupo VIP", { err: String(err) });
    return [];
  }
}

// ── Obter set de participantes (com cache Redis 30min) ──────────

async function getParticipantes(): Promise<Set<string>> {
  const numeros = await cached<string[]>(CACHE_KEY, CACHE_TTL_S, fetchParticipantesWaha);
  return new Set(numeros);
}

// ── Total real de membros do grupo (para exibir nos emails) ─────

export async function getGrupoVipTotal(): Promise<number> {
  const cached = await cacheGet<number>(CACHE_KEY_TOTAL);
  return cached ?? 0;
}

// ── Verificar se telefone é membro do grupo VIP ─────────────────

export async function eMembroGrupoVip(telefone: string): Promise<boolean | null> {
  if (!WAHA_URL || !WAHA_GRUPO_VIP_JID) return null;

  const n = normalizarTelefone(telefone);
  if (!n) return null;

  const participantes = await getParticipantes();
  if (participantes.size === 0) return null;

  // Testa também variante com/sem 9º dígito (transição Brasil)
  return variantesNumero(n).some(v => participantes.has(v));
}

// ── Verificar e persistir no banco (cache 24h por cliente) ──────

export async function verificarEPersistirVip(
  customerId: string,
  telefone: string,
): Promise<boolean | null> {
  const row = await queryOne<{ vip_grupo_wp: boolean | null; vip_grupo_wp_em: string | null }>(
    `SELECT vip_grupo_wp, vip_grupo_wp_em FROM crm.customers WHERE id = $1`,
    [customerId],
  );

  if (row?.vip_grupo_wp_em) {
    const idade = Date.now() - new Date(row.vip_grupo_wp_em).getTime();
    if (idade < 24 * 60 * 60 * 1000) return row.vip_grupo_wp ?? null;
  }

  const resultado = await eMembroGrupoVip(telefone);
  if (resultado !== null) {
    await query(
      `UPDATE crm.customers SET vip_grupo_wp = $2, vip_grupo_wp_em = NOW() WHERE id = $1`,
      [customerId, resultado],
    );
  }
  return resultado;
}

// ── Sync em bulk: atualiza todos os clientes do CRM de uma vez ──

export async function syncWahaVipBulk(): Promise<{ atualizados: number; vip: number; naoVip: number }> {
  if (!WAHA_URL || !WAHA_GRUPO_VIP_JID) {
    logger.warn("WAHA: sync bulk ignorado — variáveis não configuradas");
    return { atualizados: 0, vip: 0, naoVip: 0 };
  }

  // Forçar refresh ignorando cooldown
  ultimoFetch = 0;
  const participantes = await getParticipantes();

  if (participantes.size === 0) {
    logger.warn("WAHA: sync bulk abortado — lista vazia (sessão desconectada?)");
    return { atualizados: 0, vip: 0, naoVip: 0 };
  }

  const clientes = await query<{ id: string; telefone: string }>(
    `SELECT id, telefone FROM crm.customers WHERE telefone IS NOT NULL AND telefone != ''`,
  );

  let vip = 0, naoVip = 0;
  for (const c of clientes) {
    const n = normalizarTelefone(c.telefone);
    if (!n) continue;
    // Testa variantes para cobrir número com/sem 9º dígito
    const isVip = variantesNumero(n).some(v => participantes.has(v));
    await query(
      `UPDATE crm.customers SET vip_grupo_wp = $2, vip_grupo_wp_em = NOW() WHERE id = $1`,
      [c.id, isVip],
    );
    if (isVip) vip++; else naoVip++;
  }

  const atualizados = vip + naoVip;
  logger.info("WAHA: sync bulk concluído", { atualizados, vip, naoVip, membrosGrupo: participantes.size });
  return { atualizados, vip, naoVip };
}
