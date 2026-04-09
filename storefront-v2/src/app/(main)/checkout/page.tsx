"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import Image from "next/image"
import Script from "next/script"
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
type PaymentMethod = "pix" | "credit_card" | "boleto"

interface ShippingOption {
  id: string
  name: string
  amount: number
  calculated_price?: { calculated_amount: number }
  price_type?: string
  data?: Record<string, unknown>
}

const MP_PUBLIC_KEY = process.env.NEXT_PUBLIC_MP_PUBLIC_KEY || ""

export default function CheckoutPage() {
  const router = useRouter()
  const { items, total, subtotal, discount_total, cartId, refreshCart } = useCartStore()
  const { customer } = useAuthStore()
  const [step, setStep] = useState<Step>("endereco")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  // Shipping options
  const [shippingOptions, setShippingOptions] = useState<ShippingOption[]>([])
  const [selectedShipping, setSelectedShipping] = useState("")
  const [shippingCost, setShippingCost] = useState(0)

  // Payment
  const [selectedPayment, setSelectedPayment] = useState<PaymentMethod>("pix")
  const [mpReady, setMpReady] = useState(false)

  // Card form
  const [cardNumber, setCardNumber] = useState("")
  const [cardHolder, setCardHolder] = useState("")
  const [cardExpiry, setCardExpiry] = useState("")
  const [cardCvv, setCardCvv] = useState("")
  const [cardCpf, setCardCpf] = useState("")
  const [installments, setInstallments] = useState(1)

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

  // ── Tokenizar cartão via MercadoPago.js ────────────────────
  const tokenizeCard = async (): Promise<string | null> => {
    if (typeof window === "undefined" || !(window as any).MercadoPago) {
      setError("SDK do Mercado Pago não carregou. Recarregue a página.")
      return null
    }

    try {
      const mp = new (window as any).MercadoPago(MP_PUBLIC_KEY)
      const [expMonth, expYear] = cardExpiry.split("/")

      const tokenData = await mp.createCardToken({
        cardNumber: cardNumber.replace(/\s/g, ""),
        cardholderName: cardHolder,
        cardExpirationMonth: expMonth?.trim(),
        cardExpirationYear: expYear?.trim().length === 2 ? `20${expYear.trim()}` : expYear?.trim(),
        securityCode: cardCvv,
        identificationType: "CPF",
        identificationNumber: cardCpf.replace(/\D/g, ""),
      })

      return tokenData.id
    } catch (err) {
      console.error("Erro ao tokenizar cartão:", err)
      setError("Erro ao processar dados do cartão. Verifique os dados e tente novamente.")
      return null
    }
  }

  // ── Step 3: Pagamento e finalização ────────────────────────
  const handlePaymentSubmit = async () => {
    if (!cartId) return

    setLoading(true)
    setError("")

    try {
      // Para cartão de crédito, tokenizar antes
      let paymentContext: Record<string, unknown> = {
        payment_method_type: selectedPayment,
      }

      if (selectedPayment === "credit_card") {
        if (!cardNumber || !cardHolder || !cardExpiry || !cardCvv || !cardCpf) {
          setError("Preencha todos os dados do cartão")
          setLoading(false)
          return
        }
        const token = await tokenizeCard()
        if (!token) {
          setLoading(false)
          return
        }
        paymentContext.card_token = token
        paymentContext.installments = installments
        paymentContext.payer_cpf = cardCpf.replace(/\D/g, "")
      }

      if (selectedPayment === "boleto") {
        paymentContext.payer_cpf = cardCpf.replace(/\D/g, "")
      }

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
        localStorage.removeItem("bibelo-cart-v2")

        // Para Pix, redirecionar para página de QR code se tiver dados
        const pixData = session?.data || result?.data
        if (selectedPayment === "pix" && (pixData?.qr_code || pixData?.qr_code_base64)) {
          router.push(`/checkout/confirmacao?order_id=${order.id}&display_id=${order.display_id || ""}&payment=pix&qr_code=${encodeURIComponent(pixData.qr_code || "")}&qr_code_base64=${encodeURIComponent(pixData.qr_code_base64 || "")}`)
        } else if (selectedPayment === "boleto" && pixData?.boleto_url) {
          router.push(`/checkout/confirmacao?order_id=${order.id}&display_id=${order.display_id || ""}&payment=boleto&boleto_url=${encodeURIComponent(pixData.boleto_url || "")}`)
        } else {
          router.push(`/checkout/confirmacao?order_id=${order.id}&display_id=${order.display_id || ""}&payment=${selectedPayment}`)
        }
      } else {
        setError("Pedido criado, mas pagamento pendente. Entre em contato pelo WhatsApp.")
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

  const formatCardNumber = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 16)
    return digits.replace(/(\d{4})(?=\d)/g, "$1 ")
  }

  const formatExpiry = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 4)
    if (digits.length > 2) return `${digits.slice(0, 2)}/${digits.slice(2)}`
    return digits
  }

  const formatCpf = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 11)
    if (digits.length > 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`
    if (digits.length > 6) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`
    if (digits.length > 3) return `${digits.slice(0, 3)}.${digits.slice(3)}`
    return digits
  }

  const stepLabels = { endereco: "Endereço", entrega: "Entrega", pagamento: "Pagamento" }
  const stepsArr: Step[] = ["endereco", "entrega", "pagamento"]
  const currentIdx = stepsArr.indexOf(step)

  return (
    <div className="content-container py-8">
      {/* Carregar MercadoPago.js SDK */}
      {MP_PUBLIC_KEY && (
        <Script
          src="https://sdk.mercadopago.com/js/v2"
          onLoad={() => setMpReady(true)}
          strategy="lazyOnload"
        />
      )}

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

              {/* Seleção de método */}
              <div className="space-y-3">
                {/* Pix */}
                <label className={`flex items-center gap-3 p-4 border rounded-xl cursor-pointer transition-colors ${
                  selectedPayment === "pix" ? "border-bibelo-pink bg-bibelo-pink/5" : "border-gray-200"
                }`} onClick={() => setSelectedPayment("pix")}>
                  <input type="radio" name="payment" value="pix"
                    checked={selectedPayment === "pix"} onChange={() => setSelectedPayment("pix")} className="accent-bibelo-pink" />
                  <span className="text-xl">⚡</span>
                  <div className="flex-1">
                    <p className="font-medium text-gray-800">Pix</p>
                    <p className="text-xs text-gray-500">Aprovação instantânea</p>
                  </div>
                  <span className="text-xs font-semibold text-green-600 bg-green-50 px-2 py-1 rounded-full">5% OFF</span>
                </label>

                {/* Cartão de Crédito */}
                <label className={`flex items-center gap-3 p-4 border rounded-xl cursor-pointer transition-colors ${
                  selectedPayment === "credit_card" ? "border-bibelo-pink bg-bibelo-pink/5" : "border-gray-200"
                }`} onClick={() => setSelectedPayment("credit_card")}>
                  <input type="radio" name="payment" value="credit_card"
                    checked={selectedPayment === "credit_card"} onChange={() => setSelectedPayment("credit_card")} className="accent-bibelo-pink" />
                  <span className="text-xl">💳</span>
                  <div className="flex-1">
                    <p className="font-medium text-gray-800">Cartão de Crédito</p>
                    <p className="text-xs text-gray-500">Visa, Mastercard, Elo, Amex, Hipercard</p>
                  </div>
                  <span className="text-xs text-gray-400">Até 12x</span>
                </label>

                {/* Boleto */}
                <label className={`flex items-center gap-3 p-4 border rounded-xl cursor-pointer transition-colors ${
                  selectedPayment === "boleto" ? "border-bibelo-pink bg-bibelo-pink/5" : "border-gray-200"
                }`} onClick={() => setSelectedPayment("boleto")}>
                  <input type="radio" name="payment" value="boleto"
                    checked={selectedPayment === "boleto"} onChange={() => setSelectedPayment("boleto")} className="accent-bibelo-pink" />
                  <span className="text-xl">📄</span>
                  <div className="flex-1">
                    <p className="font-medium text-gray-800">Boleto Bancário</p>
                    <p className="text-xs text-gray-500">Aprovação em até 3 dias úteis</p>
                  </div>
                </label>
              </div>

              {/* Info box por método */}
              {selectedPayment === "pix" && (
                <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm">
                  <p className="font-semibold text-green-800">Desconto Pix: 5% OFF</p>
                  <p className="text-green-600 text-xs mt-1">
                    O QR Code Pix será gerado após a confirmação. Pagamento aprovado em segundos.
                  </p>
                </div>
              )}

              {/* Formulário do cartão */}
              {selectedPayment === "credit_card" && (
                <div className="border border-gray-200 rounded-xl p-5 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Número do cartão *</label>
                    <input type="text" className="input-base" placeholder="0000 0000 0000 0000" maxLength={19}
                      value={cardNumber} onChange={(e) => setCardNumber(formatCardNumber(e.target.value))} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nome no cartão *</label>
                    <input type="text" className="input-base" placeholder="Como está no cartão"
                      value={cardHolder} onChange={(e) => setCardHolder(e.target.value.toUpperCase())} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Validade *</label>
                      <input type="text" className="input-base" placeholder="MM/AA" maxLength={5}
                        value={cardExpiry} onChange={(e) => setCardExpiry(formatExpiry(e.target.value))} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">CVV *</label>
                      <input type="text" className="input-base" placeholder="123" maxLength={4}
                        value={cardCvv} onChange={(e) => setCardCvv(e.target.value.replace(/\D/g, "").slice(0, 4))} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">CPF do titular *</label>
                    <input type="text" className="input-base" placeholder="000.000.000-00" maxLength={14}
                      value={cardCpf} onChange={(e) => setCardCpf(formatCpf(e.target.value))} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Parcelas</label>
                    <select className="input-base" value={installments} onChange={(e) => setInstallments(Number(e.target.value))}>
                      <option value={1}>1x de {formatPrice(total + shippingCost)} (sem juros)</option>
                      {[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => (
                        <option key={n} value={n}>
                          {n}x de {formatPrice(Math.ceil((total + shippingCost) / n))} (sem juros)
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                    </svg>
                    Pagamento seguro processado pelo Mercado Pago
                  </div>
                </div>
              )}

              {/* CPF para boleto */}
              {selectedPayment === "boleto" && (
                <div className="border border-gray-200 rounded-xl p-5 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">CPF do pagador *</label>
                    <input type="text" className="input-base" placeholder="000.000.000-00" maxLength={14}
                      value={cardCpf} onChange={(e) => setCardCpf(formatCpf(e.target.value))} />
                  </div>
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm">
                    <p className="text-amber-800 font-medium">O boleto será gerado após a confirmação</p>
                    <p className="text-amber-600 text-xs mt-1">
                      Prazo de pagamento: 3 dias úteis. Aprovação em até 3 dias úteis após pagamento.
                    </p>
                  </div>
                </div>
              )}

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
            {selectedPayment === "pix" && (
              <div className="flex justify-between text-sm text-green-600">
                <span>Desconto Pix (5%)</span><span>-{formatPrice(Math.round((total + shippingCost) * 0.05))}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-bibelo-dark pt-1 border-t border-gray-100">
              <span>Total</span>
              <span>{formatPrice(
                selectedPayment === "pix"
                  ? Math.round((total + shippingCost) * 0.95)
                  : total + shippingCost
              )}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
