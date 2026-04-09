/**
 * Subscriber: mercadopago.payment_updated + mercadopago.order_paid
 * Notifica o CRM quando pagamento é aprovado → CRM envia email ao cliente
 */

import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"

const CRM_URL = process.env.CRM_INTERNAL_URL || "http://bibelo_api:4000"

interface PaymentUpdatedData {
  mp_payment_id: string
  status: string
  external_reference: string
  amount: number
  payer_email: string
}

interface OrderPaidData {
  mp_order_id: string
  status: string
  external_reference: string
  total_amount: string
}

export default async function paymentApprovedHandler({
  event,
  container,
}: SubscriberArgs<PaymentUpdatedData | OrderPaidData>) {
  const logger = container.resolve("logger") as any
  const data = event.data

  if (!data) {
    logger.warn("payment-approved subscriber: sem dados no evento")
    return
  }

  // Só processar pagamentos aprovados
  const isApproved =
    (data as PaymentUpdatedData).status === "approved" ||
    (data as OrderPaidData).status === "processed"

  if (!isApproved) {
    logger.info(
      `payment-approved: ignorando status=${(data as any).status}`
    )
    return
  }

  const externalRef =
    (data as PaymentUpdatedData).external_reference ||
    (data as OrderPaidData).external_reference || ""

  // external_reference: BIBELO-<sessionId>
  const displayId = externalRef.replace("BIBELO-", "")

  const email =
    (data as PaymentUpdatedData).payer_email || ""

  const amount =
    (data as PaymentUpdatedData).amount ||
    parseFloat((data as OrderPaidData).total_amount || "0")

  logger.info(
    `payment-approved: notificando CRM ref=${externalRef} email=${email} amount=${amount}`
  )

  // Buscar o pedido no Medusa para obter email do customer se não veio no webhook
  let orderEmail = email
  if (!orderEmail && displayId) {
    try {
      const query = container.resolve("query") as any
      const { data: orders } = await query.graph({
        entity: "order",
        fields: ["id", "email", "display_id", "total"],
        filters: { display_id: parseInt(displayId) || undefined },
      })
      if (orders?.[0]) {
        orderEmail = orders[0].email || ""
        logger.info(`payment-approved: email do pedido=${orderEmail}`)
      }
    } catch {
      logger.warn("payment-approved: não conseguiu buscar pedido no Medusa")
    }
  }

  if (!orderEmail) {
    logger.warn("payment-approved: sem email — não vai enviar notificação")
    return
  }

  try {
    const res = await fetch(`${CRM_URL}/api/internal/medusa-payment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: orderEmail,
        display_id: displayId,
        total: Math.round(amount * 100), // converter para centavos
        payment_method: "Pix",
      }),
    })

    if (!res.ok) {
      const errText = await res.text()
      logger.error(`payment-approved: CRM retornou ${res.status}: ${errText}`)
      return
    }

    logger.info(`payment-approved: CRM notificado com sucesso para ${orderEmail}`)
  } catch (err: any) {
    logger.error(`payment-approved: erro ao notificar CRM: ${err.message}`)
  }
}

export const config: SubscriberConfig = {
  event: ["mercadopago.payment_updated", "mercadopago.order_paid"],
}
