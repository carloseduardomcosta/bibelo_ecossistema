"use client"

import { useState, useEffect, Suspense } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { updatePassword } from "@/lib/medusa/auth"

function NovaSenhaForm() {
  const searchParams = useSearchParams()
  const token = searchParams.get("token")

  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!token) {
      setError("Link inválido ou expirado. Solicite um novo link de recuperação.")
    }
  }, [token])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token) return
    if (newPassword !== confirmPassword) {
      setError("As senhas não coincidem")
      return
    }
    if (newPassword.length < 8) {
      setError("A senha deve ter pelo menos 8 caracteres")
      return
    }
    setError("")
    setSubmitting(true)
    try {
      await updatePassword(token, newPassword)
      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao alterar senha. O link pode ter expirado.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="content-container py-8 max-w-md mx-auto">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <div className="mb-5">
          <h1 className="text-lg font-bold text-bibelo-dark">Nova senha</h1>
          <p className="text-xs text-gray-500 mt-0.5">Escolha uma senha segura para sua conta</p>
        </div>

        {done ? (
          <div className="text-center py-4">
            <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="font-semibold text-gray-800 mb-2">Senha alterada!</h2>
            <p className="text-sm text-gray-500 mb-5">
              Sua senha foi atualizada com sucesso. Faça login com a nova senha.
            </p>
            <Link href="/conta" className="btn-primary inline-block text-sm">
              Ir para o login
            </Link>
          </div>
        ) : !token ? (
          <div className="text-center py-4">
            <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
            <h2 className="font-semibold text-gray-800 mb-2">Link inválido</h2>
            <p className="text-sm text-gray-500 mb-5">
              Este link de recuperação é inválido ou já expirou.
            </p>
            <Link href="/conta/recuperar-senha" className="btn-primary inline-block text-sm">
              Solicitar novo link
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Nova senha</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Mínimo 8 caracteres"
                className="input-base"
                minLength={8}
                required
                autoFocus
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Confirmar nova senha</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repita a nova senha"
                className="input-base"
                minLength={8}
                required
              />
            </div>

            {error && (
              <p className="text-sm text-red-500">{error}</p>
            )}

            <button
              type="submit"
              disabled={submitting || !token}
              className="btn-primary w-full py-3 text-sm disabled:opacity-50"
            >
              {submitting ? "Salvando..." : "Definir nova senha"}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

export default function NovaSenhaPage() {
  return (
    <Suspense fallback={
      <div className="content-container py-16 text-center">
        <div className="w-8 h-8 border-2 border-bibelo-pink border-t-transparent rounded-full animate-spin mx-auto" />
      </div>
    }>
      <NovaSenhaForm />
    </Suspense>
  )
}
