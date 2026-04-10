"use client"

import { useState } from "react"
import Image from "next/image"

interface Props {
  images: Array<{ url: string }>
  title: string
  isOutOfStock: boolean
  isOnSale: boolean
  discountPercent: number
}

export default function ImageGallery({ images, title, isOutOfStock, isOnSale, discountPercent }: Props) {
  const [activeIdx, setActiveIdx] = useState(0)
  const [hovered, setHovered] = useState(false)

  const active = images[activeIdx]

  return (
    <div className="space-y-3 lg:sticky lg:top-28 lg:self-start">
      {/* Imagem principal */}
      <div
        className="relative aspect-square bg-gray-50 rounded-2xl overflow-hidden border border-gray-100"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {active ? (
          <Image
            src={active.url}
            alt={title}
            fill
            sizes="(max-width: 1024px) 100vw, 50vw"
            className={`object-contain p-4 transition-transform duration-500 ${hovered ? "scale-110" : "scale-100"}`}
            priority
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-bibelo-rosa/50 to-bibelo-amarelo/30">
            <div className="w-20 h-20 rounded-full bg-white/60 flex items-center justify-center mb-3">
              <svg className="w-10 h-10 text-bibelo-pink/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z" />
              </svg>
            </div>
            <span className="text-sm text-gray-400 font-medium">Foto em breve</span>
          </div>
        )}

        {/* Badges */}
        <div className="absolute top-3 left-3 flex flex-col gap-1.5">
          {isOutOfStock && <span className="badge-sold-out">ESGOTADO</span>}
          {isOnSale && !isOutOfStock && <span className="badge-off">{discountPercent}% OFF</span>}
        </div>
      </div>

      {/* Miniaturas clicáveis */}
      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto scrollbar-hide">
          {images.map((img, idx) => (
            <button
              key={idx}
              onClick={() => setActiveIdx(idx)}
              className={`w-16 h-16 lg:w-20 lg:h-20 shrink-0 bg-gray-50 rounded-lg overflow-hidden border-2 transition-colors ${
                idx === activeIdx
                  ? "border-bibelo-pink"
                  : "border-gray-100 hover:border-bibelo-pink/50"
              }`}
              aria-label={`Foto ${idx + 1}`}
            >
              <Image
                src={img.url}
                alt={`${title} ${idx + 1}`}
                width={80}
                height={80}
                className="w-full h-full object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
