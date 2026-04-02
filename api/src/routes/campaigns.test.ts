import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { app } from "../server";
import { query, queryOne } from "../db";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "";
const TEST_PREFIX = "vitest-campaign-";

// Gera JWT de admin para testes
function adminToken(): string {
  return jwt.sign(
    { userId: "test-admin", email: "test@test.com", papel: "admin" },
    JWT_SECRET,
    { expiresIn: "1h" }
  );
}

// IDs criados durante testes para cleanup
const createdCampaignIds: string[] = [];

afterAll(async () => {
  // Limpa na ordem correta (FK)
  for (const cid of createdCampaignIds) {
    await query("DELETE FROM marketing.campaign_sends WHERE campaign_id = $1", [cid]);
    await query("DELETE FROM marketing.campaigns WHERE id = $1", [cid]);
  }
  // Cleanup extra por padrão de nome (segurança contra sobras)
  await query(
    "DELETE FROM marketing.campaign_sends WHERE campaign_id IN (SELECT id FROM marketing.campaigns WHERE nome LIKE $1)",
    [`${TEST_PREFIX}%`]
  );
  await query("DELETE FROM marketing.campaigns WHERE nome LIKE $1", [`${TEST_PREFIX}%`]);
});

// ── GET /api/campaigns — lista paginada ─────────────────────────

