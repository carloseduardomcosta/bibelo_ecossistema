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
import { cacheAllProductImages } from "./image-cache"

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
  // SEGURO: Lê da staging table local (populada pelo sync Bling)
  // ZERO chamadas à API Bling — evita rate limit e conflitos
  const rows = await query<{ bling_id: string; descricao: string; id_pai: string | null }>(
    "SELECT bling_id, descricao, id_pai FROM sync.bling_categories ORDER BY descricao"
  )

  if (rows.length === 0) {
    logger.warn("Medusa category sync: nenhuma categoria na staging table. Execute sync Bling primeiro.")
    return []
  }

  const categories: BlingCategory[] = rows
    .map((r) => ({
      id: parseInt(r.bling_id, 10),
      descricao: r.descricao,
      categoriaPai: { id: r.id_pai ? parseInt(r.id_pai, 10) : 0 },
    }))
    .filter((c) => !CATEGORIAS_IGNORAR.has(c.descricao.toUpperCase()))

  logger.info(`Medusa category sync: ${categories.length} categorias lidas da staging table (zero chamadas Bling)`)
  return categories
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

/** Sync categorias Bling → Medusa com hierarquia (pai/filho) */
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

  // Separar raízes e filhas
  const roots = blingCategories.filter((c) => !c.categoriaPai || c.categoriaPai.id === 0)
  const children = blingCategories.filter((c) => c.categoriaPai && c.categoriaPai.id > 0)

  // Função para sincronizar uma categoria (reutilizada para roots e children)
  async function syncCategory(cat: BlingCategory, parentMedusaId?: string) {
    const blingId = String(cat.id)
    const nome = formatCategoryName(cat.descricao)
    const handle = slugify(cat.descricao)

    try {
      let medusaCategoryId = existingMapping.get(blingId)

      if (!medusaCategoryId) {
        const existingId = medusaByHandle.get(handle)
        if (existingId) {
          medusaCategoryId = existingId
          // Atualizar parent se necessário
          if (parentMedusaId) {
            await medusaRequest("POST", `/admin/product-categories/${medusaCategoryId}`, {
              name: nome,
              parent_category_id: parentMedusaId,
              metadata: { bling_category_id: blingId },
            })
          }
          updated++
        } else {
          const body: Record<string, unknown> = {
            name: nome,
            handle,
            is_active: true,
            is_internal: false,
            metadata: { bling_category_id: blingId },
          }
          if (parentMedusaId) {
            body.parent_category_id = parentMedusaId
          }

          const result = await medusaRequest<{ product_category: { id: string } }>(
            "POST",
            "/admin/product-categories",
            body
          )
          medusaCategoryId = result.product_category.id
          created++
        }

        await query(
          `INSERT INTO sync.bling_medusa_categories
           (bling_category_id, bling_category_name, medusa_category_id, nome, handle, status, origem, created_at, sincronizado_em)
           VALUES ($1, $5, $2, $3, $4, 'mapped', 'full', NOW(), NOW())
           ON CONFLICT (bling_category_id) DO UPDATE SET
             medusa_category_id  = $2,
             nome                = $3,
             handle              = $4,
             bling_category_name = COALESCE(sync.bling_medusa_categories.bling_category_name, $5),
             status              = 'mapped',
             origem              = 'full',
             sincronizado_em     = NOW()`,
          [blingId, medusaCategoryId, nome, handle, cat.descricao]
        )
      } else {
        const updateBody: Record<string, unknown> = {
          name: nome,
          metadata: { bling_category_id: blingId },
        }
        if (parentMedusaId) {
          updateBody.parent_category_id = parentMedusaId
        }
        await medusaRequest("POST", `/admin/product-categories/${medusaCategoryId}`, updateBody)
        updated++
      }

      // Atualizar mapping local para uso imediato
      existingMapping.set(blingId, medusaCategoryId!)
      medusaByHandle.set(handle, medusaCategoryId!)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro"
      logger.error(`Medusa category sync erro: ${cat.descricao}: ${msg}`)
    }
  }

  // Pass 1: categorias raiz
  for (const cat of roots) {
    await syncCategory(cat)
  }

  // Pass 2: subcategorias (filhas)
  for (const cat of children) {
    const parentBlingId = String(cat.categoriaPai.id)
    const parentMedusaId = existingMapping.get(parentBlingId)
    await syncCategory(cat, parentMedusaId || undefined)
  }

  const total = roots.length + children.length
  logger.info(`Medusa category sync: ${created} criadas, ${updated} atualizadas, ${total} total (${roots.length} raízes + ${children.length} sub)`)

  await query(
    `INSERT INTO sync.sync_logs (fonte, tipo, status, registros, erro)
     VALUES ('medusa', 'categories', 'ok', $1, $2)`,
    [created + updated, `${created} criadas, ${updated} atualizadas, ${roots.length} raízes, ${children.length} sub`]
  )

  return { created, updated, total }
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

