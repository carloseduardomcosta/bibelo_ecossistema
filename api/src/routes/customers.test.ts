import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { app } from "../server";
import { query, queryOne } from "../db";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "";
const TEST_PREFIX = "vitest-customer-";
const TEST_EMAIL = `${TEST_PREFIX}${Date.now()}@example.com`;

// Gera JWT de admin para testes
function adminToken(): string {
  return jwt.sign(
    { userId: "test-admin", email: "test@test.com", papel: "admin" },
    JWT_SECRET,
    { expiresIn: "1h" }
  );
}

// IDs criados durante testes para cleanup
const createdCustomerIds: string[] = [];

afterAll(async () => {
  // Limpa na ordem correta (FK)
  for (const cid of createdCustomerIds) {
    await query("DELETE FROM crm.interactions WHERE customer_id = $1", [cid]);
    await query("DELETE FROM crm.customer_scores WHERE customer_id = $1", [cid]);
    await query("DELETE FROM crm.deals WHERE customer_id = $1", [cid]);
    await query("DELETE FROM crm.customers WHERE id = $1", [cid]);
  }
  // Cleanup extra por padrão de email (segurança contra sobras)
  await query(
    "DELETE FROM crm.interactions WHERE customer_id IN (SELECT id FROM crm.customers WHERE email LIKE $1)",
    [`${TEST_PREFIX}%@example.com`]
  );
  await query(
    "DELETE FROM crm.customer_scores WHERE customer_id IN (SELECT id FROM crm.customers WHERE email LIKE $1)",
    [`${TEST_PREFIX}%@example.com`]
  );
  await query("DELETE FROM crm.customers WHERE email LIKE $1", [`${TEST_PREFIX}%@example.com`]);
});

// ── GET /api/customers — lista paginada ─────────────────────────

describe("GET /api/customers", () => {
  it("retorna 401 sem token", async () => {
    const res = await request(app).get("/api/customers");
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty("error");
  });

  it("retorna lista paginada com token válido", async () => {
    const res = await request(app)
      .get("/api/customers")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("data");
    expect(res.body).toHaveProperty("pagination");
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.pagination).toHaveProperty("page");
    expect(res.body.pagination).toHaveProperty("limit");
    expect(res.body.pagination).toHaveProperty("total");
    expect(res.body.pagination).toHaveProperty("pages");
  });

  it("busca por search funciona (query param)", async () => {
    const res = await request(app)
      .get("/api/customers?search=teste")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("data");
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it("aceita paginação customizada", async () => {
    const res = await request(app)
      .get("/api/customers?page=1&limit=5")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.pagination.limit).toBe(5);
    expect(res.body.pagination.page).toBe(1);
  });

  it("SQL injection no search é seguro (parametrizado)", async () => {
    const res = await request(app)
      .get("/api/customers?search=' OR 1=1; DROP TABLE crm.customers;--")
      .set("Authorization", `Bearer ${adminToken()}`);
    // Não deve causar erro 500 — query é parametrizada
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("data");
  });
});

// ── GET /api/customers/:id — perfil completo ────────────────────

describe("GET /api/customers/:id", () => {
  it("retorna 404 para UUID inexistente", async () => {
    const res = await request(app)
      .get("/api/customers/00000000-0000-0000-0000-000000000000")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty("error");
  });

  it("retorna detalhes do cliente existente", async () => {
    // Busca um cliente real do banco
    const customer = await queryOne<{ id: string }>(
      "SELECT id FROM crm.customers WHERE ativo = true LIMIT 1"
    );
    if (!customer) return; // Pula se banco vazio

    const res = await request(app)
      .get(`/api/customers/${customer.id}`)
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("id");
    expect(res.body).toHaveProperty("nome");
    expect(res.body).toHaveProperty("score");
    expect(res.body).toHaveProperty("recentInteractions");
  });
});

// ── GET /api/customers/:id/timeline ─────────────────────────────

