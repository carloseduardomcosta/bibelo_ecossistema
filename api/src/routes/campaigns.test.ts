import { describe, it, expect, afterAll, beforeAll } from "vitest";
import request from "supertest";
import { app } from "../server";
import { query, queryOne } from "../db";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "";
const TEST_PREFIX = "vitest-campaign-";

// Gera JWT de admin para testes
function adminToken(): string {
  return jwt.sign(
    { userId: "test-admin", email: "test@test.com", papel: "admin" },
    JWT_SECRET,
    { expiresIn: "1h" }
  );
}

// IDs criados durante testes para cleanup
const createdCampaignIds: string[] = [];
const createdCustomerIds: string[] = [];

afterAll(async () => {
  // Limpa na ordem correta (FK)
  for (const cid of createdCampaignIds) {
    await query("DELETE FROM marketing.campaign_sends WHERE campaign_id = $1", [cid]);
    await query("DELETE FROM marketing.campaigns WHERE id = $1", [cid]);
  }
  for (const custId of createdCustomerIds) {
    await query("DELETE FROM crm.interactions WHERE customer_id = $1", [custId]);
    await query("DELETE FROM crm.customer_scores WHERE customer_id = $1", [custId]);
    await query("DELETE FROM marketing.campaign_sends WHERE customer_id = $1", [custId]);
    await query("DELETE FROM crm.customers WHERE id = $1", [custId]);
  }
  // Cleanup extra por padrão de nome (segurança contra sobras)
  await query(
    "DELETE FROM marketing.campaign_sends WHERE campaign_id IN (SELECT id FROM marketing.campaigns WHERE nome LIKE $1)",
    [`${TEST_PREFIX}%`]
  );
  await query("DELETE FROM marketing.campaigns WHERE nome LIKE $1", [`${TEST_PREFIX}%`]);
});

// ── GET /api/campaigns — lista paginada ─────────────────────────

