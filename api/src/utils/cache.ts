import { createClient, RedisClientType } from "redis";
import { logger } from "./logger";

let client: RedisClientType | null = null;
let connected = false;

async function getClient(): Promise<RedisClientType | null> {
  if (client && connected) return client;

  try {
    const url = `redis://${process.env.REDIS_PASS ? `:${process.env.REDIS_PASS}@` : ""}${process.env.REDIS_HOST || "localhost"}:${process.env.REDIS_PORT || 6379}`;
    client = createClient({ url }) as RedisClientType;
    client.on("error", (err) => {
      logger.warn("Redis cache erro", { error: String(err) });
      connected = false;
    });
    await client.connect();
    connected = true;
    return client;
  } catch {
    connected = false;
    return null;
  }
}

/**
 * Cache wrapper — busca no Redis, se não tem executa a função e salva
 * @param key Chave do cache (ex: "analytics:rfm")
 * @param ttlSeconds Tempo de vida em segundos
 * @param fn Função que retorna os dados
 */
export async function cached<T>(key: string, ttlSeconds: number, fn: () => Promise<T>): Promise<T> {
  const redis = await getClient();

  // Se Redis não disponível, executa direto
  if (!redis) return fn();

  try {
    const raw = await redis.get(key);
    if (raw) {
      return JSON.parse(raw) as T;
    }
  } catch {
    // Cache miss ou erro de parse — segue normalmente
  }

  const data = await fn();

  // Salvar em background (não bloqueia resposta)
  if (redis) {
    redis.setEx(key, ttlSeconds, JSON.stringify(data)).catch(() => {});
  }

  return data;
}

/**
 * Salvar um valor diretamente no cache (sem factory)
 */
export async function cacheSet<T>(key: string, ttlSeconds: number, value: T): Promise<void> {
  const redis = await getClient();
  if (!redis) return;
  redis.setEx(key, ttlSeconds, JSON.stringify(value)).catch(() => {});
}

/**
 * Ler um valor diretamente do cache (sem factory)
 */
export async function cacheGet<T>(key: string): Promise<T | null> {
  const redis = await getClient();
  if (!redis) return null;
  try {
    const raw = await redis.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/**
 * Invalidar cache por padrão de chave
 */
export async function invalidateCache(pattern: string): Promise<void> {
  const redis = await getClient();
  if (!redis) return;

  try {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(keys);
    }
  } catch {
    // Silencioso
  }
}
