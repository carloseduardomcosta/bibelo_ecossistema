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
    const workflow = listShippingOptionsForCartWorkflow(req.scope)
    const { result: shipping_options } = await workflow.run({
      input: { cart_id, is_return: !!is_return },
    })

    console.info(
      `[ShippingOptions Override] Retornando ${shipping_options?.length ?? 0} opções para cart ${cart_id}`
    )

    res.json({ shipping_options })
  } catch (err: any) {
    console.error(`[ShippingOptions Override] Erro: ${err.message}`)
    res.status(500).json({ message: err.message })
  }
}
