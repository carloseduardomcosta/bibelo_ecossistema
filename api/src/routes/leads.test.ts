import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { app } from "../server";
import { query } from "../db";
import crypto from "crypto";

const JWT_SECRET = process.env.JWT_SECRET || "bibelo-verify-fallback";
const TEST_EMAIL = "vitest-lead-test@example.com";

function gerarTokenVerificacao(email: string): string {
  return crypto.createHmac("sha256", JWT_SECRET)
    .update("lead-verify:" + email.toLowerCase().trim())
    .digest("hex");
}

// Cleanup após testes
afterAll(async () => {
  await query("DELETE FROM crm.deals WHERE customer_id IN (SELECT id FROM crm.customers WHERE email = $1)", [TEST_EMAIL]);
  await query("DELETE FROM marketing.leads WHERE email = $1", [TEST_EMAIL]);
  await query("DELETE FROM crm.customers WHERE email = $1", [TEST_EMAIL]);
});

describe("POST /api/leads/capture", () => {
  it("retorna 400 com email inválido", async () => {
    const res = await request(app)
      .post("/api/leads/capture")
      .send({ email: "nao-e-email" });
    expect(res.status).toBe(400);
  });

  it("retorna 400 sem email", async () => {
    const res = await request(app)
      .post("/api/leads/capture")
      .send({ nome: "Teste" });
    expect(res.status).toBe(400);
  });

  it("captura lead e retorna verificacao pendente (sem cupom)", async () => {
    const res = await request(app)
      .post("/api/leads/capture")
      .send({ email: TEST_EMAIL, nome: "Teste Vitest" });
    expect(res.status).toBe(200);
    expect(res.body.verificacao).toBe("pendente");
    expect(res.body.ok).toBe(true);
    // Nunca deve retornar cupom na captura
    expect(res.body.cupom).toBeUndefined();
  });

  it("normaliza email para lowercase", async () => {
    const res = await request(app)
      .post("/api/leads/capture")
      .send({ email: TEST_EMAIL.toUpperCase() });
    expect(res.status).toBe(200);
    // Deve reconhecer como duplicado (já existe em lowercase)
    expect(res.body.verificacao).toBe("pendente");
  });

  it("rejeita SQL injection no email", async () => {
    const res = await request(app)
      .post("/api/leads/capture")
      .send({ email: "test@x.com'; DROP TABLE marketing.leads;--" });
    expect(res.status).toBe(400);
  });
});

