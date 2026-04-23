import { Queue, Worker } from "bullmq";
import { logger } from "../utils/logger";
import { incrementalSync } from "../integrations/bling/sync";
import { syncBlingToMedusa } from "../integrations/medusa/sync";
import { calculateScore } from "../services/customer.service";
import { triggerFlow } from "../services/flow.service";
import { refreshReviewsCache } from "../integrations/google/reviews";
import { syncMetaAds } from "../services/meta.service";
import { syncInstagram } from "../integrations/meta/instagram";
import { syncAudiences } from "../integrations/meta/audiences";
import { syncWahaVipBulk } from "../integrations/whatsapp/waha";
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

        case "medusa-sync-products": {
          const medusaResult = await syncBlingToMedusa();
          result = {
            processed: medusaResult.created + medusaResult.updated,
            created: medusaResult.created,
            updated: medusaResult.updated,
            errors: medusaResult.errors,
          };
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
                // Último produto comprado — personaliza o email de reativação
                const ultimoItem = await queryOne<{ nome: string; criado_em: string }>(
                  `SELECT nome, criado_em FROM crm.order_items
                   WHERE customer_id = $1 ORDER BY criado_em DESC LIMIT 1`,
                  [c.id]
                );
                const diasSemCompra = ultimoItem
                  ? Math.floor((Date.now() - new Date(ultimoItem.criado_em).getTime()) / 86_400_000)
                  : null;

                await triggerFlow("customer.inactive", c.id, {
                  risco_anterior: riscoAntes,
                  risco_atual: "alto",
                  ultimo_produto: ultimoItem?.nome ?? null,
                  dias_sem_compra: diasSemCompra,
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

        case "meta-ads-sync": {
          const metaResult = await syncMetaAds();
          result = {
            processed: metaResult.campaigns + metaResult.dailyInsights,
            ...metaResult,
          };
          break;
        }

        case "instagram-sync": {
          const igResult = await syncInstagram();
          result = {
            processed: igResult.dias + igResult.posts,
            ...igResult,
          };
          break;
        }

        case "meta-audiences-sync": {
          const audienceResults = await syncAudiences();
          const sincronizados = audienceResults.filter(r => !r.erro).length;
          const erros = audienceResults.filter(r => !!r.erro).length;
          result = { processed: sincronizados, sincronizados, erros };
          break;
        }

        case "waha-vip-sync": {
          const wahaResult = await syncWahaVipBulk();
          result = { processed: wahaResult.atualizados, ...wahaResult };
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

  // Medusa sync — REATIVADO com safeguards (kill switch, circuit breaker, dry-run)
  // Roda 5min após o Bling sync (que roda em */30), garantindo dados frescos
  // Controlado via kill switch: POST /api/sync/medusa/config { enabled: true/false, mode: "dry-run"|"live" }
  await syncQueue.add("medusa-sync-products", {}, {
    repeat: { pattern: "5,35 * * * *" },
  });

  // Google Reviews refresh: diário às 6h
  await syncQueue.add("google-reviews-refresh", {}, {
    repeat: { pattern: "0 6 * * *" },
  });

  // Cleanup dados antigos: diário às 4h (tracking 90d, sync_logs 60d)
  await syncQueue.add("cleanup-old-data", {}, {
    repeat: { pattern: "0 4 * * *" },
  });

  // Meta Ads sync: a cada 6h (0h, 6h, 12h, 18h UTC)
  await syncQueue.add("meta-ads-sync", {}, {
    repeat: { pattern: "0 */6 * * *" },
  });

  // Instagram organic sync: diário às 07:00 (janela 2 dias, acumula histórico)
  await syncQueue.add("instagram-sync", {}, {
    repeat: { pattern: "0 7 * * *" },
  });

  // Meta Audiences sync: diário às 03:00 BRT = 06:00 UTC
  // Sincroniza 4 segmentos CRM → Meta Custom Audiences para lookalike e retargeting
  await syncQueue.add("meta-audiences-sync", {}, {
    repeat: { pattern: "0 6 * * *" },
  });

  // WAHA VIP sync: toda segunda-feira às 08:00 BRT = 11:00 UTC
  // Atualiza campo vip_grupo_wp em crm.customers com base nos membros do grupo WhatsApp
  await syncQueue.add("waha-vip-sync", {}, {
    repeat: { pattern: "0 11 * * 1" },
  });

  logger.info("Jobs agendados: bling-sync (30min), scores (2h), google-reviews (6h), cleanup (4h), meta-ads (6h), instagram (7h), meta-audiences (6h UTC), waha-vip (seg 8h)");
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
