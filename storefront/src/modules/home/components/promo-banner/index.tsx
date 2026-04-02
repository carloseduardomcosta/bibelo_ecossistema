"use client"

import { useState } from "react"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

const PromoBanner = () => {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText("BIBELO7")
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <section className="w-full bg-gradient-to-r from-bibelo-pink via-[#ff85d0] to-bibelo-pink py-10">
      <div className="content-container">
        <div className="flex flex-col small:flex-row items-center justify-between gap-6 text-center small:text-left">
          {/* Texto */}
          <div className="text-white">
            <p className="text-xs uppercase tracking-[0.2em] font-semibold opacity-80 mb-1">
              Oferta exclusiva
            </p>
            <h3 className="font-heading text-2xl small:text-3xl font-semibold">
              7% OFF na sua primeira compra
            </h3>
            <p className="text-white/80 text-sm mt-1">
              Use o cupom abaixo e aproveite!
            </p>
          </div>

          {/* Cupom + CTA */}
          <div className="flex flex-col xsmall:flex-row items-center gap-3">
            {/* Cupom */}
            <button
              onClick={handleCopy}
              className="group flex items-center gap-3 bg-white/20 hover:bg-white/30 border-2 border-white/40 rounded-full px-6 py-3 transition-all duration-200"
              title="Clique para copiar"
            >
              <span className="font-mono font-bold text-white text-lg tracking-widest">
                BIBELO7
              </span>
              <span className="text-white/70 group-hover:text-white transition-colors">
                {copied ? (
                  <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" />
                  </svg>
                )}
              </span>
              {copied && (
                <span className="text-xs text-white font-medium">Copiado!</span>
              )}
            </button>

            {/* CTA */}
            <LocalizedClientLink
              href="/store"
              className="inline-flex items-center gap-2 bg-white text-bibelo-pink hover:bg-bibelo-rosa font-semibold px-7 py-3 rounded-full transition-all duration-200 text-sm shadow-md"
            >
              Comprar agora
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
            </LocalizedClientLink>
          </div>
        </div>
      </div>
    </section>
  )
}

export default PromoBanner
