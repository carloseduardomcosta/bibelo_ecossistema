/**
 * Melhor Envio Fulfillment Provider — Papelaria Bibelô
 * Cálculo de frete via API Melhor Envio
 * Token OAuth2 armazenado no CRM (sync.sync_state)
 */

import { AbstractFulfillmentProviderService } from "@medusajs/framework/utils"
import type { Logger } from "@medusajs/framework/types"
import type {
  CalculateShippingOptionPriceDTO,
  CalculatedShippingOptionPrice,
  CreateFulfillmentResult,
  CreateShippingOptionDTO,
  FulfillmentDTO,
  FulfillmentItemDTO,
  FulfillmentOption,
  FulfillmentOrderDTO,
  ValidateFulfillmentDataContext,
} from "@medusajs/framework/types"

const ME_BASE = "https://melhorenvio.com.br/api/v2"
const USER_AGENT = "BibeloEcommerce (carloseduardocostatj@gmail.com)"
const CRM_URL = process.env.CRM_INTERNAL_URL || "http://bibelo_api:4000"

interface MelhorEnvioOptions {
  storeOriginCep: string
}

type InjectedDependencies = {
  logger: Logger
}

let cachedToken: string | null = null
let tokenFetchedAt = 0

class MelhorEnvioProviderService extends AbstractFulfillmentProviderService {
  static identifier = "melhorenvio"

  private logger_: Logger
  private originCep_: string

  constructor(container: InjectedDependencies, options: MelhorEnvioOptions) {
    super()
    this.logger_ = container.logger
    this.originCep_ = options?.storeOriginCep || "89093880"
  }

  // ── Token (busca do CRM via API interna) ────────────────────

  private async getToken(): Promise<string> {
    // Cache de 10 minutos
    if (cachedToken && Date.now() - tokenFetchedAt < 10 * 60 * 1000) {
      return cachedToken
    }

    try {
      const res = await fetch(`${CRM_URL}/api/internal/melhorenvio-token`)
      if (!res.ok) {
        throw new Error(`CRM retornou ${res.status}`)
      }
      const data = (await res.json()) as { access_token: string }
      cachedToken = data.access_token
      tokenFetchedAt = Date.now()
      return cachedToken
    } catch (err: any) {
      this.logger_.error(`MelhorEnvio: erro ao obter token do CRM: ${err.message}`)
      throw new Error("Token Melhor Envio indisponível")
    }
  }

  // ── API Helper ──────────────────────────────────────────────

  private async meRequest<T>(
    method: string,
    path: string,
    body?: Record<string, unknown>
  ): Promise<T> {
    const token = await this.getToken()
    const startTime = Date.now()

    const res = await fetch(`${ME_BASE}${path}`, {
      method,
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": USER_AGENT,
      },
      body: body ? JSON.stringify(body) : undefined,
    })

    const elapsed = Date.now() - startTime
    this.logger_.info(`MelhorEnvio ${method} ${path} — ${res.status} (${elapsed}ms)`)

    if (!res.ok) {
      const errText = await res.text()
      this.logger_.error(`MelhorEnvio erro ${res.status}: ${errText}`)
      throw new Error(`MelhorEnvio API ${res.status}: ${errText}`)
    }

