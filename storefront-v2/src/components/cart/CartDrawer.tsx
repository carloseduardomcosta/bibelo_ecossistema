"use client"

import { useEffect } from "react"
import Link from "next/link"
import Image from "next/image"
import { useCartStore } from "@/store/cart"
import { formatPrice } from "@/lib/utils"

export default function CartDrawer() {
  const { isOpen, closeCart, items, total, itemCount, updateItem, removeItem, isLoading } = useCartStore()

  // Fechar com Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeCart()
    }
    if (isOpen) document.addEventListener("keydown", handleKey)
    return () => document.removeEventListener("keydown", handleKey)
  }, [isOpen, closeCart])

  // Bloquear scroll do body quando aberto
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden"
    } else {
      document.body.style.overflow = ""
    }
    return () => { document.body.style.overflow = "" }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/50 z-[200] animate-fade-in"
        onClick={closeCart}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-full max-w-md bg-white z-[201] flex flex-col shadow-2xl animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-bold text-lg text-bibelo-dark">
            Meu Carrinho
            {itemCount > 0 && (
              <span className="ml-2 text-sm font-normal text-gray-500">({itemCount} {itemCount === 1 ? "item" : "itens"})</span>
            )}
          </h2>
          <button
            onClick={closeCart}
            className="p-2 rounded-full hover:bg-gray-100 transition-colors"
            aria-label="Fechar carrinho"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Itens */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
              <div className="w-20 h-20 bg-bibelo-pink/10 rounded-full flex items-center justify-center">
                <svg className="w-10 h-10 text-bibelo-pink" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007z" />
                </svg>
              </div>
              <div>
                <p className="font-semibold text-gray-700">Seu carrinho está vazio</p>
                <p className="text-sm text-gray-500 mt-1">Adicione produtos para continuar</p>
              </div>
              <button onClick={closeCart} className="btn-primary">
                Continuar comprando
              </button>
            </div>
          ) : (
            <ul className="space-y-4">
              {items.map((item) => (
                <li key={item.id} className="flex gap-3">
                  {/* Imagem */}
                  <div className="w-16 h-16 bg-gray-50 rounded-lg overflow-hidden shrink-0 border border-gray-100">
                    {item.thumbnail ? (
                      <Image
                        src={item.thumbnail}
                        alt={item.title}
                        width={64}
                        height={64}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <svg className="w-6 h-6 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                        </svg>
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 leading-tight line-clamp-2">{item.title}</p>
                    <p className="text-bibelo-pink font-bold text-sm mt-1">{formatPrice(item.unit_price)}</p>

                    {/* Quantidade */}
                    <div className="flex items-center gap-2 mt-2">
                      <button
                        onClick={() => item.quantity > 1 ? updateItem(item.id, item.quantity - 1) : removeItem(item.id)}
                        className="w-6 h-6 rounded-full border border-gray-300 flex items-center justify-center hover:border-bibelo-pink hover:text-bibelo-pink transition-colors text-sm"
                        disabled={isLoading}
                      >
                        −
                      </button>
                      <span className="text-sm font-medium w-6 text-center">{item.quantity}</span>
                      <button
                        onClick={() => updateItem(item.id, item.quantity + 1)}
                        className="w-6 h-6 rounded-full border border-gray-300 flex items-center justify-center hover:border-bibelo-pink hover:text-bibelo-pink transition-colors text-sm"
                        disabled={isLoading}
                      >
                        +
                      </button>
                    </div>
                  </div>

                  {/* Total item + remover */}
                  <div className="flex flex-col items-end justify-between shrink-0">
                    <button
                      onClick={() => removeItem(item.id)}
                      className="text-gray-400 hover:text-red-500 transition-colors p-1"
                      aria-label="Remover item"
                      disabled={isLoading}
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                    <p className="text-sm font-semibold text-gray-700">{formatPrice(item.total)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer do carrinho */}
        {items.length > 0 && (
          <div className="border-t border-gray-100 px-5 py-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Subtotal</span>
              <span className="font-bold text-lg text-bibelo-dark">{formatPrice(total)}</span>
            </div>
            <p className="text-xs text-gray-400">Frete calculado no checkout</p>
            <Link
              href="/checkout"
              onClick={closeCart}
              className="btn-primary w-full text-center block py-3 text-base"
            >
              Finalizar compra
            </Link>
            <button
              onClick={closeCart}
              className="w-full text-center text-sm text-gray-500 hover:text-bibelo-pink transition-colors py-1"
            >
              Continuar comprando
            </button>
          </div>
        )}
      </div>
    </>
  )
}
