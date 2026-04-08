import axios from "axios";
import { query, queryOne } from "../../db";
import { logger } from "../../utils/logger";
import { getValidToken, BLING_API } from "./auth";
import { upsertCustomer, calculateScore } from "../../services/customer.service";

// ── Mapeamento de lojas Bling → canal de venda ────────────────
// Configurável via .env, fallback para IDs conhecidos
// Formato: BLING_LOJAS_FISICAS=205995943,0  BLING_LOJAS_ONLINE=205945450:nuvemshop,205891189:shopee
const LOJAS_FISICAS = new Set(
  (process.env.BLING_LOJAS_FISICAS || "205995943").split(",").map(s => s.trim()).filter(Boolean)
);

const LOJAS_ONLINE: Record<string, string> = {};
for (const entry of (process.env.BLING_LOJAS_ONLINE || "205945450:nuvemshop,205891189:shopee").split(",")) {
  const [id, canal] = entry.trim().split(":");
  if (id) LOJAS_ONLINE[id] = canal || "online";
}

function classifyCanal(lojaId: number | undefined | null): string {
  const id = String(lojaId || 0);
  if (id === "0" || LOJAS_FISICAS.has(id)) return "fisico";
  if (LOJAS_ONLINE[id]) return LOJAS_ONLINE[id];
  return "online"; // fallback: loja desconhecida → online
}

// ── Rate limit: max 3 req/s (Bling v3) ─────────────────────────
// Mutex baseado em promise — garante serialização mesmo com chamadas concorrentes

let blingPending: Promise<void> = Promise.resolve();

export async function rateLimitedGet<T>(url: string, token: string): Promise<T> {
  const MAX_RETRIES = 3;
  const BACKOFF = [5000, 10000, 20000];

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    // Garante intervalo mínimo de 350ms entre requests (≈2.8 req/s, margem segura)
    // Cada chamada espera a anterior terminar + delay, evitando race conditions
    const wait = blingPending;
    let releaseLock!: () => void;
    blingPending = new Promise<void>((r) => { releaseLock = r; });
    await wait;

    try {
      const { data } = await axios.get<T>(url, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 15000,
      });
      setTimeout(() => releaseLock(), 350);
      return data;
    } catch (err: unknown) {
      const axiosErr = err as { response?: { status?: number; headers?: Record<string, string> } };
      if (axiosErr.response?.status === 429 && attempt < MAX_RETRIES) {
        const retryAfter = parseInt(axiosErr.response.headers?.["retry-after"] || "0", 10);
        const waitMs = retryAfter > 0 ? retryAfter * 1000 : BACKOFF[attempt];
        logger.warn(`Bling rate limit 429: tentativa ${attempt + 1}/${MAX_RETRIES}, aguardando ${waitMs}ms`);
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        // Lock já será re-adquirido no próximo loop iteration
        releaseLock();
        continue;
      }
      setTimeout(() => releaseLock(), 350);
      throw err;
    }
  }
  // Unreachable, but TypeScript needs it
  throw new Error("Bling rateLimitedGet: max retries exceeded");
}

export async function rateLimitedPatch<T>(url: string, token: string, body: unknown, timeoutMs = 15000): Promise<T> {
  const MAX_RETRIES = 3;
  const BACKOFF = [5000, 10000, 20000];

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const wait = blingPending;
    let releaseLock!: () => void;
    blingPending = new Promise<void>((r) => { releaseLock = r; });
    await wait;

    try {
      const { data } = await axios.patch<T>(url, body, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        timeout: timeoutMs,
      });
      setTimeout(() => releaseLock(), 350);
      return data;
    } catch (err: unknown) {
      const axiosErr = err as { response?: { status?: number; headers?: Record<string, string>; data?: unknown } };
      if (axiosErr.response?.status === 429 && attempt < MAX_RETRIES) {
        const retryAfter = parseInt(axiosErr.response.headers?.["retry-after"] || "0", 10);
        const waitMs = retryAfter > 0 ? retryAfter * 1000 : BACKOFF[attempt];
        logger.warn(`Bling rate limit 429 (PATCH): tentativa ${attempt + 1}/${MAX_RETRIES}, aguardando ${waitMs}ms`);
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        releaseLock();
        continue;
      }
      setTimeout(() => releaseLock(), 350);
      throw err;
    }
  }
  throw new Error("Bling rateLimitedPatch: max retries exceeded");
}

