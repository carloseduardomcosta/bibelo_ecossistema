import medusa from "./client"

const DEFAULT_REGION = process.env.NEXT_PUBLIC_DEFAULT_REGION || "br"

// Criar carrinho
export async function createCart() {
  try {
    const { cart } = await medusa.store.cart.create({
      region_id: DEFAULT_REGION,
    })
    return cart
  } catch (error) {
    console.error("[Medusa] createCart error:", error)
    return null
  }
}

// Buscar carrinho por ID
export async function getCart(cartId: string) {
  try {
    const { cart } = await medusa.store.cart.retrieve(cartId)
    return cart
  } catch (error) {
    console.error("[Medusa] getCart error:", error)
    return null
  }
}

// Adicionar item ao carrinho
export async function addToCart({
  cartId,
  variantId,
  quantity = 1,
}: {
  cartId: string
  variantId: string
  quantity?: number
}) {
  try {
    const { cart } = await medusa.store.cart.createLineItem(cartId, {
      variant_id: variantId,
      quantity,
    })
    return cart
  } catch (error) {
    console.error("[Medusa] addToCart error:", error)
    return null
  }
}

// Atualizar quantidade de item
export async function updateCartItem({
  cartId,
  lineItemId,
  quantity,
}: {
  cartId: string
  lineItemId: string
  quantity: number
}) {
  try {
    const { cart } = await medusa.store.cart.updateLineItem(cartId, lineItemId, {
      quantity,
    })
    return cart
  } catch (error) {
    console.error("[Medusa] updateCartItem error:", error)
    return null
  }
}

// Remover item do carrinho
export async function removeCartItem({
  cartId,
  lineItemId,
}: {
  cartId: string
  lineItemId: string
}) {
  try {
    await medusa.store.cart.deleteLineItem(cartId, lineItemId)
    return true
  } catch (error) {
    console.error("[Medusa] removeCartItem error:", error)
    return false
  }
}

// Aplicar cupom
export async function applyCoupon({
  cartId,
  code,
}: {
  cartId: string
  code: string
}) {
  try {
    const { cart } = await medusa.store.cart.update(cartId, {
      promo_codes: [code],
    })
    return { cart, error: null }
  } catch (error) {
    console.error("[Medusa] applyCoupon error:", error)
    return { cart: null, error: "Cupom inválido ou expirado" }
  }
}
