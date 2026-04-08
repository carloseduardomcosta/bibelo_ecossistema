"use client"

import { useState, useEffect, useCallback } from "react"
import Image from "next/image"
import Link from "next/link"

const SLIDES = [
  {
    id: 1,
    pc: "/carousel/pc/fretegratis.webp",
    mobile: "/carousel/mobile/fretegratis_mobile.webp",
    alt: "Frete Grátis nas compras acima de R$ 199 para Sul e Sudeste",
    href: "/produtos",
    bg: "#fff7c1",
  },
  {
    id: 2,
    pc: "/carousel/pc/7off.webp",
    mobile: "/carousel/pc/7off.webp", // usar PC enquanto não tem mobile
    alt: "7% OFF na primeira compra com cupom BIBELO7",
    href: "/produtos",
    bg: "#fff7c1",
  },
  {
    id: 3,
    pc: "/carousel/pc/grupo_vip.webp",
    mobile: "/carousel/mobile/grupovip_mobile.webp",
    alt: "Grupo VIP WhatsApp — Ofertas e Lançamentos exclusivos",
    href: "https://wa.me/5547933862514?text=Quero%20entrar%20no%20Grupo%20VIP!",
    external: true,
    bg: "#fff7c1",
  },
]

export default function HeroCarousel() {
  const [current, setCurrent] = useState(0)
  const [isAutoPlaying, setIsAutoPlaying] = useState(true)
  const [touchStart, setTouchStart] = useState(0)

  const next = useCallback(() => {
    setCurrent((prev) => (prev + 1) % SLIDES.length)
  }, [])

  const prev = useCallback(() => {
    setCurrent((prev) => (prev - 1 + SLIDES.length) % SLIDES.length)
  }, [])

  useEffect(() => {
    if (!isAutoPlaying) return
    const timer = setInterval(next, 5000)
    return () => clearInterval(timer)
  }, [isAutoPlaying, next])

  // Swipe para mobile
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart(e.touches[0].clientX)
    setIsAutoPlaying(false)
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    const diff = touchStart - e.changedTouches[0].clientX
    if (Math.abs(diff) > 50) {
      diff > 0 ? next() : prev()
    }
    setIsAutoPlaying(true)
  }

  const slide = SLIDES[current]
  const LinkWrapper = slide.external ? "a" : Link

  return (
    <div
      className="relative w-full overflow-hidden"
      onMouseEnter={() => setIsAutoPlaying(false)}
      onMouseLeave={() => setIsAutoPlaying(true)}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Slides */}
      {SLIDES.map((s, idx) => {
        const Wrapper = s.external ? "a" : Link

        return (
          <div
            key={s.id}
            className={`${idx === 0 ? "relative" : "absolute inset-0"} transition-opacity duration-700 ${
              idx === current ? "opacity-100 z-10" : "opacity-0 z-0 pointer-events-none"
            }`}
            style={{ backgroundColor: s.bg }}
            aria-hidden={idx !== current}
          >
            <Wrapper
              href={s.href}
              {...(s.external ? { target: "_blank", rel: "noreferrer" } : {})}
              className="block w-full"
            >
              {/* Desktop — aspect 16:5 (banner largo) */}
              <div className="hidden md:block relative w-full" style={{ aspectRatio: "16/5" }}>
                <Image
                  src={s.pc}
                  alt={s.alt}
                  fill
                  sizes="100vw"
                  className="object-contain"
                  priority={idx === 0}
                />
              </div>

              {/* Mobile — aspect 4:5 (portrait) ou 16:5 se não tem mobile específico */}
              <div
                className="block md:hidden relative w-full"
                style={{ aspectRatio: s.mobile !== s.pc ? "4/5" : "16/7" }}
              >
                <Image
                  src={s.mobile}
                  alt={s.alt}
                  fill
                  sizes="100vw"
                  className={s.mobile !== s.pc ? "object-contain" : "object-cover"}
                  priority={idx === 0}
                />
              </div>
            </Wrapper>
          </div>
        )
      })}

      {/* Setas — maiores no mobile */}
      <button
        onClick={(e) => { e.stopPropagation(); prev() }}
        className="absolute left-2 md:left-4 top-1/2 -translate-y-1/2 z-20
                   w-8 h-8 md:w-10 md:h-10 bg-white/70 backdrop-blur-sm rounded-full
                   flex items-center justify-center shadow-md hover:bg-white transition-colors"
        aria-label="Slide anterior"
      >
        <svg className="w-4 h-4 md:w-5 md:h-5 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); next() }}
        className="absolute right-2 md:right-4 top-1/2 -translate-y-1/2 z-20
                   w-8 h-8 md:w-10 md:h-10 bg-white/70 backdrop-blur-sm rounded-full
                   flex items-center justify-center shadow-md hover:bg-white transition-colors"
        aria-label="Próximo slide"
      >
        <svg className="w-4 h-4 md:w-5 md:h-5 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
      </button>

      {/* Dots */}
      <div className="absolute bottom-2 md:bottom-4 left-1/2 -translate-x-1/2 z-20 flex gap-2">
        {SLIDES.map((_, idx) => (
          <button
            key={idx}
            onClick={() => setCurrent(idx)}
            className={`rounded-full transition-all duration-300 ${
              idx === current ? "w-6 h-2.5 bg-bibelo-pink" : "w-2.5 h-2.5 bg-bibelo-pink/40"
            }`}
            aria-label={`Ir para slide ${idx + 1}`}
          />
        ))}
      </div>
    </div>
  )
}
