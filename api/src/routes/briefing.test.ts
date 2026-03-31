import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../server";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "";

function adminToken(): string {
  return jwt.sign({ userId: "test-admin", email: "test@test.com", papel: "admin" }, JWT_SECRET, { expiresIn: "1h" });
}

// ── Autenticação ───────────────────────────────────────────────

describe("GET /api/briefing — autenticação", () => {
  it("retorna 401 sem token", async () => {
    const res = await request(app).get("/api/briefing");
    expect(res.status).toBe(401);
  });

  it("retorna 401 com Bearer inválido", async () => {
    const res = await request(app)
      .get("/api/briefing")
      .set("Authorization", "Bearer invalid-token");
    expect(res.status).toBe(401);
  });

  it("retorna 401 sem prefixo Bearer", async () => {
    const res = await request(app)
      .get("/api/briefing")
      .set("Authorization", adminToken());
    expect(res.status).toBe(401);
  });
});

// ── Dados do briefing ──────────────────────────────────────────

describe("GET /api/briefing — dados", () => {
  it("retorna briefing das últimas 24h (padrão)", async () => {
    const res = await request(app)
      .get("/api/briefing")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("periodo");
    expect(res.body).toHaveProperty("site");
    expect(res.body).toHaveProperty("leads");
    expect(res.body).toHaveProperty("vendas");
    expect(res.body).toHaveProperty("automacoes");
    expect(res.body).toHaveProperty("syncs");
    expect(res.body).toHaveProperty("alertas");
    expect(res.body.periodo.horas).toBe(24);
  });

  it("aceita parâmetro horas customizado", async () => {
    const res = await request(app)
      .get("/api/briefing?horas=48")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.periodo.horas).toBe(48);
  });

  it("retorna estrutura correta do site", async () => {
    const res = await request(app)
      .get("/api/briefing?horas=24")
      .set("Authorization", `Bearer ${adminToken()}`);
    const site = res.body.site;
    expect(site).toHaveProperty("visitantes_unicos");
    expect(site).toHaveProperty("page_views");
    expect(site).toHaveProperty("produto_views");
    expect(site).toHaveProperty("add_to_cart");
    expect(site).toHaveProperty("checkouts");
    expect(site).toHaveProperty("compras");
    expect(site).toHaveProperty("top_produtos");
    expect(site).toHaveProperty("top_estados");
    expect(typeof site.visitantes_unicos).toBe("number");
    expect(Array.isArray(site.top_produtos)).toBe(true);
  });

  it("retorna estrutura correta de vendas", async () => {
    const res = await request(app)
      .get("/api/briefing?horas=24")
      .set("Authorization", `Bearer ${adminToken()}`);
    const vendas = res.body.vendas;
    expect(vendas.nuvemshop).toHaveProperty("pedidos");
    expect(vendas.nuvemshop).toHaveProperty("receita");
    expect(vendas.nuvemshop).toHaveProperty("ticket_medio");
    expect(vendas.bling).toHaveProperty("pedidos");
    expect(vendas.carrinhos).toHaveProperty("detectados");
    expect(vendas.carrinhos).toHaveProperty("convertidos");
  });

  it("retorna alertas booleanos e numéricos", async () => {
    const res = await request(app)
      .get("/api/briefing?horas=24")
      .set("Authorization", `Bearer ${adminToken()}`);
    const alertas = res.body.alertas;
    expect(typeof alertas.descadastros).toBe("number");
    expect(typeof alertas.erros_sync).toBe("number");
    expect(typeof alertas.funil_travado).toBe("boolean");
    expect(typeof alertas.leads_sem_verificar).toBe("number");
  });
});

// ── Validação de input ─────────────────────────────────────────

describe("GET /api/briefing — validação", () => {
  it("rejeita horas = 0", async () => {
    const res = await request(app)
      .get("/api/briefing?horas=0")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(400);
  });

  it("rejeita horas negativo", async () => {
    const res = await request(app)
      .get("/api/briefing?horas=-5")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(400);
  });

  it("rejeita horas > 168 (7 dias)", async () => {
    const res = await request(app)
      .get("/api/briefing?horas=999")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(400);
  });

  it("rejeita horas não-numérico", async () => {
    const res = await request(app)
      .get("/api/briefing?horas=abc")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(400);
  });

  it("ignora SQL injection no parâmetro horas", async () => {
    const res = await request(app)
      .get("/api/briefing?horas=24;DROP%20TABLE%20users")
      .set("Authorization", `Bearer ${adminToken()}`);
    // Zod coerce rejeita porque não é número
    expect(res.status).toBe(400);
  });
});

// ── POST /api/briefing/enviar — segurança ──────────────────────

describe("POST /api/briefing/enviar", () => {
  it("retorna 401 sem token", async () => {
    const res = await request(app).post("/api/briefing/enviar");
    expect(res.status).toBe(401);
  });

  it("retorna 401 com token inválido", async () => {
    const res = await request(app)
      .post("/api/briefing/enviar")
      .set("Authorization", "Bearer fake.jwt.token");
    expect(res.status).toBe(401);
  });
});

// ── Segurança geral ────────────────────────────────────────────

describe("Segurança — briefing endpoint", () => {
  it("não expõe stack trace em erro", async () => {
    // Força um parâmetro inválido que poderia causar exceção
    const res = await request(app)
      .get("/api/briefing?horas[__proto__]=1")
      .set("Authorization", `Bearer ${adminToken()}`);
    // Deve retornar 400 ou 200, mas nunca stack trace
    expect(res.body).not.toHaveProperty("stack");
    expect(JSON.stringify(res.body)).not.toContain("at Object");
    expect(JSON.stringify(res.body)).not.toContain("node_modules");
  });

  it("não aceita method spoofing (POST em GET endpoint)", async () => {
    const res = await request(app)
      .post("/api/briefing")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({ horas: 24 });
    expect(res.status).toBe(404);
  });

  it("retorna content-type JSON", async () => {
    const res = await request(app)
      .get("/api/briefing")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.headers["content-type"]).toContain("application/json");
  });

  it("helmet headers presentes", async () => {
    const res = await request(app)
      .get("/api/briefing")
      .set("Authorization", `Bearer ${adminToken()}`);
    // Helmet adiciona X-Content-Type-Options
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("rate limit retorna headers corretos", async () => {
    const res = await request(app)
      .get("/api/briefing")
      .set("Authorization", `Bearer ${adminToken()}`);
    // express-rate-limit standard headers
    expect(res.headers).toHaveProperty("ratelimit-limit");
  });
});