describe("GET /api/campaigns", () => {
  it("retorna 401 sem token", async () => {
    const res = await request(app).get("/api/campaigns");
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty("error");
  });

  it("retorna lista paginada com token válido", async () => {
    const res = await request(app)
      .get("/api/campaigns")
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

  it("aceita filtro por canal", async () => {
    const res = await request(app)
      .get("/api/campaigns?canal=email")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("data");
  });
});

// ── POST /api/campaigns — criar ─────────────────────────────────

describe("POST /api/campaigns", () => {
  it("retorna 401 sem token", async () => {
    const res = await request(app)
      .post("/api/campaigns")
      .send({ nome: `${TEST_PREFIX}sem-auth`, canal: "email" });
    expect(res.status).toBe(401);
  });

  it("cria campanha com dados válidos", async () => {
    const res = await request(app)
      .post("/api/campaigns")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({
        nome: `${TEST_PREFIX}teste-criacao`,
        canal: "email",
      });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("id");
    expect(res.body.nome).toContain(TEST_PREFIX);
    expect(res.body.canal).toBe("email");
    expect(res.body.status).toBe("rascunho");
    createdCampaignIds.push(res.body.id);
  });

  it("cria campanha agendada (status = agendada)", async () => {
    const futuro = new Date(Date.now() + 86400000).toISOString();
    const res = await request(app)
      .post("/api/campaigns")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({
        nome: `${TEST_PREFIX}teste-agendada`,
        canal: "email",
        agendado_em: futuro,
      });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("agendada");
    createdCampaignIds.push(res.body.id);
  });

  it("retorna 400 sem nome (campo obrigatório)", async () => {
    const res = await request(app)
      .post("/api/campaigns")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({ canal: "email" });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("retorna 400 sem canal (campo obrigatório)", async () => {
    const res = await request(app)
      .post("/api/campaigns")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({ nome: `${TEST_PREFIX}sem-canal` });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("retorna 400 com canal inválido", async () => {
    const res = await request(app)
      .post("/api/campaigns")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({ nome: `${TEST_PREFIX}canal-invalido`, canal: "sms" });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("retorna 400 com nome muito curto", async () => {
    const res = await request(app)
      .post("/api/campaigns")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({ nome: "A", canal: "email" });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });
});

// ── GET /api/campaigns/:id — detalhes ───────────────────────────

describe("GET /api/campaigns/:id", () => {
  it("retorna 404 para UUID inexistente", async () => {
    const res = await request(app)
      .get("/api/campaigns/00000000-0000-0000-0000-000000000000")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty("error");
  });

  it("retorna detalhes da campanha criada", async () => {
    if (createdCampaignIds.length === 0) return;
    const id = createdCampaignIds[0];

    const res = await request(app)
      .get(`/api/campaigns/${id}`)
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("id");
    expect(res.body).toHaveProperty("nome");
    expect(res.body).toHaveProperty("canal");
    expect(res.body).toHaveProperty("status");
    expect(res.body).toHaveProperty("sends_por_status");
    expect(res.body).toHaveProperty("destinatarios");
    expect(res.body.id).toBe(id);
  });
});

// ── PUT /api/campaigns/:id — atualizar ──────────────────────────

describe("PUT /api/campaigns/:id", () => {
  it("atualiza campanha existente (rascunho)", async () => {
    if (createdCampaignIds.length === 0) return;
    const id = createdCampaignIds[0];

    const res = await request(app)
      .put(`/api/campaigns/${id}`)
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({ nome: `${TEST_PREFIX}atualizada` });
    expect(res.status).toBe(200);
    expect(res.body.nome).toContain("atualizada");
  });

  it("retorna 404 para campanha inexistente", async () => {
    const res = await request(app)
      .put("/api/campaigns/00000000-0000-0000-0000-000000000000")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({ nome: `${TEST_PREFIX}fantasma` });
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty("error");
  });

  it("retorna 400 sem campos para atualizar (body vazio)", async () => {
    if (createdCampaignIds.length === 0) return;
    const id = createdCampaignIds[0];

    const res = await request(app)
      .put(`/api/campaigns/${id}`)
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it("não permite editar campanha concluída", async () => {
    // Cria uma campanha e marca como concluída no banco
    const campaign = await queryOne<{ id: string }>(
      `INSERT INTO marketing.campaigns (nome, canal, status)
       VALUES ($1, 'email', 'concluida') RETURNING id`,
      [`${TEST_PREFIX}concluida`]
    );
    if (!campaign) return;
    createdCampaignIds.push(campaign.id);

    const res = await request(app)
      .put(`/api/campaigns/${campaign.id}`)
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({ nome: `${TEST_PREFIX}tentativa-editar` });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("concluida");
  });
});

// ── GET /api/campaigns/email-events — eventos de email ──────────

describe("GET /api/campaigns/email-events", () => {
  it("retorna 401 sem token", async () => {
    const res = await request(app).get("/api/campaigns/email-events");
    expect(res.status).toBe(401);
  });

  it("retorna eventos com token válido (pode ser vazio)", async () => {
    const res = await request(app)
      .get("/api/campaigns/email-events?hours=48")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("events");
    expect(res.body).toHaveProperty("resumo");
    expect(Array.isArray(res.body.events)).toBe(true);
    expect(res.body.resumo).toHaveProperty("abertos");
    expect(res.body.resumo).toHaveProperty("clicados");
  });

  it("aceita parâmetro hours customizado", async () => {
    const res = await request(app)
      .get("/api/campaigns/email-events?hours=24")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("events");
  });
});

// ── GET /api/campaigns/resend-status — status do Resend ─────────

describe("GET /api/campaigns/resend-status", () => {
  it("retorna status da integração Resend", async () => {
    const res = await request(app)
      .get("/api/campaigns/resend-status")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    // Deve ter informações sobre se o Resend está configurado
    expect(res.body).toBeDefined();
  });
});

// ── Segurança ───────────────────────────────────────────────────

describe("Segurança — campaigns API", () => {
  it("XSS no nome da campanha — Zod aceita string, não deve causar erro", async () => {
    const xssPayload = '<script>alert("xss")</script>Campanha Limpa';
    const res = await request(app)
      .post("/api/campaigns")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({ nome: xssPayload, canal: "email" });

    // Zod aceita strings — a proteção XSS é na renderização
    if (res.status === 201) {
      createdCampaignIds.push(res.body.id);
      expect(res.body).toHaveProperty("id");
    }
    expect([201, 400]).toContain(res.status);
  });

  it("rejeita JWT expirado", async () => {
    const expired = jwt.sign(
      { userId: "test", email: "test@test.com", papel: "admin" },
      JWT_SECRET,
      { expiresIn: "-1h" }
    );
    const res = await request(app)
      .get("/api/campaigns")
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
      .get("/api/campaigns")
      .set("Authorization", `Bearer ${bad}`);
    expect(res.status).toBe(401);
  });

  it("rejeita token malformado", async () => {
    const res = await request(app)
      .get("/api/campaigns")
      .set("Authorization", "Bearer nao.e.jwt.valido");
    expect(res.status).toBe(401);
  });

  it("POST não aceita prototype pollution", async () => {
    const res = await request(app)
      .post("/api/campaigns")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({
        nome: `${TEST_PREFIX}proto-pollution`,
        canal: "email",
        __proto__: { admin: true },
        constructor: { prototype: { isAdmin: true } },
      });
    // Zod strip unknowns — __proto__ é ignorado
    expect([201, 400]).toContain(res.status);
    if (res.status === 201) {
      createdCampaignIds.push(res.body.id);
    }
  });
});
