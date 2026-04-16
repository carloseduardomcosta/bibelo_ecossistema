/**
 * GET /api/public/novidades
 *
 * Retorna os produtos da NF de entrada mais recente que tenha
 * pelo menos 1 produto válido.
 *
 * Critérios de validação (todos obrigatórios):
 *   ✅ Produto ativo no Bling
 *   ✅ Tem pelo menos 1 foto com URL válida (http/https)
 *   ✅ Tem preço de venda > 0
 *   ✅ Tem descrição não vazia (após strip de HTML)
 *   ✅ Tem estoque físico > 0
 *
 * Lógica de busca:
 *   1. Olha as últimas 10 NFs de entrada
 *   2. Para cada NF (mais recente primeiro), pega os produtos válidos
 *   3. Retorna todos os produtos válidos da NF mais recente que tiver algum
 *   4. Nunca mistura produtos de NFs diferentes
 *
 * Assim: quando chegar uma nova NF, a seção Novidades atualiza
 * automaticamente para mostrar os produtos daquela entrega.
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
  medusa_handle: string | null
}

const RE_TAG = /<("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^'">])*>/g

/** Remove tags HTML e entidades básicas, retorna texto limpo.
 *  Faz 2 passagens: alguns textos têm HTML-encoded dentro de HTML
 *  (ex: &lt;article&gt; dentro de <div>), então após decode pode
 *  aparecer HTML novo que também precisa ser removido.
 */
function stripHtml(html: string): string {
  function onePass(s: string): string {
    return s
      .replace(RE_TAG, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/&[a-z]+;/gi, " ")
      .replace(/\s+/g, " ")
      .trim()
  }
  const pass1 = onePass(html)
  // Segunda passagem para limpar HTML que estava entity-encoded no primeiro nível
  const pass2 = onePass(pass1)
  // Remove tags incompletas (sem '>') que sobram por truncamento no banco
  const clean = pass2.replace(/<[^>]*$/, "").replace(/\s+/g, " ").trim()
  // Se ainda tiver HTML depois de 2 passagens, retorna vazio (fallback para nome)
  return /<[a-z]/i.test(clean) ? "" : clean
}

