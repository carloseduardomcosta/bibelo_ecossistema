/**
 * Sync Bling → Medusa — Fase 3A
 *
 * Lê sync.bling_products + sync.bling_stock do banco (já populados pelo sync Bling)
 * e cria/atualiza produtos no Medusa via Admin API.
 *
 * Dedup: SKU é a chave. Se SKU já existe no Medusa → update. Senão → create.
 * Estoque: soma saldo_virtual de todos os depósitos.
 * Imagens: URLs do Bling (futuro: hub de imagens do CRM).
 */

import { query, queryOne } from "../../db"
import { logger } from "../../utils/logger"

const MEDUSA_URL = process.env.MEDUSA_BACKEND_URL || "http://localhost:9000"
const MEDUSA_EMAIL = process.env.MEDUSA_ADMIN_EMAIL || "contato@papelariabibelo.com.br"
const MEDUSA_PASSWORD = process.env.MEDUSA_ADMIN_PASSWORD || ""

let cachedToken: string | null = null
let tokenExpiresAt = 0

// ── Auth ──────────────────────────────────────────────────────

async function getMedusaToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiresAt) {
    return cachedToken
  }

  const res = await fetch(`${MEDUSA_URL}/auth/user/emailpass`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: MEDUSA_EMAIL, password: MEDUSA_PASSWORD }),
  })

  if (!res.ok) {
    throw new Error(`Medusa auth falhou: ${res.status}`)
  }

  const data = (await res.json()) as { token: string }
  cachedToken = data.token
  tokenExpiresAt = Date.now() + 55 * 60 * 1000 // refresh a cada 55min
  return cachedToken!
}

