import { query, queryOne } from "../db";
import { logger } from "../utils/logger";

// ── Types ──────────────────────────────────────────────────────

export interface CustomerData {
  nome: string;
  email?: string;
  telefone?: string;
  cpf?: string;
  data_nasc?: string;
  canal_origem?: string;
  bling_id?: string;
  nuvemshop_id?: string;
  instagram?: string;
  cidade?: string;
  estado?: string;
  cep?: string;
  tipo?: string;
}

export interface Customer {
  id: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  cpf: string | null;
  data_nasc: string | null;
  canal_origem: string;
  bling_id: string | null;
  nuvemshop_id: string | null;
  instagram: string | null;
  cidade: string | null;
  estado: string | null;
  cep: string | null;
  ativo: boolean;
  criado_em: string;
  atualizado_em: string;
}

export interface CustomerScore {
  id: string;
  customer_id: string;
  ltv: number;
  ticket_medio: number;
  total_pedidos: number;
  score: number;
  frequencia_dias: number | null;
  ultima_compra: string | null;
  risco_churn: string;
  segmento: string;
  calculado_em: string;
}

// ── Upsert por email ou bling_id ────────────────────────────────

// NuvemShop province_code não segue padrão IBGE — mapa de correção
const PROVINCE_FIX: Record<string, string> = {
  SA: "SC", DI: "DF", BA_: "BA", RG: "RS", PA_: "PA",
};

export async function upsertCustomer(dados: CustomerData): Promise<Customer> {
  // Normalizar estado (NuvemShop envia códigos não-padrão)
  if (dados.estado) {
    const uf = dados.estado.toUpperCase().trim().substring(0, 2);
    dados.estado = PROVINCE_FIX[uf] || uf;
  }

  // Classificação automática: CNPJ (>11 dígitos) = fornecedor
  if (dados.cpf && !dados.tipo) {
    const docDigits = dados.cpf.replace(/\D/g, "");
    if (docDigits.length > 11) {
      dados.tipo = "fornecedor";
    }
  }

  // Busca existente por bling_id, nuvemshop_id ou email
  let existing: Customer | null = null;

  if (dados.bling_id) {
    existing = await queryOne<Customer>(
      "SELECT * FROM crm.customers WHERE bling_id = $1",
      [dados.bling_id]
    );
  }

  if (!existing && dados.nuvemshop_id) {
    existing = await queryOne<Customer>(
      "SELECT * FROM crm.customers WHERE nuvemshop_id = $1",
      [dados.nuvemshop_id]
    );
  }

  if (!existing && dados.email) {
    existing = await queryOne<Customer>(
      "SELECT * FROM crm.customers WHERE LOWER(email) = LOWER($1)",
      [dados.email]
    );
  }

  if (existing) {
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    for (const [key, value] of Object.entries(dados)) {
      if (value === undefined) continue;
      // Não sobrescreve campos que já têm valor com null/vazio
      const existingVal = existing[key as keyof Customer];
      if (existingVal && !value) continue;
      fields.push(`${key} = $${idx}`);
      values.push(value);
      idx++;
    }

    if (fields.length > 0) {
      values.push(existing.id);
      const updated = await queryOne<Customer>(
        `UPDATE crm.customers SET ${fields.join(", ")} WHERE id = $${idx} RETURNING *`,
        values
      );
      return updated!;
    }
    return existing;
  }

  const cols = Object.keys(dados).filter((k) => dados[k as keyof CustomerData] !== undefined);
  const vals = cols.map((k) => dados[k as keyof CustomerData]);
  const placeholders = cols.map((_, i) => `$${i + 1}`);

  const created = await queryOne<Customer>(
    `INSERT INTO crm.customers (${cols.join(", ")}) VALUES (${placeholders.join(", ")}) RETURNING *`,
    vals
  );

  logger.info("Cliente criado via upsert", { id: created!.id, nome: dados.nome });
  return created!;
}

// ── Calcular Score ─────────────────────────────────────────────

