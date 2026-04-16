"use client"

import { useEffect } from "react"
import { useRouter, usePathname } from "next/navigation"
import { useAuthStore } from "@/store/auth"

export function useRequireAuth() {
  const { token, loading } = useAuthStore()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    // Aguarda a hidratação do store antes de redirecionar
    if (!loading && token === null) {
      router.replace(`/conta?returnUrl=${encodeURIComponent(pathname)}`)
    }
  }, [token, loading, router, pathname])

  return { isAuthorized: !!token, isLoading: loading }
}