describe("GET /api/leads/confirm", () => {
  it("retorna 400 sem parâmetros", async () => {
    const res = await request(app).get("/api/leads/confirm");
    expect(res.status).toBe(400);
  });

  it("retorna 403 com token inválido", async () => {
    const res = await request(app).get(`/api/leads/confirm?email=${TEST_EMAIL}&token=${"b".repeat(64)}`);
    expect(res.status).toBe(403);
  });

  it("retorna 403 com token curto (não 500)", async () => {
    const res = await request(app).get(`/api/leads/confirm?email=${TEST_EMAIL}&token=short`);
    expect(res.status).toBe(403);
  });

  it("confirma email com token válido", async () => {
    const token = gerarTokenVerificacao(TEST_EMAIL);
    const res = await request(app).get(`/api/leads/confirm?email=${encodeURIComponent(TEST_EMAIL)}&token=${token}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain("E-mail confirmado");
  });

  it("é idempotente (segunda confirmação retorna 200)", async () => {
    const token = gerarTokenVerificacao(TEST_EMAIL);
    const res = await request(app).get(`/api/leads/confirm?email=${encodeURIComponent(TEST_EMAIL)}&token=${token}`);
    expect(res.status).toBe(200);
  });

  it("retorna 404 para email sem lead", async () => {
    const fakeEmail = "nao-existe-vitest@example.com";
    const token = gerarTokenVerificacao(fakeEmail);
    const res = await request(app).get(`/api/leads/confirm?email=${encodeURIComponent(fakeEmail)}&token=${token}`);
    expect(res.status).toBe(404);
  });

  it("lead verificado retorna ja_verificado no capture", async () => {
    const res = await request(app)
      .post("/api/leads/capture")
      .send({ email: TEST_EMAIL });
    expect(res.status).toBe(200);
    expect(res.body.verificacao).toBe("ja_verificado");
  });
});

describe("GET /api/leads/config", () => {
  it("retorna popups sem auth", async () => {
    const res = await request(app).get("/api/leads/config");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("popups");
    expect(Array.isArray(res.body.popups)).toBe(true);
  });
});

describe("GET /api/leads/popup.js", () => {
  it("retorna script JavaScript", async () => {
    const res = await request(app).get("/api/leads/popup.js");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("javascript");
    expect(res.text).toContain("bibelo");
  });

  it("contém lógica de forceOpen para ?clube=1", async () => {
    const res = await request(app).get("/api/leads/popup.js");
    expect(res.text).toContain("forceClube");
    expect(res.text).toContain("clube=1");
  });

  it("contém lógica de forceOpen para ?desconto=1", async () => {
    const res = await request(app).get("/api/leads/popup.js");
    expect(res.text).toContain("forceDesconto");
    expect(res.text).toContain("desconto=1");
  });

  it("seleciona popup desconto_primeira_compra quando ?desconto=1", async () => {
    const res = await request(app).get("/api/leads/popup.js");
    expect(res.text).toContain("desconto_primeira_compra");
  });

  it("não contém regex inválida (\\?$ deve ser escapada)", async () => {
    const res = await request(app).get("/api/leads/popup.js");
    // Verifica que o JS é sintaticamente válido — não deve ter /?\$/ sem escape
    expect(res.text).not.toContain("/?$/");
    expect(res.text).toContain("/\\?$/");
  });

  it("tem headers CORS corretos para cross-origin", async () => {
    const res = await request(app).get("/api/leads/popup.js");
    expect(res.headers["access-control-allow-origin"]).toBe("*");
    expect(res.headers["cache-control"]).toContain("max-age=300");
  });

  it("escapa variáveis com esc() contra XSS", async () => {
    const res = await request(app).get("/api/leads/popup.js");
    expect(res.text).toContain("function esc(s)");
    // Toda renderização de config usa esc()
    expect(res.text).toContain("esc(config.titulo");
    expect(res.text).toContain("esc(config.subtitulo");
    expect(res.text).toContain("esc(config.desconto_texto");
  });
});

describe("GET /api/leads/config — popup configs", () => {
  it("retorna popup clube_bibelo ativo", async () => {
    const res = await request(app).get("/api/leads/config");
    const clube = res.body.popups.find((p: Record<string, unknown>) => p.id === "clube_bibelo");
    expect(clube).toBeDefined();
    expect(clube.cupom).toBe("CLUBEBIBELO");
    expect(clube.desconto_texto).toBe("FRETE GRÁTIS");
  });

  it("retorna popup desconto_primeira_compra ativo", async () => {
    const res = await request(app).get("/api/leads/config");
    const desconto = res.body.popups.find((p: Record<string, unknown>) => p.id === "desconto_primeira_compra");
    expect(desconto).toBeDefined();
    expect(desconto.cupom).toBe("BIBELO7");
    expect(desconto.desconto_texto).toBe("7% OFF");
  });

  it("não expõe campos sensíveis na config pública", async () => {
    const res = await request(app).get("/api/leads/config");
    const json = JSON.stringify(res.body);
    expect(json).not.toContain("password");
    expect(json).not.toContain("secret");
    expect(json).not.toContain("token");
    expect(json).not.toContain("JWT");
  });

  it("retorna exit_intent separado do timer", async () => {
    const res = await request(app).get("/api/leads/config");
    const tipos = res.body.popups.map((p: Record<string, unknown>) => p.tipo);
    expect(tipos).toContain("timer");
    expect(tipos).toContain("exit_intent");
  });
});

describe("Segurança — leads capture", () => {
  it("bloqueia XSS no nome", async () => {
    const res = await request(app)
      .post("/api/leads/capture")
      .send({ email: "xss-test-vitest@example.com", nome: '<script>alert("xss")</script>' });
    expect(res.status).toBe(200);
    // Verifica que o nome foi sanitizado no banco
    const lead = await query("SELECT nome FROM marketing.leads WHERE email = $1", ["xss-test-vitest@example.com"]);
    if (lead.length > 0) {
      expect(lead[0].nome).not.toContain("<script>");
    }
    // Cleanup
    await query("DELETE FROM crm.deals WHERE customer_id IN (SELECT id FROM crm.customers WHERE email = $1)", ["xss-test-vitest@example.com"]);
    await query("DELETE FROM marketing.leads WHERE email = $1", ["xss-test-vitest@example.com"]);
    await query("DELETE FROM crm.customers WHERE email = $1", ["xss-test-vitest@example.com"]);
  });

  it("bloqueia SQL injection no popup_id", async () => {
    const res = await request(app)
      .post("/api/leads/capture")
      .send({ email: "sqli-popup-vitest@example.com", popup_id: "'; DROP TABLE marketing.leads;--" });
    // Deve processar normalmente (param via $1), não crashar
    expect([200, 400]).toContain(res.status);
    // Cleanup
    await query("DELETE FROM crm.deals WHERE customer_id IN (SELECT id FROM crm.customers WHERE email = $1)", ["sqli-popup-vitest@example.com"]);
    await query("DELETE FROM marketing.leads WHERE email = $1", ["sqli-popup-vitest@example.com"]);
    await query("DELETE FROM crm.customers WHERE email = $1", ["sqli-popup-vitest@example.com"]);
  });

  it("captura com popup_id vincula ao cupom correto (BIBELO7)", async () => {
    const res = await request(app)
      .post("/api/leads/capture")
      .send({ email: "cupom-test-vitest@example.com", popup_id: "desconto_primeira_compra" });
    expect(res.status).toBe(200);

    const lead = await query("SELECT cupom FROM marketing.leads WHERE email = $1", ["cupom-test-vitest@example.com"]);
    expect(lead.length).toBeGreaterThan(0);
    expect(lead[0].cupom).toBe("BIBELO7");

    // Cleanup
    await query("DELETE FROM crm.deals WHERE customer_id IN (SELECT id FROM crm.customers WHERE email = $1)", ["cupom-test-vitest@example.com"]);
    await query("DELETE FROM marketing.leads WHERE email = $1", ["cupom-test-vitest@example.com"]);
    await query("DELETE FROM crm.customers WHERE email = $1", ["cupom-test-vitest@example.com"]);
  });

  it("popup clube_bibelo tem cupom CLUBEBIBELO no banco", async () => {
    const popup = await query("SELECT cupom FROM marketing.popup_config WHERE id = $1 AND ativo = true", ["clube_bibelo"]);
    expect(popup.length).toBe(1);
    expect(popup[0].cupom).toBe("CLUBEBIBELO");
  });

  it("popup desconto_primeira_compra tem cupom BIBELO7 no banco", async () => {
    const popup = await query("SELECT cupom FROM marketing.popup_config WHERE id = $1 AND ativo = true", ["desconto_primeira_compra"]);
    expect(popup.length).toBe(1);
    expect(popup[0].cupom).toBe("BIBELO7");
  });

  // Rate limit DEVE ser o último teste — esgota o bucket e afeta testes seguintes
  it("respeita rate limit nos endpoints públicos", async () => {
    const promises = [];
    for (let i = 0; i < 25; i++) {
      promises.push(request(app).get("/api/leads/config"));
    }
    const results = await Promise.all(promises);
    const blocked = results.filter(r => r.status === 429);
    expect(blocked.length).toBeGreaterThan(0);
  });
});