// ── GET /api/public/novidades ─────────────────────────────────
publicNovidadesRouter.get("/", async (req: Request, res: Response) => {
  const parsedLimit = parseInt(String(req.query.limit || "20"), 10)
  const limit = Math.min(Math.max(1, isNaN(parsedLimit) ? 20 : parsedLimit), 50)

  try {
    /**
     * CTE em 3 passos:
     * 1. nf_candidates   — últimas 10 NFs não canceladas
     * 2. valid_products  — produtos válidos nessas NFs
     * 3. latest_nf       — a NF mais recente que tem >= 1 produto válido
     * Retorno: todos os produtos válidos dessa NF, ordenados por item
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
      medusa_handle: string | null
    }>(
      `
      WITH nf_candidates AS (
        SELECT id, numero, data_emissao, criado_em
        FROM financeiro.notas_entrada
        WHERE status != 'cancelada'
        ORDER BY data_emissao DESC, criado_em DESC
        LIMIT 10
      ),
      valid_products AS (
        SELECT
          bp.id,
          bp.bling_id,
          bp.nome,
          bp.sku,
          bp.preco_venda::text                AS preco_venda,
          bp.imagens::text                    AS imagens,
          bp.dados_raw::text                  AS dados_raw,
          bp.categoria,
          nf.id                               AS nf_id,
          nf.numero                           AS nf_numero,
          nf.data_emissao::text               AS nf_data,
          nf.data_emissao                     AS nf_sort,
          nf.criado_em                        AS nf_criado_em,
          nei.numero_item,
          COALESCE(ppc_sku.medusa_handle, ppc_pai.medusa_handle) AS medusa_handle,
          -- Estoque = saldo do próprio produto + soma dos filhos (variantes).
          -- No Bling o produto pai fica zerado; o estoque real está nos filhos.
          COALESCE(MAX(bs.saldo_fisico), 0) + COALESCE((
            SELECT SUM(bsf.saldo_fisico)
            FROM sync.bling_products bpf
            JOIN sync.bling_stock bsf ON bsf.bling_product_id = bpf.bling_id
            WHERE (bpf.dados_raw->>'idProdutoPai')::text = bp.bling_id::text
              AND bsf.saldo_fisico > 0
          ), 0) AS saldo_fisico
        FROM nf_candidates nf
        JOIN financeiro.notas_entrada_itens nei
          ON nei.nota_id = nf.id
        JOIN sync.bling_products bp
          ON (
            TRIM(bp.sku)  = TRIM(nei.codigo_produto)
            OR bp.gtin    = nei.codigo_produto
            OR (nei.gtin IS NOT NULL AND bp.gtin = nei.gtin)
            -- variações: normaliza separador " - " → " " (ex: "YINS - AZUL" = "YINS AZUL")
            OR REPLACE(TRIM(bp.sku), ' - ', ' ') = REPLACE(TRIM(nei.codigo_produto), ' - ', ' ')
          )
          AND bp.ativo = true
          AND bp.preco_venda > 0
          AND jsonb_array_length(bp.imagens) > 0
        LEFT JOIN sync.bling_stock bs
          ON bs.bling_product_id = bp.bling_id
        LEFT JOIN sync.product_publish_control ppc_sku
          ON ppc_sku.sku = bp.sku
        LEFT JOIN sync.product_publish_control ppc_pai
          ON ppc_pai.bling_id::text = (bp.dados_raw->>'idProdutoPai')
          AND (bp.dados_raw->>'idProdutoPai') IS NOT NULL
          AND (bp.dados_raw->>'idProdutoPai') != '0'
        GROUP BY
          bp.id, bp.bling_id, bp.nome, bp.sku, bp.preco_venda,
          bp.imagens, bp.dados_raw, bp.categoria,
          nf.id, nf.numero, nf.data_emissao, nf.criado_em, nei.numero_item,
          ppc_sku.medusa_handle, ppc_pai.medusa_handle
        HAVING (
          COALESCE(MAX(bs.saldo_fisico), 0) > 0
          OR EXISTS (
            SELECT 1 FROM sync.bling_products bpf
            JOIN sync.bling_stock bsf ON bsf.bling_product_id = bpf.bling_id
            WHERE (bpf.dados_raw->>'idProdutoPai')::text = bp.bling_id::text
              AND bsf.saldo_fisico > 0
          )
        )
      ),
      latest_nf AS (
        SELECT nf_id
        FROM valid_products
        ORDER BY nf_sort DESC, nf_criado_em DESC
        LIMIT 1
      )
      SELECT vp.*
      FROM valid_products vp
      JOIN latest_nf ln ON ln.nf_id = vp.nf_id
      ORDER BY vp.numero_item ASC
      LIMIT $1
      `,
      [limit]
    )

    // Validação extra no JS + strip HTML
    const novidades: NovidadeProduct[] = []
    const seen = new Set<string>()

    for (const row of rows) {
      if (seen.has(row.bling_id)) continue

      // Parse imagens — pega primeira URL válida
      let imagens: Array<{ url?: string; link?: string }> = []
      try {
        imagens = JSON.parse(row.imagens || "[]")
      } catch {
        logger.warn(`[novidades] Falha ao parsear imagens: ${row.bling_id}`)
        continue
      }

      const imagemUrl = imagens
        .map((img) => img.url || img.link || "")
        .find((url) => url.startsWith("http"))

      if (!imagemUrl) {
        logger.info(`[novidades] Pulado (sem imagem): ${row.nome}`)
        continue
      }

      // Parse descrição + strip HTML
      let descricao = ""
      try {
        const raw = JSON.parse(row.dados_raw || "{}")
        const htmlDesc = (raw.descricao || raw.descricaoCurta || "").trim()
        descricao = stripHtml(htmlDesc)
      } catch {
        // ignora erro de parse
      }

      // Fallback para nome se descrição vazia após strip
      if (!descricao || descricao.length < 4) {
        descricao = row.nome
      }

      const precoVenda = parseFloat(row.preco_venda)
      const estoque = parseFloat(row.saldo_fisico)

      if (precoVenda <= 0 || estoque <= 0) {
        logger.info(`[novidades] Pulado (preço/estoque): ${row.nome}`)
        continue
      }

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
        medusa_handle: row.medusa_handle ?? null,
      })
    }

    const nfNumero = novidades[0]?.nf_numero ?? null
    logger.info(`[novidades] NF #${nfNumero} → ${novidades.length} produto(s) válido(s) de ${rows.length} candidato(s)`)

    res.set("Cache-Control", "public, max-age=300, stale-while-revalidate=600")
    res.json({
      novidades,
      total: novidades.length,
      nf_numero: nfNumero,
      atualizado_em: new Date().toISOString(),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido"
    logger.error("[novidades] Erro ao buscar novidades", { error: msg })
    res.status(500).json({ error: "Erro ao buscar novidades", novidades: [] })
  }
})
