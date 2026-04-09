/**
 * Configurações da Loja Online — BibelôCRM
 * GET público (storefront lê) + PUT autenticado (CRM edita)
 * Logs completos de auditoria em todas as operações
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

// ── Campos que armazenam centavos no banco mas exibem reais no CRM ──

const CENTAVOS_FIELDS = new Set([
  "frete_gratis_valor",
  "cartao_parcela_min",
]);

// ── GET /api/store-settings — público (storefront consome) ───

storeSettingsRouter.get("/store-settings", async (req: Request, res: Response) => {
  const startTime = Date.now();

  try {
    // Cache hit
    if (cachedSettings && Date.now() - cacheTimestamp < CACHE_TTL) {
      logger.info("store-settings GET (cache hit)", {
        ip: req.ip,
        elapsed: `${Date.now() - startTime}ms`,
      });
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

    logger.info("store-settings GET (db)", {
      categorias: Object.keys(settings).length,
      campos: rows.length,
      elapsed: `${Date.now() - startTime}ms`,
    });

    res.json(settings);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro";
    logger.error("store-settings GET erro:", { error: msg });
    res.status(500).json({ error: "Erro ao buscar configurações" });
  }
});

// ── GET /api/store-settings/all — autenticado (CRM com metadados) ───

storeSettingsRouter.get("/store-settings/all", authMiddleware, async (req: Request, res: Response) => {
  const startTime = Date.now();

  try {
    const rows = await query<SettingRow>(
      "SELECT * FROM public.store_settings ORDER BY categoria, ordem"
    );

    // Agrupar por categoria, convertendo centavos→reais para exibição
    const grouped: Record<string, SettingRow[]> = {};
    for (const row of rows) {
      if (!grouped[row.categoria]) grouped[row.categoria] = [];

      // Converter centavos→reais para campos de valor monetário
      if (CENTAVOS_FIELDS.has(row.chave) && row.tipo === "number") {
        row.valor = (Number(row.valor) / 100).toFixed(2);
        row.tipo = "currency";
      }

      grouped[row.categoria].push(row);
    }

    logger.info("store-settings/all GET", {
      user: (req as any).user?.email || "?",
      categorias: Object.keys(grouped).length,
      campos: rows.length,
      elapsed: `${Date.now() - startTime}ms`,
    });

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
  const startTime = Date.now();
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    logger.warn("store-settings PUT validação falhou", {
      user: (req as any).user?.email || "?",
      issues: parsed.error.issues,
    });
    res.status(400).json({ error: "Formato inválido", details: parsed.error.issues });
    return;
  }

  const { settings } = parsed.data;
  const userEmail = (req as any).user?.email || "desconhecido";

  try {
    // Buscar valores antigos para log de auditoria
    const oldValues: Record<string, string> = {};
    for (const s of settings) {
      const old = await queryOne<{ valor: string }>(
        "SELECT valor FROM public.store_settings WHERE categoria = $1 AND chave = $2",
        [s.categoria, s.chave]
      );
      if (old) oldValues[`${s.categoria}.${s.chave}`] = old.valor;
    }

    let updated = 0;
    const changes: string[] = [];

    for (const s of settings) {
      // Converter reais→centavos para campos monetários
      let finalValue = s.valor;
      if (CENTAVOS_FIELDS.has(s.chave)) {
        finalValue = String(Math.round(Number(s.valor) * 100));
      }

      const result = await query(
        `UPDATE public.store_settings
         SET valor = $1, atualizado_em = NOW()
         WHERE categoria = $2 AND chave = $3`,
        [finalValue, s.categoria, s.chave]
      );

      if (result && (result as any).rowCount > 0) {
        updated++;
        const key = `${s.categoria}.${s.chave}`;
        const oldVal = oldValues[key];
        if (oldVal !== finalValue) {
          changes.push(`${key}: "${oldVal}" → "${finalValue}"`);
        }
      }
    }

    invalidateCache();

    // Log de auditoria completo
    logger.info("store-settings PUT — configurações atualizadas", {
      user: userEmail,
      total: settings.length,
      updated,
      changes,
      elapsed: `${Date.now() - startTime}ms`,
    });

    res.json({ ok: true, updated });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro";
    logger.error("store-settings PUT erro:", {
      user: userEmail,
      error: msg,
      settings: settings.map((s) => `${s.categoria}.${s.chave}`),
    });
    res.status(500).json({ error: "Erro ao salvar configurações" });
  }
});
