import crypto from "crypto";
import axios from "axios";
import { query } from "../../db";
import { metaGet, getAdAccountId } from "./client";
import { logger } from "../../utils/logger";

// ── Meta Custom Audiences — Sync CRM → Meta ──────────────────
// Envia segmentos de clientes/leads do banco para o Meta como
// Custom Audiences. O Meta cruza os hashes com seus perfis e
// gera audiências de retargeting + lookalike de alta qualidade.

const META_GRAPH_URL = "https://graph.facebook.com/v25.0";
const AUDIENCE_PREFIX = "Bibelô —";

function hashSHA256(value: string): string {
  return crypto.createHash("sha256").update(value.toLowerCase().trim()).digest("hex");
}

export interface MetaAudienceInfo {
  id: string;
  name: string;
  subtype: string;
  approximate_count_lower_bound?: number;
  approximate_count_upper_bound?: number;
  description?: string;
  time_updated?: number;
}

interface UserRow {
  email?: string;
  telefone?: string;
}

// ── Definição dos segmentos ───────────────────────────────────

interface Segment {
  nome: string;
  descricao: string;
  queryFn: () => Promise<UserRow[]>;
}

const SEGMENTS: Segment[] = [
  {
    nome: `${AUDIENCE_PREFIX} Clientes`,
    descricao: "Todos os clientes que já realizaram ao menos 1 compra na Bibelô",
    queryFn: () =>
      query<UserRow>(
        `SELECT c.email, c.telefone
         FROM crm.customers c
         INNER JOIN crm.customer_scores cs ON cs.customer_id = c.id
         WHERE c.email IS NOT NULL AND cs.total_pedidos > 0`,
      ),
  },
  {
    nome: `${AUDIENCE_PREFIX} Leads não convertidos`,
    descricao: "Leads capturados pelo popup/landing page que ainda não compraram",
    queryFn: () =>
      query<UserRow>(
        `SELECT l.email, l.telefone
         FROM marketing.leads l
         WHERE l.email_verificado = true AND l.convertido = false`,
      ),
  },
  {
    nome: `${AUDIENCE_PREFIX} Inativos +90d`,
    descricao: "Clientes que compraram mas não voltam há mais de 90 dias",
    queryFn: () =>
      query<UserRow>(
        `SELECT c.email, c.telefone
         FROM crm.customers c
         INNER JOIN crm.customer_scores cs ON cs.customer_id = c.id
         WHERE c.email IS NOT NULL
           AND cs.total_pedidos > 0
           AND cs.ultima_compra < NOW() - INTERVAL '90 days'`,
      ),
  },
  {
    nome: `${AUDIENCE_PREFIX} Compradores Recentes`,
    descricao: "Clientes que compraram nos últimos 30 dias — para lookalike de alta qualidade",
    queryFn: () =>
      query<UserRow>(
        `SELECT c.email, c.telefone
         FROM crm.customers c
         INNER JOIN crm.customer_scores cs ON cs.customer_id = c.id
         WHERE c.email IS NOT NULL
           AND cs.ultima_compra >= NOW() - INTERVAL '30 days'`,
      ),
  },
];

// ── Helpers Meta API ─────────────────────────────────────────

async function findAudienceByName(name: string): Promise<MetaAudienceInfo | null> {
  const accountId = getAdAccountId();
  const data = await metaGet<{ data: MetaAudienceInfo[] }>(
    `/${accountId}/customaudiences`,
    {
      fields: "id,name,subtype,approximate_count_lower_bound,approximate_count_upper_bound",
      limit: 100,
    },
  );
  return data.data?.find((a) => a.name === name) ?? null;
}

async function createAudience(segment: Segment): Promise<string> {
  const token = process.env.META_ACCESS_TOKEN;
  const accountId = getAdAccountId();

  const { data } = await axios.post(
    `${META_GRAPH_URL}/${accountId}/customaudiences`,
    {
      name: segment.nome,
      description: segment.descricao,
      subtype: "CUSTOM",
      customer_file_source: "USER_PROVIDED_ONLY",
      access_token: token,
    },
    { timeout: 15000 },
  );

  return data.id as string;
}

async function uploadUsers(audienceId: string, users: UserRow[]): Promise<number> {
  const token = process.env.META_ACCESS_TOKEN;

  // Hashear apenas emails presentes (campo obrigatório)
  const hashed = users
    .filter((u) => u.email && u.email.trim().length > 0)
    .map((u) => [
      hashSHA256(u.email!),
      u.telefone ? hashSHA256(u.telefone.replace(/\D/g, "")) : "",
    ]);

  if (hashed.length === 0) return 0;

  // session com last_batch_flag = true → substituição total (não append)
  const sessionId = Math.floor(Math.random() * 9_000_000) + 1_000_000;

  await axios.post(
    `${META_GRAPH_URL}/${audienceId}/users`,
    {
      payload: {
        schema: ["EMAIL", "PHONE"],
        data: hashed,
      },
      session: {
        session_id: sessionId,
        estimated_num_total: hashed.length,
        batch_seq: 1,
        last_batch_flag: true,
      },
      access_token: token,
    },
    { timeout: 60000 },
  );

  return hashed.length;
}

// ── API pública ──────────────────────────────────────────────

export interface AudienceSyncResult {
  nome: string;
  audienceId: string;
  usuarios: number;
  criada: boolean;
  erro?: string;
}

export async function syncAudiences(): Promise<AudienceSyncResult[]> {
  const results: AudienceSyncResult[] = [];

  for (const segment of SEGMENTS) {
    try {
      let audience = await findAudienceByName(segment.nome);
      let criada = false;

      if (!audience) {
        const id = await createAudience(segment);
        audience = { id, name: segment.nome, subtype: "CUSTOM" };
        criada = true;
        logger.info("Meta Audiences: audiência criada", { nome: segment.nome, id });
      }

      const users = await segment.queryFn();
      const count = await uploadUsers(audience.id, users);

      logger.info("Meta Audiences: sync concluído", {
        nome: segment.nome,
        audienceId: audience.id,
        usuarios: count,
        criada,
      });

      results.push({ nome: segment.nome, audienceId: audience.id, usuarios: count, criada });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido";
      logger.error("Meta Audiences: falha no sync", { nome: segment.nome, error: msg });
      results.push({ nome: segment.nome, audienceId: "", usuarios: 0, criada: false, erro: msg });
    }
  }

  return results;
}

export async function listAudiences(): Promise<MetaAudienceInfo[]> {
  const accountId = getAdAccountId();
  const data = await metaGet<{ data: MetaAudienceInfo[] }>(
    `/${accountId}/customaudiences`,
    {
      fields: "id,name,subtype,approximate_count_lower_bound,approximate_count_upper_bound,description,time_updated",
      limit: 100,
    },
  );
  // Retorna só audiências da Bibelô (criadas por este sistema)
  return (data.data || []).filter((a) => a.name.startsWith(AUDIENCE_PREFIX));
}

export { SEGMENTS as AUDIENCE_SEGMENTS };
