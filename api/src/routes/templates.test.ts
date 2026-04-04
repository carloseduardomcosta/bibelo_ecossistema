import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { app } from "../server";
import { query, queryOne } from "../db";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "";
const TEST_PREFIX = "vitest-template-";

// Gera JWT de admin para testes
function adminToken(): string {
  return jwt.sign(
    { userId: "test-admin", email: "test@test.com", papel: "admin" },
    JWT_SECRET,
    { expiresIn: "1h" }
  );
}

// IDs criados durante testes para cleanup
const createdTemplateIds: string[] = [];

afterAll(async () => {
  for (const tid of createdTemplateIds) {
    await query("DELETE FROM marketing.templates WHERE id = $1", [tid]);
  }
  // Cleanup extra por padrão de nome (segurança contra sobras)
  await query("DELETE FROM marketing.templates WHERE nome LIKE $1", [`${TEST_PREFIX}%`]);
});

// ── GET /api/templates — lista ────────────────────────────────

describe("GET /api/templates", () => {
  it("retorna 401 sem token", async () => {
    const res = await request(app).get("/api/templates");
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty("error");
  });

  it("retorna lista com token válido", async () => {
    const res = await request(app)
      .get("/api/templates")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("data");
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it("aceita filtro por canal", async () => {
    const res = await request(app)
      .get("/api/templates?canal=email")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("data");
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

// ── GET /api/templates/:id — detalhe ──────────────────────────

describe("GET /api/templates/:id", () => {
  it("retorna 404 para UUID inexistente", async () => {
    const res = await request(app)
      .get("/api/templates/00000000-0000-0000-0000-000000000000")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty("error");
  });
});

// ── POST /api/templates — criar ───────────────────────────────

describe("POST /api/templates", () => {
  it("retorna 401 sem token", async () => {
    const res = await request(app)
      .post("/api/templates")
      .send({ nome: `${TEST_PREFIX}sem-auth`, canal: "email" });
    expect(res.status).toBe(401);
  });

  it("cria template com dados válidos", async () => {
    const res = await request(app)
      .post("/api/templates")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({
        nome: `${TEST_PREFIX}teste-criacao`,
        canal: "email",
        assunto: "Teste Vitest",
        html: "<p>Conteúdo de teste</p>",
      });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("id");
    expect(res.body.nome).toContain(TEST_PREFIX);
    expect(res.body.canal).toBe("email");
    createdTemplateIds.push(res.body.id);
  });

  it("retorna 400 sem nome (campo obrigatório)", async () => {
    const res = await request(app)
      .post("/api/templates")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({ canal: "email" });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("retorna 400 sem canal (campo obrigatório)", async () => {
    const res = await request(app)
      .post("/api/templates")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({ nome: `${TEST_PREFIX}sem-canal` });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("retorna 400 com canal inválido", async () => {
    const res = await request(app)
      .post("/api/templates")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({ nome: `${TEST_PREFIX}canal-invalido`, canal: "sms" });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("retorna 400 com nome muito curto", async () => {
    const res = await request(app)
      .post("/api/templates")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({ nome: "A", canal: "email" });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });
});

// ── PUT /api/templates/:id — atualizar ────────────────────────

describe("PUT /api/templates/:id", () => {
  it("atualiza template existente", async () => {
    if (createdTemplateIds.length === 0) return;
    const id = createdTemplateIds[0];

    const res = await request(app)
      .put(`/api/templates/${id}`)
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({ nome: `${TEST_PREFIX}atualizado` });
    expect(res.status).toBe(200);
    expect(res.body.nome).toContain("atualizado");
  });

  it("retorna 404 para template inexistente", async () => {
    const res = await request(app)
      .put("/api/templates/00000000-0000-0000-0000-000000000000")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({ nome: `${TEST_PREFIX}fantasma` });
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty("error");
  });

  it("retorna 400 sem campos para atualizar (body vazio)", async () => {
    if (createdTemplateIds.length === 0) return;
    const id = createdTemplateIds[0];

    const res = await request(app)
      .put(`/api/templates/${id}`)
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({});
    expect(res.status).toBe(400);
  });
});

// ── DELETE /api/templates/:id — soft delete ───────────────────

describe("DELETE /api/templates/:id", () => {
  it("retorna 401 sem token", async () => {
    const res = await request(app).delete("/api/templates/00000000-0000-0000-0000-000000000000");
    expect(res.status).toBe(401);
  });

  it("retorna 404 para template inexistente", async () => {
    const res = await request(app)
      .delete("/api/templates/00000000-0000-0000-0000-000000000000")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty("error");
  });

  it("faz soft delete do template criado", async () => {
    if (createdTemplateIds.length === 0) return;
    const id = createdTemplateIds[0];

    const res = await request(app)
      .delete(`/api/templates/${id}`)
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("message");

    // Verifica que o template foi desativado (soft delete)
    const template = await queryOne<{ ativo: boolean }>(
      "SELECT ativo FROM marketing.templates WHERE id = $1",
      [id]
    );
    expect(template).toBeDefined();
    expect(template!.ativo).toBe(false);
  });
});

// ── Segurança ─────────────────────────────────────────────────

describe("Segurança — templates API", () => {
  it("rejeita JWT expirado", async () => {
    const expired = jwt.sign(
      { userId: "test", email: "test@test.com", papel: "admin" },
      JWT_SECRET,
      { expiresIn: "-1h" }
    );
    const res = await request(app)
      .get("/api/templates")
      .set("Authorization", `Bearer ${expired}`);
    expect(res.status).toBe(401);
  });

  it("rejeita JWT com secret errado", async () => {
    const bad = jwt.sign(
      { userId: "test", email: "test@test.com", papel: "admin" },
      "wrong-secret-xpto",
      { expiresIn: "1h" }
    );
    const res = await request(app)
      .get("/api/templates")
      .set("Authorization", `Bearer ${bad}`);
    expect(res.status).toBe(401);
  });

  it("rejeita token malformado", async () => {
    const res = await request(app)
      .get("/api/templates")
      .set("Authorization", "Bearer nao.e.jwt.valido");
    expect(res.status).toBe(401);
  });

  it("XSS no nome do template — Zod aceita string, não deve causar erro", async () => {
    const xssPayload = '<script>alert("xss")</script>Template XSS';
    const res = await request(app)
      .post("/api/templates")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({ nome: xssPayload, canal: "email" });

    if (res.status === 201) {
      createdTemplateIds.push(res.body.id);
      expect(res.body).toHaveProperty("id");
    }
    expect([201, 400]).toContain(res.status);
  });
});
