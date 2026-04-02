import { HttpTypes } from "@medusajs/types"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

type ProductInfoProps = {
  product: HttpTypes.StoreProduct
}

const ProductInfo = ({ product }: ProductInfoProps) => {
  const brand = (product.metadata?.brand as string) || product.subtitle || null

  return (
    <div id="product-info" className="flex flex-col gap-y-3">
      {product.collection && (
        <LocalizedClientLink
          href={`/collections/${product.collection.handle}`}
          className="text-xs uppercase tracking-[0.15em] text-bibelo-pink font-semibold hover:text-[#e050a8] transition-colors"
        >
          {product.collection.title}
        </LocalizedClientLink>
      )}
      {brand && !product.collection && (
        <p className="text-xs uppercase tracking-[0.15em] text-bibelo-dark/40 font-semibold">
          {brand}
        </p>
      )}
      <h1
        className="font-heading text-3xl small:text-4xl font-semibold text-bibelo-dark leading-tight"
        data-testid="product-title"
      >
        {product.title}
      </h1>
      {product.description && (
        <p
          className="text-sm text-bibelo-dark/70 leading-relaxed whitespace-pre-line"
          data-testid="product-description"
        >
          {product.description}
        </p>
      )}
    </div>
  )
}

export default ProductInfo
