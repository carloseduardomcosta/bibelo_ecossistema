/**
 * Painel de Sincronização de Categorias — Bling ↔ Medusa
 *
 * GET  /api/categorias-sync             — lista mapeamentos + stats + dropdown Medusa
 * POST /api/categorias-sync/importar    — importa categorias do Bling (upsert pending)
 * PUT  /api/categorias-sync/:blingId    — salva mapeamento manual (mapear / ignorar)
 * POST /api/categorias-sync/sincronizar — aplica todos os 'mapped' nos produtos do Medusa
 */

import { Router, Request, Response } from "express";
import { z } from "zod";
import { query, queryOne } from "../db";
import { authMiddleware } from "../middleware/auth";
import { logger } from "../utils/logger";
import { fetchCategoryMap } from "../integrations/bling/sync";
import { getValidToken } from "../integrations/bling/auth";
import { getMedusaCategoriesFromMedusa, applyCategoryMappingToMedusa } from "../integrations/medusa/sync";

export const categoriaSyncRouter = Router();

// ── GET /api/categorias-sync ─────────────────────────────────
// Retorna mapeamentos, stats e lista de categorias Medusa para o dropdown

categoriaSyncRouter.get("/", authMiddleware, async (_req: Request, res: Response) => {
  const mapeamentos = await query<{
    bling_category_id: string;
    bling_category_name: string | null;
    nome: string;
    medusa_category_id: string | null;
    handle: string | null;
    bling_parent_id: string | null;
    id_pai_nome: string | null;
    status: string;
    origem: string | null;
    sincronizado_em: string;
    created_at: string;
  }>(
    `SELECT bmc.bling_category_id,
            bmc.bling_category_name,
            bmc.nome,
            bmc.medusa_category_id,
            bmc.handle,
            bmc.bling_parent_id,
            bc_pai.descricao AS id_pai_nome,
            bmc.status,
            bmc.origem,
            bmc.sincronizado_em,
            bmc.created_at
       FROM sync.bling_medusa_categories bmc
  LEFT JOIN sync.bling_categories bc_pai
         ON bc_pai.bling_id = bmc.bling_parent_id
      ORDER BY bmc.status DESC,
               COALESCE(bmc.bling_category_name, bmc.nome)`
  );

  const total   = mapeamentos.length;
  const mapped  = mapeamentos.filter((m) => m.status === "mapped").length;
  const pending = mapeamentos.filter((m) => m.status === "pending").length;
  const ignored = mapeamentos.filter((m) => m.status === "ignored").length;

  // Categorias Medusa para o dropdown (falha silenciosa — Medusa pode estar offline)
  let medusaCategorias: Array<{ id: string; name: string; handle: string; parent_id: string | null }> = [];
  try {
    medusaCategorias = await getMedusaCategoriesFromMedusa();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro";
    logger.warn("Falha ao buscar categorias Medusa para painel", { error: msg });
  }

  // Última operação registrada no log
  const ultimoLog = await queryOne<{
    operacao: string;
    usuario: string | null;
    detalhes: Record<string, unknown> | null;
    criado_em: string;
  }>(
    `SELECT operacao, usuario, detalhes, criado_em
       FROM sync.category_sync_log
      ORDER BY criado_em DESC
      LIMIT 1`
  );

  res.json({ mapeamentos, stats: { total, mapped, pending, ignored }, medusaCategorias, ultimoLog: ultimoLog ?? null });
});

// ── POST /api/categorias-sync/importar ───────────────────────
// Importa categorias da API Bling e faz upsert na tabela de mapeamento.
// Novo  → insere como 'pending' (sem medusa_category_id).
// Existente → atualiza nome, preserva status e mapeamento.