export async function calculateScore(customerId: string): Promise<CustomerScore | null> {
  // Busca pedidos do Bling + NuvemShop
  const stats = await queryOne<{
    total_pedidos: string;
    total_valor: string;
    ticket_medio: string;
    primeira_compra: string | null;
    ultima_compra: string | null;
  }>(
    `SELECT
       COUNT(*)::text AS total_pedidos,
       COALESCE(SUM(valor), 0)::text AS total_valor,
       COALESCE(AVG(valor), 0)::text AS ticket_medio,
       MIN(criado_bling) AS primeira_compra,
       MAX(criado_bling) AS ultima_compra
     FROM (
       SELECT valor, criado_bling FROM sync.bling_orders WHERE customer_id = $1
       UNION ALL
       SELECT valor, webhook_em AS criado_bling FROM sync.nuvemshop_orders WHERE customer_id = $1
     ) pedidos`,
    [customerId]
  );

  if (!stats) return null;

  const totalPedidos = parseInt(stats.total_pedidos, 10);
  const ltv = parseFloat(stats.total_valor);
  const ticketMedio = parseFloat(stats.ticket_medio);

  // Frequência em dias entre compras
  let frequenciaDias: number | null = null;
  if (stats.primeira_compra && stats.ultima_compra && totalPedidos > 1) {
    const diff = new Date(stats.ultima_compra).getTime() - new Date(stats.primeira_compra).getTime();
    frequenciaDias = Math.round(diff / (1000 * 60 * 60 * 24) / (totalPedidos - 1));
  }

  // Dias desde última compra
  let diasSemCompra = 999;
  if (stats.ultima_compra) {
    diasSemCompra = Math.round(
      (Date.now() - new Date(stats.ultima_compra).getTime()) / (1000 * 60 * 60 * 24)
    );
  }

  // ── Lead sem compra: score baseado em engajamento ────────────
  if (totalPedidos === 0) {
    const engagement = await queryOne<{
      is_lead: string; total_events: string; has_cart: string; total_emails: string;
    }>(
      `SELECT
         (SELECT COUNT(*)::text FROM marketing.leads WHERE customer_id = $1) AS is_lead,
         (SELECT COUNT(*)::text FROM crm.tracking_events WHERE customer_id = $1) AS total_events,
         (SELECT COUNT(*)::text FROM crm.tracking_events WHERE customer_id = $1 AND evento = 'add_to_cart') AS has_cart,
         (SELECT COUNT(*)::text FROM crm.interactions WHERE customer_id = $1 AND tipo = 'email_enviado') AS total_emails`,
      [customerId]
    );

    const isLead = parseInt(engagement?.is_lead || "0", 10) > 0;
    const totalEvents = parseInt(engagement?.total_events || "0", 10);
    const hasCart = parseInt(engagement?.has_cart || "0", 10) > 0;
    const totalEmails = parseInt(engagement?.total_emails || "0", 10);

    // Score de engajamento para leads (0-50)
    let leadScore = 0;
    if (isLead) leadScore += 15;                    // cadastrou via popup
    leadScore += Math.min(totalEvents * 3, 15);     // até 15 pts por page views
    if (hasCart) leadScore += 10;                    // add to cart = intenção forte
    leadScore += Math.min(totalEmails * 3, 10);     // até 10 pts por emails recebidos
    leadScore = Math.round(Math.min(50, leadScore));

    // Segmento para leads
    let leadSegmento = "lead";
    if (hasCart) leadSegmento = "lead_quente";

    const result = await queryOne<CustomerScore>(
      `INSERT INTO crm.customer_scores (customer_id, ltv, ticket_medio, total_pedidos, score, frequencia_dias, ultima_compra, risco_churn, segmento, calculado_em)
       VALUES ($1, 0, 0, 0, $2, NULL, NULL, 'nenhum', $3, NOW())
       ON CONFLICT (customer_id) DO UPDATE SET
         ltv = 0, ticket_medio = 0, total_pedidos = 0, score = $2,
         frequencia_dias = NULL, ultima_compra = NULL, risco_churn = 'nenhum', segmento = $3, calculado_em = NOW()
       RETURNING *`,
      [customerId, leadScore, leadSegmento]
    );

    logger.info("Score lead calculado", { customerId, score: leadScore, segmento: leadSegmento, isLead, totalEvents, hasCart });
    return result;
  }

  // ── Cliente com compras: score baseado em LTV/frequência/recência ──

  // Risco de churn
  let riscoChurn = "baixo";
  if (diasSemCompra > 90) riscoChurn = "alto";
  else if (diasSemCompra > 45) riscoChurn = "medio";

  // Score 0-100 baseado em LTV, frequência e recência
  let score = 0;
  score += Math.min(ltv / 100, 40);                           // até 40 pts por LTV
  score += Math.min(totalPedidos * 5, 30);                     // até 30 pts por frequência
  score += Math.max(0, 30 - diasSemCompra * 0.5);             // até 30 pts por recência
  score = Math.round(Math.min(100, Math.max(0, score)));

  // Segmento automático
  let segmento = "novo";
  if (ltv >= 2000 || score >= 80) segmento = "vip";
  else if (totalPedidos >= 3 && ticketMedio >= 200) segmento = "alto_valor";
  else if (totalPedidos >= 2) segmento = "recorrente";
  else if (diasSemCompra > 60) segmento = "inativo";

  const result = await queryOne<CustomerScore>(
    `INSERT INTO crm.customer_scores (customer_id, ltv, ticket_medio, total_pedidos, score, frequencia_dias, ultima_compra, risco_churn, segmento, calculado_em)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
     ON CONFLICT (customer_id) DO UPDATE SET
       ltv = $2, ticket_medio = $3, total_pedidos = $4, score = $5,
       frequencia_dias = $6, ultima_compra = $7, risco_churn = $8, segmento = $9, calculado_em = NOW()
     RETURNING *`,
    [customerId, ltv, ticketMedio, totalPedidos, score, frequenciaDias, stats.ultima_compra, riscoChurn, segmento]
  );

  logger.info("Score calculado", { customerId, score, segmento, riscoChurn });
  return result;
}

