"use client"

import { useRouter } from "next/navigation"
import { useParams } from "next/navigation"
import { useState, useRef, useEffect } from "react"

const SearchBar = () => {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const { countryCode } = useParams() as { countryCode: string }

  useEffect(() => {
    if (open) {
      inputRef.current?.focus()
    }
  }, [open])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (query.trim()) {
      router.push(`/${countryCode}/store?q=${encodeURIComponent(query.trim())}`)
      setOpen(false)
      setQuery("")
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setOpen(false)
      setQuery("")
    }
  }

  return (
    <div className="relative flex items-center h-full">
      {/* Expanded search input */}
      {open && (
        <form
          onSubmit={handleSearch}
          className="absolute right-0 flex items-center bg-white border border-bibelo-rosa rounded-full overflow-hidden shadow-sm"
          style={{ width: "260px" }}
        >
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Buscar produtos..."
            className="flex-1 px-4 py-2 text-sm text-bibelo-dark outline-none bg-transparent placeholder:text-bibelo-dark/40"
          />
          <button
            type="submit"
            className="px-3 py-2 text-bibelo-pink hover:text-[#e050a8] transition-colors"
            aria-label="Buscar"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => { setOpen(false); setQuery("") }}
            className="px-3 py-2 text-bibelo-dark/40 hover:text-bibelo-dark transition-colors"
            aria-label="Fechar busca"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </form>
      )}

      {/* Search icon button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="flex items-center justify-center w-9 h-9 rounded-full hover:bg-bibelo-rosa/50 text-bibelo-dark hover:text-bibelo-pink transition-colors"
          aria-label="Abrir busca"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
        </button>
      )}
    </div>
  )
}

export default SearchBar
