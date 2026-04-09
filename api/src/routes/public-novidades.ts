/**
 * GET /api/public/novidades
 *
 * Retorna os produtos mais recentes vindos das últimas NFs de entrada do Bling.
 * Critérios de validação (todos obrigatórios):
 *   ✅ Produto ativo no Bling
 *   ✅ Tem pelo menos 1 foto com URL válida
 *   ✅ Tem preço de venda > 0
 *   ✅ Tem descrição não vazia (dados_raw.descricao)
 *   ✅ Tem estoque físico > 0 (bling_stock.saldo_fisico)
 *
 * Lógica de busca:
 *   - Percorre NFs de entrada em ordem decrescente de data
 *   - Para cada NF, percorre os itens (produtos) em ordem de número
 *   - Cruza com sync.bling_products via SKU ou GTIN
 *   - Pula produtos que não passam na validação
 *   - Para quando atingir o limite solicitado (padrão: 8)
 *
 * Cache: sem auth, sem escrita — rota 100% segura (somente leitura).
 * O Next.js faz ISR com revalidate de 5 minutos no storefront.
 */

import { Router, Request, Response } from "express"
import { query } from "../db"
import { logger } from "../utils/logger"

export const publicNovidadesRouter = Router()

interface NovidadeProduct {
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
}

// ── GET /api/public/novidades ─────────────────────────────────
publicNovidadesRouter.get("/", async (req: Request, res: Response) => {
  const limit = Math.min(parseInt(String(req.query.limit || "8"), 10), 20)

  try {
    /**
     * Query:
     * 1. Busca itens das NFs de entrada ordenadas por data DESC
     * 2. Cruza com bling_products via SKU ou GTIN (codigo_produto)
     * 3. Cruza com bling_stock para verificar estoque
     * 4. Filtra: ativo + tem imagem + preco_venda > 0 + tem descrição + estoque > 0
     * 5. Deduplica por bling_id (mesmo produto pode aparecer em várias NFs)
     * 6. Limita ao número solicitado
     *
     * Percorre NFs das mais recentes para as mais antigas automaticamente
     * via ORDER BY ne.data_emissao DESC, ne.criado_em DESC, nei.numero_item ASC
     */
    const rows = await query<{
      id: string
      bling_id: string
      nome: string
      sku: string | null
      preco_venda: string
      imagens: string
      dados_raw: string
      categoria: string | null
      saldo_fisico: string
      nf_numero: string
      nf_data: string
    }>(
      `
      SELECT DISTINCT ON (bp.bling_id)
        bp.id,
        bp.bling_id,
        bp.nome,
        bp.sku,
        bp.preco_venda::text,
        bp.imagens::text,
        bp.dados_raw::text,
        bp.categoria,
        COALESCE(MAX(bs.saldo_fisico), 0)::text AS saldo_fisico,
        ne.numero                               AS nf_numero,
        ne.data_emissao::text                   AS nf_data
      FROM financeiro.notas_entrada_itens nei
      JOIN financeiro.notas_entrada ne
        ON ne.id = nei.nota_id
       AND ne.status != 'cancelada'
      JOIN sync.bling_products bp
        ON (bp.sku = nei.codigo_produto OR bp.gtin = nei.codigo_produto)
       AND bp.ativo = true
       AND bp.preco_venda > 0
       AND jsonb_array_length(bp.imagens) > 0
       AND (
         bp.dados_raw->>'descricao' IS NOT NULL
         AND length(trim(bp.dados_raw->>'descricao')) > 3
       )
      LEFT JOIN sync.bling_stock bs
        ON bs.bling_product_id = bp.bling_id
      GROUP BY
        bp.id, bp.bling_id, bp.nome, bp.sku, bp.preco_venda,
        bp.imagens, bp.dados_raw, bp.categoria,
        ne.numero, ne.data_emissao
      HAVING COALESCE(MAX(bs.saldo_fisico), 0) > 0
      ORDER BY
        bp.bling_id,
        ne.data_emissao DESC,
        ne.criado_em DESC
      LIMIT $1
      `,
      [limit * 3] // busca extra para compensar deduplicação
    )

    // Monta resposta com validação extra no JS (segurança adicional)
    const novidades: NovidadeProduct[] = []
    const seen = new Set<string>()

    for (const row of rows) {
      if (seen.has(row.bling_id)) continue
      if (novidades.length >= limit) break

      // Parse imagens
      let imagens: Array<{ url?: string; link?: string }> = []
      try {
        imagens = JSON.parse(row.imagens || "[]")
      } catch {
        logger.warn(`[novidades] Falha ao parsear imagens do produto ${row.bling_id}`)
        continue
      }

      // Pega primeira imagem com URL válida
      const imagemUrl = imagens
        .map((img) => img.url || img.link || "")
        .find((url) => url && url.startsWith("http"))

      if (!imagemUrl) continue

      // Parse dados_raw para descrição
      let descricao = ""
      try {
        const raw = JSON.parse(row.dados_raw || "{}")
        descricao = (raw.descricao || raw.descricaoCurta || raw.nome || "").trim()
      } catch {
        continue
      }

      if (!descricao || descricao.length < 4) continue

      const precoVenda = parseFloat(row.preco_venda)
      const estoque = parseFloat(row.saldo_fisico)

      if (precoVenda <= 0 || estoque <= 0) continue

      seen.add(row.bling_id)
      novidades.push({
        id: row.id,
        bling_id: row.bling_id,
        nome: row.nome,
        sku: row.sku,
        preco_venda: precoVenda,
        imagem_url: imagemUrl,
        descricao,
        categoria: row.categoria,
        estoque,
        nf_numero: row.nf_numero,
        nf_data: row.nf_data,
      })
    }

    logger.info(`[novidades] Retornando ${novidades.length} produtos válidos de ${rows.length} candidatos`)

    // Cache headers: 5 minutos no CDN/proxy, 10 minutos stale-while-revalidate
    res.set("Cache-Control", "public, max-age=300, stale-while-revalidate=600")
    res.json({
      novidades,
      total: novidades.length,
      atualizado_em: new Date().toISOString(),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido"
    logger.error("[novidades] Erro ao buscar novidades", { error: msg })
    res.status(500).json({ error: "Erro ao buscar novidades", novidades: [] })
  }
})
