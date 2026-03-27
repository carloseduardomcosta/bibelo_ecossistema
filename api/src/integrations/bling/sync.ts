import axios from "axios";
import { query, queryOne } from "../../db";
import { logger } from "../../utils/logger";
import { getValidToken, BLING_API } from "./auth";
import { upsertCustomer, calculateScore } from "../../services/customer.service";

// ── Rate limit: max 60 req/min ─────────────────────────────────

let requestCount = 0;
let windowStart = Date.now();

async function rateLimitedGet<T>(url: string, token: string): Promise<T> {
  const now = Date.now();
  if (now - windowStart > 60_000) {
    requestCount = 0;
    windowStart = now;
  }

  if (requestCount >= 58) {
    const waitMs = 60_000 - (now - windowStart) + 1000;
    logger.info("Bling rate limit: aguardando", { waitMs });
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    requestCount = 0;
    windowStart = Date.now();
  }

  requestCount++;
  const { data } = await axios.get<T>(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return data;
}

// ── Sync Customers ─────────────────────────────────────────────

export async function syncCustomers(): Promise<number> {
  const token = await getValidToken();
  let page = 1;
  let total = 0;

  try {
    while (true) {
      const data = await rateLimitedGet<{ data: Array<Record<string, unknown>> }>(
        `${BLING_API}/contatos?pagina=${page}&limite=100&tipo=J;F`,
        token
      );

      if (!data.data || data.data.length === 0) break;

      for (const contato of data.data) {
        const customer = await upsertCustomer({
          nome: contato.nome as string,
          email: (contato.email as string) || undefined,
          telefone: (contato.celular as string) || (contato.fone as string) || undefined,
          cpf: (contato.cpf_cnpj as string) || undefined,
          canal_origem: "bling",
          bling_id: String(contato.id),
          cidade: (contato.cidade as string) || undefined,
          estado: (contato.uf as string) || undefined,
          cep: (contato.cep as string) || undefined,
        });

        // Salva raw no sync
        await query(
          `INSERT INTO sync.bling_customers (bling_id, customer_id, dados_raw, ultima_sync)
           VALUES ($1, $2, $3, NOW())
           ON CONFLICT (bling_id) DO UPDATE SET customer_id = $2, dados_raw = $3, ultima_sync = NOW()`,
          [String(contato.id), customer.id, JSON.stringify(contato)]
        );

        total++;
      }

      page++;
    }

    await logSync("bling", "customers", "ok", total);
    logger.info("Bling syncCustomers concluído", { total });
    return total;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    await logSync("bling", "customers", "erro", total, message);
    logger.error("Bling syncCustomers falhou", { error: message });
    throw err;
  }
}

// ── Sync Orders ────────────────────────────────────────────────

export async function syncOrders(): Promise<number> {
  const token = await getValidToken();
  let page = 1;
  let total = 0;

  try {
    while (true) {
      const data = await rateLimitedGet<{ data: Array<Record<string, unknown>> }>(
        `${BLING_API}/pedidos/vendas?pagina=${page}&limite=100`,
        token
      );

      if (!data.data || data.data.length === 0) break;

      for (const pedido of data.data) {
        const contato = pedido.contato as Record<string, unknown> | undefined;
        let customerId: string | null = null;

        if (contato?.id) {
          const existing = await queryOne<{ customer_id: string }>(
            "SELECT customer_id FROM sync.bling_customers WHERE bling_id = $1",
            [String(contato.id)]
          );
          customerId = existing?.customer_id || null;
        }

        await query(
          `INSERT INTO sync.bling_orders (bling_id, customer_id, numero, valor, status, canal, itens, criado_bling)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (bling_id) DO UPDATE SET
             customer_id = $2, valor = $4, status = $5, itens = $7`,
          [
            String(pedido.id),
            customerId,
            pedido.numero || null,
            pedido.totalProdutos || pedido.total || 0,
            (pedido.situacao as Record<string, unknown>)?.valor || "desconhecido",
            pedido.loja ? "online" : "fisico",
            JSON.stringify(pedido.itens || []),
            pedido.data || null,
          ]
        );

        if (customerId) {
          await calculateScore(customerId);
        }

        total++;
      }

      page++;
    }

    await logSync("bling", "orders", "ok", total);
    logger.info("Bling syncOrders concluído", { total });
    return total;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    await logSync("bling", "orders", "erro", total, message);
    logger.error("Bling syncOrders falhou", { error: message });
    throw err;
  }
}

// ── Sync Products ───────────────────────────────────────────────

export async function syncProducts(): Promise<number> {
  const token = await getValidToken();
  let page = 1;
  let total = 0;

  try {
    while (true) {
      const data = await rateLimitedGet<{ data: Array<Record<string, unknown>> }>(
        `${BLING_API}/produtos?pagina=${page}&limite=100`,
        token
      );

      if (!data.data || data.data.length === 0) break;

      for (const prod of data.data) {
        const categoria = prod.categoria as Record<string, unknown> | undefined;
        const midia = prod.midia as Record<string, unknown> | undefined;
        const imagensExternas = (midia?.imagens as Record<string, unknown>)?.externas as Array<Record<string, unknown>> | undefined;
        const imagens = (imagensExternas || []).map((img, i) => ({ url: img.link, ordem: i }));

        await query(
          `INSERT INTO sync.bling_products
           (bling_id, nome, sku, preco_custo, preco_venda, categoria, imagens, ativo, tipo, unidade, peso_bruto, gtin, dados_raw, sincronizado_em)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
           ON CONFLICT (bling_id) DO UPDATE SET
             nome = $2, sku = $3, preco_custo = $4, preco_venda = $5, categoria = $6,
             imagens = $7, ativo = $8, tipo = $9, unidade = $10, peso_bruto = $11,
             gtin = $12, dados_raw = $13, sincronizado_em = NOW()`,
          [
            String(prod.id),
            prod.nome || "Sem nome",
            prod.codigo || null,
            prod.precoCusto || 0,
            prod.preco || 0,
            categoria?.descricao || null,
            JSON.stringify(imagens),
            prod.situacao === "A" || prod.situacao === "Ativo",
            prod.tipo || "P",
            prod.unidade || "UN",
            prod.pesoBruto || null,
            prod.gtin || null,
            JSON.stringify(prod),
          ]
        );

        total++;
      }

      page++;
    }

    await logSync("bling", "products", "ok", total);
    logger.info("Bling syncProducts concluído", { total });
    return total;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    await logSync("bling", "products", "erro", total, message);
    logger.error("Bling syncProducts falhou", { error: message });
    throw err;
  }
}

// ── Sync Stock ──────────────────────────────────────────────────
// Bling /estoques/saldos requer idsProdutos[] — enviamos em lotes de 50

export async function syncStock(): Promise<number> {
  const token = await getValidToken();
  let total = 0;

  try {
    // Busca todos os bling_ids dos produtos
    const allProducts = await query<{ id: string; bling_id: string }>(
      "SELECT id, bling_id FROM sync.bling_products WHERE ativo = true"
    );

    if (allProducts.length === 0) return 0;

    // Processa em lotes de 50
    const BATCH_SIZE = 50;
    for (let i = 0; i < allProducts.length; i += BATCH_SIZE) {
      const batch = allProducts.slice(i, i + BATCH_SIZE);
      const idsParam = batch.map((p) => `idsProdutos[]=${p.bling_id}`).join("&");

      const data = await rateLimitedGet<{ data: Array<Record<string, unknown>> }>(
        `${BLING_API}/estoques/saldos?${idsParam}`,
        token
      );

      if (!data.data) continue;

      for (const entry of data.data) {
        const produto = entry.produto as Record<string, unknown> | undefined;
        if (!produto?.id) continue;

        const blingProductId = String(produto.id);
        const localProduct = batch.find((p) => p.bling_id === blingProductId);
        if (!localProduct) continue;

        const depositos = entry.depositos as Array<Record<string, unknown>> | undefined;
        if (!depositos || depositos.length === 0) {
          // Sem depósitos, salva saldo total
          await query(
            `INSERT INTO sync.bling_stock
             (product_id, bling_product_id, deposito_id, deposito_nome, saldo_fisico, saldo_virtual, sincronizado_em)
             VALUES ($1, $2, 'default', 'Principal', $3, $4, NOW())
             ON CONFLICT (bling_product_id, deposito_id) DO UPDATE SET
               product_id = $1, saldo_fisico = $3, saldo_virtual = $4, sincronizado_em = NOW()`,
            [
              localProduct.id,
              blingProductId,
              entry.saldoFisicoTotal || 0,
              entry.saldoVirtualTotal || 0,
            ]
          );
          total++;
          continue;
        }

        for (const dep of depositos) {
          await query(
            `INSERT INTO sync.bling_stock
             (product_id, bling_product_id, deposito_id, deposito_nome, saldo_fisico, saldo_virtual, sincronizado_em)
             VALUES ($1, $2, $3, $4, $5, $6, NOW())
             ON CONFLICT (bling_product_id, deposito_id) DO UPDATE SET
               product_id = $1, deposito_nome = $4, saldo_fisico = $5, saldo_virtual = $6, sincronizado_em = NOW()`,
            [
              localProduct.id,
              blingProductId,
              String(dep.id || "default"),
              dep.nome || dep.descricao || "Principal",
              dep.saldoFisico || 0,
              dep.saldoVirtual || 0,
            ]
          );
          total++;
        }
      }
    }

    await logSync("bling", "stock", "ok", total);
    logger.info("Bling syncStock concluído", { total });
    return total;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    await logSync("bling", "stock", "erro", total, message);
    logger.error("Bling syncStock falhou", { error: message });
    throw err;
  }
}

// ── Incremental Sync ───────────────────────────────────────────

export async function incrementalSync(): Promise<{ customers: number; orders: number; products: number; stock: number }> {
  logger.info("Bling incrementalSync iniciado");

  const state = await queryOne<{ ultima_sync: string }>(
    "SELECT ultima_sync FROM sync.sync_state WHERE fonte = 'bling'"
  );

  const token = await getValidToken();
  const since = state?.ultima_sync
    ? new Date(state.ultima_sync).toISOString().split("T")[0]
    : "2020-01-01";

  let customers = 0;
  let orders = 0;

  // Sync contatos atualizados
  try {
    let page = 1;
    while (true) {
      const data = await rateLimitedGet<{ data: Array<Record<string, unknown>> }>(
        `${BLING_API}/contatos?pagina=${page}&limite=100&dataAlteracaoInicial=${since}`,
        token
      );

      if (!data.data || data.data.length === 0) break;

      for (const contato of data.data) {
        const customer = await upsertCustomer({
          nome: contato.nome as string,
          email: (contato.email as string) || undefined,
          telefone: (contato.celular as string) || (contato.fone as string) || undefined,
          cpf: (contato.cpf_cnpj as string) || undefined,
          canal_origem: "bling",
          bling_id: String(contato.id),
        });

        await query(
          `INSERT INTO sync.bling_customers (bling_id, customer_id, dados_raw, ultima_sync)
           VALUES ($1, $2, $3, NOW())
           ON CONFLICT (bling_id) DO UPDATE SET customer_id = $2, dados_raw = $3, ultima_sync = NOW()`,
          [String(contato.id), customer.id, JSON.stringify(contato)]
        );

        customers++;
      }
      page++;
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro";
    logger.error("Bling incrementalSync contatos falhou", { error: message });
  }

  // Sync pedidos atualizados
  try {
    let page = 1;
    while (true) {
      const data = await rateLimitedGet<{ data: Array<Record<string, unknown>> }>(
        `${BLING_API}/pedidos/vendas?pagina=${page}&limite=100&dataAlteracaoInicial=${since}`,
        token
      );

      if (!data.data || data.data.length === 0) break;

      for (const pedido of data.data) {
        const contato = pedido.contato as Record<string, unknown> | undefined;
        let customerId: string | null = null;

        if (contato?.id) {
          const existing = await queryOne<{ customer_id: string }>(
            "SELECT customer_id FROM sync.bling_customers WHERE bling_id = $1",
            [String(contato.id)]
          );
          customerId = existing?.customer_id || null;
        }

        await query(
          `INSERT INTO sync.bling_orders (bling_id, customer_id, numero, valor, status, canal, itens, criado_bling)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (bling_id) DO UPDATE SET
             customer_id = $2, valor = $4, status = $5, itens = $7`,
          [
            String(pedido.id),
            customerId,
            pedido.numero || null,
            pedido.totalProdutos || pedido.total || 0,
            (pedido.situacao as Record<string, unknown>)?.valor || "desconhecido",
            pedido.loja ? "online" : "fisico",
            JSON.stringify(pedido.itens || []),
            pedido.data || null,
          ]
        );

        if (customerId) {
          await calculateScore(customerId);
        }

        orders++;
      }
      page++;
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro";
    logger.error("Bling incrementalSync pedidos falhou", { error: message });
  }

  // Sync produtos e estoque
  let products = 0;
  let stock = 0;

  try {
    products = await syncProducts();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro";
    logger.error("Bling incrementalSync produtos falhou", { error: message });
  }

  try {
    stock = await syncStock();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro";
    logger.error("Bling incrementalSync estoque falhou", { error: message });
  }

  // Atualiza timestamp de última sync
  await query(
    "UPDATE sync.sync_state SET ultima_sync = NOW(), total_sincronizados = total_sincronizados + $1 WHERE fonte = 'bling'",
    [customers + orders + products + stock]
  );

  await logSync("bling", "incremental", "ok", customers + orders + products + stock);
  logger.info("Bling incrementalSync concluído", { customers, orders, products, stock });

  return { customers, orders, products, stock };
}

// ── Helper: log de sync ────────────────────────────────────────

async function logSync(
  fonte: string,
  tipo: string,
  status: string,
  registros: number,
  erro?: string
): Promise<void> {
  await query(
    `INSERT INTO sync.sync_logs (fonte, tipo, status, registros, erro) VALUES ($1, $2, $3, $4, $5)`,
    [fonte, tipo, status, registros, erro || null]
  );
}
