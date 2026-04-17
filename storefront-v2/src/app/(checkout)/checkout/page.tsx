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
import { startGoogleLogin, loginWithEmail, registerWithEmail } from "@/lib/medusa/auth"
import { formatPrice } from "@/lib/utils"
import { trackInitiateCheckout } from "@/lib/meta-pixel"
import { useStoreSettings } from "@/hooks/useStoreSettings"

// Steps: "identificacao" → "endereco" → "entrega" → "pagamento"
type Step = "identificacao" | "endereco" | "entrega" | "pagamento"
type PaymentMethod = "pix" | "credit_card" | "boleto"
type AuthMode = "login" | "register"

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
  const { customer, token, setToken, loadCustomer } = useAuthStore()
  const { settings: storeSettings } = useStoreSettings()
  const pixDesconto = storeSettings.pix_desconto / 100  // ex: 0.05
  const pixDescontoLabel = `${storeSettings.pix_desconto}%`

  const [step, setStep] = useState<Step>("identificacao")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  // ── Identificação (Step 0) ─────────────────────────────────
  const [authMode, setAuthMode] = useState<AuthMode>("login")
  const [authEmail, setAuthEmail] = useState("")
  const [authPassword, setAuthPassword] = useState("")
  const [authName, setAuthName] = useState("")
  const [googleLoading, setGoogleLoading] = useState(false)

  // ── Shipping ───────────────────────────────────────────────
  const [shippingOptions, setShippingOptions] = useState<ShippingOption[]>([])
  const [selectedShipping, setSelectedShipping] = useState("")
  const [shippingCost, setShippingCost] = useState(0)

  // ── Payment ────────────────────────────────────────────────
  const [selectedPayment, setSelectedPayment] = useState<PaymentMethod>("pix")
  const [mpReady, setMpReady] = useState(false)

  // ── Card form ──────────────────────────────────────────────
  const [cardNumber, setCardNumber] = useState("")
  const [cardHolder, setCardHolder] = useState("")
  const [cardExpiry, setCardExpiry] = useState("")
  const [cardCvv, setCardCvv] = useState("")
  const [cardCpf, setCardCpf] = useState("")
  const [installments, setInstallments] = useState(1)

  // ── Address form ───────────────────────────────────────────
  const [address, setAddress] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    address_1: "",
    address_2: "",
    city: "",
    province: "",
    postal_code: "",
    neighborhood: "",
  })
  const [cepLoading, setCepLoading] = useState(false)
  const [cepError, setCepError] = useState("")

  // Se já está logado, pular Step 0 direto para endereço
  useEffect(() => {
    if (customer) {
      setStep("endereco")
      setAddress((prev) => ({
        ...prev,
        first_name: prev.first_name || customer.first_name || "",
        last_name: prev.last_name || customer.last_name || "",
        email: prev.email || customer.email || "",
      }))
    }
  }, [customer])

  // Meta Pixel: InitiateCheckout ao entrar na página
  useEffect(() => {
    if (items.length > 0 && total) {
      trackInitiateCheckout({ value: total, numItems: items.length })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Auto-fill CEP via ViaCEP ───────────────────────────────
  const fetchAddressByCep = useCallback(async (cep: string) => {
    const digits = cep.replace(/\D/g, "")
    if (digits.length !== 8) return
    setCepLoading(true)
    setCepError("")
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`)
      const data = await res.json()
      if (data.erro) {
        setCepError("CEP não encontrado")
        return
      }
      setAddress((prev) => ({
        ...prev,
        city: data.localidade || prev.city,
        province: data.uf || prev.province,
        neighborhood: data.bairro || prev.neighborhood,
        address_1: prev.address_1 || (data.logradouro ? `${data.logradouro}, ` : ""),
      }))
      setTimeout(() => {
        document.getElementById("address-number")?.focus()
      }, 100)
    } catch {
      setCepError("Erro ao buscar CEP. Preencha manualmente.")
    } finally {
      setCepLoading(false)
    }
  }, [])

  // ── Carrinho vazio ─────────────────────────────────────────
  if (items.length === 0) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-bibelo-dark mb-4">Seu carrinho está vazio</h1>
        <Link href="/produtos" className="btn-primary">Ver produtos</Link>
      </div>
    )
  }

  // ── Step 0: Identificação ──────────────────────────────────
  const handleGoogleLogin = () => {
    setError("")
    setGoogleLoading(true)
    startGoogleLogin().catch((err) => {
      setError(err instanceof Error ? err.message : "Erro ao conectar com Google")
      setGoogleLoading(false)
    })
  }

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!authEmail || !authPassword) {
      setError("Preencha e-mail e senha")
      return
    }
    setLoading(true)
    setError("")
    try {
      let newToken: string | null = null
      if (authMode === "login") {
        newToken = await loginWithEmail(authEmail, authPassword)
      } else {
        if (!authName.trim()) {
          setError("Informe seu nome")
          setLoading(false)
          return
        }
        const [firstName, ...rest] = authName.trim().split(" ")
        newToken = await registerWithEmail(authEmail, authPassword, firstName, rest.join(" "))
      }
      if (newToken) {
        setToken(newToken)
        await loadCustomer()
        // useEffect acima vai detectar o customer e avançar para "endereco"
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro de autenticação"
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  const handleGuestContinue = () => {
    if (!authEmail || !authEmail.includes("@")) {
      setError("Informe um e-mail válido")
      return
    }
    setAddress((prev) => ({ ...prev, email: authEmail }))
    setStep("endereco")
  }

  // ── Step 1: Endereço ───────────────────────────────────────
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
      console.log("[Checkout] Opções de frete recebidas:", options)
      setShippingOptions(options)
      setStep("entrega")
    } catch (err) {
      console.error("[Checkout] Erro ao salvar endereço:", err)
      setError("Erro ao processar. Tente novamente.")
    } finally {
      setLoading(false)
    }
  }

  // ── Step 2: Frete ──────────────────────────────────────────
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
    } catch (err) {
      console.error("[Checkout] Erro ao selecionar frete:", err)
      setError("Erro ao processar frete.")
    } finally {
      setLoading(false)
    }
  }

  // ── Tokenizar cartão via MercadoPago.js SDK v2 ─────────────
  const tokenizeCard = async (): Promise<string | null> => {
    if (typeof window === "undefined" || !(window as any).MercadoPago) {
      setError("SDK do Mercado Pago não carregou. Recarregue a página.")
      return null
    }
    try {
      const mp = new (window as any).MercadoPago(MP_PUBLIC_KEY, { locale: "pt-BR" })
      const [expMonth, expYear] = cardExpiry.split("/")
      const tokenData = await mp.createCardToken({
        cardNumber: cardNumber.replace(/\s/g, ""),
        cardholderName: cardHolder,
        cardExpirationMonth: expMonth?.trim(),
        cardExpirationYear:
          expYear?.trim().length === 2 ? `20${expYear.trim()}` : expYear?.trim(),
        securityCode: cardCvv,
        identificationType: "CPF",
        identificationNumber: cardCpf.replace(/\D/g, ""),
      })
      console.log("[Checkout] Card token gerado:", tokenData.id)
      return tokenData.id
    } catch (err) {
      console.error("[Checkout] Erro ao tokenizar cartão:", err)
      setError("Erro ao processar dados do cartão. Verifique os dados e tente novamente.")
      return null
    }
  }

  // ── Step 3: Pagamento e finalização ───────────────────────
  const handlePaymentSubmit = async () => {
    if (!cartId) return
    setLoading(true)
    setError("")

    try {
      // Montar contexto de pagamento para o Mercado Pago
      const paymentContext: {
        payment_method_type: PaymentMethod
        card_token?: string
        installments?: number
        payer_cpf?: string
      } = {
        payment_method_type: selectedPayment,
      }

      if (selectedPayment === "credit_card") {
        if (!cardNumber || !cardHolder || !cardExpiry || !cardCvv || !cardCpf) {
          setError("Preencha todos os dados do cartão")
          setLoading(false)
          return
        }
        const cardToken = await tokenizeCard()
        if (!cardToken) {
          setLoading(false)
          return
        }
        paymentContext.card_token = cardToken
        paymentContext.installments = installments
        paymentContext.payer_cpf = cardCpf.replace(/\D/g, "")
      }

      if (selectedPayment === "boleto") {
        if (!cardCpf || cardCpf.replace(/\D/g, "").length < 11) {
          setError("Informe o CPF do pagador")
          setLoading(false)
          return
        }
        paymentContext.payer_cpf = cardCpf.replace(/\D/g, "")
      }

      console.log("[Checkout] Iniciando sessão de pagamento:", paymentContext)

      // Iniciar sessão de pagamento com contexto
      const session = await initiatePaymentSession(
        cartId,
        "pp_mercadopago_mercadopago",
        paymentContext
      )
      if (!session) {
        setError("Erro ao iniciar pagamento. Tente novamente.")
        setLoading(false)
        return
      }

      console.log("[Checkout] Sessão de pagamento criada:", session)

      // Completar o carrinho (criar pedido)
      const result = await completeCart(cartId)
      console.log("[Checkout] completeCart resultado:", result)

      if (result?.type === "order" || result?.order) {
        const order = result.order || result
        localStorage.removeItem("bibelo-cart-v2")

        // Extrair dados de pagamento da sessão ou do resultado
        const paymentData =
          session?.data ||
          result?.data ||
          result?.payment_collection?.payment_sessions?.[0]?.data ||
          {}

        const totalParam = total ? `&total=${total}&num_items=${items.length}` : ""

        if (
          selectedPayment === "pix" &&
          (paymentData?.qr_code || paymentData?.qr_code_base64)
        ) {
          router.push(
            `/checkout/confirmacao?order_id=${order.id}&display_id=${order.display_id || ""}&payment=pix&qr_code=${encodeURIComponent(paymentData.qr_code || "")}&qr_code_base64=${encodeURIComponent(paymentData.qr_code_base64 || "")}${totalParam}`
          )
        } else if (
          selectedPayment === "boleto" &&
          (paymentData?.boleto_url || paymentData?.ticket_url)
        ) {
          const boletoUrl = paymentData.boleto_url || paymentData.ticket_url
          router.push(
            `/checkout/confirmacao?order_id=${order.id}&display_id=${order.display_id || ""}&payment=boleto&boleto_url=${encodeURIComponent(boletoUrl)}${totalParam}`
          )
        } else {
          router.push(
            `/checkout/confirmacao?order_id=${order.id}&display_id=${order.display_id || ""}&payment=${selectedPayment}${totalParam}`
          )
        }
      } else {
        console.warn("[Checkout] completeCart retornou resultado inesperado:", result)
        setError("Pedido criado, mas pagamento pendente. Entre em contato pelo WhatsApp.")
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao finalizar pedido"
      console.error("[Checkout] Erro no pagamento:", err)
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  // ── Helpers de formatação ──────────────────────────────────
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

  // ── Steps indicator ────────────────────────────────────────
  const stepsArr: Step[] = ["identificacao", "endereco", "entrega", "pagamento"]
  const stepLabels: Record<Step, string> = {
    identificacao: "Identificação",
    endereco: "Endereço",
    entrega: "Entrega",
    pagamento: "Pagamento",
  }
  const currentIdx = stepsArr.indexOf(step)

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* SDK Mercado Pago v2 */}
      {MP_PUBLIC_KEY && (
        <Script
          src="https://sdk.mercadopago.com/js/v2"
          onLoad={() => {
            console.log("[Checkout] MercadoPago SDK v2 carregado")
            setMpReady(true)
          }}
          onError={() => console.error("[Checkout] Falha ao carregar SDK MercadoPago")}
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
              <div
                className={`flex items-center gap-2 px-3 py-2 rounded-full text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-bibelo-pink text-white"
                    : isDone
                    ? "bg-bibelo-pink/20 text-bibelo-pink"
                    : "bg-gray-100 text-gray-500"
                }`}
              >
                <span
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
                    isActive
                      ? "bg-white text-bibelo-pink"
                      : isDone
                      ? "bg-bibelo-pink text-white"
                      : "bg-gray-300 text-white"
                  }`}
                >
                  {isDone ? "✓" : idx + 1}
                </span>
                {stepLabels[s]}
              </div>
              {idx < stepsArr.length - 1 && <div className="w-4 h-px bg-gray-200" />}
            </div>
          )
        })}
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 text-sm p-3 rounded-xl mb-4 flex items-start gap-2">
          <svg className="w-4 h-4 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Formulário principal */}
        <div className="lg:col-span-2">

          {/* ── STEP 0: Identificação ── */}
          {step === "identificacao" && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-5">
              <div>
                <h2 className="font-semibold text-lg text-bibelo-dark">Identificação</h2>
                <p className="text-sm text-gray-500 mt-1">
                  Entre ou crie sua conta para continuar a compra
                </p>
              </div>

              {/* Botão Google */}
              <button
                onClick={handleGoogleLogin}
                disabled={googleLoading}
                className="flex items-center justify-center gap-3 w-full py-3 px-4 rounded-full border-2 border-gray-200
                           hover:border-bibelo-pink/40 hover:bg-gray-50 transition-colors font-medium text-sm text-gray-700
                           disabled:opacity-50"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
                {googleLoading ? "Conectando..." : "Continuar com Google"}
              </button>

              {/* Divisor */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-gray-200" />
                <span className="text-xs text-gray-400 font-medium">ou</span>
                <div className="flex-1 h-px bg-gray-200" />
              </div>

              {/* Tabs Login / Cadastro */}
              <div className="flex rounded-xl border border-gray-200 overflow-hidden">
                <button
                  onClick={() => { setAuthMode("login"); setError("") }}
                  className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                    authMode === "login"
                      ? "bg-bibelo-pink text-white"
                      : "text-gray-500 hover:bg-gray-50"
                  }`}
                >
                  Entrar
                </button>
                <button
                  onClick={() => { setAuthMode("register"); setError("") }}
                  className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                    authMode === "register"
                      ? "bg-bibelo-pink text-white"
                      : "text-gray-500 hover:bg-gray-50"
                  }`}
                >
                  Criar conta
                </button>
              </div>

              <form onSubmit={handleAuthSubmit} className="space-y-3">
                {authMode === "register" && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nome completo *</label>
                    <input
                      type="text"
                      className="input-base"
                      placeholder="Seu nome"
                      value={authName}
                      onChange={(e) => setAuthName(e.target.value)}
                      required
                    />
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">E-mail *</label>
                  <input
                    type="email"
                    className="input-base"
                    placeholder="seu@email.com"
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Senha *</label>
                  <input
                    type="password"
                    className="input-base"
                    placeholder={authMode === "register" ? "Mínimo 8 caracteres" : "Sua senha"}
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    required
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="btn-primary w-full py-3 disabled:opacity-50"
                >
                  {loading
                    ? "Aguarde..."
                    : authMode === "login"
                    ? "Entrar e continuar →"
                    : "Criar conta e continuar →"}
                </button>
              </form>

              {/* Divisor convidado */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-gray-200" />
                <span className="text-xs text-gray-400 font-medium">ou compre sem conta</span>
                <div className="flex-1 h-px bg-gray-200" />
              </div>

              {/* Comprar como convidado */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">E-mail para receber o pedido</label>
                <div className="flex gap-2">
                  <input
                    type="email"
                    className="input-base flex-1"
                    placeholder="seu@email.com"
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                  />
                  <button
                    onClick={handleGuestContinue}
                    className="btn-secondary px-4 py-2 text-sm whitespace-nowrap"
                  >
                    Continuar →
                  </button>
                </div>
                <p className="text-xs text-gray-400">
                  Você receberá a confirmação do pedido neste e-mail.
                </p>
              </div>
            </div>
          )}

          {/* ── STEP 1: Endereço ── */}
          {step === "endereco" && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-lg text-bibelo-dark">Endereço de entrega</h2>
                {customer && (
                  <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                    {customer.email}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
                  <input type="text" className="input-base" placeholder="Seu nome"
                    value={address.first_name} onChange={(e) => setAddress({ ...address, first_name: e.target.value })} required />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Sobrenome</label>
                  <input type="text" className="input-base" placeholder="Seu sobrenome"
                    value={address.last_name} onChange={(e) => setAddress({ ...address, last_name: e.target.value })} />
                </div>
                {!customer && (
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">E-mail *</label>
                    <input type="email" className="input-base" placeholder="seu@email.com"
                      value={address.email} onChange={(e) => setAddress({ ...address, email: e.target.value })} required />
                  </div>
                )}
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Telefone</label>
                  <input type="tel" className="input-base" placeholder="(47) 99999-9999"
                    value={address.phone} onChange={(e) => setAddress({ ...address, phone: e.target.value })} />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">CEP *</label>
                  <div className="relative">
                    <input
                      type="text"
                      className={`input-base pr-10 ${cepError ? "border-red-400" : ""}`}
                      placeholder="00000-000"
                      maxLength={9}
                      value={address.postal_code}
                      onChange={(e) => {
                        const formatted = formatCep(e.target.value)
                        setAddress({ ...address, postal_code: formatted })
                        setCepError("")
                        if (formatted.replace(/\D/g, "").length === 8) {
                          fetchAddressByCep(formatted)
                        }
                      }}
                      required
                    />
                    {cepLoading && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <div className="w-4 h-4 border-2 border-bibelo-pink border-t-transparent rounded-full animate-spin" />
                      </div>
                    )}
                  </div>
                  {cepError && <p className="text-xs text-red-500 mt-1">{cepError}</p>}
                  <a
                    href="https://buscacepinter.correios.com.br/app/endereco/index.php"
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-bibelo-pink hover:underline mt-1 inline-block"
                  >
                    Não sei meu CEP
                  </a>
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Endereço *</label>
                  <input
                    id="address-number"
                    type="text"
                    className="input-base"
                    placeholder="Rua, número"
                    value={address.address_1}
                    onChange={(e) => setAddress({ ...address, address_1: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Bairro</label>
                  <input type="text" className="input-base" placeholder="Bairro"
                    value={address.neighborhood} onChange={(e) => setAddress({ ...address, neighborhood: e.target.value })} />
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
                  <p className="text-xs text-gray-400 mb-4">
                    Verifique se o CEP está correto ou entre em contato pelo WhatsApp.
                  </p>
                  <button onClick={() => setStep("endereco")} className="text-bibelo-pink font-medium text-sm hover:underline">
                    Alterar endereço
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {shippingOptions.map((option) => {
                    const price = option.calculated_price?.calculated_amount ?? option.amount ?? 0
                    // Extrair prazo de entrega do campo data se disponível
                    const deliveryDays = (option.data as any)?.delivery_time as number | undefined
                    return (
                      <label
                        key={option.id}
                        className={`flex items-center gap-3 p-4 border rounded-xl cursor-pointer transition-colors ${
                          selectedShipping === option.id
                            ? "border-bibelo-pink bg-bibelo-pink/5"
                            : "border-gray-200 hover:border-bibelo-pink/50"
                        }`}
                        onClick={() => {
                          setSelectedShipping(option.id)
                          setShippingCost(price)
                        }}
                      >
                        <input
                          type="radio"
                          name="shipping"
                          value={option.id}
                          checked={selectedShipping === option.id}
                          onChange={() => {}}
                          className="accent-bibelo-pink"
                        />
                        <div className="flex-1">
                          <p className="font-medium text-gray-800">{option.name}</p>
                          {deliveryDays && (
                            <p className="text-xs text-gray-500 mt-0.5">
                              Prazo estimado: {deliveryDays} {deliveryDays === 1 ? "dia útil" : "dias úteis"}
                            </p>
                          )}
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
                <button
                  onClick={handleShippingSubmit}
                  disabled={loading || !selectedShipping}
                  className="btn-primary flex-1 py-3 disabled:opacity-50"
                >
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
                <label
                  className={`flex items-center gap-3 p-4 border rounded-xl cursor-pointer transition-colors ${
                    selectedPayment === "pix" ? "border-bibelo-pink bg-bibelo-pink/5" : "border-gray-200"
                  }`}
                  onClick={() => setSelectedPayment("pix")}
                >
                  <input type="radio" name="payment" value="pix"
                    checked={selectedPayment === "pix"} onChange={() => setSelectedPayment("pix")} className="accent-bibelo-pink" />
                  <span className="text-xl">⚡</span>
                  <div className="flex-1">
                    <p className="font-medium text-gray-800">Pix</p>
                    <p className="text-xs text-gray-500">Aprovação instantânea</p>
                  </div>
                  <span className="text-xs font-semibold text-green-600 bg-green-50 px-2 py-1 rounded-full">{pixDescontoLabel} OFF</span>
                </label>

                {/* Cartão de Crédito */}
                <label
                  className={`flex items-center gap-3 p-4 border rounded-xl cursor-pointer transition-colors ${
                    selectedPayment === "credit_card" ? "border-bibelo-pink bg-bibelo-pink/5" : "border-gray-200"
                  }`}
                  onClick={() => setSelectedPayment("credit_card")}
                >
                  <input type="radio" name="payment" value="credit_card"
                    checked={selectedPayment === "credit_card"} onChange={() => setSelectedPayment("credit_card")} className="accent-bibelo-pink" />
                  <span className="text-xl">💳</span>
                  <div className="flex-1">
                    <p className="font-medium text-gray-800">Cartão de Crédito</p>
                    <p className="text-xs text-gray-500">Visa, Mastercard, Elo, Amex, Hipercard</p>
                  </div>
                  <span className="text-xs text-gray-400">Até {storeSettings.cartao_parcelas_max}x*</span>
                </label>

                {/* Boleto */}
                <label
                  className={`flex items-center gap-3 p-4 border rounded-xl cursor-pointer transition-colors ${
                    selectedPayment === "boleto" ? "border-bibelo-pink bg-bibelo-pink/5" : "border-gray-200"
                  }`}
                  onClick={() => setSelectedPayment("boleto")}
                >
                  <input type="radio" name="payment" value="boleto"
                    checked={selectedPayment === "boleto"} onChange={() => setSelectedPayment("boleto")} className="accent-bibelo-pink" />
                  <span className="text-xl">📄</span>
                  <div className="flex-1">
                    <p className="font-medium text-gray-800">Boleto Bancário</p>
                    <p className="text-xs text-gray-500">Aprovação em até 3 dias úteis</p>
                  </div>
                </label>
              </div>

              {/* Info box Pix */}
              {selectedPayment === "pix" && (
                <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm">
                  <p className="font-semibold text-green-800">Desconto Pix: {pixDescontoLabel} OFF</p>
                  <p className="text-green-600 text-xs mt-1">
                    O QR Code Pix será gerado após a confirmação. Pagamento aprovado em segundos.
                  </p>
                </div>
              )}

              {/* Formulário do cartão */}
              {selectedPayment === "credit_card" && (
                <div className="border border-gray-200 rounded-xl p-5 space-y-4">
                  {!mpReady && MP_PUBLIC_KEY && (
                    <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 p-2 rounded-lg">
                      <div className="w-3 h-3 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                      Carregando processador de pagamento...
                    </div>
                  )}
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
                      <option value={1}>1x de {formatPrice(total + shippingCost)} sem juros</option>
                      {Array.from({ length: storeSettings.cartao_parcelas_max - 1 }, (_, i) => i + 2).map((n) => (
                        <option key={n} value={n}>
                          {n}x de {formatPrice(Math.ceil((total + shippingCost) / n))} + juros MP
                        </option>
                      ))}
                    </select>
                    <p className="text-[11px] text-gray-400 mt-1">
                      * Parcelas a partir de 2x estão sujeitas aos juros do Mercado Pago, cobrados do comprador.
                    </p>
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
                <button
                  onClick={handlePaymentSubmit}
                  disabled={loading || (selectedPayment === "credit_card" && !mpReady && !!MP_PUBLIC_KEY)}
                  className="btn-primary flex-1 py-3 disabled:opacity-50"
                >
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
                  {item.thumbnail && (
                    <Image
                      src={item.thumbnail}
                      alt={item.title}
                      width={32}
                      height={32}
                      className="w-full h-full object-cover"
                    />
                  )}
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
            {selectedPayment === "pix" && step === "pagamento" && (
              <div className="flex justify-between text-sm text-green-600">
                <span>Desconto Pix ({pixDescontoLabel})</span>
                <span>-{formatPrice(Math.round((total + shippingCost) * pixDesconto))}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-bibelo-dark pt-1 border-t border-gray-100">
              <span>Total</span>
              <span>
                {formatPrice(
                  selectedPayment === "pix" && step === "pagamento"
                    ? Math.round((total + shippingCost) * (1 - pixDesconto))
                    : total + shippingCost
                )}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