// ── Timeline ───────────────────────────────────────────────────

export async function getTimeline(
  customerId: string,
  limit = 50,
  offset = 0
): Promise<Record<string, unknown>[]> {
  const rows = await query<Record<string, unknown>>(
    `SELECT id, tipo, canal, descricao, valor, metadata, criado_em, origem FROM (
       SELECT id, tipo, canal, descricao, valor, metadata, criado_em, 'interacao' AS origem
       FROM crm.interactions WHERE customer_id = $1
       UNION ALL
       SELECT id, 'pedido_bling' AS tipo, canal, numero AS descricao, valor, itens AS metadata, criado_bling AS criado_em, 'bling' AS origem
       FROM sync.bling_orders WHERE customer_id = $1
       UNION ALL
       SELECT id, evento AS tipo, 'site' AS canal,
         COALESCE(resource_nome, pagina, evento) AS descricao,
         resource_preco AS valor,
         jsonb_build_object(
           'resource_id', resource_id, 'resource_imagem', resource_imagem,
           'pagina', pagina, 'pagina_tipo', pagina_tipo,
           'geo_city', geo_city, 'geo_region', geo_region
         ) AS metadata,
         criado_em, 'tracking' AS origem
       FROM crm.tracking_events WHERE customer_id = $1
     ) combined
     ORDER BY criado_em DESC
     LIMIT $2 OFFSET $3`,
    [customerId, limit, offset]
  );

  return rows;
}

// ── Assign Segments ────────────────────────────────────────────

export async function assignSegments(customerId: string): Promise<string> {
  const scoreData = await queryOne<CustomerScore>(
    "SELECT * FROM crm.customer_scores WHERE customer_id = $1",
    [customerId]
  );

  if (!scoreData) {
    await calculateScore(customerId);
    return "novo";
  }

  // Atualiza segmento baseado nos critérios atuais
  const segments = await query<{ id: string; nome: string; criterio: Record<string, number> }>(
    "SELECT id, nome, criterio FROM crm.segments WHERE ativo = true"
  );

  let assignedSegment = scoreData.segmento;

  for (const seg of segments) {
    const c = seg.criterio;
    if (c.min_pedidos && scoreData.total_pedidos >= c.min_pedidos) {
      assignedSegment = seg.nome;
    }
    if (c.min_ticket && scoreData.ticket_medio >= c.min_ticket) {
      assignedSegment = seg.nome;
    }
    if (c.percentil && scoreData.score >= c.percentil) {
      assignedSegment = "VIP";
    }
  }

  if (assignedSegment !== scoreData.segmento) {
    await query(
      "UPDATE crm.customer_scores SET segmento = $1 WHERE customer_id = $2",
      [assignedSegment, customerId]
    );
    logger.info("Segmento atualizado", { customerId, segmento: assignedSegment });
  }

  return assignedSegment;
}
