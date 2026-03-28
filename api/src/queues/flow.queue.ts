import { Queue, Worker } from "bullmq";
import { logger } from "../utils/logger";
import { processReadySteps, checkAbandonedCarts } from "../services/flow.service";
import { query } from "../db";

// ── Redis connection ───────────────────────────────────────────

const redisConnection = {
  host: process.env.REDIS_HOST || "localhost",
  port: Number(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASS || undefined,
};

// ── Queue ──────────────────────────────────────────────────────

export const flowQueue = new Queue("bibelo-flows", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 10000 },
    removeOnComplete: 200,
    removeOnFail: 500,
  },
});

// ── Worker ─────────────────────────────────────────────────────

export const flowWorker = new Worker(
  "bibelo-flows",
  async (job) => {
    const startTime = Date.now();
    logger.info("Flow job iniciado", { name: job.name, id: job.id });

    try {
      let result: Record<string, unknown> = {};

      switch (job.name) {
        case "flow-process-steps": {
          const processed = await processReadySteps();
          result = { processed };
          break;
        }

        case "flow-check-abandoned": {
          const triggered = await checkAbandonedCarts();
          result = { triggered };
          break;
        }

        default:
          logger.warn("Flow job desconhecido", { name: job.name });
          return;
      }

      const duration = Date.now() - startTime;

      // Log apenas se processou algo
      const total = (result.processed as number) || (result.triggered as number) || 0;
      if (total > 0) {
        await query(
          `INSERT INTO sync.sync_logs (fonte, tipo, status, registros, erro)
           VALUES ('flow-engine', $1, 'ok', $2, $3)`,
          [job.name, total, `Duração: ${duration}ms`]
        );
      }

      logger.info("Flow job concluído", { name: job.name, duration, result });
      return result;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro desconhecido";
      const duration = Date.now() - startTime;

      await query(
        `INSERT INTO sync.sync_logs (fonte, tipo, status, registros, erro)
         VALUES ('flow-engine', $1, 'erro', 0, $2)`,
        [job.name, message]
      ).catch(() => {});

      logger.error("Flow job falhou", { name: job.name, duration, error: message });
      throw err;
    }
  },
  { connection: redisConnection, concurrency: 2 }
);

// ── Registrar jobs recorrentes ─────────────────────────────────

export async function registerFlowJobs(): Promise<void> {
  // Remove repeatables antigos
  const existing = await flowQueue.getRepeatableJobs();
  for (const job of existing) {
    await flowQueue.removeRepeatableByKey(job.key);
  }

  // Processar steps prontos: a cada 1 minuto
  await flowQueue.add("flow-process-steps", {}, {
    repeat: { pattern: "* * * * *" },
  });

  // Verificar carrinhos abandonados: a cada 5 minutos
  await flowQueue.add("flow-check-abandoned", {}, {
    repeat: { pattern: "*/5 * * * *" },
  });

  logger.info("Flow jobs registrados: process-steps (1min), check-abandoned (5min)");
}

// ── Event listeners ────────────────────────────────────────────

flowWorker.on("failed", (job, err) => {
  logger.error("Flow job falhou definitivamente", { name: job?.name, id: job?.id, error: err.message });
});

flowWorker.on("completed", (job) => {
  logger.info("Flow job completado", { name: job.name, id: job.id });
});
