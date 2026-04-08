"use client"

import Link from "next/link"
import Image from "next/image"
import { useState, useEffect, useRef } from "react"
import { useCartStore } from "@/store/cart"
import TopBar from "./TopBar"

const NAV_LINKS = [
  { label: "INÍCIO", href: "/" },
  { label: "TODOS OS PRODUTOS", href: "/produtos" },
  { label: "NOVIDADES", href: "/produtos?sort=created_at" },
  { label: "OFERTAS", href: "/produtos?sort=price_asc" },
]

export default function Header() {
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [scrolled, setScrolled] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const { itemCount, openCart } = useCartStore()

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 10)
    window.addEventListener("scroll", handleScroll, { passive: true })
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  useEffect(() => {
    if (searchOpen && searchRef.current) {
      searchRef.current.focus()
    }
  }, [searchOpen])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (searchQuery.trim()) {
      window.location.href = `/busca?q=${encodeURIComponent(searchQuery.trim())}`
    }
  }

  return (
    <header className={`sticky top-0 inset-x-0 z-50 transition-shadow duration-300 ${scrolled ? "shadow-md" : ""}`}>
      <TopBar />

      {/* Header principal */}
      <div className="bg-white border-b border-gray-100">
        <div className="content-container">
          <div className="flex items-center gap-4 py-3">

            {/* Logo */}
            <Link href="/" className="shrink-0 flex items-center">
              <Image
                src="/logo-bibelo.webp"
                alt="Papelaria Bibelô"
                width={160}
                height={64}
                className="h-14 w-auto object-contain"
                priority
              />
            </Link>

            {/* Busca central */}
            <div className="flex-1 hidden md:block">
              <form onSubmit={handleSearch} className="relative">
                <input
                  ref={searchRef}
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="O que você está buscando?"
                  className="w-full border-2 border-bibelo-pink/40 rounded-full px-5 py-2.5 text-sm
                             focus:outline-none focus:border-bibelo-pink transition-colors
                             placeholder:text-gray-400"
                />
                <button
                  type="submit"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-bibelo-pink hover:text-bibelo-pink-dark transition-colors"
                  aria-label="Buscar"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </button>
              </form>
            </div>

            {/* Ações direita */}
            <div className="flex items-center gap-1 shrink-0">
              {/* Busca mobile */}
              <button
                onClick={() => setSearchOpen(!searchOpen)}
                className="md:hidden flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg text-gray-600 hover:text-bibelo-pink hover:bg-bibelo-pink/10 transition-colors"
                aria-label="Buscar"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </button>

              {/* Atendimento WhatsApp */}
              <a
                href="https://wa.me/5547933862514"
                target="_blank"
                rel="noreferrer"
                className="hidden sm:flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg text-gray-600 hover:text-bibelo-pink hover:bg-bibelo-pink/10 transition-colors"
                aria-label="Atendimento via WhatsApp"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
                </svg>
                <span className="text-[10px] font-medium leading-none">Atendimento</span>
              </a>

              {/* Minha Conta */}
              <Link
                href="/conta"
                className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg text-gray-600 hover:text-bibelo-pink hover:bg-bibelo-pink/10 transition-colors"
                aria-label="Minha conta"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                </svg>
                <span className="text-[10px] font-medium leading-none hidden sm:block">Minha conta</span>
              </Link>

              {/* Carrinho */}
              <button
                onClick={openCart}
                className="relative flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg text-gray-600 hover:text-bibelo-pink hover:bg-bibelo-pink/10 transition-colors"
                aria-label={`Meu carrinho — ${itemCount} ${itemCount === 1 ? "item" : "itens"}`}
              >
                <div className="relative">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007zM8.625 10.5a.375.375 0 11-.75 0 .375.375 0 01.75 0zm7.5 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                  </svg>
                  {itemCount > 0 && (
                    <span className="absolute -top-2 -right-2 bg-bibelo-pink text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center leading-none">
                      {itemCount > 9 ? "9+" : itemCount}
                    </span>
                  )}
                </div>
                <span className="text-[10px] font-medium leading-none hidden sm:block">Meu carrinho</span>
              </button>
            </div>
          </div>
        </div>

        {/* Busca mobile expandida */}
        {searchOpen && (
          <div className="md:hidden border-t border-gray-100 px-4 py-3">
            <form onSubmit={handleSearch} className="relative">
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="O que você está buscando?"
                className="w-full border-2 border-bibelo-pink/40 rounded-full px-5 py-2.5 text-sm
                           focus:outline-none focus:border-bibelo-pink transition-colors"
                autoFocus
              />
              <button type="submit" className="absolute right-3 top-1/2 -translate-y-1/2 text-bibelo-pink">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </button>
            </form>
          </div>
        )}

        {/* Nav bar de categorias */}
        <nav className="hidden md:block border-t border-gray-100">
          <div className="content-container">
            <div className="flex items-center h-10 gap-1">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="px-4 h-full flex items-center text-xs font-semibold uppercase tracking-widest
                             text-gray-700 hover:text-bibelo-pink border-b-2 border-transparent
                             hover:border-bibelo-pink transition-all whitespace-nowrap"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
        </nav>
      </div>
    </header>
  )
}
