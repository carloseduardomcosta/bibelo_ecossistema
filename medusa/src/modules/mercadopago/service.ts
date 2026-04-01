/**
 * Mercado Pago Payment Provider — Papelaria Bibelô
 * Checkout Transparente via API Orders (2025)
 * Fase 1: apenas Pix
 */

import crypto from "crypto"
import { AbstractPaymentProvider, BigNumber, PaymentActions } from "@medusajs/framework/utils"
import type { Logger } from "@medusajs/framework/types"
import type {
  InitiatePaymentInput,
  InitiatePaymentOutput,
  AuthorizePaymentInput,
  AuthorizePaymentOutput,
  CapturePaymentInput,
  CapturePaymentOutput,
  RefundPaymentInput,
  RefundPaymentOutput,
  CancelPaymentInput,
  CancelPaymentOutput,
  DeletePaymentInput,
  DeletePaymentOutput,
  UpdatePaymentInput,
  UpdatePaymentOutput,
  GetPaymentStatusInput,
  GetPaymentStatusOutput,
  RetrievePaymentInput,
  RetrievePaymentOutput,
  ProviderWebhookPayload,
  WebhookActionResult,
} from "@medusajs/framework/types"
import type {
  MercadoPagoOptions,
  MPOrderRequest,
  MPOrderResponse,
} from "./types"

const MP_BASE_URL = "https://api.mercadopago.com"

type InjectedDependencies = {
  logger: Logger
}

class MercadoPagoProviderService extends AbstractPaymentProvider<MercadoPagoOptions> {
  static identifier = "mercadopago"

  private logger_: Logger
  private accessToken_: string
  private webhookSecret_: string

  constructor(container: InjectedDependencies, options: MercadoPagoOptions) {
    super(container, options)
    this.logger_ = container.logger
    this.accessToken_ = options.accessToken
    this.webhookSecret_ = options.webhookSecret
  }

  static validateOptions(options: Record<string, any>): void {
    if (!options.accessToken) {
      throw new Error("Mercado Pago: accessToken é obrigatório")
    }
    if (!options.webhookSecret) {
      throw new Error("Mercado Pago: webhookSecret é obrigatório")
    }
  }

  // --- Helpers ---

