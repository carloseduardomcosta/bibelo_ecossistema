/**
 * Sync Loja Bling — Registrar categorias e produtos no canal StoreFront
 *
 * Loja API: 206025202 (StoreFront - Loja On-line v2 HOMOLOGAÇÃO)
 *
 * Usa rateLimitedGet/Post do módulo de sync existente.
 * Seguro: só cria vínculos, não altera produtos/estoque/preços.
 */

import axios from "axios"
import { query, queryOne } from "../../db"
import { logger } from "../../utils/logger"
import { getValidToken, BLING_API } from "./auth"

const LOJA_ID = parseInt(process.env.BLING_LOJA_STOREFRONT_ID || "206025202", 10)

// ── Rate limit (mesmo mutex do sync.ts) ─────────────────────

let blingPending: Promise<void> = Promise.resolve()

async function rateLimitedRequest<T>(
  method: "get" | "post" | "put" | "delete",
  url: string,
  token: string,
  body?: Record<string, unknown>
): Promise<T> {
  const MAX_RETRIES = 3
  const BACKOFF = [5000, 10000, 20000]

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const wait = blingPending
    let releaseLock!: () => void
    blingPending = new Promise<void>((r) => { releaseLock = r })
    await wait

    try {
      const { data } = await axios({
        method,
        url,
        data: body,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        timeout: 15000,
      })
      setTimeout(() => releaseLock(), 350)
      return data
    } catch (err: unknown) {
      const axiosErr = err as { response?: { status?: number; data?: unknown; headers?: Record<string, string> } }
      if (axiosErr.response?.status === 429 && attempt < MAX_RETRIES) {
        const retryAfter = parseInt(axiosErr.response.headers?.["retry-after"] || "0", 10)
        const waitMs = retryAfter > 0 ? retryAfter * 1000 : BACKOFF[attempt]
        logger.warn(`Bling loja-sync 429: tentativa ${attempt + 1}/${MAX_RETRIES}, aguardando ${waitMs}ms`)
        await new Promise((resolve) => setTimeout(resolve, waitMs))
        releaseLock()
        continue
      }
      setTimeout(() => releaseLock(), 350)
      throw err
    }
  }
  throw new Error("Max retries exceeded")
}

// ── Buscar categorias já registradas na loja ─────────────────

async function getExistingLojaCategories(token: string): Promise<Map<string, number>> {
  const map = new Map<string, number>() // bling_category_id → idCategoriaLoja
  let page = 1
  while (true) {
    try {
      const data = await rateLimitedRequest<{ data: Array<{ id: number; categoriaProduto?: { id: number }; codigo?: string }> }>(
        "get",
        `${BLING_API}/categorias/lojas?idLoja=${LOJA_ID}&pagina=${page}&limite=100`,
        token
      )
      if (!data.data || data.data.length === 0) break
      for (const cat of data.data) {
        if (cat.categoriaProduto?.id) {
          map.set(String(cat.categoriaProduto.id), cat.id)
        }
      }
      page++
    } catch {
      break
    }
  }
  return map
}

// ── Registrar categorias na loja ─────────────────────────────

export async function syncCategoriasToLoja(): Promise<{ created: number; existing: number; errors: number }> {
  const token = await getValidToken()
  logger.info(`Bling loja-sync: registrando categorias na loja ${LOJA_ID}...`)

  // Buscar categorias do Bling
  const categories = await query<{ bling_id: string; descricao: string }>(
    "SELECT bling_id, descricao FROM sync.bling_categories ORDER BY descricao"
  )

  // Buscar já registradas
  const existing = await getExistingLojaCategories(token)

  let created = 0
  let skipped = 0
  let errors = 0

  for (const cat of categories) {
    if (existing.has(cat.bling_id)) {
      skipped++
      continue
    }

    try {
      await rateLimitedRequest(
        "post",
        `${BLING_API}/categorias/lojas`,
        token,
        {
          loja: { id: LOJA_ID },
          descricao: cat.descricao,
          codigo: cat.bling_id, // ID do Bling como código na loja
          categoriaProduto: { id: parseInt(cat.bling_id, 10) },
        }
      )
      created++
      logger.info(`  ✓ Categoria: ${cat.descricao}`)
    } catch (err: unknown) {
      const axiosErr = err as { response?: { status?: number; data?: unknown } }
      const msg = JSON.stringify(axiosErr.response?.data || "")
      logger.error(`  ✗ Categoria ${cat.descricao}: ${msg}`)
      errors++
    }
  }

  logger.info(`Bling loja-sync categorias: ${created} criadas, ${skipped} existentes, ${errors} erros`)
  return { created, existing: skipped, errors }
}

