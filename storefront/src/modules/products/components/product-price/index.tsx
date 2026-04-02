import { clx } from "@medusajs/ui"
import { getProductPrice } from "@lib/util/get-product-price"
import { HttpTypes } from "@medusajs/types"

export default function ProductPrice({
  product,
  variant,
}: {
  product: HttpTypes.StoreProduct
  variant?: HttpTypes.StoreProductVariant
}) {
  const { cheapestPrice, variantPrice } = getProductPrice({
    product,
    variantId: variant?.id,
  })

  const selectedPrice = variant ? variantPrice : cheapestPrice

  if (!selectedPrice) {
    return <div className="block w-32 h-9 bg-gray-100 animate-pulse rounded-lg" />
  }

  const isOnSale = selectedPrice.price_type === "sale"

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline gap-2">
        <span
          className={clx("text-2xl font-bold", {
            "text-bibelo-pink": isOnSale,
            "text-bibelo-dark": !isOnSale,
          })}
          data-testid="product-price"
          data-value={selectedPrice.calculated_price_number}
        >
          {!variant && "A partir de "}
          {selectedPrice.calculated_price}
        </span>
        {isOnSale && selectedPrice.original_price && (
          <span
            className="text-base text-bibelo-dark/40 line-through"
            data-testid="original-product-price"
            data-value={selectedPrice.original_price_number}
          >
            {selectedPrice.original_price}
          </span>
        )}
      </div>
      {isOnSale && selectedPrice.percentage_diff && (
        <span className="inline-flex items-center gap-1 text-xs font-bold text-white bg-bibelo-pink px-2.5 py-1 rounded-full w-fit">
          -{selectedPrice.percentage_diff}% OFF
        </span>
      )}
    </div>
  )
}
