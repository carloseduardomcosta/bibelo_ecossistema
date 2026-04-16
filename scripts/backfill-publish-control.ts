/**
 * Backfill de sync.product_publish_control
 *
 * Lê todos os produtos do Medusa e popula a tabela de controle:
 *   - published → approved  (já estão na loja, continuar publicando)
 *   - draft     → pending   (aguardam revisão de curadoria)
 *
 * Usa ON CONFLICT DO NOTHING — entradas existentes não são sobrescritas.
 *
 * Uso (dentro do container API):
 *   docker compose exec api npx ts-node /app/scripts/backfill-publish-control.ts
 */

import { Pool } from "pg"

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

const MEDUSA_URL   = process.env.MEDUSA_BACKEND_URL    || "http://localhost:9000"
const MEDUSA_EMAIL = process.env.MEDUSA_ADMIN_EMAIL    || "contato@papelariabibelo.com.br"
const MEDUSA_PASS  = process.env.MEDUSA_ADMIN_PASSWORD || ""

// ── Auth Medusa ───────────────────────────────────────────────

async function getMedusaToken(): Promise<string> {
  const res = await fetch(`${MEDUSA_URL}/auth/user/emailpass`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: MEDUSA_EMAIL, password: MEDUSA_PASS }),
  })
  if (!res.ok) throw new Error(`Medusa auth falhou: ${res.status}`)
  const data = (await res.json()) as { token: string }
  return data.token
}

async function medusaGet<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${MEDUSA_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Medusa GET ${path} → ${res.status}`)
  return res.json() as Promise<T>
}

// ── Backfill ──────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("Backfill product_publish_control — iniciando...")

  const token = await getMedusaToken()
  console.log("Medusa: autenticado")

  // Pré-carregar mapa SKU → bling_id do banco local
  const blingRows = await pool.query<{ sku: string; bling_id: string; nome: string; categoria: string | null }>(
    `SELECT sku, bling_id::text, nome, categoria
     FROM sync.bling_products
     WHERE sku IS NOT NULL AND sku != ''`
  )
  const blingBySku = new Map<string, { blingId: string; nome: string; categoria: string | null }>()
  for (const r of blingRows.rows) {
    blingBySku.set(r.sku, { blingId: r.bling_id, nome: r.nome, categoria: r.categoria })
  }
  console.log(`Bling: ${blingBySku.size} produtos com SKU carregados`)

  let offset = 0
  const limit = 100
  let totalMapeados = 0
  let totalAprovados = 0
  let totalPendentes = 0
  let totalPulados = 0

  while (true) {
    const data = await medusaGet<{
      products: Array<{
        id: string
        status: string
        variants: Array<{ sku: string }>
      }>
      count: number
    }>(`/admin/products?limit=${limit}&offset=${offset}&fields=id,status,variants.sku`, token)

    if (data.products.length === 0) break

    for (const product of data.products) {
      for (const variant of product.variants ?? []) {
        const sku = variant.sku
        if (!sku) continue

        const bling = blingBySku.get(sku)
        const controlStatus = product.status === "published" ? "approved" : "pending"

        const result = await pool.query(
          `INSERT INTO sync.product_publish_control
           (sku, bling_id, medusa_id, status, missing_image, missing_price, unmapped_category, nome_original, categoria_bling, updated_at)
           VALUES ($1, $2, $3, $4, false, false, false, $5, $6, NOW())
           ON CONFLICT (sku) DO NOTHING`,
          [
            sku,
            bling?.blingId ? parseInt(bling.blingId, 10) : null,
            product.id,
            controlStatus,
            bling?.nome ?? null,
            bling?.categoria ?? null,
          ]
        )

        if (result.rowCount && result.rowCount > 0) {
          totalMapeados++
          if (controlStatus === "approved") totalAprovados++
          else totalPendentes++
        } else {
          totalPulados++ // já existia, ON CONFLICT DO NOTHING
        }
      }
    }

    console.log(`  offset=${offset} → ${Math.min(offset + limit, data.count)}/${data.count} processados...`)
    offset += limit
    if (offset >= data.count) break
  }

  console.log("\n─── Resultado ───────────────────────────────")
  console.log(`Inseridos:  ${totalMapeados} (approved: ${totalAprovados}, pending: ${totalPendentes})`)
  console.log(`Pulados:    ${totalPulados} (já existiam na tabela)`)
  console.log("─────────────────────────────────────────────")
}

main()
  .catch((err) => {
    console.error("Backfill falhou:", err)
    process.exit(1)
  })
  .finally(() => pool.end())
