/**
 * Busca as novidades da Papelaria Bibelô via endpoint público da API.
 *
 * O endpoint /api/public/novidades percorre as últimas NFs de entrada do Bling
 * e retorna apenas produtos que tenham:
 *   ✅ Foto válida
 *   ✅ Preço de venda > 0
 *   ✅ Descrição não vazia
 *   ✅ Estoque físico > 0
 *
 * Revalidação: controlada pelo Next.js ISR (revalidate = 300s na página).
 * Cache HTTP: 5 min no servidor, stale-while-revalidate de 10 min.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || process.env.API_URL || "http://localhost:4000"

export interface NovidadeProduct {
  id: string
  bling_id: string
  nome: string
  sku: string | null
  preco_venda: number
  imagem_url: string
  descricao: string
  categoria: string | null
  estoque: number
  nf_numero: string
  nf_data: string
  medusa_handle: string | null
}

export interface NovidadesResponse {
  novidades: NovidadeProduct[]
  total: number
  nf_numero: string | null
  atualizado_em: string
}

export async function getNovidadesBling(limit = 20): Promise<NovidadesResponse> {
  const empty: NovidadesResponse = { novidades: [], total: 0, nf_numero: null, atualizado_em: new Date().toISOString() }
  try {
    const url = `${API_URL}/api/public/novidades?limit=${limit}`
    const res = await fetch(url, {
      cache: "no-store", // SSR dinâmico — sempre atualizado
      headers: { Accept: "application/json" },
    })

    if (!res.ok) {
      console.error(`[novidades] Endpoint retornou ${res.status}`)
      return empty
    }

    return await res.json() as NovidadesResponse
  } catch (err) {
    console.error("[novidades] Erro ao buscar novidades:", err)
    return empty
  }
}
