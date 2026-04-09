"use client"

import Link from "next/link"

const BENEFITS = [
  {
    icon: "M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12",
    title: "Frete Grátis",
    subtitle: "Leia a Política de Frete AQUI",
    href: "/politica-de-frete",
    sparkle: false,
  },
  {
    icon: "M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z",
    title: "Pagamento facilitado",
    subtitle: "Vários meios de pagamento",
    href: null,
    sparkle: false,
  },
  {
    icon: "M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L9.568 3z M6 6h.008v.008H6V6z",
    title: "Promoção de 1ª compra",
    subtitle: "CUPOM clicando AQUI",
    href: null,
    sparkle: false,
    openPopup: true,
  },
  {
    // WhatsApp chat bubble (Heroicons outline)
    icon: "M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z",
    title: "Clube VIP no WhatsApp",
    subtitle: "Entre para o Clube Bibelô",
    href: "https://boasvindas.papelariabibelo.com.br/api/links/grupo-vip",
    sparkle: true,
  },
]

type Benefit = {
  icon: string
  title: string
  subtitle: string
  href: string | null
  sparkle: boolean
  openPopup?: boolean
}

function BenefitCard({ benefit }: { benefit: Benefit }) {
  const iconEl = benefit.sparkle ? (
    <div className="relative w-10 h-10 shrink-0">
      {/* Círculo verde WhatsApp com pulse */}
      <div
        className="w-10 h-10 rounded-full bg-[#25D366]/15 flex items-center justify-center"
        style={{ animation: "vip-pulse 2.5s ease-in-out infinite" }}
      >
        <svg
          className="w-5 h-5 text-[#25D366]"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d={benefit.icon} />
        </svg>
      </div>
      {/* Sparkle superior direito */}
      <span
        className="absolute -top-1 -right-1 text-[9px] leading-none text-yellow-400"
        style={{ animation: "sparkle-blink 2s ease-in-out infinite" }}
      >
        ✦
      </span>
      {/* Sparkle inferior esquerdo — desfasado */}
      <span
        className="absolute -bottom-1 -left-1 text-[7px] leading-none text-yellow-300"
        style={{ animation: "sparkle-blink 2s ease-in-out infinite 0.8s" }}
      >
        ✦
      </span>
    </div>
  ) : (
    <div className="w-10 h-10 rounded-full bg-bibelo-pink/10 flex items-center justify-center shrink-0">
      <svg className="w-5 h-5 text-bibelo-pink" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d={benefit.icon} />
      </svg>
    </div>
  )

  const content = (
    <div className="flex items-center gap-3 px-5 py-3">
      {iconEl}
      <div className="min-w-0">
        <p className="font-bold text-[13px] text-bibelo-dark leading-tight whitespace-nowrap">{benefit.title}</p>
        <p className="text-[11px] text-gray-500 leading-tight whitespace-nowrap">{benefit.subtitle}</p>
      </div>
    </div>
  )

  if (benefit.openPopup) {
    return (
      <button
        type="button"
        className="shrink-0 hover:bg-bibelo-rosa/50 transition-colors rounded-lg cursor-pointer"
        onClick={() => window.dispatchEvent(new CustomEvent("bibelo:open-popup"))}
      >
        {content}
      </button>
    )
  }

  if (benefit.href) {
    const isExternal = benefit.href.startsWith("http")
    return isExternal ? (
      <a href={benefit.href} target="_blank" rel="noreferrer" className="shrink-0 hover:bg-bibelo-rosa/50 transition-colors rounded-lg">
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
  return (
    <>
      {/* Mobile: ticker scrollando */}
      <div className="md:hidden bg-bibelo-rosa/40 border-b border-bibelo-pink/10 overflow-hidden">
        <div className="benefits-track flex w-max hover:[animation-play-state:paused]">
          {([...BENEFITS, ...BENEFITS] as Benefit[]).map((b, i) => (
            <BenefitCard key={i} benefit={b} />
          ))}
        </div>
      </div>

      {/* Desktop: 4 cards fixos lado a lado */}
      <div className="hidden md:block bg-bibelo-rosa/40 border-b border-bibelo-pink/10">
        <div className="max-w-[1400px] mx-auto px-8 grid grid-cols-4 divide-x divide-bibelo-pink/15">
          {(BENEFITS as Benefit[]).map((b, i) => (
            <div key={i} className="flex items-center justify-center py-1">
              <BenefitCard benefit={b} />
            </div>
          ))}
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes vip-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(37,211,102,0.35); }
          50%       { box-shadow: 0 0 0 5px rgba(37,211,102,0); }
        }
        @keyframes sparkle-blink {
          0%, 100% { opacity: 0; transform: scale(0.4) rotate(0deg); }
          50%       { opacity: 1; transform: scale(1) rotate(20deg); }
        }
      ` }} />
    </>
  )
}