// ── Variações: agrupar pai + filhos ──────────────────────────

interface ProductGroup {
  parent: BlingProduct
  children: BlingProduct[]
  isVariant: boolean // true se tem filhos (variantes)
}

/**
 * Agrupa produtos Bling em pai+filhos.
 * Filho: dados_raw.idProdutoPai != null/0
 * Pai: tem filhos apontando pra ele, OU não tem parent (simples)
 */
function groupProductsByParent(products: BlingProduct[]): ProductGroup[] {
  const childrenByParent = new Map<string, BlingProduct[]>()
  const productById = new Map<string, BlingProduct>()
  const childBlingIds = new Set<string>()

  // Indexar todos os produtos por bling_id
  for (const p of products) {
    productById.set(p.bling_id, p)
  }

  // Identificar filhos e agrupá-los pelo pai
  for (const p of products) {
    const parentId = p.dados_raw?.idProdutoPai
    if (parentId && parentId !== 0 && parentId !== "0" && parentId !== null) {
      const parentBlingId = String(parentId)
      if (!childrenByParent.has(parentBlingId)) {
        childrenByParent.set(parentBlingId, [])
      }
      childrenByParent.get(parentBlingId)!.push(p)
      childBlingIds.add(p.bling_id)
    }
  }

  const groups: ProductGroup[] = []

  for (const p of products) {
    // Pular filhos — serão processados como variantes do pai
    if (childBlingIds.has(p.bling_id)) continue

    const children = childrenByParent.get(p.bling_id) || []
    groups.push({
      parent: p,
      children,
      isVariant: children.length > 0,
    })
  }

  return groups
}

/**
 * Parseia "NomePai OpcaoNome:OpcaoValor" do nome do filho.
 * Ex: "CANETA BAZZE GEL GLITTER Tinta:Azul" → { option: "Tinta", value: "Azul" }
 */
function parseVariation(childName: string, parentName: string): { option: string; value: string } {
  // Tentar encontrar "Opção:Valor" no final do nome
  const match = childName.match(/\s+([^:\s]+(?:\/[^:\s]+)?):(.+)$/)
  if (match) {
    return { option: match[1].trim(), value: match[2].trim() }
  }

  // Fallback: diferença entre nome do filho e pai
  const diff = childName.replace(parentName, "").trim()
  if (diff) {
    return { option: "Variação", value: diff }
  }

  return { option: "Variação", value: childName }
}

// ── Criar produto COM variantes no Medusa ───────────────────

