import { Queue, Worker } from "bullmq";
import { logger } from "../utils/logger";
import { processReadySteps, checkAbandonedCarts, checkProductInterest, checkLeadCartAbandoned, checkUnverifiedLeads, checkRepurchaseDue, checkTrackingCartAbandoned, checkHighIntentClients, checkVipInactivos, sendOperatorDailySummary } from "../services/flow.service";
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

        case "flow-check-interest": {
          const triggered = await checkProductInterest();
          result = { triggered };
          break;
        }

        case "flow-check-lead-cart": {
          const triggered = await checkLeadCartAbandoned();
          result = { triggered };
          break;
        }

        case "flow-check-unverified-leads": {
          const reminded = await checkUnverifiedLeads();
          result = { reminded };
          break;
        }

        case "flow-check-recompra": {
          const triggered = await checkRepurchaseDue();
          result = { triggered };
          break;
        }

        case "flow-check-tracking-cart": {
          const triggered = await checkTrackingCartAbandoned();
          result = { triggered };
          break;
        }

        case "flow-check-high-intent": {
          const criadas = await checkHighIntentClients();
          result = { criadas };
          break;
        }

        case "flow-cleanup-tracking": {
          const del = await query(
            `DELETE FROM crm.tracking_events WHERE criado_em < NOW() - INTERVAL '90 days'`
          );
          result = { deletados: (del as unknown as { rowCount: number }).rowCount || 0 };
          break;
        }

        case "flow-check-vip-inativo": {
          const criadas = await checkVipInactivos();
          result = { criadas };
          break;
        }

        case "flow-resumo-operador": {
          await sendOperatorDailySummary();
          result = { enviado: true };
          break;
        }

        default:
          logger.warn("Flow job desconhecido", { name: job.name });
          return;
      }

      const duration = Date.now() - startTime;

      // Log apenas se processou algo
      const total = (result.processed as number) || (result.triggered as number) || (result.reminded as number) || 0;
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
      ).catch((err) => { logger.warn("Falha ao registrar erro no sync_logs (flow)", { job: job.name, error: String(err) }); });

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

  // Verificar interesse em produtos: a cada 15 minutos
  await flowQueue.add("flow-check-interest", {}, {
    repeat: { pattern: "*/15 * * * *" },
  });

  // Verificar leads quentes que não compraram: a cada 10 minutos
  await flowQueue.add("flow-check-lead-cart", {}, {
    repeat: { pattern: "*/10 * * * *" },
  });

  // Lembrete para leads que não verificaram email: a cada 2 horas
  await flowQueue.add("flow-check-unverified-leads", {}, {
    repeat: { pattern: "0 */2 * * *" },
  });

  // Recompra inteligente: a cada 6 horas (09h, 15h, 21h, 03h)
  await flowQueue.add("flow-check-recompra", {}, {
    repeat: { pattern: "0 */6 * * *" },
  });

  // Carrinho abandonado via tracking: a cada 15 minutos
  await flowQueue.add("flow-check-tracking-cart", {}, {
    repeat: { pattern: "*/15 * * * *" },
  });

  // Clientes com alto interesse (4+ produtos em 48h): a cada 6 horas (07, 13, 19, 01 BRT)
  await flowQueue.add("flow-check-high-intent", {}, {
    repeat: { pattern: "0 10,16,22,4 * * *" },  // 07, 13, 19, 01 BRT = UTC-3
  });

  // VIPs inativos (60+ dias sem compra): 1x/dia às 08:45 BRT (11:45 UTC)
  await flowQueue.add("flow-check-vip-inativo", {}, {
    repeat: { pattern: "45 11 * * *" },
  });

  // Resumo diário para o operador: 9h BRT (12h UTC)
  await flowQueue.add("flow-resumo-operador", {}, {
    repeat: { pattern: "0 12 * * *" },
  });

  // Limpeza de tracking_events antigos (> 90 dias): 3h BRT (6h UTC)
  await flowQueue.add("flow-cleanup-tracking", {}, {
    repeat: { pattern: "0 6 * * *" },
  });

  logger.info("Flow jobs registrados: process-steps (1min), check-abandoned (5min), check-interest (15min), check-lead-cart (10min), check-unverified (2h), check-recompra (6h), high-intent (6h), vip-inativo (diário 08:45), resumo-operador (diário 9h), cleanup-tracking (3h BRT)");
}

// ── Event listeners ────────────────────────────────────────────

flowWorker.on("failed", (job, err) => {
  logger.error("Flow job falhou definitivamente", { name: job?.name, id: job?.id, error: err.message });
});

flowWorker.on("completed", (job) => {
  logger.info("Flow job completado", { name: job.name, id: job.id });
});

// ── Graceful shutdown ─────────────────────────────────────────

export async function closeFlowQueue(): Promise<void> {
  logger.info("Encerrando flow worker e queue...");
  await flowWorker.close();
  await flowQueue.close();
  logger.info("Flow worker e queue encerrados");
}
