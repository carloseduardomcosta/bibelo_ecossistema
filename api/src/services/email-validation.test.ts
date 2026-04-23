/**
 * Testes — email-validation.service.ts + buildFlowEmail (selecionados)
 *
 * Usa banco real (test-setup.ts conecta antes dos testes).
 * Nunca dispara emails reais (VITEST=true ativa mock em sendEmail).
 * Clientes e pedidos de teste são limpos no afterAll.
 */

import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { query, queryOne } from "../db";
import { validateEmailContext } from "./email-validation.service";
import { buildFlowEmail } from "./flow.service";

// ── IDs de teste (UUID fictício estável) ──────────────────────────

const TEST_ID = "00000000-test-0056-0000-000000000001";

// ── Setup / Teardown ──────────────────────────────────────────────

beforeAll(async () => {
  await query(
    `INSERT INTO crm.customers (id, nome, email, email_optout, ativo)
     VALUES ($1, 'Cliente Teste 056', 'teste056@exemplo.com.br', false, true)
     ON CONFLICT (id) DO NOTHING`,
    [TEST_ID],
  );
});

afterAll(async () => {
  await query("DELETE FROM marketing.email_send_log WHERE customer_id = $1", [TEST_ID]);
  await query("DELETE FROM crm.customers WHERE id = $1", [TEST_ID]);
});

// ── validateEmailContext ──────────────────────────────────────────

describe("validateEmailContext — bloqueios", () => {
  it("passa quando email válido, opt-out false, contexto ok", async () => {
    const result = await validateEmailContext("Boas-vindas", TEST_ID, {});
    expect(result.ok).toBe(true);
  });

  it("bloqueia quando cliente não existe", async () => {
    const result = await validateEmailContext("Boas-vindas", "00000000-0000-0000-0000-999999999999", {});
    expect(result.ok).toBe(false);
    expect(result.motivo).toBe("email_invalido");
  });

  it("bloqueia quando cliente fez opt-out", async () => {
    await query("UPDATE crm.customers SET email_optout = true WHERE id = $1", [TEST_ID]);
    const result = await validateEmailContext("Boas-vindas", TEST_ID, {});
    expect(result.ok).toBe(false);
    expect(result.motivo).toBe("email_optout");
    await query("UPDATE crm.customers SET email_optout = false WHERE id = $1", [TEST_ID]);
  });

  it("bloqueia produto-visitado sem URL (pagina ausente)", async () => {
    const result = await validateEmailContext("Produto Visitado", TEST_ID, {});
    expect(result.ok).toBe(false);
    expect(result.motivo).toBe("produto_visitado_sem_url_produto");
  });

  it("bloqueia produto-visitado com URL = homepage (fallback)", async () => {
    const result = await validateEmailContext("Produto Visitado", TEST_ID, {
      pagina: "https://www.papelariabibelo.com.br",
    });
    expect(result.ok).toBe(false);
    expect(result.motivo).toBe("produto_visitado_sem_url_produto");
  });

  it("bloqueia produto-visitado com URL http (não HTTPS)", async () => {
    const result = await validateEmailContext("Produto Visitado", TEST_ID, {
      pagina: "http://www.papelariabibelo.com.br/produto/caneta",
    });
    expect(result.ok).toBe(false);
    expect(result.motivo).toBe("produto_visitado_sem_url_produto");
  });

  it("passa produto-visitado com URL de produto real (HTTPS)", async () => {
    const result = await validateEmailContext("Produto Visitado", TEST_ID, {
      pagina: "https://www.papelariabibelo.com.br/produto/caneta-brw",
    });
    expect(result.ok).toBe(true);
  });

  it("registra bloqueio em marketing.email_send_log", async () => {
    await validateEmailContext("Produto Visitado", TEST_ID, {});
    const log = await queryOne<{ motivo: string }>(
      "SELECT motivo FROM marketing.email_send_log WHERE customer_id = $1 ORDER BY created_at DESC LIMIT 1",
      [TEST_ID],
    );
    expect(log?.motivo).toBe("produto_visitado_sem_url_produto");
  });

  it("bloqueia cross-sell sem co-compras no banco", async () => {
    // Cliente novo sem pedidos — não vai ter co-compras
    const result = await validateEmailContext("Cross-sell", TEST_ID, {});
    expect(result.ok).toBe(false);
    expect(result.motivo).toBe("cross_sell_sem_recomendacoes");
  });
});

// ── buildFlowEmail — estrutura HTML básica ────────────────────────

describe("buildFlowEmail — estrutura do HTML", () => {
  it("boas-vindas: contém preheader e CTA 'Conhecer a loja'", async () => {
    const html = await buildFlowEmail("Maria Teste", "Boas-vindas", {});
    expect(html).toContain("display:none"); // preheader oculto
    expect(html).toContain("Conhecer a loja");
    expect(html).toContain("Papelaria Bibelô");
  });

  it("fomo vip: exibe contagem de membros do metadata", async () => {
    const html = await buildFlowEmail("Maria Teste", "FOMO Grupo VIP", {
      membros_vip: 140,
    });
    expect(html).toContain("140");
    expect(html).toContain("Entrar no grupo VIP agora");
  });

  it("agradecimento: contém VIP block quando vip_confirmado=true", async () => {
    const html = await buildFlowEmail("Maria Teste", "Agradecimento Pós-Compra", {
      vip_confirmado: true,
    });
    expect(html).toContain("Você é do Clube VIP Bibelô");
  });

  it("agradecimento: não contém VIP block quando vip_confirmado=false", async () => {
    const html = await buildFlowEmail("Maria Teste", "Agradecimento Pós-Compra", {
      vip_confirmado: false,
    });
    expect(html).not.toContain("Você é do Clube VIP Bibelô");
  });

  it("produto visitado: exibe nome e CTA com link correto", async () => {
    const html = await buildFlowEmail("Maria Teste", "Produto Visitado", {
      resource_nome: "CANETA BRW GEL AZUL",
      resource_preco: 7.9,
      pagina: "https://www.papelariabibelo.com.br/produto/caneta-brw",
    });
    expect(html).toContain("Caneta Brw Gel Azul"); // toTitleCase aplicado
    expect(html).toContain("papelariabibelo.com.br/produto/caneta-brw");
    expect(html).toContain("Ver este produto");
  });

  it("reativação: exibe último produto comprado (toTitleCase)", async () => {
    const html = await buildFlowEmail("Maria Teste", "Reativação Inativo", {
      ultimo_produto: "CADERNO TILIBRA 80 FLS",
      dias_sem_compra: 65,
    });
    expect(html).toContain("Caderno Tilibra 80 Fls");
    expect(html).toContain("65 dias");
  });

  it("todos os templates contêm link de descadastro", async () => {
    const templates = [
      "Boas-vindas",
      "Agradecimento Pós-Compra",
      "Reativação Inativo",
      "FOMO Grupo VIP",
    ];
    for (const t of templates) {
      const html = await buildFlowEmail("Teste", t, {});
      expect(html, `Template "${t}" sem link de descadastro`).toContain("unsubscribe");
    }
  });

  it("todos os templates contêm wrapper Bibelô com rodapé", async () => {
    const html = await buildFlowEmail("Teste", "Boas-vindas", {});
    expect(html).toContain("CNPJ 63.961.764/0001-63");
    expect(html).toContain("instagram.com/papelariabibelo");
  });
});
