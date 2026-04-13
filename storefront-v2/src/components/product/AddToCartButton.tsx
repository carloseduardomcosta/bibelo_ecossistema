"use client"

import { useState } from "react"
import { useCartStore } from "@/store/cart"
import { trackAddToCart } from "@/lib/meta-pixel"

interface AddToCartButtonProps {
  variantId: string
  productName?: string
  price?: number
}

export default function AddToCartButton({ variantId, productName, price }: AddToCartButtonProps) {
  const [quantity, setQuantity] = useState(1)
  const [isAdding, setIsAdding] = useState(false)
  const [added, setAdded] = useState(false)
  const { addItem } = useCartStore()

  const handleAdd = async () => {
    if (isAdding) return
    setIsAdding(true)
    await addItem(variantId, quantity)
    if (productName && price) {
      trackAddToCart({ contentId: variantId, contentName: productName, value: price * quantity })
    }
    setIsAdding(false)
    setAdded(true)
    setTimeout(() => setAdded(false), 2000)
  }

  return (
    <div className="space-y-3">
      {/* Seletor de quantidade */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-600 font-medium">Quantidade:</span>
        <div className="flex items-center border border-gray-200 rounded-full overflow-hidden">
          <button
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            className="w-9 h-9 flex items-center justify-center hover:bg-gray-50 transition-colors text-gray-600"
            aria-label="Diminuir quantidade"
          >
            −
          </button>
          <span className="w-10 text-center text-sm font-semibold">{quantity}</span>
          <button
            onClick={() => setQuantity((q) => q + 1)}
            className="w-9 h-9 flex items-center justify-center hover:bg-gray-50 transition-colors text-gray-600"
            aria-label="Aumentar quantidade"
          >
            +
          </button>
        </div>
      </div>

      {/* Botão principal */}
      <button
        onClick={handleAdd}
        disabled={isAdding}
        className={`w-full py-4 rounded-full font-bold text-base transition-all duration-300 ${
          added
            ? "bg-green-500 text-white"
            : isAdding
            ? "bg-bibelo-pink/70 text-white cursor-wait"
            : "bg-bibelo-pink text-white hover:bg-bibelo-pink-dark active:scale-[0.98]"
        }`}
      >
        {added ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
            Adicionado ao carrinho!
          </span>
        ) : isAdding ? (
          "Adicionando..."
        ) : (
          "Adicionar ao carrinho"
        )}
      </button>
    </div>
  )
}
