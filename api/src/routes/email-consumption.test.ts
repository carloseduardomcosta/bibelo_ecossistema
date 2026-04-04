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

// ── GET /api/email-consumption/overview ────────────────────────

describe("GET /api/email-consumption/overview", () => {
  it("retorna 401 sem token", async () => {
    const res = await request(app).get("/api/email-consumption/overview");
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty("error");
  });

  it("retorna dados de consumo com token válido", async () => {
    const res = await request(app)
      .get("/api/email-consumption/overview")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("provider");
    expect(res.body).toHaveProperty("periodo");
    expect(res.body).toHaveProperty("dias");
    expect(res.body).toHaveProperty("kpis");
    expect(res.body.kpis).toHaveProperty("total_enviados");
    expect(res.body.kpis).toHaveProperty("total_campanhas");
    expect(res.body.kpis).toHaveProperty("total_fluxos");
    expect(res.body.kpis).toHaveProperty("total_entregues");
    expect(res.body.kpis).toHaveProperty("total_abertos");
    expect(res.body.kpis).toHaveProperty("total_cliques");
    expect(res.body.kpis).toHaveProperty("total_bounces");
    expect(res.body.kpis).toHaveProperty("total_spam");
    expect(res.body.kpis).toHaveProperty("taxa_abertura");
    expect(res.body.kpis).toHaveProperty("taxa_clique");
    expect(res.body.kpis).toHaveProperty("variacao");
    expect(res.body.kpis).toHaveProperty("custo_estimado");
  });

  it("aceita parâmetro de período customizado", async () => {
    const res = await request(app)
      .get("/api/email-consumption/overview?periodo=7d")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.periodo).toBe("7d");
    expect(res.body.dias).toBe(7);
  });

  it("usa período padrão 30d quando não informado", async () => {
    const res = await request(app)
      .get("/api/email-consumption/overview")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.periodo).toBe("30d");
    expect(res.body.dias).toBe(30);
  });
});

// ── GET /api/email-consumption/daily ──────────────────────────

describe("GET /api/email-consumption/daily", () => {
  it("retorna 401 sem token", async () => {
    const res = await request(app).get("/api/email-consumption/daily");
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty("error");
  });

  it("retorna dados diários com token válido", async () => {
    const res = await request(app)
      .get("/api/email-consumption/daily")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("periodo");
    expect(res.body).toHaveProperty("dias");
    expect(res.body).toHaveProperty("daily");
    expect(Array.isArray(res.body.daily)).toBe(true);
  });

  it("aceita parâmetro de período customizado", async () => {
    const res = await request(app)
      .get("/api/email-consumption/daily?periodo=7d")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.periodo).toBe("7d");
    expect(res.body.dias).toBe(7);
  });
});

// ── GET /api/email-consumption/monthly ────────────────────────

describe("GET /api/email-consumption/monthly", () => {
  it("retorna 401 sem token", async () => {
    const res = await request(app).get("/api/email-consumption/monthly");
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty("error");
  });

  it("retorna dados mensais com token válido", async () => {
    const res = await request(app)
      .get("/api/email-consumption/monthly")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("provider");
    expect(res.body).toHaveProperty("monthly");
    expect(Array.isArray(res.body.monthly)).toBe(true);
    // Cada item mensal deve ter a estrutura esperada
    if (res.body.monthly.length > 0) {
      const item = res.body.monthly[0];
      expect(item).toHaveProperty("mes");
      expect(item).toHaveProperty("campanhas");
      expect(item).toHaveProperty("fluxos");
      expect(item).toHaveProperty("total");
      expect(item).toHaveProperty("custo_ses");
      expect(item).toHaveProperty("custo_resend");
    }
  });
});

// ── GET /api/email-consumption/by-type ────────────────────────

describe("GET /api/email-consumption/by-type", () => {
  it("retorna 401 sem token", async () => {
    const res = await request(app).get("/api/email-consumption/by-type");
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty("error");
  });

  it("retorna distribuição por tipo com token válido", async () => {
    const res = await request(app)
      .get("/api/email-consumption/by-type")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("periodo");
    expect(res.body).toHaveProperty("distribuicao");
    expect(res.body).toHaveProperty("topCampanhas");
    expect(res.body).toHaveProperty("topFluxos");
    expect(Array.isArray(res.body.distribuicao)).toBe(true);
    expect(Array.isArray(res.body.topCampanhas)).toBe(true);
    expect(Array.isArray(res.body.topFluxos)).toBe(true);
    // Distribuição tem campanhas e fluxos
    expect(res.body.distribuicao.length).toBe(2);
    expect(res.body.distribuicao[0]).toHaveProperty("tipo");
    expect(res.body.distribuicao[0]).toHaveProperty("total");
  });

  it("aceita parâmetro de período customizado", async () => {
    const res = await request(app)
      .get("/api/email-consumption/by-type?periodo=3m")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.periodo).toBe("3m");
  });
});

// ── Segurança ─────────────────────────────────────────────────

describe("Segurança — email-consumption API", () => {
  it("rejeita JWT expirado", async () => {
    const expired = jwt.sign(
      { userId: "test", email: "test@test.com", papel: "admin" },
      JWT_SECRET,
      { expiresIn: "-1h" }
    );
    const res = await request(app)
      .get("/api/email-consumption/overview")
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
      .get("/api/email-consumption/overview")
      .set("Authorization", `Bearer ${bad}`);
    expect(res.status).toBe(401);
  });

  it("rejeita token malformado", async () => {
    const res = await request(app)
      .get("/api/email-consumption/overview")
      .set("Authorization", "Bearer nao.e.jwt.valido");
    expect(res.status).toBe(401);
  });
});