    return res.json() as Promise<T>
  }

  // ── Fulfillment Provider Methods ────────────────────────────

  async getFulfillmentOptions(): Promise<FulfillmentOption[]> {
    return [
      { id: "pac", name: "PAC (Correios)" },
      { id: "sedex", name: "SEDEX (Correios)" },
      { id: "mini", name: "Mini Envios (Correios)" },
    ]
  }

  async validateFulfillmentData(
    optionData: Record<string, unknown>,
    data: Record<string, unknown>,
    _context: ValidateFulfillmentDataContext
  ): Promise<any> {
    return { ...optionData, ...data }
  }

  async validateOption(_data: Record<string, unknown>): Promise<boolean> {
    return true
  }

  async canCalculate(_data: CreateShippingOptionDTO): Promise<boolean> {
    return true
  }

  async calculatePrice(
    optionData: CalculateShippingOptionPriceDTO["optionData"],
    data: CalculateShippingOptionPriceDTO["data"],
    context: CalculateShippingOptionPriceDTO["context"]
  ): Promise<CalculatedShippingOptionPrice> {
    const postalCode =
      (context as any)?.shipping_address?.postal_code ||
      (data as any)?.postal_code ||
      ""

    if (!postalCode) {
      this.logger_.warn("MelhorEnvio calculatePrice: CEP destino ausente")
      return { calculated_amount: 0, is_calculated_price_tax_inclusive: true }
    }

    // Peso e dimensões padrão (será ajustado quando tivermos dados do produto)
    const weight = (data as any)?.weight || 0.5
    const height = (data as any)?.height || 10
    const width = (data as any)?.width || 15
    const length = (data as any)?.length || 20

    try {
      const rates = await this.meRequest<any[]>(
        "POST",
        "/me/shipment/calculate",
        {
          from: { postal_code: this.originCep_ },
          to: { postal_code: postalCode.replace(/\D/g, "") },
          package: { height, width, length, weight },
        }
      )

      // Mapear service_id do optionData para encontrar a transportadora
      const serviceId = (optionData as any)?.id || "pac"

      const serviceMap: Record<string, string[]> = {
        pac: ["PAC"],
        sedex: ["SEDEX"],
        mini: ["Mini Envios"],
      }

      const matchNames = serviceMap[serviceId] || [serviceId]
      const rate = rates.find(
        (r: any) => !r.error && matchNames.some((n) => r.name?.includes(n))
      )

      if (!rate) {
        this.logger_.warn(
          `MelhorEnvio: sem cotação para ${serviceId} CEP ${postalCode}`
        )
        return { calculated_amount: 0, is_calculated_price_tax_inclusive: true }
      }

      const priceInCents = Math.round(parseFloat(rate.price) * 100)
      this.logger_.info(
        `MelhorEnvio frete: ${rate.name} ${postalCode} = R$ ${rate.price} (${rate.delivery_time}d)`
      )

      return {
        calculated_amount: priceInCents,
        is_calculated_price_tax_inclusive: true,
      }
    } catch (err: any) {
      this.logger_.error(`MelhorEnvio calculatePrice erro: ${err.message}`)
      return { calculated_amount: 0, is_calculated_price_tax_inclusive: true }
    }
  }

  async createFulfillment(
    data: Record<string, unknown>,
    items: Partial<Omit<FulfillmentItemDTO, "fulfillment">>[],
    order: Partial<FulfillmentOrderDTO> | undefined,
    fulfillment: Partial<Omit<FulfillmentDTO, "provider_id" | "data" | "items">>
  ): Promise<CreateFulfillmentResult> {
    // Fase futura: criar etiqueta no Melhor Envio (cart + checkout + generate)
    this.logger_.info(
      `MelhorEnvio createFulfillment: ${items.length} itens, order=${(order as any)?.id || "?"}`
    )
    return {
      data: {
        ...data,
        me_status: "pending_label",
      },
      labels: [],
    }
  }

  async cancelFulfillment(data: Record<string, unknown>): Promise<any> {
    this.logger_.info(`MelhorEnvio cancelFulfillment: ${JSON.stringify(data)}`)
    return data
  }

  async getFulfillmentDocuments(_data: Record<string, unknown>): Promise<never[]> {
    return []
  }

  async createReturnFulfillment(
    fulfillment: Record<string, unknown>
  ): Promise<CreateFulfillmentResult> {
    return { data: fulfillment, labels: [] }
  }

  async getReturnDocuments(_data: Record<string, unknown>): Promise<never[]> {
    return []
  }

  async getShipmentDocuments(_data: Record<string, unknown>): Promise<never[]> {
    return []
  }

  async retrieveDocuments(
    _fulfillmentData: Record<string, unknown>,
    _documentType: string
  ): Promise<void> {
    return
  }
}

export default MelhorEnvioProviderService
