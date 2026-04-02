import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { app } from "../server";
import { query } from "../db";
import crypto from "crypto";

// ── Helpers ──────────────────────────────────────────────────────

const BLING_SECRET = process.env.BLING_CLIENT_SECRET || "";
const NS_SECRET = process.env.NUVEMSHOP_CLIENT_SECRET || process.env.NUVEMSHOP_WEBHOOK_SECRET || "";
const RESEND_SECRET = process.env.RESEND_WEBHOOK_SECRET || "";

function blingSignature(payload: string): string {
  if (!BLING_SECRET) return "sha256=fakesig";
  const hash = crypto.createHmac("sha256", BLING_SECRET).update(payload).digest("hex");
  return `sha256=${hash}`;
}

function nuvemshopHmac(payload: string): string {
  if (!NS_SECRET) return "fakesig";
  return crypto.createHmac("sha256", NS_SECRET).update(payload).digest("hex");
}

// Cleanup logs gerados pelos testes
afterAll(async () => {
  await query(
    "DELETE FROM sync.sync_logs WHERE tipo LIKE 'webhook:vitest-%' OR tipo LIKE 'webhook:unknown.vitest%'",
  );
});

// ═══════════════════════════════════════════════════════════════
// RESEND WEBHOOK
// ═══════════════════════════════════════════════════════════════

describe("POST /api/webhooks/resend", () => {
  it("retorna 400 sem body/payload válido (type ou email_id faltando)", async () => {
    const res = await request(app)
      .post("/api/webhooks/resend")
      .send({});
    // Sem RESEND_WEBHOOK_SECRET → aceita sem assinatura, mas payload inválido → 400
    if (RESEND_SECRET) {
      // Com secret configurado, sem headers svix → 401
      expect([400, 401]).toContain(res.status);
    } else {
      expect(res.status).toBe(400);
    }
  });

  it("retorna 401 sem headers Svix quando secret está configurado", async () => {
    if (!RESEND_SECRET) return; // pula se sem secret (dev)
    const res = await request(app)
      .post("/api/webhooks/resend")
      .send({ type: "email.opened", data: { email_id: "test-123" } });
    expect(res.status).toBe(401);
  });

  it("retorna 401 com assinatura Svix inválida quando secret está configurado", async () => {
    if (!RESEND_SECRET) return;
    const res = await request(app)
      .post("/api/webhooks/resend")
      .set("svix-id", "msg_vitest123")
      .set("svix-timestamp", String(Math.floor(Date.now() / 1000)))
      .set("svix-signature", "v1,invalidbase64signature==")
      .send({ type: "email.opened", data: { email_id: "test-123" } });
    expect(res.status).toBe(401);
  });

  it("retorna 401 com timestamp expirado (> 5 min) quando secret está configurado", async () => {
    if (!RESEND_SECRET) return;
    const expiredTs = String(Math.floor(Date.now() / 1000) - 600); // 10 min atrás
    const res = await request(app)
      .post("/api/webhooks/resend")
      .set("svix-id", "msg_vitest_expired")
      .set("svix-timestamp", expiredTs)
      .set("svix-signature", "v1,dGVzdA==")
      .send({ type: "email.opened", data: { email_id: "test-456" } });
    expect(res.status).toBe(401);
  });

  it("retorna 200 com payload válido mas message_id desconhecido (não crasheia)", async () => {
    // Se RESEND_SECRET não está configurado, aceita sem assinatura
    if (RESEND_SECRET) return; // pula em produção (precisaria assinar corretamente)
    const res = await request(app)
      .post("/api/webhooks/resend")
      .send({
        type: "email.opened",
        created_at: new Date().toISOString(),
        data: {
          email_id: "vitest-unknown-message-id",
          from: "test@test.com",
          to: ["dest@test.com"],
          subject: "Teste",
        },
      });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("received", true);
  });

  it("body vazio → erro", async () => {
    const res = await request(app)
      .post("/api/webhooks/resend")
      .set("Content-Type", "application/json")
      .send("");
    // Body vazio → Express parse como {} ou falha
    expect([400, 401, 500]).toContain(res.status);
  });
});

// ═══════════════════════════════════════════════════════════════
// BLING WEBHOOK
// ═══════════════════════════════════════════════════════════════

describe("POST /api/webhooks/bling", () => {
  it("retorna 403 sem header X-Bling-Signature-256", async () => {
    const res = await request(app)
      .post("/api/webhooks/bling")
      .send({ evento: "order.created", data: { id: "123" } });
    expect(res.status).toBe(403);
  });

  it("retorna 401 com assinatura HMAC inválida", async () => {
    const res = await request(app)
      .post("/api/webhooks/bling")
      .set("X-Bling-Signature-256", "sha256=0000000000000000000000000000000000000000000000000000000000000000")
      .send({ evento: "order.created", data: { id: "123" } });
    // Sem BLING_CLIENT_SECRET → validateBlingHMAC retorna false → 401
    // Com secret → assinatura errada → 401
    expect(res.status).toBe(401);
  });

  it("retorna 200 com assinatura válida e evento desconhecido (graceful)", async () => {
    if (!BLING_SECRET) return; // pula se sem secret
    const payload = JSON.stringify({ evento: "vitest.unknown.event", data: { id: "vitest-999" } });
    const sig = blingSignature(payload);
    const res = await request(app)
      .post("/api/webhooks/bling")
      .set("X-Bling-Signature-256", sig)
      .set("Content-Type", "application/json")
      .send(payload);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("ok", true);
  });

  it("lida graciosamente com evento sem data", async () => {
    if (!BLING_SECRET) return;
    const payload = JSON.stringify({ evento: "vitest.no.data" });
    const sig = blingSignature(payload);
    const res = await request(app)
      .post("/api/webhooks/bling")
      .set("X-Bling-Signature-256", sig)
      .set("Content-Type", "application/json")
      .send(payload);
    expect([200, 500]).toContain(res.status);
  });
});

// ═══════════════════════════════════════════════════════════════
// NUVEMSHOP WEBHOOK
// ═══════════════════════════════════════════════════════════════

describe("POST /api/webhooks/nuvemshop", () => {
  it("retorna 403 sem header X-LinkedStore-HMAC-SHA256", async () => {
    const res = await request(app)
      .post("/api/webhooks/nuvemshop")
      .send({ event: "order/created", id: "123", store_id: 7290881 });
    expect(res.status).toBe(403);
  });

  it("retorna 401 com HMAC inválido", async () => {
    const res = await request(app)
      .post("/api/webhooks/nuvemshop")
      .set("X-LinkedStore-HMAC-SHA256", "0000000000000000000000000000000000000000000000000000000000000000")
      .send({ event: "order/created", id: "123", store_id: 7290881 });
    expect(res.status).toBe(401);
  });

  it("retorna 200 com HMAC válido para evento conhecido", async () => {
    if (!NS_SECRET) return; // pula se sem secret
    const payload = JSON.stringify({ event: "order/created", id: "vitest-ns-000", store_id: 7290881 });
    const hmac = nuvemshopHmac(payload);
    const res = await request(app)
      .post("/api/webhooks/nuvemshop")
      .set("X-LinkedStore-HMAC-SHA256", hmac)
      .set("Content-Type", "application/json")
      .send(payload);
    // Pode retornar 200 ou 500 (se falha ao buscar detalhe na API NuvemShop)
    // O importante é que não retorna 401/403 (auth passou)
    expect([200, 500]).toContain(res.status);
  });
});
