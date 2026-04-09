import medusa from "./client"

const DEFAULT_REGION = process.env.NEXT_PUBLIC_DEFAULT_REGION_ID || "reg_01KN52HV0TQAY4ZC1PEYWAQSY2"

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

// ── Checkout functions ────────────────────────────────────────

const BACKEND_URL =
  process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9001"
const PUBLIC_MEDUSA_URL =
  process.env.NEXT_PUBLIC_MEDUSA_PUBLIC_URL || "https://homolog.papelariabibelo.com.br/api"
const PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY || ""

// Atualizar endereço do carrinho
export async function updateCartAddress(
  cartId: string,
  data: {
    email: string
    shipping_address: {
      first_name: string
      last_name: string
      address_1: string
      address_2?: string
      city: string
      province: string
      postal_code: string
      country_code: string
      phone?: string
    }
  }
) {
  try {
    const { cart } = await medusa.store.cart.update(cartId, {
      email: data.email,
      shipping_address: data.shipping_address,
      billing_address: data.shipping_address,
    } as Parameters<typeof medusa.store.cart.update>[1])
    return cart
  } catch (error) {
    console.error("[Medusa] updateCartAddress error:", error)
    return null
  }
}

// Listar opções de frete para o carrinho
export async function getShippingOptions(cartId: string) {
  try {
    const res = await fetch(
      `${PUBLIC_MEDUSA_URL}/store/shipping-options?cart_id=${cartId}`,
      {
        headers: { "x-publishable-api-key": PUBLISHABLE_KEY },
      }
    )
    if (!res.ok) return []
    const data = await res.json()
    return data.shipping_options || []
  } catch (error) {
    console.error("[Medusa] getShippingOptions error:", error)
    return []
  }
}

// Selecionar método de frete
export async function addShippingMethod(cartId: string, optionId: string) {
  try {
    const res = await fetch(
      `${PUBLIC_MEDUSA_URL}/store/carts/${cartId}/shipping-methods`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-publishable-api-key": PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ option_id: optionId }),
      }
    )
    if (!res.ok) return null
    const data = await res.json()
    return data.cart
  } catch (error) {
    console.error("[Medusa] addShippingMethod error:", error)
    return null
  }
}

// Iniciar sessão de pagamento
export async function initiatePaymentSession(cartId: string, providerId: string) {
  try {
    const res = await fetch(
      `${PUBLIC_MEDUSA_URL}/store/carts/${cartId}/payment-sessions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-publishable-api-key": PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ provider_id: providerId }),
      }
    )
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}))
      throw new Error(errData.message || `Erro ${res.status}`)
    }
    const data = await res.json()
    return data.payment_session || data
  } catch (error) {
    console.error("[Medusa] initiatePaymentSession error:", error)
    return null
  }
}

// Completar o carrinho (criar pedido)
export async function completeCart(cartId: string) {
  try {
    const res = await fetch(
      `${PUBLIC_MEDUSA_URL}/store/carts/${cartId}/complete`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-publishable-api-key": PUBLISHABLE_KEY,
        },
      }
    )
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}))
      throw new Error(errData.message || `Erro ${res.status}`)
    }
    const data = await res.json()
    return data
  } catch (error) {
    console.error("[Medusa] completeCart error:", error)
    throw error
  }
}
