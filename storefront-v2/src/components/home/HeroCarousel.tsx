"use client"

import { useState, useEffect, useCallback } from "react"
import Image from "next/image"
import Link from "next/link"

const SLIDES = [
  {
    id: 1,
    image: "https://d2c0db5b8fb27c1c.cdn.nuvemshop.com.br/stores/009/028/097/themes/common/logo-1745875034-1744816965-b6e3e7e9a5a50b9e3e7e9a5a50b9e3e7.webp",
    fallbackBg: "#FFF176",
    title: "FRETE GRÁTIS",
    subtitle: "Nas compras acima de R$ 199",
    cta: { label: "Comprar agora", href: "/produtos" },
    align: "left",
  },
  {
    id: 2,
    image: null,
    fallbackBg: "#ffb3e0",
    title: "7% OFF",
    subtitle: "Na sua primeira compra com o cupom BIBELO7",
    cta: { label: "Usar cupom", href: "/produtos" },
    align: "center",
    badge: "CUPOM: BIBELO7",
  },
  {
    id: 3,
    image: null,
    fallbackBg: "#c8f7c5",
    title: "CLUBE VIP",
    subtitle: "Entre para o Clube Bibelô no WhatsApp e receba ofertas exclusivas",
    cta: { label: "Entrar no clube", href: "https://wa.me/5547933862514" },
    align: "center",
  },
]

export default function HeroCarousel() {
  const [current, setCurrent] = useState(0)
  const [isAutoPlaying, setIsAutoPlaying] = useState(true)

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

  const slide = SLIDES[current]

  return (
    <div
      className="relative w-full overflow-hidden"
      style={{ minHeight: "320px" }}
      onMouseEnter={() => setIsAutoPlaying(false)}
      onMouseLeave={() => setIsAutoPlaying(true)}
    >
      {/* Slides */}
      {SLIDES.map((s, idx) => (
        <div
          key={s.id}
          className={`absolute inset-0 transition-opacity duration-700 ${idx === current ? "opacity-100 z-10" : "opacity-0 z-0"}`}
          style={{ backgroundColor: s.fallbackBg }}
          aria-hidden={idx !== current}
        >
          <div className="content-container h-full flex items-center py-12">
            <div className={`w-full flex flex-col gap-4 ${s.align === "center" ? "items-center text-center" : "items-start text-left"}`}>
              {s.badge && (
                <span className="inline-block bg-bibelo-pink text-white font-bold px-4 py-1.5 rounded-full text-sm tracking-wider">
                  {s.badge}
                </span>
              )}
              <h2 className="text-4xl md:text-6xl font-black text-bibelo-pink drop-shadow-sm leading-none">
                {s.title}
              </h2>
              <p className="text-lg md:text-xl text-gray-700 font-medium max-w-md">
                {s.subtitle}
              </p>
              <Link
                href={s.cta.href}
                className="btn-primary text-base px-8 py-3 mt-2"
              >
                {s.cta.label}
              </Link>
            </div>
          </div>
        </div>
      ))}

      {/* Controles */}
      <button
        onClick={prev}
        className="absolute left-3 top-1/2 -translate-y-1/2 z-20 w-9 h-9 bg-white/80 rounded-full
                   flex items-center justify-center shadow hover:bg-white transition-colors"
        aria-label="Slide anterior"
      >
        <svg className="w-4 h-4 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
      </button>
      <button
        onClick={next}
        className="absolute right-3 top-1/2 -translate-y-1/2 z-20 w-9 h-9 bg-white/80 rounded-full
                   flex items-center justify-center shadow hover:bg-white transition-colors"
        aria-label="Próximo slide"
      >
        <svg className="w-4 h-4 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
      </button>

      {/* Dots */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex gap-2">
        {SLIDES.map((_, idx) => (
          <button
            key={idx}
            onClick={() => setCurrent(idx)}
            className={`rounded-full transition-all duration-300 ${
              idx === current ? "w-6 h-2 bg-bibelo-pink" : "w-2 h-2 bg-bibelo-pink/40"
            }`}
            aria-label={`Ir para slide ${idx + 1}`}
          />
        ))}
      </div>
    </div>
  )
}
