/**
 * Custom route override para /store/shipping-options
 *
 * Workaround para bug do Medusa v2.13.5 onde o remote query retorna array vazio
 * para shipping_options mesmo com dados corretos no banco.
 *
 * Solução:
 * 1. Usa IFulfillmentModuleService.listShippingOptions() diretamente
 * 2. Calcula preços via CRM → Melhor Envio quando o cart tem CEP
 * 3. Repassa delivery_time no campo data para o storefront exibir prazo
 */
import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules, ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { IFulfillmentModuleService } from "@medusajs/framework/types"

const CRM_URL = process.env.CRM_INTERNAL_URL || "http://bibelo_api:4000"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const cart_id = (req.query?.cart_id as string) || ""

  if (!cart_id) {
    res.status(400).json({ message: "cart_id é obrigatório" })
    return
  }

  try {
    const container = req.scope

    // 1. Listar shipping options via módulo de fulfillment
    const fulfillmentModule = container.resolve<IFulfillmentModuleService>(
      Modules.FULFILLMENT
    )
    const shippingOptions = await fulfillmentModule.listShippingOptions(
      {},
      { take: 100 }
    )

    if (shippingOptions.length === 0) {
      res.json({ shipping_options: [] })
      return
    }

    // 2. Buscar CEP do cart via query graph
    let postalCode = ""
    try {
      const query = container.resolve(ContainerRegistrationKeys.QUERY)
      const { data: carts } = await query.graph({
        entity: "cart",
        filters: { id: cart_id },
        fields: ["id", "shipping_address.postal_code"],
      })
      postalCode = (carts[0]?.shipping_address?.postal_code || "").replace(/\D/g, "")
    } catch {
      // CEP indisponível — retorna opções sem preço calculado
    }

    // 3. Calcular preços via CRM se tiver CEP
    const freteMap = new Map<string, { price: number; delivery_days: number }>()

    if (postalCode.length === 8) {
      try {
        const freteRes = await fetch(`${CRM_URL}/api/public/frete?cep=${postalCode}`, {
          signal: AbortSignal.timeout(8000),
        })
        if (freteRes.ok) {
          const freteData = (await freteRes.json()) as {
            options: Array<{ id: string; price: number; delivery_days: number }>
          }
          for (const opt of freteData.options ?? []) {
            freteMap.set(opt.id, { price: opt.price, delivery_days: opt.delivery_days })
          }
        }
      } catch {
        // Falha silenciosa — retorna opções sem preço
      }
    }

    // 4. Montar resposta com preços e prazo
    const formatted = shippingOptions.map((opt: any) => {
      const serviceId: string = ((opt.data as any)?.id || "").toLowerCase()
      const freteInfo = freteMap.get(serviceId)

      return {
        id: opt.id,
        name: opt.name,
        provider_id: opt.provider_id,
        service_zone_id: opt.service_zone_id,
        price_type: opt.price_type || "calculated",
        amount: freteInfo?.price ?? null,
        data: {
          ...(opt.data || {}),
          delivery_time: freteInfo?.delivery_days ?? null,
        },
        is_return: opt.is_return || false,
        metadata: opt.metadata || null,
      }
    })

    res.json({ shipping_options: formatted })
  } catch (err: any) {
    res.status(500).json({ message: err.message })
  }
}
