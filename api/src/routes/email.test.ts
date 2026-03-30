import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../server";
import crypto from "crypto";

const JWT_SECRET = process.env.JWT_SECRET || "bibelo-unsub-fallback";

function gerarToken(email: string): string {
  return crypto.createHmac("sha256", JWT_SECRET).update("email-unsub:" + email.toLowerCase().trim()).digest("hex");
}

describe("GET /api/email/unsubscribe", () => {
  it("retorna 400 sem parâmetros", async () => {
    const res = await request(app).get("/api/email/unsubscribe");
    expect(res.status).toBe(400);
  });

  it("retorna 400 sem token", async () => {
    const res = await request(app).get("/api/email/unsubscribe?email=test@example.com");
    expect(res.status).toBe(400);
  });

  it("retorna 403 com token inválido", async () => {
    const token = "a".repeat(64); // tamanho correto mas conteúdo errado
    const res = await request(app).get(`/api/email/unsubscribe?email=test@example.com&token=${token}`);
    expect(res.status).toBe(403);
  });

  it("retorna 403 com token de tamanho diferente", async () => {
    const res = await request(app).get("/api/email/unsubscribe?email=test@example.com&token=short");
    expect(res.status).toBe(403);
  });

  it("retorna 200 com token válido para email inexistente (não revela existência)", async () => {
    const email = "nao-existe-teste-unitario@example.com";
    const token = gerarToken(email);
    const res = await request(app).get(`/api/email/unsubscribe?email=${encodeURIComponent(email)}&token=${token}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain("Descadastrado com sucesso");
  });

  it("não contém XSS no email renderizado", async () => {
    const email = '<script>alert(1)</script>@example.com';
    const token = gerarToken(email);
    const res = await request(app).get(`/api/email/unsubscribe?email=${encodeURIComponent(email)}&token=${token}`);
    // Não deve conter o script bruto
    expect(res.text).not.toContain("<script>");
  });
});
