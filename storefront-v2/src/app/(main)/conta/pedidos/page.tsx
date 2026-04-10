"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useAuthStore } from "@/store/auth"
import { getOrders } from "@/lib/medusa/auth"

interface Order {
  id: string
  display_id: number
  status: string
  payment_status: string
  fulfillment_status: string
  created_at: string
  total: number
  currency_code: string
  items: Array<{
    id: string
    title: string
    quantity: number
    unit_price: number
    thumbnail?: string
  }>
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

export default function PedidosPage() {
  const router = useRouter()
  const { token, customer, loading: authLoading } = useAuthStore()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!authLoading && !token) {
      router.replace("/conta")
      return
    }
    if (token) {
      getOrders(token).then((data) => {
        setOrders(data)
        setLoading(false)
      }).catch(() => setLoading(false))
    }
  }, [token, authLoading, router])

  if (authLoading || loading) {
    return (
      <div className="content-container py-16 text-center">
        <div className="w-8 h-8 border-2 border-bibelo-pink border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-sm text-gray-500 mt-4">Carregando pedidos...</p>
      </div>
    )
  }

  return (
    <div className="content-container py-8 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/conta" className="p-2 rounded-full hover:bg-gray-100 transition-colors">
          <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </Link>
        <h1 className="text-xl font-bold text-bibelo-dark">Meus Pedidos</h1>
      </div>

      {orders.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl shadow-sm border border-gray-100">
          <div className="w-16 h-16 bg-bibelo-pink/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-bibelo-pink" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
            </svg>
          </div>
          <h2 className="font-semibold text-gray-700 mb-2">Nenhum pedido ainda</h2>
          <p className="text-sm text-gray-500 mb-4">Seus pedidos aparecerão aqui após a primeira compra</p>
          <Link href="/produtos" className="btn-primary inline-block text-sm">Explorar produtos</Link>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => {
            const status = getOrderDisplayStatus(order.payment_status ?? order.status, order.fulfillment_status ?? "")
            return (
              <div key={order.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <span className="font-bold text-bibelo-dark">Pedido #{order.display_id}</span>
                    <span className="text-xs text-gray-400 ml-2">
                      {new Date(order.created_at).toLocaleDateString("pt-BR")}
                    </span>
                  </div>
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${status.color}`}>
                    {status.label}
                  </span>
                </div>

                {order.items?.length > 0 && (
                  <div className="space-y-2 mb-3">
                    {order.items.slice(0, 3).map((item) => (
                      <div key={item.id} className="flex items-center gap-3 text-sm">
                        <div className="w-10 h-10 bg-gray-50 rounded-lg flex items-center justify-center shrink-0 overflow-hidden">
                          {item.thumbnail ? (
                            <img src={item.thumbnail} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <svg className="w-5 h-5 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909" /></svg>
                          )}
                        </div>
                        <span className="flex-1 text-gray-700 line-clamp-1">{item.title}</span>
                        <span className="text-gray-400 shrink-0">x{item.quantity}</span>
                      </div>
                    ))}
                    {order.items.length > 3 && (
                      <p className="text-xs text-gray-400">+{order.items.length - 3} item(ns)</p>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                  <span className="font-bold text-bibelo-dark">{formatCurrency(order.total)}</span>
                  <Link
                    href={`/conta/pedidos/${order.id}`}
                    className="text-xs text-bibelo-pink font-medium hover:underline"
                  >
                    Ver detalhes →
                  </Link>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
