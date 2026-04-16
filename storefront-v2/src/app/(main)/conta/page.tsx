"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import Image from "next/image"
import { useAuthStore } from "@/store/auth"
import { loginWithEmail, registerWithEmail, startGoogleLogin, getTokenMetadata } from "@/lib/medusa/auth"

export default function ContaPage() {
  const { token, customer, loading, setToken, loadCustomer, logout } = useAuthStore()
  const [mode, setMode] = useState<"login" | "register">("login")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [name, setName] = useState("")
  const [error, setError] = useState("")
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (token && !customer) {
      loadCustomer()
    }
  }, [token, customer, loadCustomer])

  // Se logado, mostra perfil
  if (token && customer) {
    const meta = getTokenMetadata(token)
    const picture = meta.picture as string | undefined
    const displayName = customer.first_name
      ? `${customer.first_name}${customer.last_name ? ` ${customer.last_name}` : ""}`
      : "Minha Conta"

    return (
      <div className="content-container py-8 max-w-lg mx-auto">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          {/* Avatar */}
          <div className="flex flex-col items-center mb-6">
            {picture ? (
              <img
                src={picture}
                alt={displayName}
                className="w-20 h-20 rounded-full border-3 border-bibelo-pink/30 mb-3 object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-20 h-20 bg-bibelo-pink/10 rounded-full flex items-center justify-center mb-3">
                <span className="text-3xl font-bold text-bibelo-pink">
                  {(customer.first_name || customer.email)?.[0]?.toUpperCase() || "?"}
                </span>
              </div>
            )}
            <h1 className="text-xl font-bold text-bibelo-dark">{displayName}</h1>
            <p className="text-sm text-gray-500">{customer.email}</p>
          </div>

          {/* Menu */}
          <div className="space-y-2 mb-6">
            <Link
              href="/conta/perfil"
              className="flex items-center justify-between p-3 rounded-xl bg-gray-50 hover:bg-bibelo-pink/5 transition-colors group"
            >
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5 text-bibelo-pink" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                </svg>
                <span className="font-medium text-sm text-gray-700">Meu Perfil</span>
              </div>
              <svg className="w-4 h-4 text-gray-400 group-hover:text-bibelo-pink" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </Link>

            <Link
              href="/conta/pedidos"
              className="flex items-center justify-between p-3 rounded-xl bg-gray-50 hover:bg-bibelo-pink/5 transition-colors group"
            >
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5 text-bibelo-pink" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
                </svg>
                <span className="font-medium text-sm text-gray-700">Meus Pedidos</span>
              </div>
              <svg className="w-4 h-4 text-gray-400 group-hover:text-bibelo-pink" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </Link>

            <Link
              href="/conta/enderecos"
              className="flex items-center justify-between p-3 rounded-xl bg-gray-50 hover:bg-bibelo-pink/5 transition-colors group"
            >
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5 text-bibelo-pink" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                </svg>
                <span className="font-medium text-sm text-gray-700">Meus Endereços</span>
              </div>
              <svg className="w-4 h-4 text-gray-400 group-hover:text-bibelo-pink" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </Link>

            <a
              href="https://wa.me/5547933862514?text=Olá! Preciso de ajuda com minha conta."
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between p-3 rounded-xl bg-gray-50 hover:bg-green-50 transition-colors group"
            >
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
                </svg>
                <span className="font-medium text-sm text-gray-700">Atendimento WhatsApp</span>
              </div>
              <svg className="w-4 h-4 text-gray-400 group-hover:text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </a>
          </div>

          {/* Sair */}
          <button
            onClick={logout}
            className="w-full py-2.5 text-sm font-semibold text-gray-500 hover:text-red-500 border border-gray-200 rounded-full hover:border-red-200 transition-colors"
          >
            Sair da conta
          </button>
        </div>
      </div>
    )
  }

  // Loading
  if (loading) {
    return (
      <div className="content-container py-16 text-center">
        <div className="w-8 h-8 border-2 border-bibelo-pink border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-sm text-gray-500 mt-4">Carregando...</p>
      </div>
    )
  }

  // ── Login/registro: full-screen sem distrações ────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setSubmitting(true)

    try {
      let result
      if (mode === "login") {
        result = await loginWithEmail(email, password)
      } else {
        result = await registerWithEmail(email, password)
      }
      if (result.token) {
        setToken(result.token)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro inesperado")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    /* Overlay full-screen — cobre header e footer, mantém o foco no login */
    <div className="fixed inset-0 z-[200] bg-[#FAF7F2] overflow-y-auto flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Link discreto de volta */}
        <Link
          href="/"
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-bibelo-pink
                     transition-colors mb-6 w-fit mx-auto"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
          Voltar à loja
        </Link>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        {/* Logo */}
        <div className="text-center mb-6">
          <Image
            src="/logo-bibelo.png"
            alt="Papelaria Bibelô"
            width={72}
            height={72}
            className="w-18 h-18 rounded-full mx-auto mb-3 border-2 border-bibelo-pink/20"
          />
          <h1 className="text-xl font-bold text-bibelo-dark">
            {mode === "login" ? "Entrar na sua conta" : "Criar sua conta"}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {mode === "login"
              ? "Acesse seus pedidos e dados"
              : "Cadastre-se para uma experiência personalizada"}
          </p>
        </div>

        {/* Botão Google */}
        <button
          onClick={() => {
            setError("")
            setSubmitting(true)
            startGoogleLogin().catch((err) => {
              setError(err instanceof Error ? err.message : "Erro ao conectar com Google")
              setSubmitting(false)
            })
          }}
          disabled={submitting}
          className="flex items-center justify-center gap-3 w-full py-3 px-4 rounded-full border-2 border-gray-200
                     hover:border-bibelo-pink/40 hover:bg-gray-50 transition-colors font-medium text-sm text-gray-700
                     disabled:opacity-50"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
          </svg>
          {submitting ? "Conectando..." : "Continuar com Google"}
        </button>

        {/* Divisor */}
        <div className="flex items-center gap-3 my-5">
          <div className="flex-1 h-px bg-gray-200" />
          <span className="text-xs text-gray-400 font-medium">ou</span>
          <div className="flex-1 h-px bg-gray-200" />
        </div>

        {/* Formulário email/senha */}
        <form onSubmit={handleSubmit} className="space-y-3">
          {mode === "register" && (
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Seu nome completo"
              className="input-base"
              required
            />
          )}
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Seu e-mail"
            className="input-base"
            required
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Sua senha"
            className="input-base"
            required
            minLength={6}
          />
          {mode === "login" && (
            <div className="text-right -mt-1">
              <Link href="/conta/recuperar-senha" className="text-xs text-bibelo-pink hover:underline">
                Esqueceu a senha?
              </Link>
            </div>
          )}

          {error && (
            <p className="text-sm text-red-500 text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="btn-primary w-full py-3 text-sm disabled:opacity-50"
          >
            {submitting
              ? "Aguarde..."
              : mode === "login"
                ? "Entrar"
                : "Criar conta"}
          </button>
        </form>

        {/* Toggle login/register */}
        <p className="text-center text-sm text-gray-500 mt-5">
          {mode === "login" ? (
            <>
              Não tem conta?{" "}
              <button
                onClick={() => { setMode("register"); setError("") }}
                className="text-bibelo-pink font-semibold hover:underline"
              >
                Cadastre-se
              </button>
            </>
          ) : (
            <>
              Já tem conta?{" "}
              <button
                onClick={() => { setMode("login"); setError("") }}
                className="text-bibelo-pink font-semibold hover:underline"
              >
                Entrar
              </button>
            </>
          )}
        </p>
      </div>
      </div>
    </div>
  )
}