// ── Sync Customers ─────────────────────────────────────────────

export async function syncCustomers(): Promise<number> {
  const token = await getValidToken();
  let page = 1;
  let total = 0;

  try {
    // Passo 1: coletar todos os IDs dos contatos
    const allIds: string[] = [];
    while (true) {
      const data = await rateLimitedGet<{ data: Array<Record<string, unknown>> }>(
        `${BLING_API}/contatos?pagina=${page}&limite=100&tipo=J;F`,
        token
      );
      if (!data.data || data.data.length === 0) break;
      for (const c of data.data) allIds.push(String(c.id));
      page++;
    }

    logger.info("Bling syncCustomers: coletados IDs", { total: allIds.length });

    // Passo 2: buscar detalhe de cada contato (tem email, telefone, endereço)
    for (const blingId of allIds) {
      try {
        const detail = await rateLimitedGet<{ data: Record<string, unknown> }>(
          `${BLING_API}/contatos/${blingId}`,
          token
        );

        const c = detail.data;
        if (!c) continue;

        // Telefone/celular
        const celular = String(c.celular || "").trim();
        const telefone = String(c.telefone || "").trim();
        const foneFormatado = celular || telefone || undefined;

        // Email (campo direto + emailNotaFiscal como fallback)
        const email = String(c.email || "").trim() || String(c.emailNotaFiscal || "").trim() || undefined;

        // Endereço (detalhe retorna endereco.geral)
        const endGeral = (c.endereco as Record<string, Record<string, string>> | undefined)?.geral;

        // Data nascimento
        const dataNasc = (c.dadosAdicionais as Record<string, string> | undefined)?.dataNascimento;
        const dataNascFormatada = dataNasc && dataNasc !== "0000-00-00" ? dataNasc : undefined;

        // CPF/CNPJ
        const doc = String(c.numeroDocumento || "").trim();

        const customer = await upsertCustomer({
          nome: String(c.nome || ""),
          email,
          telefone: foneFormatado,
          cpf: doc || undefined,
          data_nasc: dataNascFormatada,
          canal_origem: "bling",
          bling_id: blingId,
          cidade: endGeral?.municipio || undefined,
          estado: endGeral?.uf || undefined,
          cep: endGeral?.cep || undefined,
        });

        await query(
          `INSERT INTO sync.bling_customers (bling_id, customer_id, dados_raw, ultima_sync)
           VALUES ($1, $2, $3, NOW())
           ON CONFLICT (bling_id) DO UPDATE SET customer_id = $2, dados_raw = $3, ultima_sync = NOW()`,
          [blingId, customer.id, JSON.stringify(c)]
        );

        total++;
      } catch (detailErr: unknown) {
        const msg = detailErr instanceof Error ? detailErr.message : "Erro";
        logger.warn("Bling syncCustomers: erro no detalhe", { blingId, error: msg });
      }
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
        // Busca detalhe do pedido para obter itens
        let itens: unknown[] = [];
        let valorTotal = pedido.totalProdutos || pedido.total || 0;
        try {
          const detail = await rateLimitedGet<{ data: Record<string, unknown> }>(
            `${BLING_API}/pedidos/vendas/${pedido.id}`,
            token
          );
          if (detail.data?.itens) {
            itens = detail.data.itens as unknown[];
          }
          if (detail.data?.total) {
            valorTotal = detail.data.total;
          }
        } catch (detailErr: unknown) {
          const msg = detailErr instanceof Error ? detailErr.message : "Erro";
          logger.warn("Bling: erro ao buscar detalhe do pedido", { pedidoId: pedido.id, error: msg });
        }

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
             customer_id = $2, valor = $4, status = $5, canal = $6, itens = $7`,
          [
            String(pedido.id),
            customerId,
            pedido.numero || null,
            valorTotal,
            (pedido.situacao as Record<string, unknown>)?.valor || "desconhecido",
            classifyCanal((pedido.loja as Record<string, unknown>)?.id as number),
            JSON.stringify(itens),
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

// ── Fetch category map from Bling ──────────────────────────────

async function fetchCategoryMap(token: string): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  let page = 1;
  while (true) {
    const data = await rateLimitedGet<{ data: Array<{ id: number; descricao: string }> }>(
      `${BLING_API}/categorias/produtos?pagina=${page}&limite=100`,
      token
    );
    if (!data.data || data.data.length === 0) break;
    for (const cat of data.data) {
      map.set(cat.id, cat.descricao);
    }
    page++;
  }
  // Persiste categorias na staging table (para Medusa sync ler sem chamar Bling)
  for (const [catId, catDesc] of map) {
    await query(
      `INSERT INTO sync.bling_categories (bling_id, descricao, sincronizado_em)
       VALUES ($1, $2, NOW())
       ON CONFLICT (bling_id) DO UPDATE SET descricao = $2, sincronizado_em = NOW()`,
      [String(catId), catDesc]
    );
  }

  logger.info("Bling categorias carregadas e persistidas", { total: map.size });
  return map;
}

// ── Atualiza categorias dos produtos via filtro idCategoria ─────

export async function syncProductCategories(token: string, categoryMap: Map<number, string>): Promise<number> {
  let updated = 0;
  for (const [catId, catName] of categoryMap) {
    let page = 1;
    while (true) {
      const data = await rateLimitedGet<{ data: Array<{ id: number }> }>(
        `${BLING_API}/produtos?pagina=${page}&limite=100&idCategoria=${catId}`,
        token
      );
      if (!data.data || data.data.length === 0) break;

      const blingIds = data.data.map((p) => String(p.id));
      if (blingIds.length > 0) {
        const placeholders = blingIds.map((_, i) => `$${i + 3}`).join(", ");
        await query(
          `UPDATE sync.bling_products SET categoria = $1, bling_category_id = $2 WHERE bling_id IN (${placeholders})`,
          [catName, String(catId), ...blingIds]
        );
        updated += blingIds.length;
      }

      page++;
    }
  }
  logger.info("Bling categorias dos produtos atualizadas", { updated });
  return updated;
}

// ── Sync Products ───────────────────────────────────────────────

export async function syncProducts(): Promise<number> {
  const token = await getValidToken();
  let page = 1;
  let total = 0;

  try {
    // Carrega mapa de categorias primeiro
    const categoryMap = await fetchCategoryMap(token);

    while (true) {
      const data = await rateLimitedGet<{ data: Array<Record<string, unknown>> }>(
        `${BLING_API}/produtos?pagina=${page}&limite=100`,
        token
      );

      if (!data.data || data.data.length === 0) break;

      for (const prod of data.data) {
        const categoriaObj = prod.categoria as { id?: number } | undefined;
        const categoriaName = categoriaObj?.id ? categoryMap.get(categoriaObj.id) || null : null;

        // O listing do Bling retorna imagemURL (primeira imagem) mas NÃO retorna midia.imagens
        // Para imagens completas, seria necessário GET /produtos/{id} (detalhe) — muito custoso em batch
        // Usamos imagemURL do listing + midia se disponível (ex: via webhook/detalhe)
        const midia = prod.midia as Record<string, unknown> | undefined;
        const imagensInternas = (midia?.imagens as Record<string, unknown>)?.internas as Array<Record<string, unknown>> | undefined;
        const imagensExternas = (midia?.imagens as Record<string, unknown>)?.externas as Array<Record<string, unknown>> | undefined;
        let imagens = [
          ...(imagensInternas || []).map((img, i) => ({ url: img.link || img.linkMiniatura, ordem: i })),
          ...(imagensExternas || []).map((img, i) => ({ url: img.link, ordem: 100 + i })),
        ].filter((img) => img.url);

        // Se não tem imagens do midia, usar imagemURL do listing (sempre disponível)
        if (imagens.length === 0 && prod.imagemURL) {
          imagens = [{ url: prod.imagemURL as string, ordem: 0 }];
        }

        const blingCategoryId = categoriaObj?.id && categoriaObj.id > 0 ? String(categoriaObj.id) : null;

        await query(
          `INSERT INTO sync.bling_products
           (bling_id, nome, sku, preco_custo, preco_venda, categoria, bling_category_id, imagens, ativo, tipo, unidade, peso_bruto, gtin, dados_raw, sincronizado_em)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
           ON CONFLICT (bling_id) DO UPDATE SET
             nome = $2, sku = $3, preco_custo = $4, preco_venda = $5, categoria = $6,
             bling_category_id = $7, imagens = $8, ativo = $9, tipo = $10, unidade = $11,
             peso_bruto = $12, gtin = $13, dados_raw = $14, sincronizado_em = NOW()`,
          [
            String(prod.id),
            prod.nome || "Sem nome",
            prod.codigo || null,
            prod.precoCusto || 0,
            prod.preco || 0,
            categoriaName,
            blingCategoryId,
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

    // Atualiza categorias via filtro idCategoria
    await syncProductCategories(token, categoryMap);

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

export async function incrementalSync(): Promise<{ customers: number; orders: number; products: number; stock: number; contasPagar: number }> {
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
        const blingId = String(contato.id);
        let email = ((contato.email as string) || "").trim();
        let telefone = ((contato.celular as string) || (contato.fone as string) || "").trim();
        let cpf = ((contato.cpf_cnpj as string) || "").trim();
        let cidade: string | undefined;
        let estado: string | undefined;
        let cep: string | undefined;
        let dataNasc: string | undefined;
        let dadosRaw = contato;

        // Se a lista não trouxe email, busca detalhe individual (tem email, endereço, etc.)
        if (!email) {
          try {
            const detail = await rateLimitedGet<{ data: Record<string, unknown> }>(
              `${BLING_API}/contatos/${blingId}`,
              token
            );
            const d = detail.data;
            if (d) {
              email = ((d.email as string) || (d.emailNotaFiscal as string) || "").trim();
              telefone = telefone || ((d.celular as string) || (d.telefone as string) || "").trim();
              cpf = cpf || ((d.numeroDocumento as string) || "").trim();
              const endGeral = (d.endereco as Record<string, Record<string, string>> | undefined)?.geral;
              cidade = endGeral?.municipio;
              estado = endGeral?.uf;
              cep = endGeral?.cep;
              const dn = (d.dadosAdicionais as Record<string, string> | undefined)?.dataNascimento;
              dataNasc = dn && dn !== "0000-00-00" ? dn : undefined;
              dadosRaw = d;
            }
          } catch (detailErr: unknown) {
            // Se falhar o detalhe, segue com dados da lista
            const msg = detailErr instanceof Error ? detailErr.message : "Erro";
            logger.warn("Bling incrementalSync: erro ao buscar detalhe do contato", { blingId, error: msg });
          }
        }

        const customer = await upsertCustomer({
          nome: contato.nome as string,
          email: email || undefined,
          telefone: telefone || undefined,
          cpf: cpf || undefined,
          canal_origem: "bling",
          bling_id: blingId,
          cidade,
          estado,
          cep,
          data_nasc: dataNasc,
        });

        await query(
          `INSERT INTO sync.bling_customers (bling_id, customer_id, dados_raw, ultima_sync)
           VALUES ($1, $2, $3, NOW())
           ON CONFLICT (bling_id) DO UPDATE SET customer_id = $2, dados_raw = $3, ultima_sync = NOW()`,
          [blingId, customer.id, JSON.stringify(dadosRaw)]
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
        // Busca detalhe para obter itens (lista Bling não traz)
        let itens: unknown[] = [];
        let valorTotal = pedido.totalProdutos || pedido.total || 0;
        try {
          const detail = await rateLimitedGet<{ data: Record<string, unknown> }>(
            `${BLING_API}/pedidos/vendas/${pedido.id}`,
            token
          );
          if (detail.data?.itens) {
            itens = detail.data.itens as unknown[];
          }
          if (detail.data?.total) {
            valorTotal = detail.data.total;
          }
        } catch (detailErr: unknown) {
          const msg = detailErr instanceof Error ? detailErr.message : "Erro";
          logger.warn("Bling incremental: erro ao buscar detalhe do pedido", { pedidoId: pedido.id, error: msg });
        }

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
             customer_id = $2, valor = $4, status = $5, canal = $6, itens = $7`,
          [
            String(pedido.id),
            customerId,
            pedido.numero || null,
            valorTotal,
            (pedido.situacao as Record<string, unknown>)?.valor || "desconhecido",
            classifyCanal((pedido.loja as Record<string, unknown>)?.id as number),
            JSON.stringify(itens),
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

  // Sync contas a pagar
  let contasPagar = 0;
  try {
    contasPagar = await syncContasPagar();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro";
    logger.error("Bling incrementalSync contas a pagar falhou", { error: message });
  }

  const totalSync = customers + orders + products + stock + contasPagar;

  // Atualiza timestamp de última sync
  await query(
    "UPDATE sync.sync_state SET ultima_sync = NOW(), total_sincronizados = total_sincronizados + $1 WHERE fonte = 'bling'",
    [totalSync]
  );

  // Atualiza contador dedicado de produtos
  if (products + stock > 0) {
    await query(
      "UPDATE sync.sync_state SET ultima_sync = NOW(), total_sincronizados = total_sincronizados + $1 WHERE fonte = 'bling_products'",
      [products + stock]
    );
  }

  await logSync("bling", "incremental", "ok", totalSync);
  logger.info("Bling incrementalSync concluído", { customers, orders, products, stock, contasPagar });

  return { customers, orders, products, stock, contasPagar };
}

// ── Sync Formas de Pagamento ────────────────────────────────────

export async function syncFormasPagamento(): Promise<number> {
  const token = await getValidToken();
  let total = 0;

  try {
    let page = 1;
    while (true) {
      const data = await rateLimitedGet<{ data: Array<Record<string, unknown>> }>(
        `${BLING_API}/formas-pagamentos?pagina=${page}&limite=100`,
        token
      );
      if (!data.data || data.data.length === 0) break;

      for (const fp of data.data) {
        await query(
          `INSERT INTO sync.bling_formas_pagamento (bling_id, descricao, tipo_pagamento, situacao, sincronizado_em)
           VALUES ($1, $2, $3, $4, NOW())
           ON CONFLICT (bling_id) DO UPDATE SET descricao = $2, tipo_pagamento = $3, situacao = $4, sincronizado_em = NOW()`,
          [String(fp.id), fp.descricao || "Desconhecido", fp.tipoPagamento || 0, fp.situacao || 1]
        );
        total++;
      }
      page++;
    }

    await logSync("bling", "formas_pagamento", "ok", total);
    logger.info("Bling syncFormasPagamento concluído", { total });
    return total;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro";
    await logSync("bling", "formas_pagamento", "erro", total, message);
    logger.error("Bling syncFormasPagamento falhou", { error: message });
    throw err;
  }
}

// ── Sync Parcelas dos pedidos (formas de pagamento por venda) ──

export async function syncOrderParcelas(): Promise<number> {
  const token = await getValidToken();
  let total = 0;

  try {
    // Busca pedidos que ainda não têm parcelas sincronizadas
    const orders = await query<{ bling_id: string }>(
      `SELECT o.bling_id FROM sync.bling_orders o
       LEFT JOIN sync.bling_order_parcelas p ON p.order_bling_id = o.bling_id
       WHERE p.id IS NULL
       LIMIT 200`
    );

    for (const order of orders) {
      try {
        const data = await rateLimitedGet<{ data: Record<string, unknown> }>(
          `${BLING_API}/pedidos/vendas/${order.bling_id}`,
          token
        );

        const parcelas = data.data?.parcelas as Array<Record<string, unknown>> | undefined;
        if (parcelas && parcelas.length > 0) {
          for (const parcela of parcelas) {
            const fp = parcela.formaPagamento as { id?: number } | undefined;

            // Busca nome da forma de pagamento
            let formaDesc = "Desconhecido";
            if (fp?.id) {
              const fpRow = await queryOne<{ descricao: string }>(
                "SELECT descricao FROM sync.bling_formas_pagamento WHERE bling_id = $1",
                [String(fp.id)]
              );
              formaDesc = fpRow?.descricao || "Desconhecido";
            }

            await query(
              `INSERT INTO sync.bling_order_parcelas
               (order_bling_id, parcela_bling_id, data_vencimento, valor, forma_pagamento_id, forma_descricao, sincronizado_em)
               VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
              [
                order.bling_id,
                parcela.id ? String(parcela.id) : null,
                parcela.dataVencimento || null,
                parcela.valor || 0,
                fp?.id ? String(fp.id) : null,
                formaDesc,
              ]
            );
            total++;
          }
        }
      } catch (detailErr: unknown) {
        const msg = detailErr instanceof Error ? detailErr.message : "Erro";
        if (!msg.includes("429")) {
          logger.warn("Erro ao buscar parcelas do pedido", { orderId: order.bling_id, error: msg });
        }
      }
    }

    await logSync("bling", "parcelas", "ok", total);
    logger.info("Bling syncOrderParcelas concluído", { total });
    return total;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro";
    await logSync("bling", "parcelas", "erro", total, message);
    logger.error("Bling syncOrderParcelas falhou", { error: message });
    throw err;
  }
}

// ── Sync NF-e emitidas ──────────────────────────────────────────

export async function syncNFe(): Promise<number> {
  const token = await getValidToken();
  let page = 1;
  let total = 0;

  try {
    while (true) {
      const data = await rateLimitedGet<{ data: Array<Record<string, unknown>> }>(
        `${BLING_API}/nfe?pagina=${page}&limite=100`,
        token
      );
      if (!data.data || data.data.length === 0) break;

      for (const nfe of data.data) {
        const contato = nfe.contato as Record<string, unknown> | undefined;

        await query(
          `INSERT INTO sync.bling_nfe
           (bling_id, tipo, situacao, numero, data_emissao, chave_acesso, contato_nome, contato_doc, dados_raw, sincronizado_em)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
           ON CONFLICT (bling_id) DO UPDATE SET
             situacao = $3, contato_nome = $7, contato_doc = $8, dados_raw = $9, sincronizado_em = NOW()`,
          [
            String(nfe.id),
            nfe.tipo || 1,
            nfe.situacao || 0,
            nfe.numero || null,
            nfe.dataEmissao || null,
            nfe.chaveAcesso || null,
            contato?.nome || null,
            contato?.numeroDocumento || null,
            JSON.stringify(nfe),
          ]
        );
        total++;
      }
      page++;
    }

    // Busca valor total de cada NF-e via detalhe (apenas as que não têm valor)
    const nfeSemValor = await query<{ bling_id: string }>(
      "SELECT bling_id FROM sync.bling_nfe WHERE valor_total = 0 OR valor_total IS NULL LIMIT 50"
    );

    for (const nf of nfeSemValor) {
      try {
        const detail = await rateLimitedGet<{ data: Record<string, unknown> }>(
          `${BLING_API}/nfe/${nf.bling_id}`,
          token
        );
        const valor = detail.data?.valorNota || detail.data?.total || 0;
        const natureza = (detail.data?.naturezaOperacao as Record<string, unknown>)?.descricao || null;

        await query(
          "UPDATE sync.bling_nfe SET valor_total = $2, natureza_op = $3 WHERE bling_id = $1",
          [nf.bling_id, valor, natureza]
        );
      } catch {
        // ignora erros de detalhe
      }
    }

    await logSync("bling", "nfe", "ok", total);
    logger.info("Bling syncNFe concluído", { total });
    return total;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro";
    await logSync("bling", "nfe", "erro", total, message);
    logger.error("Bling syncNFe falhou", { error: message });
    throw err;
  }
}

// ── Sync Contas a Pagar ─────────────────────────────────────────

export async function syncContasPagar(): Promise<number> {
  const token = await getValidToken();
  let page = 1;
  let total = 0;

  try {
    // Cache de contatos para evitar requests repetidos
    const contatoCache = new Map<string, { nome: string; doc: string }>();

    while (true) {
      const data = await rateLimitedGet<{ data: Array<Record<string, unknown>> }>(
        `${BLING_API}/contas/pagar?pagina=${page}&limite=100`,
        token
      );
      if (!data.data || data.data.length === 0) break;

      for (const conta of data.data) {
        const contatoId = (conta.contato as { id?: number })?.id;
        const formaPagId = (conta.formaPagamento as { id?: number })?.id;

        // Busca detalhe para pegar numero_documento e historico
        let detalhe: Record<string, unknown> = {};
        try {
          const det = await rateLimitedGet<{ data: Record<string, unknown> }>(
            `${BLING_API}/contas/pagar/${conta.id}`,
            token
          );
          detalhe = det.data || {};
        } catch {
          // ignora erro de detalhe
        }

        // Busca data de pagamento via bordero
        let dataPagamento: string | null = null;
        let valorPago = 0;
        const borderos = detalhe.borderos as number[] | undefined;
        if (borderos && borderos.length > 0 && conta.situacao === 2) {
          try {
            const bord = await rateLimitedGet<{ data: { data?: string; pagamentos?: Array<{ valorPago?: number }> } }>(
              `${BLING_API}/borderos/${borderos[0]}`,
              token
            );
            dataPagamento = bord.data?.data || null;
            valorPago = bord.data?.pagamentos?.[0]?.valorPago || (conta.valor as number) || 0;
          } catch {
            // ignora
          }
        }

        // Busca nome do contato (com cache)
        let contatoNome = "";
        let contatoDoc = "";
        if (contatoId) {
          const cached = contatoCache.get(String(contatoId));
          if (cached) {
            contatoNome = cached.nome;
            contatoDoc = cached.doc;
          } else {
            try {
              const ct = await rateLimitedGet<{ data: { nome?: string; numeroDocumento?: string } }>(
                `${BLING_API}/contatos/${contatoId}`,
                token
              );
              contatoNome = ct.data?.nome || "";
              contatoDoc = ct.data?.numeroDocumento || "";
              contatoCache.set(String(contatoId), { nome: contatoNome, doc: contatoDoc });
            } catch {
              // ignora
            }
          }
        }

        // Busca nome da forma de pagamento
        let formaDesc = "";
        if (formaPagId) {
          const fp = await queryOne<{ descricao: string }>(
            "SELECT descricao FROM sync.bling_formas_pagamento WHERE bling_id = $1",
            [String(formaPagId)]
          );
          formaDesc = fp?.descricao || "";
        }

        await query(
          `INSERT INTO sync.bling_contas_pagar
           (bling_id, situacao, vencimento, valor, saldo, data_emissao, numero_documento, historico,
            contato_bling_id, contato_nome, contato_doc, forma_pagamento, data_pagamento, valor_pago, dados_raw, sincronizado_em)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15, NOW())
           ON CONFLICT (bling_id) DO UPDATE SET
             situacao=$2, valor=$4, saldo=$5, contato_nome=$10, contato_doc=$11,
             forma_pagamento=$12, data_pagamento=$13, valor_pago=$14, dados_raw=$15, sincronizado_em=NOW()`,
          [
            String(conta.id),
            conta.situacao || 1,
            conta.vencimento || null,
            conta.valor || 0,
            detalhe.saldo || 0,
            detalhe.dataEmissao || null,
            detalhe.numeroDocumento || null,
            detalhe.historico || null,
            contatoId ? String(contatoId) : null,
            contatoNome,
            contatoDoc,
            formaDesc,
            dataPagamento,
            valorPago,
            JSON.stringify({ ...conta, detalhe }),
          ]
        );
        total++;
      }
      page++;
    }

    await logSync("bling", "contas_pagar", "ok", total);
    logger.info("Bling syncContasPagar concluído", { total });
    return total;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro";
    await logSync("bling", "contas_pagar", "erro", total, message);
    logger.error("Bling syncContasPagar falhou", { error: message });
    throw err;
  }
}

// ── Sync NF de Entrada (compra) do Bling com itens ──────────────

export async function syncNfEntrada(): Promise<number> {
  const token = await getValidToken();
  let page = 1;
  let total = 0;

  try {
    while (true) {
      const data = await rateLimitedGet<{ data: Array<Record<string, unknown>> }>(
        `${BLING_API}/nfe?pagina=${page}&limite=100&tipo=0`,
        token
      );
      if (!data.data || data.data.length === 0) break;

      for (const nfe of data.data) {
        const contato = nfe.contato as Record<string, unknown> | undefined;
        const endereco = contato?.endereco as Record<string, unknown> | undefined;
        const chave = nfe.chaveAcesso as string;

        if (!chave) continue;

        // Verifica se ja existe
        const existing = await queryOne<{ id: string }>(
          "SELECT id FROM financeiro.notas_entrada WHERE chave_acesso = $1",
          [chave]
        );

        if (existing) {
          total++;
          continue; // Ja sincronizada
        }

        // Busca detalhe com itens
        let itens: Array<Record<string, unknown>> = [];
        let valorNota = 0;
        try {
          const detail = await rateLimitedGet<{ data: Record<string, unknown> }>(
            `${BLING_API}/nfe/${nfe.id}`,
            token
          );
          itens = (detail.data?.itens as Array<Record<string, unknown>>) || [];
          valorNota = (detail.data?.valorNota as number) || 0;
        } catch {
          // Se nao conseguir detalhe, insere sem itens
        }

        const valorProdutos = itens.reduce((s, i) => s + ((i.valorTotal as number) || 0), 0);
        const numero = (nfe.numero as string || "").replace(/^0+/, "");

        // Insere NF
        const inserted = await queryOne<{ id: string }>(
          `INSERT INTO financeiro.notas_entrada
           (numero, chave_acesso, fornecedor_cnpj, fornecedor_nome, fornecedor_uf,
            valor_produtos, valor_total, data_emissao, status, observacoes)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pendente', $9)
           ON CONFLICT (chave_acesso) DO NOTHING
           RETURNING id`,
          [
            numero,
            chave,
            contato?.numeroDocumento || null,
            contato?.nome || null,
            endereco?.uf || null,
            valorProdutos || valorNota,
            valorNota || valorProdutos,
            nfe.dataEmissao ? (nfe.dataEmissao as string).split(" ")[0] : null,
            `Sync automatico do Bling - NF ${numero}`,
          ]
        );

        if (inserted) {
          // Insere itens
          if (itens.length > 0) {
            for (let idx = 0; idx < itens.length; idx++) {
              const item = itens[idx];
              const impostos = item.impostos as Record<string, unknown> | undefined;

              await query(
                `INSERT INTO financeiro.notas_entrada_itens
                 (nota_id, numero_item, codigo_produto, descricao, ncm, cfop, unidade,
                  quantidade, valor_unitario, valor_total, icms_valor, ipi_valor, pis_valor, cofins_valor)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
                [
                  inserted.id,
                  idx + 1,
                  item.codigo || item.gtin || null,
                  item.descricao || "Sem descricao",
                  item.classificacaoFiscal || null,
                  item.cfop || null,
                  item.unidade || "UN",
                  item.quantidade || 0,
                  item.valor || 0,
                  item.valorTotal || 0,
                  (impostos?.icms as Record<string, unknown>)?.valor || 0,
                  (impostos?.ipi as Record<string, unknown>)?.valor || 0,
                  (impostos?.pis as Record<string, unknown>)?.valor || 0,
                  (impostos?.cofins as Record<string, unknown>)?.valor || 0,
                ]
              );
            }
          }

          // Contabiliza automaticamente como despesa
          const valorTotal = valorNota || valorProdutos;
          if (valorTotal > 0) {
            const categoria = await queryOne<{ id: string }>(
              "SELECT id FROM financeiro.categorias WHERE nome = 'Fornecedores' AND tipo = 'despesa' LIMIT 1"
            );

            if (categoria) {
              const descricao = `NF ${numero} — ${contato?.nome || "Fornecedor"}`;
              const dataEmissao = nfe.dataEmissao ? (nfe.dataEmissao as string).split(" ")[0] : new Date().toISOString().split("T")[0];

              const lancamento = await queryOne<{ id: string }>(`
                INSERT INTO financeiro.lancamentos (
                  data, descricao, categoria_id, tipo, valor, status, observacoes,
                  referencia_id, referencia_tipo
                ) VALUES ($1, $2, $3, 'despesa', $4, 'realizado', $5, $6, 'nf_entrada')
                RETURNING id
              `, [
                dataEmissao,
                descricao,
                categoria.id,
                valorTotal,
                `Sync automatico Bling - NF ${numero}`,
                inserted.id,
              ]);

              if (lancamento) {
                await query(
                  "UPDATE financeiro.notas_entrada SET status = 'contabilizada', lancamento_id = $1 WHERE id = $2",
                  [lancamento.id, inserted.id]
                );

                // Atualiza preco_custo dos produtos vinculados por SKU/GTIN
                for (const nfItem of itens) {
                  const codigo = nfItem.codigo || nfItem.gtin;
                  const custo = nfItem.valor as number;
                  if (codigo && custo > 0) {
                    await query(
                      `UPDATE sync.bling_products SET preco_custo = $1, atualizado_em = NOW()
                       WHERE (sku = $2 OR gtin = $2) AND ativo = true`,
                      [custo, String(codigo)]
                    );
                  }
                }
              }
            }
          }
        }

        total++;
      }
      page++;
    }

    await logSync("bling", "nf_entrada", "ok", total);
    logger.info("Bling syncNfEntrada concluído", { total });
    return total;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro";
    await logSync("bling", "nf_entrada", "erro", total, message);
    logger.error("Bling syncNfEntrada falhou", { error: message });
    throw err;
  }
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