async function createMedusaProductWithVariants(
  group: ProductGroup,
  stockMap: Record<string, number>,
  salesChannelId: string,
  categoryMapping: Map<string, string>,
  imageMap: Map<string, string>
): Promise<string> {
  const parent = group.parent
  const handle = toHandle(parent.nome, parent.sku)
  const description = extractDescription(parent)

  // Determinar nome da opção a partir dos filhos
  const variations = group.children.map((child) => ({
    child,
    ...parseVariation(child.nome, parent.nome),
  }))

  const optionTitle = variations[0]?.option || "Variação"
  const optionValues = variations.map((v) => v.value)

  // Imagens: usar do pai, com fallback para filhos
  const parentImageUrl = imageMap.get(parent.bling_id)
  const parentImages = parentImageUrl
    ? [{ url: parentImageUrl }]
    : (parent.imagens || []).filter((img) => img.url).map((img) => ({ url: String(img.url) }))

  // Estoque total (pai + filhos)
  const totalStock = (stockMap[parent.bling_id] || 0)
    + group.children.reduce((sum, c) => sum + (stockMap[c.bling_id] || 0), 0)

  // Construir variantes
  const variants = group.children.map((child) => {
    const variation = variations.find((v) => v.child.bling_id === child.bling_id)!
    const childStock = stockMap[child.bling_id] || 0
    const childImageUrl = imageMap.get(child.bling_id)

    return {
      title: variation.value,
      sku: child.sku,
      barcode: child.gtin || undefined,
      manage_inventory: false,
      prices: [
        {
          amount: Math.round(child.preco_venda * 100),
          currency_code: "brl",
        },
      ],
      options: { [optionTitle]: variation.value },
      weight: child.peso_bruto ? child.peso_bruto * 1000 : undefined,
      metadata: {
        bling_id: child.bling_id,
        bling_parent_id: parent.bling_id,
      },
    }
  })

  const body: Record<string, unknown> = {
    title: parent.nome,
    handle,
    description: description || undefined,
    status: totalStock > 0 ? "published" : "draft",
    options: [{ title: optionTitle, values: optionValues }],
    variants,
    sales_channels: [{ id: salesChannelId }],
    metadata: {
      bling_id: parent.bling_id,
      preco_custo: parent.preco_custo,
      categoria_bling: parent.categoria,
      has_variants: true,
      variant_count: group.children.length,
    },
  }

  if (parentImages.length > 0) {
    body.images = parentImages
    body.thumbnail = parentImages[0].url
  }

  // Atribuir categoria
  if (parent.bling_category_id) {
    const medusaCatId = categoryMapping.get(parent.bling_category_id)
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

// ── Atualizar produto COM variantes no Medusa ───────────────

async function updateMedusaProductWithVariants(
  medusaId: string,
  group: ProductGroup,
  stockMap: Record<string, number>,
  categoryMapping: Map<string, string>,
  existingVariants: Array<{ id: string; sku: string }>
): Promise<void> {
  const parent = group.parent
  const description = extractDescription(parent)
  const totalStock = (stockMap[parent.bling_id] || 0)
    + group.children.reduce((sum, c) => sum + (stockMap[c.bling_id] || 0), 0)

  const updateBody: Record<string, unknown> = {
    title: parent.nome,
    description: description || undefined,
    status: totalStock > 0 ? "published" : "draft",
    metadata: {
      bling_id: parent.bling_id,
      preco_custo: parent.preco_custo,
      categoria_bling: parent.categoria,
      has_variants: true,
      variant_count: group.children.length,
    },
  }

  if (parent.bling_category_id) {
    const medusaCatId = categoryMapping.get(parent.bling_category_id)
    if (medusaCatId) {
      updateBody.categories = [{ id: medusaCatId }]
    }
  }

  await medusaRequest("POST", `/admin/products/${medusaId}`, updateBody)

  // Atualizar preço de cada variante existente
  for (const child of group.children) {
    const existingVar = existingVariants.find((v) => v.sku === child.sku)
    if (existingVar) {
      await medusaRequest(
        "POST",
        `/admin/products/${medusaId}/variants/${existingVar.id}`,
        {
          sku: child.sku,
          prices: [{ amount: Math.round(child.preco_venda * 100), currency_code: "brl" }],
          weight: child.peso_bruto ? child.peso_bruto * 1000 : undefined,
        }
      )
    }
  }
}

// ── Extrair descrição do produto Bling ────────────────────────

function extractDescription(product: BlingProduct): string {
  const raw = product.dados_raw
  // descricaoCurta do Bling vem com HTML rico (h3, ul, li, p) — manter formatação
  const desc = raw?.descricaoCurta || raw?.descricaoComplementar || ""
  if (typeof desc !== "string" || !desc.trim()) return ""
  // Limpar \r\n excessivos mas preservar HTML
  return desc.replace(/\r\n/g, "\n").trim()
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

  const description = extractDescription(product)

  const body: Record<string, unknown> = {
    title: product.nome,
    handle,
    description: description || undefined,
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
    body.thumbnail = images[0].url // primeira imagem como thumbnail
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
  const description = extractDescription(product)

  const updateBody: Record<string, unknown> = {
    title: product.nome,
    description: description || undefined,
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
    updateBody.thumbnail = images[0].url
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

// ── Kill switch + configuração ───────────────────────────────

interface SyncConfig {
  enabled: boolean
  mode: "dry-run" | "live"
  max_products: number
}

async function getSyncConfig(): Promise<SyncConfig> {
  const row = await queryOne<{ ultimo_id: string }>(
    "SELECT ultimo_id FROM sync.sync_state WHERE fonte = 'medusa-sync'"
  )
  if (!row) return { enabled: false, mode: "dry-run", max_products: 100 }
  try {
    return JSON.parse(row.ultimo_id)
  } catch {
    return { enabled: false, mode: "dry-run", max_products: 100 }
  }
}

export async function setSyncConfig(config: Partial<SyncConfig>): Promise<void> {
  const current = await getSyncConfig()
  const merged = { ...current, ...config }
  await query(
    `UPDATE sync.sync_state SET ultimo_id = $1, ultima_sync = NOW() WHERE fonte = 'medusa-sync'`,
    [JSON.stringify(merged)]
  )
  logger.info("Medusa sync config atualizada", merged)
}

// ── Monitoramento detalhado ──────────────────────────────────

async function logMedusaSync(
  tipo: string,
  status: string,
  stats: { total?: number; criados?: number; atualizados?: number; estoque?: number; erros?: number; duracao?: number },
  detalhes?: Record<string, unknown>
): Promise<void> {
  await query(
    `INSERT INTO sync.medusa_sync_log
     (tipo, status, produtos_total, produtos_criados, produtos_atualizados, estoque_atualizado, erros, duracao_ms, detalhes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      tipo, status,
      stats.total || 0, stats.criados || 0, stats.atualizados || 0,
      stats.estoque || 0, stats.erros || 0, stats.duracao || 0,
      detalhes ? JSON.stringify(detalhes) : null,
    ]
  )
}

// ── Sync principal (com safeguards) ──────────────────────────

export async function syncBlingToMedusa(): Promise<{
  created: number
  updated: number
  errors: number
  total: number
}> {
  const startTime = Date.now()

  // 0. Verificar kill switch
  const config = await getSyncConfig()
  if (!config.enabled) {
    logger.info("Medusa sync: DESABILITADO (kill switch). Use setSyncConfig({ enabled: true }) para ativar.")
    return { created: 0, updated: 0, errors: 0, total: 0 }
  }

  const isDryRun = config.mode === "dry-run"
  logger.info(`Medusa sync: iniciando em modo ${config.mode}, max_products=${config.max_products}`)

  // 1. Verificar saúde do Medusa antes de começar
  try {
    const health = await fetch(`${MEDUSA_URL}/health`, { timeout: 5000 } as RequestInit)
    if (!health.ok) throw new Error(`Medusa health ${health.status}`)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Medusa inacessível"
    logger.error(`Medusa sync abortado: ${msg}`)
    await logMedusaSync("products", "erro", { duracao: Date.now() - startTime }, { erro: msg })
    return { created: 0, updated: 0, errors: 1, total: 0 }
  }

  // 2. Sync categorias (lê da staging table, zero chamadas Bling)
  try {
    if (!isDryRun) {
      await syncCategoriesToMedusa()
    } else {
      const cats = await fetchBlingCategories()
      logger.info(`[DRY-RUN] Categorias: ${cats.length} seriam sincronizadas`)
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro categorias"
    logger.error(`Medusa category sync falhou (continuando sem categorias): ${msg}`)
  }

  // 3. Buscar dados em paralelo (tudo do banco local, zero chamadas Bling)
  const [blingProducts, stockMap, medusaProducts, salesChannelId, categoryMapping] =
    await Promise.all([
      getBlingProducts(),
      getStockMap(),
      getMedusaProductsBySku(),
      getSalesChannelId(),
      getCategoryMapping(),
    ])

  // Limitar quantidade de produtos (safeguard)
  const productsToSync = blingProducts.slice(0, config.max_products)

  // 3.5 Cachear imagens localmente (baixa do Bling S3, salva em /uploads/products/)
  let imageMap = new Map<string, string>()
  if (!isDryRun) {
    try {
      imageMap = await cacheAllProductImages(productsToSync)
      logger.info(`Image cache: ${imageMap.size}/${productsToSync.length} imagens cacheadas`)
    } catch (err: unknown) {
      logger.error(`Image cache falhou (continuando sem imagens locais): ${err instanceof Error ? err.message : ""}`)
    }
  }

  // 4. Agrupar produtos por pai/filhos (variações)
  const productGroups = groupProductsByParent(productsToSync)
  const simpleCount = productGroups.filter((g) => !g.isVariant).length
  const variantCount = productGroups.filter((g) => g.isVariant).length
  const childrenCount = productGroups.reduce((sum, g) => sum + g.children.length, 0)

  // Mapa de fallback por handle (cobre produtos sem SKU na variante do Medusa)
  const medusaByHandle = new Map<string, MedusaProduct>()
  for (const p of medusaProducts.values()) {
    if (p.handle && !medusaByHandle.has(p.handle)) {
      medusaByHandle.set(p.handle, p)
    }
  }

  logger.info(
    `Medusa sync: ${productsToSync.length} produtos → ${productGroups.length} grupos (${simpleCount} simples + ${variantCount} com variantes, ${childrenCount} filhos), ${medusaProducts.size} no Medusa, ${categoryMapping.size} categorias, ${imageMap.size} imagens`
  )

  let created = 0
  let updated = 0
  let errors = 0
  let consecutiveErrors = 0
  const MAX_CONSECUTIVE_ERRORS = 5 // circuit breaker

  for (const group of productGroups) {
    const product = group.parent
    const stock = stockMap[product.bling_id] || 0
    let existing: MedusaProduct | undefined = medusaProducts.get(product.sku)

    // Fallback 1: grupos com variantes — SKU do pai não está no Medusa, filhos estão
    if (!existing && group.isVariant) {
      for (const child of group.children) {
        const found = medusaProducts.get(child.sku)
        if (found) { existing = found; break }
      }
    }

    // Fallback 2: produto sem SKU na variante do Medusa — buscar por handle
    if (!existing) {
      existing = medusaByHandle.get(toHandle(product.nome, product.sku))
    }

    // Substituir imagens do Bling S3 por URLs locais cacheadas
    const cachedImageUrl = imageMap.get(product.bling_id)
    if (cachedImageUrl) {
      product.imagens = [{ url: cachedImageUrl, ordem: 0 }]
    }

    if (isDryRun) {
      const action = existing ? "UPDATE" : "CREATE"
      const varInfo = group.isVariant ? ` (${group.children.length} variantes)` : ""
      logger.info(`[DRY-RUN] ${action} SKU=${product.sku} nome="${product.nome}" estoque=${stock}${varInfo}`)
      if (existing) updated++; else created++
      continue
    }

    try {
      if (group.isVariant) {
        // ── Produto com variantes ──
        if (existing) {
          await updateMedusaProductWithVariants(
            existing.id, group, stockMap, categoryMapping, existing.variants
          )
          updated++
        } else {
          await createMedusaProductWithVariants(
            group, stockMap, salesChannelId, categoryMapping, imageMap
          )
          created++
        }
      } else {
        // ── Produto simples (sem variantes) ──
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
      }
      consecutiveErrors = 0 // reset
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido"
      logger.error(`Medusa sync erro SKU=${product.sku}: ${msg}`)
      errors++
      consecutiveErrors++

      // Circuit breaker: para se muitos erros seguidos
      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        logger.error(`CIRCUIT BREAKER: ${consecutiveErrors} erros consecutivos — parando sync`)
        await logMedusaSync("products", "circuit-breaker", {
          total: productGroups.length, criados: created, atualizados: updated, erros: errors,
          duracao: Date.now() - startTime,
        }, { ultimo_erro: msg, sku: product.sku })
        break
      }
    }
  }

  const duration = Date.now() - startTime

  const logStatus = isDryRun ? "dry-run" : errors > 0 ? "parcial" : "ok"
  logger.info(
    `Medusa sync ${logStatus}: ${created} criados, ${updated} atualizados, ${errors} erros (${duration}ms)`
  )

  await logMedusaSync("products", logStatus, {
    total: productsToSync.length, criados: created, atualizados: updated, erros: errors, duracao: duration,
  })

  // Sync estoque (só no modo live)
  if (!isDryRun) {
    try {
      const invResult = await syncInventoryToMedusa(stockMap)
      logger.info(`Medusa inventory sync: ${invResult.updated} atualizados, ${invResult.created} criados`)
      await logMedusaSync("inventory", "ok", {
        estoque: invResult.created + invResult.updated, duracao: Date.now() - startTime,
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro inventory"
      logger.error(`Medusa inventory sync falhou: ${msg}`)
      await logMedusaSync("inventory", "erro", { duracao: Date.now() - startTime }, { erro: msg })
    }
  }

  return { created, updated, errors, total: productsToSync.length }
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

  // Buscar inventory items existentes (SKU → itemId)
  const existingInventory = new Map<string, { itemId: string }>()
  let invOffset = 0
  while (true) {
    const data = await medusaRequest<{
      inventory_items: Array<{ id: string; sku: string }>
      count: number
    }>("GET", `/admin/inventory-items?limit=100&offset=${invOffset}&fields=id,sku`)

    for (const item of data.inventory_items) {
      if (item.sku) {
        existingInventory.set(item.sku, { itemId: item.id })
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

        // Criar level no stock location (Medusa v2: POST com location_id no body)
        await medusaRequest(
          "POST",
          `/admin/inventory-items/${itemData.inventory_item.id}/location-levels`,
          { location_id: stockLocationId, stocked_quantity: stock }
        )

        created++
      } else {
        // Atualizar quantidade — Medusa v2 usa stockLocationId na URL (não levelId)
        await medusaRequest(
          "POST",
          `/admin/inventory-items/${existingInv.itemId}/location-levels/${stockLocationId}`,
          { stocked_quantity: stock }
        )
        updated++
      }
    } catch (err: any) {
      logger.error(`Inventory sync erro bling_id=${blingId}: ${err.message}`)
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

// ── Painel de Categorias — exports para categorias-sync.ts ───

/**
 * Lista categorias disponíveis no Medusa para o dropdown do painel.
 */
export async function getMedusaCategoriesFromMedusa(): Promise<
  Array<{ id: string; name: string; handle: string; parent_id: string | null }>
> {
  const data = await medusaRequest<{
    product_categories: Array<{
      id: string
      name: string
      handle: string
      parent_category_id?: string
    }>
  }>("GET", "/admin/product-categories?limit=200&fields=id,name,handle,parent_category_id")

  return data.product_categories.map((c) => ({
    id:        c.id,
    name:      c.name,
    handle:    c.handle,
    parent_id: c.parent_category_id || null,
  }))
}

/**
 * Aplica mapeamentos de categoria nos produtos do Medusa.
 * Usado pelo botão "Sincronizar tudo" do painel.
 *
 * Comportamento: REPLACE (Medusa v2 substitui categorias pelo array enviado).
 * Seguro para este projeto — cada produto Bling tem exatamente 1 categoria.
 * Não remove categorias do Medusa, apenas atualiza a categoria de cada produto.
 */
export async function applyCategoryMappingToMedusa(
  categoryMapping: Map<string, string> // bling_category_id → medusa_category_id
): Promise<{ atualizados: number; sem_medusa: number; erros: number; total_produtos: number }> {
  if (categoryMapping.size === 0) {
    return { atualizados: 0, sem_medusa: 0, erros: 0, total_produtos: 0 }
  }

  // Produtos do Bling com categoria dentro do mapeamento confirmado
  const catIds       = [...categoryMapping.keys()]
  const placeholders = catIds.map((_, i) => `$${i + 1}`).join(", ")
  const blingProducts = await query<{ bling_id: string; sku: string; bling_category_id: string }>(
    `SELECT bling_id::text, sku, bling_category_id
       FROM sync.bling_products
      WHERE ativo = true
        AND sku IS NOT NULL AND sku != ''
        AND bling_category_id IN (${placeholders})`,
    catIds
  )

  const total_produtos = blingProducts.length
  if (total_produtos === 0) {
    return { atualizados: 0, sem_medusa: 0, erros: 0, total_produtos: 0 }
  }

  const medusaBySku = await getMedusaProductsBySku()
  let atualizados = 0
  let sem_medusa  = 0
  let erros       = 0

  for (const product of blingProducts) {
    const medusaCatId   = categoryMapping.get(product.bling_category_id)
    if (!medusaCatId) continue

    const medusaProduct = medusaBySku.get(product.sku)
    if (!medusaProduct) { sem_medusa++; continue }

    try {
      await medusaRequest("POST", `/admin/products/${medusaProduct.id}`, {
        categories: [{ id: medusaCatId }],
      })
      atualizados++
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro"
      logger.error(`Falha ao atualizar categoria: sku=${product.sku}: ${msg}`)
      erros++
    }
  }

  logger.info("applyCategoryMappingToMedusa concluído", { atualizados, sem_medusa, erros, total_produtos })
  return { atualizados, sem_medusa, erros, total_produtos }
}
