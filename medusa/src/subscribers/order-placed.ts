/**
 * Subscriber: order.placed → envia pedido ao CRM → CRM cria no Bling
 */

import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { Modules } from "@medusajs/framework/utils"

const CRM_URL = process.env.CRM_INTERNAL_URL || "http://bibelo_api:4000"

export default async function orderPlacedHandler({
  event,
  container,
}: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve("logger") as any
  const orderId = event.data?.id

  if (!orderId) {
    logger.warn("order.placed subscriber: sem order ID")
    return
  }

  logger.info(`order.placed: processando pedido ${orderId}`)

  try {
    // Buscar detalhes completos do pedido no Medusa
    const query = container.resolve("query") as any
    const { data: [order] } = await query.graph({
      entity: "order",
      fields: [
        "id",
        "display_id",
        "email",
        "currency_code",
        "total",
        "subtotal",
        "shipping_total",
        "item_subtotal",
        "items.*",
        "items.variant.*",
        "shipping_address.*",
        "billing_address.*",
        "shipping_methods.*",
      ],
      filters: { id: orderId },
    })

    if (!order) {
      logger.error(`order.placed: pedido ${orderId} não encontrado`)
      return
    }

    logger.info(
      `order.placed: pedido #${order.display_id} email=${order.email} total=${order.total}`
    )

    // Montar payload para o CRM
    const payload = {
      medusa_order_id: order.id,
      display_id: order.display_id,
      email: order.email,
      total: order.total,
      subtotal: order.subtotal,
      shipping_total: order.shipping_total,
      currency_code: order.currency_code,
      items: (order.items || []).map((item: any) => ({
        title: item.title,
        sku: item.variant?.sku || "",
        quantity: item.quantity,
        unit_price: item.unit_price,
        total: item.total,
      })),
      shipping_address: order.shipping_address
        ? {
            first_name: order.shipping_address.first_name,
            last_name: order.shipping_address.last_name,
            address_1: order.shipping_address.address_1,
            city: order.shipping_address.city,
            province: order.shipping_address.province,
            postal_code: order.shipping_address.postal_code,
            country_code: order.shipping_address.country_code,
            phone: order.shipping_address.phone,
          }
        : null,
      shipping_method: order.shipping_methods?.[0]?.name || "Melhor Envio",
    }

    // Enviar ao CRM via API interna
    const res = await fetch(`${CRM_URL}/api/internal/medusa-order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      const errText = await res.text()
      logger.error(`order.placed: CRM retornou ${res.status}: ${errText}`)
      return
    }

    const result = (await res.json()) as { bling_order_id?: string }
    logger.info(
      `order.placed: pedido #${order.display_id} enviado ao Bling (${result.bling_order_id || "pendente"})`
    )
  } catch (err: any) {
    logger.error(`order.placed subscriber erro: ${err.message}`)
  }
}

export const config: SubscriberConfig = {
  event: "order.placed",
}
