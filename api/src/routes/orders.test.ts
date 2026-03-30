import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { app } from "../server";
import { queryOne } from "../db";

const JWT_SECRET = process.env.JWT_SECRET || "test-secret-fallback";
let authToken = "";

beforeAll(async () => {
  // Busca um usuário real para gerar token
  const user = await queryOne<{ id: string }>("SELECT id FROM public.users LIMIT 1");
  if (user) {
    authToken = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "1h" });
  }
});

describe("GET /api/orders (autenticado)", () => {
  it("retorna 401 sem token", async () => {
    const res = await request(app).get("/api/orders");
    expect(res.status).toBe(401);
  });

  it("retorna lista paginada com token válido", async () => {
    if (!authToken) return;
    const res = await request(app)
      .get("/api/orders?page=1&periodo=30d")
      .set("Authorization", `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("orders");
    expect(res.body).toHaveProperty("pagination");
    expect(Array.isArray(res.body.orders)).toBe(true);
    expect(res.body.pagination).toHaveProperty("total");
    expect(res.body.pagination).toHaveProperty("pages");
  });

  it("filtra por canal", async () => {
    if (!authToken) return;
    const res = await request(app)
      .get("/api/orders?canal=fisico")
      .set("Authorization", `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    for (const order of res.body.orders) {
      expect(order.canal).toBe("fisico");
    }
  });

  it("busca por texto funciona", async () => {
    if (!authToken) return;
    const res = await request(app)
      .get("/api/orders?search=000")
      .set("Authorization", `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.orders)).toBe(true);
  });
});

describe("GET /api/orders/stats (autenticado)", () => {
  it("retorna 401 sem token", async () => {
    const res = await request(app).get("/api/orders/stats");
    expect(res.status).toBe(401);
  });

  it("retorna KPIs com token válido", async () => {
    if (!authToken) return;
    const res = await request(app)
      .get("/api/orders/stats?dias=30")
      .set("Authorization", `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("total_pedidos");
    expect(res.body).toHaveProperty("receita");
    expect(res.body).toHaveProperty("ticket_medio");
  });
});

describe("GET /api/orders/:id (autenticado)", () => {
  it("retorna 401 sem token", async () => {
    const res = await request(app).get("/api/orders/00000000-0000-0000-0000-000000000000");
    expect(res.status).toBe(401);
  });

  it("retorna 404 para pedido inexistente", async () => {
    if (!authToken) return;
    const res = await request(app)
      .get("/api/orders/00000000-0000-0000-0000-000000000000")
      .set("Authorization", `Bearer ${authToken}`);
    expect(res.status).toBe(404);
  });

  it("retorna detalhe com itens e parcelas para pedido real", async () => {
    if (!authToken) return;
    // Busca um pedido real
    const order = await queryOne<{ id: string }>(
      "SELECT id FROM sync.bling_orders WHERE itens != '[]'::jsonb LIMIT 1"
    );
    if (!order) return;

    const res = await request(app)
      .get(`/api/orders/${order.id}`)
      .set("Authorization", `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("itens_detalhados");
    expect(res.body).toHaveProperty("custo_total");
    expect(res.body).toHaveProperty("lucro_estimado");
    expect(res.body).toHaveProperty("margem_percentual");
    expect(Array.isArray(res.body.itens_detalhados)).toBe(true);
    expect(res.body.itens_detalhados.length).toBeGreaterThan(0);
  });
});
