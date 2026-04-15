/**
 * Custom route override para /store/shipping-options
 *
 * Workaround para bug do Medusa v2 (issue #14787) onde o endpoint built-in
 * retorna array vazio porque o validateAndTransformQuery é registrado duas
 * vezes no Express stack, fazendo o cart_id ser perdido antes do handler.
 *
 * Solução: chamar o listShippingOptionsForCartWorkflow diretamente.
 */
import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { listShippingOptionsForCartWorkflow } from "@medusajs/medusa/core-flows"
import { Modules } from "@medusajs/framework/utils"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const cart_id =
    (req.filterableFields as any)?.cart_id ||
    (req.query?.cart_id as string) ||
    ""

  const is_return =
    (req.filterableFields as any)?.is_return || req.query?.is_return

  console.info(
    `[ShippingOptions Override] cart_id="${cart_id}" is_return="${is_return}"`
  )

  if (!cart_id) {
    res.status(400).json({ message: "cart_id é obrigatório" })
    return
  }

  try {
    // Diagnóstico: buscar o carrinho diretamente para confirmar que existe
    const cartModule = req.scope.resolve(Modules.CART)
    const cart = await cartModule.retrieveCart(cart_id, {
      relations: ["shipping_address"],
    }).catch((e: any) => null)

    if (!cart) {
      console.warn(`[ShippingOptions Override] Carrinho ${cart_id} não encontrado!`)
      res.json({ shipping_options: [] })
      return
    }

    console.info(
      `[ShippingOptions Override] Carrinho encontrado | region_id=${cart.region_id} | country=${(cart as any).shipping_address?.country_code} | postal=${(cart as any).shipping_address?.postal_code}`
    )

    // Diagnóstico: buscar shipping options direto do módulo de fulfillment
    const fulfillmentModule = req.scope.resolve(Modules.FULFILLMENT)
    const allOptions = await (fulfillmentModule as any).listShippingOptions({}).catch((e: any) => {
      console.warn(`[ShippingOptions Override] Erro ao listar options direto: ${e.message}`)
      return []
    })
    console.info(`[ShippingOptions Override] Total de shipping options no módulo: ${allOptions?.length ?? 0}`)
    if (allOptions?.length > 0) {
      allOptions.forEach((o: any) => {
        console.info(`  -> ${o.id} | ${o.name} | ${o.price_type} | zone=${o.service_zone_id}`)
      })
    }

    // Executar o workflow
    const workflow = listShippingOptionsForCartWorkflow(req.scope)
    const { result: shipping_options } = await workflow.run({
      input: { cart_id, is_return: !!is_return },
    })

    console.info(
      `[ShippingOptions Override] Workflow retornou ${shipping_options?.length ?? 0} opções`
    )

    res.json({ shipping_options })
  } catch (err: any) {
    console.error(`[ShippingOptions Override] Erro: ${err.message}`)
    console.error(err.stack)
    res.status(500).json({ message: err.message })
  }
}
