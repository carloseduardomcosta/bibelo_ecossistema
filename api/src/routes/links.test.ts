import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../server";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "";

function adminToken(): string {
  return jwt.sign(
    { userId: "test-admin", email: "test@test.com", papel: "admin" },
    JWT_SECRET,
    { expiresIn: "1h" },
  );
}

// ═══════════════════════════════════════════════════════════════
// GET /api/links/page — Página pública de links (HTML)
// ═══════════════════════════════════════════════════════════════

describe("GET /api/links/page", () => {
  it("retorna página HTML com status 200 (público, sem auth)", async () => {
    const res = await request(app).get("/api/links/page");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/html");
  });

  it("página contém links essenciais da Bibelô", async () => {
    const res = await request(app).get("/api/links/page");
    expect(res.text).toContain("Papelaria Bibelô");
    expect(res.text).toContain("Loja On-line");
  });

  it("possui CSP header adequado", async () => {
    const res = await request(app).get("/api/links/page");
    expect(res.headers["content-security-policy"]).toBeDefined();
    expect(res.headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  });

  it("possui Cache-Control header", async () => {
    const res = await request(app).get("/api/links/page");
    expect(res.headers["cache-control"]).toContain("public");
  });
});

// ═══════════════════════════════════════════════════════════════
// GET /api/links/go/:slug — Redirect com tracking
// ═══════════════════════════════════════════════════════════════

describe("GET /api/links/go/:slug", () => {
  it("redireciona slug 'loja' para papelariabibelo.com.br", async () => {
    const res = await request(app).get("/api/links/go/loja").redirects(0);
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("papelariabibelo.com.br");
  });

  it("redireciona slug 'whatsapp' para WhatsApp", async () => {
    const res = await request(app).get("/api/links/go/whatsapp").redirects(0);
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("whatsapp");
  });

  it("redireciona slug desconhecido para a loja principal", async () => {
    const res = await request(app).get("/api/links/go/slug-inexistente-vitest").redirects(0);
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("papelariabibelo.com.br");
  });

  it("adiciona UTM params para slug 'loja'", async () => {
    const res = await request(app).get("/api/links/go/loja").redirects(0);
    expect(res.headers.location).toContain("utm_source=");
    expect(res.headers.location).toContain("utm_medium=");
  });

  it("não adiciona UTM em links mailto (slug 'email')", async () => {
    const res = await request(app).get("/api/links/go/email").redirects(0);
    expect(res.status).toBe(302);
    // Mailto links não devem ter UTM
    expect(res.headers.location).not.toContain("utm_source=");
  });
});

// ═══════════════════════════════════════════════════════════════
// GET /api/links/stats — Protegido (requer auth)
// ═══════════════════════════════════════════════════════════════

describe("GET /api/links/stats", () => {
  it("retorna 401 sem token", async () => {
    const res = await request(app).get("/api/links/stats");
    expect(res.status).toBe(401);
  });

  it("retorna estatísticas com token válido", async () => {
    const res = await request(app)
      .get("/api/links/stats")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("stats");
    expect(res.body).toHaveProperty("porDia");
    expect(res.body).toHaveProperty("links");
    expect(Array.isArray(res.body.stats)).toBe(true);
    expect(Array.isArray(res.body.links)).toBe(true);
  });

  it("links retornados contêm slug e titulo", async () => {
    const res = await request(app)
      .get("/api/links/stats")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    for (const link of res.body.links) {
      expect(link).toHaveProperty("slug");
      expect(link).toHaveProperty("titulo");
    }
  });
});
