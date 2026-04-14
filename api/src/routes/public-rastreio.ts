/**
 * GET /api/public/rastreio?codigo=AN817294331BR
 * GET /api/public/rastreio?pedido=265
 *
 * Endpoint público (sem auth) para rastreio de envios.
 * Busca no banco local e atualiza via API Bling se necessário.
 *
 * Rate limit: 30 req/min por IP
 */

import { Router, Request, Response } from "express"
import rateLimit from "express-rate-limit"
import { z } from "zod"
import { queryOne } from "../db"
import { refreshTrackingCode } from "../integrations/bling/logistica"
import { logger } from "../utils/logger"

export const publicRastreioRouter = Router()

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Muitas requisições. Tente novamente em breve." },
})

// Mapa de situação → label amigável
const SITUACAO_LABEL: Record<number, string> = {
  0: "Objeto postado",
  1: "Em trânsito",
  2: "Saiu para entrega",
  3: "Tentativa de entrega",
  4: "Entregue",
  5: "Devolvido",
  6: "Aguardando retirada",
}

const SITUACAO_COR: Record<number, string> = {
  0: "blue",
  1: "yellow",
  2: "orange",
  3: "orange",
  4: "green",
  5: "red",
  6: "purple",
}

const querySchema = z.object({
  codigo: z.string().min(1).max(30).optional(),
  pedido: z.string().min(1).max(20).optional(),
})

interface LogisticaRow {
  bling_objeto_id: string
  bling_pedido_id: string | null
  tracking_code: string
  url_rastreio: string | null
  servico_nome: string | null
  status_descricao: string | null
  situacao: number
  origem: string | null
  destino: string | null
  ultima_alteracao: string | null
  data_saida: string | null
  prazo_entrega_dias: number | null
  frete_previsto: string | null
  valor_declarado: string | null
  sincronizado_em: string
  // campos do pedido (join)
  numero_pedido: string | null
  nome_cliente: string | null
}

publicRastreioRouter.get("/", limiter, async (req: Request, res: Response) => {
  const parsed = querySchema.safeParse(req.query)
  if (!parsed.success) {
    return res.status(400).json({ error: "Parâmetro inválido. Use ?codigo= ou ?pedido=" })
  }

  const { codigo, pedido } = parsed.data

  if (!codigo && !pedido) {
    return res.status(400).json({
      error: "Informe ?codigo=AN817294331BR ou ?pedido=265",
    })
  }

  try {
    let row: LogisticaRow | null = null

    if (codigo) {
      row = await queryOne<LogisticaRow>(
        `SELECT lo.*,
                bo.numero  AS numero_pedido,
                bc.nome    AS nome_cliente
         FROM sync.logistica_objetos lo
         LEFT JOIN sync.bling_orders  bo ON bo.bling_id = lo.bling_pedido_id::varchar
         LEFT JOIN crm.customers      bc ON bc.id = bo.customer_id
         WHERE lo.tracking_code = $1`,
        [codigo.toUpperCase()]
      )
    } else if (pedido) {
      // Busca por número do pedido Bling (campo "numero" em bling_orders)
      row = await queryOne<LogisticaRow>(
        `SELECT lo.*,
                bo.numero  AS numero_pedido,
                bc.nome    AS nome_cliente
         FROM sync.logistica_objetos lo
         JOIN  sync.bling_orders  bo ON bo.bling_id = lo.bling_pedido_id::varchar
         LEFT JOIN crm.customers  bc ON bc.id = bo.customer_id
         WHERE bo.numero = $1`,
        [pedido]
      )
    }

    if (!row) {
      return res.status(404).json({
        error: "Envio não encontrado. Verifique o código de rastreio ou número do pedido.",
      })
    }

    // Atualiza via Bling se dados têm mais de 1 hora
    const sincronizadoEm = new Date(row.sincronizado_em)
    const umHoraAtras = new Date(Date.now() - 60 * 60 * 1000)
    if (sincronizadoEm < umHoraAtras) {
      // Fire-and-forget — não bloqueia a resposta
      refreshTrackingCode(row.tracking_code).catch((err) => {
        logger.warn(`[public-rastreio] Falha no refresh background: ${err.message}`)
      })
    }

    const situacao = Number(row.situacao)
    const entregue = situacao === 4

    // Calcular previsão de entrega
    let previsaoEntrega: string | null = null
    if (row.data_saida && row.prazo_entrega_dias) {
      const saida = new Date(row.data_saida)
      saida.setDate(saida.getDate() + row.prazo_entrega_dias)
      previsaoEntrega = saida.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
    }

    return res.json({
      tracking_code: row.tracking_code,
      servico: row.servico_nome || "Correios",
      status: {
        codigo: situacao,
        label: row.status_descricao || SITUACAO_LABEL[situacao] || "Em processamento",
        cor: SITUACAO_COR[situacao] || "gray",
        entregue,
      },
      ultima_atualizacao: row.ultima_alteracao,
      data_saida: row.data_saida,
      prazo_entrega_dias: row.prazo_entrega_dias,
      previsao_entrega: previsaoEntrega,
      origem: row.origem || null,
      destino: row.destino || null,
      url_rastreio: row.url_rastreio,
      pedido: row.numero_pedido
        ? { numero: row.numero_pedido, cliente: row.nome_cliente || null }
        : null,
    })
  } catch (err: any) {
    logger.error(`[public-rastreio] Erro: ${err.message}`)
    return res.status(503).json({
      error: "Não foi possível consultar o rastreio agora. Tente novamente.",
    })
  }
})
