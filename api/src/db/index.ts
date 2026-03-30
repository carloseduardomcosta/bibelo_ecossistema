import { Pool } from "pg";
import { logger } from "../utils/logger";

export const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  max:              10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  ssl: false,
});

db.on("error", (err) => {
  logger.error("PostgreSQL pool error", { error: err.message });
});

export async function dbConnect(): Promise<void> {
  const client = await db.connect();
  client.release();
  logger.info("PostgreSQL conectado");
}

export async function query<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[]
): Promise<T[]> {
  const result = await db.query(sql, params);
  return result.rows as T[];
}

export async function queryOne<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[]
): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

/**
 * Constrói SET clause seguro para UPDATE — previne SQL column injection.
 * Só permite colunas que estão na whitelist (nomes simples [a-z_]).
 */
export function safeBuildUpdate(
  data: Record<string, unknown>,
  allowedCols: string[]
): { sets: string; values: unknown[] } {
  const allowed = new Set(allowedCols);
  const entries = Object.entries(data).filter(([k, v]) => v !== undefined && allowed.has(k));
  if (entries.length === 0) throw new Error("Nenhum campo válido para atualizar");
  const sets = entries.map(([k], i) => `"${k.replace(/[^a-z_]/g, "")}" = $${i + 1}`).join(", ");
  const values = entries.map(([, v]) => v);
  return { sets, values };
}
