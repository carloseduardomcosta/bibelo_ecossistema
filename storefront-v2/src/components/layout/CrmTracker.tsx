"use client"

import { useEffect, useRef } from "react"
import { usePathname } from "next/navigation"
import { trackPageView, trackProductView, identifyCustomer } from "@/lib/crm-tracker"
import { useAuthStore } from "@/store/auth"

// Mapa de rota → tipo de página
function getPageTipo(pathname: string) {
  if (pathname === "/") return "home"
  if (pathname.startsWith("/produto/")) return "product"
  if (pathname.startsWith("/categoria/") || pathname.startsWith("/produtos")) return "category"
  if (pathname === "/carrinho") return "cart"
  if (pathname.startsWith("/checkout")) return "checkout"
  if (pathname.startsWith("/busca")) return "search"
  return "other"
}

// Lê meta tags OG/produto para extrair nome e preço
function readProductMeta(): { name: string; price?: number; imageUrl?: string } | null {
  if (typeof document === "undefined") return null
  const title =
    document.querySelector<HTMLMetaElement>('meta[property="og:title"]')?.content ||
    document.title ||
    ""
  // Remove sufixo " | Papelaria Bibelô" se presente
  const name = title.replace(/\s*\|\s*Papelaria Bibelô\s*$/i, "").trim()
  if (!name) return null

  const priceStr =
    document.querySelector<HTMLMetaElement>('meta[property="product:price:amount"]')?.content ||
    document.querySelector<HTMLMetaElement>('meta[property="og:price:amount"]')?.content
  const price = priceStr ? parseFloat(priceStr) : undefined

  const imageUrl =
    document.querySelector<HTMLMetaElement>('meta[property="og:image"]')?.content || undefined

  return { name, price: price && !isNaN(price) ? price : undefined, imageUrl }
}

export default function CrmTracker() {
  const pathname = usePathname()
  const { customer } = useAuthStore()
  const identifiedRef = useRef<string | null>(null)
  // Rastreia quais rotas já receberam product_view nesta sessão de navegação
  const productViewedRef = useRef<Set<string>>(new Set())

  // Disparar page_view a cada mudança de rota
  useEffect(() => {
    const tipo = getPageTipo(pathname)
    trackPageView(tipo)
  }, [pathname])

  // Disparar product_view em páginas de produto (uma vez por pathname)
  useEffect(() => {
    if (!pathname.startsWith("/produto/")) return
    if (productViewedRef.current.has(pathname)) return

    // Aguarda o DOM estar renderizado com as meta tags (RSC já populou no HTML)
    const handle = pathname.replace("/produto/", "").split("?")[0]

    const fire = () => {
      const meta = readProductMeta()
      if (!meta) return
      productViewedRef.current.add(pathname)
      trackProductView({
        productId: handle,
        productName: meta.name,
        price: meta.price,
        imageUrl: meta.imageUrl,
      })
    }

    // Meta tags já estão no HTML (SSR), disparar na próxima microtask
    const t = setTimeout(fire, 0)
    return () => clearTimeout(t)
  }, [pathname])

  // Identify uma vez por sessão quando customer loga
  useEffect(() => {
    if (customer?.email && identifiedRef.current !== customer.email) {
      identifiedRef.current = customer.email
      identifyCustomer(customer.email)
    }
  }, [customer?.email])

  return null
}
