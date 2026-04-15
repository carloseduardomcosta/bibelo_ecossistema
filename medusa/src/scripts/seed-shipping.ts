/**
 * Script para criar as shipping options do Melhor Envio via módulos internos do Medusa.
 * 
 * Uso: docker exec bibelo_medusa npx medusa exec src/scripts/seed-shipping.ts
 * 
 * Este script usa os módulos internos do Medusa para garantir que o cache
 * em memória seja populado corretamente (inserção direta no banco não funciona).
 */
import { ExecArgs } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"

export default async function seedShipping({ container }: ExecArgs) {
  console.log("=== Seed Shipping Options ===")

  const fulfillmentModule = container.resolve(Modules.FULFILLMENT)

  // IDs fixos do ambiente
  const SERVICE_ZONE_ID = "serzo_01KN53E0MMFQ5DWHJ1JA4W79VJ"
  const SHIPPING_PROFILE_ID = "sp_01KN4HG10PJT3PKQM0QYDQV9HS"
  const PROVIDER_ID = "melhorenvio_melhorenvio"

  // Verificar se já existem opções
  const existing = await (fulfillmentModule as any).listShippingOptions({
    service_zone_id: SERVICE_ZONE_ID,
  })
  console.log(`Opções existentes: ${existing?.length ?? 0}`)

  if (existing?.length >= 2) {
    console.log("Shipping options já existem. Nada a fazer.")
    return
  }

  // Deletar opções existentes se houver parcialmente
  if (existing?.length > 0) {
    for (const opt of existing) {
      await (fulfillmentModule as any).deleteShippingOptions([opt.id])
      console.log(`Deletada opção: ${opt.name} (${opt.id})`)
    }
  }

  // Criar PAC
  const pac = await (fulfillmentModule as any).createShippingOptions([
    {
      name: "PAC (Correios)",
      service_zone_id: SERVICE_ZONE_ID,
      shipping_profile_id: SHIPPING_PROFILE_ID,
      provider_id: PROVIDER_ID,
      price_type: "calculated",
      type: {
        label: "PAC",
        description: "Entrega pelos Correios",
        code: "pac",
      },
      rules: [],
      prices: [],
    },
  ])
  console.log(`PAC criado: ${pac?.[0]?.id}`)

  // Criar SEDEX
  const sedex = await (fulfillmentModule as any).createShippingOptions([
    {
      name: "SEDEX (Correios)",
      service_zone_id: SERVICE_ZONE_ID,
      shipping_profile_id: SHIPPING_PROFILE_ID,
      provider_id: PROVIDER_ID,
      price_type: "calculated",
      type: {
        label: "SEDEX",
        description: "Entrega expressa pelos Correios",
        code: "sedex",
      },
      rules: [],
      prices: [],
    },
  ])
  console.log(`SEDEX criado: ${sedex?.[0]?.id}`)

  // Verificar resultado
  const final = await (fulfillmentModule as any).listShippingOptions({
    service_zone_id: SERVICE_ZONE_ID,
  })
  console.log(`\nTotal de opções criadas: ${final?.length ?? 0}`)
  final?.forEach((o: any) => {
    console.log(`  -> ${o.id} | ${o.name} | ${o.price_type} | provider=${o.provider_id}`)
  })

  console.log("=== Seed concluído ===")
}
