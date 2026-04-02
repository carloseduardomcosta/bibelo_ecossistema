import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../server";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "";

function adminToken(): string {
  return jwt.sign({ userId: "test-admin", email: "test@test.com", papel: "admin" }, JWT_SECRET, { expiresIn: "1h" });
}

// ── GET /api/analytics/overview ──────────────────────────────────

describe("GET /api/analytics/overview", () => {
  it("retorna 401 sem token", async () => {
    const res = await request(app).get("/api/analytics/overview");
    expect(res.status).toBe(401);
  });

  it("retorna KPIs com auth", async () => {
    const res = await request(app)
      .get("/api/analytics/overview")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);

    // Campos obrigatórios
    expect(res.body).toHaveProperty("receita_periodo");
    expect(res.body).toHaveProperty("pedidos_periodo");
    expect(res.body).toHaveProperty("ticket_medio");
    expect(res.body).toHaveProperty("total_clientes");
    expect(res.body).toHaveProperty("novos_clientes");
    expect(res.body).toHaveProperty("total_produtos");
    expect(res.body).toHaveProperty("sem_estoque");
    expect(res.body).toHaveProperty("segmentos");
    expect(res.body).toHaveProperty("despesas_periodo");
    expect(res.body).toHaveProperty("saldo_periodo");
  });

  it("aceita parâmetro periodo=30d", async () => {
    const res = await request(app)
      .get("/api/analytics/overview?periodo=30d")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("receita_periodo");
  });

  it("aceita parâmetro periodo=7d", async () => {
    const res = await request(app)
      .get("/api/analytics/overview?periodo=7d")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("receita_periodo");
  });

  it("campos numéricos são números (não strings)", async () => {
    const res = await request(app)
      .get("/api/analytics/overview")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);

    expect(typeof res.body.receita_periodo).toBe("number");
    expect(typeof res.body.pedidos_periodo).toBe("number");
    expect(typeof res.body.ticket_medio).toBe("number");
    expect(typeof res.body.total_clientes).toBe("number");
    expect(typeof res.body.novos_clientes).toBe("number");
    expect(typeof res.body.total_produtos).toBe("number");
    expect(typeof res.body.sem_estoque).toBe("number");
    expect(typeof res.body.despesas_periodo).toBe("number");
    expect(typeof res.body.saldo_periodo).toBe("number");
  });

  it("segmentos é array com objetos válidos", async () => {
    const res = await request(app)
      .get("/api/analytics/overview")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.segmentos)).toBe(true);

    if (res.body.segmentos.length > 0) {
      const seg = res.body.segmentos[0];
      expect(seg).toHaveProperty("segmento");
      expect(seg).toHaveProperty("total");
      expect(typeof seg.segmento).toBe("string");
      expect(typeof seg.total).toBe("number");
    }
  });

  it("retorna variações percentuais", async () => {
    const res = await request(app)
      .get("/api/analytics/overview")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);

    expect(res.body).toHaveProperty("receita_variacao");
    expect(res.body).toHaveProperty("pedidos_variacao");
    expect(res.body).toHaveProperty("ticket_variacao");
    expect(res.body).toHaveProperty("novos_variacao");
    expect(typeof res.body.receita_variacao).toBe("number");
    expect(typeof res.body.pedidos_variacao).toBe("number");
  });
});

// ── GET /api/analytics/revenue ───────────────────────────────────

describe("GET /api/analytics/revenue", () => {
  it("retorna 401 sem token", async () => {
    const res = await request(app).get("/api/analytics/revenue");
    expect(res.status).toBe(401);
  });

  it("retorna dados de receita mensal", async () => {
    const res = await request(app)
      .get("/api/analytics/revenue?periodo=6m")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("data");
    expect(Array.isArray(res.body.data)).toBe(true);

    if (res.body.data.length > 0) {
      const row = res.body.data[0];
      expect(row).toHaveProperty("mes");
      expect(row).toHaveProperty("receita");
      expect(row).toHaveProperty("pedidos");
      expect(typeof row.receita).toBe("number");
      expect(typeof row.pedidos).toBe("number");
    }
  });
});

// ── GET /api/analytics/segments ──────────────────────────────────

describe("GET /api/analytics/segments", () => {
  it("retorna 401 sem token", async () => {
    const res = await request(app).get("/api/analytics/segments");
    expect(res.status).toBe(401);
  });

  it("retorna dados de segmentos", async () => {
    const res = await request(app)
      .get("/api/analytics/segments")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("data");
    expect(Array.isArray(res.body.data)).toBe(true);

    if (res.body.data.length > 0) {
      const seg = res.body.data[0];
      expect(seg).toHaveProperty("segmento");
      expect(seg).toHaveProperty("total");
      expect(typeof seg.segmento).toBe("string");
      expect(typeof seg.total).toBe("number");
    }
  });
});

// ── GET /api/analytics/insights ──────────────────────────────────

describe("GET /api/analytics/insights", () => {
  it("retorna 401 sem token", async () => {
    const res = await request(app).get("/api/analytics/insights");
    expect(res.status).toBe(401);
  });

  it("retorna insights com auth", async () => {
    const res = await request(app)
      .get("/api/analytics/insights")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);

    expect(res.body).toHaveProperty("clientes_risco");
    expect(res.body).toHaveProperty("top_clientes");
    expect(res.body).toHaveProperty("oportunidades_perdidas");
    expect(res.body).toHaveProperty("categorias_margem");
    expect(Array.isArray(res.body.clientes_risco)).toBe(true);
    expect(Array.isArray(res.body.top_clientes)).toBe(true);
  });
});

// ── Segurança ────────────────────────────────────────────────────

describe("Segurança — analytics API", () => {
  it("rejeita JWT expirado", async () => {
    const expired = jwt.sign(
      { userId: "test", email: "test@test.com", papel: "admin" },
      JWT_SECRET,
      { expiresIn: "-1h" }
    );
    const res = await request(app)
      .get("/api/analytics/overview")
      .set("Authorization", `Bearer ${expired}`);
    expect(res.status).toBe(401);
  });

  it("rejeita JWT com secret errado", async () => {
    const bad = jwt.sign(
      { userId: "test", email: "test@test.com", papel: "admin" },
      "wrong-secret",
      { expiresIn: "1h" }
    );
    const res = await request(app)
      .get("/api/analytics/overview")
      .set("Authorization", `Bearer ${bad}`);
    expect(res.status).toBe(401);
  });

  it("rejeita token malformado", async () => {
    const res = await request(app)
      .get("/api/analytics/overview")
      .set("Authorization", "Bearer not.a.valid.jwt");
    expect(res.status).toBe(401);
  });
});
