"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"

const BENEFITS = [
  {
    icon: "M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12",
    title: "Frete Grátis",
    subtitle: "Confira nossa política",
    href: "/politica-de-frete",
    color: "text-bibelo-pink",
    bg: "bg-bibelo-pink/10",
  },
  {
    icon: "M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z",
    title: "Pagamento Facilitado",
    subtitle: "Pix, cartão 12x, boleto",
    href: null,
    color: "text-bibelo-pink",
    bg: "bg-bibelo-pink/10",
  },
  {
    icon: "M9 14.25l6-6m4.5-3.493V21.75l-3.75-1.5-3.75 1.5-3.75-1.5-3.75 1.5V4.757c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0c1.1.128 1.907 1.077 1.907 2.185zM9.75 9h.008v.008H9.75V9zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm4.125 4.5h.008v.008h-.008V13.5zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z",
    title: "7% OFF 1a Compra",
    subtitle: "Cupom BIBELO7",
    href: "/produtos",
    color: "text-bibelo-pink",
    bg: "bg-bibelo-pink/10",
  },
  {
    icon: "M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.562.562 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z",
    title: "Clube VIP",
    subtitle: "Ofertas pelo WhatsApp",
    href: "https://wa.me/5547933862514?text=Quero%20entrar%20no%20Clube%20VIP!",
    color: "text-bibelo-pink",
    bg: "bg-bibelo-pink/10",
  },
]

function BenefitCard({ benefit }: { benefit: typeof BENEFITS[number] }) {
  const content = (
    <div className="flex items-center gap-3 px-5 py-3">
      <div className={`w-10 h-10 rounded-full ${benefit.bg} flex items-center justify-center shrink-0`}>
        <svg className={`w-5 h-5 ${benefit.color}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d={benefit.icon} />
        </svg>
      </div>
      <div className="min-w-0">
        <p className="font-bold text-[13px] text-bibelo-dark leading-tight whitespace-nowrap">{benefit.title}</p>
        <p className="text-[11px] text-gray-500 leading-tight whitespace-nowrap">{benefit.subtitle}</p>
      </div>
    </div>
  )

  if (benefit.href) {
    const isExternal = benefit.href.startsWith("http")
    return isExternal ? (
      <a href={benefit.href} target="_blank" rel="noreferrer"
        className="shrink-0 hover:bg-bibelo-rosa/50 transition-colors rounded-lg">
        {content}
      </a>
    ) : (
      <Link href={benefit.href} className="shrink-0 hover:bg-bibelo-rosa/50 transition-colors rounded-lg">
        {content}
      </Link>
    )
  }

  return <div className="shrink-0">{content}</div>
}

export default function BenefitsStrip() {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    let raf: number
    const speed = 0.35 // Lento o suficiente para ler

    const tick = () => {
      if (!paused && el.scrollWidth > el.clientWidth) {
        el.scrollLeft += speed
        const half = el.scrollWidth / 2
        if (el.scrollLeft >= half) {
          el.scrollLeft = 0
        }
      }
      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [paused])

  return (
    <div className="bg-bibelo-rosa/40 border-b border-bibelo-pink/10">
      <div
        ref={scrollRef}
        className="flex overflow-x-hidden content-container"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onTouchStart={() => setPaused(true)}
        onTouchEnd={() => setTimeout(() => setPaused(false), 3000)}
      >
        {/* 3 cópias para loop contínuo suave em telas grandes */}
        {[...BENEFITS, ...BENEFITS, ...BENEFITS].map((b, i) => (
          <BenefitCard key={i} benefit={b} />
        ))}
      </div>
    </div>
  )
}
