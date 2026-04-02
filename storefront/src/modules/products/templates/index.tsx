import React, { Suspense } from "react"
import ImageGallery from "@modules/products/components/image-gallery"
import ProductActions from "@modules/products/components/product-actions"
import ProductOnboardingCta from "@modules/products/components/product-onboarding-cta"
import ProductTabs from "@modules/products/components/product-tabs"
import RelatedProducts from "@modules/products/components/related-products"
import ProductInfo from "@modules/products/templates/product-info"
import SkeletonRelatedProducts from "@modules/skeletons/templates/skeleton-related-products"
import { notFound } from "next/navigation"
import { HttpTypes } from "@medusajs/types"
import ProductActionsWrapper from "./product-actions-wrapper"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

type ProductTemplateProps = {
  product: HttpTypes.StoreProduct
  region: HttpTypes.StoreRegion
  countryCode: string
  images: HttpTypes.StoreProductImage[]
}

const ProductTemplate: React.FC<ProductTemplateProps> = ({
  product,
  region,
  countryCode,
  images,
}) => {
  if (!product || !product.id) {
    return notFound()
  }

  return (
    <>
      <div className="content-container py-6" data-testid="product-container">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-xs text-bibelo-dark/50 mb-6">
          <LocalizedClientLink href="/" className="hover:text-bibelo-pink transition-colors">
            Início
          </LocalizedClientLink>
          <span>/</span>
          <LocalizedClientLink href="/store" className="hover:text-bibelo-pink transition-colors">
            Loja
          </LocalizedClientLink>
          {product.collection && (
            <>
              <span>/</span>
              <LocalizedClientLink
                href={`/collections/${product.collection.handle}`}
                className="hover:text-bibelo-pink transition-colors"
              >
                {product.collection.title}
              </LocalizedClientLink>
            </>
          )}
          <span>/</span>
          <span className="text-bibelo-dark/70 font-medium line-clamp-1">{product.title}</span>
        </nav>

        {/* Layout principal: imagem à esquerda, info à direita */}
        <div className="flex flex-col small:flex-row gap-8 small:gap-12">
          {/* Galeria de imagens — coluna esquerda (maior) */}
          <div className="w-full small:w-[55%] small:sticky small:top-24 small:self-start">
            <ImageGallery images={images} />
          </div>

          {/* Info + Ações — coluna direita */}
          <div className="w-full small:w-[45%] flex flex-col gap-y-6">
            <ProductInfo product={product} />
            <ProductTabs product={product} />
            <ProductOnboardingCta />
            <Suspense
              fallback={
                <ProductActions
                  disabled={true}
                  product={product}
                  region={region}
                />
              }
            >
              <ProductActionsWrapper id={product.id} region={region} />
            </Suspense>

            {/* Trust badges abaixo do botão */}
            <div className="flex flex-wrap gap-3 pt-2 border-t border-bibelo-rosa/50">
              {[
                { icon: "🚚", text: "Frete grátis acima de R$ 199" },
                { icon: "🔒", text: "Compra segura" },
                { icon: "💳", text: "Pix sem juros" },
                { icon: "↩️", text: "Troca facilitada" },
              ].map((badge) => (
                <div key={badge.text} className="flex items-center gap-1.5 text-xs text-bibelo-dark/60">
                  <span>{badge.icon}</span>
                  <span>{badge.text}</span>
                </div>
              ))}
            </div>

            {/* WhatsApp CTA */}
            <a
              href={`https://wa.me/5547933862514?text=Olá!%20Tenho%20interesse%20no%20produto:%20${encodeURIComponent(product.title)}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-2 w-full border-2 border-[#25D366] text-[#25D366] hover:bg-[#25D366] hover:text-white font-semibold py-3 rounded-full transition-all duration-200 text-sm"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
                <path d="M12 0C5.373 0 0 5.373 0 12c0 2.625.846 5.059 2.284 7.034L.789 23.492a.75.75 0 00.917.918l4.458-1.495A11.952 11.952 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-2.347 0-4.518-.802-6.235-2.147a.75.75 0 00-.652-.13l-3.08 1.033 1.033-3.08a.75.75 0 00-.13-.652A9.96 9.96 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z" />
              </svg>
              Tirar dúvidas pelo WhatsApp
            </a>
          </div>
        </div>
      </div>

      {/* Produtos relacionados */}
      <div className="content-container my-16" data-testid="related-products-container">
        <div className="mb-8">
          <p className="text-xs uppercase tracking-[0.15em] text-bibelo-pink font-semibold mb-1">
            Você também pode gostar
          </p>
          <h2 className="font-heading text-2xl font-semibold text-bibelo-dark">
            Produtos relacionados
          </h2>
        </div>
        <Suspense fallback={<SkeletonRelatedProducts />}>
          <RelatedProducts product={product} countryCode={countryCode} />
        </Suspense>
      </div>
    </>
  )
}

export default ProductTemplate
