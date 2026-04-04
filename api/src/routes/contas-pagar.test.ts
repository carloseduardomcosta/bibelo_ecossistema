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

// ── POST /api/contas-pagar — criar ────────────────────────────

describe("POST /api/contas-pagar", () => {
  it("retorna 401 sem token", async () => {
    const res = await request(app)
      .post("/api/contas-pagar")
      .send({ contato_id: "123", valor: 100, vencimento: "2026-12-31" });
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty("error");
  });

  it("retorna 400 sem campos obrigatórios", async () => {
    const res = await request(app)
      .post("/api/contas-pagar")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("retorna 400 com valor negativo", async () => {
    const res = await request(app)
      .post("/api/contas-pagar")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({ contato_id: "123", valor: -50, vencimento: "2026-12-31" });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("retorna 400 sem contato_id", async () => {
    const res = await request(app)
      .post("/api/contas-pagar")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({ valor: 100, vencimento: "2026-12-31" });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("retorna 400 sem vencimento", async () => {
    const res = await request(app)
      .post("/api/contas-pagar")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({ contato_id: "123", valor: 100 });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });
});

// ── PUT /api/contas-pagar/:id — editar ────────────────────────

describe("PUT /api/contas-pagar/:id", () => {
  it("retorna 401 sem token", async () => {
    const res = await request(app)
      .put("/api/contas-pagar/99999999")
      .send({ valor: 200 });
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty("error");
  });

  it("retorna 404 para conta inexistente", async () => {
    const res = await request(app)
      .put("/api/contas-pagar/99999999")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({ valor: 200 });
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty("error");
  });
});

// ── DELETE /api/contas-pagar/:id — deletar ────────────────────

describe("DELETE /api/contas-pagar/:id", () => {
  it("retorna 401 sem token", async () => {
    const res = await request(app).delete("/api/contas-pagar/99999999");
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty("error");
  });
});

// ── POST /api/contas-pagar/:id/pagar — registrar pagamento ───

describe("POST /api/contas-pagar/:id/pagar", () => {
  it("retorna 401 sem token", async () => {
    const res = await request(app)
      .post("/api/contas-pagar/99999999/pagar")
      .send({});
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty("error");
  });

  it("retorna 404 para conta inexistente", async () => {
    const res = await request(app)
      .post("/api/contas-pagar/99999999/pagar")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({ data_pagamento: "2026-04-03" });
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty("error");
  });
});

// ── Segurança ─────────────────────────────────────────────────

describe("Segurança — contas-pagar API", () => {
  it("rejeita JWT expirado", async () => {
    const expired = jwt.sign(
      { userId: "test", email: "test@test.com", papel: "admin" },
      JWT_SECRET,
      { expiresIn: "-1h" }
    );
    const res = await request(app)
      .post("/api/contas-pagar")
      .set("Authorization", `Bearer ${expired}`)
      .send({ contato_id: "123", valor: 100, vencimento: "2026-12-31" });
    expect(res.status).toBe(401);
  });

  it("rejeita JWT com secret errado", async () => {
    const bad = jwt.sign(
      { userId: "test", email: "test@test.com", papel: "admin" },
      "wrong-secret-xpto",
      { expiresIn: "1h" }
    );
    const res = await request(app)
      .post("/api/contas-pagar")
      .set("Authorization", `Bearer ${bad}`)
      .send({ contato_id: "123", valor: 100, vencimento: "2026-12-31" });
    expect(res.status).toBe(401);
  });

  it("rejeita token malformado", async () => {
    const res = await request(app)
      .post("/api/contas-pagar")
      .set("Authorization", "Bearer nao.e.jwt.valido")
      .send({ contato_id: "123", valor: 100, vencimento: "2026-12-31" });
    expect(res.status).toBe(401);
  });
});
