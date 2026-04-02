import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../server";
import { queryOne } from "../db";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "";

function adminToken(): string {
  return jwt.sign({ userId: "test-admin", email: "test@test.com", papel: "admin" }, JWT_SECRET, { expiresIn: "1h" });
}

// ── GET /api/products ────────────────────────────────────────────

describe("GET /api/products", () => {
  it("retorna 401 sem token", async () => {
    const res = await request(app).get("/api/products");
    expect(res.status).toBe(401);
  });

  it("retorna lista paginada com auth", async () => {
    const res = await request(app)
      .get("/api/products")
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

  it("busca por nome funciona (param search)", async () => {
    const res = await request(app)
      .get("/api/products?search=caneta")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("data");
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it("paginação funciona (page e limit)", async () => {
    const res = await request(app)
      .get("/api/products?page=1&limit=5")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.pagination.page).toBe(1);
    expect(res.body.pagination.limit).toBe(5);
    expect(res.body.data.length).toBeLessThanOrEqual(5);
  });

  it("filtra por ativo", async () => {
    const res = await request(app)
      .get("/api/products?ativo=true")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("data");
  });

  it("retorna 400 com limit inválido", async () => {
    const res = await request(app)
      .get("/api/products?limit=0")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(400);
  });

  it("retorna 400 com page inválida", async () => {
    const res = await request(app)
      .get("/api/products?page=0")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(400);
  });

  it("produtos têm campos esperados", async () => {
    const res = await request(app)
      .get("/api/products?limit=1")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);

    if (res.body.data.length > 0) {
      const prod = res.body.data[0];
      expect(prod).toHaveProperty("id");
      expect(prod).toHaveProperty("nome");
      expect(prod).toHaveProperty("sku");
      expect(prod).toHaveProperty("preco_venda");
      expect(prod).toHaveProperty("ativo");
      expect(prod).toHaveProperty("estoque_total");
    }
  });
});

// ── GET /api/products/:id ────────────────────────────────────────

describe("GET /api/products/:id", () => {
  it("retorna 401 sem token", async () => {
    const res = await request(app).get("/api/products/1");
    expect(res.status).toBe(401);
  });

  it("retorna 404 para ID inexistente", async () => {
    const res = await request(app)
      .get("/api/products/00000000-0000-0000-0000-000000000000")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty("error");
  });

  it("retorna detalhe de produto real", async () => {
    const prod = await queryOne<{ id: string }>("SELECT id FROM sync.bling_products LIMIT 1");
    if (!prod) return;

    const res = await request(app)
      .get(`/api/products/${prod.id}`)
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("id");
    expect(res.body).toHaveProperty("nome");
    expect(res.body).toHaveProperty("estoque");
    expect(res.body).toHaveProperty("vendas");
    expect(Array.isArray(res.body.estoque)).toBe(true);
    expect(res.body.vendas).toHaveProperty("total_vendido");
    expect(res.body.vendas).toHaveProperty("receita_total");
  });
});

// ── GET /api/products/categories ─────────────────────────────────

describe("GET /api/products/categories", () => {
  it("retorna 401 sem token", async () => {
    const res = await request(app).get("/api/products/categories");
    expect(res.status).toBe(401);
  });

  it("retorna lista de categorias", async () => {
    const res = await request(app)
      .get("/api/products/categories")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("data");
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

// ── GET /api/products/stock-overview ─────────────────────────────

describe("GET /api/products/stock-overview", () => {
  it("retorna 401 sem token", async () => {
    const res = await request(app).get("/api/products/stock-overview");
    expect(res.status).toBe(401);
  });

  it("retorna resumo de estoque com auth", async () => {
    const res = await request(app)
      .get("/api/products/stock-overview")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);

    expect(res.body).toHaveProperty("total_produtos");
    expect(res.body).toHaveProperty("total_ativos");
    expect(res.body).toHaveProperty("com_estoque");
    expect(res.body).toHaveProperty("sem_estoque");
    expect(res.body).toHaveProperty("estoque_baixo");
    expect(res.body).toHaveProperty("valor_estoque_custo");
    expect(res.body).toHaveProperty("valor_estoque_venda");
    expect(res.body).toHaveProperty("por_categoria");
    expect(Array.isArray(res.body.por_categoria)).toBe(true);

    expect(typeof res.body.total_produtos).toBe("number");
    expect(typeof res.body.valor_estoque_custo).toBe("number");
  });
});

// ── GET /api/products/stock-alerts ───────────────────────────────

describe("GET /api/products/stock-alerts", () => {
  it("retorna 401 sem token", async () => {
    const res = await request(app).get("/api/products/stock-alerts");
    expect(res.status).toBe(401);
  });

  it("retorna alertas de estoque com auth", async () => {
    const res = await request(app)
      .get("/api/products/stock-alerts")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);

    expect(res.body).toHaveProperty("sem_estoque");
    expect(res.body).toHaveProperty("estoque_baixo");
    expect(res.body).toHaveProperty("valor_perdido");
    expect(res.body).toHaveProperty("custo_reposicao");
    expect(Array.isArray(res.body.sem_estoque)).toBe(true);
    expect(Array.isArray(res.body.estoque_baixo)).toBe(true);
    expect(res.body.valor_perdido).toBeDefined();
  });
});

// ── Segurança ────────────────────────────────────────────────────

describe("Segurança — products API", () => {
  it("rejeita JWT expirado", async () => {
    const expired = jwt.sign(
      { userId: "test", email: "test@test.com", papel: "admin" },
      JWT_SECRET,
      { expiresIn: "-1h" }
    );
    const res = await request(app)
      .get("/api/products")
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
      .get("/api/products")
      .set("Authorization", `Bearer ${bad}`);
    expect(res.status).toBe(401);
  });

  it("rejeita token malformado", async () => {
    const res = await request(app)
      .get("/api/products")
      .set("Authorization", "Bearer not.a.valid.jwt");
    expect(res.status).toBe(401);
  });
});
