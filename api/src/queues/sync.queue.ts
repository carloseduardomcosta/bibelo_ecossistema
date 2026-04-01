import { Queue, Worker } from "bullmq";
import { logger } from "../utils/logger";
import { incrementalSync } from "../integrations/bling/sync";
import { calculateScore } from "../services/customer.service";
import { triggerFlow } from "../services/flow.service";
import { refreshReviewsCache } from "../integrations/google/reviews";
import { enviarBriefingEmail } from "../routes/briefing";
import { query, queryOne } from "../db";

// ── Redis connection ───────────────────────────────────────────

const redisConnection = {
  host: process.env.REDIS_HOST || "localhost",
  port: Number(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASS || undefined,
};

// ── Queue ──────────────────────────────────────────────────────

export const syncQueue = new Queue("bibelo-sync", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: 100,
    removeOnFail: 200,
  },
});

// ── Worker ─────────────────────────────────────────────────────

export const syncWorker = new Worker(
  "bibelo-sync",
  async (job) => {
    const startTime = Date.now();
    logger.info("Job iniciado", { name: job.name, id: job.id });

    try {
      let result: Record<string, unknown> = {};

      switch (job.name) {
        case "bling-sync-incremental": {
          const syncResult = await incrementalSync();
          result = { ...syncResult };
          break;
        }

        case "score-recalculation": {
          const customers = await query<{ id: string }>(
            "SELECT id FROM crm.customers WHERE ativo = true"
          );

          let processed = 0;
          let reactivationTriggered = 0;

          for (const c of customers) {
            // Busca risco anterior antes de recalcular
            const before = await queryOne<{ risco_churn: string }>(
              "SELECT risco_churn FROM crm.customer_scores WHERE customer_id = $1",
              [c.id]
            );
            const riscoAntes = before?.risco_churn || "baixo";

            await calculateScore(c.id);

            // Se risco mudou para 'alto', disparar fluxo de reativação
            const after = await queryOne<{ risco_churn: string }>(
              "SELECT risco_churn FROM crm.customer_scores WHERE customer_id = $1",
              [c.id]
            );

            if (after?.risco_churn === "alto" && riscoAntes !== "alto") {
              // Só reativar quem já comprou pelo menos 1x (não faz sentido para leads puros)
              const hasPurchase = await queryOne<{ total: string }>(
                `SELECT (
                   (SELECT COUNT(*) FROM sync.nuvemshop_orders WHERE customer_id = $1) +
                   (SELECT COUNT(*) FROM sync.bling_orders WHERE customer_id = $1)
                 )::text AS total`,
                [c.id]
              );
              const totalPedidos = (hasPurchase ? parseInt(hasPurchase.total, 10) : 0);

              if (totalPedidos > 0) {
                await triggerFlow("customer.inactive", c.id, {
                  risco_anterior: riscoAntes,
                  risco_atual: "alto",
                });
                reactivationTriggered++;
              }
            }

            processed++;
          }
          result = { processed, reactivationTriggered };
          break;
        }

        case "google-reviews-refresh": {
          const reviews = await refreshReviewsCache();
          result = { reviews: reviews?.reviews.length || 0, rating: reviews?.overall_rating || 0 };
          break;
        }

        case "briefing-diario": {
          await enviarBriefingEmail();
          result = { processed: 1 };
          break;
        }

        case "cleanup-old-data": {
          const tracking = await query(
            "DELETE FROM crm.tracking_events WHERE criado_em < NOW() - INTERVAL '90 days'"
          );
          const logs = await query(
            "DELETE FROM sync.sync_logs WHERE criado_em < NOW() - INTERVAL '60 days'"
          );
          const trackingDeleted = (tracking as any).rowCount || 0;
          const logsDeleted = (logs as any).rowCount || 0;
          logger.info("Cleanup concluído", { trackingDeleted, logsDeleted });
          result = { trackingDeleted, logsDeleted, processed: trackingDeleted + logsDeleted };
          break;
        }

        default:
          logger.warn("Job desconhecido", { name: job.name });
          return;
      }

      const duration = Date.now() - startTime;

      // Log no banco
      await query(
        `INSERT INTO sync.sync_logs (fonte, tipo, status, registros, erro)
         VALUES ($1, $2, 'ok', $3, $4)`,
        [
          "queue",
          job.name,
          result.processed || (result.customers as number || 0) + (result.orders as number || 0),
          `Duração: ${duration}ms`,
        ]
      );

      logger.info("Job concluído", { name: job.name, duration, result });
      return result;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro desconhecido";
      const duration = Date.now() - startTime;

      await query(
        `INSERT INTO sync.sync_logs (fonte, tipo, status, registros, erro)
         VALUES ('queue', $1, 'erro', 0, $2)`,
        [job.name, message]
      ).catch((err) => { logger.warn("Falha ao registrar erro no sync_logs (sync)", { job: job.name, error: String(err) }); });

      logger.error("Job falhou", { name: job.name, duration, error: message });
      throw err;
    }
  },
  { connection: redisConnection, concurrency: 1 }
);

// ── Registrar jobs recorrentes ─────────────────────────────────

export async function registerScheduledJobs(): Promise<void> {
  // Remove repeatables antigos para evitar duplicatas
  const existing = await syncQueue.getRepeatableJobs();
  for (const job of existing) {
    await syncQueue.removeRepeatableByKey(job.key);
  }

  // Bling sync incremental: a cada 30 minutos
  await syncQueue.add("bling-sync-incremental", {}, {
    repeat: { pattern: "*/30 * * * *" },
  });

  // Recálculo de scores: diário às 2h
  await syncQueue.add("score-recalculation", {}, {
    repeat: { pattern: "0 2 * * *" },
  });

  // Google Reviews refresh: diário às 6h
  await syncQueue.add("google-reviews-refresh", {}, {
    repeat: { pattern: "0 6 * * *" },
  });

  // Cleanup dados antigos: diário às 4h (tracking 90d, sync_logs 60d)
  await syncQueue.add("cleanup-old-data", {}, {
    repeat: { pattern: "0 4 * * *" },
  });

  // Briefing diário: 7h BRT = 10h UTC
  await syncQueue.add("briefing-diario", {}, {
    repeat: { pattern: "0 10 * * *" },
  });

  logger.info("Jobs agendados registrados: bling-sync (30min), scores (2h), google-reviews (6h), cleanup (4h), briefing (7h BRT)");
}

// ── Event listeners ────────────────────────────────────────────

syncWorker.on("failed", (job, err) => {
  logger.error("Job falhou definitivamente", { name: job?.name, id: job?.id, error: err.message });
});

syncWorker.on("completed", (job) => {
  logger.info("Job completado", { name: job.name, id: job.id });
});

// ── Graceful shutdown ─────────────────────────────────────────

export async function closeSyncQueue(): Promise<void> {
  logger.info("Encerrando sync worker e queue...");
  await syncWorker.close();
  await syncQueue.close();
  logger.info("Sync worker e queue encerrados");
}
