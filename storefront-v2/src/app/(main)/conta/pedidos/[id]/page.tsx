"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useParams, notFound } from "next/navigation"
import { useAuthStore } from "@/store/auth"
import { getOrderById } from "@/lib/medusa/auth"

interface OrderFulfillment {
  id: string
  packed_at: string | null
  shipped_at: string | null
  delivered_at: string | null
  canceled_at: string | null
}

interface OrderAddress {
  first_name: string | null
  last_name: string | null
  address_1: string | null
  address_2?: string | null
  city: string | null
  province: string | null
  postal_code: string | null
}

interface OrderShippingMethod {
  id: string
  name: string
  total: number
}

interface OrderDetail {
  id: string
  display_id: number
  status: string
  payment_status: string
  fulfillment_status: string
  created_at: string
  total: number
  subtotal: number
  shipping_total: number
  currency_code: string
  items: Array<{
    id: string
    title: string
    quantity: number
    unit_price: number
    subtotal?: number
    thumbnail?: string
  }>
  shipping_address?: OrderAddress | null
  shipping_methods?: OrderShippingMethod[] | null
  fulfillments?: OrderFulfillment[]
}

function getOrderDisplayStatus(paymentStatus: string, fulfillmentStatus: string) {
  if (fulfillmentStatus === "canceled" || paymentStatus === "canceled")
    return { label: "Cancelado", color: "bg-red-100 text-red-700" }
  if (paymentStatus === "refunded" || paymentStatus === "partially_refunded")
    return { label: "Reembolsado", color: "bg-gray-100 text-gray-600" }
  if (paymentStatus === "awaiting" || paymentStatus === "not_paid")
    return { label: "Aguardando pagamento", color: "bg-yellow-100 text-yellow-700" }
  if (fulfillmentStatus === "delivered")
    return { label: "Entregue", color: "bg-green-100 text-green-700" }
  if (fulfillmentStatus === "shipped" || fulfillmentStatus === "partially_shipped")
    return { label: "Em transporte", color: "bg-purple-100 text-purple-700" }
  if (fulfillmentStatus === "fulfilled" || fulfillmentStatus === "partially_fulfilled")
    return { label: "Pronto para envio", color: "bg-purple-100 text-purple-700" }
  return { label: "Pagamento confirmado", color: "bg-blue-100 text-blue-700" }
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(amount / 100)
}

function formatDate(ts: string | null | undefined) {
  if (!ts) return null
  return new Date(ts).toLocaleDateString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  })
}

