import { query, queryOne } from "../../db";
import { logger } from "../../utils/logger";
import { getNuvemShopToken, nsRequest } from "./auth";
import { upsertCustomer, calculateScore } from "../../services/customer.service";

// ── Sync Clientes NuvemShop ───────────────────────────────────

export async function syncNsCustomers(): Promise<number> {
  const token = await getNuvemShopToken();
  if (!token) throw new Error("NuvemShop não conectada");

  let page = 1;
  let total = 0;

  while (true) {
    const customers = await nsRequest<Array<Record<string, unknown>>>(
      "get", `customers?page=${page}&per_page=200`, token
    );

    if (!customers || customers.length === 0) break;

    for (const c of customers) {
      const addr = c.default_address as Record<string, unknown> | undefined;

      await upsertCustomer({
        nome: (c.name as string) || "Sem nome",
        email: (c.email as string) || undefined,
        telefone: (c.phone as string) || undefined,
        cpf: (c.identification as string) || undefined,
        canal_origem: "nuvemshop",
        nuvemshop_id: String(c.id),
        cidade: (addr?.city as string) || undefined,
        estado: (addr?.province as string) || undefined,
      });

      total++;
    }
    page++;
  }

  await logSync("nuvemshop", "customers", "ok", total);
  logger.info("NuvemShop syncCustomers concluído", { total });
  return total;
}

// ── Sync Pedidos NuvemShop ────────────────────────────────────

export async function syncNsOrders(): Promise<number> {
  const token = await getNuvemShopToken();
  if (!token) throw new Error("NuvemShop não conectada");

  let page = 1;
  let total = 0;

  while (true) {
    const orders = await nsRequest<Array<Record<string, unknown>>>(
      "get", `orders?page=${page}&per_page=200`, token
    );

    if (!orders || orders.length === 0) break;

    for (const order of orders) {
      const customer = order.customer as Record<string, unknown> | undefined;
      let customerId: string | null = null;

      if (customer?.id) {
        const existing = await queryOne<{ id: string }>(
          "SELECT id FROM crm.customers WHERE nuvemshop_id = $1",
          [String(customer.id)]
        );

        if (existing) {
          customerId = existing.id;
        } else if (customer.email || customer.name) {
          const upserted = await upsertCustomer({
            nome: (customer.name as string) || "Sem nome",
            email: (customer.email as string) || undefined,
            telefone: (customer.phone as string) || undefined,
            canal_origem: "nuvemshop",
            nuvemshop_id: String(customer.id),
          });
          customerId = upserted.id;
        }
      }

      const products = (order.products as Array<Record<string, unknown>>) || [];
      const valor = parseFloat(String(order.total || 0));

      await query(
        `INSERT INTO sync.nuvemshop_orders (ns_id, customer_id, numero, valor, status, itens, processado)
         VALUES ($1, $2, $3, $4, $5, $6, true)
         ON CONFLICT (ns_id) DO UPDATE SET
           customer_id = $2, valor = $4, status = $5, itens = $6, processado = true`,
        [
          String(order.id),
          customerId,
          String(order.number || ""),
          valor,
          (order.payment_status as string) || "pending",
          JSON.stringify(products),
        ]
      );

      if (customerId) {
        await calculateScore(customerId);
      }

      total++;
    }
    page++;
  }

  await logSync("nuvemshop", "orders", "ok", total);
  logger.info("NuvemShop syncOrders concluído", { total });
  return total;
}

// ── Sync Produtos NuvemShop ───────────────────────────────────

