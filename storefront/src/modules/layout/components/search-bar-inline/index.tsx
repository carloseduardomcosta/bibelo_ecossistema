"use client"

import { useRouter, useParams } from "next/navigation"
import { useState } from "react"

const SearchBarInline = () => {
  const [query, setQuery] = useState("")
  const router = useRouter()
  const { countryCode } = useParams() as { countryCode: string }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (query.trim()) {
      router.push(`/${countryCode}/store?q=${encodeURIComponent(query.trim())}`)
      setQuery("")
    }
  }

  return (
    <form
      onSubmit={handleSearch}
      className="flex items-center w-full border border-bibelo-pink rounded-full overflow-hidden bg-white hover:shadow-sm transition-shadow"
    >
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="O que você está buscando?"
        aria-label="O que você está buscando?"
        className="flex-1 px-5 py-2.5 text-sm text-bibelo-dark bg-transparent outline-none placeholder:text-bibelo-dark/40"
      />
      <button
        type="submit"
        aria-label="Buscar"
        className="px-4 py-2.5 text-bibelo-pink hover:text-[#e050a8] transition-colors"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
        </svg>
      </button>
    </form>
  )
}

export default SearchBarInline
