"use client"

import { useState } from "react"

const PUBLIC_MEDUSA_URL =
  process.env.NEXT_PUBLIC_MEDUSA_PUBLIC_URL || "https://homolog.papelariabibelo.com.br/api"

export default function NewsletterForm() {
  const [email, setEmail] = useState("")
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !email.includes("@")) return

    setStatus("loading")
    try {
      // Tentar capturar como lead no CRM
      const res = await fetch(`${PUBLIC_MEDUSA_URL}/../api/leads/capture`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          nome: "",
          popup_id: "newsletter_footer",
          source: "storefront-v2",
        }),
      })

      if (res.ok || res.status === 409) {
        // 409 = já cadastrado, tudo bem
        setStatus("success")
        setEmail("")
      } else {
        setStatus("error")
      }
    } catch {
      setStatus("error")
    }
  }

  if (status === "success") {
    return (
      <div className="flex items-center gap-2 bg-white/20 rounded-full px-6 py-3">
        <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
        <span className="text-white font-medium text-sm">Cadastrado! Confira seu e-mail.</span>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 w-full md:w-auto">
      <input
        type="email"
        placeholder="Seu melhor e-mail"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        className="flex-1 md:w-72 px-4 py-2.5 rounded-full text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-white"
      />
      <button
        type="submit"
        disabled={status === "loading"}
        className="bg-white text-bibelo-pink font-bold px-6 py-2.5 rounded-full hover:bg-bibelo-yellow transition-colors whitespace-nowrap text-sm disabled:opacity-50"
      >
        {status === "loading" ? "Enviando..." : status === "error" ? "Tentar de novo" : "Quero desconto!"}
      </button>
    </form>
  )
}
