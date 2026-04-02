import { Text } from "@medusajs/ui"
import { getProductPrice } from "@lib/util/get-product-price"
import { HttpTypes } from "@medusajs/types"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import Thumbnail from "../thumbnail"
import PreviewPrice from "./price"

export default async function ProductPreview({
  product,
  isFeatured,
  region,
}: {
  product: HttpTypes.StoreProduct
  isFeatured?: boolean
  region: HttpTypes.StoreRegion
}) {
  const { cheapestPrice } = getProductPrice({ product })

  const discountPct =
    cheapestPrice?.price_type === "sale" &&
    cheapestPrice?.original_price &&
    cheapestPrice?.calculated_price
      ? Math.round(
          ((parseFloat(cheapestPrice.original_price.replace(/[^\d,]/g, "").replace(",", ".")) -
            parseFloat(cheapestPrice.calculated_price.replace(/[^\d,]/g, "").replace(",", "."))) /
            parseFloat(cheapestPrice.original_price.replace(/[^\d,]/g, "").replace(",", "."))) *
            100
        )
      : 0

  const brand = (product.metadata?.brand as string) || product.subtitle || null

  const inStock = product.variants?.some((v) => {
    if (!v.manage_inventory) return true
    return (v.inventory_quantity ?? 0) > 0
  }) ?? true

  return (
    <LocalizedClientLink href={`/products/${product.handle}`} className="group block">
      <div className="relative" data-testid="product-wrapper">
        <div className="relative overflow-hidden rounded-2xl">
          {discountPct > 0 && (
            <div className="absolute top-2.5 left-2.5 z-10 bg-bibelo-pink text-white text-[11px] font-bold px-2.5 py-1 rounded-full shadow-sm">
              -{discountPct}%
            </div>
          )}
          {!inStock && (
            <div className="absolute top-2.5 right-2.5 z-10 bg-bibelo-dark/80 text-white text-[11px] font-medium px-2.5 py-1 rounded-full">
              Esgotado
            </div>
          )}
          <Thumbnail
            thumbnail={product.thumbnail}
            images={product.images}
            size="square"
            isFeatured={isFeatured}
            productTitle={product.title}
          />
          {inStock && (
            <div className="absolute inset-x-0 bottom-0 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out z-10">
              <div className="mx-2 mb-2">
                <div className="w-full bg-bibelo-dark/90 backdrop-blur-sm hover:bg-bibelo-dark text-white text-xs font-semibold py-2.5 rounded-xl text-center transition-colors flex items-center justify-center gap-2">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007z" />
                  </svg>
                  Ver produto
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="mt-3 px-0.5">
          {brand && (
            <p className="text-[10px] uppercase tracking-wider text-bibelo-dark/40 font-semibold mb-0.5">
              {brand}
            </p>
          )}
          <Text
            className="text-sm text-bibelo-dark leading-snug line-clamp-2 group-hover:text-bibelo-pink transition-colors"
            data-testid="product-title"
          >
            {product.title}
          </Text>
          <div className="flex items-center gap-x-2 mt-1.5">
            {cheapestPrice && <PreviewPrice price={cheapestPrice} />}
          </div>
        </div>
      </div>
    </LocalizedClientLink>
  )
}