describe("GET /api/campaigns", () => {
  it("retorna 401 sem token", async () => {
    const res = await request(app).get("/api/campaigns");
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty("error");
  });

  it("retorna lista paginada com token válido", async () => {
    const res = await request(app)
      .get("/api/campaigns")
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

  it("aceita filtro por canal", async () => {
    const res = await request(app)
      .get("/api/campaigns?canal=email")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("data");
  });
});

// ── POST /api/campaigns — criar ─────────────────────────────────

describe("POST /api/campaigns", () => {
  it("retorna 401 sem token", async () => {
    const res = await request(app)
      .post("/api/campaigns")
      .send({ nome: `${TEST_PREFIX}sem-auth`, canal: "email" });
    expect(res.status).toBe(401);
  });

  it("cria campanha com dados válidos", async () => {
    const res = await request(app)
      .post("/api/campaigns")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({
        nome: `${TEST_PREFIX}teste-criacao`,
        canal: "email",
      });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("id");
    expect(res.body.nome).toContain(TEST_PREFIX);
    expect(res.body.canal).toBe("email");
    expect(res.body.status).toBe("rascunho");
    createdCampaignIds.push(res.body.id);
  });

  it("cria campanha agendada (status = agendada)", async () => {
    const futuro = new Date(Date.now() + 86400000).toISOString();
    const res = await request(app)
      .post("/api/campaigns")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({
        nome: `${TEST_PREFIX}teste-agendada`,
        canal: "email",
        agendado_em: futuro,
      });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("agendada");
    createdCampaignIds.push(res.body.id);
  });

  it("retorna 400 sem nome (campo obrigatório)", async () => {
    const res = await request(app)
      .post("/api/campaigns")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({ canal: "email" });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("retorna 400 sem canal (campo obrigatório)", async () => {
    const res = await request(app)
      .post("/api/campaigns")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({ nome: `${TEST_PREFIX}sem-canal` });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("retorna 400 com canal inválido", async () => {
    const res = await request(app)
      .post("/api/campaigns")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({ nome: `${TEST_PREFIX}canal-invalido`, canal: "sms" });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("retorna 400 com nome muito curto", async () => {
    const res = await request(app)
      .post("/api/campaigns")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({ nome: "A", canal: "email" });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });
});

// ── GET /api/campaigns/:id — detalhes ───────────────────────────

describe("GET /api/campaigns/:id", () => {
  it("retorna 404 para UUID inexistente", async () => {
    const res = await request(app)
      .get("/api/campaigns/00000000-0000-0000-0000-000000000000")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty("error");
  });

  it("retorna detalhes da campanha criada", async () => {
    if (createdCampaignIds.length === 0) return;
    const id = createdCampaignIds[0];

    const res = await request(app)
      .get(`/api/campaigns/${id}`)
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("id");
    expect(res.body).toHaveProperty("nome");
    expect(res.body).toHaveProperty("canal");
    expect(res.body).toHaveProperty("status");
    expect(res.body).toHaveProperty("sends_por_status");
    expect(res.body).toHaveProperty("destinatarios");
    expect(res.body.id).toBe(id);
  });
});

// ── PUT /api/campaigns/:id — atualizar ──────────────────────────

describe("PUT /api/campaigns/:id", () => {
  it("atualiza campanha existente (rascunho)", async () => {
    if (createdCampaignIds.length === 0) return;
    const id = createdCampaignIds[0];

    const res = await request(app)
      .put(`/api/campaigns/${id}`)
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({ nome: `${TEST_PREFIX}atualizada` });
    expect(res.status).toBe(200);
    expect(res.body.nome).toContain("atualizada");
  });

  it("retorna 404 para campanha inexistente", async () => {
    const res = await request(app)
      .put("/api/campaigns/00000000-0000-0000-0000-000000000000")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({ nome: `${TEST_PREFIX}fantasma` });
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty("error");
  });

  it("retorna 400 sem campos para atualizar (body vazio)", async () => {
    if (createdCampaignIds.length === 0) return;
    const id = createdCampaignIds[0];

    const res = await request(app)
      .put(`/api/campaigns/${id}`)
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it("não permite editar campanha concluída", async () => {
    // Cria uma campanha e marca como concluída no banco
    const campaign = await queryOne<{ id: string }>(
      `INSERT INTO marketing.campaigns (nome, canal, status)
       VALUES ($1, 'email', 'concluida') RETURNING id`,
      [`${TEST_PREFIX}concluida`]
    );
    if (!campaign) return;
    createdCampaignIds.push(campaign.id);

    const res = await request(app)
      .put(`/api/campaigns/${campaign.id}`)
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({ nome: `${TEST_PREFIX}tentativa-editar` });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("concluida");
  });
});

// ── GET /api/campaigns/email-events — eventos de email ──────────

describe("GET /api/campaigns/email-events", () => {
  it("retorna 401 sem token", async () => {
    const res = await request(app).get("/api/campaigns/email-events");
    expect(res.status).toBe(401);
  });

  it("retorna eventos com token válido (pode ser vazio)", async () => {
    const res = await request(app)
      .get("/api/campaigns/email-events?hours=48")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("events");
    expect(res.body).toHaveProperty("resumo");
    expect(Array.isArray(res.body.events)).toBe(true);
    expect(res.body.resumo).toHaveProperty("abertos");
    expect(res.body.resumo).toHaveProperty("clicados");
  });

  it("aceita parâmetro hours customizado", async () => {
    const res = await request(app)
      .get("/api/campaigns/email-events?hours=24")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("events");
  });
});

// ── GET /api/campaigns/resend-status — status do Resend ─────────

describe("GET /api/campaigns/resend-status", () => {
  it("retorna status da integração Resend", async () => {
    const res = await request(app)
      .get("/api/campaigns/resend-status")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    // Deve ter informações sobre se o Resend está configurado
    expect(res.body).toBeDefined();
  });
});

// ── Segurança ───────────────────────────────────────────────────

describe("Segurança — campaigns API", () => {
  it("XSS no nome da campanha — Zod aceita string, não deve causar erro", async () => {
    const xssPayload = '<script>alert("xss")</script>Campanha Limpa';
    const res = await request(app)
      .post("/api/campaigns")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({ nome: xssPayload, canal: "email" });

    // Zod aceita strings — a proteção XSS é na renderização
    if (res.status === 201) {
      createdCampaignIds.push(res.body.id);
      expect(res.body).toHaveProperty("id");
    }
    expect([201, 400]).toContain(res.status);
  });

  it("rejeita JWT expirado", async () => {
    const expired = jwt.sign(
      { userId: "test", email: "test@test.com", papel: "admin" },
      JWT_SECRET,
      { expiresIn: "-1h" }
    );
    const res = await request(app)
      .get("/api/campaigns")
      .set("Authorization", `Bearer ${expired}`);
    expect(res.status).toBe(401);
  });

  it("rejeita JWT com secret errado", async () => {
    const bad = jwt.sign(
      { userId: "test", email: "test@test.com", papel: "admin" },
      "wrong-secret-xpto",
      { expiresIn: "1h" }
    );
    const res = await request(app)
      .get("/api/campaigns")
      .set("Authorization", `Bearer ${bad}`);
    expect(res.status).toBe(401);
  });

  it("rejeita token malformado", async () => {
    const res = await request(app)
      .get("/api/campaigns")
      .set("Authorization", "Bearer nao.e.jwt.valido");
    expect(res.status).toBe(401);
  });

  it("POST não aceita prototype pollution", async () => {
    const res = await request(app)
      .post("/api/campaigns")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({
        nome: `${TEST_PREFIX}proto-pollution`,
        canal: "email",
        __proto__: { admin: true },
        constructor: { prototype: { isAdmin: true } },
      });
    // Zod strip unknowns — __proto__ é ignorado
    expect([201, 400]).toContain(res.status);
    if (res.status === 201) {
      createdCampaignIds.push(res.body.id);
    }
  });
});

// ── GET /api/campaigns/novidades-nf ─────────────────────────────

describe("GET /api/campaigns/novidades-nf", () => {
  it("retorna 401 sem token", async () => {
    const res = await request(app).get("/api/campaigns/novidades-nf");
    expect(res.status).toBe(401);
  });

  it("retorna lista de produtos da última NF", async () => {
    const res = await request(app)
      .get("/api/campaigns/novidades-nf")
      .set("Authorization", `Bearer ${adminToken()}`);
    // Pode ser 200 ou 404 se não há NF com produtos disponíveis
    expect([200, 404]).toContain(res.status);
    if (res.status === 200) {
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
    }
  });

  it("campos obrigatórios presentes em cada produto", async () => {
    const res = await request(app)
      .get("/api/campaigns/novidades-nf")
      .set("Authorization", `Bearer ${adminToken()}`);
    if (res.status !== 200 || res.body.length === 0) return;

    for (const produto of res.body) {
      expect(produto).toHaveProperty("id");
      expect(produto).toHaveProperty("nome");
      expect(produto).toHaveProperty("preco");
      expect(produto).toHaveProperty("estoque");
      expect(produto).toHaveProperty("img");
      expect(produto).toHaveProperty("url");
      expect(typeof produto.nome).toBe("string");
      expect(produto.nome.length).toBeGreaterThan(0);
    }
  });

  it("URLs da loja apontam para papelariabibelo.com.br", async () => {
    const res = await request(app)
      .get("/api/campaigns/novidades-nf")
      .set("Authorization", `Bearer ${adminToken()}`);
    if (res.status !== 200) return;

    for (const produto of res.body) {
      if (produto.url) {
        expect(produto.url).toMatch(/papelariabibelo\.com\.br/);
      }
    }
  });

  it("imagens são URLs HTTP (não base64 nem vazias)", async () => {
    const res = await request(app)
      .get("/api/campaigns/novidades-nf")
      .set("Authorization", `Bearer ${adminToken()}`);
    if (res.status !== 200) return;

    const comImagem = res.body.filter((p: { img: string | null }) => p.img !== null);
    expect(comImagem.length).toBeGreaterThan(0);
    for (const produto of comImagem) {
      expect(produto.img).toMatch(/^https?:\/\//);
    }
  });

  it("não retorna produtos duplicados (mesmo bling_id)", async () => {
    const res = await request(app)
      .get("/api/campaigns/novidades-nf")
      .set("Authorization", `Bearer ${adminToken()}`);
    if (res.status !== 200) return;

    const ids = res.body.map((p: { id: string }) => p.id);
    const uniqueIds = new Set(ids);
    expect(ids.length).toBe(uniqueIds.size);
  });
});

// ── POST /api/campaigns/gerar-personalizada ──────────────────────

describe("POST /api/campaigns/gerar-personalizada (fonte=novidades)", () => {
  let testCustomerId: string;

  beforeAll(async () => {
    // Cria cliente de teste para usar como destinatário
    const c = await queryOne<{ id: string }>(
      `INSERT INTO crm.customers (nome, email, canal_origem)
       VALUES ($1, $2, 'teste') RETURNING id`,
      [`${TEST_PREFIX}Destinatário`, `${TEST_PREFIX}dest-${Date.now()}@example.com`]
    );
    if (c) {
      testCustomerId = c.id;
      createdCustomerIds.push(c.id);
      // Score mínimo para aparecer nos públicos
      await query(
        `INSERT INTO crm.customer_scores (customer_id, total_pedidos, ltv, segmento)
         VALUES ($1, 0, 0, 'novo') ON CONFLICT (customer_id) DO NOTHING`,
        [c.id]
      );
    }
  });

  it("retorna 401 sem token", async () => {
    const res = await request(app)
      .post("/api/campaigns/gerar-personalizada")
      .send({ publico: "todos_com_email", fonte: "novidades" });
    expect(res.status).toBe(401);
  });

  it("retorna 400 sem campo publico", async () => {
    const res = await request(app)
      .post("/api/campaigns/gerar-personalizada")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({ fonte: "novidades" });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("retorna 400 sem categorias/produtos quando fonte não é novidades", async () => {
    const res = await request(app)
      .post("/api/campaigns/gerar-personalizada")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({ publico: "todos_com_email", categorias: [], produto_ids: [] });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("gera HTML com fonte=novidades e publico=manual", async () => {
    if (!testCustomerId) return;
    const res = await request(app)
      .post("/api/campaigns/gerar-personalizada")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({
        fonte: "novidades",
        publico: "manual",
        customer_ids: [testCustomerId],
      });

    // 200 = gerou HTML | 404 = sem NF ou sem destinatários
    expect([200, 404]).toContain(res.status);
    if (res.status !== 200) return;

    expect(res.body).toHaveProperty("html");
    expect(res.body).toHaveProperty("assunto");
    expect(res.body).toHaveProperty("destinatarios");
    expect(typeof res.body.html).toBe("string");
    expect(res.body.html.length).toBeGreaterThan(100);
    expect(res.body.assunto.length).toBeGreaterThan(3);
  });

  it("HTML contém layout de tabela (compatível email clients)", async () => {
    if (!testCustomerId) return;
    const res = await request(app)
      .post("/api/campaigns/gerar-personalizada")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({
        fonte: "novidades",
        publico: "manual",
        customer_ids: [testCustomerId],
      });
    if (res.status !== 200) return;

    const html: string = res.body.html;
    // Deve usar tabela, não flexbox/grid (compatibilidade Gmail/Outlook)
    expect(html).toMatch(/<table/i);
    expect(html).toMatch(/width="560"/);
    // Não deve ter display:flex ou display:grid no container principal
    expect(html).not.toMatch(/display:\s*flex/i);
  });

  it("HTML contém links para papelariabibelo.com.br", async () => {
    if (!testCustomerId) return;
    const res = await request(app)
      .post("/api/campaigns/gerar-personalizada")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({
        fonte: "novidades",
        publico: "manual",
        customer_ids: [testCustomerId],
      });
    if (res.status !== 200) return;

    expect(res.body.html).toMatch(/papelariabibelo\.com\.br/);
    // Links de produtos devem estar presentes
    expect(res.body.html).toMatch(/href="https:\/\/www\.papelariabibelo\.com\.br/);
  });

  it("HTML usa proxy de imagem (não URL raw do Bling S3)", async () => {
    if (!testCustomerId) return;
    const res = await request(app)
      .post("/api/campaigns/gerar-personalizada")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({
        fonte: "novidades",
        publico: "manual",
        customer_ids: [testCustomerId],
      });
    if (res.status !== 200) return;

    const html: string = res.body.html;
    // Proxy de imagem deve ser usado (URL do CRM, não do S3 da Bling)
    if (html.includes("<img")) {
      expect(html).toMatch(/\/api\/email\/img\//);
      // NÃO deve ter URLs diretas do Bling S3
      expect(html).not.toMatch(/bling\.com\.br.*<img/i);
    }
  });

  it("HTML contém link de descadastro (LGPD)", async () => {
    if (!testCustomerId) return;
    const res = await request(app)
      .post("/api/campaigns/gerar-personalizada")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({
        fonte: "novidades",
        publico: "manual",
        customer_ids: [testCustomerId],
      });
    if (res.status !== 200) return;

    // Placeholder {{unsub_link}} ou link real de descadastro
    expect(res.body.html).toMatch(/unsub_link|descadastro|unsubscribe/i);
  });

  it("retorna 400 quando publico=segmento sem segmento", async () => {
    const res = await request(app)
      .post("/api/campaigns/gerar-personalizada")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({ fonte: "novidades", publico: "segmento" });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("retorna 400 quando publico=manual sem customer_ids", async () => {
    const res = await request(app)
      .post("/api/campaigns/gerar-personalizada")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({ fonte: "novidades", publico: "manual", customer_ids: [] });
    expect(res.status).toBe(400);
  });
});

// ── POST /api/campaigns/enviar-personalizada ─────────────────────

describe("POST /api/campaigns/enviar-personalizada (mock email — sem envio real)", () => {
  let testCustomerId: string;
  const htmlMock = `<html><body><table width="560"><tr><td>Teste Vitest</td></tr></table></body></html>`;

  beforeAll(async () => {
    const c = await queryOne<{ id: string }>(
      `INSERT INTO crm.customers (nome, email, canal_origem)
       VALUES ($1, $2, 'teste') RETURNING id`,
      [`${TEST_PREFIX}Envio`, `${TEST_PREFIX}envio-${Date.now()}@example.com`]
    );
    if (c) {
      testCustomerId = c.id;
      createdCustomerIds.push(c.id);
    }
  });

  it("retorna 401 sem token", async () => {
    const res = await request(app)
      .post("/api/campaigns/enviar-personalizada")
      .send({ nome_campanha: "Teste", assunto: "Assunto", html: htmlMock, customer_ids: [] });
    expect(res.status).toBe(401);
  });

  it("retorna 400 sem html", async () => {
    if (!testCustomerId) return;
    const res = await request(app)
      .post("/api/campaigns/enviar-personalizada")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({ nome_campanha: "Teste", assunto: "Assunto", customer_ids: [testCustomerId] });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("retorna 400 sem customer_ids", async () => {
    const res = await request(app)
      .post("/api/campaigns/enviar-personalizada")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({ nome_campanha: "Teste", assunto: "Assunto", html: htmlMock, customer_ids: [] });
    expect(res.status).toBe(400);
  });

  it("retorna 400 com customer_id inválido (não-UUID)", async () => {
    const res = await request(app)
      .post("/api/campaigns/enviar-personalizada")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({ nome_campanha: "Teste", assunto: "Assunto", html: htmlMock, customer_ids: ["nao-uuid"] });
    expect(res.status).toBe(400);
  });

  it("dispara email mockado e cria campanha no banco", async () => {
    if (!testCustomerId) return;
    const nomeCamp = `${TEST_PREFIX}envio-mock-${Date.now()}`;

    const res = await request(app)
      .post("/api/campaigns/enviar-personalizada")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({
        nome_campanha: nomeCamp,
        assunto: `${TEST_PREFIX}Assunto de Teste`,
        html: htmlMock,
        customer_ids: [testCustomerId],
      });

    // Pode retornar 400 se Resend/SES não configurado no env de teste
    if (res.status === 400 && res.body.error?.includes("configurado")) {
      return; // Email provider não configurado — skip
    }

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("campaign_id");
    expect(res.body).toHaveProperty("total");
    expect(res.body.total).toBeGreaterThan(0);

    const campaignId = res.body.campaign_id;
    createdCampaignIds.push(campaignId);

    // Aguarda processamento assíncrono
    await new Promise((r) => setTimeout(r, 500));

    // Verifica campanha criada no banco
    const camp = await queryOne<{ id: string; nome: string; status: string }>(
      "SELECT id, nome, status FROM marketing.campaigns WHERE id = $1",
      [campaignId]
    );
    expect(camp).not.toBeNull();
    expect(camp?.nome).toContain(TEST_PREFIX);
    expect(["enviando", "concluida"]).toContain(camp?.status);

    // Verifica que campaign_send foi criado
    const sends = await query<{ status: string }>(
      "SELECT status FROM marketing.campaign_sends WHERE campaign_id = $1",
      [campaignId]
    );
    expect(sends.length).toBeGreaterThan(0);
    // Status deve ser 'enviado' (processamento já terminou no mock — sem delay real)
    expect(["enviado", "pendente"]).toContain(sends[0].status);
  });

  it("cria interação na timeline do cliente após envio mockado", async () => {
    if (!testCustomerId) return;
    const nomeCamp = `${TEST_PREFIX}timeline-${Date.now()}`;

    const res = await request(app)
      .post("/api/campaigns/enviar-personalizada")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({
        nome_campanha: nomeCamp,
        assunto: `${TEST_PREFIX}Assunto Timeline`,
        html: htmlMock,
        customer_ids: [testCustomerId],
      });

    if (res.status === 400 && res.body.error?.includes("configurado")) return;
    if (res.status !== 200) return;
    createdCampaignIds.push(res.body.campaign_id);

    await new Promise((r) => setTimeout(r, 600));

    const interacao = await queryOne<{ tipo: string; metadata: string }>(
      `SELECT tipo, metadata::text AS metadata
       FROM crm.interactions
       WHERE customer_id = $1 AND tipo = 'email_enviado'
         AND descricao LIKE $2
       ORDER BY criado_em DESC LIMIT 1`,
      [testCustomerId, `%${nomeCamp}%`]
    );
    expect(interacao).not.toBeNull();
    expect(interacao?.tipo).toBe("email_enviado");
    expect(interacao?.metadata).toContain(res.body.campaign_id);
  });

  it("respeita opt-out LGPD — cliente com email_optout não recebe", async () => {
    // Cria cliente com opt-out
    const optout = await queryOne<{ id: string }>(
      `INSERT INTO crm.customers (nome, email, canal_origem, email_optout)
       VALUES ($1, $2, 'teste', true) RETURNING id`,
      [`${TEST_PREFIX}OptOut`, `${TEST_PREFIX}optout-${Date.now()}@example.com`]
    );
    if (!optout) return;
    createdCustomerIds.push(optout.id);

    const res = await request(app)
      .post("/api/campaigns/enviar-personalizada")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({
        nome_campanha: `${TEST_PREFIX}optout-test`,
        assunto: `${TEST_PREFIX}Optout Test`,
        html: htmlMock,
        customer_ids: [optout.id],
      });

    // Deve retornar 400 — nenhum destinatário válido (todos fizeram opt-out)
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/opt.out|descadastro|destinat/i);
  });
});

// ── GET /api/campaigns/gerar-reengajamento ───────────────────────

describe("GET /api/campaigns/gerar-reengajamento", () => {
  it("retorna 401 sem token", async () => {
    const res = await request(app).get("/api/campaigns/gerar-reengajamento");
    expect(res.status).toBe(401);
  });

  it("retorna 400 sem customer_id", async () => {
    const res = await request(app)
      .get("/api/campaigns/gerar-reengajamento")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(400);
  });

  it("retorna 404 para customer inexistente", async () => {
    const res = await request(app)
      .get("/api/campaigns/gerar-reengajamento?customer_id=00000000-0000-0000-0000-000000000000")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(404);
  });

  it("retorna 404 para customer sem email", async () => {
    const semEmail = await queryOne<{ id: string }>(
      `INSERT INTO crm.customers (nome, canal_origem)
       VALUES ($1, 'teste') RETURNING id`,
      [`${TEST_PREFIX}SemEmail`]
    );
    if (!semEmail) return;
    createdCustomerIds.push(semEmail.id);

    const res = await request(app)
      .get(`/api/campaigns/gerar-reengajamento?customer_id=${semEmail.id}`)
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(404);
  });

  it("retorna HTML ou 404 (sem histórico) para customer válido com email", async () => {
    // Busca qualquer customer real com email
    const customer = await queryOne<{ id: string }>(
      "SELECT id FROM crm.customers WHERE email IS NOT NULL LIMIT 1"
    );
    if (!customer) return;

    const res = await request(app)
      .get(`/api/campaigns/gerar-reengajamento?customer_id=${customer.id}`)
      .set("Authorization", `Bearer ${adminToken()}`);

    expect([200, 404]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body).toHaveProperty("html");
      expect(res.body).toHaveProperty("assunto");
      expect(typeof res.body.html).toBe("string");
      expect(res.body.html).toMatch(/<table/i);
      expect(res.body.html).toMatch(/papelariabibelo\.com\.br/);
    }
  });

  it("limite é respeitado (máx 12 produtos)", async () => {
    const customer = await queryOne<{ id: string }>(
      "SELECT id FROM crm.customers WHERE email IS NOT NULL LIMIT 1"
    );
    if (!customer) return;

    const res = await request(app)
      .get(`/api/campaigns/gerar-reengajamento?customer_id=${customer.id}&limite=3`)
      .set("Authorization", `Bearer ${adminToken()}`);

    if (res.status !== 200) return;
    // Máximo 3 produtos no HTML (cada produto = 1 card)
    const matches = (res.body.html as string).match(/Quero este!/g) || [];
    expect(matches.length).toBeLessThanOrEqual(3);
  });

  it("retorna 400 com limite inválido", async () => {
    const customer = await queryOne<{ id: string }>(
      "SELECT id FROM crm.customers WHERE email IS NOT NULL LIMIT 1"
    );
    if (!customer) return;

    const res = await request(app)
      .get(`/api/campaigns/gerar-reengajamento?customer_id=${customer.id}&limite=99`)
      .set("Authorization", `Bearer ${adminToken()}`);

    expect(res.status).toBe(400);
  });
});

// ── Fluxo E2E — gerar + enviar sem email real ────────────────────

describe("E2E — gerar-personalizada → enviar-personalizada (mock)", () => {
  let testCustomerId: string;

  beforeAll(async () => {
    const c = await queryOne<{ id: string }>(
      `INSERT INTO crm.customers (nome, email, canal_origem)
       VALUES ($1, $2, 'teste') RETURNING id`,
      [`${TEST_PREFIX}E2E`, `${TEST_PREFIX}e2e-${Date.now()}@example.com`]
    );
    if (c) {
      testCustomerId = c.id;
      createdCustomerIds.push(c.id);
    }
  });

  it("fluxo completo: gerar HTML das novidades e disparar (mockado)", async () => {
    if (!testCustomerId) return;

    // 1. Busca produtos da NF
    const nfRes = await request(app)
      .get("/api/campaigns/novidades-nf")
      .set("Authorization", `Bearer ${adminToken()}`);

    if (nfRes.status === 404) return; // Sem NF disponível — skip

    expect(nfRes.status).toBe(200);
    expect(nfRes.body.length).toBeGreaterThan(0);

    // 2. Gera HTML com os produtos
    const gerarRes = await request(app)
      .post("/api/campaigns/gerar-personalizada")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({
        fonte: "novidades",
        bling_produto_ids: nfRes.body.map((p: { id: string }) => p.id).slice(0, 4),
        publico: "manual",
        customer_ids: [testCustomerId],
      });

    expect([200, 404]).toContain(gerarRes.status);
    if (gerarRes.status !== 200) return;

    const { html, assunto, destinatarios } = gerarRes.body;
    expect(html).toBeTruthy();
    expect(assunto).toBeTruthy();
    expect(Array.isArray(destinatarios)).toBe(true);

    // Valida HTML: tabela, links loja, proxy imagem
    expect(html).toMatch(/<table/i);
    expect(html).toMatch(/papelariabibelo\.com\.br/);
    if (html.includes("<img")) {
      expect(html).toMatch(/\/api\/email\/img\//);
    }

    // 3. Dispara (mockado — VITEST=true => sendEmail retorna mock ID)
    const nomeCamp = `${TEST_PREFIX}E2E-${Date.now()}`;
    const enviarRes = await request(app)
      .post("/api/campaigns/enviar-personalizada")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({
        nome_campanha: nomeCamp,
        assunto,
        html,
        customer_ids: [testCustomerId],
      });

    if (enviarRes.status === 400 && enviarRes.body.error?.includes("configurado")) return;

    expect(enviarRes.status).toBe(200);
    expect(enviarRes.body).toHaveProperty("campaign_id");
    expect(enviarRes.body.total).toBeGreaterThan(0);
    createdCampaignIds.push(enviarRes.body.campaign_id);

    await new Promise((r) => setTimeout(r, 600));

    // 4. Verifica registros no banco
    const sends = await query<{ status: string; message_id: string | null }>(
      "SELECT status, message_id FROM marketing.campaign_sends WHERE campaign_id = $1",
      [enviarRes.body.campaign_id]
    );
    expect(sends.length).toBeGreaterThan(0);

    // message_id deve começar com "mock-" (gerado pelo sendEmail mockado)
    const enviados = sends.filter((s) => s.status === "enviado");
    if (enviados.length > 0) {
      expect(enviados[0].message_id).toMatch(/^mock-/);
    }
  });
});
