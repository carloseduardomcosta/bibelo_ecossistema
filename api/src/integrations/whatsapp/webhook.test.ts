/**
 * Testes do webhook WAHA — group.v2.participants
 *
 * Clientes de teste com telefone no DDD 00 (código inexistente no Brasil).
 * Nenhum dado real é tocado.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../../server";
import { query } from "../../db";

// ── Fixtures ──────────────────────────────────────────────────────

const TEST_ID_A = "eeeeeeee-0000-4000-a000-000000000091";
const TEST_ID_B = "eeeeeeee-0000-4000-a000-000000000092";

// DDI 55 + DDD 00 = jamais um número real brasileiro
const PHONE_A_DB    = "5500099901001"; // como salvo no banco (com DDI)
const PHONE_A_WAHA  = "5500099901001@s.whatsapp.net"; // como WAHA envia (phoneNumber)
const PHONE_B_DB    = "00099901002";   // salvo sem DDI — testa matching flexível
const PHONE_B_WAHA  = "5500099901002@s.whatsapp.net";
const PHONE_UNKNOWN = "5500099909999@s.whatsapp.net"; // não existe no CRM

const GRUPO_VIP_JID = "120363000000000099@g.us"; // JID de teste (grupo fictício)
const OUTRO_JID     = "120363000000000001@g.us"; // outro grupo — deve ser ignorado

function payload(
  action: string,
  participants: Array<{ id: string; phoneNumber?: string }>,
  grupoJid = GRUPO_VIP_JID,
) {
  return {
    event:   "group.v2.participants",
    session: "default",
    payload: { id: grupoJid, action, participants },
  };
}

// ── Setup / teardown ──────────────────────────────────────────────

beforeAll(async () => {
  process.env.WAHA_GRUPO_VIP_JID    = GRUPO_VIP_JID;
  process.env.WAHA_WEBHOOK_HMAC_KEY = ""; // sem HMAC em testes

  await query("DELETE FROM crm.customers WHERE id IN ($1,$2)", [TEST_ID_A, TEST_ID_B]);
  await query(
    `INSERT INTO crm.customers (id, nome, email, telefone, vip_grupo_wp, vip_grupo_wp_em)
     VALUES
       ($1, 'Vitest WAHA A', 'vitest-waha-a@test.bibelo.internal', $3, NULL, NULL),
       ($2, 'Vitest WAHA B', 'vitest-waha-b@test.bibelo.internal', $4, NULL, NULL)`,
    [TEST_ID_A, TEST_ID_B, PHONE_A_DB, PHONE_B_DB],
  );
});

afterAll(async () => {
  await query("DELETE FROM crm.customers WHERE id IN ($1,$2)", [TEST_ID_A, TEST_ID_B]);
});

async function vipStatus(id: string): Promise<boolean | null> {
  const row = await query<{ vip_grupo_wp: boolean | null }>(
    "SELECT vip_grupo_wp FROM crm.customers WHERE id = $1",
    [id],
  );
  return row[0]?.vip_grupo_wp ?? null;
}

// ── Testes ────────────────────────────────────────────────────────

describe("POST /api/webhooks/waha — autenticação e estrutura", () => {
  it("retorna 200 com { ok: true } para payload válido", async () => {
    const res = await request(app)
      .post("/api/webhooks/waha")
      .send(payload("add", [{ id: "5500099901001@c.us", phoneNumber: PHONE_A_WAHA }]));
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("retorna 401 quando HMAC configurado mas header ausente", async () => {
    process.env.WAHA_WEBHOOK_HMAC_KEY = "secret-de-teste";
    const res = await request(app)
      .post("/api/webhooks/waha")
      .send(payload("add", [{ id: "5500099901001@c.us" }]));
    expect(res.status).toBe(401);
    process.env.WAHA_WEBHOOK_HMAC_KEY = "";
  });

  it("retorna 401 quando HMAC configurado e header inválido", async () => {
    process.env.WAHA_WEBHOOK_HMAC_KEY = "secret-de-teste";
    const res = await request(app)
      .post("/api/webhooks/waha")
      .set("x-webhook-hmac-token", "token-invalido")
      .send(payload("add", [{ id: "5500099901001@c.us" }]));
    expect(res.status).toBe(401);
    process.env.WAHA_WEBHOOK_HMAC_KEY = "";
  });

  it("ignora evento que não é group.v2.participants", async () => {
    const res = await request(app)
      .post("/api/webhooks/waha")
      .send({ event: "message.received", session: "default", payload: {} });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("ignora evento de grupo diferente do VIP", async () => {
    await query(
      "UPDATE crm.customers SET vip_grupo_wp = NULL WHERE id = $1",
      [TEST_ID_A],
    );
    await request(app)
      .post("/api/webhooks/waha")
      .send(payload("add", [{ id: "5500099901001@c.us", phoneNumber: PHONE_A_WAHA }], OUTRO_JID));

    const vip = await vipStatus(TEST_ID_A);
    expect(vip).toBeNull(); // não deve ter sido alterado
  });
});

describe("POST /api/webhooks/waha — action: add (entrou no grupo)", () => {
  beforeAll(async () => {
    await query(
      "UPDATE crm.customers SET vip_grupo_wp = NULL, vip_grupo_wp_em = NULL WHERE id IN ($1,$2)",
      [TEST_ID_A, TEST_ID_B],
    );
  });

  it("marca vip_grupo_wp = true para cliente com telefone no formato com DDI", async () => {
    await request(app)
      .post("/api/webhooks/waha")
      .send(payload("add", [{ id: "5500099901001@c.us", phoneNumber: PHONE_A_WAHA }]));

    await new Promise(r => setTimeout(r, 50)); // pequeno delay para o bg processar
    expect(await vipStatus(TEST_ID_A)).toBe(true);
  });

  it("marca vip_grupo_wp = true para cliente com telefone sem DDI no banco", async () => {
    await request(app)
      .post("/api/webhooks/waha")
      .send(payload("add", [{ id: "5500099901002@c.us", phoneNumber: PHONE_B_WAHA }]));

    await new Promise(r => setTimeout(r, 50));
    expect(await vipStatus(TEST_ID_B)).toBe(true);
  });

  it("ignora número não cadastrado no CRM sem afetar outros clientes", async () => {
    const antes = await vipStatus(TEST_ID_A);
    await request(app)
      .post("/api/webhooks/waha")
      .send(payload("add", [{ id: "5500099909999@c.us", phoneNumber: PHONE_UNKNOWN }]));

    await new Promise(r => setTimeout(r, 50));
    expect(await vipStatus(TEST_ID_A)).toBe(antes); // inalterado
  });
});

describe("POST /api/webhooks/waha — action: remove (saiu do grupo)", () => {
  beforeAll(async () => {
    // Garantir que ambos estão VIP antes de testar remoção
    await query(
      "UPDATE crm.customers SET vip_grupo_wp = true WHERE id IN ($1,$2)",
      [TEST_ID_A, TEST_ID_B],
    );
  });

  it("marca vip_grupo_wp = false quando participante sai do grupo", async () => {
    await request(app)
      .post("/api/webhooks/waha")
      .send(payload("remove", [{ id: "5500099901001@c.us", phoneNumber: PHONE_A_WAHA }]));

    await new Promise(r => setTimeout(r, 50));
    expect(await vipStatus(TEST_ID_A)).toBe(false);
  });

  it("processa múltiplos participantes de uma vez", async () => {
    await request(app)
      .post("/api/webhooks/waha")
      .send(
        payload("remove", [
          { id: "5500099901001@c.us", phoneNumber: PHONE_A_WAHA },
          { id: "5500099901002@c.us", phoneNumber: PHONE_B_WAHA },
        ]),
      );

    await new Promise(r => setTimeout(r, 50));
    expect(await vipStatus(TEST_ID_A)).toBe(false);
    expect(await vipStatus(TEST_ID_B)).toBe(false);
  });
});

describe("POST /api/webhooks/waha — actions ignoradas (sem efeito)", () => {
  beforeAll(async () => {
    await query(
      "UPDATE crm.customers SET vip_grupo_wp = true WHERE id = $1",
      [TEST_ID_A],
    );
  });

  it.each(["promote", "demote"])(
    "action '%s' não altera vip_grupo_wp (muda só papel de admin)",
    async (action) => {
      const antes = await vipStatus(TEST_ID_A);
      await request(app)
        .post("/api/webhooks/waha")
        .send(payload(action, [{ id: "5500099901001@c.us", phoneNumber: PHONE_A_WAHA }]));

      await new Promise(r => setTimeout(r, 50));
      expect(await vipStatus(TEST_ID_A)).toBe(antes); // inalterado
    },
  );
});

describe("POST /api/webhooks/waha — segurança", () => {
  it("rejeita payload sem campo event", async () => {
    const res = await request(app)
      .post("/api/webhooks/waha")
      .send({ session: "default" });
    expect(res.status).toBe(200); // ignora silenciosamente, não retorna erro
    expect(res.body.ok).toBe(true);
  });

  it("não quebra com participants vazio", async () => {
    const res = await request(app)
      .post("/api/webhooks/waha")
      .send(payload("add", []));
    expect(res.status).toBe(200);
  });

  it("não quebra com participante sem id nem phoneNumber válido", async () => {
    const res = await request(app)
      .post("/api/webhooks/waha")
      .send(
        payload("add", [{ id: "invalido@lid", phoneNumber: undefined }]),
      );
    expect(res.status).toBe(200);
  });

  it("resiste a body vazio", async () => {
    const res = await request(app)
      .post("/api/webhooks/waha")
      .send({});
    expect(res.status).toBe(200);
  });
});
