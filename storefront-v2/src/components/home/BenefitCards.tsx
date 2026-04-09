"use client"

import { useState } from "react"
import Link from "next/link"

/**
 * BenefitCards — faixa de quadradinhos informativos com ícones
 * Visível apenas no mobile (md:hidden), desce logo após o HeroCarousel.
 * Textos e ordem idênticos ao site PROD papelariabibelo.com.br.
 *
 * Scroll lateral automático com velocidade lenta (pausa ao toque).
 */

const CARDS = [
  {
    // Ícone: caminhão de entrega (Heroicons outline)
    icon: "M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12",
    title: "Frete Grátis",
    subtitle: "Leia a Política de Frete AQUI",
    bg: "bg-white",
    color: "text-bibelo-pink",
    href: "/politica-de-frete",
  },
  {
    // Ícone: cartão de crédito (Heroicons outline)
    icon: "M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z",
    title: "Pagamento facilitado",
    subtitle: "Vários meios de pagamento",
    bg: "bg-white",
    color: "text-bibelo-pink",
    href: null,
  },
  {
    // Ícone: porcentagem / tag de desconto (Heroicons outline)
    icon: "M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z M6 6h.008v.008H6V6z",
    title: "Promoção de 1ª compra",
    subtitle: "CUPOM clicando AQUI",
    bg: "bg-white",
    color: "text-bibelo-pink",
    href: "https://papelariabibelo.com.br/cupom-primeira-compra",
  },
  {
    // Ícone: WhatsApp (path SVG customizado)
    icon: "M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.832-1.438A9.955 9.955 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2zm0 18a7.946 7.946 0 01-4.073-1.117l-.292-.174-3.024.899.899-3.024-.174-.292A7.946 7.946 0 014 12c0-4.411 3.589-8 8-8s8 3.589 8 8-3.589 8-8 8zm4.406-5.845c-.242-.121-1.432-.707-1.654-.787-.222-.08-.384-.121-.545.121-.161.242-.626.787-.767.949-.141.161-.282.181-.524.06-.242-.121-1.022-.377-1.946-1.2-.719-.641-1.204-1.433-1.345-1.675-.141-.242-.015-.373.106-.493.109-.109.242-.282.363-.424.121-.141.161-.242.242-.403.08-.161.04-.302-.02-.424-.06-.121-.545-1.313-.747-1.797-.197-.473-.397-.409-.545-.416-.141-.007-.302-.009-.463-.009-.161 0-.424.06-.646.302-.222.242-.848.828-.848 2.02s.868 2.343.989 2.504c.121.161 1.709 2.609 4.141 3.658.579.25 1.031.399 1.383.511.581.185 1.11.159 1.528.097.466-.069 1.432-.585 1.634-1.151.202-.566.202-1.051.141-1.151-.06-.1-.222-.161-.464-.282z",
    title: "Clube VIP no WhatsApp",
    subtitle: "Entre para o Clube Bibelô",
    bg: "bg-white",
    color: "text-bibelo-pink",
    href: "https://boasvindas.papelariabibelo.com.br/api/links/grupo-vip",
  },
]

function Card({ card }: { card: typeof CARDS[number] }) {
  const content = (
    <div
      className={`
        flex items-center gap-3 px-4 py-3.5
        ${card.bg} rounded-xl
        min-w-[170px] max-w-[200px]
        border border-gray-200
        shadow-sm
      `}
    >
      {/* Ícone circular com borda */}
      <div className="w-10 h-10 rounded-full border border-gray-300 bg-white flex items-center justify-center shrink-0">
        <svg
          className={`w-5 h-5 ${card.color}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d={card.icon} />
        </svg>
      </div>

      {/* Textos */}
      <div className="min-w-0">
        <p className="font-bold text-[12px] text-bibelo-dark leading-tight whitespace-nowrap">
          {card.title}
        </p>
        <p className="text-[10px] text-gray-500 leading-tight whitespace-nowrap">
          {card.subtitle}
        </p>
      </div>
    </div>
  )

  if (card.href) {
    const isExternal = card.href.startsWith("http")
    return isExternal ? (
      <a href={card.href} target="_blank" rel="noreferrer" className="shrink-0 active:opacity-70 transition-opacity">
        {content}
      </a>
    ) : (
      <Link href={card.href} className="shrink-0 active:opacity-70 transition-opacity">
        {content}
      </Link>
    )
  }

  return <div className="shrink-0">{content}</div>
}

export default function BenefitCards() {
  const [paused, setPaused] = useState(false)

  // Duplica para loop infinito perfeito
  const doubled = [...CARDS, ...CARDS]

  // Velocidade lenta: 6s por card (4 cards = 24s por ciclo completo)
  const duration = CARDS.length * 6

  return (
    <div
      className="md:hidden overflow-hidden py-2.5 bg-gray-50 select-none border-b border-gray-100"
      onTouchStart={() => setPaused(true)}
      onTouchEnd={() => setPaused(false)}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      aria-label="Diferenciais da Papelaria Bibelô"
    >
      <div
        className="flex gap-2.5 pl-3"
        style={{
          animation: `bibelo-cards-scroll ${duration}s linear infinite`,
          animationPlayState: paused ? "paused" : "running",
          width: "max-content",
        }}
      >
        {doubled.map((card, idx) => (
          <Card key={idx} card={card} />
        ))}
      </div>

      {/* Keyframe — compatível com Next.js App Router */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @keyframes bibelo-cards-scroll {
              0%   { transform: translateX(0); }
              100% { transform: translateX(-50%); }
            }
          `,
        }}
      />
    </div>
  )
}