categoriaSyncRouter.post("/importar", authMiddleware, async (req: Request, res: Response) => {
  const usuario = (req as any).user?.email as string | undefined;
  logger.info("Importação categorias Bling iniciada", { usuario });

  const token      = await getValidToken();
  const categoryMap = await fetchCategoryMap(token, true); // force refresh → persiste em sync.bling_categories

  let novas     = 0;
  let existentes = 0;

  for (const [catId, catName] of categoryMap) {
    const catIdStr = String(catId);

    // Hierarquia já está em sync.bling_categories (populada pelo fetchCategoryMap acima)
    const bc = await queryOne<{ id_pai: string | null }>(
      "SELECT id_pai FROM sync.bling_categories WHERE bling_id = $1",
      [catIdStr]
    );

    const existing = await queryOne<{ status: string }>(
      "SELECT status FROM sync.bling_medusa_categories WHERE bling_category_id = $1",
      [catIdStr]
    );

    if (!existing) {
      await query(
        `INSERT INTO sync.bling_medusa_categories
           (bling_category_id, bling_category_name, medusa_category_id, nome,
            handle, bling_parent_id, status, origem, created_at, sincronizado_em)
         VALUES ($1, $2, NULL, $2, NULL, $3, 'pending', 'manual', NOW(), NOW())`,
        [catIdStr, catName, bc?.id_pai ?? null]
      );
      novas++;
    } else {
      // Mantém status/medusa_category_id intactos — só atualiza o nome e hierarquia
      await query(
        `UPDATE sync.bling_medusa_categories
            SET bling_category_name = $2,
                nome                 = $2,
                bling_parent_id      = COALESCE($3, bling_parent_id),
                sincronizado_em      = NOW()
          WHERE bling_category_id   = $1`,
        [catIdStr, catName, bc?.id_pai ?? null]
      );
      existentes++;
    }
  }

  await query(
    `INSERT INTO sync.category_sync_log (operacao, origem, usuario, detalhes)
     VALUES ('importar', 'manual', $1, $2)`,
    [usuario ?? null, JSON.stringify({ total: categoryMap.size, novas, existentes })]
  );

  logger.info("Importação categorias Bling concluída", { novas, existentes, total: categoryMap.size });
  res.json({ message: "Categorias importadas.", total: categoryMap.size, novas, existentes });
});

// ── PUT /api/categorias-sync/:blingId ────────────────────────
// Salva mapeamento manual: define medusa_category_id e status (mapped / ignored / pending)

const updateSchema = z.object({
  status:             z.enum(["mapped", "pending", "ignored"]),
  medusa_category_id: z.string().nullable().optional(),
  medusa_handle:      z.string().nullable().optional(),
});

categoriaSyncRouter.put("/:blingId", authMiddleware, async (req: Request, res: Response) => {
  const { blingId } = req.params;
  const body    = updateSchema.parse(req.body);
  const usuario = (req as any).user?.email as string | undefined;

  await query(
    `UPDATE sync.bling_medusa_categories
        SET status             = $2,
            medusa_category_id = $3,
            handle             = COALESCE($4, handle),
            origem             = 'manual',
            sincronizado_em    = NOW()
      WHERE bling_category_id  = $1`,
    [blingId, body.status, body.medusa_category_id ?? null, body.medusa_handle ?? null]
  );

  const operacao = body.status === "ignored" ? "ignorar" : "mapear";
  await query(
    `INSERT INTO sync.category_sync_log (operacao, origem, usuario, detalhes)
     VALUES ($1, 'manual', $2, $3)`,
    [
      operacao,
      usuario ?? null,
      JSON.stringify({
        bling_category_id:  blingId,
        status:             body.status,
        medusa_category_id: body.medusa_category_id ?? null,
      }),
    ]
  );

  const updated = await queryOne(
    "SELECT * FROM sync.bling_medusa_categories WHERE bling_category_id = $1",
    [blingId]
  );

  logger.info("Mapeamento de categoria atualizado", { blingId, status: body.status, usuario });
  res.json({ ok: true, mapeamento: updated });
});

// ── POST /api/categorias-sync/sincronizar ────────────────────
// Aplica todos os mapeamentos 'mapped' nos produtos do Medusa.
// Comportamento: REPLACE (substitui a categoria do produto — Medusa v2 API).
// Seguro pois cada produto Bling tem exatamente 1 categoria.
// Opera em background — responde imediatamente.

categoriaSyncRouter.post("/sincronizar", authMiddleware, async (req: Request, res: Response) => {
  const usuario = (req as any).user?.email as string | undefined;
  logger.info("Sincronização categorias → Medusa iniciada", { usuario });

  res.json({ message: "Sincronização iniciada em background. Acompanhe pelos logs." });

  try {
    const rows = await query<{ bling_category_id: string; medusa_category_id: string }>(
      `SELECT bling_category_id, medusa_category_id
         FROM sync.bling_medusa_categories
        WHERE status = 'mapped' AND medusa_category_id IS NOT NULL`
    );

    const mapping = new Map(rows.map((r) => [r.bling_category_id, r.medusa_category_id]));
    const result  = await applyCategoryMappingToMedusa(mapping);

    await query(
      `INSERT INTO sync.category_sync_log (operacao, origem, usuario, detalhes)
       VALUES ('sincronizar', 'manual', $1, $2)`,
      [usuario ?? null, JSON.stringify({ ...result, categorias_mapeadas: mapping.size })]
    );

    logger.info("Sincronização categorias concluída", result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro";
    logger.error("Sincronização categorias falhou", { error: msg });
    await query(
      `INSERT INTO sync.category_sync_log (operacao, origem, usuario, detalhes)
       VALUES ('sincronizar', 'manual', $1, $2)`,
      [usuario ?? null, JSON.stringify({ erro: msg })]
    );
  }
});