async function medusaRequest<T>(
  method: string,
  path: string,
  body?: Record<string, unknown>
): Promise<T> {
  const token = await getMedusaToken()

  const res = await fetch(`${MEDUSA_URL}${path}`, {
    method,
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Medusa API ${res.status} ${method} ${path}: ${errText}`)
  }

  return res.json() as Promise<T>
}

// ── Helpers ───────────────────────────────────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .substring(0, 100)
}

function toHandle(nome: string, sku: string): string {
  const base = slugify(nome)
  const skuSlug = slugify(sku)
  // Sempre inclui SKU no handle para garantir unicidade (variantes do mesmo produto)
  if (base && skuSlug) {
    return `${base}-${skuSlug}`.substring(0, 150)
  }
  return base || skuSlug || `produto-${Date.now()}`
}

// ── Tipos ─────────────────────────────────────────────────────

interface BlingProduct {
  id: string
  bling_id: string
  nome: string
  sku: string
  preco_venda: number
  preco_custo: number
  categoria: string | null
  imagens: Array<{ url: string; ordem?: number }> | null
  ativo: boolean
  peso_bruto: number | null
  gtin: string | null
  dados_raw: any
}

interface BlingStock {
  bling_product_id: string
  saldo_virtual: number
}

interface MedusaProduct {
  id: string
  handle: string
  variants: Array<{
    id: string
    sku: string
  }>
}

// ── Buscar dados do banco ─────────────────────────────────────

async function getBlingProducts(): Promise<BlingProduct[]> {
  return query<BlingProduct>(
    `SELECT id, bling_id::text, nome, sku, preco_venda, preco_custo,
            categoria, imagens, ativo, peso_bruto, gtin, dados_raw
     FROM sync.bling_products
     WHERE ativo = true AND sku IS NOT NULL AND sku != ''
     ORDER BY nome`
  )
}

async function getStockMap(): Promise<Record<string, number>> {
  const rows = await query<BlingStock>(
    `SELECT bling_product_id, SUM(saldo_virtual)::numeric as saldo_virtual
     FROM sync.bling_stock
     GROUP BY bling_product_id`
  )
  const map: Record<string, number> = {}
  for (const r of rows) {
    map[r.bling_product_id] = Number(r.saldo_virtual) || 0
  }
  return map
}

// ── Buscar produtos existentes no Medusa ──────────────────────

async function getMedusaProductsBySku(): Promise<Map<string, MedusaProduct>> {
  const map = new Map<string, MedusaProduct>()
  let offset = 0
  const limit = 100

  while (true) {
    const data = await medusaRequest<{ products: MedusaProduct[]; count: number }>(
      "GET",
      `/admin/products?limit=${limit}&offset=${offset}&fields=id,handle,variants.id,variants.sku`
    )

    for (const p of data.products) {
      for (const v of p.variants || []) {
        if (v.sku) {
          map.set(v.sku, p)
        }
      }
    }

    offset += limit
    if (offset >= data.count) break
  }

  return map
}

// ── Buscar sales channel e região ─────────────────────────────

async function getSalesChannelId(): Promise<string> {
  const data = await medusaRequest<{ sales_channels: Array<{ id: string }> }>(
    "GET",
    "/admin/sales-channels?limit=1"
  )
  return data.sales_channels[0]?.id || ""
}

// ── Criar produto no Medusa ───────────────────────────────────

async function createMedusaProduct(
  product: BlingProduct,
  stock: number,
  salesChannelId: string
): Promise<string> {
  const handle = toHandle(product.nome, product.sku)

  const images = (product.imagens || [])
    .filter((img) => img.url)
    .map((img) => ({ url: img.url }))

  const body: Record<string, unknown> = {
    title: product.nome,
    handle,
    status: stock > 0 ? "published" : "draft",
    options: [{ title: "Padrão", values: ["Único"] }],
    variants: [
      {
        title: "Padrão",
        sku: product.sku,
        barcode: product.gtin || undefined,
        manage_inventory: false,
        prices: [
          {
            amount: Math.round(product.preco_venda * 100),
            currency_code: "brl",
          },
        ],
        options: { "Padrão": "Único" },
        weight: product.peso_bruto ? product.peso_bruto * 1000 : undefined,
      },
    ],
    sales_channels: [{ id: salesChannelId }],
    metadata: {
      bling_id: product.bling_id,
      preco_custo: product.preco_custo,
      categoria_bling: product.categoria,
    },
  }

  if (images.length > 0) {
    body.images = images
  }

  const data = await medusaRequest<{ product: { id: string } }>(
    "POST",
    "/admin/products",
    body
  )

  return data.product.id
}

// ── Atualizar produto no Medusa ───────────────────────────────

async function updateMedusaProduct(
  medusaId: string,
  variantId: string,
  product: BlingProduct,
  stock: number
): Promise<void> {
  // Atualizar produto
  await medusaRequest(
    "POST",
    `/admin/products/${medusaId}`,
    {
      title: product.nome,
      status: stock > 0 ? "published" : "draft",
      metadata: {
        bling_id: product.bling_id,
        preco_custo: product.preco_custo,
        categoria_bling: product.categoria,
      },
    }
  )

  // Atualizar variante (preço, SKU, peso)
  await medusaRequest(
    "POST",
    `/admin/products/${medusaId}/variants/${variantId}`,
    {
      sku: product.sku,
      barcode: product.gtin || undefined,
      weight: product.peso_bruto ? product.peso_bruto * 1000 : undefined,
      prices: [
        {
          amount: Math.round(product.preco_venda * 100),
          currency_code: "brl",
        },
      ],
    }
  )
}

// ── Sync principal ────────────────────────────────────────────

export async function syncBlingToMedusa(): Promise<{
  created: number
  updated: number
  errors: number
  total: number
}> {
  const startTime = Date.now()
  logger.info("Medusa sync: iniciando...")

  const [blingProducts, stockMap, medusaProducts, salesChannelId] =
    await Promise.all([
      getBlingProducts(),
      getStockMap(),
      getMedusaProductsBySku(),
      getSalesChannelId(),
    ])

  logger.info(
    `Medusa sync: ${blingProducts.length} produtos Bling, ${medusaProducts.size} no Medusa`
  )

  let created = 0
  let updated = 0
  let errors = 0

  for (const product of blingProducts) {
    const stock = stockMap[product.bling_id] || 0
    const existing = medusaProducts.get(product.sku)

    try {
      if (existing) {
        const variantId = existing.variants.find((v) => v.sku === product.sku)?.id
        if (variantId) {
          await updateMedusaProduct(existing.id, variantId, product, stock)
          updated++
        }
      } else {
        await createMedusaProduct(product, stock, salesChannelId)
        created++
      }
    } catch (err: any) {
      logger.error(
        `Medusa sync erro SKU=${product.sku}: ${err.message}`
      )
      errors++
    }
  }

  const duration = Date.now() - startTime
  logger.info(
    `Medusa sync concluído: ${created} criados, ${updated} atualizados, ${errors} erros (${duration}ms)`
  )

  // Registrar no sync_logs
  await query(
    `INSERT INTO sync.sync_logs (fonte, tipo, status, registros, erro)
     VALUES ('medusa', 'products', $1, $2, $3)`,
    [
      errors > 0 ? "parcial" : "ok",
      created + updated,
      errors > 0
        ? `${errors} erros, ${created} criados, ${updated} atualizados (${duration}ms)`
        : `${created} criados, ${updated} atualizados (${duration}ms)`,
    ]
  )

  return { created, updated, errors, total: blingProducts.length }
}