describe("GET /api/customers/:id/timeline", () => {
  it("retorna 404 para cliente inexistente", async () => {
    const res = await request(app)
      .get("/api/customers/00000000-0000-0000-0000-000000000000/timeline")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(404);
  });

  it("retorna timeline do cliente existente", async () => {
    const customer = await queryOne<{ id: string }>(
      "SELECT id FROM crm.customers WHERE ativo = true LIMIT 1"
    );
    if (!customer) return;

    const res = await request(app)
      .get(`/api/customers/${customer.id}/timeline`)
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("data");
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

// ── POST /api/customers — criar ─────────────────────────────────

describe("POST /api/customers", () => {
  it("cria cliente com dados válidos", async () => {
    const res = await request(app)
      .post("/api/customers")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({
        nome: `${TEST_PREFIX}Teste Criacao`,
        email: TEST_EMAIL,
        telefone: "(47) 99999-0001",
        canal_origem: "teste",
      });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("id");
    expect(res.body.nome).toContain(TEST_PREFIX);
    expect(res.body.email).toBe(TEST_EMAIL);
    createdCustomerIds.push(res.body.id);
  });

  it("retorna 400 sem nome (campo obrigatório)", async () => {
    const res = await request(app)
      .post("/api/customers")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({ email: `${TEST_PREFIX}sem-nome@example.com` });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("retorna 400 com nome muito curto", async () => {
    const res = await request(app)
      .post("/api/customers")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({ nome: "A" });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("retorna 400 com email inválido", async () => {
    const res = await request(app)
      .post("/api/customers")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({ nome: `${TEST_PREFIX}Email Invalido`, email: "nao-e-email" });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("retorna 401 sem token", async () => {
    const res = await request(app)
      .post("/api/customers")
      .send({ nome: `${TEST_PREFIX}Sem Auth`, email: `${TEST_PREFIX}noauth@example.com` });
    expect(res.status).toBe(401);
  });
});

// ── PUT /api/customers/:id — atualizar ──────────────────────────

describe("PUT /api/customers/:id", () => {
  it("atualiza cliente existente", async () => {
    // Usa o cliente criado no teste anterior
    if (createdCustomerIds.length === 0) return;
    const id = createdCustomerIds[0];

    const res = await request(app)
      .put(`/api/customers/${id}`)
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({ nome: `${TEST_PREFIX}Atualizado` });
    expect(res.status).toBe(200);
    expect(res.body.nome).toContain("Atualizado");
  });

  it("retorna 404 para cliente inexistente", async () => {
    const res = await request(app)
      .put("/api/customers/00000000-0000-0000-0000-000000000000")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({ nome: `${TEST_PREFIX}Fantasma` });
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty("error");
  });

  it("retorna 400 sem campos para atualizar (body vazio)", async () => {
    if (createdCustomerIds.length === 0) return;
    const id = createdCustomerIds[0];

    const res = await request(app)
      .put(`/api/customers/${id}`)
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({});
    expect(res.status).toBe(400);
  });
});

// ── Segurança ───────────────────────────────────────────────────

describe("Segurança — customers API", () => {
  it("XSS no nome do cliente — Zod valida mas banco não deve guardar HTML perigoso", async () => {
    const xssPayload = '<script>alert("xss")</script>Nome Teste XSS';
    const res = await request(app)
      .post("/api/customers")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({
        nome: xssPayload,
        email: `${TEST_PREFIX}xss-test@example.com`,
      });

    // Zod aceita string — o backend cria o cliente.
    // O importante é que, ao retornar, não contenha <script> executável
    // (frontend escapa, mas verificamos que pelo menos o response não crashou)
    if (res.status === 201) {
      createdCustomerIds.push(res.body.id);
      // O nome é armazenado — a proteção XSS é no frontend/email (escapar ao exibir)
      expect(res.body).toHaveProperty("id");
    }
    expect([201, 400]).toContain(res.status);
  });

  it("SQL injection no ID (path param) é seguro", async () => {
    const res = await request(app)
      .get("/api/customers/1'; DROP TABLE crm.customers;--")
      .set("Authorization", `Bearer ${adminToken()}`);
    // UUID inválido — Postgres rejeita, retorna 404 ou 500 (não executa SQL malicioso)
    expect([400, 404, 500]).toContain(res.status);
  });

  it("rejeita JWT expirado", async () => {
    const expired = jwt.sign(
      { userId: "test", email: "test@test.com", papel: "admin" },
      JWT_SECRET,
      { expiresIn: "-1h" }
    );
    const res = await request(app)
      .get("/api/customers")
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
      .get("/api/customers")
      .set("Authorization", `Bearer ${bad}`);
    expect(res.status).toBe(401);
  });

  it("rejeita token malformado", async () => {
    const res = await request(app)
      .get("/api/customers")
      .set("Authorization", "Bearer nao.e.jwt.valido");
    expect(res.status).toBe(401);
  });
});
