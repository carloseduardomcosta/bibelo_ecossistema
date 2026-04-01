/**
 * Webhook Mercado Pago — /webhooks/mercadopago
 * Valida HMAC com timingSafeEqual antes de processar
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

  // Headers do Mercado Pago
  const xSignature = req.headers["x-signature"] as string
  const xRequestId = req.headers["x-request-id"] as string

  const body = req.body as any
  const dataId = body?.data?.id?.toString() || ""

  // Validar HMAC
  if (!xSignature) {
    logger.error("MercadoPago webhook: header x-signature ausente")
    res.status(401).json({ error: "assinatura ausente" })
    return
  }

  const isValid = validateMPWebhook(xSignature, xRequestId, dataId, webhookSecret)
  if (!isValid) {
    logger.error("MercadoPago webhook: assinatura HMAC inválida")
    res.status(401).json({ error: "assinatura inválida" })
    return
  }

  const type = body?.type
  const action = body?.action
  const resourceId = body?.data?.id

  logger.info(
    `MercadoPago webhook recebido: type=${type} action=${action} id=${resourceId}`
  )

  // Processar via Payment Module do Medusa
  try {
    const paymentModuleService = req.scope.resolve("payment") as any

    if (type === "payment" && resourceId) {
      // Consultar o pagamento na API do MP
      const mpToken = process.env.MP_ACCESS_TOKEN
      if (!mpToken) {
        logger.error("MercadoPago webhook: MP_ACCESS_TOKEN não configurado")
        res.status(500).json({ error: "token não configurado" })
        return
      }

      const paymentRes = await fetch(
        `https://api.mercadopago.com/v1/payments/${resourceId}`,
        {
          headers: { Authorization: `Bearer ${mpToken}` },
        }
      )

      if (!paymentRes.ok) {
        logger.error(`MercadoPago webhook: erro ao consultar payment ${resourceId}: ${paymentRes.status}`)
        // Retorna 200 para o MP não reenviar — pagamento pode ser fictício (teste) ou expirado
        res.status(200).json({ received: true, warning: "pagamento não encontrado" })
        return
      }

      const payment = await paymentRes.json()
      const externalRef = payment.external_reference

      logger.info(
        `MercadoPago payment ${resourceId}: status=${payment.status} ref=${externalRef}`
      )

      // Emitir evento para o Medusa processar
      const eventBus = req.scope.resolve("event_bus") as any
      await eventBus.emit("mercadopago.payment_updated", {
        mp_payment_id: resourceId,
        status: payment.status,
        external_reference: externalRef,
        amount: payment.transaction_amount,
        payer_email: payment.payer?.email,
      })
    }

    res.status(200).json({ received: true })
  } catch (err: any) {
    logger.error(`MercadoPago webhook erro: ${err.message}`)
    res.status(200).json({ received: true })
  }
}

/**
 * Validação HMAC do webhook Mercado Pago
 * Conforme documentação: docs/Docs Integracoes bibelo.md
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
