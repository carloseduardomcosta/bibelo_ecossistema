"use client"

import { useState, useMemo } from "react"
import { useCartStore } from "@/store/cart"
import { formatPrice, getDiscountPercent } from "@/lib/utils"

interface VariantSelectorProps {
  product: Record<string, unknown>
}

export default function VariantSelector({ product }: VariantSelectorProps) {
  const variants = (product.variants || []) as Array<{
    id: string
    title: string | null
    options?: Array<{ id: string; option_id: string; value: string }>
    calculated_price?: { calculated_amount: number; original_amount: number }
    inventory_quantity?: number | null
  }>
  const options = (product.options || []) as Array<{
    id: string
    title: string | null
    values?: Array<{ id: string; value: string }>
  }>

  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>(() => {
    // Pre-selecionar primeira variante
    const first = variants[0]
    if (!first?.options?.length) return {}
    return first.options.reduce((acc, opt) => {
      acc[opt.option_id] = opt.value
      return acc
    }, {} as Record<string, string>)
  })

  const [quantity, setQuantity] = useState(1)
  const [isAdding, setIsAdding] = useState(false)
  const [added, setAdded] = useState(false)
  const { addItem } = useCartStore()

  const selectedVariant = useMemo(() => {
    return variants.find((v) => {
      if (!v.options?.length) return false
      return v.options.every((opt) => selectedOptions[opt.option_id] === opt.value)
    })
  }, [variants, selectedOptions])

  const price = selectedVariant?.calculated_price
  const calculatedAmount = price?.calculated_amount || 0
  const originalAmount = price?.original_amount || 0
  const discountPercent = getDiscountPercent(originalAmount, calculatedAmount)
  const isOnSale = discountPercent > 0

  const isOutOfStock =
    selectedVariant?.inventory_quantity !== null &&
    selectedVariant?.inventory_quantity !== undefined &&
    (selectedVariant.inventory_quantity as number) <= 0

  const handleOptionChange = (optionId: string, value: string) => {
    setSelectedOptions((prev) => ({ ...prev, [optionId]: value }))
  }

  const handleAdd = async () => {
    if (!selectedVariant || isAdding || isOutOfStock) return
    setIsAdding(true)
    await addItem(selectedVariant.id, quantity)
    setIsAdding(false)
    setAdded(true)
    setTimeout(() => setAdded(false), 2000)
  }

  return (
    <div className="space-y-5">
      {/* Seletor de opções */}
      {options.map((option) => (
        <div key={option.id} className="space-y-2.5">
          <span className="text-sm font-semibold text-bibelo-dark">
            {option.title}:{" "}
            <span className="font-normal text-gray-500">
              {selectedOptions[option.id] || "Selecione"}
            </span>
          </span>
          <div className="flex flex-wrap gap-2">
            {(option.values || []).map((val) => {
              const isSelected = selectedOptions[option.id] === val.value
              return (
                <button
                  key={val.id}
                  onClick={() => handleOptionChange(option.id, val.value)}
                  className={`px-4 py-2.5 text-sm rounded-full border-2 transition-all duration-200 min-w-[3rem] ${
                    isSelected
                      ? "border-bibelo-pink bg-bibelo-pink/10 text-bibelo-pink font-semibold shadow-sm"
                      : "border-gray-200 bg-white text-gray-600 hover:border-bibelo-pink/50 hover:text-gray-800"
                  }`}
                >
                  {val.value}
                </button>
              )
            })}
          </div>
        </div>
      ))}

      {/* Preço da variante selecionada */}
      {selectedVariant && calculatedAmount > 0 && (
        <div className="pt-2 border-t border-gray-100">
          {isOnSale && (
            <p className="text-gray-400 line-through text-sm">{formatPrice(originalAmount)}</p>
          )}
          <p className={`text-2xl font-black ${isOnSale ? "text-bibelo-pink" : "text-bibelo-dark"}`}>
            {formatPrice(calculatedAmount)}
          </p>
          <p className="text-sm text-green-600 font-medium mt-1">
            <span className="inline-block w-2 h-2 bg-green-500 rounded-full mr-1.5" />
            Pix com 5% de desconto: <strong>{formatPrice(calculatedAmount * 0.95)}</strong>
          </p>
        </div>
      )}

      {/* Quantidade + Botão */}
      {!isOutOfStock && selectedVariant ? (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600 font-medium">Quantidade:</span>
            <div className="flex items-center border border-gray-200 rounded-full overflow-hidden">
              <button
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                className="w-9 h-9 flex items-center justify-center hover:bg-gray-50 transition-colors text-gray-600"
              >
                −
              </button>
              <span className="w-10 text-center text-sm font-semibold">{quantity}</span>
              <button
                onClick={() => setQuantity((q) => q + 1)}
                className="w-9 h-9 flex items-center justify-center hover:bg-gray-50 transition-colors text-gray-600"
              >
                +
              </button>
            </div>
          </div>

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
      ) : (
        <button disabled className="btn-primary w-full opacity-50 cursor-not-allowed py-4 text-base">
          {!selectedVariant ? "Selecione uma opção" : "Produto Esgotado"}
        </button>
      )}
    </div>
  )
}
