/**
 * Retirada na Loja — Papelaria Bibelô
 * Fulfillment provider para retirada presencial
 * Endereço: R. Mal. Floriano Peixoto, 941 — Timbó/SC
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

type InjectedDependencies = {
  logger: Logger
}

class RetiradaProviderService extends AbstractFulfillmentProviderService {
  static identifier = "retirada"

  private logger_: Logger

  constructor(container: InjectedDependencies) {
    super()
    this.logger_ = container.logger
  }

  async getFulfillmentOptions(): Promise<FulfillmentOption[]> {
    return [
      {
        id: "retirada-loja",
        name: "Retirar na loja — Timbó/SC",
      },
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
    _optionData: CalculateShippingOptionPriceDTO["optionData"],
    _data: CalculateShippingOptionPriceDTO["data"],
    _context: CalculateShippingOptionPriceDTO["context"]
  ): Promise<CalculatedShippingOptionPrice> {
    // Retirada na loja = frete grátis
    return {
      calculated_amount: 0,
      is_calculated_price_tax_inclusive: true,
    }
  }

  async createFulfillment(
    data: Record<string, unknown>,
    items: Partial<Omit<FulfillmentItemDTO, "fulfillment">>[],
    order: Partial<FulfillmentOrderDTO> | undefined,
    _fulfillment: Partial<Omit<FulfillmentDTO, "provider_id" | "data" | "items">>
  ): Promise<CreateFulfillmentResult> {
    this.logger_.info(
      `Retirada na loja: ${items.length} itens, order=${(order as any)?.id || "?"}`
    )
    return {
      data: {
        ...data,
        retirada_status: "aguardando_retirada",
        retirada_endereco: "R. Mal. Floriano Peixoto, 941 — Padre Martinho Stein — Timbó/SC",
        retirada_horario: "Seg-Sex 9h-18h | Sáb 9h-13h",
      },
      labels: [],
    }
  }

  async cancelFulfillment(data: Record<string, unknown>): Promise<any> {
    this.logger_.info(`Retirada cancelada: ${JSON.stringify(data)}`)
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

export default RetiradaProviderService
