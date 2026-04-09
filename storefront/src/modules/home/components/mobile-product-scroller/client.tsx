"use client"

import { useRef, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { HttpTypes } from "@medusajs/types"
import { getProductPrice } from "@lib/util/get-product-price"

interface Props {
  products: HttpTypes.StoreProduct[]
  region: HttpTypes.StoreRegion
}

function ProductMiniCard({
  product,
}: {
  product: HttpTypes.StoreProduct
}) {
  const { cheapestPrice } = getProductPrice({ product })

  const isOnSale = cheapestPrice?.price_type === "sale"
  const price = cheapestPrice?.calculated_price ?? null
  const originalPrice = cheapestPrice?.original_price ?? null

  const inStock =
    product.variants?.some((v) => {
      if (!v.manage_inventory) return true
      return (v.inventory_quantity ?? 0) > 0
    }) ?? true

  return (
    <Link
      href={`/products/${product.handle}`}
      className="flex-shrink-0 w-[140px] bg-white rounded-2xl overflow-hidden shadow-sm border border-bibelo-rosa/30 active:scale-95 transition-transform"
      style={{ WebkitTapHighlightColor: "transparent" }}
    >
      {/* Imagem */}
      <div className="relative w-full aspect-square bg-gray-50">
        {product.thumbnail ? (
          <Image
            src={product.thumbnail}
            alt={product.title ?? "Produto"}
            fill
            sizes="140px"
            className="object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <svg
              className="w-10 h-10 text-gray-200"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1}
                d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5z"
              />
            </svg>
          </div>
        )}
        {/* Badge desconto */}
        {isOnSale && (
          <div className="absolute top-2 left-2 bg-bibelo-pink text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
            OFERTA
          </div>
        )}
        {/* Badge esgotado */}
        {!inStock && (
          <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
            <span className="bg-white/90 text-bibelo-dark text-[10px] font-semibold px-2 py-0.5 rounded-full">
              Esgotado
            </span>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-2.5">
        <p className="text-[11px] font-medium text-bibelo-dark leading-tight line-clamp-2 mb-1.5">
          {product.title}
        </p>
        {price ? (
          <div>
            {isOnSale && originalPrice && (
              <p className="text-[10px] text-gray-400 line-through leading-none mb-0.5">
                {originalPrice}
              </p>
            )}
            <p
              className={`text-sm font-black leading-none ${
                isOnSale ? "text-bibelo-pink" : "text-bibelo-dark"
              }`}
            >
              {price}
            </p>
          </div>
        ) : (
          <p className="text-[11px] text-gray-400">Consulte</p>
        )}
      </div>
    </Link>
  )
}

export default function MobileProductScrollerClient({ products, region }: Props) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [paused, setPaused] = useState(false)

  // Duplica os produtos para criar o efeito de loop infinito
  const doubled = [...products, ...products]

  return (
    <section className="small:hidden py-4 bg-white overflow-hidden">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between px-4 mb-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.15em] text-bibelo-pink font-semibold">
            Selecionados para você
          </p>
          <h2 className="text-base font-bold text-bibelo-dark leading-tight">
            ✨ Destaques da semana
          </h2>
        </div>
        <Link
          href="/store"
          className="text-xs font-semibold text-bibelo-pink flex items-center gap-1"
        >
          Ver todos
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"
            />
          </svg>
        </Link>
      </div>

      {/* Faixa de scroll animada */}
      <div
        className="relative"
        onTouchStart={() => setPaused(true)}
        onTouchEnd={() => setPaused(false)}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        {/* Gradiente esquerda */}
        <div className="absolute left-0 top-0 bottom-0 w-6 bg-gradient-to-r from-white to-transparent z-10 pointer-events-none" />
        {/* Gradiente direita */}
        <div className="absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-white to-transparent z-10 pointer-events-none" />

        {/* Track animado */}
        <div
          ref={trackRef}
          className="flex gap-3 pl-4"
          style={{
            animation: `bibelo-scroll ${products.length * 3}s linear infinite`,
            animationPlayState: paused ? "paused" : "running",
            width: "max-content",
          }}
        >
          {doubled.map((product, idx) => (
            <ProductMiniCard
              key={`${product.id}-${idx}`}
              product={product}
            />
          ))}
        </div>
      </div>

      {/* Keyframe injetado inline — compatível com Next.js App Router */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @keyframes bibelo-scroll {
              0% { transform: translateX(0); }
              100% { transform: translateX(-50%); }
            }
          `,
        }}
      />
    </section>
  )
}
