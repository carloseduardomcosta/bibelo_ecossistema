/**
 * Bling Logística — Sync de objetos logísticos (rastreio)
 *
 * Fluxo: Carlos cria remessa no Bling (Melhor Envio) → Bling atribui
 * tracking code → este módulo sincroniza via API Bling e salva localmente.
 *
 * API Bling usada:
 *   GET /logisticas/{idLogistica}/remessas?situacao={n}  → lista remessas
 *   GET /logisticas/objetos/{idObjeto}                   → detalhe + rastreio
 *
 * Situações de remessa Bling: 0–5 (testado: 5=postada/ativa)
 */

import axios from "axios"
import { query, queryOne } from "../../db"
import { logger } from "../../utils/logger"

const BLING_BASE = "https://www.bling.com.br/Api/v3"

// ID da integração Melhor Envio no Bling desta conta
const LOGISTICA_ID = Number(process.env.BLING_LOGISTICA_ID) || 922962

// Situações de remessa a sincronizar (todas, para não perder nenhuma)
const SITUACOES = [0, 1, 2, 3, 4, 5]

// ── Token ─────────────────────────────────────────────────────

async function getBlingToken(): Promise<string> {
  const row = await queryOne<{ ultimo_id: string }>(
    "SELECT ultimo_id FROM sync.sync_state WHERE fonte = 'bling'"
  )
  if (!row?.ultimo_id) throw new Error("Token Bling não encontrado no banco")
  const data = JSON.parse(row.ultimo_id)
  return data.access_token
}

// ── API helper ────────────────────────────────────────────────

async function blingGet<T>(path: string, token: string, retries = 3): Promise<T> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await axios.get(`${BLING_BASE}${path}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
        timeout: 10000,
      })
      return res.data as T
    } catch (err: any) {
      if (err?.response?.status === 429 && attempt < retries) {
        // Rate limit — aguarda 2s antes de tentar novamente
        await new Promise((r) => setTimeout(r, 2000 * attempt))
        continue
      }
      throw err
    }
  }
  throw new Error("Máximo de tentativas atingido")
}

// ── Tipos Bling ───────────────────────────────────────────────

interface BlingRemessa {
  id: number
  objetos: number[]
  situacao: number
  descricao: string
  dataCriacao: string
}

interface BlingObjeto {
  id: number
  pedidoVenda?: { id: number }
  notaFiscal?: { id: number }
  servico?: { nome: string; codigo: string }
  rastreamento: {
    codigo: string
    descricao: string
    situacao: number
    origem: string
    destino: string
    ultimaAlteracao: string
    url: string
  }
  dimensao?: { peso: number }
  dataSaida?: string
  prazoEntregaPrevisto?: number
  fretePrevisto?: number
  valorDeclarado?: number
}

// ── Sync principal ────────────────────────────────────────────

export async function syncLogisticaObjetos(logisticaId: number = LOGISTICA_ID): Promise<{
  salvos: number
  atualizados: number
  erros: number
}> {
  const token = await getBlingToken()
  let salvos = 0
  let atualizados = 0
  let erros = 0

  logger.info(`[logistica] Iniciando sync remessas logística ${logisticaId}`)

  // Coletar IDs de objetos de todas as situações
  const objetoIds = new Set<number>()
  const objetoRemessa = new Map<number, number>() // objetoId → remessaId

  for (const situacao of SITUACOES) {
    try {
      const data = await blingGet<{ data: BlingRemessa[] }>(
        `/logisticas/${logisticaId}/remessas?situacao=${situacao}`,
        token
      )
      for (const remessa of data.data || []) {
        for (const objId of remessa.objetos || []) {
          objetoIds.add(objId)
          objetoRemessa.set(objId, remessa.id)
        }
      }
    } catch (err: any) {
      // situação pode não existir — ignora
      if (err?.response?.status !== 400) {
        logger.warn(`[logistica] Erro ao listar remessas situacao=${situacao}: ${err.message}`)
      }
    }
  }

  logger.info(`[logistica] ${objetoIds.size} objetos encontrados`)

  // Buscar detalhe de cada objeto e salvar
  for (const objId of objetoIds) {
    try {
      const { data: obj } = await blingGet<{ data: BlingObjeto }>(
        `/logisticas/objetos/${objId}`,
        token
      )

      const rastreio = obj.rastreamento
      if (!rastreio?.codigo) continue

      const ultimaAlteracao = rastreio.ultimaAlteracao
        ? new Date(rastreio.ultimaAlteracao).toISOString()
        : null

      // UPSERT — atualiza status se objeto já existe
      const existing = await queryOne<{ id: string }>(
        "SELECT id FROM sync.logistica_objetos WHERE bling_objeto_id = $1",
        [objId]
      )

      if (existing) {
        await query(
          `UPDATE sync.logistica_objetos
           SET status_descricao = $1,
               situacao         = $2,
               origem           = $3,
               destino          = $4,
               ultima_alteracao = $5,
               url_rastreio     = $6,
               sincronizado_em  = now()
           WHERE bling_objeto_id = $7`,
          [
            rastreio.descricao,
            rastreio.situacao,
            rastreio.origem || "",
            rastreio.destino || "",
            ultimaAlteracao,
            rastreio.url || null,
            objId,
          ]
        )
        atualizados++
      } else {
        await query(
          `INSERT INTO sync.logistica_objetos (
             bling_objeto_id, bling_remessa_id, bling_pedido_id,
             tracking_code, url_rastreio, servico_nome,
             status_descricao, situacao, origem, destino,
             ultima_alteracao, data_saida, prazo_entrega_dias,
             frete_previsto, valor_declarado
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
          [
            objId,
            objetoRemessa.get(objId) || null,
            obj.pedidoVenda?.id || null,
            rastreio.codigo,
            rastreio.url || null,
            obj.servico?.nome || null,
            rastreio.descricao,
            rastreio.situacao,
            rastreio.origem || "",
            rastreio.destino || "",
            ultimaAlteracao,
            obj.dataSaida || null,
            obj.prazoEntregaPrevisto || null,
            obj.fretePrevisto || null,
            obj.valorDeclarado || null,
          ]
        )
        salvos++
      }

      // Delay mínimo para respeitar rate limit Bling (3 req/s)
      await new Promise((r) => setTimeout(r, 350))
    } catch (err: any) {
      logger.error(`[logistica] Erro ao processar objeto ${objId}: ${err.message}`)
      erros++
    }
  }

  logger.info(
    `[logistica] Sync concluído — salvos=${salvos} atualizados=${atualizados} erros=${erros}`
  )
  return { salvos, atualizados, erros }
}

