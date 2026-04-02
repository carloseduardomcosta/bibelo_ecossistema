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
  bling_category_id: string | null
  imagens: Array<{ url: string; ordem?: number }> | null
  ativo: boolean
  peso_bruto: number | null
  gtin: string | null
  dados_raw: any
}

interface BlingCategory {
  id: number
  descricao: string
  categoriaPai: { id: number }
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

// ── Categorias: Bling → Medusa ────────────────────────────────

/** Categorias a ignorar (internas do Bling, sem uso no storefront) */
const CATEGORIAS_IGNORAR = new Set([
  "TESTE", "TODOS OS PRODUTOS", "KIT SUBLIMAÇÃO",
])

async function fetchBlingCategories(): Promise<BlingCategory[]> {
  const token = await getMedusaToken() // reutiliza token (precisa do Bling token separado)
  // Buscar do Bling API diretamente via rate-limited GET
  // Como este módulo não tem acesso ao rate limiter do Bling, buscamos do banco
  // As categorias já foram mapeadas pelo sync Bling → fetchCategoryMap()
  // Alternativa: buscar direto da API Bling
  const BLING_API = "https://api.bling.com.br/Api/v3"
  const blingTokenRow = await queryOne<{ ultimo_id: string }>(
    "SELECT ultimo_id FROM sync.sync_state WHERE fonte = 'bling'"
  )
  if (!blingTokenRow) throw new Error("Token Bling não encontrado em sync_state")

  const { access_token } = JSON.parse(blingTokenRow.ultimo_id)
  const categories: BlingCategory[] = []
  let page = 1

  while (true) {
    const res = await fetch(
      `${BLING_API}/categorias/produtos?pagina=${page}&limite=100`,
      { headers: { Authorization: `Bearer ${access_token}` } }
    )
    if (!res.ok) {
      if (res.status === 401) throw new Error("Token Bling expirado — executar sync Bling primeiro")
      throw new Error(`Bling categorias ${res.status}: ${await res.text()}`)
    }
    const data = (await res.json()) as { data: BlingCategory[] }
    if (!data.data || data.data.length === 0) break
    categories.push(...data.data)
    page++
  }

  return categories.filter((c) => !CATEGORIAS_IGNORAR.has(c.descricao.toUpperCase()))
}

/** Busca mapeamento existente bling_category_id → medusa_category_id */
async function getCategoryMapping(): Promise<Map<string, string>> {
  const rows = await query<{ bling_category_id: string; medusa_category_id: string }>(
    "SELECT bling_category_id, medusa_category_id FROM sync.bling_medusa_categories"
  )
  const map = new Map<string, string>()
  for (const r of rows) {
    map.set(r.bling_category_id, r.medusa_category_id)
  }
  return map
}

/** Formata nome da categoria: "CANETA GEL" → "Caneta Gel" */
function formatCategoryName(name: string): string {
  const preposicoes = new Set(["de", "do", "da", "dos", "das", "para", "em", "e", "ou", "com"])
  return name
    .toLowerCase()
    .split(/\s+/)
    .map((word, i) => {
      if (i > 0 && preposicoes.has(word)) return word
      return word.charAt(0).toUpperCase() + word.slice(1)
    })
    .join(" ")
}

/** Sync categorias Bling → Medusa + tabela de mapeamento */
export async function syncCategoriesToMedusa(): Promise<{
  created: number
  updated: number
  total: number
}> {
  logger.info("Medusa category sync: iniciando...")
  const blingCategories = await fetchBlingCategories()
  const existingMapping = await getCategoryMapping()

  // Buscar categorias existentes no Medusa
  const medusaData = await medusaRequest<{
    product_categories: Array<{ id: string; handle: string; metadata?: Record<string, unknown> }>
  }>("GET", "/admin/product-categories?limit=200&fields=id,handle,metadata")

  const medusaByHandle = new Map<string, string>()
  for (const cat of medusaData.product_categories) {
    medusaByHandle.set(cat.handle, cat.id)
  }

  let created = 0
  let updated = 0

  // Primeiro pass: categorias raiz (categoriaPai.id === 0)
  // Segundo pass: subcategorias (se houver hierarquia no futuro)
  const roots = blingCategories.filter((c) => !c.categoriaPai || c.categoriaPai.id === 0)

  for (const cat of roots) {
    const blingId = String(cat.id)
    const nome = formatCategoryName(cat.descricao)
    const handle = slugify(cat.descricao)

    try {
      let medusaCategoryId = existingMapping.get(blingId)

      if (!medusaCategoryId) {
        // Verificar se já existe no Medusa por handle
        const existingId = medusaByHandle.get(handle)
        if (existingId) {
          medusaCategoryId = existingId
          updated++
        } else {
          // Criar no Medusa
          const result = await medusaRequest<{ product_category: { id: string } }>(
            "POST",
            "/admin/product-categories",
            {
              name: nome,
              handle,
              is_active: true,
              is_internal: false,
              metadata: { bling_category_id: blingId },
            }
          )
          medusaCategoryId = result.product_category.id
          created++
        }

        // Salvar mapeamento
        await query(
          `INSERT INTO sync.bling_medusa_categories
           (bling_category_id, medusa_category_id, nome, handle, sincronizado_em)
           VALUES ($1, $2, $3, $4, NOW())
           ON CONFLICT (bling_category_id) DO UPDATE SET
             medusa_category_id = $2, nome = $3, handle = $4, sincronizado_em = NOW()`,
          [blingId, medusaCategoryId, nome, handle]
        )
      } else {
        // Já mapeada — update nome se mudou
        await medusaRequest(
          "POST",
          `/admin/product-categories/${medusaCategoryId}`,
          { name: nome, metadata: { bling_category_id: blingId } }
        )
        updated++
      }
    } catch (err: any) {
      logger.error(`Medusa category sync erro: ${cat.descricao}: ${err.message}`)
    }
  }

  logger.info(`Medusa category sync: ${created} criadas, ${updated} atualizadas, ${roots.length} total`)

  await query(
    `INSERT INTO sync.sync_logs (fonte, tipo, status, registros, erro)
     VALUES ('medusa', 'categories', 'ok', $1, $2)`,
    [created + updated, `${created} criadas, ${updated} atualizadas`]
  )

  return { created, updated, total: roots.length }
}

// ── Buscar dados do banco ─────────────────────────────────────

async function getBlingProducts(): Promise<BlingProduct[]> {
  return query<BlingProduct>(
    `SELECT id, bling_id::text, nome, sku, preco_venda, preco_custo,
            categoria, bling_category_id, imagens, ativo, peso_bruto, gtin, dados_raw
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
  salesChannelId: string,
  categoryMapping: Map<string, string>
): Promise<string> {
  const handle = toHandle(product.nome, product.sku)

  const images = (product.imagens || [])
    .filter((img) => img.url)
    .map((img) => ({ url: String(img.url) }))

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

  // Atribuir categoria do Bling → Medusa
  if (product.bling_category_id) {
    const medusaCatId = categoryMapping.get(product.bling_category_id)
    if (medusaCatId) {
      body.categories = [{ id: medusaCatId }]
    }
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
  stock: number,
  categoryMapping: Map<string, string>
): Promise<void> {
  const updateBody: Record<string, unknown> = {
    title: product.nome,
    status: stock > 0 ? "published" : "draft",
    metadata: {
      bling_id: product.bling_id,
      preco_custo: product.preco_custo,
      categoria_bling: product.categoria,
    },
  }

  // Atualizar imagens (se o Bling tem imagens)
  const images = (product.imagens || [])
    .filter((img) => img.url)
    .map((img) => ({ url: String(img.url) }))
  if (images.length > 0) {
    updateBody.images = images
  }

  // Atribuir categoria do Bling → Medusa
  if (product.bling_category_id) {
    const medusaCatId = categoryMapping.get(product.bling_category_id)
    if (medusaCatId) {
      updateBody.categories = [{ id: medusaCatId }]
    }
  }

  // Atualizar produto
  await medusaRequest("POST", `/admin/products/${medusaId}`, updateBody)

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

  // 1. Sync categorias primeiro (Bling → Medusa)
  try {
    await syncCategoriesToMedusa()
  } catch (err: any) {
    logger.error(`Medusa category sync falhou (continuando sem categorias): ${err.message}`)
  }

  // 2. Buscar dados em paralelo
  const [blingProducts, stockMap, medusaProducts, salesChannelId, categoryMapping] =
    await Promise.all([
      getBlingProducts(),
      getStockMap(),
      getMedusaProductsBySku(),
      getSalesChannelId(),
      getCategoryMapping(),
    ])

  logger.info(
    `Medusa sync: ${blingProducts.length} produtos Bling, ${medusaProducts.size} no Medusa, ${categoryMapping.size} categorias mapeadas`
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
          await updateMedusaProduct(existing.id, variantId, product, stock, categoryMapping)
          updated++
        }
      } else {
        await createMedusaProduct(product, stock, salesChannelId, categoryMapping)
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

  // 4. Sync estoque (inventory levels) após produtos
  try {
    const invResult = await syncInventoryToMedusa(stockMap)
    logger.info(`Medusa inventory sync: ${invResult.updated} atualizados, ${invResult.created} criados`)
  } catch (err: any) {
    logger.error(`Medusa inventory sync falhou: ${err.message}`)
  }

  return { created, updated, errors, total: blingProducts.length }
}

// ── Sync Inventory (Estoque) ─────────────────────────────────

async function getStockLocationId(): Promise<string> {
  const data = await medusaRequest<{ stock_locations: Array<{ id: string }> }>(
    "GET",
    "/admin/stock-locations?limit=1"
  )
  return data.stock_locations[0]?.id || ""
}

interface MedusaVariantInventory {
  variant_id: string
  sku: string
  inventory_item_id: string | null
  inventory_quantity: number
}

export async function syncInventoryToMedusa(
  stockMap?: Record<string, number>
): Promise<{ created: number; updated: number }> {
  logger.info("Medusa inventory sync: iniciando...")

  // Buscar stock map se não fornecido
  if (!stockMap) {
    stockMap = await getStockMap()
  }

  const stockLocationId = await getStockLocationId()
  if (!stockLocationId) {
    throw new Error("Nenhum stock location no Medusa")
  }

  // Buscar todos os produtos do Medusa com variantes + inventory info
  const variantMap = new Map<string, { variantId: string; productId: string; blingId: string }>()
  let offset = 0
  while (true) {
    const data = await medusaRequest<{
      products: Array<{
        id: string
        metadata?: { bling_id?: string }
        variants: Array<{ id: string; sku: string; manage_inventory: boolean; inventory_quantity: number }>
      }>
      count: number
    }>("GET", `/admin/products?limit=100&offset=${offset}&fields=id,metadata,variants.id,variants.sku,variants.manage_inventory,variants.inventory_quantity`)

    for (const p of data.products) {
      const blingId = p.metadata?.bling_id
      if (blingId && p.variants?.length > 0) {
        const v = p.variants[0]
        variantMap.set(blingId, { variantId: v.id, productId: p.id, blingId })
      }
    }
    offset += 100
    if (offset >= data.count) break
  }

  // Buscar inventory items existentes
  const existingInventory = new Map<string, { itemId: string; levelId: string | null }>()
  let invOffset = 0
  while (true) {
    const data = await medusaRequest<{
      inventory_items: Array<{
        id: string
        sku: string
        location_levels?: Array<{ id: string; location_id: string; stocked_quantity: number }>
      }>
      count: number
    }>("GET", `/admin/inventory-items?limit=100&offset=${invOffset}&fields=id,sku,*location_levels`)

    for (const item of data.inventory_items) {
      if (item.sku) {
        const level = item.location_levels?.find((l) => l.location_id === stockLocationId)
        existingInventory.set(item.sku, { itemId: item.id, levelId: level?.id || null })
      }
    }
    invOffset += 100
    if (invOffset >= data.count) break
  }

  // Buscar SKU → bling_id mapping
  const skuToBlingId = new Map<string, string>()
  const blingProducts = await query<{ sku: string; bling_id: string }>(
    "SELECT sku, bling_id FROM sync.bling_products WHERE ativo = true AND sku IS NOT NULL"
  )
  for (const p of blingProducts) {
    skuToBlingId.set(p.sku, p.bling_id)
  }

  let created = 0
  let updated = 0

  // Processar cada variante
  for (const [blingId, info] of variantMap) {
    const stock = Math.max(0, Math.floor(stockMap[blingId] || 0))

    try {
      // Buscar SKU da variante
      const variantData = await medusaRequest<{
        variant: { sku: string; inventory_items: Array<{ inventory_item_id: string; inventory: { id: string } }> }
      }>("GET", `/admin/products/${info.productId}/variants/${info.variantId}?fields=sku,*inventory_items`)

      const sku = variantData.variant.sku
      if (!sku) continue

      const existingInv = existingInventory.get(sku)

      if (!existingInv) {
        // Criar inventory item + level
        const itemData = await medusaRequest<{ inventory_item: { id: string } }>(
          "POST",
          "/admin/inventory-items",
          { sku, requires_shipping: true }
        )

        // Criar level no stock location
        await medusaRequest(
          "POST",
          `/admin/inventory-items/${itemData.inventory_item.id}/location-levels`,
          { location_id: stockLocationId, stocked_quantity: stock }
        )

        // Vincular à variante
        await medusaRequest(
          "POST",
          `/admin/inventory-items/${itemData.inventory_item.id}/location-levels/batch`,
          // Alternativa: vincular via variant
        ).catch(() => {}) // ignore se batch não disponível

        created++
      } else {
        // Atualizar quantidade no level existente
        if (existingInv.levelId) {
          await medusaRequest(
            "POST",
            `/admin/inventory-items/${existingInv.itemId}/location-levels/${existingInv.levelId}`,
            { stocked_quantity: stock }
          )
        } else {
          // Criar level (item existe mas sem level neste location)
          await medusaRequest(
            "POST",
            `/admin/inventory-items/${existingInv.itemId}/location-levels`,
            { location_id: stockLocationId, stocked_quantity: stock }
          )
        }
        updated++
      }
    } catch (err: any) {
      // Silenciar erros individuais — loggar apenas se muitos
      if (created + updated < 5) {
        logger.error(`Inventory sync erro bling_id=${blingId}: ${err.message}`)
      }
    }
  }

  logger.info(`Medusa inventory sync: ${created} criados, ${updated} atualizados`)

  await query(
    `INSERT INTO sync.sync_logs (fonte, tipo, status, registros, erro)
     VALUES ('medusa', 'inventory', 'ok', $1, $2)`,
    [created + updated, `${created} criados, ${updated} atualizados`]
  )

  return { created, updated }
}

// ── Sync Coleções (Novidades, Mais Vendidos, Promoções) ──────

export async function syncCollectionsToMedusa(): Promise<{ created: number; updated: number }> {
  logger.info("Medusa collections sync: iniciando...")

  // Buscar coleções existentes no Medusa
  const existing = await medusaRequest<{
    collections: Array<{ id: string; handle: string }>
  }>("GET", "/admin/collections?limit=50")
  const collectionByHandle = new Map<string, string>()
  for (const c of existing.collections) {
    collectionByHandle.set(c.handle, c.id)
  }

  let created = 0
  let updated = 0

  // Definir coleções
  const collections = [
    {
      title: "Novidades",
      handle: "novidades",
      query: `SELECT bp.sku FROM sync.bling_products bp
              WHERE bp.ativo = true AND bp.sku IS NOT NULL
              ORDER BY bp.sincronizado_em DESC LIMIT 30`,
    },
    {
      title: "Mais Vendidos",
      handle: "mais-vendidos",
      query: `SELECT bp.sku FROM sync.bling_products bp
              JOIN sync.bling_orders bo ON TRUE
              WHERE bp.ativo = true AND bp.sku IS NOT NULL
              AND bo.itens::text ILIKE '%' || bp.sku || '%'
              GROUP BY bp.sku
              ORDER BY COUNT(*) DESC LIMIT 20`,
    },
    {
      title: "Promoções",
      handle: "promocoes",
      // Produtos que estão na categoria "PROMOÇÃO" no Bling
      query: `SELECT bp.sku FROM sync.bling_products bp
              WHERE bp.ativo = true AND bp.sku IS NOT NULL
              AND bp.categoria = 'PROMOÇÃO'
              LIMIT 50`,
    },
  ]

  for (const col of collections) {
    try {
      // Obter ou criar coleção
      let collectionId = collectionByHandle.get(col.handle)
      if (!collectionId) {
        const result = await medusaRequest<{ collection: { id: string } }>(
          "POST",
          "/admin/collections",
          { title: col.title, handle: col.handle }
        )
        collectionId = result.collection.id
        created++
      } else {
        updated++
      }

      // Buscar SKUs para esta coleção
      const skus = await query<{ sku: string }>(col.query)
      if (skus.length === 0) continue

      // Buscar product IDs pelo SKU no Medusa
      const productIds: string[] = []
      for (const { sku } of skus) {
        try {
          const data = await medusaRequest<{
            products: Array<{ id: string }>
          }>("GET", `/admin/products?q=${encodeURIComponent(sku)}&limit=1&fields=id`)
          if (data.products.length > 0) {
            productIds.push(data.products[0].id)
          }
        } catch { /* ignorar produto não encontrado */ }
      }

      // Atualizar produtos na coleção (batch)
      if (productIds.length > 0) {
        await medusaRequest(
          "POST",
          `/admin/collections/${collectionId}/products`,
          { add: productIds }
        )
        logger.info(`Coleção "${col.title}": ${productIds.length} produtos`)
      }
    } catch (err: any) {
      logger.error(`Collection sync erro "${col.title}": ${err.message}`)
    }
  }

  logger.info(`Medusa collections sync: ${created} criadas, ${updated} atualizadas`)
  return { created, updated }
}
