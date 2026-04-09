import { Router } from "express";
import fs from "fs";
import { authMiddleware } from "../middleware/auth";
import { query } from "../db";
import { logger } from "../utils/logger";

const router = Router();
router.use(authMiddleware);

const STATS_FILE = "/app/data/system-stats.json";

interface SystemStats {
  hostname: string;
  platform: string;
  uptime_seconds: number;
  cpus: number;
  load_avg: { "1m": number; "5m": number; "15m": number };
  disk: { total: string; used: string; avail: string; pct: number };
  memory: { total: number; used: number; available: number; pct: number };
  swap: { total: string; used: string; pct: number };
  containers: Array<{ name: string; status: string; healthy: boolean; memory: string; cpu: string }>;
  certs: Array<{ domain: string; expiry: string; days: number }>;
  git: { commits: number; last_commit: string; last_date: string };
  code: { total_lines: number; total_files: number; by_layer: Record<string, number> };
  generated_at: string;
}

function readStats(): SystemStats | null {
  try {
    if (!fs.existsSync(STATS_FILE)) return null;
    const raw = fs.readFileSync(STATS_FILE, "utf-8");
    return JSON.parse(raw);
  } catch (err) {
    logger.error("Erro ao ler system-stats.json", { error: err instanceof Error ? err.message : "desconhecido" });
    return null;
  }
}

function getAlerts(stats: SystemStats) {
  const alerts: Array<{ level: "critical" | "warning" | "info"; message: string }> = [];

  if (stats.disk.pct >= 90) alerts.push({ level: "critical", message: `Disco em ${stats.disk.pct}% — risco de parada` });
  else if (stats.disk.pct >= 75) alerts.push({ level: "warning", message: `Disco em ${stats.disk.pct}% — atencao` });

  if (stats.memory.pct >= 90) alerts.push({ level: "critical", message: `RAM em ${stats.memory.pct}% — risco de OOM` });
  else if (stats.memory.pct >= 75) alerts.push({ level: "warning", message: `RAM em ${stats.memory.pct}% — monitorar` });

  if (stats.swap.pct >= 50) alerts.push({ level: "warning", message: `Swap em ${stats.swap.pct}% — sistema sob pressao de memoria` });

  const unhealthy = stats.containers.filter(c => !c.healthy && c.status && !c.status.includes("starting"));
  for (const c of unhealthy) {
    alerts.push({ level: "warning", message: `Container ${c.name} sem healthcheck ou unhealthy` });
  }

  for (const cert of stats.certs) {
    if (cert.days <= 7) alerts.push({ level: "critical", message: `SSL ${cert.domain} expira em ${cert.days} dias` });
    else if (cert.days <= 30) alerts.push({ level: "warning", message: `SSL ${cert.domain} expira em ${cert.days} dias` });
  }

  if (alerts.length === 0) alerts.push({ level: "info", message: "Todos os sistemas operando normalmente" });

  return alerts;
}

// GET /api/system/status
router.get("/status", async (_req, res) => {
  try {
    const stats = readStats();
    if (!stats) {
      return res.status(503).json({ error: "Stats do sistema ainda nao foram geradas. Aguarde 1 minuto." });
    }

    const alerts = getAlerts(stats);

    // DB stats (query direta — roda dentro do container)
    const dbStats = await query(`
      SELECT
        (SELECT count(*) FROM crm.customers) as customers,
        (SELECT count(*) FROM marketing.leads) as leads,
        (SELECT count(*) FROM sync.bling_orders) as orders,
        (SELECT count(*) FROM marketing.flows) as flows,
        (SELECT count(*) FROM marketing.campaigns) as campaigns,
        (SELECT pg_database_size(current_database())) as db_size
    `);
    const db_info = dbStats[0] || {};

    res.json({
      ...stats,
      alerts,
      db: {
        customers: Number(db_info.customers) || 0,
        leads: Number(db_info.leads) || 0,
        orders: Number(db_info.orders) || 0,
        flows: Number(db_info.flows) || 0,
        campaigns: Number(db_info.campaigns) || 0,
        size: db_info.db_size ? `${Math.round(Number(db_info.db_size) / 1024 / 1024)}MB` : "?",
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    logger.error("Erro ao buscar status do sistema", { error: msg });
    res.status(500).json({ error: "Erro ao buscar status do sistema" });
  }
});

// GET /api/system/code-stats
router.get("/code-stats", (_req, res) => {
  try {
    const stats = readStats();
    if (!stats?.code) {
      return res.status(503).json({ error: "Stats de codigo ainda nao foram geradas." });
    }
    res.json(stats.code);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    logger.error("Erro ao buscar code stats", { error: msg });
    res.status(500).json({ error: "Erro ao buscar code stats" });
  }
});

export { router as systemRouter };
