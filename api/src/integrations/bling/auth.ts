import axios from "axios";
import { query, queryOne } from "../../db";
import { logger } from "../../utils/logger";

const BLING_API = "https://api.bling.com.br/Api/v3";
const BLING_AUTH = "https://bling.com.br/Api/v3/oauth";

interface BlingTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at: string;
}

// ── Get Auth URL ───────────────────────────────────────────────

export function getAuthUrl(): string {
  const clientId = process.env.BLING_CLIENT_ID!;
  const redirectUri = process.env.BLING_REDIRECT_URI!;
  return `${BLING_AUTH}/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=bibelo`;
}

// ── Exchange Code ──────────────────────────────────────────────

export async function exchangeCode(code: string): Promise<BlingTokens> {
  const clientId = process.env.BLING_CLIENT_ID!;
  const clientSecret = process.env.BLING_CLIENT_SECRET!;

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const { data } = await axios.post(
    `${BLING_AUTH}/token`,
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
    }),
    {
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
    }
  );

  const tokens: BlingTokens = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_in: data.expires_in,
    expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
  };

  await saveTokens(tokens);
  logger.info("Bling OAuth: tokens obtidos via authorization_code");
  return tokens;
}

// ── Refresh Token ──────────────────────────────────────────────

export async function refreshToken(): Promise<BlingTokens> {
  const clientId = process.env.BLING_CLIENT_ID!;
  const clientSecret = process.env.BLING_CLIENT_SECRET!;
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const stored = await getStoredTokens();
  if (!stored?.refresh_token) {
    throw new Error("Bling: nenhum refresh_token salvo");
  }

  const { data } = await axios.post(
    `${BLING_AUTH}/token`,
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: stored.refresh_token,
    }),
    {
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
    }
  );

  const tokens: BlingTokens = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_in: data.expires_in,
    expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
  };

  await saveTokens(tokens);
  logger.info("Bling OAuth: tokens renovados via refresh_token");
  return tokens;
}

// ── Save Tokens ────────────────────────────────────────────────

export async function saveTokens(tokens: BlingTokens): Promise<void> {
  await query(
    `UPDATE sync.sync_state
     SET ultimo_id = $1, ultima_sync = NOW()
     WHERE fonte = 'bling'`,
    [JSON.stringify(tokens)]
  );
}

// ── Get Stored Tokens ──────────────────────────────────────────

async function getStoredTokens(): Promise<BlingTokens | null> {
  const row = await queryOne<{ ultimo_id: string }>(
    "SELECT ultimo_id FROM sync.sync_state WHERE fonte = 'bling'"
  );
  if (!row?.ultimo_id) return null;
  try {
    return JSON.parse(row.ultimo_id) as BlingTokens;
  } catch {
    return null;
  }
}

// ── Get Valid Token (auto-refresh) ─────────────────────────────

export async function getValidToken(): Promise<string> {
  const stored = await getStoredTokens();

  if (!stored) {
    throw new Error("Bling: nenhum token configurado. Execute o fluxo OAuth primeiro.");
  }

  // Renova se expira em menos de 5 minutos
  const expiresAt = new Date(stored.expires_at).getTime();
  if (Date.now() > expiresAt - 5 * 60 * 1000) {
    const renewed = await refreshToken();
    return renewed.access_token;
  }

  return stored.access_token;
}

export { BLING_API };
