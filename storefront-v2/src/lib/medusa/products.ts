import { unstable_cache } from "next/cache"
import medusa from "./client"

// ID real da região Brasil no Medusa (não é "br", é o UUID)
const DEFAULT_REGION = process.env.NEXT_PUBLIC_DEFAULT_REGION_ID || "reg_01KN52HV0TQAY4ZC1PEYWAQSY2"

// Buscar lista de produtos
export async function listProducts({
  limit = 12,
  offset = 0,
  categoryId,
  collectionId,
  q,
  order,
}: {
  limit?: number
  offset?: number
  categoryId?: string
  collectionId?: string
  q?: string
  order?: string
} = {}) {
  try {
    const params: Record<string, unknown> = {
      limit,
      offset,
      region_id: DEFAULT_REGION,
      fields: "*variants.calculated_price,+variants.inventory_quantity",
    }

    if (categoryId) {
      // Se é um handle (string sem "pcat_"), resolver para UUID via API
      if (!categoryId.startsWith("pcat_")) {
        try {
          const catRes = await medusa.store.category.list({ handle: categoryId } as Parameters<typeof medusa.store.category.list>[0])
          const cat = catRes.product_categories?.[0]
          if (cat) {
            params.category_id = [cat.id]
          }
        } catch {
          // Se falhar, tenta usar como ID direto
          params.category_id = [categoryId]
        }
      } else {
        params.category_id = [categoryId]
      }
    }
    if (collectionId) params.collection_id = [collectionId]
    if (q) params.q = q
    if (order) params.order = order

    const { products, count } = await medusa.store.product.list(params as Parameters<typeof medusa.store.product.list>[0])
    return { products, count }
  } catch (error) {
    console.error("[Medusa] listProducts error:", error)
    return { products: [], count: 0 }
  }
}

// Buscar produto por handle
export async function getProductByHandle(handle: string) {
  try {
    const { products } = await medusa.store.product.list({
      handle,
      region_id: DEFAULT_REGION,
      fields: "*variants.calculated_price,+variants.inventory_quantity,+variants.options,+images,+options,+options.values,+categories",
    } as Parameters<typeof medusa.store.product.list>[0])
    return products[0] || null
  } catch (error) {
    console.error("[Medusa] getProductByHandle error:", error)
    return null
  }
}

// Buscar categorias — cacheada por 1h (categorias mudam raramente)
// unstable_cache deduplica requests concorrentes e serve do cache entre revalidações
const _fetchCategories = async () => {
  const { product_categories } = await medusa.store.category.list({
    include_descendants_tree: true,
  } as Parameters<typeof medusa.store.category.list>[0])
  return product_categories || []
}

export const listCategories = unstable_cache(
  _fetchCategories,
  ["medusa-categories"],
  { revalidate: 3600, tags: ["categories"] }
)

// Buscar produtos para /busca — limit 100, inclui categorias para facets
export async function searchProducts(q: string) {
  try {
    const { products, count } = await medusa.store.product.list({
      q,
      limit: 100,
      region_id: DEFAULT_REGION,
      fields: "*variants.calculated_price,+variants.inventory_quantity,+categories",
    } as Parameters<typeof medusa.store.product.list>[0])
    return { products: products || [], count: count || 0 }
  } catch (error) {
    console.error("[Medusa] searchProducts error:", error)
    return { products: [], count: 0 }
  }
}

// Buscar coleções
export async function listCollections() {
  try {
    const { collections } = await medusa.store.collection.list()
    return collections || []
  } catch (error) {
    console.error("[Medusa] listCollections error:", error)
    return []
  }
}
