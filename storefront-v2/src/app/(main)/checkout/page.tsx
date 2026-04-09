"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { useCartStore } from "@/store/cart"
import { useAuthStore } from "@/store/auth"
import {
  updateCartAddress,
  getShippingOptions,
  addShippingMethod,
  initiatePaymentSession,
  completeCart,
} from "@/lib/medusa/cart"
import { formatPrice } from "@/lib/utils"

type Step = "endereco" | "entrega" | "pagamento"

interface ShippingOption {
  id: string
  name: string
  amount: number
  calculated_price?: { calculated_amount: number }
  price_type?: string
  data?: Record<string, unknown>
}

export default function CheckoutPage() {
  const router = useRouter()
  const { items, total, subtotal, discount_total, cartId, refreshCart } = useCartStore()
  const { customer, token } = useAuthStore()
  const [step, setStep] = useState<Step>("endereco")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  // Shipping options
  const [shippingOptions, setShippingOptions] = useState<ShippingOption[]>([])
  const [selectedShipping, setSelectedShipping] = useState("")
  const [shippingCost, setShippingCost] = useState(0)

  // Payment
  const [selectedPayment, setSelectedPayment] = useState("mercadopago")

  // Address form
  const [address, setAddress] = useState({
    first_name: customer?.first_name || "",
    last_name: customer?.last_name || "",
    email: customer?.email || "",
    phone: "",
    address_1: "",
    address_2: "",
    city: "",
    province: "",
    postal_code: "",
    neighborhood: "",
  })

  // Pre-fill from customer data
  useEffect(() => {
    if (customer) {
      setAddress((prev) => ({
        ...prev,
        first_name: prev.first_name || customer.first_name || "",
        last_name: prev.last_name || customer.last_name || "",
        email: prev.email || customer.email || "",
      }))
    }
  }, [customer])

  if (items.length === 0) {
    return (
      <div className="content-container py-16 text-center">
        <h1 className="text-2xl font-bold text-bibelo-dark mb-4">Seu carrinho está vazio</h1>
        <Link href="/produtos" className="btn-primary">Ver produtos</Link>
      </div>
    )
  }

  // ── Step 1: Salvar endereço e buscar frete ──────────────────
  const handleAddressSubmit = async () => {
    if (!cartId) return
    if (!address.first_name || !address.email || !address.postal_code || !address.address_1 || !address.city || !address.province) {
      setError("Preencha todos os campos obrigatórios")
      return
    }

    setLoading(true)
    setError("")

    try {
      // Atualizar endereço no cart
      const updatedCart = await updateCartAddress(cartId, {
        email: address.email,
        shipping_address: {
          first_name: address.first_name,
          last_name: address.last_name,
          address_1: address.address_1,
          address_2: address.address_2 || undefined,
          city: address.city,
          province: address.province,
          postal_code: address.postal_code.replace(/\D/g, ""),
          country_code: "br",
          phone: address.phone || undefined,
        },
      })

      if (!updatedCart) {
        setError("Erro ao salvar endereço. Tente novamente.")
        setLoading(false)
        return
      }

      // Buscar opções de frete
      const options = await getShippingOptions(cartId)
      setShippingOptions(options)

      setStep("entrega")
    } catch {
      setError("Erro ao processar. Tente novamente.")
    } finally {
      setLoading(false)
    }
  }

  // ── Step 2: Selecionar frete ───────────────────────────────
  const handleShippingSubmit = async () => {
    if (!cartId || !selectedShipping) {
      setError("Selecione um método de entrega")
      return
    }

    setLoading(true)
    setError("")

    try {
      const cart = await addShippingMethod(cartId, selectedShipping)
      if (!cart) {
        setError("Erro ao definir frete. Tente novamente.")
        setLoading(false)
        return
      }

      await refreshCart()
      setStep("pagamento")
    } catch {
      setError("Erro ao processar frete.")
    } finally {
      setLoading(false)
    }
  }

  // ── Step 3: Pagamento e finalização ────────────────────────
  const handlePaymentSubmit = async () => {
    if (!cartId) return

    setLoading(true)
    setError("")

    try {
      // Iniciar sessão de pagamento
      const session = await initiatePaymentSession(cartId, "pp_mercadopago_mercadopago")
      if (!session) {
        setError("Erro ao iniciar pagamento. Tente novamente.")
        setLoading(false)
        return
      }

      // Completar o carrinho (criar pedido)
      const result = await completeCart(cartId)

      if (result?.type === "order" || result?.order) {
        const order = result.order || result
        // Limpar carrinho e redirecionar para confirmação
        localStorage.removeItem("bibelo-cart-v2")
        router.push(`/checkout/confirmacao?order_id=${order.id}&display_id=${order.display_id || ""}`)
      } else {
        // Se retornar payment session com dados do Pix
        const pixData = session?.data || result?.data
        if (pixData?.qr_code || pixData?.point_of_interaction) {
          router.push(`/checkout/pix?cart_id=${cartId}`)
        } else {
          setError("Pedido criado, mas pagamento pendente. Entre em contato pelo WhatsApp.")
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao finalizar pedido"
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  // ── Helpers ────────────────────────────────────────────────
  const formatCep = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 8)
    if (digits.length > 5) return `${digits.slice(0, 5)}-${digits.slice(5)}`
    return digits
  }

  const stepLabels = { endereco: "Endereço", entrega: "Entrega", pagamento: "Pagamento" }
  const stepsArr: Step[] = ["endereco", "entrega", "pagamento"]
  const currentIdx = stepsArr.indexOf(step)

  return (
    <div className="content-container py-8">
      <h1 className="text-2xl font-bold text-bibelo-dark mb-6">Finalizar Compra</h1>

      {/* Steps indicator */}
      <div className="flex items-center gap-2 mb-8 overflow-x-auto scrollbar-hide">
        {stepsArr.map((s, idx) => {
          const isActive = s === step
          const isDone = idx < currentIdx
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
                {stepLabels[s]}
              </div>
              {idx < 2 && <div className="w-6 h-px bg-gray-200" />}
            </div>
          )
        })}
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 text-sm p-3 rounded-xl mb-4">{error}</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Formulário */}
        <div className="lg:col-span-2">
          {/* ── STEP 1: Endereço ── */}
          {step === "endereco" && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-4">
              <h2 className="font-semibold text-lg text-bibelo-dark">Endereço de entrega</h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
                  <input type="text" className="input-base" placeholder="Seu nome"
                    value={address.first_name} onChange={(e) => setAddress({ ...address, first_name: e.target.value })} required />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Sobrenome *</label>
                  <input type="text" className="input-base" placeholder="Seu sobrenome"
                    value={address.last_name} onChange={(e) => setAddress({ ...address, last_name: e.target.value })} required />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">E-mail *</label>
                  <input type="email" className="input-base" placeholder="seu@email.com"
                    value={address.email} onChange={(e) => setAddress({ ...address, email: e.target.value })} required />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Telefone</label>
                  <input type="tel" className="input-base" placeholder="(47) 99999-9999"
                    value={address.phone} onChange={(e) => setAddress({ ...address, phone: e.target.value })} />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">CEP *</label>
                  <input type="text" className="input-base" placeholder="00000-000" maxLength={9}
                    value={address.postal_code} onChange={(e) => setAddress({ ...address, postal_code: formatCep(e.target.value) })} required />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Endereço *</label>
                  <input type="text" className="input-base" placeholder="Rua, número"
                    value={address.address_1} onChange={(e) => setAddress({ ...address, address_1: e.target.value })} required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Complemento</label>
                  <input type="text" className="input-base" placeholder="Apto, bloco..."
                    value={address.address_2} onChange={(e) => setAddress({ ...address, address_2: e.target.value })} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Cidade *</label>
                  <input type="text" className="input-base" placeholder="Cidade"
                    value={address.city} onChange={(e) => setAddress({ ...address, city: e.target.value })} required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Estado *</label>
                  <select className="input-base" value={address.province} onChange={(e) => setAddress({ ...address, province: e.target.value })} required>
                    <option value="">Selecione</option>
                    {["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"].map(uf => (
                      <option key={uf} value={uf}>{uf}</option>
                    ))}
                  </select>
                </div>
              </div>
              <button onClick={handleAddressSubmit} disabled={loading} className="btn-primary w-full py-3 mt-2 disabled:opacity-50">
                {loading ? "Calculando frete..." : "Continuar para entrega →"}
              </button>
            </div>
          )}

          {/* ── STEP 2: Entrega ── */}
          {step === "entrega" && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-4">
              <h2 className="font-semibold text-lg text-bibelo-dark">Método de entrega</h2>
              <p className="text-sm text-gray-500">
                Entrega para {address.city}/{address.province} — CEP {address.postal_code}
              </p>

              {shippingOptions.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-500 mb-2">Nenhuma opção de frete disponível para este CEP</p>
                  <button onClick={() => setStep("endereco")} className="text-bibelo-pink font-medium text-sm hover:underline">
                    Alterar endereço
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {shippingOptions.map((option) => {
                    const price = option.calculated_price?.calculated_amount || option.amount || 0
                    return (
                      <label key={option.id}
                        className={`flex items-center gap-3 p-4 border rounded-xl cursor-pointer transition-colors ${
                          selectedShipping === option.id ? "border-bibelo-pink bg-bibelo-pink/5" : "border-gray-200 hover:border-bibelo-pink/50"
                        }`}
                        onClick={() => { setSelectedShipping(option.id); setShippingCost(price) }}
                      >
                        <input type="radio" name="shipping" value={option.id}
                          checked={selectedShipping === option.id} onChange={() => {}} className="accent-bibelo-pink" />
                        <div className="flex-1">
                          <p className="font-medium text-gray-800">{option.name}</p>
                        </div>
                        <p className="font-semibold text-bibelo-pink">
                          {price > 0 ? formatPrice(price) : "Grátis"}
                        </p>
                      </label>
                    )
                  })}
                </div>
              )}

              <div className="flex gap-3">
                <button onClick={() => setStep("endereco")} className="btn-secondary flex-1 py-3">
                  ← Voltar
                </button>
                <button onClick={handleShippingSubmit} disabled={loading || !selectedShipping} className="btn-primary flex-1 py-3 disabled:opacity-50">
                  {loading ? "Processando..." : "Continuar para pagamento →"}
                </button>
              </div>
            </div>
          )}

          {/* ── STEP 3: Pagamento ── */}
          {step === "pagamento" && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-4">
              <h2 className="font-semibold text-lg text-bibelo-dark">Forma de pagamento</h2>
              <div className="space-y-3">
                <label className={`flex items-center gap-3 p-4 border rounded-xl cursor-pointer transition-colors ${
                  selectedPayment === "mercadopago" ? "border-bibelo-pink bg-bibelo-pink/5" : "border-gray-200"
                }`}>
                  <input type="radio" name="payment" value="mercadopago"
                    checked={selectedPayment === "mercadopago"} onChange={(e) => setSelectedPayment(e.target.value)} className="accent-bibelo-pink" />
                  <span className="text-xl">⚡</span>
                  <div>
                    <p className="font-medium text-gray-800">Pix</p>
                    <p className="text-xs text-gray-500">Aprovação instantânea — 5% de desconto</p>
                  </div>
                </label>
              </div>

              <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm">
                <p className="font-semibold text-green-800">Desconto Pix: 5% OFF</p>
                <p className="text-green-600 text-xs mt-1">
                  O QR Code Pix será gerado após a confirmação. Pagamento aprovado em segundos.
                </p>
              </div>

              <div className="flex gap-3">
                <button onClick={() => setStep("entrega")} className="btn-secondary flex-1 py-3">
                  ← Voltar
                </button>
                <button onClick={handlePaymentSubmit} disabled={loading} className="btn-primary flex-1 py-3 disabled:opacity-50">
                  {loading ? "Finalizando..." : "Confirmar pedido ✓"}
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
            {shippingCost > 0 && (
              <div className="flex justify-between text-sm text-gray-600">
                <span>Frete</span><span>{formatPrice(shippingCost)}</span>
              </div>
            )}
            {discount_total > 0 && (
              <div className="flex justify-between text-sm text-green-600">
                <span>Desconto</span><span>-{formatPrice(discount_total)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-bibelo-dark pt-1 border-t border-gray-100">
              <span>Total</span>
              <span>{formatPrice(total + shippingCost)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
