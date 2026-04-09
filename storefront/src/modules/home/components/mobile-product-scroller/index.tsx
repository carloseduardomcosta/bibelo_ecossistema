import { listProducts } from "@lib/data/products"
import { HttpTypes } from "@medusajs/types"
import MobileProductScrollerClient from "./client"

interface Props {
  region: HttpTypes.StoreRegion
}

/**
 * MobileProductScroller — Server Component
 * Busca os produtos e passa para o client que anima o scroll.
 * Visível apenas em mobile (small:hidden no parent da homepage).
 */
export default async function MobileProductScroller({ region }: Props) {
  const {
    response: { products },
  } = await listProducts({
    regionId: region.id,
    queryParams: {
      fields: "*variants.calculated_price",
      limit: 8,
    },
  })

  if (!products || products.length === 0) return null

  return <MobileProductScrollerClient products={products} region={region} />
}
