import { Router } from "express";
import fs from "fs";
import { authMiddleware, requireAdmin } from "../middleware/auth";
import { logger } from "../utils/logger";
import { z } from "zod";

const router = Router();
router.use(authMiddleware);
router.use(requireAdmin);

const FIREWALL_FILE = "/app/data/firewall-stats.json";

function readFirewallStats(): Record<string, unknown> | null {
  try {
    if (!fs.existsSync(FIREWALL_FILE)) return null;
    return JSON.parse(fs.readFileSync(FIREWALL_FILE, "utf-8"));
  } catch {
    return null;
  }
}

// GET /api/firewall/status — dashboard de segurança
router.get("/status", (_req, res) => {
  const stats = readFirewallStats();
  if (!stats) {
    return res.status(503).json({ error: "Stats de firewall ainda nao foram geradas. Aguarde 1 minuto." });
  }
  res.json(stats);
});

// POST /api/firewall/whitelist — adicionar IP à whitelist SSH
const addIpSchema = z.object({
  ip: z.string().regex(/^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/, "IP invalido (ex: 192.168.1.1 ou 192.168.1.0/24)"),
  label: z.string().min(1).max(100),
});

router.post("/whitelist", (req, res) => {
  const parsed = addIpSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const { ip, label } = parsed.data;
  // Escreve instrução para o script do host processar
  const pendingFile = "/app/data/firewall-pending.json";
  const pending = fs.existsSync(pendingFile) ? JSON.parse(fs.readFileSync(pendingFile, "utf-8")) : [];
  pending.push({ action: "add", ip, label, requested_at: new Date().toISOString() });
  fs.writeFileSync(pendingFile, JSON.stringify(pending, null, 2));

  logger.info(`Whitelist SSH solicitado: ${ip} (${label})`);
  res.json({ ok: true, message: `IP ${ip} sera adicionado na proxima execucao do cron (1 min)` });
});

// DELETE /api/firewall/whitelist/:ip — remover IP da whitelist
router.delete("/whitelist/:ip", (req, res) => {
  const ip = req.params.ip.replace(/_/g, "/"); // frontend envia / como _
  const pendingFile = "/app/data/firewall-pending.json";
  const pending = fs.existsSync(pendingFile) ? JSON.parse(fs.readFileSync(pendingFile, "utf-8")) : [];
  pending.push({ action: "remove", ip, requested_at: new Date().toISOString() });
  fs.writeFileSync(pendingFile, JSON.stringify(pending, null, 2));

  logger.info(`Remoção de whitelist SSH solicitado: ${ip}`);
  res.json({ ok: true, message: `IP ${ip} sera removido na proxima execucao do cron (1 min)` });
});

// POST /api/firewall/unban/:ip — desbanir IP do Fail2ban
router.post("/unban/:ip", (req, res) => {
  const ip = req.params.ip;
  const pendingFile = "/app/data/firewall-pending.json";
  const pending = fs.existsSync(pendingFile) ? JSON.parse(fs.readFileSync(pendingFile, "utf-8")) : [];
  pending.push({ action: "unban", ip, requested_at: new Date().toISOString() });
  fs.writeFileSync(pendingFile, JSON.stringify(pending, null, 2));

  logger.info(`Unban SSH solicitado: ${ip}`);
  res.json({ ok: true, message: `IP ${ip} sera desbanido na proxima execucao do cron (1 min)` });
});

export { router as firewallRouter };
