import { Router, Request, Response } from "express"
import { z } from "zod"
import { query, queryOne } from "../db"
import { authMiddleware, requireAdmin } from "../middleware/auth"
import { logger } from "../utils/logger"
import { setMedusaProductStatus } from "../integrations/medusa/sync"

export const curadoriaRouter = Router()

// ── GET /stats ────────────────────────────────────────────────

curadoriaRouter.get("/stats", authMiddleware, async (_req: Request, res: Response) => {
  const row = await queryOne<{
    pending: string
    approved: string
    rejected: string
    auto: string
    missing_image: string
    missing_price: string
    unmapped_category: string
  }>(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'pending')           AS pending,
       COUNT(*) FILTER (WHERE status = 'approved')          AS approved,
       COUNT(*) FILTER (WHERE status = 'rejected')          AS rejected,
       COUNT(*) FILTER (WHERE status = 'auto')              AS auto,
       COUNT(*) FILTER (WHERE missing_image = true)         AS missing_image,
       COUNT(*) FILTER (WHERE missing_price = true)         AS missing_price,
       COUNT(*) FILTER (WHERE unmapped_category = true)     AS unmapped_category
     FROM sync.product_publish_control`
  )

  res.json({
    pending:           Number(row?.pending ?? 0),
    approved:          Number(row?.approved ?? 0),
    rejected:          Number(row?.rejected ?? 0),
    auto:              Number(row?.auto ?? 0),
    missing_image:     Number(row?.missing_image ?? 0),
    missing_price:     Number(row?.missing_price ?? 0),
    unmapped_category: Number(row?.unmapped_category ?? 0),
  })
})

// ── GET /pendentes ────────────────────────────────────────────

const pendentesSchema = z.object({
  page:   z.coerce.number().int().min(1).default(1),
  limit:  z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(["pending", "approved", "rejected", "auto"]).optional(),
})

curadoriaRouter.get("/pendentes", authMiddleware, async (req: Request, res: Response) => {
  const parsed = pendentesSchema.safeParse(req.query)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }

  const { page, limit, status } = parsed.data
  const offset = (page - 1) * limit

  const listParams: unknown[]  = status ? [limit, offset, status] : [limit, offset]
  const countParams: unknown[] = status ? [status] : []
  const listWhere  = status ? "WHERE ppc.status = $3" : ""
  const countWhere = status ? "WHERE status = $1"     : ""

  const items = await query<{
    sku: string
    bling_id: string | null
    medusa_id: string | null
    status: string
    missing_image: boolean
    missing_price: boolean
    unmapped_category: boolean
    nome_original: string | null
    categoria_bling: string | null
    motivo: string | null
    updated_at: string
    preco_venda: string | null
    tem_foto: boolean
  }>(
    `SELECT
       ppc.sku,
       ppc.bling_id::text,
       ppc.medusa_id,
       ppc.status,
       ppc.missing_image,
       ppc.missing_price,
       ppc.unmapped_category,
       ppc.nome_original,
       ppc.categoria_bling,
       ppc.motivo,
       ppc.updated_at,
       bp.preco_venda::text,
       COALESCE(jsonb_array_length(bp.imagens) > 0, false) AS tem_foto
     FROM sync.product_publish_control ppc
     LEFT JOIN sync.bling_products bp ON bp.bling_id = ppc.bling_id
     ${listWhere}
     ORDER BY ppc.updated_at DESC
     LIMIT $1 OFFSET $2`,
    listParams
  )

  const countRow = await queryOne<{ total: string }>(
    `SELECT COUNT(*)::text AS total FROM sync.product_publish_control ${countWhere}`,
    countParams
  )

  res.json({
    items,
    total: Number(countRow?.total ?? 0),
    page,
    limit,
  })
})

// ── POST /aprovar ─────────────────────────────────────────────

const aprovSchema = z.object({
  skus: z.array(z.string().min(1)).min(1).max(100),
})

curadoriaRouter.post("/aprovar", authMiddleware, requireAdmin, async (req: Request, res: Response) => {
  const parsed = aprovSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }

  const { skus } = parsed.data
  let aprovados = 0
  const erros: string[] = []

  for (const sku of skus) {
    try {
      const ctrl = await queryOne<{ medusa_id: string | null }>(
        `UPDATE sync.product_publish_control
         SET status = 'approved', motivo = NULL, updated_at = NOW()
         WHERE sku = $1
         RETURNING medusa_id`,
        [sku]
      )

      if (ctrl?.medusa_id) {
        await setMedusaProductStatus(ctrl.medusa_id, "published")
      }

      aprovados++
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro"
      logger.error(`Curadoria aprovar SKU=${sku}: ${msg}`)
      erros.push(sku)
    }
  }

  res.json({ aprovados, erros })
})

// ── POST /rejeitar ────────────────────────────────────────────

const rejeitarSchema = z.object({
  skus:   z.array(z.string().min(1)).min(1).max(100),
  motivo: z.string().max(500).optional(),
})

curadoriaRouter.post("/rejeitar", authMiddleware, requireAdmin, async (req: Request, res: Response) => {
  const parsed = rejeitarSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }

  const { skus, motivo } = parsed.data
  let rejeitados = 0
  const erros: string[] = []

  for (const sku of skus) {
    try {
      const ctrl = await queryOne<{ medusa_id: string | null }>(
        `UPDATE sync.product_publish_control
         SET status = 'rejected', motivo = $2, updated_at = NOW()
         WHERE sku = $1
         RETURNING medusa_id`,
        [sku, motivo ?? null]
      )

      if (ctrl?.medusa_id) {
        await setMedusaProductStatus(ctrl.medusa_id, "draft")
      }

      rejeitados++
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro"
      logger.error(`Curadoria rejeitar SKU=${sku}: ${msg}`)
      erros.push(sku)
    }
  }

  res.json({ rejeitados, erros })
})

// ── POST /reset ───────────────────────────────────────────────

const resetSchema = z.object({
  skus: z.array(z.string().min(1)).min(1).max(100),
})

curadoriaRouter.post("/reset", authMiddleware, requireAdmin, async (req: Request, res: Response) => {
  const parsed = resetSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }

  const { skus } = parsed.data
  const placeholders = skus.map((_, i) => `$${i + 1}`).join(", ")

  await query(
    `UPDATE sync.product_publish_control
     SET status = 'pending', motivo = NULL, updated_at = NOW()
     WHERE sku IN (${placeholders})`,
    skus
  )

  res.json({ resetados: skus.length })
})
