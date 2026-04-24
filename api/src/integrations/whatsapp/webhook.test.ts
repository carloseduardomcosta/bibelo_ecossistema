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
const TEST_ID_C = "eeeeeeee-0000-4000-a000-000000000093"; // 9º dígito: CRM com 9, WAHA sem 9
const TEST_ID_D = "eeeeeeee-0000-4000-a000-000000000094"; // 9º dígito: CRM sem 9, WAHA com 9

// DDI 55 + DDD 00 = jamais um número real brasileiro
const PHONE_A_DB    = "5500099901001"; // como salvo no banco (com DDI)
const PHONE_A_WAHA  = "5500099901001@s.whatsapp.net"; // como WAHA envia (phoneNumber)
const PHONE_B_DB    = "00099901002";   // salvo sem DDI — testa matching flexível
const PHONE_B_WAHA  = "5500099901002@s.whatsapp.net";
const PHONE_UNKNOWN = "5500099909999@s.whatsapp.net"; // não existe no CRM

// Cenário 9º dígito: CRM armazena COM 9, WAHA envia SEM 9 (conta antiga WhatsApp)
const PHONE_C_DB   = "5500912345678"; // CRM: 13 dígitos (com 9)
const PHONE_C_WAHA = "550012345678@s.whatsapp.net"; // WAHA: 12 dígitos (sem 9)

// Cenário inverso: CRM sem 9, WAHA com 9
const PHONE_D_DB   = "550087654321"; // CRM: 12 dígitos (sem 9)
const PHONE_D_WAHA = "5500987654321@s.whatsapp.net"; // WAHA: 13 dígitos (com 9)

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

  await query("DELETE FROM crm.notificacoes_operador WHERE customer_id IN ($1,$2,$3,$4)", [TEST_ID_A, TEST_ID_B, TEST_ID_C, TEST_ID_D]);
  await query("DELETE FROM crm.customers WHERE id IN ($1,$2,$3,$4)", [TEST_ID_A, TEST_ID_B, TEST_ID_C, TEST_ID_D]);
  await query(
    `INSERT INTO crm.customers (id, nome, email, telefone, vip_grupo_wp, vip_grupo_wp_em)
     VALUES
       ($1, 'Vitest WAHA A', 'vitest-waha-a@test.bibelo.internal', $5, NULL, NULL),
       ($2, 'Vitest WAHA B', 'vitest-waha-b@test.bibelo.internal', $6, NULL, NULL),
       ($3, 'Vitest WAHA C (CRM com 9)', 'vitest-waha-c@test.bibelo.internal', $7, NULL, NULL),
       ($4, 'Vitest WAHA D (CRM sem 9)', 'vitest-waha-d@test.bibelo.internal', $8, NULL, NULL)`,
    [TEST_ID_A, TEST_ID_B, TEST_ID_C, TEST_ID_D, PHONE_A_DB, PHONE_B_DB, PHONE_C_DB, PHONE_D_DB],
  );
});

afterAll(async () => {
  await query("DELETE FROM crm.notificacoes_operador WHERE customer_id IN ($1,$2,$3,$4)", [TEST_ID_A, TEST_ID_B, TEST_ID_C, TEST_ID_D]);
  await query("DELETE FROM crm.customers WHERE id IN ($1,$2,$3,$4)", [TEST_ID_A, TEST_ID_B, TEST_ID_C, TEST_ID_D]);
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

describe("POST /api/webhooks/waha — compatibilidade 9º dígito Brasil", () => {
  beforeAll(async () => {
    await query(
      "UPDATE crm.customers SET vip_grupo_wp = NULL, vip_grupo_wp_em = NULL WHERE id IN ($1,$2)",
      [TEST_ID_C, TEST_ID_D],
    );
  });

  it("identifica cliente cujo CRM tem 9 mas WAHA envia sem 9 (conta antiga)", async () => {
    // CRM: 5500912345678 (13 dígitos, com 9)
    // WAHA envia: 550012345678 (12 dígitos, sem 9)
    await request(app)
      .post("/api/webhooks/waha")
      .send(payload("add", [{ id: "550012345678@c.us", phoneNumber: PHONE_C_WAHA }]));

    await new Promise(r => setTimeout(r, 80));
    expect(await vipStatus(TEST_ID_C)).toBe(true);
  });

  it("identifica cliente cujo CRM não tem 9 mas WAHA envia com 9", async () => {
    // CRM: 550087654321 (12 dígitos, sem 9)
    // WAHA envia: 5500987654321 (13 dígitos, com 9)
    await request(app)
      .post("/api/webhooks/waha")
      .send(payload("add", [{ id: "5500987654321@c.us", phoneNumber: PHONE_D_WAHA }]));

    await new Promise(r => setTimeout(r, 80));
    expect(await vipStatus(TEST_ID_D)).toBe(true);
  });

  it("remove corretamente usando variante sem 9", async () => {
    await request(app)
      .post("/api/webhooks/waha")
      .send(payload("remove", [{ id: "550012345678@c.us", phoneNumber: PHONE_C_WAHA }]));

    await new Promise(r => setTimeout(r, 80));
    expect(await vipStatus(TEST_ID_C)).toBe(false);
  });
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