// ── Buscar produtos já vinculados na loja ────────────────────

async function getExistingLojaProdutos(token: string): Promise<Set<string>> {
  const set = new Set<string>() // bling_product_id
  let page = 1
  while (true) {
    try {
      const data = await rateLimitedRequest<{ data: Array<{ produto?: { id: number } }> }>(
        "get",
        `${BLING_API}/produtos/lojas?idLoja=${LOJA_ID}&pagina=${page}&limite=100`,
        token
      )
      if (!data.data || data.data.length === 0) break
      for (const p of data.data) {
        if (p.produto?.id) {
          set.add(String(p.produto.id))
        }
      }
      page++
    } catch {
      break
    }
  }
  return set
}

// ── Vincular produtos na loja ────────────────────────────────

export async function syncProdutosToLoja(): Promise<{ created: number; existing: number; errors: number }> {
  const token = await getValidToken()
  logger.info(`Bling loja-sync: vinculando produtos na loja ${LOJA_ID}...`)

  // Buscar produtos ativos do Bling
  const products = await query<{ bling_id: string; sku: string; preco_venda: number; bling_category_id: string | null }>(
    "SELECT bling_id, sku, preco_venda, bling_category_id FROM sync.bling_products WHERE ativo = true AND sku IS NOT NULL AND sku != '' ORDER BY nome"
  )

  // Buscar já vinculados
  const existing = await getExistingLojaProdutos(token)

  // Buscar mapeamento de categorias da loja (bling_category_id → idCategoriaLoja)
  const lojaCategories = await getExistingLojaCategories(token)

  let created = 0
  let skipped = 0
  let errors = 0
  let consecutiveErrors = 0

  for (const prod of products) {
    if (existing.has(prod.bling_id)) {
      skipped++
      continue
    }

    const body: Record<string, unknown> = {
      codigo: prod.sku,
      preco: prod.preco_venda,
      produto: { id: parseInt(prod.bling_id, 10) },
      loja: { id: LOJA_ID },
    }

    // Vincular categoria da loja se existir
    if (prod.bling_category_id) {
      const lojaCatId = lojaCategories.get(prod.bling_category_id)
      if (lojaCatId) {
        body.categoriasProdutos = [{ id: lojaCatId }]
      }
    }

    try {
      await rateLimitedRequest("post", `${BLING_API}/produtos/lojas`, token, body)
      created++
      consecutiveErrors = 0
      if (created % 50 === 0) {
        logger.info(`  Vinculados: ${created}/${products.length - skipped}...`)
      }
    } catch (err: unknown) {
      const axiosErr = err as { response?: { status?: number; data?: unknown } }
      const status = axiosErr.response?.status
      const msg = JSON.stringify(axiosErr.response?.data || "")
      logger.error(`  ✗ SKU=${prod.sku}: ${status} ${msg}`)
      errors++
      consecutiveErrors++

      // Circuit breaker
      if (consecutiveErrors >= 5) {
        logger.error(`CIRCUIT BREAKER: ${consecutiveErrors} erros consecutivos — parando`)
        break
      }
    }
  }

  logger.info(`Bling loja-sync produtos: ${created} vinculados, ${skipped} existentes, ${errors} erros (total: ${products.length})`)
  return { created, existing: skipped, errors }
}

// ── Sync completo ────────────────────────────────────────────

export async function syncLojaCompleta(): Promise<{
  categorias: { created: number; existing: number; errors: number }
  produtos: { created: number; existing: number; errors: number }
}> {
  logger.info(`=== Bling Loja Sync: loja ${LOJA_ID} ===`)

  // 1. Categorias primeiro (produtos dependem)
  const categorias = await syncCategoriasToLoja()

  // 2. Produtos depois
  const produtos = await syncProdutosToLoja()

  logger.info(`=== Bling Loja Sync concluído ===`)
  logger.info(`  Categorias: ${categorias.created} novas, ${categorias.existing} existentes, ${categorias.errors} erros`)
  logger.info(`  Produtos: ${produtos.created} novos, ${produtos.existing} existentes, ${produtos.errors} erros`)

  return { categorias, produtos }
}
