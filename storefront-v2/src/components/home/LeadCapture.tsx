"use client"

import { useState } from "react"

const API_BASE = process.env.NEXT_PUBLIC_LEADS_API_URL || "https://webhook.papelariabibelo.com.br"

export default function LeadCapture() {
  const [nome, setNome] = useState("")
  const [email, setEmail] = useState("")
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !email.includes("@")) return

    setStatus("loading")
    try {
      const res = await fetch(`${API_BASE}/api/leads/capture`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: nome.trim(),
          email: email.trim().toLowerCase(),
          popup_id: "homepage_lead_capture",
          source: "storefront-v2",
        }),
      })

      if (res.ok || res.status === 409) {
        setStatus("success")
        setNome("")
        setEmail("")
      } else {
        setStatus("error")
      }
    } catch {
      setStatus("error")
    }
  }

  return (
    <section className="py-10 md:py-14">
      <div className="content-container">
        <div className="bg-gradient-to-br from-bibelo-rosa via-white to-bibelo-yellow/30 rounded-3xl px-6 py-8 md:px-12 md:py-10 text-center">
          <p className="text-bibelo-pink text-xs font-semibold uppercase tracking-widest mb-2">
            Ofertas exclusivas
          </p>
          <h2 className="text-2xl md:text-3xl font-bold text-bibelo-dark mb-2" style={{ fontFamily: "var(--font-heading)" }}>
            Entre para o Clube Bibelô
          </h2>
          <p className="text-sm text-gray-600 mb-6 max-w-md mx-auto">
            Receba novidades, promoções e cupons de desconto direto no seu e-mail.
          </p>

          {status === "success" ? (
            <div className="flex items-center justify-center gap-2 bg-green-50 text-green-700 rounded-full px-6 py-3 max-w-sm mx-auto">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              <span className="font-medium text-sm">Cadastrado! Confira seu e-mail.</span>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
              <input
                type="text"
                placeholder="Seu nome"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                className="flex-1 px-4 py-3 rounded-full text-sm text-gray-800 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-bibelo-pink/30 focus:border-bibelo-pink"
              />
              <input
                type="email"
                placeholder="Seu melhor e-mail"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="flex-1 px-4 py-3 rounded-full text-sm text-gray-800 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-bibelo-pink/30 focus:border-bibelo-pink"
              />
              <button
                type="submit"
                disabled={status === "loading"}
                className="bg-bibelo-pink text-white font-bold px-6 py-3 rounded-full hover:bg-bibelo-pink/90 active:scale-95 transition-all whitespace-nowrap text-sm disabled:opacity-50"
              >
                {status === "loading" ? "Enviando..." : status === "error" ? "Tentar de novo" : "Quero entrar!"}
              </button>
            </form>
          )}
        </div>
      </div>
    </section>
  )
}
