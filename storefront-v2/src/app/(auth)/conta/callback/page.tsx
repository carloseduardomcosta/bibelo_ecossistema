"use client"

import { Suspense, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useAuthStore } from "@/store/auth"

const RETURN_URL_KEY = "bibelo-auth-returnUrl"

function getSafeReturnUrl(raw: string | null): string | null {
  if (!raw) return null
  if (raw.startsWith("/") && !raw.startsWith("//")) return raw
  return null
}

function CallbackHandler() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { setToken, loadCustomer } = useAuthStore()
  const [error, setError] = useState("")

  useEffect(() => {
    const token = searchParams.get("token") || searchParams.get("access_token")

    if (token) {
      setToken(token)
      window.history.replaceState({}, "", "/conta/callback")

      // Recupera returnUrl salvo antes do redirect Google
      let destination = "/conta"
      try {
        const saved = sessionStorage.getItem(RETURN_URL_KEY)
        sessionStorage.removeItem(RETURN_URL_KEY)
        const safe = getSafeReturnUrl(saved)
        if (safe) destination = safe
      } catch {}

      loadCustomer().then(() => {
        router.replace(destination)
      })
    } else {
      const err = searchParams.get("error")
      if (err) console.warn("[Auth] callback error:", err)
      setError("Erro na autenticação. Tente novamente.")
      setTimeout(() => router.replace("/conta"), 3000)
    }
  }, [searchParams, setToken, loadCustomer, router])

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
          </div>
          <p className="text-gray-700 font-medium">{error}</p>
          <p className="text-sm text-gray-500 mt-2">Redirecionando...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-bibelo-pink border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-sm text-gray-500 mt-4">Entrando na sua conta...</p>
      </div>
    </div>
  )
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-bibelo-pink border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-gray-500 mt-4">Processando login...</p>
        </div>
      </div>
    }>
      <CallbackHandler />
    </Suspense>
  )
}
