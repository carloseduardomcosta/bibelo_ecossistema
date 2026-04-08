import medusa from "./client"

const DEFAULT_REGION = process.env.NEXT_PUBLIC_DEFAULT_REGION || "br"

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

    if (categoryId) params.category_id = [categoryId]
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
      fields: "*variants.calculated_price,+variants.inventory_quantity,+images",
    } as Parameters<typeof medusa.store.product.list>[0])
    return products[0] || null
  } catch (error) {
    console.error("[Medusa] getProductByHandle error:", error)
    return null
  }
}

// Buscar categorias
export async function listCategories() {
  try {
    const { product_categories } = await medusa.store.category.list({
      include_descendants_tree: true,
    } as Parameters<typeof medusa.store.category.list>[0])
    return product_categories || []
  } catch (error) {
    console.error("[Medusa] listCategories error:", error)
    return []
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
