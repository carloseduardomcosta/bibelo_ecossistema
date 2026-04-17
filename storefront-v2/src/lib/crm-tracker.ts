// ── CRM Tracker — integração bibelo.js no storefront ─────────
// Envia eventos para /api/tracking/event no CRM (webhook.papelariabibelo.com.br)
// Não bloqueia a UI: falhas são silenciosas.

const API_BASE =
  process.env.NEXT_PUBLIC_TRACKING_URL ||
  process.env.NEXT_PUBLIC_LEADS_API_URL ||
  "https://webhook.papelariabibelo.com.br"

const VISITOR_KEY = "_bibelo_vid"
const UTM_KEY = "_bibelo_utms"

// ── Visitor ID — persiste 365 dias em localStorage ────────────
export function getVisitorId(): string {
  if (typeof window === "undefined") return ""
  try {
    let vid = localStorage.getItem(VISITOR_KEY)
    if (!vid) {
      vid = `sv2_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
      localStorage.setItem(VISITOR_KEY, vid)
    }
    return vid
  } catch {
    return `sv2_${Date.now()}`
  }
}

// ── UTMs — capturar da URL atual e persistir por sessão ────────
interface UTMs {
  utm_source?: string
  utm_medium?: string
  utm_campaign?: string
  utm_content?: string
  utm_term?: string
}

function captureUtms(): UTMs {
  if (typeof window === "undefined") return {}
  try {
    const p = new URLSearchParams(window.location.search)
    const utms: UTMs = {}
    if (p.get("utm_source")) utms.utm_source = p.get("utm_source")!
    if (p.get("utm_medium")) utms.utm_medium = p.get("utm_medium")!
    if (p.get("utm_campaign")) utms.utm_campaign = p.get("utm_campaign")!
    if (p.get("utm_content")) utms.utm_content = p.get("utm_content")!
    if (p.get("utm_term")) utms.utm_term = p.get("utm_term")!

    if (Object.keys(utms).length > 0) {
      sessionStorage.setItem(UTM_KEY, JSON.stringify(utms))
      return utms
    }

    const saved = sessionStorage.getItem(UTM_KEY)
    return saved ? JSON.parse(saved) : {}
  } catch {
    return {}
  }
}

// ── Evento genérico ────────────────────────────────────────────
type EventType =
  | "page_view"
  | "product_view"
  | "category_view"
  | "add_to_cart"
  | "search"
  | "checkout_start"

type PageTipo = "home" | "product" | "category" | "cart" | "checkout" | "search" | "other"

interface TrackPayload {
  evento: EventType
  pagina?: string
  pagina_tipo?: PageTipo
  resource_id?: string
  resource_nome?: string
  resource_preco?: number
  resource_imagem?: string
  referrer?: string
  metadata?: Record<string, unknown>
}

function sendEvent(payload: TrackPayload): void {
  if (typeof window === "undefined") return
  const vid = getVisitorId()
  if (!vid) return

  const utms = captureUtms()
  const body = JSON.stringify({
    visitor_id: vid,
    ...payload,
    pagina: payload.pagina || window.location.href,
    referrer: payload.referrer || document.referrer || undefined,
    fonte: "homolog_storefront",
    ...utms,
  })

  // sendBeacon: não bloqueia, funciona mesmo ao navegar para outra página
  if (navigator.sendBeacon) {
    const blob = new Blob([body], { type: "application/json" })
    navigator.sendBeacon(`${API_BASE}/api/tracking/event`, blob)
  } else {
    fetch(`${API_BASE}/api/tracking/event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {})
  }
}

// ── API pública ────────────────────────────────────────────────

export function trackPageView(pageTipo: PageTipo = "other"): void {
  sendEvent({ evento: "page_view", pagina_tipo: pageTipo })
}

export function trackProductView(params: {
  productId: string
  productName: string
  price?: number
  imageUrl?: string
}): void {
  sendEvent({
    evento: "product_view",
    pagina_tipo: "product",
    resource_id: params.productId,
    resource_nome: params.productName,
    resource_preco: params.price,
    resource_imagem: params.imageUrl,
  })
}

export function trackAddToCart(params: {
  productId: string
  productName: string
  price?: number
}): void {
  sendEvent({
    evento: "add_to_cart",
    pagina_tipo: "product",
    resource_id: params.productId,
    resource_nome: params.productName,
    resource_preco: params.price,
  })
}

export function trackCheckoutStart(): void {
  sendEvent({ evento: "checkout_start", pagina_tipo: "checkout" })
}

export function trackSearch(query: string): void {
  sendEvent({
    evento: "search",
    pagina_tipo: "search",
    resource_nome: query,
  })
}

export function trackCategoryView(categoryName: string): void {
  sendEvent({
    evento: "category_view",
    pagina_tipo: "category",
    resource_nome: categoryName,
  })
}

// ── Cart abandonment — reportar carrinho com email identificado ─
// Envia uma vez por cartId para o CRM criar o registro de pedido pendente.
// O CRM cuidará do disparo de recuperação após 2h sem pagamento.
export function reportCartAbandonment(params: {
  email: string
  cartId: string
  items: Array<{ nome: string; preco: number }>
  recoveryUrl?: string
}): void {
  if (typeof window === "undefined") return
  if (!params.email || !params.cartId || params.items.length === 0) return

  const API_CART =
    process.env.NEXT_PUBLIC_TRACKING_URL ||
    process.env.NEXT_PUBLIC_LEADS_API_URL ||
    "https://webhook.papelariabibelo.com.br"

  fetch(`${API_CART}/api/public/cart-storefront`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: params.email,
      cart_id: params.cartId,
      items: params.items,
      recovery_url: params.recoveryUrl || `${window.location.origin}/carrinho`,
    }),
    keepalive: true,
  }).catch(() => {})
}

// ── Identify — vincular visitor ao customer logado ────────────
export function identifyCustomer(email: string): void {
  if (typeof window === "undefined") return
  const vid = getVisitorId()
  if (!vid || !email) return

  fetch(`${API_BASE}/api/tracking/identify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ visitor_id: vid, email }),
    keepalive: true,
  }).catch(() => {})
}
