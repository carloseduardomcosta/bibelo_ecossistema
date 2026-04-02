import { describe, it, expect, afterAll, beforeAll } from "vitest";
import request from "supertest";
import { app } from "../server";
import { query, queryOne } from "../db";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "";

function adminToken(): string {
  return jwt.sign(
    { userId: "test-admin", email: "test@test.com", papel: "admin" },
    JWT_SECRET,
    { expiresIn: "1h" },
  );
}

// IDs para cleanup
const TEST_PREFIX = "vitest-email-events-";
let testCustomerId: string | null = null;
let testCampaignId: string | null = null;

// Cria dados de teste
beforeAll(async () => {
  // Cria customer de teste para associar ao email_event
  const customer = await queryOne<{ id: string }>(
    `INSERT INTO crm.customers (nome, email, email_optout)
     VALUES ($1, $2, false) RETURNING id`,
    [`${TEST_PREFIX}customer`, `${TEST_PREFIX}test@example.com`],
  );
  testCustomerId = customer?.id || null;

  // Cria campanha de teste (opcional, para preencher campaign_id)
  const campaign = await queryOne<{ id: string }>(
    `INSERT INTO marketing.campaigns (nome, canal, status)
     VALUES ($1, 'email', 'rascunho') RETURNING id`,
    [`${TEST_PREFIX}campanha`],
  );
  testCampaignId = campaign?.id || null;

  // Insere eventos de teste
  if (testCustomerId) {
    await query(
      `INSERT INTO marketing.email_events (customer_id, campaign_id, message_id, tipo, criado_em)
       VALUES ($1, $2, 'vitest-msg-001', 'opened', NOW()),
              ($1, $2, 'vitest-msg-002', 'clicked', NOW()),
              ($1, NULL, 'vitest-msg-003', 'bounced', NOW())`,
      [testCustomerId, testCampaignId],
    );
  }
});

// Cleanup
afterAll(async () => {
  await query("DELETE FROM marketing.email_events WHERE message_id LIKE 'vitest-%'");
  if (testCampaignId) {
    await query("DELETE FROM marketing.campaigns WHERE id = $1", [testCampaignId]);
  }
  if (testCustomerId) {
    await query("DELETE FROM crm.interactions WHERE customer_id = $1", [testCustomerId]);
    await query("DELETE FROM crm.customers WHERE id = $1", [testCustomerId]);
  }
});

// ═══════════════════════════════════════════════════════════════
// TESTES
// ═══════════════════════════════════════════════════════════════

describe("GET /api/campaigns/email-events", () => {
  it("retorna 401 sem token de autenticação", async () => {
    const res = await request(app).get("/api/campaigns/email-events");
    expect(res.status).toBe(401);
  });

  it("retorna eventos com token válido (padrão hours=48)", async () => {
    const res = await request(app)
      .get("/api/campaigns/email-events")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("events");
    expect(res.body).toHaveProperty("resumo");
    expect(Array.isArray(res.body.events)).toBe(true);
  });

  it("respeita parâmetro hours=1", async () => {
    const res = await request(app)
      .get("/api/campaigns/email-events?hours=1")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("events");
    expect(Array.isArray(res.body.events)).toBe(true);
  });

  it("retorna 400 com hours inválido", async () => {
    const res = await request(app)
      .get("/api/campaigns/email-events?hours=abc")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(400);
  });

  it("retorna 400 com hours=0 (mínimo é 1)", async () => {
    const res = await request(app)
      .get("/api/campaigns/email-events?hours=0")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(400);
  });

  it("retorna 400 com hours > 168 (máximo)", async () => {
    const res = await request(app)
      .get("/api/campaigns/email-events?hours=999")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(400);
  });

  it("resposta contém estrutura correta (tipo, email, resumo)", async () => {
    if (!testCustomerId) return;

    const res = await request(app)
      .get("/api/campaigns/email-events?hours=24")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);

    // Verifica estrutura do resumo
    expect(res.body.resumo).toHaveProperty("abertos");
    expect(res.body.resumo).toHaveProperty("clicados");
    expect(res.body.resumo).toHaveProperty("bounces");
    expect(res.body.resumo).toHaveProperty("spam");

    // Se há eventos, verifica estrutura
    if (res.body.events.length > 0) {
      const event = res.body.events[0];
      expect(event).toHaveProperty("tipo");
      expect(event).toHaveProperty("email");
      expect(event).toHaveProperty("timestamp");
    }
  });

  it("eventos de teste vitest aparecem na resposta", async () => {
    if (!testCustomerId) return;

    const res = await request(app)
      .get("/api/campaigns/email-events?hours=1")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);

    // Procura por eventos do customer de teste
    const testEvents = res.body.events.filter(
      (e: { email: string }) => e.email === `${TEST_PREFIX}test@example.com`,
    );
    // Deve encontrar pelo menos os eventos opened e clicked (bounced está no filtro SQL do endpoint)
    expect(testEvents.length).toBeGreaterThanOrEqual(2);
  });
});
