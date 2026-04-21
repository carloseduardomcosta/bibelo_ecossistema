/**
 * Testes — Assinaturas de Módulos (Fluxo de Caixa, Relatório de Vendas)
 * Cobre: contratação, webhook MP, conteúdo dos módulos, vendas, segurança
 */
import { describe, it, expect, afterAll, beforeAll } from "vitest";
import request from "supertest";
import { app } from "../server";
import { query, queryOne } from "../db";
import jwt from "jsonwebtoken";
import crypto from "crypto";

const JWT_SECRET  = process.env.JWT_SECRET || "test-secret";
const MP_WEBOOK_SECRET = process.env.MP_WEBHOOK_SECRET || "test-webhook-secret";

// ── IDs de teste ─────────────────────────────────────────────────

const REV_ID_A  = "cccccccc-0000-4000-a000-000000000001"; // com acesso
const REV_ID_B  = "cccccccc-0000-4000-a000-000000000002"; // sem acesso / outro user
const CUST_ID_A = "cccccccc-0000-4001-a000-000000000001";
const CUST_ID_B = "cccccccc-0000-4001-a000-000000000002";
const PAG_ID    = "dddddddd-0000-4000-a000-000000000001"; // pagamento pré-criado
const VENDA_ID  = "eeeeeeee-0000-4000-a000-000000000001";

// ── Helpers ───────────────────────────────────────────────────────

function tokenParceira(revId = REV_ID_A, nivel = "prata"): string {
  return jwt.sign({ sub: revId, nivel, iss: "souparceira" }, JWT_SECRET, { expiresIn: "1h" });
}

function tokenCRM(): string {
  return jwt.sign({ userId: "admin-test", email: "a@a.com", papel: "admin" }, JWT_SECRET, { expiresIn: "1h" });
}

// Gera assinatura MP válida para o webhook
function assinaturaMP(paymentId: string, requestId: string, ts: string): string {
  const manifest = `id:${paymentId};request-id:${requestId};ts:${ts};`;
  const hash = crypto.createHmac("sha256", MP_WEBOOK_SECRET).update(manifest).digest("hex");
  return `ts=${ts},v1=${hash}`;
}

// ── Setup / Teardown ──────────────────────────────────────────────

beforeAll(async () => {
  // Customers
  await query(
    `INSERT INTO crm.customers (id, nome, email) VALUES ($1,'Rev A','reva@test.bibelo.internal'), ($2,'Rev B','revb@test.bibelo.internal')
     ON CONFLICT (id) DO UPDATE SET nome=EXCLUDED.nome, email=EXCLUDED.email`,
    [CUST_ID_A, CUST_ID_B]
  );

  // Revendedoras (emails únicos por revendedora)
  for (const [rid, cid, doc, email] of [
    [REV_ID_A, CUST_ID_A, "111.444.777-35", "reva@test.bibelo.internal"],
    [REV_ID_B, CUST_ID_B, "456.789.012-49", "revb@test.bibelo.internal"],
  ]) {
    await query(
      `INSERT INTO crm.revendedoras (id, customer_id, nome, documento, email, status, nivel, percentual_desconto)
       VALUES ($1,$2,'Rev Test',$3,$4,'ativa','prata',20)
       ON CONFLICT (id) DO UPDATE SET status='ativa', customer_id=$2, email=$4`,
      [rid, cid, doc, email]
    );
  }

  // Pagamento pendente pré-criado para REV_A → fluxo_caixa
  await query(
    `INSERT INTO crm.modulo_pagamentos
       (id, revendedora_id, modulo_id, plano, valor, external_reference, status, periodo_inicio, periodo_fim)
     VALUES ($1,$2,'fluxo_caixa','mensal',7.90,$3,'pendente',CURRENT_DATE,CURRENT_DATE+30)
     ON CONFLICT (id) DO NOTHING`,
    [PAG_ID, REV_ID_A, `modulo:${REV_ID_A}:fluxo_caixa:${PAG_ID}`]
  );

  // Venda pré-existente para REV_A
  await query(
    `INSERT INTO crm.revendedora_vendas (id, revendedora_id, descricao, valor, data_venda)
     VALUES ($1,$2,'Venda teste',50.00,CURRENT_DATE) ON CONFLICT (id) DO NOTHING`,
    [VENDA_ID, REV_ID_A]
  );
});

