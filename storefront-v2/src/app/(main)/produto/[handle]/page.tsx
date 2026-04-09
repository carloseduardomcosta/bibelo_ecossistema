import { notFound } from "next/navigation"
import Image from "next/image"
import Link from "next/link"
import { getProductByHandle, listProducts } from "@/lib/medusa/products"
import AddToCartButton from "@/components/product/AddToCartButton"
import ProductCard from "@/components/product/ProductCard"
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

  const { products: related } = await listProducts({ limit: 5 })
  const relatedFiltered = related.filter((p) => p.id !== product.id).slice(0, 4)

  const variant = product.variants?.[0]
  const price = variant?.calculated_price as { calculated_amount?: number; original_amount?: number } | undefined
  const calculatedAmount = price?.calculated_amount || 0
  const originalAmount = price?.original_amount || 0
  const discountPercent = getDiscountPercent(originalAmount, calculatedAmount)
  const isOnSale = discountPercent > 0
  const isOutOfStock =
    variant?.inventory_quantity !== null &&
    variant?.inventory_quantity !== undefined &&
    (variant.inventory_quantity as number) <= 0

  const images = (product.images as Array<{ url: string }> | undefined) ||
    (product.thumbnail ? [{ url: product.thumbnail }] : [])

  return (
    <div className="content-container py-8">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-xs text-gray-500 mb-6">
        <Link href="/" className="hover:text-bibelo-pink transition-colors">Início</Link>
        <span>/</span>
        <Link href="/produtos" className="hover:text-bibelo-pink transition-colors">Produtos</Link>
        <span>/</span>
        <span className="text-gray-700 font-medium line-clamp-1">{product.title}</span>
      </nav>

      {/* Layout principal */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
        {/* Galeria de imagens */}
        <div className="space-y-3">
          <div className="relative aspect-square bg-gray-50 rounded-2xl overflow-hidden border border-gray-100">
            {images[0] ? (
              <Image
                src={images[0].url}
                alt={product.title || "Produto"}
                fill
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="object-contain p-4"
                priority
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <svg className="w-20 h-20 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5z" />
                </svg>
              </div>
            )}
            {/* Badges */}
            <div className="absolute top-3 left-3 flex flex-col gap-1.5">
              {isOutOfStock && <span className="badge-sold-out">ESGOTADO</span>}
              {isOnSale && !isOutOfStock && <span className="badge-off">{discountPercent}% OFF</span>}
            </div>
          </div>

          {/* Miniaturas */}
          {images.length > 1 && (
            <div className="flex gap-2 overflow-x-auto scrollbar-hide">
              {images.map((img, idx) => (
                <div key={idx} className="w-16 h-16 shrink-0 bg-gray-50 rounded-lg overflow-hidden border border-gray-100 cursor-pointer hover:border-bibelo-pink transition-colors">
                  <Image src={img.url} alt={`${product.title} ${idx + 1}`} width={64} height={64} className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Informações do produto */}
        <div className="flex flex-col gap-5">
          <div>
            {(product.collection as { title?: string } | null)?.title && (
              <p className="text-bibelo-pink text-xs font-semibold uppercase tracking-widest mb-1">
                {(product.collection as { title: string }).title}
              </p>
            )}
            <h1 className="text-2xl md:text-3xl font-bold text-bibelo-dark leading-tight">{product.title}</h1>
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

          {/* Botão de compra */}
          {!isOutOfStock && variant ? (
            <AddToCartButton variantId={variant.id} />
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

          {/* Descrição */}
          {product.description && (
            <div>
              <h2 className="font-semibold text-gray-800 mb-2">Descrição</h2>
              <div
                className="legal-content text-sm text-gray-600 leading-relaxed"
                dangerouslySetInnerHTML={{ __html: product.description }}
              />
            </div>
          )}

          {/* WhatsApp */}
          <a
            href={`https://wa.me/5547933862514?text=${encodeURIComponent(`Olá! Tenho dúvidas sobre: ${product.title}`)}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 text-sm text-green-600 hover:text-green-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
            </svg>
            Dúvidas? Fale conosco no WhatsApp
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
