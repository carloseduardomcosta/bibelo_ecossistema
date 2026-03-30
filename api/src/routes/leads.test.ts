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
});
