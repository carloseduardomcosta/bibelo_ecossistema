"use client"

import { useState } from "react"
import Link from "next/link"

// ══════════════════════════════════════════════════════════════
// Barra promocional no topo do site
// Para ativar: mude ENABLED para true e configure a mensagem
// ══════════════════════════════════════════════════════════════

const ENABLED = false

const PROMO = {
  text: "🎉 Semana de Ofertas! Até 30% OFF em papelaria fina",
  link: "/produtos?sort=price_asc",
  cta: "Ver ofertas →",
}

export default function PromoBanner() {
  const [dismissed, setDismissed] = useState(false)

  if (!ENABLED || dismissed) return null

  return (
    <div className="bg-gradient-to-r from-bibelo-pink to-pink-500 text-white text-center relative">
      <div className="content-container py-2 flex items-center justify-center gap-2 text-sm">
        <span className="font-medium">{PROMO.text}</span>
        {PROMO.link && (
          <Link href={PROMO.link} className="font-bold underline underline-offset-2 hover:no-underline">
            {PROMO.cta}
          </Link>
        )}
        <button
          onClick={() => setDismissed(true)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-white/70 hover:text-white transition-colors"
          aria-label="Fechar"
        >
          ✕
        </button>
      </div>
    </div>
  )
}
