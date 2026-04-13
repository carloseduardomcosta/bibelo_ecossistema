// ── Meta Pixel — helpers client-side ──────────────────────────
// Wrapper seguro sobre fbq() — evita erros se o script ainda não carregou.

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void
  }
}

function fbq(...args: unknown[]): void {
  if (typeof window !== "undefined" && typeof window.fbq === "function") {
    window.fbq(...args)
  }
}

export function trackAddToCart(params: {
  contentId: string
  contentName: string
  value: number
  currency?: string
}): void {
  fbq("track", "AddToCart", {
    content_ids: [params.contentId],
    content_name: params.contentName,
    content_type: "product",
    value: params.value / 100, // Medusa armazena em centavos
    currency: params.currency ?? "BRL",
  })
}

export function trackInitiateCheckout(params: {
  value: number
  numItems: number
  currency?: string
}): void {
  fbq("track", "InitiateCheckout", {
    value: params.value / 100,
    num_items: params.numItems,
    currency: params.currency ?? "BRL",
  })
}

export function trackPurchase(params: {
  orderId: string
  value: number
  numItems: number
  currency?: string
}): void {
  fbq("track", "Purchase", {
    order_id: params.orderId,
    value: params.value / 100,
    num_items: params.numItems,
    currency: params.currency ?? "BRL",
    content_type: "product",
  })
}
