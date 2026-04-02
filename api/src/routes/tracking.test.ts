import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { app } from "../server";
import { query } from "../db";
import jwt from "jsonwebtoken";
import crypto from "crypto";

const JWT_SECRET = process.env.JWT_SECRET || "";
const TEST_VISITOR_ID = `vitest-tracking-${crypto.randomBytes(8).toString("hex")}`;

function adminToken(): string {
  return jwt.sign({ userId: "test-admin", email: "test@test.com", papel: "admin" }, JWT_SECRET, { expiresIn: "1h" });
}

// Cleanup após testes
afterAll(async () => {
  await query("DELETE FROM crm.tracking_events WHERE visitor_id = $1", [TEST_VISITOR_ID]);
  await query("DELETE FROM crm.visitor_customers WHERE visitor_id = $1", [TEST_VISITOR_ID]);
});

// ════════════════════════════════════════════════════════════════
// ENDPOINTS PÚBLICOS
// ════════════════════════════════════════════════════════════════

// ── POST /api/tracking/event ─────────────────────────────────────

describe("POST /api/tracking/event", () => {
  it("aceita page_view event", async () => {
    const res = await request(app)
      .post("/api/tracking/event")
      .send({
        visitor_id: TEST_VISITOR_ID,
        evento: "page_view",
        pagina: "https://papelariabibelo.com.br/",
        pagina_tipo: "home",
      });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("aceita product_view event com dados do produto", async () => {
    const res = await request(app)
      .post("/api/tracking/event")
      .send({
        visitor_id: TEST_VISITOR_ID,
        evento: "product_view",
        pagina: "https://papelariabibelo.com.br/produtos/caneta-bic",
        pagina_tipo: "product",
        resource_id: "12345",
        resource_nome: "Caneta BIC Cristal",
        resource_preco: 2.50,
      });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("retorna 400 sem visitor_id", async () => {
    const res = await request(app)
      .post("/api/tracking/event")
      .send({
        evento: "page_view",
        pagina: "https://papelariabibelo.com.br/",
      });
    expect(res.status).toBe(400);
  });

  it("retorna 400 sem evento", async () => {
    const res = await request(app)
      .post("/api/tracking/event")
      .send({
        visitor_id: TEST_VISITOR_ID,
        pagina: "https://papelariabibelo.com.br/",
      });
    expect(res.status).toBe(400);
  });

  it("retorna 400 com evento inválido", async () => {
    const res = await request(app)
      .post("/api/tracking/event")
      .send({
        visitor_id: TEST_VISITOR_ID,
        evento: "evento_invalido",
        pagina: "https://papelariabibelo.com.br/",
      });
    expect(res.status).toBe(400);
  });

  it("aceita sendBeacon format (text/plain)", async () => {
    const payload = JSON.stringify({
      visitor_id: TEST_VISITOR_ID,
      evento: "page_view",
      pagina: "https://papelariabibelo.com.br/carrinho",
      pagina_tipo: "cart",
    });
    const res = await request(app)
      .post("/api/tracking/event")
      .set("Content-Type", "text/plain")
      .send(payload);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("aceita UTM params", async () => {
    const res = await request(app)
      .post("/api/tracking/event")
      .send({
        visitor_id: TEST_VISITOR_ID,
        evento: "page_view",
        pagina: "https://papelariabibelo.com.br/",
        pagina_tipo: "home",
        utm_source: "google",
        utm_medium: "cpc",
        utm_campaign: "black-friday",
      });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

// ── XSS no visitor_id ────────────────────────────────────────────

describe("Segurança — tracking event", () => {
  it("XSS no visitor_id é tratado como string segura", async () => {
    const xssVisitor = '<script>alert("xss")</script>';
    const res = await request(app)
      .post("/api/tracking/event")
      .send({
        visitor_id: xssVisitor,
        evento: "page_view",
        pagina: "https://papelariabibelo.com.br/",
        pagina_tipo: "home",
      });
    // Zod valida mas permite string — grava no banco via parameterized query (seguro)
    expect(res.status).toBe(200);

    // Cleanup
    await query("DELETE FROM crm.tracking_events WHERE visitor_id = $1", [xssVisitor]);
  });

  it("SQL injection no visitor_id não causa erro 500", async () => {
    const sqli = "'; DROP TABLE crm.tracking_events;--";
    const res = await request(app)
      .post("/api/tracking/event")
      .send({
        visitor_id: sqli,
        evento: "page_view",
        pagina: "https://papelariabibelo.com.br/",
        pagina_tipo: "home",
      });
    // Parameterized queries protegem — nunca 500
    expect(res.status).not.toBe(500);

    // Cleanup
    await query("DELETE FROM crm.tracking_events WHERE visitor_id = $1", [sqli]);
  });

  it("retorna 400 com body JSON inválido (text/plain)", async () => {
    const res = await request(app)
      .post("/api/tracking/event")
      .set("Content-Type", "text/plain")
      .send("isto não é json{{{");
    expect(res.status).toBe(400);
  });
});

// ── POST /api/tracking/identify ──────────────────────────────────

describe("POST /api/tracking/identify", () => {
  it("aceita identify com visitor_id e email", async () => {
    const res = await request(app)
      .post("/api/tracking/identify")
      .send({
        visitor_id: TEST_VISITOR_ID,
        email: "teste-identify@example.com",
      });
    // Retorna ok: true independente de o email existir (previne enumeration)
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("retorna 400 com email inválido", async () => {
    const res = await request(app)
      .post("/api/tracking/identify")
      .send({
        visitor_id: TEST_VISITOR_ID,
        email: "nao-e-email",
      });
    expect(res.status).toBe(400);
  });

  it("retorna 400 sem visitor_id", async () => {
    const res = await request(app)
      .post("/api/tracking/identify")
      .send({
        email: "teste@example.com",
      });
    expect(res.status).toBe(400);
  });

  it("retorna 400 sem email", async () => {
    const res = await request(app)
      .post("/api/tracking/identify")
      .send({
        visitor_id: TEST_VISITOR_ID,
      });
    expect(res.status).toBe(400);
  });

  it("não revela se email existe ou não (resposta genérica)", async () => {
    const resExiste = await request(app)
      .post("/api/tracking/identify")
      .send({
        visitor_id: `${TEST_VISITOR_ID}-check1`,
        email: "nao-existe-vitest-99999@example.com",
      });

    const resNaoExiste = await request(app)
      .post("/api/tracking/identify")
      .send({
        visitor_id: `${TEST_VISITOR_ID}-check2`,
        email: "teste-identify-2@example.com",
      });

    // Ambas devem retornar a mesma estrutura (previne email enumeration)
    expect(resExiste.status).toBe(200);
    expect(resNaoExiste.status).toBe(200);
    expect(resExiste.body).toEqual(resNaoExiste.body);

    // Cleanup
    await query("DELETE FROM crm.visitor_customers WHERE visitor_id LIKE $1", [`${TEST_VISITOR_ID}-check%`]);
  });
});

// ── GET /api/tracking/bibelo.js ──────────────────────────────────

describe("GET /api/tracking/bibelo.js", () => {
  it("retorna script JavaScript", async () => {
    const res = await request(app).get("/api/tracking/bibelo.js");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("javascript");
    expect(res.text).toContain("bibelo");
    expect(res.text).toContain("visitor_id");
    expect(res.text).toContain("track");
  });

  it("retorna header Access-Control-Allow-Origin: *", async () => {
    const res = await request(app).get("/api/tracking/bibelo.js");
    expect(res.status).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBe("*");
  });

  it("retorna header Cache-Control", async () => {
    const res = await request(app).get("/api/tracking/bibelo.js");
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toContain("max-age");
  });
});

// ════════════════════════════════════════════════════════════════
// ENDPOINTS PROTEGIDOS
// ════════════════════════════════════════════════════════════════

// ── GET /api/tracking/timeline ───────────────────────────────────

describe("GET /api/tracking/timeline", () => {
  it("retorna 401 sem token", async () => {
    const res = await request(app).get("/api/tracking/timeline");
    expect(res.status).toBe(401);
  });

  it("retorna eventos com auth", async () => {
    const res = await request(app)
      .get("/api/tracking/timeline")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("respeita parâmetro limit", async () => {
    const res = await request(app)
      .get("/api/tracking/timeline?limit=3")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeLessThanOrEqual(3);
  });
});

// ── GET /api/tracking/stats ──────────────────────────────────────

describe("GET /api/tracking/stats", () => {
  it("retorna 401 sem token", async () => {
    const res = await request(app).get("/api/tracking/stats");
    expect(res.status).toBe(401);
  });

  it("retorna KPIs de tracking com auth", async () => {
    const res = await request(app)
      .get("/api/tracking/stats")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("eventos_24h");
    expect(res.body).toHaveProperty("visitantes_24h");
    expect(res.body).toHaveProperty("topProdutos");
    expect(res.body).toHaveProperty("porTipo");
    expect(Array.isArray(res.body.topProdutos)).toBe(true);
    expect(Array.isArray(res.body.porTipo)).toBe(true);
  });
});

// ── GET /api/tracking/funnel ─────────────────────────────────────

describe("GET /api/tracking/funnel", () => {
  it("retorna 401 sem token", async () => {
    const res = await request(app).get("/api/tracking/funnel");
    expect(res.status).toBe(401);
  });

  it("retorna funil com auth", async () => {
    const res = await request(app)
      .get("/api/tracking/funnel")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("dias");
    expect(res.body).toHaveProperty("steps");
    expect(res.body).toHaveProperty("taxa_conversao_geral");
    expect(Array.isArray(res.body.steps)).toBe(true);
    expect(res.body.steps.length).toBe(5);

    // Verificar estrutura dos steps
    const step = res.body.steps[0];
    expect(step).toHaveProperty("etapa");
    expect(step).toHaveProperty("total");
    expect(step).toHaveProperty("taxa");
  });
});

// ── Rate limiting ────────────────────────────────────────────────

describe("Rate limiting — tracking público", () => {
  it("60 requisições rápidas não retornam 500 (rate limit retorna 429)", async () => {
    // Envia várias requisições rápidas — as primeiras passam, as demais recebem 429
    const promises = Array.from({ length: 65 }, () =>
      request(app)
        .post("/api/tracking/event")
        .send({
          visitor_id: TEST_VISITOR_ID,
          evento: "page_view",
          pagina: "https://papelariabibelo.com.br/rate-test",
          pagina_tipo: "other",
        })
    );

    const results = await Promise.all(promises);
    const statuses = results.map((r) => r.status);

    // Todos devem ser 200 ou 429 — nunca 500
    for (const s of statuses) {
      expect([200, 429]).toContain(s);
    }

    // Pelo menos alguns devem ter passado (200)
    expect(statuses.filter((s) => s === 200).length).toBeGreaterThan(0);
  });
});
