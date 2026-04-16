"use client"

import Link from "next/link"
import { useState } from "react"

interface Props {
  id: string
  name: string
  handle: string
  fallbackClass: string
}

export default function CategoryCard({ name, handle, fallbackClass }: Props) {
  const [imgOk, setImgOk] = useState(true)
  const initial = name.charAt(0).toUpperCase()

  return (
    <Link
      href={`/categoria/${handle}`}
      className="group flex flex-col items-center gap-2.5 focus:outline-none"
    >
      {/* Card de imagem */}
      <div
        className="relative w-full aspect-square rounded-2xl overflow-hidden
                   shadow-sm group-hover:shadow-lg group-hover:scale-[1.05]
                   transition-all duration-300 ease-out"
      >
        {/* Fallback colorido — sempre renderizado, fica atrás quando a imagem carrega */}
        <div
          className={`absolute inset-0 ${fallbackClass} flex items-center justify-center`}
          aria-hidden
        >
          <span className="text-4xl font-black text-gray-400/20 select-none">{initial}</span>
        </div>

        {/* Arte customizada — /public/categories/{handle}.jpg */}
        {imgOk && (
          <img
            src={`/categories/${handle}.jpg`}
            alt={name}
            className="absolute inset-0 w-full h-full object-cover"
            onError={() => setImgOk(false)}
          />
        )}

        {/* Overlay sutil no hover */}
        <div className="absolute inset-0 bg-bibelo-pink/0 group-hover:bg-bibelo-pink/10
                       transition-colors duration-300" />
      </div>

      {/* Nome */}
      <span
        className="text-xs md:text-sm font-semibold text-gray-700
                   group-hover:text-bibelo-pink transition-colors duration-200
                   text-center leading-tight line-clamp-2 w-full px-0.5"
      >
        {name}
      </span>
    </Link>
  )
}
