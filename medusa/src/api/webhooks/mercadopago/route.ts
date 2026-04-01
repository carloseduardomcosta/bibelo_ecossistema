/**
 * Webhook Mercado Pago — /webhooks/mercadopago
 * Valida HMAC com timingSafeEqual antes de processar
 *
 * O MP envia webhooks em 2 formatos:
 * - Antigo (payment): data.id no body JSON
 * - Novo (order): data.id na query string + body com detalhes
 */

import crypto from "crypto"
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

export const POST = async (
  req: MedusaRequest,
  res: MedusaResponse
) => {
  const logger = req.scope.resolve("logger") as any
  const webhookSecret = process.env.MP_WEBHOOK_SECRET

  if (!webhookSecret) {
    logger.error("MercadoPago webhook: MP_WEBHOOK_SECRET não configurado")
    res.status(500).json({ error: "webhook secret não configurado" })
    return
  }

  const xSignature = req.headers["x-signature"] as string
  const xRequestId = req.headers["x-request-id"] as string

  const body = req.body as any
  const query = req.query as any

  // data.id: body (formato antigo) ou query string (formato novo/order)
  const dataId =
    body?.data?.id?.toString() ||
    query?.["data.id"]?.toString() ||
    ""

  // type: body ou query string
  const type = body?.type || query?.type || ""
  const action = body?.action || ""

  // Validar HMAC
  if (!xSignature) {
    logger.error("MercadoPago webhook: header x-signature ausente")
    res.status(401).json({ error: "assinatura ausente" })
    return
  }

  const isValid = validateMPWebhook(xSignature, xRequestId, dataId, webhookSecret)
  if (!isValid) {
    logger.error(
      `MercadoPago webhook HMAC inválida: type=${type} dataId=${dataId} xRequestId=${xRequestId}`
    )
    res.status(401).json({ error: "assinatura inválida" })
    return
  }

  logger.info(
    `MercadoPago webhook recebido: type=${type} action=${action} id=${dataId}`
  )

  try {
    const mpToken = process.env.MP_ACCESS_TOKEN
    if (!mpToken) {
      logger.error("MercadoPago webhook: MP_ACCESS_TOKEN não configurado")
      res.status(500).json({ error: "token não configurado" })
      return
    }

    // Processar por tipo de webhook
    if (type === "payment" && dataId) {
      await processPaymentWebhook(logger, mpToken, dataId, req)
    } else if (type === "order" && dataId) {
      await processOrderWebhook(logger, mpToken, dataId, req)
    }

    res.status(200).json({ received: true })
  } catch (err: any) {
    logger.error(`MercadoPago webhook erro: ${err.message}`)
    res.status(200).json({ received: true })
  }
}

async function processPaymentWebhook(
  logger: any,
  mpToken: string,
  paymentId: string,
  req: MedusaRequest
) {
  const paymentRes = await fetch(
    `https://api.mercadopago.com/v1/payments/${paymentId}`,
    { headers: { Authorization: `Bearer ${mpToken}` } }
  )

  if (!paymentRes.ok) {
    logger.error(
      `MercadoPago webhook: erro ao consultar payment ${paymentId}: ${paymentRes.status}`
    )
    return
  }

  const payment = await paymentRes.json()
  logger.info(
    `MercadoPago payment ${paymentId}: status=${payment.status} ref=${payment.external_reference}`
  )

  const eventBus = req.scope.resolve("event_bus") as any
  await eventBus.emit("mercadopago.payment_updated", {
    mp_payment_id: paymentId,
    status: payment.status,
    external_reference: payment.external_reference,
    amount: payment.transaction_amount,
    payer_email: payment.payer?.email,
  })
}

async function processOrderWebhook(
  logger: any,
  mpToken: string,
  orderId: string,
  req: MedusaRequest
) {
  const orderRes = await fetch(
    `https://api.mercadopago.com/v1/orders/${orderId}`,
    { headers: { Authorization: `Bearer ${mpToken}` } }
  )

  if (!orderRes.ok) {
    logger.error(
      `MercadoPago webhook: erro ao consultar order ${orderId}: ${orderRes.status}`
    )
    return
  }

  const order = await orderRes.json()
  logger.info(
    `MercadoPago order ${orderId}: status=${order.status} ref=${order.external_reference}`
  )

  // Se a order foi processada (paga), emitir evento
  if (order.status === "processed") {
    const eventBus = req.scope.resolve("event_bus") as any
    await eventBus.emit("mercadopago.order_paid", {
      mp_order_id: orderId,
      status: order.status,
      external_reference: order.external_reference,
      total_amount: order.total_amount,
    })
  }
}

/**
 * Validação HMAC do webhook Mercado Pago
 * Conforme documentação oficial
 */
function validateMPWebhook(
  xSignature: string,
  xRequestId: string,
  dataId: string,
  secret: string
): boolean {
  try {
    const parts = xSignature.split(",")
    const tsEntry = parts.find((p) => p.trim().startsWith("ts="))
    const v1Entry = parts.find((p) => p.trim().startsWith("v1="))

    const ts = tsEntry?.split("=")[1]?.trim()
    const v1 = v1Entry?.split("=")[1]?.trim()

    if (!ts || !v1) {
      return false
    }

    const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`
    const hash = crypto
      .createHmac("sha256", secret)
      .update(manifest)
      .digest("hex")

    const hashBuf = Buffer.from(hash)
    const v1Buf = Buffer.from(v1)

    if (hashBuf.length !== v1Buf.length) {
      return false
    }

    return crypto.timingSafeEqual(hashBuf, v1Buf)
  } catch {
    return false
  }
}
