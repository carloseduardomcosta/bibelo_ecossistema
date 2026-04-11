import axios, { type AxiosInstance } from "axios";
import { logger } from "../../utils/logger";

// ── Meta Graph API v21.0 ──────────────────────────────────────

const META_GRAPH_URL = "https://graph.facebook.com/v25.0";

let cachedClient: AxiosInstance | null = null;

function getClient(): AxiosInstance | null {
  if (cachedClient) return cachedClient;
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) return null;

  cachedClient = axios.create({
    baseURL: META_GRAPH_URL,
    params: { access_token: token },
    timeout: 30000,
  });
  return cachedClient;
}

export function isMetaConfigured(): boolean {
  return !!process.env.META_ACCESS_TOKEN && !!process.env.META_AD_ACCOUNT_ID;
}

export function getAdAccountId(): string {
  const id = process.env.META_AD_ACCOUNT_ID || "";
  return id.startsWith("act_") ? id : `act_${id}`;
}

// ── Cache in-memory (TTL 5 min) ──────────────────────────────

const cache = new Map<string, { data: unknown; expires: number }>();
const CACHE_TTL = 5 * 60 * 1000;

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry || Date.now() > entry.expires) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setCache(key: string, data: unknown): void {
  cache.set(key, { data, expires: Date.now() + CACHE_TTL });
  // Limpar entradas expiradas periodicamente
  if (cache.size > 100) {
    const now = Date.now();
    for (const [k, v] of cache) {
      if (now > v.expires) cache.delete(k);
    }
  }
}

// ── Requisição genérica com retry em 429 ──────────────────────

export async function metaGet<T = unknown>(
  path: string,
  params: Record<string, unknown> = {},
): Promise<T> {
  const client = getClient();
  if (!client) throw new Error("Meta Ads não configurado");

  const cacheKey = `${path}:${JSON.stringify(params)}`;
  const cached = getCached<T>(cacheKey);
  if (cached) return cached;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { data } = await client.get<T>(path, { params });
      setCache(cacheKey, data);
      return data;
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        const status = err.response?.status;
        const errorMsg = err.response?.data?.error?.message || err.message;

        // Rate limit — retry após delay
        if (status === 429 && attempt === 0) {
          logger.warn("Meta API rate limit — retentando em 5s", { path });
          await new Promise((r) => setTimeout(r, 5000));
          continue;
        }

        // Token expirado
        if (status === 190 || errorMsg?.includes("expired")) {
          throw new Error("Token Meta expirado — gere um novo token no Business Manager");
        }

        throw new Error(`Meta API erro (${status}): ${errorMsg}`);
      }
      throw err;
    }
  }

  throw new Error("Meta API: falha após retries");
}

// ── Helpers ───────────────────────────────────────────────────

export function periodoToRange(periodo: string): { since: string; until: string } {
  const now = new Date();
  const until = now.toISOString().split("T")[0];
  // "1d" = somente hoje (since = until = hoje)
  if (periodo === "1d") return { since: until, until };
  let days = 7;
  if (periodo === "3d")  days = 3;
  else if (periodo === "15d") days = 15;
  else if (periodo === "30d") days = 30;
  else if (periodo === "3m")  days = 90;
  const since = new Date(now.getTime() - days * 86400000).toISOString().split("T")[0];
  return { since, until };
}

// Extrair valor de uma action específica do array de actions da Meta
export function extractAction(actions: Array<{ action_type: string; value: string }> | undefined, type: string): number {
  if (!actions) return 0;
  const action = actions.find((a) => a.action_type === type);
  return action ? parseFloat(action.value) : 0;
}

// ── Funções de consulta ──────────────────────────────────────

interface MetaListResponse<T> {
  data: T[];
  paging?: { cursors: { before: string; after: string }; next?: string };
}

export interface MetaCampaign {
  id: string;
  name: string;
  status: string;
  objective: string;
  daily_budget?: string;
  lifetime_budget?: string;
  start_time?: string;
  stop_time?: string;
  created_time: string;
  updated_time: string;
}

export interface MetaInsight {
  campaign_id?: string;
  campaign_name?: string;
  spend: string;
  impressions: string;
  reach?: string;
  clicks: string;
  ctr: string;
  cpc: string;
  cpm: string;
  actions?: Array<{ action_type: string; value: string }>;
  cost_per_action_type?: Array<{ action_type: string; value: string }>;
  purchase_roas?: Array<{ action_type: string; value: string }>;
  date_start: string;
  date_stop: string;
  // Breakdowns
  age?: string;
  gender?: string;
  region?: string;
  publisher_platform?: string;
}

export async function getAccountInfo(): Promise<Record<string, unknown>> {
  const accountId = getAdAccountId();
  return metaGet(`/${accountId}`, {
    fields: "name,account_status,currency,timezone_name,amount_spent,balance,spend_cap",
  });
}

export async function getCampaigns(): Promise<MetaCampaign[]> {
  const accountId = getAdAccountId();
  const data = await metaGet<MetaListResponse<MetaCampaign>>(`/${accountId}/campaigns`, {
    fields: "id,name,status,objective,daily_budget,lifetime_budget,start_time,stop_time,created_time,updated_time",
    limit: 50,
  });
  return data.data || [];
}

export async function getInsights(
  objectId: string,
  params: {
    fields?: string;
    time_range?: { since: string; until: string };
    breakdowns?: string;
    level?: string;
    time_increment?: string;
  },
): Promise<MetaInsight[]> {
  const fields =
    params.fields ||
    "spend,impressions,reach,clicks,ctr,cpc,cpm,actions,cost_per_action_type,purchase_roas";

  const queryParams: Record<string, unknown> = { fields };

  if (params.time_range) {
    queryParams.time_range = JSON.stringify(params.time_range);
  }
  if (params.breakdowns) queryParams.breakdowns = params.breakdowns;
  if (params.level) queryParams.level = params.level;
  if (params.time_increment) queryParams.time_increment = params.time_increment;

  const data = await metaGet<MetaListResponse<MetaInsight>>(`/${objectId}/insights`, queryParams);
  return data.data || [];
}
