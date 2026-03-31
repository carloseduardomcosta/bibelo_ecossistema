import axios from "axios";
import { query, queryOne } from "../../db";
import { logger } from "../../utils/logger";

const NS_APP_ID = process.env.NUVEMSHOP_APP_ID!;
const NS_CLIENT_SECRET = process.env.NUVEMSHOP_CLIENT_SECRET!;
const NS_REDIRECT_URI = process.env.NUVEMSHOP_REDIRECT_URI!;
const NS_TOKEN_URL = "https://www.tiendanube.com/apps/authorize/token";

export const NS_API_BASE = "https://api.nuvemshop.com.br/v1";

// ── Gerar URL de autorização ──────────────────────────────────

export function getNuvemShopAuthUrl(): string {
  return `https://www.tiendanube.com/apps/${NS_APP_ID}/authorize`;
}

// ── Trocar code por token ─────────────────────────────────────

export async function exchangeNuvemShopCode(code: string): Promise<{
  access_token: string;
  token_type: string;
  scope: string;
  user_id: number;
}> {
  const { data } = await axios.post(NS_TOKEN_URL, {
    client_id: NS_APP_ID,
    client_secret: NS_CLIENT_SECRET,
    grant_type: "authorization_code",
    code,
  }, { timeout: 15000 });

  // Salva token no sync_state (token nunca expira na NuvemShop)
  const tokenData = JSON.stringify({
    access_token: data.access_token,
    store_id: data.user_id,
    scope: data.scope,
    connected_at: new Date().toISOString(),
  });

  await query(
    `UPDATE sync.sync_state SET ultimo_id = $1, ultima_sync = NOW() WHERE fonte = 'nuvemshop'`,
    [tokenData]
  );

  logger.info("NuvemShop OAuth: token salvo", { store_id: data.user_id, scope: data.scope });

  return data;
}

// ── Buscar token salvo ────────────────────────────────────────

interface NuvemShopToken {
  access_token: string;
  store_id: number;
  scope: string;
}

export async function getNuvemShopToken(): Promise<NuvemShopToken | null> {
  const state = await queryOne<{ ultimo_id: string }>(
    "SELECT ultimo_id FROM sync.sync_state WHERE fonte = 'nuvemshop'"
  );

  if (!state?.ultimo_id) return null;

  try {
    const parsed = JSON.parse(state.ultimo_id);
    if (!parsed.access_token || !parsed.store_id) return null;
    return parsed;
  } catch {
    return null;
  }
}

// ── Rate limiter NuvemShop (2 req/s) ──────────────────────────

let lastNsRequest = 0;

export async function nsRequest<T>(
  method: "get" | "post" | "put" | "delete" | "patch",
  path: string,
  token: NuvemShopToken,
  body?: unknown
): Promise<T> {
  // Garante intervalo mínimo de 520ms (≈1.9 req/s, margem segura)
  // Atualiza timestamp ANTES do await para ser concurrency-safe
  const now = Date.now();
  const elapsed = now - lastNsRequest;
  const delay = elapsed < 520 ? 520 - elapsed : 0;
  lastNsRequest = now + delay; // optimistic update — concurrent callers see this immediately
  if (delay > 0) {
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  const url = `${NS_API_BASE}/${token.store_id}/${path}`;

  try {
    const { data } = await axios({
      method,
      url,
      data: body,
      headers: {
        "Authentication": `bearer ${token.access_token}`,
        "User-Agent": `BibeloCRM (${NS_APP_ID})`,
        "Content-Type": "application/json",
      },
      timeout: 15000,
    });
    return data;
  } catch (err: unknown) {
    const axiosErr = err as { response?: { status?: number; headers?: Record<string, string> } };
    if (axiosErr.response?.status === 429) {
      const reset = parseInt(axiosErr.response.headers?.["x-rate-limit-reset"] || "5000", 10);
      logger.warn("NuvemShop rate limit 429: aguardando", { reset });
      await new Promise((resolve) => setTimeout(resolve, Math.min(reset, 30000)));
      lastNsRequest = Date.now();
      const { data } = await axios({
        method,
        url,
        data: body,
        headers: {
          "Authentication": `bearer ${token.access_token}`,
          "User-Agent": `BibeloCRM (${NS_APP_ID})`,
          "Content-Type": "application/json",
        },
        timeout: 15000,
      });
      return data;
    }
    throw err;
  }
}
