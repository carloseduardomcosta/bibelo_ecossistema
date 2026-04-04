import { Router, Request, Response } from "express";
import { query } from "../db";
import { authMiddleware } from "../middleware/auth";
import { flowQueue } from "../queues/flow.queue";
import { syncQueue } from "../queues/sync.queue";

export const queueMonitorRouter = Router();
queueMonitorRouter.use(authMiddleware);

// ── GET /api/queues/status — Status de todas as filas ───────────

queueMonitorRouter.get("/status", async (_req: Request, res: Response) => {
  // Status das filas BullMQ
  const [flowCounts, syncCounts] = await Promise.all([
    flowQueue.getJobCounts("active", "completed", "failed", "delayed", "waiting"),
    syncQueue.getJobCounts("active", "completed", "failed", "delayed", "waiting"),
  ]);

  // Jobs repetitivos registrados
  const [flowRepeatable, syncRepeatable] = await Promise.all([
    flowQueue.getRepeatableJobs(),
    syncQueue.getRepeatableJobs(),
  ]);

  // Últimas execuções com resultado (sync_logs)
  const ultimasExecucoes = await query<{
    fonte: string; tipo: string; status: string; registros: number; erro: string; criado_em: string;
  }>(`
    SELECT fonte, tipo, status, registros, erro, criado_em
    FROM sync.sync_logs
    WHERE criado_em >= NOW() - INTERVAL '24 hours'
    ORDER BY criado_em DESC
    LIMIT 30
  `);

  // Erros recentes
  const errosRecentes = await query<{
    tipo: string; erro: string; criado_em: string;
  }>(`
    SELECT tipo, erro, criado_em
    FROM sync.sync_logs
    WHERE status = 'erro' AND criado_em >= NOW() - INTERVAL '48 hours'
    ORDER BY criado_em DESC
    LIMIT 10
  `);

  // Agrupar por job: última execução + contagem ok/erro
  const resumoPorJob = await query<{
    tipo: string; total: number; ok: number; erros: number; ultima: string; ultimo_resultado: number;
  }>(`
    SELECT tipo,
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE status = 'ok')::int AS ok,
      COUNT(*) FILTER (WHERE status = 'erro')::int AS erros,
      MAX(criado_em) AS ultima,
      (SELECT registros FROM sync.sync_logs s2 WHERE s2.tipo = s1.tipo ORDER BY criado_em DESC LIMIT 1) AS ultimo_resultado
    FROM sync.sync_logs s1
    WHERE criado_em >= NOW() - INTERVAL '24 hours'
    GROUP BY tipo
    ORDER BY MAX(criado_em) DESC
  `);

  res.json({
    filas: {
      flow: {
        nome: "bibelo-flows",
        ...flowCounts,
        jobs_repetitivos: flowRepeatable.map(j => ({
          nome: j.name,
          pattern: j.pattern,
          proxima: j.next ? new Date(j.next).toISOString() : null,
        })),
      },
      sync: {
        nome: "bibelo-sync",
        ...syncCounts,
        jobs_repetitivos: syncRepeatable.map(j => ({
          nome: j.name,
          pattern: j.pattern,
          proxima: j.next ? new Date(j.next).toISOString() : null,
        })),
      },
    },
    resumo_24h: resumoPorJob,
    ultimas_execucoes: ultimasExecucoes,
    erros_recentes: errosRecentes,
  });
});
