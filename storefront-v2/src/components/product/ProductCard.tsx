"use client"

import Link from "next/link"
import Image from "next/image"
import { useState } from "react"
import { useCartStore } from "@/store/cart"
import { formatPrice, formatInstallments, getDiscountPercent } from "@/lib/utils"

interface ProductCardProps {
  product: {
    id: string
    title: string
    handle: string
    thumbnail?: string | null
    variants?: Array<{
      id: string
      calculated_price?: {
        calculated_amount: number
        original_amount: number
      }
      inventory_quantity?: number | null
    }>
  }
}

export default function ProductCard({ product }: ProductCardProps) {
  const [isHovered, setIsHovered] = useState(false)
  const [isAdding, setIsAdding] = useState(false)
  const { addItem } = useCartStore()

  const variant = product.variants?.[0]
  const price = variant?.calculated_price
  const calculatedAmount = price?.calculated_amount || 0
  const originalAmount = price?.original_amount || 0
  const discountPercent = getDiscountPercent(originalAmount, calculatedAmount)
  const isOnSale = discountPercent > 0
  const isOutOfStock = variant?.inventory_quantity !== null &&
    variant?.inventory_quantity !== undefined &&
    variant.inventory_quantity <= 0

  const handleAddToCart = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!variant || isOutOfStock || isAdding) return
    setIsAdding(true)
    await addItem(variant.id)
    setIsAdding(false)
  }

  return (
    <Link
      href={`/produto/${product.handle}`}
      className="product-card group block relative"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Badges */}
      <div className="absolute top-2 left-2 z-10 flex flex-col gap-1">
        {isOutOfStock && (
          <span className="badge-sold-out">ESGOTADO</span>
        )}
        {isOnSale && !isOutOfStock && (
          <span className="badge-off">{discountPercent}% OFF</span>
        )}
      </div>

      {/* Imagem */}
      <div className="relative aspect-square overflow-hidden bg-gray-50">
        {product.thumbnail ? (
          <Image
            src={product.thumbnail}
            alt={product.title}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className={`object-cover transition-transform duration-500 ${isHovered ? "scale-105" : "scale-100"}`}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-bibelo-pink/5">
            <svg className="w-12 h-12 text-bibelo-pink/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
            </svg>
          </div>
        )}

        {/* Overlay "Ver produto" no hover */}
        {!isOutOfStock && (
          <div className={`absolute inset-x-0 bottom-0 bg-bibelo-pink/90 text-white text-sm font-semibold
                          flex items-center justify-center py-2.5 transition-transform duration-300
                          ${isHovered ? "translate-y-0" : "translate-y-full"}`}>
            Ver produto
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-3">
        <h3 className={`text-sm font-medium leading-tight line-clamp-2 transition-colors duration-200
                        ${isHovered ? "text-bibelo-pink" : "text-gray-800"}`}>
          {product.title}
        </h3>

        {calculatedAmount > 0 ? (
          <div className="mt-2">
            {isOnSale && (
              <p className="text-xs text-gray-400 line-through">{formatPrice(originalAmount)}</p>
            )}
            <p className={`font-bold text-base ${isOnSale ? "text-bibelo-pink" : "text-gray-800"}`}>
              {formatPrice(calculatedAmount)}
            </p>
            {calculatedAmount >= 1000 && (
              <p className="text-xs text-gray-500 mt-0.5">
                {formatInstallments(calculatedAmount)}
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-gray-400 mt-2">Consulte o preço</p>
        )}

        {/* Botão adicionar ao carrinho */}
        {!isOutOfStock && variant && (
          <button
            onClick={handleAddToCart}
            disabled={isAdding}
            className={`mt-3 w-full py-2 rounded-full text-xs font-semibold transition-all duration-200
                        ${isAdding
                          ? "bg-gray-100 text-gray-400 cursor-wait"
                          : "bg-bibelo-pink/10 text-bibelo-pink hover:bg-bibelo-pink hover:text-white"
                        }`}
          >
            {isAdding ? "Adicionando..." : "Adicionar ao carrinho"}
          </button>
        )}

        {isOutOfStock && (
          <p className="mt-3 text-center text-xs text-gray-400 py-2">Produto esgotado</p>
        )}
      </div>
    </Link>
  )
}
