"use client"

import { Suspense, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useAuthStore } from "@/store/auth"

function CallbackHandler() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { setToken, loadCustomer } = useAuthStore()
  const [error, setError] = useState("")

  useEffect(() => {
    const token = searchParams.get("token") || searchParams.get("access_token")

    if (token) {
      setToken(token)
      // Limpa token da URL (não deve ficar no histórico/logs)
      window.history.replaceState({}, "", "/conta/callback")
      loadCustomer().then(() => {
        router.replace("/conta")
      })
    } else {
      // Não exibir mensagem da URL (vetor de phishing)
      const err = searchParams.get("error")
      if (err) console.warn("[Auth] callback error:", err)
      setError("Erro na autenticação. Tente novamente.")
      setTimeout(() => router.replace("/conta"), 3000)
    }
  }, [searchParams, setToken, loadCustomer, router])

  if (error) {
    return (
      <div className="content-container py-16 text-center">
        <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
        </div>
        <p className="text-gray-700 font-medium">{error}</p>
        <p className="text-sm text-gray-500 mt-2">Redirecionando...</p>
      </div>
    )
  }

  return (
    <div className="content-container py-16 text-center">
      <div className="w-8 h-8 border-2 border-bibelo-pink border-t-transparent rounded-full animate-spin mx-auto" />
      <p className="text-sm text-gray-500 mt-4">Entrando na sua conta...</p>
    </div>
  )
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={
      <div className="content-container py-16 text-center">
        <div className="w-8 h-8 border-2 border-bibelo-pink border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-sm text-gray-500 mt-4">Processando login...</p>
      </div>
    }>
      <CallbackHandler />
    </Suspense>
  )
}