// ── Buscar objeto por tracking code (para refresh sob demanda) ─

export async function refreshTrackingCode(trackingCode: string): Promise<boolean> {
  const token = await getBlingToken()

  // Buscar o objeto local para obter o bling_objeto_id
  const local = await queryOne<{ bling_objeto_id: string }>(
    "SELECT bling_objeto_id FROM sync.logistica_objetos WHERE tracking_code = $1",
    [trackingCode.toUpperCase()]
  )
  if (!local) return false

  try {
    const { data: obj } = await blingGet<{ data: BlingObjeto }>(
      `/logisticas/objetos/${local.bling_objeto_id}`,
      token
    )

    const rastreio = obj.rastreamento
    if (!rastreio) return false

    const ultimaAlteracao = rastreio.ultimaAlteracao
      ? new Date(rastreio.ultimaAlteracao).toISOString()
      : null

    await query(
      `UPDATE sync.logistica_objetos
       SET status_descricao = $1,
           situacao         = $2,
           origem           = $3,
           destino          = $4,
           ultima_alteracao = $5,
           url_rastreio     = $6,
           sincronizado_em  = now()
       WHERE tracking_code = $7`,
      [
        rastreio.descricao,
        rastreio.situacao,
        rastreio.origem || "",
        rastreio.destino || "",
        ultimaAlteracao,
        rastreio.url || null,
        trackingCode.toUpperCase(),
      ]
    )

    logger.info(`[logistica] Refresh ${trackingCode} → "${rastreio.descricao}"`)
    return true
  } catch (err: any) {
    logger.warn(`[logistica] Falha no refresh de ${trackingCode}: ${err.message}`)
    return false
  }
}
