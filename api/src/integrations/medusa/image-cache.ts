/**
 * Cache local de imagens de produtos em ALTA QUALIDADE
 * Busca detalhe do Bling → midia.imagens.internas[].link (HD, sem /t/)
 * Salva em /uploads/products/{bling_id}.jpg
 * Serve via URL pública permanente
 */

import fs from "fs"
import path from "path"
import { logger } from "../../utils/logger"
import { getValidToken, BLING_API } from "../bling/auth"
import { rateLimitedGet } from "../bling/sync"

const UPLOAD_DIR = path.join(process.cwd(), "uploads", "products")
const PUBLIC_BASE = process.env.IMAGE_PUBLIC_BASE || "https://api.papelariabibelo.com.br/api/images/products"

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true })
}

/**
 * Busca URL HD da imagem via detalhe do produto no Bling
 */
async function getHdImageUrl(blingId: string, token: string): Promise<string | null> {
  try {
    const detail = await rateLimitedGet<{ data: { midia?: { imagens?: { internas?: Array<{ link?: string }> } } } }>(
      `${BLING_API}/produtos/${blingId}`,
      token
    )
    const internas = detail.data?.midia?.imagens?.internas
    return internas?.[0]?.link || null
  } catch {
    return null
  }
}

/**
 * Baixa imagem HD e salva localmente
 */
async function downloadImage(url: string, filepath: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "BibeloCRM/1.0" },
      redirect: "follow",
    })
    if (!res.ok) return false

    const buffer = Buffer.from(await res.arrayBuffer())
    if (buffer.length < 1000) return false // muito pequeno = erro

    fs.writeFileSync(filepath, buffer)
    return true
  } catch {
    return false
  }
}

/**
 * Cachear imagens HD de todos os produtos
 * Busca detalhe do Bling para cada produto sem imagem HD cacheada
 * Rate limited: 350ms entre chamadas (via rateLimitedGet)
 */
export async function cacheAllProductImages(
  products: Array<{ bling_id: string; imagens: Array<{ url: string }> | null }>
): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  let cached = 0
  let downloaded = 0
  let failed = 0
  let skipped = 0

  const token = await getValidToken()

  for (const product of products) {
    if (!product.imagens?.length || !product.imagens[0]?.url) {
      skipped++
      continue
    }

    const filename = `${product.bling_id}.jpg`
    const filepath = path.join(UPLOAD_DIR, filename)
    const publicUrl = `${PUBLIC_BASE}/${filename}`

    // Se já existe com tamanho bom (>5KB = HD), usar cache
    if (fs.existsSync(filepath)) {
      const stat = fs.statSync(filepath)
      if (stat.size > 5000) {
        map.set(product.bling_id, publicUrl)
        cached++
        continue
      }
    }

    // Buscar URL HD via detalhe do produto
    const hdUrl = await getHdImageUrl(product.bling_id, token)
    if (hdUrl) {
      const ok = await downloadImage(hdUrl, filepath)
      if (ok) {
        map.set(product.bling_id, publicUrl)
        downloaded++
      } else {
        failed++
      }
    } else {
      // Fallback: usar miniatura do listing
      const miniUrl = product.imagens[0].url
      const ok = await downloadImage(miniUrl, filepath)
      if (ok) {
        map.set(product.bling_id, publicUrl)
        downloaded++
      } else {
        failed++
      }
    }

    if ((downloaded + failed) % 50 === 0 && (downloaded + failed) > 0) {
      logger.info(`Image cache HD: ${downloaded} novas, ${cached} cache, ${failed} falhas...`)
    }
  }

  logger.info(`Image cache HD concluído: ${downloaded} novas, ${cached} cache, ${failed} falhas, ${skipped} sem imagem`)
  return map
}
