import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../server";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "";

function adminToken(): string {
  return jwt.sign({ userId: "test-admin", email: "test@test.com", papel: "admin" }, JWT_SECRET, { expiresIn: "1h" });
}

// ── GET /api/search ──────────────────────────────────────────────

describe("GET /api/search", () => {
  it("retorna 401 sem token", async () => {
    const res = await request(app).get("/api/search?q=caneta");
    expect(res.status).toBe(401);
  });

  it("retorna resultados com auth", async () => {
    const res = await request(app)
      .get("/api/search?q=caneta")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);

    expect(res.body).toHaveProperty("clientes");
    expect(res.body).toHaveProperty("produtos");
    expect(res.body).toHaveProperty("lancamentos");
    expect(res.body).toHaveProperty("nfs");
    expect(res.body).toHaveProperty("total");
    expect(Array.isArray(res.body.clientes)).toBe(true);
    expect(Array.isArray(res.body.produtos)).toBe(true);
    expect(Array.isArray(res.body.lancamentos)).toBe(true);
    expect(Array.isArray(res.body.nfs)).toBe(true);
    expect(typeof res.body.total).toBe("number");
  });

  it("retorna 400 com query vazia", async () => {
    const res = await request(app)
      .get("/api/search?q=")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(400);
  });

  it("retorna 400 com query de 1 caractere (mínimo 2)", async () => {
    const res = await request(app)
      .get("/api/search?q=a")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(400);
  });

  it("retorna 400 sem parâmetro q", async () => {
    const res = await request(app)
      .get("/api/search")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(400);
  });

  it("aceita parâmetro limit", async () => {
    const res = await request(app)
      .get("/api/search?q=teste&limit=2")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    // Cada categoria deve ter no máximo 2 resultados
    expect(res.body.clientes.length).toBeLessThanOrEqual(2);
    expect(res.body.produtos.length).toBeLessThanOrEqual(2);
  });

  it("resultados de clientes têm _type e _url", async () => {
    const res = await request(app)
      .get("/api/search?q=teste")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);

    if (res.body.clientes.length > 0) {
      const c = res.body.clientes[0];
      expect(c).toHaveProperty("_type");
      expect(c._type).toBe("cliente");
      expect(c).toHaveProperty("_url");
      expect(c._url).toContain("/clientes/");
    }

    if (res.body.produtos.length > 0) {
      const p = res.body.produtos[0];
      expect(p).toHaveProperty("_type");
      expect(p._type).toBe("produto");
      expect(p).toHaveProperty("_url");
      expect(p._url).toContain("/produtos/");
    }
  });
});

// ── Segurança — XSS e injection ──────────────────────────────────

describe("Segurança — search API", () => {
  it("XSS no query não retorna HTML perigoso", async () => {
    const xss = '<script>alert("xss")</script>';
    const res = await request(app)
      .get(`/api/search?q=${encodeURIComponent(xss)}`)
      .set("Authorization", `Bearer ${adminToken()}`);
    // O backend usa ILIKE com parameterized queries — não executa o script
    // Status 200 (busca que não encontra nada) ou 400 (se q muito longa)
    expect([200, 400]).toContain(res.status);
    // Se 200, o response body não deve conter script executável na estrutura
    if (res.status === 200) {
      const body = JSON.stringify(res.body);
      expect(body).not.toContain("<script>");
    }
  });

  it("SQL injection no query não causa erro 500", async () => {
    const sqli = "'; DROP TABLE crm.customers;--";
    const res = await request(app)
      .get(`/api/search?q=${encodeURIComponent(sqli)}`)
      .set("Authorization", `Bearer ${adminToken()}`);
    // Parameterized queries protegem contra SQL injection
    // Deve retornar 200 (sem resultados) — nunca 500
    expect(res.status).not.toBe(500);
    expect([200, 400]).toContain(res.status);
  });

  it("rejeita JWT expirado", async () => {
    const expired = jwt.sign(
      { userId: "test", email: "test@test.com", papel: "admin" },
      JWT_SECRET,
      { expiresIn: "-1h" }
    );
    const res = await request(app)
      .get("/api/search?q=caneta")
      .set("Authorization", `Bearer ${expired}`);
    expect(res.status).toBe(401);
  });

  it("rejeita JWT com secret errado", async () => {
    const bad = jwt.sign(
      { userId: "test", email: "test@test.com", papel: "admin" },
      "wrong-secret",
      { expiresIn: "1h" }
    );
    const res = await request(app)
      .get("/api/search?q=caneta")
      .set("Authorization", `Bearer ${bad}`);
    expect(res.status).toBe(401);
  });

  it("rejeita token malformado", async () => {
    const res = await request(app)
      .get("/api/search?q=caneta")
      .set("Authorization", "Bearer not.a.valid.jwt");
    expect(res.status).toBe(401);
  });
});
