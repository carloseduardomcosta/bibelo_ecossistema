"use client"

import { useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { useCartStore } from "@/store/cart"
import { formatPrice } from "@/lib/utils"

export default function CarrinhoPage() {
  const { items, total, subtotal, discount_total, updateItem, removeItem, applyPromoCode, isLoading } = useCartStore()
  const [couponCode, setCouponCode] = useState("")
  const [couponLoading, setCouponLoading] = useState(false)
  const [couponMessage, setCouponMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)

  const handleApplyCoupon = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!couponCode.trim()) return
    setCouponLoading(true)
    const result = await applyPromoCode(couponCode.trim().toUpperCase())
    setCouponMessage(
      result.success
        ? { type: "success", text: "Cupom aplicado com sucesso!" }
        : { type: "error", text: result.error || "Cupom inválido" }
    )
    setCouponLoading(false)
  }

  if (items.length === 0) {
    return (
      <div className="content-container py-16 text-center">
        <div className="w-20 h-20 bg-bibelo-pink/10 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-10 h-10 text-bibelo-pink" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007z" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-bibelo-dark mb-2">Seu carrinho está vazio</h1>
        <p className="text-gray-500 mb-6">Explore nossos produtos e adicione ao carrinho</p>
        <Link href="/produtos" className="btn-primary">Ver produtos</Link>
      </div>
    )
  }

  return (
    <div className="content-container py-8">
      <h1 className="text-2xl font-bold text-bibelo-dark mb-6">Meu Carrinho</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Lista de itens */}
        <div className="lg:col-span-2 space-y-4">
          {items.map((item) => (
            <div key={item.id} className="flex gap-4 p-4 bg-white rounded-xl border border-gray-100 shadow-sm">
              <div className="w-20 h-20 bg-gray-50 rounded-lg overflow-hidden shrink-0 border border-gray-100">
                {item.thumbnail ? (
                  <Image src={item.thumbnail} alt={item.title} width={80} height={80} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <svg className="w-8 h-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5z" />
                    </svg>
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-800 leading-tight">{item.title}</p>
                <p className="text-bibelo-pink font-bold mt-1">{formatPrice(item.unit_price)}</p>
                <div className="flex items-center gap-2 mt-2">
                  <button
                    onClick={() => item.quantity > 1 ? updateItem(item.id, item.quantity - 1) : removeItem(item.id)}
                    className="w-7 h-7 rounded-full border border-gray-300 flex items-center justify-center hover:border-bibelo-pink hover:text-bibelo-pink transition-colors"
                    disabled={isLoading}
                  >−</button>
                  <span className="text-sm font-medium w-6 text-center">{item.quantity}</span>
                  <button
                    onClick={() => updateItem(item.id, item.quantity + 1)}
                    className="w-7 h-7 rounded-full border border-gray-300 flex items-center justify-center hover:border-bibelo-pink hover:text-bibelo-pink transition-colors"
                    disabled={isLoading}
                  >+</button>
                </div>
              </div>
              <div className="flex flex-col items-end justify-between shrink-0">
                <button
                  onClick={() => removeItem(item.id)}
                  className="text-gray-400 hover:text-red-500 transition-colors"
                  aria-label="Remover"
                  disabled={isLoading}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
                <p className="font-bold text-gray-800">{formatPrice(item.total)}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Resumo */}
        <div className="space-y-4">
          {/* Cupom */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <h3 className="font-semibold text-gray-800 mb-3">Cupom de desconto</h3>
            <form onSubmit={handleApplyCoupon} className="flex gap-2">
              <input
                type="text"
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                placeholder="BIBELO7"
                className="input-base flex-1"
              />
              <button
                type="submit"
                disabled={couponLoading}
                className="btn-primary px-4 py-2 text-sm"
              >
                {couponLoading ? "..." : "Aplicar"}
              </button>
            </form>
            {couponMessage && (
              <p className={`text-xs mt-2 ${couponMessage.type === "success" ? "text-green-600" : "text-red-500"}`}>
                {couponMessage.text}
              </p>
            )}
          </div>

          {/* Totais */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-3">
            <h3 className="font-semibold text-gray-800">Resumo do pedido</h3>
            <div className="flex justify-between text-sm text-gray-600">
              <span>Subtotal</span>
              <span>{formatPrice(subtotal)}</span>
            </div>
            {discount_total > 0 && (
              <div className="flex justify-between text-sm text-green-600">
                <span>Desconto</span>
                <span>−{formatPrice(discount_total)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm text-gray-500">
              <span>Frete</span>
              <span>Calculado no checkout</span>
            </div>
            <div className="divider-pink pt-2">
              <div className="flex justify-between font-bold text-lg text-bibelo-dark">
                <span>Total</span>
                <span>{formatPrice(total)}</span>
              </div>
            </div>
            <Link href="/checkout" className="btn-primary w-full text-center block py-3 text-base mt-2">
              Finalizar compra
            </Link>
            <Link href="/produtos" className="block text-center text-sm text-gray-500 hover:text-bibelo-pink transition-colors">
              Continuar comprando
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
