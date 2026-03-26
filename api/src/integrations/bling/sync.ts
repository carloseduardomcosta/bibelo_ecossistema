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

// ── Incremental Sync ───────────────────────────────────────────

export async function incrementalSync(): Promise<{ customers: number; orders: number }> {
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

  // Atualiza timestamp de última sync
  await query(
    "UPDATE sync.sync_state SET ultima_sync = NOW(), total_sincronizados = total_sincronizados + $1 WHERE fonte = 'bling'",
    [customers + orders]
  );

  await logSync("bling", "incremental", "ok", customers + orders);
  logger.info("Bling incrementalSync concluído", { customers, orders });

  return { customers, orders };
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