export default function PedidoDetailPage() {
  const params = useParams()
  const orderId = params.id as string
  const { token, loading: authLoading } = useAuthStore()

  const [order, setOrder] = useState<OrderDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFoundState, setNotFoundState] = useState(false)

  useEffect(() => {
    if (authLoading) return
    if (!token) {
      window.location.href = "/conta"
      return
    }
    getOrderById(token, orderId).then((data) => {
      if (data === null) {
        setNotFoundState(true)
      } else {
        setOrder(data as OrderDetail)
      }
      setLoading(false)
    }).catch(() => {
      setNotFoundState(true)
      setLoading(false)
    })
  }, [token, authLoading, orderId])

  // Chama notFound() na renderização após confirmar que o pedido não existe
  if (notFoundState) notFound()

  if (authLoading || loading) {
    return (
      <div className="content-container py-16 text-center">
        <div className="w-8 h-8 border-2 border-bibelo-pink border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-sm text-gray-500 mt-4">Carregando pedido...</p>
      </div>
    )
  }

  if (!order) return null

  const status = getOrderDisplayStatus(order.payment_status ?? "", order.fulfillment_status ?? "")
  const fulfillment = order.fulfillments?.[0]
  const isCanceled = order.fulfillment_status === "canceled" || order.payment_status === "canceled"
  const showWhatsApp = ["shipped", "partially_shipped", "delivered"].includes(order.fulfillment_status)

  // Monta timeline
  const timelineSteps = [
    {
      label: "Pedido realizado",
      ts: order.created_at,
      done: true,
    },
    {
      label: "Pagamento confirmado",
      ts: null,
      done: ["captured", "authorized", "partially_authorized"].includes(order.payment_status),
    },
    {
      label: "Separando itens",
      ts: fulfillment?.packed_at ?? null,
      done: !!fulfillment?.packed_at,
    },
    {
      label: "Em transporte",
      ts: fulfillment?.shipped_at ?? null,
      done: !!fulfillment?.shipped_at,
    },
    {
      label: "Entregue",
      ts: fulfillment?.delivered_at ?? null,
      done: !!fulfillment?.delivered_at,
    },
  ]

  return (
    <div className="content-container py-8 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link href="/conta/pedidos" className="p-2 rounded-full hover:bg-gray-100 transition-colors">
            <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </Link>
          <div>
            <h1 className="text-xl font-bold text-bibelo-dark">Pedido #{order.display_id}</h1>
            <p className="text-xs text-gray-400">{formatDate(order.created_at)}</p>
          </div>
        </div>
        <span className={`text-xs font-semibold px-3 py-1.5 rounded-full ${status.color}`}>
          {status.label}
        </span>
      </div>

      {/* Timeline */}
      {!isCanceled && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-4">
          <h2 className="font-semibold text-sm text-bibelo-dark mb-4">Acompanhe seu pedido</h2>
          <div className="relative">
            {timelineSteps.map((step, idx) => {
              const isLast = idx === timelineSteps.length - 1
              return (
                <div key={step.label} className="flex gap-3">
                  {/* Coluna do ícone + linha */}
                  <div className="flex flex-col items-center">
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                      step.done
                        ? "bg-bibelo-pink"
                        : "bg-gray-200"
                    }`}>
                      {step.done && (
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                      )}
                    </div>
                    {!isLast && (
                      <div className={`w-0.5 flex-1 my-1 ${step.done ? "bg-bibelo-pink/30" : "bg-gray-200"}`} style={{ minHeight: "20px" }} />
                    )}
                  </div>

                  {/* Texto */}
                  <div className={`pb-4 ${isLast ? "" : ""}`}>
                    <p className={`text-sm font-medium ${step.done ? "text-bibelo-dark" : "text-gray-400"}`}>
                      {step.label}
                    </p>
                    {step.ts && (
                      <p className="text-xs text-gray-400 mt-0.5">{formatDate(step.ts)}</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Itens */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-4">
        <h2 className="font-semibold text-sm text-bibelo-dark mb-3">
          Itens do pedido ({order.items?.length ?? 0})
        </h2>
        <div className="space-y-3">
          {order.items?.map((item) => (
            <div key={item.id} className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gray-50 rounded-xl shrink-0 overflow-hidden">
                {item.thumbnail ? (
                  <img src={item.thumbnail} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <svg className="w-5 h-5 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909" />
                    </svg>
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-800 font-medium line-clamp-2">{item.title}</p>
                <p className="text-xs text-gray-400 mt-0.5">Qtd: {item.quantity}</p>
              </div>
              <p className="text-sm font-semibold text-bibelo-dark shrink-0">
                {formatCurrency((item.subtotal ?? item.unit_price * item.quantity))}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Endereço de entrega */}
      {order.shipping_address && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-4">
          <h2 className="font-semibold text-sm text-bibelo-dark mb-2">Endereço de entrega</h2>
          <p className="text-sm text-gray-700">
            {order.shipping_address.first_name} {order.shipping_address.last_name}
          </p>
          <p className="text-sm text-gray-500">
            {order.shipping_address.address_1}
            {order.shipping_address.address_2 ? `, ${order.shipping_address.address_2}` : ""}
          </p>
          <p className="text-sm text-gray-500">
            {order.shipping_address.city}/{order.shipping_address.province}
            {order.shipping_address.postal_code ? ` — CEP ${order.shipping_address.postal_code}` : ""}
          </p>
        </div>
      )}

      {/* Resumo financeiro */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-4">
        <h2 className="font-semibold text-sm text-bibelo-dark mb-3">Resumo</h2>
        <div className="space-y-2 text-sm">
          {order.subtotal !== undefined && (
            <div className="flex justify-between text-gray-600">
              <span>Subtotal</span>
              <span>{formatCurrency(order.subtotal)}</span>
            </div>
          )}
          {order.shipping_total !== undefined && order.shipping_total > 0 && (
            <div className="flex justify-between text-gray-600">
              <span>
                Frete
                {order.shipping_methods?.[0]?.name ? ` (${order.shipping_methods[0].name})` : ""}
              </span>
              <span>{formatCurrency(order.shipping_total)}</span>
            </div>
          )}
          {order.shipping_total === 0 && (
            <div className="flex justify-between text-green-600">
              <span>Frete</span>
              <span>Grátis</span>
            </div>
          )}
          <div className="flex justify-between font-bold text-bibelo-dark pt-2 border-t border-gray-100">
            <span>Total</span>
            <span>{formatCurrency(order.total)}</span>
          </div>
        </div>
      </div>

      {/* WhatsApp — só quando em transporte ou entregue */}
      {showWhatsApp && (
        <a
          href={`https://wa.me/5547933862514?text=${encodeURIComponent(`Olá! Gostaria de informações sobre meu pedido #${order.display_id}`)}`}
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl bg-green-500 hover:bg-green-600 text-white text-sm font-semibold transition-colors"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
          </svg>
          Acompanhar entrega pelo WhatsApp
        </a>
      )}
    </div>
  )
}
