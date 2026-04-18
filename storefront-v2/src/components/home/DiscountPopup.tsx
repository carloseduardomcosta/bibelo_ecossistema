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
    if (popupAtivo && !pathname.startsWith("/conta") && !pathname.startsWith("/checkout") &&
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
          fonte: "homolog_storefront",
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
                {sending ? "Enviando..." : <span className="flex items-center justify-center gap-2">Entrar para o Clube <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg></span>}
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
