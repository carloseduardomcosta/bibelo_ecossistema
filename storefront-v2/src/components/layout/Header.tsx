"use client"

import Link from "next/link"
import Image from "next/image"
import { useState, useEffect, useRef } from "react"
import { useCartStore } from "@/store/cart"
import { useMenuStore } from "@/store/menu"
import { useTrackingStore } from "@/store/tracking"
import TopBar from "./TopBar"
import PromoBanner from "./PromoBanner"
import CategoryMegaMenu from "./CategoryMegaMenu"
import { listProducts } from "@/lib/medusa/products"
import { formatPrice } from "@/lib/utils"

const NAV_LINKS = [
  { label: "INÍCIO", href: "/" },
  { label: "NOVIDADES", href: "/novidades" },
  { label: "OFERTAS", href: "/produtos?sort=price_asc" },
]

type SearchResult = {
  id: string
  title: string
  handle: string
  thumbnail?: string | null
  variants?: Array<{ calculated_price?: { calculated_amount: number } }>
}

function SearchDropdown({
  query,
  loading,
  results,
  onClose,
}: {
  query: string
  loading: boolean
  results: SearchResult[]
  onClose: () => void
}) {
  if (!query.trim()) return null
  return (
    <div className="absolute top-full left-0 right-0 z-50 mt-1.5 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
      {query.trim().length < 2 ? (
        <p className="px-4 py-5 text-sm text-center text-gray-400">
          Digite para buscar produtos...
        </p>
      ) : loading ? (
        <div className="flex items-center justify-center py-6">
          <div className="w-5 h-5 border-2 border-bibelo-pink/30 border-t-bibelo-pink rounded-full animate-spin" />
        </div>
      ) : results.length === 0 ? (
        <p className="px-4 py-5 text-sm text-center text-gray-400">
          Nenhum produto encontrado para &ldquo;{query}&rdquo;
        </p>
      ) : (
        <ul>
          {results.map((p) => (
            <li key={p.id} className="border-b border-gray-50 last:border-0">
              <Link
                href={`/produto/${p.handle}`}
                onClick={onClose}
                className="flex items-center gap-3 px-4 py-3 hover:bg-bibelo-rosa/30 transition-colors"
              >
                <div className="w-11 h-11 rounded-lg overflow-hidden bg-gray-50 shrink-0">
                  {p.thumbnail ? (
                    <Image
                      src={p.thumbnail}
                      alt={p.title}
                      width={44}
                      height={44}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-bibelo-rosa/30">
                      <span className="font-heading text-base text-bibelo-pink/60">
                        {p.title.charAt(0)}
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 line-clamp-1">{p.title}</p>
                  {p.variants?.[0]?.calculated_price?.calculated_amount ? (
                    <p className="text-sm font-bold text-bibelo-pink mt-0.5">
                      {formatPrice(p.variants[0].calculated_price.calculated_amount)}
                    </p>
                  ) : (
                    <p className="text-xs text-gray-400 mt-0.5">Consulte o preço</p>
                  )}
                </div>
              </Link>
            </li>
          ))}
          <li>
            <button
              type="button"
              onClick={() => {
                onClose()
                window.location.href = `/busca?q=${encodeURIComponent(query.trim())}`
              }}
              className="w-full px-4 py-2.5 text-sm text-bibelo-pink font-semibold hover:bg-bibelo-rosa/20 transition-colors text-center border-t border-gray-100"
            >
              Ver todos os resultados →
            </button>
          </li>
        </ul>
      )}
    </div>
  )
}

export default function Header() {
  const [searchQuery, setSearchQuery] = useState("")
  const [scrolled, setScrolled] = useState(false)
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const desktopRef = useRef<HTMLDivElement>(null)
  const mobileRef = useRef<HTMLDivElement>(null)
  const { itemCount, openCart } = useCartStore()
  const { openMenu } = useMenuStore()
  const { openTracking } = useTrackingStore()

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 10)
    window.addEventListener("scroll", handleScroll, { passive: true })
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  useEffect(() => {
    if (searchRef.current) {
      searchRef.current.focus()
    }
  }, [])

  // Busca com debounce 300ms
  useEffect(() => {
    const q = searchQuery.trim()
    if (q.length < 2) {
      setSearchResults([])
      setSearchLoading(false)
      return
    }
    setSearchLoading(true)
    const timer = setTimeout(async () => {
      try {
        const { products } = await listProducts({ q, limit: 6 })
        setSearchResults(products as SearchResult[])
      } catch {
        setSearchResults([])
      } finally {
        setSearchLoading(false)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  // Fechar dropdown ao clicar fora
  useEffect(() => {
    const handle = (e: MouseEvent) => {
      const t = e.target as Node
      if (!desktopRef.current?.contains(t) && !mobileRef.current?.contains(t))
        setShowDropdown(false)
    }
    document.addEventListener("mousedown", handle)
    return () => document.removeEventListener("mousedown", handle)
  }, [])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (searchQuery.trim()) {
      setShowDropdown(false)
      window.location.href = `/busca?q=${encodeURIComponent(searchQuery.trim())}`
    }
  }

  return (
    <header className={`sticky top-0 inset-x-0 z-50 transition-shadow duration-300 ${scrolled ? "shadow-md" : ""}`}>
      <PromoBanner />
      <TopBar />

      {/* Header principal */}
      <div className="bg-white border-b border-gray-100">
        <div className="content-container">
          <div className="flex items-center gap-4 py-3">

            {/* Logo — só desktop */}
            <Link href="/" className="shrink-0 hidden md:flex items-center">
              <Image
                src="/logo-bibelo.png"
                alt="Papelaria Bibelô"
                width={56}
                height={56}
                className="h-14 w-14 rounded-full object-cover shadow-sm border-2 border-bibelo-pink/20"
                priority
              />
            </Link>

            {/* Busca central — desktop */}
            <div ref={desktopRef} className="flex-1 hidden md:block relative">
              <form onSubmit={handleSearch} className="relative">
                <input
                  ref={searchRef}
                  type="search"
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setShowDropdown(true) }}
                  onFocus={() => { if (searchQuery.trim()) setShowDropdown(true) }}
                  onKeyDown={(e) => { if (e.key === "Escape") setShowDropdown(false) }}
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
              {showDropdown && (
                <SearchDropdown
                  query={searchQuery}
                  loading={searchLoading}
                  results={searchResults}
                  onClose={() => setShowDropdown(false)}
                />
              )}
            </div>

            {/* Ações direita — somente desktop (no mobile está na bottom nav) */}
            <div className="hidden md:flex items-center gap-1 shrink-0">
              {/* Atendimento WhatsApp */}
              <a
                href="https://wa.me/5547933862514"
                target="_blank"
                rel="noreferrer"
                className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg text-gray-600 hover:text-bibelo-pink hover:bg-bibelo-pink/10 transition-colors"
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
                <span className="text-[10px] font-medium leading-none">Minha conta</span>
              </Link>

              {/* Rastrear */}
              <button
                onClick={() => openTracking()}
                className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg text-gray-600 hover:text-bibelo-pink hover:bg-bibelo-pink/10 transition-colors"
                aria-label="Rastrear pedido"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
                </svg>
                <span className="text-[10px] font-medium leading-none">Rastrear</span>
              </button>

              {/* Carrinho */}
              <button
                onClick={openCart}
                className="relative flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg text-bibelo-pink hover:bg-bibelo-pink/10 transition-colors"
                aria-label={`Meu carrinho — ${itemCount} ${itemCount === 1 ? "item" : "itens"}`}
              >
                <div className="relative">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
                  </svg>
                  <span className={`absolute -top-2 -right-2.5 text-white text-[10px] font-bold w-[18px] h-[18px] rounded-full flex items-center justify-center leading-none ${itemCount > 0 ? "bg-bibelo-pink" : "bg-bibelo-pink/50"}`}>
                    {itemCount > 9 ? "9+" : itemCount}
                  </span>
                </div>
                <span className="text-[10px] font-medium leading-none">Meu carrinho</span>
              </button>
            </div>

            {/* Mobile: menu esquerda */}
            <button
              onClick={openMenu}
              className="md:hidden p-2 text-gray-600 hover:text-bibelo-pink transition-colors"
              aria-label="Abrir menu"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
              </svg>
            </button>

            {/* Mobile: título centralizado */}
            <div className="md:hidden flex-1 min-w-0 flex justify-center">
              <Link href="/">
                <Image
                  src="/titulo-bibelo.png"
                  alt="Papelaria Bibelô"
                  width={200}
                  height={64}
                  className="h-14 w-auto object-contain"
                  priority
                />
              </Link>
            </div>
            {/* Mobile: rastrear */}
            <button
              onClick={() => openTracking()}
              className="md:hidden p-2 text-gray-600 hover:text-bibelo-pink transition-colors"
              aria-label="Rastrear pedido"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
              </svg>
            </button>

            <button
              onClick={openCart}
              className="md:hidden relative p-2 text-bibelo-pink hover:text-bibelo-pink-dark transition-colors"
              aria-label={`Carrinho — ${itemCount} ${itemCount === 1 ? "item" : "itens"}`}
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
              </svg>
              <span className={`absolute top-0.5 right-0 text-white text-[9px] font-bold w-[18px] h-[18px] rounded-full flex items-center justify-center leading-none ${itemCount > 0 ? "bg-bibelo-pink" : "bg-bibelo-pink/50"}`}>
                {itemCount > 9 ? "9+" : itemCount}
              </span>
            </button>
          </div>
        </div>

        {/* Busca mobile */}
        <div ref={mobileRef} className="md:hidden px-4 pb-3 relative">
          <form onSubmit={handleSearch} className="relative">
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setShowDropdown(true) }}
              onFocus={() => { if (searchQuery.trim()) setShowDropdown(true) }}
              onKeyDown={(e) => { if (e.key === "Escape") setShowDropdown(false) }}
              placeholder="O que você está buscando?"
              className="w-full border-2 border-bibelo-pink/30 rounded-full px-4 py-2 text-sm
                         focus:outline-none focus:border-bibelo-pink transition-colors
                         placeholder:text-gray-400"
            />
            <button
              type="submit"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-bibelo-pink"
              aria-label="Buscar"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </button>
          </form>
          {showDropdown && (
            <SearchDropdown
              query={searchQuery}
              loading={searchLoading}
              results={searchResults}
              onClose={() => setShowDropdown(false)}
            />
          )}
        </div>

        {/* Nav bar de categorias */}
        <nav className="hidden md:block bg-bibelo-rosa/60 border-t border-bibelo-pink/10">
          <div className="content-container">
            <div className="flex items-center justify-center h-10 gap-1">
              {/* Mega menu de categorias dinâmicas */}
              <CategoryMegaMenu />

              {/* Links estáticos */}
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="px-4 h-full flex items-center text-xs font-semibold uppercase tracking-widest
                             text-bibelo-dark hover:text-bibelo-pink border-b-2 border-transparent
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