  private async mpRequest<T>(
    method: string,
    path: string,
    body?: Record<string, unknown>,
    idempotencyKey?: string
  ): Promise<T> {
    const headers: Record<string, string> = {
      "Authorization": `Bearer ${this.accessToken_}`,
      "Content-Type": "application/json",
    }
    if (idempotencyKey) {
      headers["X-Idempotency-Key"] = idempotencyKey
    }

    const startTime = Date.now()
    const url = `${MP_BASE_URL}${path}`

    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    })

    const elapsed = Date.now() - startTime
    this.logger_.info(
      `MercadoPago ${method} ${path} — ${res.status} (${elapsed}ms)`
    )

    if (!res.ok) {
      const errorBody = await res.text()
      this.logger_.error(
        `MercadoPago erro ${res.status}: ${errorBody}`
      )
      throw new Error(`MercadoPago API ${res.status}: ${errorBody}`)
    }

    return res.json() as Promise<T>
  }

  private toMPAmount(amount: number | bigint | string): string {
    return (Number(amount) / 100).toFixed(2)
  }

  // --- Payment Provider Methods ---

  async initiatePayment(
    input: InitiatePaymentInput
  ): Promise<InitiatePaymentOutput> {
    const { amount, currency_code, context, data } = input
    const numAmount = Number(amount)

    const sessionId = (context as any)?.session_id || `${Date.now()}`
    const externalRef = `BIBELO-${sessionId}`

    // Email: context.customer (logged in) > data.payer_email (storefront) > fallback
    const payerEmail =
      (context as any)?.customer?.email ||
      (data as any)?.payer_email ||
      "comprador@testuser.com"

    this.logger_.info(
      `MercadoPago Pix: email=${payerEmail} ref=${externalRef} amount=${this.toMPAmount(numAmount)}`
    )

    const orderBody: MPOrderRequest = {
      type: "online",
      processing_mode: "automatic",
      total_amount: this.toMPAmount(numAmount),
      external_reference: externalRef,
      payer: {
        email: payerEmail,
      },
      transactions: {
        payments: [
          {
            amount: this.toMPAmount(numAmount),
            payment_method: {
              id: "pix",
              type: "bank_transfer",
            },
          },
        ],
      },
    }

    const idempotencyKey = `BIBELO-INIT-${externalRef}`

    const mpOrder = await this.mpRequest<MPOrderResponse>(
      "POST",
      "/v1/orders",
      orderBody as unknown as Record<string, unknown>,
      idempotencyKey
    )

    const pixData =
      mpOrder.transactions?.payments?.[0]?.point_of_interaction
        ?.transaction_data

    this.logger_.info(
      `MercadoPago order criada: ${mpOrder.id} ref=${externalRef}`
    )

    return {
      id: mpOrder.id,
      data: {
        mp_order_id: mpOrder.id,
        external_reference: externalRef,
        qr_code: pixData?.qr_code || null,
        qr_code_base64: pixData?.qr_code_base64 || null,
        ticket_url: pixData?.ticket_url || null,
      },
    }
  }

  async authorizePayment(
    input: AuthorizePaymentInput
  ): Promise<AuthorizePaymentOutput> {
    const { data } = input

    const mpOrderId = data?.mp_order_id as string
    if (!mpOrderId) {
      return { status: "error", data }
    }

    const mpOrder = await this.mpRequest<MPOrderResponse>(
      "GET",
      `/v1/orders/${mpOrderId}`
    )

    const statusMap: Record<string, AuthorizePaymentOutput["status"]> = {
      processed: "authorized",
      open: "pending",
      expired: "error",
      canceled: "canceled",
    }

    return {
      status: statusMap[mpOrder.status] || "pending",
      data: {
        ...data,
        mp_status: mpOrder.status,
      },
    }
  }

  async capturePayment(
    input: CapturePaymentInput
  ): Promise<CapturePaymentOutput> {
    // Pix é captura automática — quando pago, já está capturado
    const { data } = input
    return {
      data: {
        ...data,
        captured_at: new Date().toISOString(),
      },
    }
  }

  async refundPayment(
    input: RefundPaymentInput
  ): Promise<RefundPaymentOutput> {
    const { data, amount } = input
    const paymentId =
      (data?.mp_payment_id as string) || (data?.mp_order_id as string)

    if (!paymentId) {
      throw new Error("MercadoPago: sem ID de pagamento para reembolso")
    }

    const refundBody: Record<string, unknown> = {}
    if (amount) {
      refundBody.amount = Number(this.toMPAmount(Number(amount)))
    }

    const refund = await this.mpRequest<any>(
      "POST",
      `/v1/payments/${paymentId}/refunds`,
      Object.keys(refundBody).length > 0 ? refundBody : undefined
    )

    this.logger_.info(
      `MercadoPago reembolso: payment=${paymentId} refund=${refund.id}`
    )

    return {
      data: {
        ...data,
        refund_id: refund.id,
        refunded_at: new Date().toISOString(),
      },
    }
  }

  async cancelPayment(
    input: CancelPaymentInput
  ): Promise<CancelPaymentOutput> {
    const { data } = input
    return {
      data: {
        ...data,
        canceled_at: new Date().toISOString(),
      },
    }
  }

  async deletePayment(
    input: DeletePaymentInput
  ): Promise<DeletePaymentOutput> {
    return { data: input.data || {} }
  }

  async updatePayment(
    input: UpdatePaymentInput
  ): Promise<UpdatePaymentOutput> {
    const { amount, currency_code, context, data } = input

    if (data?.mp_order_id && amount) {
      return this.initiatePayment({ amount, currency_code, context, data })
    }

    return { data: data || {} }
  }

  async getPaymentStatus(
    input: GetPaymentStatusInput
  ): Promise<GetPaymentStatusOutput> {
    const { data } = input
    const mpOrderId = data?.mp_order_id as string

    if (!mpOrderId) {
      return { status: "pending" }
    }

    const mpOrder = await this.mpRequest<MPOrderResponse>(
      "GET",
      `/v1/orders/${mpOrderId}`
    )

    const statusMap: Record<string, GetPaymentStatusOutput["status"]> = {
      processed: "authorized",
      open: "pending",
      expired: "error",
      canceled: "canceled",
    }

    return {
      status: statusMap[mpOrder.status] || "pending",
    }
  }

  async retrievePayment(
    input: RetrievePaymentInput
  ): Promise<RetrievePaymentOutput> {
    const { data } = input
    const mpOrderId = data?.mp_order_id as string

    if (!mpOrderId) {
      return { data: data || {} }
    }

    const mpOrder = await this.mpRequest<MPOrderResponse>(
      "GET",
      `/v1/orders/${mpOrderId}`
    )

    return {
      data: {
        ...data,
        mp_order: mpOrder as unknown as Record<string, unknown>,
      },
    }
  }

  async getWebhookActionAndData(
    payload: ProviderWebhookPayload["payload"]
  ): Promise<WebhookActionResult> {
    const { data: webhookData, headers } = payload

    // Validar HMAC
    const xSignature = headers["x-signature"] as string
    const xRequestId = headers["x-request-id"] as string
    const dataId =
      (webhookData as any)?.data?.id?.toString() || ""

    if (xSignature && this.webhookSecret_) {
      const isValid = this.validateWebhookSignature(
        xSignature,
        xRequestId,
        dataId,
        this.webhookSecret_
      )
      if (!isValid) {
        this.logger_.error("MercadoPago webhook: assinatura HMAC inválida")
        throw new Error("Assinatura do webhook inválida")
      }
    }

    const type = (webhookData as any)?.type
    const action = (webhookData as any)?.action
    const resourceId = (webhookData as any)?.data?.id?.toString()

    this.logger_.info(
      `MercadoPago webhook: type=${type} action=${action} id=${resourceId}`
    )

    // Consultar o status atual do payment
    if (type === "payment" && resourceId) {
      try {
        const payment = await this.mpRequest<any>(
          "GET",
          `/v1/payments/${resourceId}`
        )

        const sessionId = payment.external_reference || ""

        if (payment.status === "approved") {
          return {
            action: PaymentActions.AUTHORIZED,
            data: {
              session_id: sessionId,
              amount: new BigNumber(payment.transaction_amount * 100),
            },
          }
        }

        if (
          payment.status === "rejected" ||
          payment.status === "cancelled"
        ) {
          return {
            action: PaymentActions.FAILED,
            data: {
              session_id: sessionId,
              amount: new BigNumber(payment.transaction_amount * 100),
            },
          }
        }
      } catch (err) {
        this.logger_.error(
          `MercadoPago webhook: erro ao consultar payment ${resourceId}`
        )
      }
    }

    return {
      action: PaymentActions.NOT_SUPPORTED,
    }
  }

  // --- HMAC Validation (conforme docs/Docs Integracoes bibelo.md) ---

  private validateWebhookSignature(
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

      // timingSafeEqual exige buffers de mesmo tamanho
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
}

export default MercadoPagoProviderService
