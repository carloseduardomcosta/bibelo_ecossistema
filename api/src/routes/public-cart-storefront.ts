/**
 * POST /api/public/cart-storefront
 *
 * Registra um carrinho do storefront (Medusa) como pedido pendente no CRM.
 * Permite que o motor de recuperação de carrinho dispare emails de recuperação
 * após 2h sem pagamento, igual ao fluxo da NuvemShop.
 *
 * Endpoint público — sem autenticação. Rate limit aplicado.
 *
 * Body:
 *   email       — email do cliente identificado
 *   cart_id     — ID do carrinho Medusa (usado como ns_order_id com prefixo "medusa_")
 *   items       — [{ nome, preco }] lista de itens
 *   recovery_url — URL de recuperação (default: /carrinho)
 */

import { Router, Request, Response } from "express"
import { z } from "zod"
import rateLimit from "express-rate-limit"
import { query, queryOne } from "../db"
import { logger } from "../utils/logger"

export const publicCartStorefrontRouter = Router()

const publicLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Muitas requisições. Tente novamente em breve." },
})

const cartSchema = z.object({
  email: z.string().email().max(255),
  cart_id: z.string().min(1).max(100),
  items: z.array(
    z.object({
      nome: z.string().max(300),
      preco: z.number().min(0),
    })
  ).min(1).max(100),
  recovery_url: z.string().url().max(2000).optional(),
})

publicCartStorefrontRouter.post("/", publicLimiter, async (req: Request, res: Response) => {
  const parsed = cartSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: "Dados inválidos" })
    return
  }

  const { email, cart_id, items, recovery_url } = parsed.data
  const nsOrderId = `medusa_${cart_id}`

  try {
    // Busca o customer pelo email para vincular
    const customer = await queryOne<{ id: string }>(
      "SELECT id FROM crm.customers WHERE LOWER(email) = LOWER($1)",
      [email]
    )

    // Verifica se já existe registro para este carrinho (idempotente)
    const existing = await queryOne<{ id: string }>(
      "SELECT id FROM marketing.pedidos_pendentes WHERE ns_order_id = $1",
      [nsOrderId]
    )

    if (existing) {
      // Já registrado — responde OK sem duplicar
      res.json({ ok: true })
      return
    }

    const valor = items.reduce((acc, item) => acc + item.preco, 0)
    const expiraEm = new Date(Date.now() + 2 * 60 * 60 * 1000) // +2h

    await query(
      `INSERT INTO marketing.pedidos_pendentes
         (ns_order_id, customer_id, email, valor, itens, expira_em, recovery_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        nsOrderId,
        customer?.id || null,
        email,
        valor / 100, // itens chegam em centavos do Medusa
        JSON.stringify(items),
        expiraEm,
        recovery_url || null,
      ]
    )

    logger.info("Carrinho storefront registrado para recuperação", {
      cartId: cart_id,
      email,
      itens: items.length,
    })

    res.json({ ok: true })
  } catch (error) {
    logger.error("Erro ao registrar carrinho storefront", { error })
    res.status(500).json({ ok: false, error: "Erro interno" })
  }
})
