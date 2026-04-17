"use client"

import { useState, useEffect } from "react"

const CRM_API = process.env.NEXT_PUBLIC_CRM_API_URL || "https://api.papelariabibelo.com.br"
const CACHE_KEY = "_bibelo_store_settings"
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutos

export interface StoreSettings {
  popup_ativo: boolean
  popup_desconto: number
  popup_cupom: string
  banner_frete_gratis: boolean
  frete_gratis_valor: number   // centavos — ex: 7900 = R$79,00
  frete_gratis_regioes: string
  pix_ativo: boolean
  pix_desconto: number         // percentual — ex: 5 = 5%
  cartao_ativo: boolean
  cartao_parcelas_max: number  // ex: 12
  boleto_ativo: boolean
}

const DEFAULTS: StoreSettings = {
  popup_ativo: true,
  popup_desconto: 10,
  popup_cupom: "BIBELO10",
  banner_frete_gratis: true,
  frete_gratis_valor: 7900,
  frete_gratis_regioes: "Sul e Sudeste",
  pix_ativo: true,
  pix_desconto: 5,
  cartao_ativo: true,
  cartao_parcelas_max: 12,
  boleto_ativo: true,
}

interface CacheEntry {
  ts: number
  data: StoreSettings
}

function readCache(): StoreSettings | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const entry: CacheEntry = JSON.parse(raw)
    if (Date.now() - entry.ts > CACHE_TTL_MS) return null
    return entry.data
  } catch {
    return null
  }
}

function writeCache(data: StoreSettings) {
  try {
    const entry: CacheEntry = { ts: Date.now(), data }
    localStorage.setItem(CACHE_KEY, JSON.stringify(entry))
  } catch {
    /* localStorage indisponível — sem cache */
  }
}

// Normaliza a resposta da API (objeto chave→valor) para StoreSettings tipado
function parseApiResponse(raw: Record<string, string>): StoreSettings {
  return {
    popup_ativo:
      "popup_ativo" in raw
        ? raw.popup_ativo === "true" || raw.popup_ativo === "1"
        : DEFAULTS.popup_ativo,
    popup_desconto:
      "popup_desconto" in raw
        ? Number(raw.popup_desconto) || DEFAULTS.popup_desconto
        : DEFAULTS.popup_desconto,
    popup_cupom:
      raw.popup_cupom?.trim() || DEFAULTS.popup_cupom,
    banner_frete_gratis:
      "banner_frete_gratis" in raw
        ? raw.banner_frete_gratis === "true" || raw.banner_frete_gratis === "1"
        : DEFAULTS.banner_frete_gratis,
    frete_gratis_valor:
      "frete_gratis_valor" in raw
        ? Number(raw.frete_gratis_valor) || DEFAULTS.frete_gratis_valor
        : DEFAULTS.frete_gratis_valor,
    frete_gratis_regioes:
      raw.frete_gratis_regioes?.trim() || DEFAULTS.frete_gratis_regioes,
    pix_ativo:
      "pix_ativo" in raw
        ? raw.pix_ativo === "true" || raw.pix_ativo === "1"
        : DEFAULTS.pix_ativo,
    pix_desconto:
      "pix_desconto" in raw
        ? Number(raw.pix_desconto) || DEFAULTS.pix_desconto
        : DEFAULTS.pix_desconto,
    cartao_ativo:
      "cartao_ativo" in raw
        ? raw.cartao_ativo === "true" || raw.cartao_ativo === "1"
        : DEFAULTS.cartao_ativo,
    cartao_parcelas_max:
      "cartao_parcelas_max" in raw
        ? Number(raw.cartao_parcelas_max) || DEFAULTS.cartao_parcelas_max
        : DEFAULTS.cartao_parcelas_max,
    boleto_ativo:
      "boleto_ativo" in raw
        ? raw.boleto_ativo === "true" || raw.boleto_ativo === "1"
        : DEFAULTS.boleto_ativo,
  }
}

export function useStoreSettings(): {
  settings: StoreSettings
  loading: boolean
} {
  const [settings, setSettings] = useState<StoreSettings>(DEFAULTS)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function fetchSettings() {
      // 1. Tentar cache local primeiro
      const cached = readCache()
      if (cached) {
        if (!cancelled) {
          setSettings(cached)
          setLoading(false)
        }
        return
      }

      // 2. Buscar da API
      try {
        const res = await fetch(`${CRM_API}/api/store-settings`, {
          next: { revalidate: 0 }, // não usar cache do Next.js — gerenciamos aqui
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = await res.json()
        // A API retorna { settings: { chave: valor, ... } } ou { chave: valor }
        const raw: Record<string, string> =
          json?.settings && typeof json.settings === "object"
            ? json.settings
            : json
        const parsed = parseApiResponse(raw)
        writeCache(parsed)
        if (!cancelled) {
          setSettings(parsed)
          setLoading(false)
        }
      } catch {
        // Offline ou erro: usar defaults (não sobrescreve cache válido)
        if (!cancelled) {
          setSettings(DEFAULTS)
          setLoading(false)
        }
      }
    }

    fetchSettings()
    return () => { cancelled = true }
  }, [])

  return { settings, loading }
}
