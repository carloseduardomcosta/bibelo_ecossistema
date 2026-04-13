import { notFound } from "next/navigation"
import Link from "next/link"
import { getProductByHandle, listProducts } from "@/lib/medusa/products"
import AddToCartButton from "@/components/product/AddToCartButton"
import VariantSelector from "@/components/product/VariantSelector"
import ProductCard from "@/components/product/ProductCard"
import ImageGallery from "@/components/product/ImageGallery"
import FreteCalculator from "@/components/product/FreteCalculator"
import BuyNowButton from "@/components/product/BuyNowButton"
import { formatPrice, formatInstallments, getDiscountPercent } from "@/lib/utils"
import type { Metadata } from "next"

interface Props {
  params: Promise<{ handle: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle } = await params
  const product = await getProductByHandle(handle)
  if (!product) return { title: "Produto não encontrado" }
  return {
    title: product.title,
    description: product.description || `Compre ${product.title} na Papelaria Bibelô`,
    openGraph: {
      images: product.thumbnail ? [product.thumbnail] : [],
    },
  }
}

export const revalidate = 300

export default async function ProductPage({ params }: Props) {
  const { handle } = await params
  const product = await getProductByHandle(handle)
  if (!product) notFound()

  // Categorias do produto para relacionados
  const productCategories = (product.categories as Array<{ id: string }> | undefined) || []
  const firstCategoryId   = productCategories[0]?.id

  // Relacionados: mesma categoria se disponível, senão genérico
  const { products: related } = await listProducts({
    limit: 5,
    ...(firstCategoryId ? { categoryId: firstCategoryId } : {}),
  })
  const relatedFiltered = related.filter((p) => p.id !== product.id).slice(0, 4)

  const hasVariants = (product.variants?.length || 0) > 1

  const variant           = product.variants?.[0]
  const price             = variant?.calculated_price as { calculated_amount?: number; original_amount?: number } | undefined
  const calculatedAmount  = price?.calculated_amount || 0
  const originalAmount    = price?.original_amount || 0
  const discountPercent   = getDiscountPercent(originalAmount, calculatedAmount)
  const isOnSale          = discountPercent > 0
  const isOutOfStock      =
    variant?.inventory_quantity !== null &&
    variant?.inventory_quantity !== undefined &&
    (variant.inventory_quantity as number) <= 0

  const images = (product.images as Array<{ url: string }> | undefined) ||
    (product.thumbnail ? [{ url: product.thumbnail }] : [])

  const whatsappText = encodeURIComponent(
    `Olá! Vi o produto *${product.title}* na loja e gostaria de tirar uma dúvida.\n\nhttps://homolog.papelariabibelo.com.br/produto/${handle}`
  )

  return (
    <div className="content-container py-8 lg:py-12">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-xs text-gray-500 mb-6 lg:mb-8">
        <Link href="/" className="hover:text-bibelo-pink transition-colors">Início</Link>
        <span className="text-gray-300">/</span>
        <Link href="/produtos" className="hover:text-bibelo-pink transition-colors">Produtos</Link>
        <span className="text-gray-300">/</span>
        <span className="text-gray-700 font-medium line-clamp-1">{product.title}</span>
      </nav>

      {/* Layout principal */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-16 xl:gap-20">
        {/* Galeria com thumbnails clicáveis + zoom */}
        <ImageGallery
          images={images}
          title={product.title || "Produto"}
          isOutOfStock={isOutOfStock}
          isOnSale={isOnSale}
          discountPercent={discountPercent}
        />

        {/* Informações do produto */}
        <div className="flex flex-col gap-5 lg:gap-6">
          <div>
            {(product.collection as { title?: string } | null)?.title && (
              <p className="text-bibelo-pink text-xs font-semibold uppercase tracking-widest mb-1">
                {(product.collection as { title: string }).title}
              </p>
            )}
            <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold text-bibelo-dark leading-tight">
              {product.title}
            </h1>

            {/* Avaliações — placeholder visual */}
            <div className="flex items-center gap-1.5 mt-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <svg key={i} className="w-4 h-4 text-bibelo-amarelo fill-bibelo-amarelo" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
              ))}
              <span className="text-xs text-gray-400 ml-1">5.0 (avaliações em breve)</span>
            </div>
          </div>

          {/* Preço */}
          {calculatedAmount > 0 ? (
            <div>
              {isOnSale && (
                <p className="text-gray-400 line-through text-sm">{formatPrice(originalAmount)}</p>
              )}
              <p className={`text-3xl font-black ${isOnSale ? "text-bibelo-pink" : "text-bibelo-dark"}`}>
                {formatPrice(calculatedAmount)}
              </p>
              {calculatedAmount >= 1000 && (
                <p className="text-sm text-gray-500 mt-1">{formatInstallments(calculatedAmount)}</p>
              )}
              <p className="text-sm text-green-600 font-medium mt-1">
                <span className="inline-block w-2 h-2 bg-green-500 rounded-full mr-1.5" />
                Pix com 5% de desconto:{" "}
                <strong>{formatPrice(calculatedAmount * 0.95)}</strong>
              </p>
            </div>
          ) : (
            <p className="text-gray-500">Entre em contato para consultar o preço</p>
          )}

          {/* Seletor de variações + botões de ação */}
          {hasVariants ? (
            <VariantSelector product={product as unknown as Record<string, unknown>} />
          ) : !isOutOfStock && variant ? (
            <div className="flex flex-col gap-2">
              <BuyNowButton variantId={variant.id} productName={product.title} price={calculatedAmount} />
              <AddToCartButton variantId={variant.id} productName={product.title} price={calculatedAmount} />
            </div>
          ) : (
            <div>
              <button disabled className="btn-primary w-full opacity-50 cursor-not-allowed py-4 text-base">
                Produto Esgotado
              </button>
              <a
                href={`https://wa.me/5547933862514?text=${encodeURIComponent(`Olá! Tenho interesse no produto: ${product.title}. Quando estará disponível?`)}`}
                target="_blank"
                rel="noreferrer"
                className="mt-2 flex items-center justify-center gap-2 w-full py-3 rounded-full border-2 border-green-500 text-green-600 font-semibold hover:bg-green-50 transition-colors text-sm"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
                Avisar quando disponível
              </a>
            </div>
          )}

          {/* Trust badges */}
          <div className="grid grid-cols-3 gap-2 py-4 border-t border-b border-gray-100">
            {[
              { icon: "M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12", label: "Frete para todo Brasil" },
              { icon: "M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z", label: "Compra segura" },
              { icon: "M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99", label: "Troca fácil" },
            ].map((badge) => (
              <div key={badge.label} className="flex flex-col items-center gap-1 text-center">
                <svg className="w-5 h-5 text-bibelo-pink" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d={badge.icon} />
                </svg>
                <span className="text-[10px] text-gray-600 leading-tight">{badge.label}</span>
              </div>
            ))}
          </div>

          {/* Calculadora de frete */}
          <FreteCalculator />

          {/* Descrição em accordion */}
          {product.description && (
            <DescriptionAccordion description={product.description} />
          )}

          {/* Botão WhatsApp */}
          <a
            href={`https://wa.me/5547933862514?text=${whatsappText}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center gap-2.5 w-full py-3.5 rounded-full bg-green-500 text-white font-semibold hover:bg-green-600 active:bg-green-700 transition-colors text-sm shadow-md shadow-green-500/25"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
            </svg>
            Tirar dúvidas
          </a>
        </div>
      </div>

      {/* Produtos relacionados */}
      {relatedFiltered.length > 0 && (
        <div className="mt-16">
          <h2 className="section-title text-left mb-6">Você também pode gostar</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
            {relatedFiltered.map((p) => (
              <ProductCard
                key={p.id}
                product={p as Parameters<typeof ProductCard>[0]["product"]}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// Accordion de descrição — inline server component (sem estado do cliente)
function DescriptionAccordion({ description }: { description: string }) {
  return (
    <details className="group border border-gray-100 rounded-xl overflow-hidden">
      <summary className="flex items-center justify-between px-4 py-3 cursor-pointer select-none bg-gray-50/50 hover:bg-gray-50 transition-colors">
        <span className="font-semibold text-gray-800 text-sm">Descrição do produto</span>
        <svg
          className="w-4 h-4 text-gray-400 transition-transform group-open:rotate-180"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </summary>
      <div
        className="px-4 py-3 legal-content text-sm text-gray-600 leading-relaxed border-t border-gray-100"
        dangerouslySetInnerHTML={{ __html: description }}
      />
    </details>
  )
}
