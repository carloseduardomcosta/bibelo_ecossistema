"use client"

import { useEffect, useRef } from "react"
import { usePathname } from "next/navigation"
import { trackPageView, identifyCustomer } from "@/lib/crm-tracker"
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

export default function CrmTracker() {
  const pathname = usePathname()
  const { customer } = useAuthStore()
  const identifiedRef = useRef<string | null>(null)

  // Disparar page_view a cada mudança de rota
  useEffect(() => {
    const tipo = getPageTipo(pathname)
    trackPageView(tipo)
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
