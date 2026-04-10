import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { app } from "../server";
import { query, queryOne } from "../db";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "";
const TEST_PREFIX = "vitest-deal-";

// Gera JWT de admin para testes
function adminToken(): string {
  return jwt.sign(
    { userId: "test-admin", email: "test@test.com", papel: "admin" },
    JWT_SECRET,
    { expiresIn: "1h" }
  );
}

// IDs criados durante testes para cleanup
const createdDealIds: string[] = [];
const createdCustomerIds: string[] = [];

afterAll(async () => {
  for (const did of createdDealIds) {
    await query("DELETE FROM crm.deals WHERE id = $1", [did]);
  }
  for (const cid of createdCustomerIds) {
    await query("DELETE FROM crm.interactions WHERE customer_id = $1", [cid]);
    await query("DELETE FROM crm.customer_scores WHERE customer_id = $1", [cid]);
    await query("DELETE FROM crm.deals WHERE customer_id = $1", [cid]);
    await query("DELETE FROM crm.customers WHERE id = $1", [cid]);
  }
});

// ── GET /api/deals — lista ────────────────────────────────────

describe("GET /api/deals", () => {
  it("retorna 401 sem token", async () => {
    const res = await request(app).get("/api/deals");
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty("error");
  });

  it("retorna lista com token válido", async () => {
    const res = await request(app)
      .get("/api/deals")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("data");
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it("aceita filtro por etapa", async () => {
    const res = await request(app)
      .get("/api/deals?etapa=prospeccao")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("data");
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it("aceita filtro por search", async () => {
    const res = await request(app)
      .get("/api/deals?search=teste")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("data");
  });
});

// ── GET /api/deals/kanban ─────────────────────────────────────

describe("GET /api/deals/kanban", () => {
  it("retorna 401 sem token", async () => {
    const res = await request(app).get("/api/deals/kanban");
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty("error");
  });

  it("retorna kanban com etapas e KPIs", async () => {
    const res = await request(app)
      .get("/api/deals/kanban")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("kanban");
    expect(res.body).toHaveProperty("kpis");
    expect(res.body).toHaveProperty("etapas");
    expect(Array.isArray(res.body.etapas)).toBe(true);
    expect(res.body.kpis).toHaveProperty("total_deals");
    expect(res.body.kpis).toHaveProperty("valor_total");
    expect(res.body.kpis).toHaveProperty("valor_ponderado");
    // Kanban deve ter todas as etapas como chaves
    expect(res.body.kanban).toHaveProperty("prospeccao");
    expect(res.body.kanban).toHaveProperty("contato");
    expect(res.body.kanban).toHaveProperty("proposta");
    expect(res.body.kanban).toHaveProperty("negociacao");
    expect(res.body.kanban).toHaveProperty("fechado_ganho");
    expect(res.body.kanban).toHaveProperty("fechado_perdido");
  });
});

// ── GET /api/deals/:id ────────────────────────────────────────

describe("GET /api/deals/:id", () => {
  it("retorna 404 para UUID inexistente", async () => {
    const res = await request(app)
      .get("/api/deals/00000000-0000-0000-0000-000000000000")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty("error");
  });
});

// ── POST /api/deals — criar ───────────────────────────────────

describe("POST /api/deals", () => {
  it("retorna 401 sem token", async () => {
    const res = await request(app)
      .post("/api/deals")
      .send({ titulo: `${TEST_PREFIX}sem-auth`, customer_id: "00000000-0000-0000-0000-000000000000" });
    expect(res.status).toBe(401);
  });

  it("retorna 400 sem campos obrigatórios", async () => {
    const res = await request(app)
      .post("/api/deals")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("cria deal com dados válidos", async () => {
    // Cria customer de teste para vincular o deal
    const customer = await queryOne<{ id: string }>(
      `INSERT INTO crm.customers (nome, email, canal_origem)
       VALUES ($1, $2, 'teste') RETURNING id`,
      [`${TEST_PREFIX}Cliente`, `${TEST_PREFIX}${Date.now()}@example.com`]
    );
    if (!customer) return;
    createdCustomerIds.push(customer.id);

    const res = await request(app)
      .post("/api/deals")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({
        customer_id: customer.id,
        titulo: `${TEST_PREFIX}Negociação Teste`,
        valor: 150.50,
        etapa: "prospeccao",
      });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("id");
    expect(res.body.titulo).toContain(TEST_PREFIX);
    expect(res.body.etapa).toBe("prospeccao");
    createdDealIds.push(res.body.id);
  });

  it("retorna 400 com etapa inválida", async () => {
    const res = await request(app)
      .post("/api/deals")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({
        customer_id: "00000000-0000-0000-0000-000000000000",
        titulo: `${TEST_PREFIX}Etapa Invalida`,
        etapa: "invalida",
      });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });
});

// ── PATCH /api/deals/:id/etapa — mover ────────────────────────

describe("PATCH /api/deals/:id/etapa", () => {
  it("retorna 401 sem token", async () => {
    const res = await request(app)
      .patch("/api/deals/00000000-0000-0000-0000-000000000000/etapa")
      .send({ etapa: "contato" });
    expect(res.status).toBe(401);
  });

  it("retorna 400 com etapa inválida", async () => {
    const res = await request(app)
      .patch("/api/deals/00000000-0000-0000-0000-000000000000/etapa")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({ etapa: "invalida" });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("move deal entre etapas", async () => {
    if (createdDealIds.length === 0) return;
    const id = createdDealIds[0];

    const res = await request(app)
      .patch(`/api/deals/${id}/etapa`)
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({ etapa: "contato" });
    expect(res.status).toBe(200);
    expect(res.body.etapa).toBe("contato");
  });
});

// ── GET /api/deals/boasvindas-recentes ───────────────────────

describe("GET /api/deals/boasvindas-recentes", () => {
  let customerId: string;
  let dealBoasvindasId: string;
  let dealOutraOrigemId: string;
  let dealAntigoId: string;

  // Cria dados de teste: 1 deal B2B recente, 1 de outra origem, 1 B2B antigo (>72h)
  afterAll(async () => {
    for (const id of [dealBoasvindasId, dealOutraOrigemId, dealAntigoId].filter(Boolean)) {
      await query("DELETE FROM crm.deals WHERE id = $1", [id]);
    }
    if (customerId) {
      await query("DELETE FROM crm.customer_scores WHERE customer_id = $1", [customerId]);
      await query("DELETE FROM crm.interactions WHERE customer_id = $1", [customerId]);
      await query("DELETE FROM crm.customers WHERE id = $1", [customerId]);
    }
  });

  it("retorna 401 sem token", async () => {
    const res = await request(app).get("/api/deals/boasvindas-recentes");
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty("error");
  });

  it("retorna { deals: [] } com token válido (estrutura correta)", async () => {
    const res = await request(app)
      .get("/api/deals/boasvindas-recentes")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("deals");
    expect(Array.isArray(res.body.deals)).toBe(true);
  });

  it("inclui deal com origem parcerias_b2b nas últimas 72h", async () => {
    // Cria customer + deal de teste
    const cust = await queryOne<{ id: string }>(
      `INSERT INTO crm.customers (nome, email, canal_origem)
       VALUES ($1, $2, 'parcerias_b2b') RETURNING id`,
      [`${TEST_PREFIX}B2B`, `${TEST_PREFIX}b2b-${Date.now()}@example.com`]
    );
    if (!cust) throw new Error("customer não criado");
    customerId = cust.id;

    const deal = await queryOne<{ id: string }>(
      `INSERT INTO crm.deals (customer_id, titulo, valor, etapa, origem, probabilidade)
       VALUES ($1, $2, 0, 'prospeccao', 'parcerias_b2b', 40) RETURNING id`,
      [customerId, `${TEST_PREFIX}B2B Parceria`]
    );
    if (!deal) throw new Error("deal não criado");
    dealBoasvindasId = deal.id;

    const res = await request(app)
      .get("/api/deals/boasvindas-recentes")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    const ids = res.body.deals.map((d: { id: string }) => d.id);
    expect(ids).toContain(dealBoasvindasId);
  });

  it("inclui deal com origem grupo_vip e formulario", async () => {
    if (!customerId) return;

    const d1 = await queryOne<{ id: string }>(
      `INSERT INTO crm.deals (customer_id, titulo, valor, etapa, origem, probabilidade)
       VALUES ($1, $2, 0, 'prospeccao', 'grupo_vip', 20) RETURNING id`,
      [customerId, `${TEST_PREFIX}VIP`]
    );
    if (d1) createdDealIds.push(d1.id);

    const d2 = await queryOne<{ id: string }>(
      `INSERT INTO crm.deals (customer_id, titulo, valor, etapa, origem, probabilidade)
       VALUES ($1, $2, 0, 'prospeccao', 'formulario', 20) RETURNING id`,
      [customerId, `${TEST_PREFIX}Formulario`]
    );
    if (d2) createdDealIds.push(d2.id);

    const res = await request(app)
      .get("/api/deals/boasvindas-recentes")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    const ids = res.body.deals.map((d: { id: string }) => d.id);
    if (d1) expect(ids).toContain(d1.id);
    if (d2) expect(ids).toContain(d2.id);
  });

  it("NÃO inclui deal com origem diferente (ex: instagram)", async () => {
    if (!customerId) return;

    const deal = await queryOne<{ id: string }>(
      `INSERT INTO crm.deals (customer_id, titulo, valor, etapa, origem, probabilidade)
       VALUES ($1, $2, 0, 'prospeccao', 'instagram', 20) RETURNING id`,
      [customerId, `${TEST_PREFIX}Instagram`]
    );
    if (!deal) return;
    dealOutraOrigemId = deal.id;

    const res = await request(app)
      .get("/api/deals/boasvindas-recentes")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    const ids = res.body.deals.map((d: { id: string }) => d.id);
    expect(ids).not.toContain(dealOutraOrigemId);
  });

  it("NÃO inclui deal com origem boasvindas mais antigo que 72h", async () => {
    if (!customerId) return;

    // Insere diretamente com criado_em > 72h atrás
    const deal = await queryOne<{ id: string }>(
      `INSERT INTO crm.deals (customer_id, titulo, valor, etapa, origem, probabilidade, criado_em)
       VALUES ($1, $2, 0, 'prospeccao', 'parcerias_b2b', 40, NOW() - INTERVAL '73 hours') RETURNING id`,
      [customerId, `${TEST_PREFIX}B2B Antigo`]
    );
    if (!deal) return;
    dealAntigoId = deal.id;

    const res = await request(app)
      .get("/api/deals/boasvindas-recentes")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    const ids = res.body.deals.map((d: { id: string }) => d.id);
    expect(ids).not.toContain(dealAntigoId);
  });

  it("retorna campos obrigatórios no deal", async () => {
    const res = await request(app)
      .get("/api/deals/boasvindas-recentes")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    if (res.body.deals.length > 0) {
      const deal = res.body.deals[0];
      expect(deal).toHaveProperty("id");
      expect(deal).toHaveProperty("titulo");
      expect(deal).toHaveProperty("etapa");
      expect(deal).toHaveProperty("origem");
      expect(deal).toHaveProperty("criado_em");
      expect(deal).toHaveProperty("cliente_nome");
      expect(deal).toHaveProperty("cliente_email");
    }
  });
});

// ── Segurança ─────────────────────────────────────────────────

describe("Segurança — deals API", () => {
  it("rejeita JWT expirado", async () => {
    const expired = jwt.sign(
      { userId: "test", email: "test@test.com", papel: "admin" },
      JWT_SECRET,
      { expiresIn: "-1h" }
    );
    const res = await request(app)
      .get("/api/deals/kanban")
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
      .get("/api/deals/kanban")
      .set("Authorization", `Bearer ${bad}`);
    expect(res.status).toBe(401);
  });

  it("rejeita token malformado", async () => {
    const res = await request(app)
      .get("/api/deals/kanban")
      .set("Authorization", "Bearer nao.e.jwt.valido");
    expect(res.status).toBe(401);
  });

  it("SQL injection no search é seguro (parametrizado)", async () => {
    const res = await request(app)
      .get("/api/deals?search=' OR 1=1; DROP TABLE crm.deals;--")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("data");
  });
});
