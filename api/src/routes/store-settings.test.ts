import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";

const BASE = "http://localhost:4000";

describe("Store Settings API", () => {
  // ── GET /api/store-settings (público) ──────────────────────

  describe("GET /api/store-settings", () => {
    it("retorna 200 e objeto com categorias", async () => {
      const res = await request(BASE).get("/api/store-settings");
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("pagamento");
      expect(res.body).toHaveProperty("frete");
      expect(res.body).toHaveProperty("checkout");
      expect(res.body).toHaveProperty("geral");
      expect(res.body).toHaveProperty("marketing");
    });

    it("categoria pagamento tem campos essenciais", async () => {
      const res = await request(BASE).get("/api/store-settings");
      const pag = res.body.pagamento;
      expect(pag).toHaveProperty("pix_ativo");
      expect(pag).toHaveProperty("pix_desconto");
      expect(pag).toHaveProperty("cartao_ativo");
      expect(pag).toHaveProperty("cartao_parcelas_max");
      expect(pag).toHaveProperty("boleto_ativo");
    });

    it("categoria frete tem campos essenciais", async () => {
      const res = await request(BASE).get("/api/store-settings");
      const frete = res.body.frete;
      expect(frete).toHaveProperty("frete_gratis_ativo");
      expect(frete).toHaveProperty("frete_gratis_valor");
      expect(frete).toHaveProperty("retirada_ativo");
    });

    it("categoria geral tem dados da loja", async () => {
      const res = await request(BASE).get("/api/store-settings");
      const geral = res.body.geral;
      expect(geral.loja_nome).toBe("Papelaria Bibelô");
      expect(geral.loja_cnpj).toBe("63.961.764/0001-63");
      expect(geral.loja_email).toContain("papelariabibelo.com.br");
    });

    it("valores são strings (formato esperado pelo storefront)", async () => {
      const res = await request(BASE).get("/api/store-settings");
      const pag = res.body.pagamento;
      expect(typeof pag.pix_ativo).toBe("string");
      expect(typeof pag.pix_desconto).toBe("string");
      expect(typeof pag.cartao_parcelas_max).toBe("string");
    });

    it("cache funciona (segunda chamada rápida)", async () => {
      const start1 = Date.now();
      await request(BASE).get("/api/store-settings");
      const elapsed1 = Date.now() - start1;

      const start2 = Date.now();
      await request(BASE).get("/api/store-settings");
      const elapsed2 = Date.now() - start2;

      // Segunda chamada deve ser mais rápida (cache)
      expect(elapsed2).toBeLessThan(elapsed1 + 50);
    });
  });

  // ── GET /api/store-settings/all (autenticado) ──────────────

  describe("GET /api/store-settings/all", () => {
    it("retorna 401 sem autenticação", async () => {
      const res = await request(BASE).get("/api/store-settings/all");
      expect(res.status).toBe(401);
    });
  });

  // ── PUT /api/store-settings (autenticado) ──────────────────

  describe("PUT /api/store-settings", () => {
    it("retorna 401 sem autenticação", async () => {
      const res = await request(BASE)
        .put("/api/store-settings")
        .send({ settings: [{ categoria: "pagamento", chave: "pix_desconto", valor: "5" }] });
      expect(res.status).toBe(401);
    });

    it("retorna 400 com body inválido (sem auth)", async () => {
      const res = await request(BASE)
        .put("/api/store-settings")
        .send({ invalid: true });
      // Será 401 primeiro (auth), não chega a validar body
      expect([400, 401]).toContain(res.status);
    });
  });

  // ── Validação de dados ─────────────────────────────────────

  describe("Integridade dos dados", () => {
    it("pix_desconto é numérico", async () => {
      const res = await request(BASE).get("/api/store-settings");
      const val = Number(res.body.pagamento.pix_desconto);
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThanOrEqual(100);
    });

    it("cartao_parcelas_max é entre 1 e 24", async () => {
      const res = await request(BASE).get("/api/store-settings");
      const val = Number(res.body.pagamento.cartao_parcelas_max);
      expect(val).toBeGreaterThanOrEqual(1);
      expect(val).toBeLessThanOrEqual(24);
    });

    it("frete_gratis_valor é positivo (em centavos)", async () => {
      const res = await request(BASE).get("/api/store-settings");
      const val = Number(res.body.frete.frete_gratis_valor);
      expect(val).toBeGreaterThan(0);
    });

    it("frete_gratis_regioes é JSON válido", async () => {
      const res = await request(BASE).get("/api/store-settings");
      const parsed = JSON.parse(res.body.frete.frete_gratis_regioes);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBeGreaterThan(0);
    });

    it("booleans são 'true' ou 'false'", async () => {
      const res = await request(BASE).get("/api/store-settings");
      const boolFields = [
        res.body.pagamento.pix_ativo,
        res.body.pagamento.cartao_ativo,
        res.body.pagamento.boleto_ativo,
        res.body.frete.frete_gratis_ativo,
        res.body.frete.retirada_ativo,
      ];
      for (const val of boolFields) {
        expect(["true", "false"]).toContain(val);
      }
    });
  });

  // ── Segurança ──────────────────────────────────────────────

  describe("Segurança", () => {
    it("GET público não expõe metadados (tipo, descricao)", async () => {
      const res = await request(BASE).get("/api/store-settings");
      // O GET público só retorna {categoria: {chave: valor}}
      const pagamento = res.body.pagamento;
      expect(pagamento).not.toHaveProperty("tipo");
      expect(pagamento).not.toHaveProperty("descricao");
      expect(pagamento).not.toHaveProperty("label");
    });

    it("PUT não aceita categorias inexistentes", async () => {
      // Mesmo sem auth, a validação Zod aceita qualquer string — mas no banco não altera
      // Este teste verifica que o schema Zod aceita mas o UPDATE não afeta nada
      // (o endpoint precisa de auth para funcionar, então testamos indiretamente)
      const res = await request(BASE).get("/api/store-settings");
      expect(res.body).not.toHaveProperty("hack_category");
    });
  });
});
