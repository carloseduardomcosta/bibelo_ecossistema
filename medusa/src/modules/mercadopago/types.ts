/**
 * Tipos para o módulo Mercado Pago — Papelaria Bibelô
 * API Orders (Checkout Transparente 2025)
 */

export interface MercadoPagoOptions {
  accessToken: string
  webhookSecret: string
  sandbox: boolean
}

// --- API Orders ---

export interface MPOrderRequest {
  type: "online"
  processing_mode: "automatic"
  total_amount: string
  external_reference: string
  payer: {
    email: string
    identification?: {
      type: "CPF" | "CNPJ"
      number: string
    }
  }
  transactions: {
    payments: MPPaymentTransaction[]
  }
}

export interface MPPaymentTransaction {
  amount: string
  payment_method: {
    id: "pix"
    type: "bank_transfer"
  }
}

export interface MPOrderResponse {
  id: string
  status: "open" | "processed" | "expired" | "canceled"
  status_detail: string
  external_reference: string
  total_amount: string
  transactions: {
    payments: MPPaymentDetail[]
  }
}

export interface MPPaymentDetail {
  id: string
  status: string
  status_detail: string
  amount: string
  payment_method: {
    id: string
    type: string
  }
  point_of_interaction?: {
    transaction_data?: {
      qr_code?: string
      qr_code_base64?: string
      ticket_url?: string
    }
  }
}

// --- Webhook ---

export interface MPWebhookPayload {
  action: string
  api_version: string
  data: { id: string }
  date_created: string
  id: number
  live_mode: boolean
  type: string
  user_id: string
}
