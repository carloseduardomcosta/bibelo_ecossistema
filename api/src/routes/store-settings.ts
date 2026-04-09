/**
 * Configurações da Loja Online — BibelôCRM
 * GET público (storefront lê) + PUT autenticado (CRM edita)
 */

import { Router, Request, Response } from "express";
import { z } from "zod";
import { query, queryOne } from "../db";
import { authMiddleware } from "../middleware/auth";
import { logger } from "../utils/logger";

export const storeSettingsRouter = Router();

// ── Cache em memória (5 min) ─────────────────────────────────

interface SettingRow {
  categoria: string;
  chave: string;
  valor: string;
  tipo: string;
  label: string;
  descricao: string | null;
  ordem: number;
  atualizado_em: string;
}

let cachedSettings: Record<string, Record<string, string>> | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

function invalidateCache() {
  cachedSettings = null;
  cacheTimestamp = 0;
}

// ── GET /api/store-settings — público (storefront consome) ───

storeSettingsRouter.get("/store-settings", async (_req: Request, res: Response) => {
  try {
    // Cache hit
    if (cachedSettings && Date.now() - cacheTimestamp < CACHE_TTL) {
      res.json(cachedSettings);
      return;
    }

    const rows = await query<SettingRow>(
      "SELECT categoria, chave, valor FROM public.store_settings ORDER BY categoria, ordem"
    );

    const settings: Record<string, Record<string, string>> = {};
    for (const row of rows) {
      if (!settings[row.categoria]) settings[row.categoria] = {};
      settings[row.categoria][row.chave] = row.valor;
    }

    cachedSettings = settings;
    cacheTimestamp = Date.now();

    res.json(settings);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro";
    logger.error("store-settings GET erro:", { error: msg });
    res.status(500).json({ error: "Erro ao buscar configurações" });
  }
});

// ── GET /api/store-settings/all — autenticado (CRM com metadados) ───

storeSettingsRouter.get("/store-settings/all", authMiddleware, async (_req: Request, res: Response) => {
  try {
    const rows = await query<SettingRow>(
      "SELECT * FROM public.store_settings ORDER BY categoria, ordem"
    );

    // Agrupar por categoria
    const grouped: Record<string, SettingRow[]> = {};
    for (const row of rows) {
      if (!grouped[row.categoria]) grouped[row.categoria] = [];
      grouped[row.categoria].push(row);
    }

    res.json(grouped);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro";
    logger.error("store-settings/all GET erro:", { error: msg });
    res.status(500).json({ error: "Erro ao buscar configurações" });
  }
});

// ── PUT /api/store-settings — autenticado (CRM edita) ────────

const updateSchema = z.object({
  settings: z.array(z.object({
    categoria: z.string().min(1),
    chave: z.string().min(1),
    valor: z.string(),
  })),
});

storeSettingsRouter.put("/store-settings", authMiddleware, async (req: Request, res: Response) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Formato inválido", details: parsed.error.issues });
    return;
  }

  const { settings } = parsed.data;

  try {
    let updated = 0;
    for (const s of settings) {
      const result = await query(
        `UPDATE public.store_settings
         SET valor = $1, atualizado_em = NOW()
         WHERE categoria = $2 AND chave = $3`,
        [s.valor, s.categoria, s.chave]
      );
      if (result && (result as any).rowCount > 0) updated++;
    }

    invalidateCache();
    logger.info(`Store settings atualizadas: ${updated}/${settings.length} campos`);

    res.json({ ok: true, updated });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro";
    logger.error("store-settings PUT erro:", { error: msg });
    res.status(500).json({ error: "Erro ao salvar configurações" });
  }
});
