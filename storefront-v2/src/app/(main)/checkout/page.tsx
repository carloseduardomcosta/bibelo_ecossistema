"use client"

import { useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { useCartStore } from "@/store/cart"
import { formatPrice } from "@/lib/utils"

type Step = "endereco" | "entrega" | "pagamento"

export default function CheckoutPage() {
  const { items, total, subtotal, discount_total } = useCartStore()
  const [step, setStep] = useState<Step>("endereco")

  if (items.length === 0) {
    return (
      <div className="content-container py-16 text-center">
        <h1 className="text-2xl font-bold text-bibelo-dark mb-4">Seu carrinho está vazio</h1>
        <Link href="/produtos" className="btn-primary">Ver produtos</Link>
      </div>
    )
  }

  return (
    <div className="content-container py-8">
      <h1 className="text-2xl font-bold text-bibelo-dark mb-6">Finalizar Compra</h1>

      {/* Steps */}
      <div className="flex items-center gap-2 mb-8 overflow-x-auto scrollbar-hide">
        {(["endereco", "entrega", "pagamento"] as Step[]).map((s, idx) => {
          const labels = { endereco: "Endereço", entrega: "Entrega", pagamento: "Pagamento" }
          const steps = ["endereco", "entrega", "pagamento"]
          const currentIdx = steps.indexOf(step)
          const isActive = s === step
          const isDone = steps.indexOf(s) < currentIdx

          return (
            <div key={s} className="flex items-center gap-2 shrink-0">
              <div className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                isActive ? "bg-bibelo-pink text-white" :
                isDone ? "bg-bibelo-pink/20 text-bibelo-pink" :
                "bg-gray-100 text-gray-500"
              }`}>
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
                  isActive ? "bg-white text-bibelo-pink" :
                  isDone ? "bg-bibelo-pink text-white" :
                  "bg-gray-300 text-white"
                }`}>
                  {isDone ? "✓" : idx + 1}
                </span>
                {labels[s]}
              </div>
              {idx < 2 && <div className="w-6 h-px bg-gray-200" />}
            </div>
          )
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Formulário */}
        <div className="lg:col-span-2">
          {step === "endereco" && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-4">
              <h2 className="font-semibold text-lg text-bibelo-dark">Endereço de entrega</h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
                  <input type="text" className="input-base" placeholder="Seu nome" />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Sobrenome</label>
                  <input type="text" className="input-base" placeholder="Seu sobrenome" />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">E-mail</label>
                  <input type="email" className="input-base" placeholder="seu@email.com" />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">CEP</label>
                  <input type="text" className="input-base" placeholder="00000-000" maxLength={9} />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Endereço</label>
                  <input type="text" className="input-base" placeholder="Rua, número" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Complemento</label>
                  <input type="text" className="input-base" placeholder="Apto, bloco..." />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Bairro</label>
                  <input type="text" className="input-base" placeholder="Bairro" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Cidade</label>
                  <input type="text" className="input-base" placeholder="Cidade" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
                  <select className="input-base">
                    <option value="">Selecione</option>
                    {["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"].map(uf => (
                      <option key={uf} value={uf}>{uf}</option>
                    ))}
                  </select>
                </div>
              </div>
              <button onClick={() => setStep("entrega")} className="btn-primary w-full py-3 mt-2">
                Continuar para entrega →
              </button>
            </div>
          )}

          {step === "entrega" && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-4">
              <h2 className="font-semibold text-lg text-bibelo-dark">Método de entrega</h2>
              <div className="space-y-3">
                {[
                  { id: "pac", label: "PAC — Correios", price: 1890, days: "5-8 dias úteis" },
                  { id: "sedex", label: "SEDEX — Correios", price: 3290, days: "1-3 dias úteis" },
                ].map((option) => (
                  <label key={option.id} className="flex items-center gap-3 p-4 border border-gray-200 rounded-xl cursor-pointer hover:border-bibelo-pink transition-colors">
                    <input type="radio" name="shipping" value={option.id} className="accent-bibelo-pink" />
                    <div className="flex-1">
                      <p className="font-medium text-gray-800">{option.label}</p>
                      <p className="text-xs text-gray-500">{option.days}</p>
                    </div>
                    <p className="font-semibold text-bibelo-pink">{formatPrice(option.price)}</p>
                  </label>
                ))}
              </div>
              <div className="flex gap-3">
                <button onClick={() => setStep("endereco")} className="btn-secondary flex-1 py-3">
                  ← Voltar
                </button>
                <button onClick={() => setStep("pagamento")} className="btn-primary flex-1 py-3">
                  Continuar para pagamento →
                </button>
              </div>
            </div>
          )}

          {step === "pagamento" && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-4">
              <h2 className="font-semibold text-lg text-bibelo-dark">Forma de pagamento</h2>
              <div className="space-y-3">
                {[
                  { id: "pix", label: "Pix", desc: "5% de desconto à vista", icon: "⚡" },
                  { id: "cartao", label: "Cartão de crédito", desc: "Até 12x sem juros", icon: "💳" },
                  { id: "boleto", label: "Boleto bancário", desc: "Vencimento em 3 dias úteis", icon: "📄" },
                ].map((option) => (
                  <label key={option.id} className="flex items-center gap-3 p-4 border border-gray-200 rounded-xl cursor-pointer hover:border-bibelo-pink transition-colors">
                    <input type="radio" name="payment" value={option.id} className="accent-bibelo-pink" />
                    <span className="text-xl">{option.icon}</span>
                    <div>
                      <p className="font-medium text-gray-800">{option.label}</p>
                      <p className="text-xs text-gray-500">{option.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
              <div className="flex gap-3">
                <button onClick={() => setStep("entrega")} className="btn-secondary flex-1 py-3">
                  ← Voltar
                </button>
                <button className="btn-primary flex-1 py-3">
                  Confirmar pedido ✓
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Resumo do pedido */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 h-fit space-y-3">
          <h3 className="font-semibold text-gray-800">Resumo do pedido</h3>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {items.map((item) => (
              <div key={item.id} className="flex items-center gap-2 text-sm">
                <div className="w-8 h-8 bg-gray-50 rounded shrink-0 overflow-hidden border border-gray-100">
                  {item.thumbnail && <Image src={item.thumbnail} alt={item.title} width={32} height={32} className="w-full h-full object-cover" />}
                </div>
                <span className="flex-1 line-clamp-1 text-gray-700">{item.title}</span>
                <span className="shrink-0 font-medium">{formatPrice(item.total)}</span>
              </div>
            ))}
          </div>
          <div className="divider-pink pt-2 space-y-1.5">
            <div className="flex justify-between text-sm text-gray-600">
              <span>Subtotal</span><span>{formatPrice(subtotal)}</span>
            </div>
            {discount_total > 0 && (
              <div className="flex justify-between text-sm text-green-600">
                <span>Desconto</span><span>−{formatPrice(discount_total)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-bibelo-dark">
              <span>Total</span><span>{formatPrice(total)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
