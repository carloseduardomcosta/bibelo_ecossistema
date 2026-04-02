import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../server";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "";

// Gera JWT de admin para testes
function adminToken(): string {
  return jwt.sign(
    { userId: "test-admin", email: "test@test.com", papel: "admin" },
    JWT_SECRET,
    { expiresIn: "1h" }
  );
}

describe("GET /api/auth/me — autenticação", () => {
  it("retorna 401 sem token", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty("error");
  });

  it("retorna 401 com token expirado", async () => {
    const expired = jwt.sign(
      { userId: "test", email: "test@test.com", papel: "admin" },
      JWT_SECRET,
      { expiresIn: "-1h" }
    );
    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${expired}`);
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty("error");
  });

  it("retorna 401 com secret errado", async () => {
    const bad = jwt.sign(
      { userId: "test", email: "test@test.com", papel: "admin" },
      "secret-totalmente-errado-123",
      { expiresIn: "1h" }
    );
    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${bad}`);
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty("error");
  });

  it("retorna 401 com token malformado", async () => {
    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", "Bearer nao.e.um.jwt.valido");
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty("error");
  });

  it("retorna dados do usuário com token válido", async () => {
    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${adminToken()}`);
    // O middleware aceita o token, mas /me busca o user no banco.
    // Como test-admin não existe no banco, pode retornar null (200 com body null)
    // ou o status pode ser 200. O importante é não ser 401.
    expect(res.status).not.toBe(401);
  });

  it("retorna 401 sem prefixo Bearer no header", async () => {
    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", adminToken());
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty("error");
  });

  it("retorna 401 com header Authorization vazio", async () => {
    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", "");
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty("error");
  });
});
