"use client"

import { useState, useEffect } from "react"
import { usePathname } from "next/navigation"
import { useStoreSettings } from "@/hooks/useStoreSettings"

const API_BASE = process.env.NEXT_PUBLIC_LEADS_API_URL || "https://webhook.papelariabibelo.com.br"
const POPUP_COOKIE = "_bibelo_popup"
const LEAD_COOKIE = "_bibelo_lead"
const DELAY_SECONDS = 5

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null
  const match = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"))
  return match ? match[2] : null
}

function setCookie(name: string, value: string, days: number) {
  const d = new Date()
  d.setTime(d.getTime() + days * 86400000)
  document.cookie = `${name}=${value};expires=${d.toUTCString()};path=/;SameSite=Lax`
}

function tryGet(k: string) {
  try { return localStorage.getItem(k) } catch { return null }
}
function trySet(k: string, v: string) {
  try { localStorage.setItem(k, v) } catch { /* */ }
}

export default function DiscountPopup() {
  const { settings, loading } = useStoreSettings()
  const pathname = usePathname()
  const [show, setShow] = useState(false)
  const [nome, setNome] = useState("")
  const [email, setEmail] = useState("")
  const [sending, setSending] = useState(false)
  const [done, setDone] = useState(false)
  const [message, setMessage] = useState("")

  // Não mostrar enquanto carrega (evita flash com defaults)
  const popupAtivo = loading ? false : settings.popup_ativo
  const desconto = settings.popup_desconto

  useEffect(() => {
    // Abertura manual via BenefitsStrip (ignora cookie — usuário clicou intencionalmente)
    const handleManualOpen = () => {
      if (settings.popup_ativo) setShow(true)
    }
    window.addEventListener("bibelo:open-popup", handleManualOpen)

    // Abertura automática após delay — não mostrar em páginas de autenticação
    let timer: ReturnType<typeof setTimeout>
    if (popupAtivo && !pathname.startsWith("/conta") &&
        !getCookie(LEAD_COOKIE) && !tryGet(LEAD_COOKIE) &&
        !getCookie(POPUP_COOKIE) && !tryGet(POPUP_COOKIE)) {
      timer = setTimeout(() => setShow(true), DELAY_SECONDS * 1000)
    }

    return () => {
      window.removeEventListener("bibelo:open-popup", handleManualOpen)
      clearTimeout(timer)
    }
  }, [popupAtivo, settings.popup_ativo])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return
    setSending(true)

    try {
      const res = await fetch(`${API_BASE}/api/leads/capture`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          nome: nome.trim() || undefined,
          popup_id: "clube_bibelo",
          pagina: window.location.href,
        }),
      })
      const data = await res.json()

      setDone(true)
      if (data.verificacao === "ja_verificado") {
        setMessage(`Seu desconto de ${desconto}% já está ativo!`)
      } else if (data.verificacao === "cliente_existente") {
        setMessage("Você já faz parte da família Bibelô!")
      } else {
        setMessage(`Verifique seu e-mail para ativar o desconto de ${desconto}%!`)
      }

      setCookie(POPUP_COOKIE, "1", 30)
      setCookie(LEAD_COOKIE, "1", 365)
      trySet(POPUP_COOKIE, "1")
      trySet(LEAD_COOKIE, "1")
    } catch {
      setSending(false)
    }
  }

  const handleClose = () => {
    setShow(false)
    setCookie(POPUP_COOKIE, "1", 30)
    trySet(POPUP_COOKIE, "1")
  }

  // Não renderizar se popup desativado no admin ou ainda carregando
  if (!popupAtivo || !show) return null

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/55 animate-fade-in"
      onClick={handleClose}
    >
      <div
        className="bg-white rounded-3xl max-w-[430px] w-full overflow-hidden shadow-2xl animate-slide-up"
        onClick={(e) => e.stopPropagation()}
        style={{ boxShadow: "0 25px 80px rgba(254,104,196,0.35)" }}
      >
        {/* Header gradiente */}
        <div className="relative bg-gradient-to-br from-bibelo-rosa via-bibelo-amarelo/40 to-bibelo-rosa px-7 pt-8 pb-6 text-center overflow-hidden">
          <div className="absolute -top-8 -right-8 w-24 h-24 bg-bibelo-pink/8 rounded-full" />
          <div className="absolute -bottom-4 -left-4 w-16 h-16 bg-bibelo-pink/6 rounded-full" />

          <button
            onClick={handleClose}
            className="absolute top-3 right-3.5 w-8 h-8 bg-white/80 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors text-lg"
          >
            ×
          </button>

          {/* Badge pulsante */}
          <div className="inline-block bg-gradient-to-r from-bibelo-pink to-pink-500 text-white px-7 py-2.5 rounded-full text-xl font-bold tracking-wide mb-4 shadow-lg animate-pulse">
            {desconto}% OFF
          </div>

          <h2 className="font-heading text-2xl font-bold text-bibelo-dark leading-tight mb-1.5">
            Faça parte do Clube Bibelô!
          </h2>
          <p className="text-gray-500 text-sm leading-relaxed max-w-[340px] mx-auto">
            {desconto}% OFF na 1ª compra · frete grátis · mimo surpresa · novidades em primeira mão
          </p>
        </div>

        {/* Faixa */}
        <div className="bg-gradient-to-r from-bibelo-pink via-pink-500 to-bibelo-pink py-2 text-center">
          <span className="text-white text-[11px] font-semibold tracking-widest uppercase">
            ✨ só pra quem cadastra aqui ✨
          </span>
        </div>

        {/* Form / Sucesso */}
        <div className="px-6 py-5">
          {!done ? (
            <form onSubmit={handleSubmit} className="space-y-2.5">
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-base opacity-50">👤</span>
                <input
                  type="text"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Seu nome"
                  className="w-full pl-11 pr-4 py-3.5 border-2 border-bibelo-rosa rounded-xl text-sm focus:outline-none focus:border-bibelo-pink transition-colors"
                />
              </div>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-base opacity-50">✉️</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Seu melhor e-mail"
                  required
                  className="w-full pl-11 pr-4 py-3.5 border-2 border-bibelo-rosa rounded-xl text-sm focus:outline-none focus:border-bibelo-pink transition-colors"
                />
              </div>
              <button
                type="submit"
                disabled={sending}
                className="w-full py-4 bg-gradient-to-r from-bibelo-pink to-pink-500 text-white rounded-xl text-base font-bold shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all disabled:opacity-60"
              >
                {sending ? "Enviando..." : "Entrar para o Clube 🎀"}
              </button>

              <div className="flex justify-center gap-3 pt-2 text-[11px] text-gray-400">
                <span>🏷️ {desconto}% OFF</span>
                <span>🚚 Frete grátis*</span>
                <span>🎁 Mimo surpresa</span>
              </div>
            </form>
          ) : (
            <div className="text-center py-4">
              <p className="text-4xl mb-3">✉️</p>
              <p className="font-heading text-xl font-semibold text-bibelo-dark mb-2">{message}</p>
              <p className="text-sm text-gray-400 mb-4">Verifique também a pasta de spam.</p>
              <button
                onClick={handleClose}
                className="inline-block bg-gradient-to-r from-bibelo-pink to-pink-500 text-white px-8 py-3 rounded-full text-sm font-semibold"
              >
                Continuar comprando 🛍️
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-2.5 bg-gray-50 border-t border-bibelo-rosa/50 text-center">
          <p className="text-[11px] text-gray-400">
            Papelaria Bibelô · <span className="text-bibelo-pink">papelariabibelo.com.br</span>
          </p>
        </div>
      </div>
    </div>
  )
}
