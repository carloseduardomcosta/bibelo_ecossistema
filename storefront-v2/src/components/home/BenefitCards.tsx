"use client"

import { useState } from "react"
import Link from "next/link"

const CARDS = [
  {
    icon: "M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12",
    title: "Frete Grátis",
    subtitle: "Sul e Sudeste",
    bg: "bg-pink-50",
    color: "text-bibelo-pink",
    href: "/politica-de-frete",
  },
  {
    icon: "M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z",
    title: "Pix e Cartão",
    subtitle: "Até 12x",
    bg: "bg-yellow-50",
    color: "text-amber-500",
    href: null,
  },
  {
    icon: "M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.562.562 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z",
    title: "Clube VIP",
    subtitle: "Ofertas exclusivas",
    bg: "bg-pink-50",
    color: "text-bibelo-pink",
    href: "https://boasvindas.papelariabibelo.com.br/api/links/grupo-vip",
  },
  {
    icon: "M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z",
    title: "Compra Segura",
    subtitle: "Site protegido",
    bg: "bg-green-50",
    color: "text-green-500",
    href: null,
  },
]

function Card({ card }: { card: typeof CARDS[number] }) {
  const content = (
    <div className={`flex items-center gap-2.5 px-4 py-3 ${card.bg} rounded-xl min-w-[150px]`}>
      <div className={`w-9 h-9 rounded-full bg-white flex items-center justify-center shrink-0 shadow-sm`}>
        <svg className={`w-4.5 h-4.5 ${card.color}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d={card.icon} />
        </svg>
      </div>
      <div>
        <p className="font-bold text-[12px] text-bibelo-dark leading-tight">{card.title}</p>
        <p className="text-[10px] text-gray-500 leading-tight">{card.subtitle}</p>
      </div>
    </div>
  )

  if (card.href) {
    const isExternal = card.href.startsWith("http")
    return isExternal ? (
      <a href={card.href} target="_blank" rel="noreferrer" className="shrink-0">
        {content}
      </a>
    ) : (
      <Link href={card.href} className="shrink-0">
        {content}
      </Link>
    )
  }

  return <div className="shrink-0">{content}</div>
}

export default function BenefitCards() {
  const [paused, setPaused] = useState(false)

  const doubled = [...CARDS, ...CARDS]
  const duration = CARDS.length * 3.5

  return (
    <div
      className="md:hidden overflow-hidden py-2 bg-white select-none"
      onTouchStart={() => setPaused(true)}
      onTouchEnd={() => setPaused(false)}
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
