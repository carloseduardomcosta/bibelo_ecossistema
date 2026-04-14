/**
 * TrackingWidget — widget de rastreio de envios
 *
 * Uso:
 *   <TrackingWidget />                         → input livre
 *   <TrackingWidget codigoInicial="AN817..." /> → abre já rastreado
 *   <TrackingWidget apiBase="https://..."  />   → override do endpoint
 */

import { useState, useEffect } from "react"
import { Package, Search, Truck, CheckCircle, AlertCircle, Clock, ExternalLink, RefreshCw } from "lucide-react"
import api from "../lib/api"

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
  data_saida: string | null
  prazo_entrega_dias: number | null
  previsao_entrega: string | null
  origem: string | null
  destino: string | null
  url_rastreio: string | null
  pedido: { numero: string; cliente: string | null } | null
}

interface Props {
  codigoInicial?: string
  apiBase?: string          // override do endpoint base (para uso no storefront/portal)
  showTitle?: boolean
}

const COR_CLASSES: Record<string, string> = {
  blue:   "bg-blue-100 text-blue-800 border-blue-200",
  yellow: "bg-yellow-100 text-yellow-800 border-yellow-200",
  orange: "bg-orange-100 text-orange-800 border-orange-200",
  green:  "bg-green-100 text-green-800 border-green-200",
  red:    "bg-red-100 text-red-800 border-red-200",
  purple: "bg-purple-100 text-purple-800 border-purple-200",
  gray:   "bg-gray-100 text-gray-700 border-gray-200",
}

const COR_ICON_CLASSES: Record<string, string> = {
  blue:   "text-blue-500",
  yellow: "text-yellow-500",
  orange: "text-orange-500",
  green:  "text-green-500",
  red:    "text-red-500",
  purple: "text-purple-500",
  gray:   "text-gray-400",
}

function StatusIcon({ cor, entregue }: { cor: string; entregue: boolean }) {
  const cls = `w-8 h-8 ${COR_ICON_CLASSES[cor] || COR_ICON_CLASSES.gray}`
  if (entregue) return <CheckCircle className={cls} />
  if (cor === "red") return <AlertCircle className={cls} />
  if (cor === "green") return <Truck className={cls} />
  return <Package className={cls} />
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

export default function TrackingWidget({ codigoInicial, apiBase, showTitle = true }: Props) {
  const [input, setInput] = useState(codigoInicial || "")
  const [loading, setLoading] = useState(false)
  const [resultado, setResultado] = useState<TrackingResult | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  async function buscar(codigo: string) {
    if (!codigo.trim()) return
    setLoading(true)
    setErro(null)
    setResultado(null)

    try {
      const endpoint = apiBase
        ? `${apiBase}/api/public/rastreio`
        : "/api/public/rastreio"

      // Se apiBase definido (uso externo), usa fetch nativo; caso contrário usa api axios do CRM
      let data: TrackingResult
      if (apiBase) {
        const res = await fetch(`${endpoint}?codigo=${encodeURIComponent(codigo.trim().toUpperCase())}`)
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.error || `Erro ${res.status}`)
        }
        data = await res.json()
      } else {
        const res = await api.get(endpoint, {
          params: { codigo: codigo.trim().toUpperCase() },
        })
        data = res.data
      }

      setResultado(data)
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || "Erro ao consultar rastreio."
      setErro(msg)
    } finally {
      setLoading(false)
    }
  }

  // Auto-busca se codigoInicial fornecido
  useEffect(() => {
    if (codigoInicial) buscar(codigoInicial)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codigoInicial])

  return (
    <div className="w-full max-w-xl mx-auto">
      {showTitle && (
        <div className="flex items-center gap-2 mb-4">
          <Package className="w-5 h-5 text-pink-500" />
          <h2 className="text-lg font-semibold text-gray-800">Rastrear envio</h2>
        </div>
      )}

      {/* Input de busca */}
      <div className="flex gap-2 mb-4">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && buscar(input)}
          placeholder="Código de rastreio (ex: AN817294331BR)"
          className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"
        />
        <button
          onClick={() => buscar(input)}
          disabled={loading || !input.trim()}
          className="flex items-center gap-2 px-4 py-2.5 bg-pink-500 text-white text-sm font-medium rounded-xl hover:bg-pink-600 disabled:opacity-50 transition-colors"
        >
          {loading ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <Search className="w-4 h-4" />
          )}
          {loading ? "Buscando…" : "Rastrear"}
        </button>
      </div>

      {/* Erro */}
      {erro && (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          {erro}
        </div>
      )}

      {/* Resultado */}
      {resultado && (
        <div className="border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
          {/* Header status */}
          <div className={`flex items-center gap-3 p-4 border-b ${COR_CLASSES[resultado.status.cor]}`}>
            <StatusIcon cor={resultado.status.cor} entregue={resultado.status.entregue} />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm">{resultado.status.label}</p>
              <p className="text-xs opacity-70 mt-0.5">
                {resultado.tracking_code} · {resultado.servico}
              </p>
            </div>
            {resultado.url_rastreio && (
              <a
                href={resultado.url_rastreio}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs font-medium opacity-70 hover:opacity-100 transition-opacity"
                title="Ver no Melhor Rastreio"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Detalhar
              </a>
            )}
          </div>

          {/* Detalhes */}
          <div className="p-4 bg-white space-y-3 text-sm">
            {/* Linha de datas */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Última atualização</p>
                <p className="font-medium text-gray-700">
                  {formatData(resultado.ultima_atualizacao)}
                </p>
              </div>
              {resultado.previsao_entrega && (
                <div>
                  <p className="text-xs text-gray-400 mb-0.5">Previsão de entrega</p>
                  <p className="font-medium text-gray-700 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-gray-400" />
                    {resultado.previsao_entrega}
                    {resultado.prazo_entrega_dias && (
                      <span className="text-gray-400 text-xs">({resultado.prazo_entrega_dias}d úteis)</span>
                    )}
                  </p>
                </div>
              )}
            </div>

            {/* Rota */}
            {(resultado.origem || resultado.destino) && (
              <div className="flex items-center gap-2 text-xs text-gray-500">
                {resultado.origem && <span className="bg-gray-100 px-2 py-1 rounded-lg">{resultado.origem}</span>}
                {resultado.origem && resultado.destino && (
                  <span>→</span>
                )}
                {resultado.destino && <span className="bg-gray-100 px-2 py-1 rounded-lg">{resultado.destino}</span>}
              </div>
            )}

            {/* Pedido */}
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
    </div>
  )
}
