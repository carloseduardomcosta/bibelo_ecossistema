/**
 * Melhor Envio — Geração automática de etiqueta
 * Fluxo: cart → checkout → generate → print
 *
 * Chamado pelo CRM após pedido ser criado no Bling
 */

import axios from "axios"
import { query, queryOne } from "../../db"
import { logger } from "../../utils/logger"

const ME_BASE = "https://melhorenvio.com.br/api/v2"
const USER_AGENT = "BibeloEcommerce (carloseduardocostatj@gmail.com)"

// Dados da loja (origem)
const STORE_FROM = {
  name: process.env.STORE_NOME || "Papelaria Bibelô",
  phone: process.env.STORE_TELEFONE || "47933862514",
  email: process.env.STORE_EMAIL || "contato@papelariabibelo.com.br",
  document: process.env.STORE_CPF || "09316446902",
  company_document: process.env.STORE_CNPJ || "63961764000163",
  postal_code: process.env.STORE_CEP || "89093880",
  address: "R. Mal. Floriano Peixoto",
  number: "941",
  district: "Padre Martinho Stein",
  city: "Timbó",
  state_abbr: "SC",
  country_id: "BR",
}

interface OrderForShipping {
  numero: string
  email: string
  total: number // em centavos
  items: Array<{
    title: string
    sku: string
    quantity: number
    unit_price: number // em centavos
    weight?: number // em kg
  }>
  shipping_address: {
    first_name: string
    last_name: string
    address_1: string
    city: string
    province: string
    postal_code: string
    phone?: string
  }
  shipping_service?: string // "pac" | "sedex"
}

interface ShippingResult {
  me_cart_id: string
  me_status: string
  label_url?: string
  tracking_code?: string
}

// ── Token ─────────────────────────────────────────────────────

async function getMeToken(): Promise<string> {
  const row = await queryOne<{ ultimo_id: string }>(
    "SELECT ultimo_id FROM sync.sync_state WHERE fonte = 'melhorenvio'"
  )
  if (!row?.ultimo_id) {
    throw new Error("Token Melhor Envio não encontrado no banco")
  }
  const data = JSON.parse(row.ultimo_id)
  return data.access_token
}

// ── Retry com backoff exponencial ────────────────────────────

async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelayMs = 1000
): Promise<T> {
  let lastError: unknown
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err
      if (attempt === maxRetries) break
      const delay = baseDelayMs * 2 ** (attempt - 1) // 1s, 2s, 4s
      logger.warn(`MelhorEnvio tentativa ${attempt}/${maxRetries} falhou — aguardando ${delay}ms`, {
        error: err instanceof Error ? err.message : String(err),
      })
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }
  throw lastError
}

// ── API Helper ────────────────────────────────────────────────

async function meRequest<T>(
  method: string,
  path: string,
  token: string,
  body?: Record<string, unknown>
): Promise<T> {
  const startTime = Date.now()

  const res = await axios({
    method,
    url: `${ME_BASE}${path}`,
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "Accept": "application/json",
      "User-Agent": USER_AGENT,
    },
    data: body,
    timeout: 10000,
  })

  const elapsed = Date.now() - startTime
  logger.info(`MelhorEnvio ${method.toUpperCase()} ${path} — ${res.status} (${elapsed}ms)`)

  return res.data as T
}

// ── Service IDs ───────────────────────────────────────────────

const SERVICE_MAP: Record<string, number> = {
  pac: 1,
  sedex: 2,
  mini: 17,
}

// ── Fluxo completo de etiqueta ────────────────────────────────

export async function createShippingLabel(
  order: OrderForShipping
): Promise<ShippingResult> {
  const token = await getMeToken()
  const addr = order.shipping_address
  const serviceId = SERVICE_MAP[order.shipping_service || "pac"] || 1

  // Calcular peso total
  const totalWeight = order.items.reduce(
    (sum, item) => sum + (item.weight || 0.3) * item.quantity,
    0
  )
  const weight = Math.max(totalWeight, 0.3)

  // Valor total para seguro
  const insuranceValue = order.total / 100

  logger.info(
    `MelhorEnvio etiqueta: ${order.numero} → ${addr.postal_code} service=${order.shipping_service || "pac"}`
  )

  // 1. Adicionar ao carrinho do ME
  const cartBody: Record<string, unknown> = {
    service: serviceId,
    agency: null,
    from: STORE_FROM,
    to: {
      name: [addr.first_name, addr.last_name].filter(Boolean).join(" "),
      phone: addr.phone || "",
      email: order.email,
      postal_code: addr.postal_code.replace(/\D/g, ""),
      address: addr.address_1,
      number: "",
      district: "",
      city: addr.city,
      state_abbr: addr.province,
      country_id: "BR",
    },
    products: order.items.map((item) => ({
      name: item.title,
      quantity: item.quantity,
      unitary_value: item.unit_price / 100,
      weight: item.weight || 0.3,
    })),
    volumes: [
      {
        height: 10,
        width: 15,
        length: 20,
        weight,
      },
    ],
    options: {
      insurance_value: insuranceValue,
      receipt: false,
      own_hand: false,
      reverse: false,
      non_commercial: false,
    },
  }

  const cartRes = await withRetry(() =>
    meRequest<{ id?: string }>("post", "/me/cart", token, cartBody)
  )

  const meCartId = cartRes.id
  if (!meCartId) {
    throw new Error(`MelhorEnvio: cart sem ID retornado: ${JSON.stringify(cartRes)}`)
  }

  logger.info(`MelhorEnvio cart criado: ${meCartId}`)

  // 2. Checkout (comprar etiqueta — debita saldo ME)
  const checkoutRes = await withRetry(() =>
    meRequest<unknown>("post", "/me/cart/checkout", token, { orders: [meCartId] })
  )

  logger.info(`MelhorEnvio checkout: ${JSON.stringify(checkoutRes).substring(0, 200)}`)

  // 3. Gerar etiqueta
  const generateRes = await withRetry(() =>
    meRequest<unknown>("post", "/me/shipment/generate", token, { orders: [meCartId] })
  )

  logger.info(`MelhorEnvio generate: ${JSON.stringify(generateRes).substring(0, 200)}`)

  // 4. Imprimir (obter URL do PDF)
  const printRes = await withRetry(() =>
    meRequest<{ url?: string }>("post", "/me/shipment/print", token, { mode: "private", orders: [meCartId] })
  )

  const labelUrl = printRes?.url ?? undefined
  logger.info(`MelhorEnvio etiqueta pronta: ${order.numero} label=${labelUrl}`)

  // Salvar no banco
  await query(
    `INSERT INTO sync.sync_logs (fonte, tipo, status, registros, erro)
     VALUES ('melhorenvio', 'etiqueta', 'ok', 1, $1)`,
    [`${order.numero} cart=${meCartId} label=${labelUrl}`]
  )

  return {
    me_cart_id: meCartId,
    me_status: "label_generated",
    label_url: labelUrl,
  }
}
