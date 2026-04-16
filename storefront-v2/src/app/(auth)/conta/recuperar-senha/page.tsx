"use client"

import { useState } from "react"
import Link from "next/link"
import { requestPasswordReset } from "@/lib/medusa/auth"

export default function RecuperarSenhaPage() {
  const [email, setEmail] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setSubmitting(true)
    try {
      await requestPasswordReset(email.trim().toLowerCase())
      setSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="content-container py-8 max-w-md mx-auto">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <Link href="/conta" className="p-2 rounded-full hover:bg-gray-100 transition-colors">
            <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </Link>
          <div>
            <h1 className="text-lg font-bold text-bibelo-dark">Recuperar senha</h1>
            <p className="text-xs text-gray-500">Enviaremos um link para seu e-mail</p>
          </div>
        </div>

        {sent ? (
          <div className="text-center py-4">
            <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
              </svg>
            </div>
            <h2 className="font-semibold text-gray-800 mb-2">Verifique seu e-mail</h2>
            <p className="text-sm text-gray-500 mb-5">
              Se <strong>{email}</strong> estiver cadastrado, você receberá um link de recuperação em breve.
            </p>
            <p className="text-xs text-gray-400 mb-5">Não recebeu? Verifique a pasta de spam.</p>
            <Link href="/conta" className="btn-primary inline-block text-sm">
              Voltar ao login
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Seu e-mail cadastrado</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                className="input-base"
                required
                autoFocus
              />
            </div>

            {error && (
              <p className="text-sm text-red-500">{error}</p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="btn-primary w-full py-3 text-sm disabled:opacity-50"
            >
              {submitting ? "Enviando..." : "Enviar link de recuperação"}
            </button>

            <p className="text-center text-sm text-gray-500 pt-1">
              Lembrou a senha?{" "}
              <Link href="/conta" className="text-bibelo-pink font-semibold hover:underline">
                Voltar ao login
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
