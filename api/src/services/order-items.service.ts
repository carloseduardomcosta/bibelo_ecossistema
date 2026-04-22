import { query } from "../db";
import { logger } from "../utils/logger";

export type OrderItemSource = "bling" | "nuvemshop";

export interface InsertOrderItemsParams {
  source: OrderItemSource;
  orderId: string;
  customerId: string | null;
  items: unknown[];
  createdAt: Date | string | null;
}

/**
 * Persiste os itens de um pedido em crm.order_items.
 * Idempotente — ON CONFLICT (source, order_id, posicao) DO NOTHING.
 * Bling: {codigo, descricao, valor, quantidade}
 * NuvemShop: {name, quantity, price, image_url, product_id}
 */
export async function insertOrderItems({
  source,
  orderId,
  customerId,
  items,
  createdAt,
}: InsertOrderItemsParams): Promise<void> {
  if (!items.length) return;

  const ts = createdAt || new Date();

  for (let i = 0; i < items.length; i++) {
    const item = items[i] as Record<string, unknown>;

    let sku: string | null = null;
    let nome: string;
    let quantidade: number;
    let valorUnitario: number;
    let imageUrl: string | null = null;
    let nsProductId: string | null = null;

    if (source === "bling") {
      sku = (item.codigo as string) || null;
      nome = (item.descricao as string) || sku || "Produto";
      quantidade = Number(item.quantidade) || 1;
      valorUnitario = Number(item.valor) || 0;
    } else {
      nome = (item.name as string) || "Produto";
      quantidade = Number(item.quantity) || 1;
      valorUnitario = Number(item.price) || 0;
      imageUrl = (item.image_url as string) || null;
      nsProductId = item.product_id ? String(item.product_id) : null;
    }

    try {
      await query(
        `INSERT INTO crm.order_items
           (source, order_id, customer_id, sku, nome, posicao,
            quantidade, valor_unitario, valor_total, image_url, ns_product_id, criado_em)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (source, order_id, posicao) DO NOTHING`,
        [
          source,
          orderId,
          customerId,
          sku,
          nome,
          i,
          quantidade,
          valorUnitario,
          quantidade * valorUnitario,
          imageUrl,
          nsProductId,
          ts,
        ],
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro";
      logger.warn("insertOrderItems: erro ao inserir item", {
        source, orderId, posicao: i, error: msg,
      });
    }
  }
}
