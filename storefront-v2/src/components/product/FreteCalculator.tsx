"use client"

import { useState } from "react"
import { formatPrice } from "@/lib/utils"

interface FreteOption {
  id: string
  name: string
  price: number       // centavos
  delivery_days: number
}

function maskCep(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 8)
  if (digits.length > 5) return `${digits.slice(0, 5)}-${digits.slice(5)}`
  return digits
}

export default function FreteCalculator() {
  const [cep, setCep]         = useState("")
  const [loading, setLoading] = useState(false)
  const [options, setOptions] = useState<FreteOption[] | null>(null)
  const [error, setError]     = useState<string | null>(null)

  const handleCalc = async () => {
    const digits = cep.replace(/\D/g, "")
    if (digits.length !== 8) {
      setError("Informe um CEP válido com 8 dígitos.")
      return
    }
    setLoading(true)
    setError(null)
    setOptions(null)

    try {
      const res = await fetch(`/api/frete?cep=${digits}`)
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || "Não foi possível calcular o frete agora.")
        return
      }

      setOptions(data.options || [])
    } catch {
      setError("Erro de conexão. Tente novamente.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="border border-gray-100 rounded-xl p-4 bg-gray-50/50">
      <p className="text-sm font-semibold text-gray-700 mb-3">Calcular frete</p>

      <div className="flex gap-2">
        <input
          type="text"
          inputMode="numeric"
          value={cep}
          onChange={(e) => {
            setCep(maskCep(e.target.value))
            setError(null)
            setOptions(null)
          }}
          onKeyDown={(e) => e.key === "Enter" && handleCalc()}
          placeholder="00000-000"
          maxLength={9}
          className="input-base flex-1 !text-sm !py-2"
          aria-label="CEP"
        />
        <button
          onClick={handleCalc}
          disabled={loading}
          className="px-4 py-2 rounded-full bg-bibelo-pink text-white text-xs font-semibold hover:bg-bibelo-pink-dark transition-colors disabled:opacity-50 whitespace-nowrap"
        >
          {loading ? "..." : "Calcular"}
        </button>
      </div>

      {error && (
        <p className="text-xs text-red-500 mt-2">{error}</p>
      )}

      {options && options.length > 0 && (
        <div className="mt-3 space-y-2">
          {options.map((opt) => (
            <div key={opt.id} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-bibelo-pink" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
                </svg>
                <span className="text-gray-700 font-medium">{opt.name}</span>
                <span className="text-xs text-gray-400">({opt.delivery_days}d úteis)</span>
              </div>
              <span className="font-bold text-bibelo-dark">
                {opt.price === 0 ? "Grátis" : formatPrice(opt.price)}
              </span>
            </div>
          ))}
          <p className="text-[10px] text-gray-400 mt-1">
            * Prazo estimado a partir da postagem. Frete final calculado no checkout.
          </p>
        </div>
      )}

      {options && options.length === 0 && (
        <p className="text-xs text-gray-500 mt-2">
          Sem opções de frete para este CEP. Finalize o pedido para ver as opções disponíveis.
        </p>
      )}
    </div>
  )
}
