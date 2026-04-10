/**
 * GET /api/public/frete?cep=XXXXX
 *
 * Calcula frete PAC + SEDEX via Melhor Envio para um CEP de destino.
 * Endpoint público — sem autenticação.
 *
 * Origem fixa: CEP 89093880 (Timbó/SC)
 * Pacote padrão: 0,5kg | 10×15×20cm
 */

import { Router, Request, Response } from "express"
import axios from "axios"
import rateLimit from "express-rate-limit"
import { queryOne } from "../db"
import { logger } from "../utils/logger"

export const publicFreteRouter = Router()

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Muitas requisições. Tente novamente em breve." },
})

const ME_BASE = "https://melhorenvio.com.br/api/v2"
const USER_AGENT = "BibeloEcommerce (carloseduardocostatj@gmail.com)"
const ORIGIN_CEP = "89093880"

async function getMeToken(): Promise<string> {
  const row = await queryOne<{ ultimo_id: string }>(
    "SELECT ultimo_id FROM sync.sync_state WHERE fonte = 'melhorenvio'"
  )
  if (!row?.ultimo_id) throw new Error("Token Melhor Envio não encontrado")
  const data = JSON.parse(row.ultimo_id)
  return data.access_token
}

publicFreteRouter.get("/", limiter, async (req: Request, res: Response) => {
  const rawCep = String(req.query.cep || "").replace(/\D/g, "")

  if (!rawCep || rawCep.length !== 8) {
    return res.status(400).json({ error: "CEP inválido. Informe 8 dígitos." })
  }

  try {
    const token = await getMeToken()

    const { data: rates } = await axios.post(
      `${ME_BASE}/me/shipment/calculate`,
      {
        from: { postal_code: ORIGIN_CEP },
        to:   { postal_code: rawCep },
        package: { height: 10, width: 15, length: 20, weight: 0.5 },
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "User-Agent":  USER_AGENT,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        timeout: 8000,
      }
    )

    const SERVICE_NAMES: Record<string, string[]> = {
      pac:   ["PAC"],
      sedex: ["SEDEX"],
      mini:  ["Mini Envios"],
    }

    const options: Array<{ id: string; name: string; price: number; delivery_days: number }> = []

    for (const [id, names] of Object.entries(SERVICE_NAMES)) {
      const rate = (rates as any[]).find(
        (r: any) => !r.error && names.some((n) => r.name?.includes(n))
      )
      if (rate) {
        options.push({
          id,
          name:          rate.name,
          price:         Math.round(parseFloat(rate.price) * 100), // centavos
          delivery_days: rate.delivery_time,
        })
      }
    }

    if (options.length === 0) {
      return res.status(404).json({
        error: "Sem opções de frete disponíveis para este CEP.",
      })
    }

    res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=600")
    return res.json({ cep: rawCep, options })
  } catch (err: any) {
    logger.error(`[public-frete] Erro ao calcular frete CEP ${rawCep}: ${err.message}`)
    return res.status(503).json({
      error: "Não foi possível calcular o frete agora. Tente na finalização do pedido.",
    })
  }
})