export async function syncNsProducts(): Promise<number> {
  const token = await getNuvemShopToken();
  if (!token) throw new Error("NuvemShop não conectada");

  let page = 1;
  let total = 0;

  while (true) {
    const products = await nsRequest<Array<Record<string, unknown>>>(
      "get", `products?page=${page}&per_page=200`, token
    );

    if (!products || products.length === 0) break;

    for (const prod of products) {
      const variants = (prod.variants as Array<Record<string, unknown>>) || [];
      const firstVariant = variants[0] || {};
      const images = (prod.images as Array<Record<string, unknown>>) || [];
      const name = prod.name as Record<string, string> | string;
      const nome = typeof name === "object" ? (name.pt || name.es || name.en || "Sem nome") : String(name || "Sem nome");

      // Upsert no bling_products usando SKU como chave de dedup
      const sku = (firstVariant.sku as string) || null;
      const preco = parseFloat(String(firstVariant.price || prod.price || 0));
      const custo = parseFloat(String(firstVariant.cost || 0));
      const estoque = firstVariant.stock === "" ? null : parseInt(String(firstVariant.stock || 0), 10);

      // Salva na tabela de produtos (usa bling_products como tabela unificada)
      if (sku) {
        // Tenta vincular com produto existente do Bling por SKU
        const existing = await queryOne<{ id: string }>(
          "SELECT id FROM sync.bling_products WHERE sku = $1",
          [sku]
        );

        if (existing) {
          // Atualiza preço de venda da NuvemShop se maior que 0
          if (preco > 0) {
            await query(
              "UPDATE sync.bling_products SET preco_venda = $1, atualizado_em = NOW() WHERE id = $2",
              [preco, existing.id]
            );
          }
        }
      }

      // Salva mapeamento NS → produto
      await query(
        `INSERT INTO sync.nuvemshop_products (ns_id, nome, sku, preco, custo, estoque, imagens, publicado, dados_raw, sincronizado_em)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
         ON CONFLICT (ns_id) DO UPDATE SET
           nome = $2, sku = $3, preco = $4, custo = $5, estoque = $6, imagens = $7, publicado = $8, dados_raw = $9, sincronizado_em = NOW()`,
        [
          String(prod.id),
          nome,
          sku,
          preco,
          custo,
          estoque,
          JSON.stringify(images.map((i: Record<string, unknown>) => i.src)),
          prod.published !== false,
          JSON.stringify(prod),
        ]
      );

      total++;
    }
    page++;
  }

  await logSync("nuvemshop", "products", "ok", total);
  logger.info("NuvemShop syncProducts concluído", { total });
  return total;
}

// ── Registrar Webhooks via API ────────────────────────────────

const WEBHOOK_EVENTS = [
  "order/created",
  "order/updated",
  "order/paid",
  "order/fulfilled",
  "order/cancelled",
  "customer/created",
  "customer/updated",
  "product/created",
  "product/updated",
];

export async function registerNsWebhooks(): Promise<number> {
  const token = await getNuvemShopToken();
  if (!token) throw new Error("NuvemShop não conectada");

  const webhookUrl = `https://webhook.papelariabibelo.com.br/api/webhooks/nuvemshop`;

  // Lista webhooks existentes
  const existing = await nsRequest<Array<{ id: number; event: string; url: string }>>(
    "get", "webhooks", token
  );

  const existingEvents = new Set((existing || []).map((w) => w.event));
  let registered = 0;

  for (const event of WEBHOOK_EVENTS) {
    if (existingEvents.has(event)) continue;

    try {
      await nsRequest("post", "webhooks", token, { event, url: webhookUrl });
      registered++;
      logger.info("NuvemShop webhook registrado", { event, url: webhookUrl });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro";
      logger.warn("Falha ao registrar webhook NS", { event, error: message });
    }
  }

  logger.info("NuvemShop webhooks registrados", { total: registered, existentes: existingEvents.size });
  return registered;
}

// ── Sync completo NuvemShop ───────────────────────────────────

export async function syncNuvemShop(): Promise<{ customers: number; orders: number; products: number; webhooks: number }> {
  logger.info("NuvemShop sync completo iniciado");

  let customers = 0;
  let orders = 0;
  let products = 0;
  let webhooks = 0;

  try {
    customers = await syncNsCustomers();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro";
    logger.error("NuvemShop sync clientes falhou", { error: message });
  }

  try {
    orders = await syncNsOrders();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro";
    logger.error("NuvemShop sync pedidos falhou", { error: message });
  }

  try {
    products = await syncNsProducts();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro";
    logger.error("NuvemShop sync produtos falhou", { error: message });
  }

  try {
    webhooks = await registerNsWebhooks();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro";
    logger.error("NuvemShop registro webhooks falhou", { error: message });
  }

  // Atualiza sync_state
  await query(
    "UPDATE sync.sync_state SET ultima_sync = NOW(), total_sincronizados = total_sincronizados + $1 WHERE fonte = 'nuvemshop'",
    [customers + orders + products]
  );

  logger.info("NuvemShop sync completo finalizado", { customers, orders, products, webhooks });
  return { customers, orders, products, webhooks };
}

// ── Helper ────────────────────────────────────────────────────

async function logSync(fonte: string, tipo: string, status: string, registros: number, erro?: string): Promise<void> {
  await query(
    `INSERT INTO sync.sync_logs (fonte, tipo, status, registros, erro) VALUES ($1, $2, $3, $4, $5)`,
    [fonte, tipo, status, registros, erro || null]
  );
}
