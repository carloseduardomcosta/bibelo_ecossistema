import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../server";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "";

function adminToken(): string {
  return jwt.sign({ userId: "test-admin", email: "test@test.com", papel: "admin" }, JWT_SECRET, { expiresIn: "1h" });
}

// ── GET /api/sync/status ─────────────────────────────────────────

describe("GET /api/sync/status", () => {
  it("retorna 401 sem token", async () => {
    const res = await request(app).get("/api/sync/status");
    expect(res.status).toBe(401);
  });

  it("retorna status das integrações com auth", async () => {
    const res = await request(app)
      .get("/api/sync/status")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);

    expect(res.body).toHaveProperty("integracoes");
    expect(res.body).toHaveProperty("bling_conectado");
    expect(res.body).toHaveProperty("nuvemshop_conectado");
    expect(res.body).toHaveProperty("logs_recentes");
    expect(Array.isArray(res.body.integracoes)).toBe(true);
    expect(Array.isArray(res.body.logs_recentes)).toBe(true);
  });

  it("bling_conectado é boolean", async () => {
    const res = await request(app)
      .get("/api/sync/status")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(typeof res.body.bling_conectado).toBe("boolean");
    expect(typeof res.body.nuvemshop_conectado).toBe("boolean");
  });

  it("integracoes tem campos esperados", async () => {
    const res = await request(app)
      .get("/api/sync/status")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);

    if (res.body.integracoes.length > 0) {
      const integ = res.body.integracoes[0];
      expect(integ).toHaveProperty("fonte");
      expect(integ).toHaveProperty("ultima_sync");
      expect(integ).toHaveProperty("total_sincronizados");
    }
  });

  it("logs_recentes tem campos esperados", async () => {
    const res = await request(app)
      .get("/api/sync/status")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);

    if (res.body.logs_recentes.length > 0) {
      const log = res.body.logs_recentes[0];
      expect(log).toHaveProperty("fonte");
      expect(log).toHaveProperty("tipo");
      expect(log).toHaveProperty("status");
      expect(log).toHaveProperty("criado_em");
    }
  });
});

// ── POST /api/sync/bling ─────────────────────────────────────────

describe("POST /api/sync/bling", () => {
  it("retorna 401 sem token", async () => {
    const res = await request(app).post("/api/sync/bling");
    expect(res.status).toBe(401);
  });

  it("aceita sync incremental com auth (responde imediatamente)", async () => {
    const res = await request(app)
      .post("/api/sync/bling?tipo=incremental")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("message");
    expect(res.body.message).toContain("iniciado");
  });
});

// ── POST /api/sync/nuvemshop ─────────────────────────────────────

describe("POST /api/sync/nuvemshop", () => {
  it("retorna 401 sem token", async () => {
    const res = await request(app).post("/api/sync/nuvemshop");
    expect(res.status).toBe(401);
  });

  it("aceita sync com auth (responde imediatamente ou erro de conexão)", async () => {
    const res = await request(app)
      .post("/api/sync/nuvemshop")
      .set("Authorization", `Bearer ${adminToken()}`);
    // 200 se NuvemShop conectada, 400 se não conectada
    expect([200, 400]).toContain(res.status);
    // Verificar que retornou um body válido com message ou error
    expect(res.body).toBeDefined();
    if (res.status === 200) {
      expect(res.body).toHaveProperty("message");
    } else {
      expect(res.body).toHaveProperty("error");
    }
  });
});

// ── POST /api/sync/medusa ────────────────────────────────────────

describe("POST /api/sync/medusa", () => {
  it("retorna 401 sem token", async () => {
    const res = await request(app).post("/api/sync/medusa");
    expect(res.status).toBe(401);
  });

  it("aceita sync com auth (responde imediatamente)", async () => {
    const res = await request(app)
      .post("/api/sync/medusa")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("message");
    expect(res.body.message).toContain("iniciado");
  });
});

// ── Segurança ────────────────────────────────────────────────────

describe("Segurança — sync API", () => {
  it("rejeita JWT expirado", async () => {
    const expired = jwt.sign(
      { userId: "test", email: "test@test.com", papel: "admin" },
      JWT_SECRET,
      { expiresIn: "-1h" }
    );
    const res = await request(app)
      .get("/api/sync/status")
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
      .get("/api/sync/status")
      .set("Authorization", `Bearer ${bad}`);
    expect(res.status).toBe(401);
  });

  it("rejeita token malformado", async () => {
    const res = await request(app)
      .get("/api/sync/status")
      .set("Authorization", "Bearer not.a.valid.jwt");
    expect(res.status).toBe(401);
  });
});
