"use client"

import { useState } from "react"

const NewsletterSection = () => {
  const [email, setEmail] = useState("")
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return
    setStatus("loading")
    // Simulação — integrar com Klaviyo/Mailchimp futuramente
    await new Promise((r) => setTimeout(r, 800))
    setStatus("success")
    setEmail("")
  }

  return (
    <section className="w-full bg-bibelo-dark py-16">
      <div className="content-container">
        <div className="max-w-2xl mx-auto text-center">
          {/* Eyebrow */}
          <p className="text-xs uppercase tracking-[0.2em] text-bibelo-pink font-semibold mb-3">
            Fique por dentro
          </p>
          {/* Heading */}
          <h2 className="font-heading text-3xl small:text-4xl font-semibold text-white mb-3">
            Novidades, promoções e{" "}
            <span className="text-bibelo-pink italic">inspirações</span>
          </h2>
          <p className="text-white/60 text-sm small:text-base mb-8">
            Cadastre seu e-mail e receba em primeira mão as novidades da Papelaria Bibelô.
            Sem spam, prometemos!
          </p>

          {status === "success" ? (
            <div className="flex items-center justify-center gap-3 bg-white/10 rounded-2xl px-8 py-5">
              <svg className="w-6 h-6 text-[#25D366]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-white font-medium">
                Obrigada! Você está na nossa lista. 🎉
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col xsmall:flex-row gap-3 max-w-md mx-auto">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com.br"
                required
                className="flex-1 px-5 py-3.5 rounded-full bg-white/10 border border-white/20 text-white placeholder:text-white/40 text-sm outline-none focus:border-bibelo-pink focus:bg-white/15 transition-all"
              />
              <button
                type="submit"
                disabled={status === "loading"}
                className="px-7 py-3.5 bg-bibelo-pink hover:bg-[#e050a8] text-white font-semibold rounded-full transition-all duration-200 text-sm whitespace-nowrap disabled:opacity-60 disabled:cursor-not-allowed shadow-md hover:shadow-lg"
              >
                {status === "loading" ? (
                  <span className="flex items-center gap-2">
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Enviando...
                  </span>
                ) : (
                  "Quero receber"
                )}
              </button>
            </form>
          )}

          {/* Trust badges */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-6">
            {[
              { icon: "🔒", text: "Dados protegidos" },
              { icon: "📧", text: "Sem spam" },
              { icon: "🎁", text: "Conteúdo exclusivo" },
            ].map((badge) => (
              <div key={badge.text} className="flex items-center gap-1.5 text-white/40 text-xs">
                <span>{badge.icon}</span>
                <span>{badge.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

export default NewsletterSection