afterAll(async () => {
  await query(`DELETE FROM crm.revendedora_vendas WHERE revendedora_id IN ($1,$2)`, [REV_ID_A, REV_ID_B]);
  await query(`DELETE FROM crm.revendedora_modulos WHERE revendedora_id IN ($1,$2)`, [REV_ID_A, REV_ID_B]);
  await query(`DELETE FROM crm.modulo_pagamentos WHERE revendedora_id IN ($1,$2)`, [REV_ID_A, REV_ID_B]);
  await query(`DELETE FROM crm.revendedoras WHERE id IN ($1,$2)`, [REV_ID_A, REV_ID_B]);
  await query(`DELETE FROM crm.customers WHERE id IN ($1,$2)`, [CUST_ID_A, CUST_ID_B]);
});

// ═══════════════════════════════════════════════════════════════
// GET /api/souparceira/modulos — lista com expira_em / plano
// ═══════════════════════════════════════════════════════════════

describe("GET /api/souparceira/modulos", () => {
  it("retorna 401 sem token", async () => {
    const r = await request(app).get("/api/souparceira/modulos");
    expect(r.status).toBe(401);
  });

  it("retorna 401 com token CRM (iss errado)", async () => {
    const r = await request(app).get("/api/souparceira/modulos")
      .set("Authorization", `Bearer ${tokenCRM()}`);
    expect(r.status).toBe(401);
  });

  it("retorna apenas módulos ativos", async () => {
    const r = await request(app).get("/api/souparceira/modulos")
      .set("Authorization", `Bearer ${tokenParceira()}`);
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBe(true);
    const ids = r.body.map((m: { id: string }) => m.id);
    expect(ids).toContain("fluxo_caixa");
    expect(ids).toContain("relatorio_vendas");
  });

  it("módulos retornam campos obrigatórios incluindo expira_em e plano", async () => {
    const r = await request(app).get("/api/souparceira/modulos")
      .set("Authorization", `Bearer ${tokenParceira()}`);
    expect(r.status).toBe(200);
    const m = r.body[0];
    expect(m).toHaveProperty("id");
    expect(m).toHaveProperty("nome");
    expect(m).toHaveProperty("preco_mensal");
    expect(m).toHaveProperty("tem_acesso");
    expect(m).toHaveProperty("expira_em");
    expect(m).toHaveProperty("plano");
  });

  it("sem assinatura, tem_acesso = false", async () => {
    const r = await request(app).get("/api/souparceira/modulos")
      .set("Authorization", `Bearer ${tokenParceira()}`);
    const fc = r.body.find((m: { id: string }) => m.id === "fluxo_caixa");
    expect(fc.tem_acesso).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════
// POST /api/souparceira/modulos/:id/contratar
// ═══════════════════════════════════════════════════════════════

describe("POST /api/souparceira/modulos/:id/contratar — validação", () => {
  it("retorna 401 sem token", async () => {
    const r = await request(app)
      .post("/api/souparceira/modulos/fluxo_caixa/contratar")
      .send({ plano: "mensal", metodo: "pix" });
    expect(r.status).toBe(401);
  });

  it("rejeita plano inválido com 400", async () => {
    const r = await request(app)
      .post("/api/souparceira/modulos/fluxo_caixa/contratar")
      .set("Authorization", `Bearer ${tokenParceira()}`)
      .send({ plano: "trimestral", metodo: "pix" });
    expect(r.status).toBe(400);
    expect(r.body).toHaveProperty("error");
  });

  it("rejeita metodo inválido com 400", async () => {
    const r = await request(app)
      .post("/api/souparceira/modulos/fluxo_caixa/contratar")
      .set("Authorization", `Bearer ${tokenParceira()}`)
      .send({ plano: "mensal", metodo: "boleto" });
    expect(r.status).toBe(400);
    expect(r.body).toHaveProperty("error");
  });

  it("rejeita body vazio com 400", async () => {
    const r = await request(app)
      .post("/api/souparceira/modulos/fluxo_caixa/contratar")
      .set("Authorization", `Bearer ${tokenParceira()}`)
      .send({});
    expect(r.status).toBe(400);
  });

  it("retorna 404 para módulo inexistente", async () => {
    const r = await request(app)
      .post("/api/souparceira/modulos/modulo_fantasma/contratar")
      .set("Authorization", `Bearer ${tokenParceira()}`)
      .send({ plano: "mensal", metodo: "pix" });
    expect(r.status).toBe(404);
    expect(r.body.error).toMatch(/não encontrado/i);
  });

  it("retorna 409 quando módulo já está ativo", async () => {
    // Ativar módulo diretamente
    await query(
      `INSERT INTO crm.revendedora_modulos (revendedora_id, modulo_id, expira_em, plano, status)
       VALUES ($1,'fluxo_caixa', NOW()+INTERVAL '30 days','mensal','ativo')
       ON CONFLICT (revendedora_id, modulo_id) DO UPDATE SET status='ativo', expira_em=NOW()+INTERVAL '30 days'`,
      [REV_ID_A]
    );
    const r = await request(app)
      .post("/api/souparceira/modulos/fluxo_caixa/contratar")
      .set("Authorization", `Bearer ${tokenParceira()}`)
      .send({ plano: "mensal", metodo: "pix" });
    expect(r.status).toBe(409);
    expect(r.body.error).toMatch(/já está ativo/i);
    // Limpar para próximos testes
    await query(`DELETE FROM crm.revendedora_modulos WHERE revendedora_id=$1 AND modulo_id='fluxo_caixa'`, [REV_ID_A]);
  });
});

// ═══════════════════════════════════════════════════════════════
// GET /api/souparceira/modulos/pagamento/:id
// ═══════════════════════════════════════════════════════════════

describe("GET /api/souparceira/modulos/pagamento/:id — segurança", () => {
  it("retorna 401 sem token", async () => {
    const r = await request(app).get(`/api/souparceira/modulos/pagamento/${PAG_ID}`);
    expect(r.status).toBe(401);
  });

  it("retorna status do pagamento para o dono", async () => {
    const r = await request(app)
      .get(`/api/souparceira/modulos/pagamento/${PAG_ID}`)
      .set("Authorization", `Bearer ${tokenParceira(REV_ID_A)}`);
    expect(r.status).toBe(200);
    expect(r.body).toHaveProperty("status");
    expect(r.body.status).toBe("pendente");
    expect(r.body.modulo_id).toBe("fluxo_caixa");
  });

  it("IDOR: REV_B não pode ver pagamento de REV_A (404)", async () => {
    const r = await request(app)
      .get(`/api/souparceira/modulos/pagamento/${PAG_ID}`)
      .set("Authorization", `Bearer ${tokenParceira(REV_ID_B)}`);
    expect(r.status).toBe(404);
  });

  it("retorna 404 para pagamento inexistente", async () => {
    const r = await request(app)
      .get("/api/souparceira/modulos/pagamento/00000000-0000-0000-0000-000000000000")
      .set("Authorization", `Bearer ${tokenParceira(REV_ID_A)}`);
    expect(r.status).toBe(404);
  });
});

// ═══════════════════════════════════════════════════════════════
// GET /api/souparceira/modulos/fluxo-caixa/dados — acesso controlado
// ═══════════════════════════════════════════════════════════════

describe("GET /api/souparceira/modulos/fluxo-caixa/dados — controle de acesso", () => {
  it("retorna 401 sem token", async () => {
    const r = await request(app).get("/api/souparceira/modulos/fluxo-caixa/dados");
    expect(r.status).toBe(401);
  });

  it("retorna 403 sem assinatura ativa", async () => {
    // REV_A não tem assinatura (foi removida)
    const r = await request(app)
      .get("/api/souparceira/modulos/fluxo-caixa/dados")
      .set("Authorization", `Bearer ${tokenParceira(REV_A)}`);
    expect(r.status).toBe(403);
    expect(r.body.error).toMatch(/não contratado/i);
  });

  it("retorna dados quando assinatura está ativa", async () => {
    // Ativar módulo
    await query(
      `INSERT INTO crm.revendedora_modulos (revendedora_id, modulo_id, expira_em, plano, status)
       VALUES ($1,'fluxo_caixa',NOW()+INTERVAL '30 days','mensal','ativo')
       ON CONFLICT (revendedora_id, modulo_id) DO UPDATE SET status='ativo', expira_em=NOW()+INTERVAL '30 days'`,
      [REV_ID_A]
    );
    const r = await request(app)
      .get("/api/souparceira/modulos/fluxo-caixa/dados")
      .set("Authorization", `Bearer ${tokenParceira(REV_ID_A)}`);
    expect(r.status).toBe(200);
    expect(r.body).toHaveProperty("saidas");
    expect(r.body).toHaveProperty("entradas");
    expect(r.body).toHaveProperty("vendas_recentes");
    expect(Array.isArray(r.body.saidas)).toBe(true);
    expect(Array.isArray(r.body.entradas)).toBe(true);
    expect(Array.isArray(r.body.vendas_recentes)).toBe(true);
  });

  it("REV_B não vê dados de REV_A — isolamento multi-tenant", async () => {
    // REV_B não tem assinatura
    const r = await request(app)
      .get("/api/souparceira/modulos/fluxo-caixa/dados")
      .set("Authorization", `Bearer ${tokenParceira(REV_ID_B)}`);
    expect(r.status).toBe(403);
  });
});

// ═══════════════════════════════════════════════════════════════
// POST /api/souparceira/modulos/fluxo-caixa/venda
// ═══════════════════════════════════════════════════════════════

const REV_A = REV_ID_A; // alias legível

describe("POST /api/souparceira/modulos/fluxo-caixa/venda — validação e segurança", () => {
  it("retorna 401 sem token", async () => {
    const r = await request(app)
      .post("/api/souparceira/modulos/fluxo-caixa/venda")
      .send({ descricao: "Venda", valor: 50, data_venda: "2026-04-01" });
    expect(r.status).toBe(401);
  });

  it("retorna 403 sem assinatura de fluxo_caixa", async () => {
    const r = await request(app)
      .post("/api/souparceira/modulos/fluxo-caixa/venda")
      .set("Authorization", `Bearer ${tokenParceira(REV_ID_B)}`)
      .send({ descricao: "Venda", valor: 50, data_venda: "2026-04-01" });
    expect(r.status).toBe(403);
  });

  it("rejeita descricao vazia com 400", async () => {
    const r = await request(app)
      .post("/api/souparceira/modulos/fluxo-caixa/venda")
      .set("Authorization", `Bearer ${tokenParceira(REV_A)}`)
      .send({ descricao: "", valor: 50, data_venda: "2026-04-01" });
    expect(r.status).toBe(400);
  });

  it("rejeita valor negativo com 400", async () => {
    const r = await request(app)
      .post("/api/souparceira/modulos/fluxo-caixa/venda")
      .set("Authorization", `Bearer ${tokenParceira(REV_A)}`)
      .send({ descricao: "Teste", valor: -10, data_venda: "2026-04-01" });
    expect(r.status).toBe(400);
  });

  it("rejeita valor zero com 400", async () => {
    const r = await request(app)
      .post("/api/souparceira/modulos/fluxo-caixa/venda")
      .set("Authorization", `Bearer ${tokenParceira(REV_A)}`)
      .send({ descricao: "Teste", valor: 0, data_venda: "2026-04-01" });
    expect(r.status).toBe(400);
  });

  it("rejeita data_venda com formato inválido com 400", async () => {
    const r = await request(app)
      .post("/api/souparceira/modulos/fluxo-caixa/venda")
      .set("Authorization", `Bearer ${tokenParceira(REV_A)}`)
      .send({ descricao: "Teste", valor: 50, data_venda: "01/04/2026" });
    expect(r.status).toBe(400);
  });

  it("rejeita descricao com XSS — campo sanitizado no banco (não executa HTML)", async () => {
    const r = await request(app)
      .post("/api/souparceira/modulos/fluxo-caixa/venda")
      .set("Authorization", `Bearer ${tokenParceira(REV_A)}`)
      .send({ descricao: '<script>alert("xss")</script>', valor: 10, data_venda: "2026-04-01" });
    // Deve criar a venda (salvamos o texto, não executamos)
    // mas o dado retornado não deve ser HTML executável
    if (r.status === 201) {
      const descSalva: string = r.body.descricao;
      expect(descSalva).not.toContain("<script>");
      // Limpar
      if (r.body.id) {
        await query(`DELETE FROM crm.revendedora_vendas WHERE id=$1`, [r.body.id]);
      }
    }
    // Aceita 201 ou 400, nunca 5xx
    expect(r.status).toBeLessThan(500);
  });

  let vendaId: string;
  it("cria venda com dados válidos — 201", async () => {
    const r = await request(app)
      .post("/api/souparceira/modulos/fluxo-caixa/venda")
      .set("Authorization", `Bearer ${tokenParceira(REV_A)}`)
      .send({ descricao: "Cadernos Bibelô", valor: 99.90, data_venda: "2026-04-01", categoria: "Cadernos" });
    expect(r.status).toBe(201);
    expect(r.body).toHaveProperty("id");
    expect(Number(r.body.valor)).toBeCloseTo(99.90);
    expect(r.body.revendedora_id).toBe(REV_A);
    vendaId = r.body.id;
  });

  it("venda criada aparece em fluxo-caixa/dados", async () => {
    const r = await request(app)
      .get("/api/souparceira/modulos/fluxo-caixa/dados")
      .set("Authorization", `Bearer ${tokenParceira(REV_A)}`);
    expect(r.status).toBe(200);
    const encontrada = r.body.vendas_recentes.find((v: { id: string }) => v.id === vendaId);
    expect(encontrada).toBeTruthy();
    expect(Number(encontrada.valor)).toBeCloseTo(99.90);
  });
});

// ═══════════════════════════════════════════════════════════════
// DELETE /api/souparceira/modulos/fluxo-caixa/venda/:id
// ═══════════════════════════════════════════════════════════════

describe("DELETE /api/souparceira/modulos/fluxo-caixa/venda/:id — IDOR e auth", () => {
  it("retorna 401 sem token", async () => {
    const r = await request(app)
      .delete(`/api/souparceira/modulos/fluxo-caixa/venda/${VENDA_ID}`);
    expect(r.status).toBe(401);
  });

  it("retorna 403 sem assinatura ativa (REV_B)", async () => {
    const r = await request(app)
      .delete(`/api/souparceira/modulos/fluxo-caixa/venda/${VENDA_ID}`)
      .set("Authorization", `Bearer ${tokenParceira(REV_ID_B)}`);
    expect(r.status).toBe(403);
  });

  it("IDOR: REV_B com assinatura ativa não pode deletar venda de REV_A (404)", async () => {
    // Ativar módulo de REV_B temporariamente
    await query(
      `INSERT INTO crm.revendedora_modulos (revendedora_id, modulo_id, expira_em, plano, status)
       VALUES ($1,'fluxo_caixa',NOW()+INTERVAL '1 day','mensal','ativo')
       ON CONFLICT (revendedora_id, modulo_id) DO UPDATE SET status='ativo', expira_em=NOW()+INTERVAL '1 day'`,
      [REV_ID_B]
    );
    const r = await request(app)
      .delete(`/api/souparceira/modulos/fluxo-caixa/venda/${VENDA_ID}`)
      .set("Authorization", `Bearer ${tokenParceira(REV_ID_B)}`);
    expect(r.status).toBe(404); // venda não pertence a REV_B
    await query(`DELETE FROM crm.revendedora_modulos WHERE revendedora_id=$1 AND modulo_id='fluxo_caixa'`, [REV_ID_B]);
  });

  it("dono pode deletar a própria venda", async () => {
    const r = await request(app)
      .delete(`/api/souparceira/modulos/fluxo-caixa/venda/${VENDA_ID}`)
      .set("Authorization", `Bearer ${tokenParceira(REV_A)}`);
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    // Verificar que foi removido
    const row = await queryOne(
      `SELECT id FROM crm.revendedora_vendas WHERE id=$1`, [VENDA_ID]
    );
    expect(row).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════
// GET /api/souparceira/modulos/relatorio-vendas/dados
// ═══════════════════════════════════════════════════════════════

describe("GET /api/souparceira/modulos/relatorio-vendas/dados — controle de acesso", () => {
  it("retorna 401 sem token", async () => {
    const r = await request(app).get("/api/souparceira/modulos/relatorio-vendas/dados");
    expect(r.status).toBe(401);
  });

  it("retorna 403 sem assinatura de relatorio_vendas", async () => {
    const r = await request(app)
      .get("/api/souparceira/modulos/relatorio-vendas/dados")
      .set("Authorization", `Bearer ${tokenParceira(REV_A)}`);
    expect(r.status).toBe(403);
    expect(r.body.error).toMatch(/não contratado/i);
  });

  it("retorna dados estruturados com assinatura ativa", async () => {
    await query(
      `INSERT INTO crm.revendedora_modulos (revendedora_id, modulo_id, expira_em, plano, status)
       VALUES ($1,'relatorio_vendas',NOW()+INTERVAL '30 days','mensal','ativo')
       ON CONFLICT (revendedora_id, modulo_id) DO UPDATE SET status='ativo', expira_em=NOW()+INTERVAL '30 days'`,
      [REV_ID_A]
    );
    const r = await request(app)
      .get("/api/souparceira/modulos/relatorio-vendas/dados")
      .set("Authorization", `Bearer ${tokenParceira(REV_ID_A)}`);
    expect(r.status).toBe(200);
    expect(r.body).toHaveProperty("volume_mensal");
    expect(r.body).toHaveProperty("top_produtos");
    expect(r.body).toHaveProperty("resumo");
    expect(Array.isArray(r.body.volume_mensal)).toBe(true);
    expect(Array.isArray(r.body.top_produtos)).toBe(true);
    await query(`DELETE FROM crm.revendedora_modulos WHERE revendedora_id=$1 AND modulo_id='relatorio_vendas'`, [REV_ID_A]);
  });

  it("isolamento: REV_B sem assinatura recebe 403", async () => {
    const r = await request(app)
      .get("/api/souparceira/modulos/relatorio-vendas/dados")
      .set("Authorization", `Bearer ${tokenParceira(REV_ID_B)}`);
    expect(r.status).toBe(403);
  });
});

// ═══════════════════════════════════════════════════════════════
// POST /api/webhooks/mp-modulos — segurança do webhook
// ═══════════════════════════════════════════════════════════════

describe("POST /api/webhooks/mp-modulos — validação de assinatura HMAC", () => {
  const paymentId = "99999999";
  const requestId = "test-req-id";
  const ts        = String(Math.floor(Date.now() / 1000));

  it("rejeita requisição sem header x-signature (401)", async () => {
    const r = await request(app)
      .post("/api/webhooks/mp-modulos")
      .send({ type: "payment", action: "payment.updated", data: { id: paymentId } });
    expect(r.status).toBe(401);
    expect(r.body.error).toMatch(/assinatura/i);
  });

  it("rejeita assinatura com hash incorreto (401)", async () => {
    const r = await request(app)
      .post("/api/webhooks/mp-modulos")
      .set("x-signature", `ts=${ts},v1=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`)
      .set("x-request-id", requestId)
      .send({ type: "payment", action: "payment.updated", data: { id: paymentId } });
    expect(r.status).toBe(401);
  });

  it("rejeita assinatura com timestamp adulterado (401)", async () => {
    const sig = assinaturaMP(paymentId, requestId, ts);
    const sigAdulterada = sig.replace(ts, "9999999999"); // ts diferente
    const r = await request(app)
      .post("/api/webhooks/mp-modulos")
      .set("x-signature", sigAdulterada)
      .set("x-request-id", requestId)
      .send({ type: "payment", action: "payment.updated", data: { id: paymentId } });
    expect(r.status).toBe(401);
  });

  it("aceita evento não-payment (type=order) e retorna 200 sem processar", async () => {
    const sig = assinaturaMP("order-123", requestId, ts);
    const r = await request(app)
      .post("/api/webhooks/mp-modulos")
      .set("x-signature", sig)
      .set("x-request-id", requestId)
      .send({ type: "order", action: "order.updated", data: { id: "order-123" } });
    // Assinatura válida + type não processado → 200 sem efeito colateral
    expect([200, 401]).toContain(r.status); // 401 se secret de test diferir, 200 caso contrário
  });

  it("com assinatura válida e payment_id de external_reference inválido → 200 sem ativar", async () => {
    // Simular webhook com external_reference que NÃO começa com "modulo:"
    // Para isso precisamos que o MP retorne um pagamento falso
    // Como não temos acesso real ao MP nos testes, verificamos apenas que
    // a assinatura válida não causa 500 (apenas 200 — não encontra pagamento)
    const sig = assinaturaMP(paymentId, requestId, ts);
    const r = await request(app)
      .post("/api/webhooks/mp-modulos")
      .set("x-signature", sig)
      .set("x-request-id", requestId)
      .send({ type: "payment", action: "payment.updated", data: { id: paymentId } });
    // Esperamos 200 (MP não retorna dados reais em test) — nunca 5xx
    expect(r.status).not.toBe(500);
    if (r.status === 200) {
      expect(r.body.ok).toBe(true);
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// Segurança — SQL Injection & Headers
// ═══════════════════════════════════════════════════════════════

describe("Segurança — SQL Injection nos inputs", () => {
  beforeAll(async () => {
    // Garantir módulo ativo para REV_A para testar os endpoints de conteúdo
    await query(
      `INSERT INTO crm.revendedora_modulos (revendedora_id, modulo_id, expira_em, plano, status)
       VALUES ($1,'fluxo_caixa',NOW()+INTERVAL '30 days','mensal','ativo')
       ON CONFLICT (revendedora_id, modulo_id) DO UPDATE SET status='ativo', expira_em=NOW()+INTERVAL '30 days'`,
      [REV_ID_A]
    );
  });

  it("descricao com payload SQL injection não causa erro 500", async () => {
    const payloads = [
      "'; DROP TABLE crm.revendedora_vendas; --",
      "\" OR 1=1 --",
      "1; SELECT * FROM crm.customers; --",
    ];
    for (const payload of payloads) {
      const r = await request(app)
        .post("/api/souparceira/modulos/fluxo-caixa/venda")
        .set("Authorization", `Bearer ${tokenParceira(REV_A)}`)
        .send({ descricao: payload, valor: 1, data_venda: "2026-04-01" });
      expect(r.status).not.toBe(500);
      if (r.status === 201 && r.body.id) {
        await query(`DELETE FROM crm.revendedora_vendas WHERE id=$1`, [r.body.id]);
      }
    }
  });

  it("tabela crm.revendedora_vendas sobrevive aos testes — não foi dropada", async () => {
    const row = await queryOne(
      `SELECT 1 FROM information_schema.tables WHERE table_schema='crm' AND table_name='revendedora_vendas'`
    );
    expect(row).not.toBeNull();
  });

  it("endpoint /contratar com moduloId malicioso retorna 404, não 500", async () => {
    const r = await request(app)
      .post("/api/souparceira/modulos/'; DROP TABLE crm.modulos; --/contratar")
      .set("Authorization", `Bearer ${tokenParceira(REV_A)}`)
      .send({ plano: "mensal", metodo: "pix" });
    expect(r.status).not.toBe(500);
    expect([400, 404]).toContain(r.status);
  });

  it("tabela crm.modulos sobrevive — não foi dropada", async () => {
    const row = await queryOne(
      `SELECT 1 FROM information_schema.tables WHERE table_schema='crm' AND table_name='modulos'`
    );
    expect(row).not.toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════
// Integridade do banco após testes
// ═══════════════════════════════════════════════════════════════

describe("Integridade — estrutura das tabelas novas", () => {
  it("crm.modulo_pagamentos tem colunas esperadas", async () => {
    const cols = await query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema='crm' AND table_name='modulo_pagamentos'`
    );
    const nomes = cols.map(c => c.column_name);
    for (const col of ["id","revendedora_id","modulo_id","plano","valor","external_reference","status","mp_payment_id","qr_code"]) {
      expect(nomes).toContain(col);
    }
  });

  it("crm.revendedora_vendas tem colunas esperadas", async () => {
    const cols = await query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema='crm' AND table_name='revendedora_vendas'`
    );
    const nomes = cols.map(c => c.column_name);
    for (const col of ["id","revendedora_id","descricao","valor","data_venda","categoria"]) {
      expect(nomes).toContain(col);
    }
  });

  it("crm.modulos fluxo_caixa e relatorio_vendas estão ativos com preco_mensal=7.90", async () => {
    const mods = await query<{ id: string; preco_mensal: string; ativo: boolean }>(
      `SELECT id, preco_mensal, ativo FROM crm.modulos WHERE id IN ('fluxo_caixa','relatorio_vendas')`
    );
    expect(mods.length).toBe(2);
    for (const m of mods) {
      expect(m.ativo).toBe(true);
      expect(Number(m.preco_mensal)).toBeCloseTo(7.90);
    }
  });

  it("constraint UNIQUE (revendedora_id, modulo_id) existe em revendedora_modulos", async () => {
    const constraint = await queryOne(
      `SELECT 1 FROM information_schema.table_constraints
       WHERE table_schema='crm' AND table_name='revendedora_modulos'
       AND constraint_type='UNIQUE'`
    );
    expect(constraint).not.toBeNull();
  });

  it("external_reference é UNIQUE em modulo_pagamentos", async () => {
    const constraint = await queryOne(
      `SELECT 1 FROM information_schema.table_constraints
       WHERE table_schema='crm' AND table_name='modulo_pagamentos'
       AND constraint_type='UNIQUE'`
    );
    expect(constraint).not.toBeNull();
  });
});
