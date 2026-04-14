"use client"

import { useState, useEffect } from "react"
import { useTrackingStore } from "@/store/tracking"

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "https://api.papelariabibelo.com.br"

interface TrackingResult {
  tracking_code: string
  servico: string
  status: {
    codigo: number
    label: string
    cor: "blue" | "yellow" | "orange" | "green" | "red" | "purple" | "gray"
    entregue: boolean
  }
  ultima_atualizacao: string | null
  previsao_entrega: string | null
  prazo_entrega_dias: number | null
  origem: string | null
  destino: string | null
  url_rastreio: string | null
  pedido: { numero: string; cliente: string | null } | null
}

const COR_BG: Record<string, string> = {
  blue:   "bg-blue-50 border-blue-200 text-blue-800",
  yellow: "bg-yellow-50 border-yellow-200 text-yellow-800",
  orange: "bg-orange-50 border-orange-200 text-orange-800",
  green:  "bg-green-50 border-green-200 text-green-800",
  red:    "bg-red-50 border-red-200 text-red-800",
  purple: "bg-purple-50 border-purple-200 text-purple-800",
  gray:   "bg-gray-50 border-gray-200 text-gray-700",
}

function formatData(iso: string | null): string {
  if (!iso) return "—"
  try {
    return new Date(iso).toLocaleDateString("pt-BR", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    })
  } catch {
    return iso
  }
}

export default function TrackingDrawer() {
  const { open, codigoInicial, closeTracking } = useTrackingStore()
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [resultado, setResultado] = useState<TrackingResult | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  // Fechar com Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeTracking()
    }
    if (open) document.addEventListener("keydown", handleKey)
    return () => document.removeEventListener("keydown", handleKey)
  }, [open, closeTracking])

  // Bloquear scroll quando aberto
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : ""
    return () => { document.body.style.overflow = "" }
  }, [open])

  // Preencher código inicial e buscar automaticamente
  useEffect(() => {
    if (open && codigoInicial) {
      setInput(codigoInicial)
      buscar(codigoInicial)
    } else if (!open) {
      setInput("")
      setResultado(null)
      setErro(null)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, codigoInicial])

  async function buscar(codigo: string) {
    const c = codigo.trim().toUpperCase()
    if (!c) return
    setLoading(true)
    setErro(null)
    setResultado(null)
    try {
      const res = await fetch(`${API_BASE}/api/public/rastreio?codigo=${encodeURIComponent(c)}`)
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `Erro ${res.status}`)
      }
      setResultado(await res.json())
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao consultar rastreio."
      setErro(msg)
    } finally {
      setLoading(false)
    }
  }

  if (!open) return null

  const cor = resultado?.status.cor ?? "gray"

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/50 z-[200] animate-fade-in"
        onClick={closeTracking}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-full max-w-md bg-white z-[201] flex flex-col shadow-2xl animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <svg className="w-5 h-5 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
            </svg>
            <h2 className="font-bold text-lg text-[#3D2B1F]">Rastrear envio</h2>
          </div>
          <button
            onClick={closeTracking}
            className="p-2 rounded-full hover:bg-gray-100 transition-colors"
            aria-label="Fechar"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Conteúdo */}
        <div className="flex-1 overflow-y-auto p-5">
          {/* Input */}
          <div className="flex gap-2 mb-5">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && buscar(input)}
              placeholder="Ex: AN817294331BR"
              className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm
                         focus:outline-none focus:ring-2 focus:ring-rose-300 focus:border-transparent"
              autoFocus
            />
            <button
              onClick={() => buscar(input)}
              disabled={loading || !input.trim()}
              className="px-4 py-2.5 bg-[#C9896A] text-white text-sm font-medium rounded-xl
                         hover:bg-[#b8785b] disabled:opacity-50 transition-colors flex items-center gap-1.5"
            >
              {loading ? (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              )}
              {loading ? "Buscando…" : "Rastrear"}
            </button>
          </div>

          {/* Erro */}
          {erro && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 mb-4">
              <svg className="w-4 h-4 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              {erro}
            </div>
          )}

          {/* Resultado */}
          {resultado && (
            <div className={`rounded-2xl border overflow-hidden ${COR_BG[cor]}`}>
              {/* Status */}
              <div className="p-4 border-b border-current/10">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-base">{resultado.status.label}</p>
                    <p className="text-xs opacity-70 mt-0.5">
                      {resultado.tracking_code} · {resultado.servico}
                    </p>
                  </div>
                  {resultado.url_rastreio && (
                    <a
                      href={resultado.url_rastreio}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-medium opacity-60 hover:opacity-100 transition-opacity flex items-center gap-1 shrink-0"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                      </svg>
                      Detalhar
                    </a>
                  )}
                </div>
              </div>

              {/* Detalhes */}
              <div className="bg-white p-4 space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-gray-400 mb-0.5">Última atualização</p>
                    <p className="font-medium text-gray-700">{formatData(resultado.ultima_atualizacao)}</p>
                  </div>
                  {resultado.previsao_entrega && (
                    <div>
                      <p className="text-xs text-gray-400 mb-0.5">Previsão de entrega</p>
                      <p className="font-medium text-gray-700">
                        {resultado.previsao_entrega}
                        {resultado.prazo_entrega_dias && (
                          <span className="text-gray-400 text-xs ml-1">({resultado.prazo_entrega_dias}d úteis)</span>
                        )}
                      </p>
                    </div>
                  )}
                </div>

                {(resultado.origem || resultado.destino) && (
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    {resultado.origem && (
                      <span className="bg-gray-100 px-2 py-1 rounded-lg">{resultado.origem}</span>
                    )}
                    {resultado.origem && resultado.destino && <span>→</span>}
                    {resultado.destino && (
                      <span className="bg-gray-100 px-2 py-1 rounded-lg">{resultado.destino}</span>
                    )}
                  </div>
                )}

                {resultado.pedido && (
                  <div className="pt-2 border-t border-gray-100">
                    <p className="text-xs text-gray-400">
                      Pedido #{resultado.pedido.numero}
                      {resultado.pedido.cliente && ` · ${resultado.pedido.cliente}`}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Estado vazio */}
          {!resultado && !erro && !loading && (
            <div className="text-center py-12 text-gray-400">
              <svg className="w-12 h-12 mx-auto mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
              </svg>
              <p className="text-sm">Digite o código de rastreio acima</p>
              <p className="text-xs mt-1 opacity-70">Ex: AN817294331BR</p>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
