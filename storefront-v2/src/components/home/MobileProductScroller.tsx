"use client"

import { useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { formatPrice, getDiscountPercent } from "@/lib/utils"

interface ProductVariant {
  id: string
  calculated_price?: {
    calculated_amount: number
    original_amount: number
  }
  inventory_quantity?: number | null
}

interface Product {
  id: string
  title: string
  handle: string
  thumbnail?: string | null
  variants?: ProductVariant[]
}

interface Props {
  products: Product[]
}

function MiniCard({ product }: { product: Product }) {
  const variant = product.variants?.[0]
  const price = variant?.calculated_price
  const calculatedAmount = price?.calculated_amount || 0
  const originalAmount = price?.original_amount || 0
  const discountPercent = getDiscountPercent(originalAmount, calculatedAmount)
  const isOnSale = discountPercent > 0
  const isOutOfStock =
    variant?.inventory_quantity !== null &&
    variant?.inventory_quantity !== undefined &&
    variant.inventory_quantity <= 0

  return (
    <Link
      href={`/produto/${product.handle}`}
      className="flex-shrink-0 w-[136px] bg-white rounded-2xl overflow-hidden
                 shadow-sm border border-pink-100 active:scale-95 transition-transform duration-150"
      style={{ WebkitTapHighlightColor: "transparent" }}
    >
      {/* Imagem */}
      <div className="relative w-full aspect-square bg-gray-50">
        {product.thumbnail ? (
          <Image
            src={product.thumbnail}
            alt={product.title}
            fill
            sizes="136px"
            className="object-cover"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-pink-50 to-yellow-50">
            <span className="text-2xl font-bold text-pink-200">
              {product.title?.charAt(0)?.toUpperCase() || "?"}
            </span>
          </div>
        )}

        {/* Badge desconto */}
        {isOnSale && !isOutOfStock && (
          <div className="absolute top-1.5 left-1.5 bg-[#ff65c3] text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full leading-none">
            -{discountPercent}%
          </div>
        )}

        {/* Badge esgotado */}
        {isOutOfStock && (
          <div className="absolute inset-0 bg-black/25 flex items-center justify-center">
            <span className="bg-white/90 text-gray-600 text-[9px] font-semibold px-2 py-0.5 rounded-full">
              Esgotado
            </span>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-2">
        <p className="text-[11px] font-medium text-gray-800 leading-tight line-clamp-2 mb-1.5 min-h-[2.5em]">
          {product.title}
        </p>
        {calculatedAmount > 0 ? (
          <div>
            {isOnSale && (
              <p className="text-[9px] text-gray-400 line-through leading-none mb-0.5">
                {formatPrice(originalAmount)}
              </p>
            )}
            <p className={`text-sm font-black leading-none ${isOnSale ? "text-[#ff65c3]" : "text-gray-800"}`}>
              {formatPrice(calculatedAmount)}
            </p>
          </div>
        ) : (
          <p className="text-[10px] text-gray-400">Consulte</p>
        )}
      </div>
    </Link>
  )
}

export default function MobileProductScroller({ products }: Props) {
  const [paused, setPaused] = useState(false)

  if (!products || products.length === 0) return null

  // Duplica para loop infinito perfeito
  const doubled = [...products, ...products]
  // Velocidade: 4s por card
  const duration = products.length * 4

  return (
    <section
      className="md:hidden bg-white overflow-hidden py-3"
      aria-label="Destaques da semana"
    >
      {/* Cabeçalho */}
      <div className="flex items-center justify-between px-4 mb-2.5">
        <div>
          <p className="text-[9px] uppercase tracking-[0.18em] text-[#ff65c3] font-bold">
            Selecionados para você
          </p>
          <h2 className="text-[13px] font-bold text-gray-800 leading-tight">
            ✨ Destaques da semana
          </h2>
        </div>
        <Link
          href="/produtos"
          className="text-[11px] font-semibold text-[#ff65c3] flex items-center gap-0.5"
        >
          Ver todos
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
          </svg>
        </Link>
      </div>

      {/* Faixa animada */}
      <div
        className="relative"
        onTouchStart={() => setPaused(true)}
        onTouchEnd={() => setPaused(false)}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        {/* Fade esquerda */}
        <div className="absolute left-0 top-0 bottom-0 w-5 bg-gradient-to-r from-white to-transparent z-10 pointer-events-none" />
        {/* Fade direita */}
        <div className="absolute right-0 top-0 bottom-0 w-5 bg-gradient-to-l from-white to-transparent z-10 pointer-events-none" />

        {/* Track */}
        <div
          className="flex gap-3 pl-4 pr-4"
          style={{
            animation: `bibelo-mobile-scroll ${duration}s linear infinite`,
            animationPlayState: paused ? "paused" : "running",
            width: "max-content",
          }}
        >
          {doubled.map((product, idx) => (
            <MiniCard key={`${product.id}-${idx}`} product={product} />
          ))}
        </div>
      </div>

      {/* Keyframe — compatível com Next.js App Router */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @keyframes bibelo-mobile-scroll {
              0%   { transform: translateX(0); }
              100% { transform: translateX(-50%); }
            }
          `,
        }}
      />
    </section>
  )
}
