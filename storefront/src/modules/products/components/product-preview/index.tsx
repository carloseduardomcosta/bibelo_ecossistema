import { Text, clx } from "@medusajs/ui"
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
  const { cheapestPrice } = getProductPrice({
    product,
  })

  // Calculate discount percentage
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

  // Extract brand from metadata or subtitle
  const brand = (product.metadata?.brand as string) || product.subtitle || null

  return (
    <LocalizedClientLink href={`/products/${product.handle}`} className="group">
      <div className="relative" data-testid="product-wrapper">
        {/* Discount badge */}
        {discountPct > 0 && (
          <div className="absolute top-2 left-2 z-10 bg-bibelo-pink text-white text-xs font-semibold px-2 py-0.5 rounded-full">
            -{discountPct}%
          </div>
        )}

        <Thumbnail
          thumbnail={product.thumbnail}
          images={product.images}
          size="square"
          isFeatured={isFeatured}
          productTitle={product.title}
        />

        <div className="mt-3 px-0.5">
          {/* Brand */}
          {brand && (
            <p className="text-[10px] uppercase tracking-wider text-bibelo-dark/40 font-medium mb-0.5">
              {brand}
            </p>
          )}
          {/* Title */}
          <Text
            className="text-sm text-bibelo-dark leading-snug line-clamp-2"
            data-testid="product-title"
          >
            {product.title}
          </Text>
          {/* Price */}
          <div className="flex items-center gap-x-2 mt-1">
            {cheapestPrice && <PreviewPrice price={cheapestPrice} />}
          </div>
        </div>
      </div>
    </LocalizedClientLink>
  )
}
