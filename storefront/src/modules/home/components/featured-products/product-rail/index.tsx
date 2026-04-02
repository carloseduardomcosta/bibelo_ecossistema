import { listProducts } from "@lib/data/products"
import { HttpTypes } from "@medusajs/types"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import ProductPreview from "@modules/products/components/product-preview"

export default async function ProductRail({
  collection,
  region,
}: {
  collection: HttpTypes.StoreCollection
  region: HttpTypes.StoreRegion
}) {
  const {
    response: { products: pricedProducts },
  } = await listProducts({
    regionId: region.id,
    queryParams: {
      collection_id: collection.id,
      fields: "*variants.calculated_price",
    },
  })

  if (!pricedProducts) {
    return null
  }

  return (
    <div className="content-container py-10">
      <div className="flex justify-between items-end mb-6">
        <div>
          <p className="text-xs uppercase tracking-[0.15em] text-bibelo-pink font-semibold mb-1">
            Coleção
          </p>
          <h2 className="font-heading text-2xl font-semibold text-bibelo-dark">
            {collection.title}
          </h2>
        </div>
        <LocalizedClientLink
          href={`/collections/${collection.handle}`}
          className="text-sm font-medium text-bibelo-pink hover:text-[#e050a8] flex items-center gap-1 transition-colors"
        >
          Ver todos
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
          </svg>
        </LocalizedClientLink>
      </div>
      <ul className="grid grid-cols-2 small:grid-cols-3 large:grid-cols-4 gap-4 small:gap-6">
        {pricedProducts.slice(0, 8).map((product) => (
          <li key={product.id}>
            <ProductPreview product={product} region={region} isFeatured />
          </li>
        ))}
      </ul>
    </div>
  )
}
