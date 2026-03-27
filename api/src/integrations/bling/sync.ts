import axios from "axios";
import { query, queryOne } from "../../db";
import { logger } from "../../utils/logger";
import { getValidToken, BLING_API } from "./auth";
import { upsertCustomer, calculateScore } from "../../services/customer.service";

// ── Rate limit: max 3 req/s (Bling v3) ─────────────────────────

let lastRequestTime = 0;

async function rateLimitedGet<T>(url: string, token: string): Promise<T> {
  // Garante intervalo mínimo de 350ms entre requests (≈2.8 req/s, margem segura)
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < 350) {
    await new Promise((resolve) => setTimeout(resolve, 350 - elapsed));
  }
  lastRequestTime = Date.now();

  try {
    const { data } = await axios.get<T>(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return data;
  } catch (err: unknown) {
    const axiosErr = err as { response?: { status?: number } };
    if (axiosErr.response?.status === 429) {
      // Rate limited — espera 10s e retenta
      logger.warn("Bling rate limit 429: aguardando 10s");
      await new Promise((resolve) => setTimeout(resolve, 10_000));
      lastRequestTime = Date.now();
      const { data } = await axios.get<T>(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return data;
    }
    throw err;
  }
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
             customer_id = $2, valor = $4, status = $5, itens = $7`,
          [
            String(pedido.id),
            customerId,
            pedido.numero || null,
            valorTotal,
            (pedido.situacao as Record<string, unknown>)?.valor || "desconhecido",
            pedido.loja ? "online" : "fisico",
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
  logger.info("Bling categorias carregadas", { total: map.size });
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
        const placeholders = blingIds.map((_, i) => `$${i + 2}`).join(", ");
        await query(
          `UPDATE sync.bling_products SET categoria = $1 WHERE bling_id IN (${placeholders})`,
          [catName, ...blingIds]
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

        const midia = prod.midia as Record<string, unknown> | undefined;
        const imagensInternas = (midia?.imagens as Record<string, unknown>)?.internas as Array<Record<string, unknown>> | undefined;
        const imagensExternas = (midia?.imagens as Record<string, unknown>)?.externas as Array<Record<string, unknown>> | undefined;
        const imagens = [
          ...(imagensInternas || []).map((img, i) => ({ url: img.link || img.linkMiniatura, ordem: i })),
          ...(imagensExternas || []).map((img, i) => ({ url: img.link, ordem: 100 + i })),
        ].filter((img) => img.url);

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
            categoriaName,
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
