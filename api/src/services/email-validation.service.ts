import { query, queryOne } from "../db";
import { logger } from "../utils/logger";

export interface EmailValidationResult {
  ok: boolean;
  motivo?: string;
}

/**
 * Valida se o contexto do email é suficiente para disparar o template.
 * Registra bloqueios em marketing.email_send_log.
 *
 * Bloqueios:
 * - Email nulo ou inválido (regex básico)
 * - Opt-out LGPD ativo
 * - Template produto-visitado sem URL válida (HTTPS obrigatório)
 * - Template cross-sell sem recomendações no banco
 * - Template recompra sem SKU em sync.bling_stock
 */
export async function validateEmailContext(
  tipo: string,
  customerId: string,
  dados: Record<string, unknown>,
): Promise<EmailValidationResult> {
  const lower = tipo.toLowerCase();

  // ── 1. Email válido e opt-out ──────────────────────────────────
  const customer = await queryOne<{ email: string | null; email_optout: boolean }>(
    "SELECT email, email_optout FROM crm.customers WHERE id = $1",
    [customerId],
  );

  if (!customer?.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)) {
    return registrar(customerId, tipo, "email_invalido", { email: customer?.email ?? null });
  }

  if (customer.email_optout) {
    return registrar(customerId, tipo, "email_optout", {});
  }

  // ── 2. Produto visitado: URL de produto real obrigatória ─────────
  // cleanProductUrl() retorna "https://www.papelariabibelo.com.br" como fallback,
  // mas isso leva o CTA para a homepage em vez do produto — bloquear.
  if (lower.includes("produto visitado") || lower.includes("viu produto")) {
    const rawUrl = (dados.pagina as string) || (dados.resource_url as string) || "";
    const url = rawUrl.trim();
    const BASE = "https://www.papelariabibelo.com.br";
    const isRealProductUrl = url.startsWith("https://") && url !== BASE && url !== BASE + "/";
    if (!isRealProductUrl) {
      return registrar(customerId, tipo, "produto_visitado_sem_url_produto", { url });
    }
  }

  // ── 3. Cross-sell: precisa ter pelo menos 1 co-compra no banco ──
  if (lower.includes("cross-sell") || lower.includes("combina com") || lower.includes("complemento")) {
    const VARIANTE_RE = `\\s+(Cor|Tinta|Cor/Estampa|Cor/Cheiro|Cor/Forma|Estampa|Miolo|Tamanho|Modelo|Tipo)\\s*:.*$`;

    const hasRecs = await queryOne<{ total: string }>(`
      WITH ultima_compra AS (
        SELECT sku FROM crm.order_items
        WHERE customer_id = $1 AND sku IS NOT NULL
          AND criado_em = (SELECT MAX(oi2.criado_em) FROM crm.order_items oi2 WHERE oi2.customer_id = $1)
      )
      SELECT COUNT(DISTINCT b.sku)::text AS total
      FROM crm.order_items a
      JOIN crm.order_items b
        ON a.order_id = b.order_id AND a.source = b.source AND a.sku != b.sku
      JOIN ultima_compra uc ON a.sku = uc.sku
      WHERE b.customer_id != $1
        AND b.sku IS NOT NULL
        AND REGEXP_REPLACE(b.nome, '${VARIANTE_RE}', '', 'i') NOT IN (
          SELECT REGEXP_REPLACE(nome, '${VARIANTE_RE}', '', 'i')
          FROM crm.order_items WHERE customer_id = $1
        )
    `, [customerId]);

    const total = parseInt(hasRecs?.total || "0", 10);
    if (total === 0) {
      return registrar(customerId, tipo, "cross_sell_sem_recomendacoes", { customerId });
    }
  }

  // ── 4. Recompra: SKU do produto favorito precisa estar no estoque Bling ──
  if (lower.includes("recompra") || lower.includes("repor") || lower.includes("favoritos")) {
    const produtosFrequentes = dados.produtos_frequentes as Array<{ sku: string }> | undefined;
    const skus = produtosFrequentes?.map(p => p.sku).filter(Boolean) ?? [];

    if (skus.length > 0) {
      const emEstoque = await queryOne<{ total: string }>(
        `SELECT COUNT(*)::text AS total FROM sync.bling_stock
         WHERE sku = ANY($1::text[]) AND estoque_disponivel > 0`,
        [skus],
      );
      const comEstoque = parseInt(emEstoque?.total || "0", 10);
      if (comEstoque === 0) {
        return registrar(customerId, tipo, "recompra_sem_estoque_bling", { skus });
      }
    }
  }

  return { ok: true };
}

// ── Registrar bloqueio e retornar resultado ──────────────────────

async function registrar(
  customerId: string,
  tipo: string,
  motivo: string,
  dados: Record<string, unknown>,
): Promise<EmailValidationResult> {
  logger.info("validateEmailContext: bloqueado", { customerId, tipo, motivo });

  await query(
    `INSERT INTO marketing.email_send_log (customer_id, tipo, acao, motivo, dados)
     VALUES ($1, $2, 'bloqueado', $3, $4)`,
    [customerId, tipo, motivo, JSON.stringify(dados)],
  ).catch((err) => {
    logger.warn("Falha ao registrar bloqueio em email_send_log", { error: String(err), tipo, motivo });
  });

  return { ok: false, motivo };
}
