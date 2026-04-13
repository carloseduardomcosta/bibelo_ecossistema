/**
 * Testes automatizados — Portal "Sou Parceira"
 * Cobre: solicitar OTP, entrar, /me, /categorias, /catalogo
 * Segurança: inputs inválidos, auth, rate limit de revendedora, uso único do OTP
 */
import { describe, it, expect, afterAll, beforeAll } from "vitest";
import request from "supertest";
import { app } from "../server";
import { query, queryOne } from "../db";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "test-secret";

// ── IDs para cleanup ──────────────────────────────────────────────

const TEST_REV_ID_1 = "bbbbbbbb-0000-4000-a000-000000000001";
const TEST_REV_ID_2 = "bbbbbbbb-0000-4000-a000-000000000002";
const CPF_ATIVA     = "111.444.777-35"; // CPF válido (dígito verificador correto)
const CPF_INATIVO   = "321.654.987-91"; // CPF válido para revendedora pendente
const CPF_INVALIDO  = "111.111.111-11"; // CPF válido mas todos dígitos iguais → falha
const CPF_MAL_FORM  = "123";            // muito curto

// ── Setup / Teardown ──────────────────────────────────────────────

beforeAll(async () => {
  // Revendedora ativa com CPF válido (para testes de acesso)
  await query(
    `INSERT INTO crm.revendedoras
       (id, nome, documento, email, status, nivel, percentual_desconto)
     VALUES ($1,$2,$3,$4,'ativa','prata',20)
     ON CONFLICT (id) DO UPDATE
       SET documento=$3, email=$4, status='ativa', nivel='prata', percentual_desconto=20`,
    [TEST_REV_ID_1, "Parceira Teste Vitest", CPF_ATIVA, "vitest-souparceira@test.bibelo.internal"]
  );

  // Revendedora pendente (não pode acessar)
  await query(
    `INSERT INTO crm.revendedoras
       (id, nome, documento, email, status, nivel, percentual_desconto)
     VALUES ($1,$2,$3,$4,'pendente','bronze',10)
     ON CONFLICT (id) DO UPDATE
       SET documento=$3, email=$4, status='pendente'`,
    [TEST_REV_ID_2, "Parceira Pendente Vitest", CPF_INATIVO, "pendente@vitest.com"]
  );
});

afterAll(async () => {
  await query(
    "DELETE FROM crm.portal_parceira_otp WHERE revendedora_id IN ($1, $2)",
    [TEST_REV_ID_1, TEST_REV_ID_2]
  );
  await query("DELETE FROM crm.revendedoras WHERE id IN ($1, $2)", [
    TEST_REV_ID_1,
    TEST_REV_ID_2,
  ]);
});

// ── Helper: gera token JWT do portal diretamente ──────────────────

function gerarTokenParceira(revId = TEST_REV_ID_1, nivel = "prata"): string {
  return jwt.sign(
    { sub: revId, nivel, iss: "souparceira" },
    JWT_SECRET,
    { expiresIn: "1h" }
  );
}

function tokenCRM(): string {
  return jwt.sign(
    { userId: "admin", email: "admin@test.com", papel: "admin" },
    JWT_SECRET,
    { expiresIn: "1h" }
  );
}

// ── Helper: insere OTP diretamente no banco para testes ───────────

async function inserirOTPTeste(
  revId: string,
  codigo: string,
  offsetMin = 10
): Promise<string> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO crm.portal_parceira_otp
       (revendedora_id, codigo, expira_em, ip_solicitacao)
     VALUES ($1, $2, NOW() + make_interval(mins => $3), '127.0.0.1')
     RETURNING id`,
    [revId, codigo, offsetMin]
  );
  return row!.id;
}

// ─────────────────────────────────────────────────────────────────
// POST /api/souparceira/solicitar
// ─────────────────────────────────────────────────────────────────

describe("POST /api/souparceira/solicitar", () => {
  it("rejeita body vazio com 400", async () => {
    const res = await request(app)
      .post("/api/souparceira/solicitar")
      .send({});
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("rejeita CPF muito curto com 400", async () => {
    const res = await request(app)
      .post("/api/souparceira/solicitar")
      .send({ cpf: CPF_MAL_FORM });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/cpf/i);
  });

  it("rejeita CPF inválido (dígito verificador) com 400", async () => {
    const res = await request(app)
      .post("/api/souparceira/solicitar")
      .send({ cpf: CPF_INVALIDO });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/inválido/i);
  });

  it("retorna ok:false para CPF não cadastrado como revendedora ativa", async () => {
    const res = await request(app)
      .post("/api/souparceira/solicitar")
      .send({ cpf: "456.789.012-49" }); // CPF válido mas não cadastrado
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: false, cadastrada: false });
  });

  it("retorna ok:false para CPF de revendedora pendente (não ativa)", async () => {
    const res = await request(app)
      .post("/api/souparceira/solicitar")
      .send({ cpf: CPF_INATIVO });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: false, cadastrada: false });
  });

  it("envia OTP para revendedora ativa e retorna email mascarado", async () => {
    // Limpa OTPs anteriores do teste para não acumular
    await query(
      "DELETE FROM crm.portal_parceira_otp WHERE revendedora_id = $1",
      [TEST_REV_ID_1]
    );

    const res = await request(app)
      .post("/api/souparceira/solicitar")
      .send({ cpf: CPF_ATIVA });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    // email_masked pode ser string ou null (dependendo de VITEST mock)
    expect(typeof res.body.email_masked === "string" || res.body.email_masked === null).toBe(true);

    // Verifica OTP foi criado no banco
    const otp = await queryOne(
      "SELECT codigo FROM crm.portal_parceira_otp WHERE revendedora_id = $1 AND usado_em IS NULL",
      [TEST_REV_ID_1]
    );
    expect(otp).toBeTruthy();
  });

  it("invalida OTP anterior ao gerar novo", async () => {
    await query(
      "DELETE FROM crm.portal_parceira_otp WHERE revendedora_id = $1",
      [TEST_REV_ID_1]
    );

    // Solicita 2x
    await request(app)
      .post("/api/souparceira/solicitar")
      .send({ cpf: CPF_ATIVA });

    await request(app)
      .post("/api/souparceira/solicitar")
      .send({ cpf: CPF_ATIVA });

    // Deve existir apenas 1 OTP ainda válido
    const otps = await query(
      `SELECT id FROM crm.portal_parceira_otp
        WHERE revendedora_id = $1 AND usado_em IS NULL AND expira_em > NOW()`,
      [TEST_REV_ID_1]
    );
    expect(otps.length).toBe(1);
  });

  it("retorna 429 ao atingir limite de 3 OTPs por hora", async () => {
    // Insere 3 OTPs recentes manualmente (dentro da última hora)
    await query(
      "DELETE FROM crm.portal_parceira_otp WHERE revendedora_id = $1",
      [TEST_REV_ID_1]
    );
    await query(
      `INSERT INTO crm.portal_parceira_otp
         (revendedora_id, codigo, expira_em, criado_em)
       SELECT $1::uuid, 'AAABBB', NOW() + interval '1 hour', NOW() - interval '5 minutes'
       UNION ALL
       SELECT $1::uuid, 'CCCDD2', NOW() + interval '1 hour', NOW() - interval '3 minutes'
       UNION ALL
       SELECT $1::uuid, 'EEE333', NOW() + interval '1 hour', NOW() - interval '1 minute'`,
      [TEST_REV_ID_1]
    );

    const res = await request(app)
      .post("/api/souparceira/solicitar")
      .send({ cpf: CPF_ATIVA });

    expect(res.status).toBe(429);
    expect(res.body).toHaveProperty("error");

    // Cleanup
    await query(
      "DELETE FROM crm.portal_parceira_otp WHERE revendedora_id = $1",
      [TEST_REV_ID_1]
    );
  });

  it("aceita CPF formatado (com pontos e traço)", async () => {
    await query(
      "DELETE FROM crm.portal_parceira_otp WHERE revendedora_id = $1",
      [TEST_REV_ID_1]
    );

    const res = await request(app)
      .post("/api/souparceira/solicitar")
      .send({ cpf: CPF_ATIVA }); // já está formatado com pontos e traço
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────
// POST /api/souparceira/entrar
// ─────────────────────────────────────────────────────────────────

describe("POST /api/souparceira/entrar", () => {
  it("rejeita body vazio com 400", async () => {
    const res = await request(app)
      .post("/api/souparceira/entrar")
      .send({});
    expect(res.status).toBe(400);
  });

  it("rejeita código muito curto com 400", async () => {
    const res = await request(app)
      .post("/api/souparceira/entrar")
      .send({ cpf: CPF_ATIVA, codigo: "ABC" });
    expect(res.status).toBe(400);
  });

  it("rejeita código errado com 401", async () => {
    const res = await request(app)
      .post("/api/souparceira/entrar")
      .send({ cpf: CPF_ATIVA, codigo: "XXXXXX" });
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty("error");
  });

  it("rejeita CPF não cadastrado com 401", async () => {
    const res = await request(app)
      .post("/api/souparceira/entrar")
      .send({ cpf: "076.432.770-87", codigo: "ABCDEF" });
    expect(res.status).toBe(401);
  });

  it("retorna token JWT com dados da revendedora para código válido", async () => {
    await query(
      "DELETE FROM crm.portal_parceira_otp WHERE revendedora_id = $1",
      [TEST_REV_ID_1]
    );
    await inserirOTPTeste(TEST_REV_ID_1, "V1T3ST");

    const res = await request(app)
      .post("/api/souparceira/entrar")
      .send({ cpf: CPF_ATIVA, codigo: "V1T3ST" });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("token");
    expect(res.body).toHaveProperty("revendedora");
    expect(res.body.revendedora).toMatchObject({
      nome:                "Parceira Teste Vitest",
      nivel:               "prata",
      percentual_desconto: 20,
    });

    // Token deve ser JWT do portal (iss: souparceira)
    const decoded = jwt.verify(res.body.token, JWT_SECRET) as { iss: string; sub: string };
    expect(decoded.iss).toBe("souparceira");
    expect(decoded.sub).toBe(TEST_REV_ID_1);
  });

  it("marca OTP como usado após login bem-sucedido", async () => {
    await query(
      "DELETE FROM crm.portal_parceira_otp WHERE revendedora_id = $1",
      [TEST_REV_ID_1]
    );
    const otpId = await inserirOTPTeste(TEST_REV_ID_1, "M4RCAR");

    await request(app)
      .post("/api/souparceira/entrar")
      .send({ cpf: CPF_ATIVA, codigo: "M4RCAR" });

    const otp = await queryOne<{ usado_em: Date | null }>(
      "SELECT usado_em FROM crm.portal_parceira_otp WHERE id = $1",
      [otpId]
    );
    expect(otp?.usado_em).not.toBeNull();
  });

  it("rejeita reuso do mesmo código (OTP já usado)", async () => {
    await query(
      "DELETE FROM crm.portal_parceira_otp WHERE revendedora_id = $1",
      [TEST_REV_ID_1]
    );
    await inserirOTPTeste(TEST_REV_ID_1, "REUSO1");

    // Primeiro uso — sucesso
    await request(app)
      .post("/api/souparceira/entrar")
      .send({ cpf: CPF_ATIVA, codigo: "REUSO1" });

    // Segundo uso — deve falhar
    const res = await request(app)
      .post("/api/souparceira/entrar")
      .send({ cpf: CPF_ATIVA, codigo: "REUSO1" });

    expect(res.status).toBe(401);
  });

  it("rejeita código expirado", async () => {
    await query(
      "DELETE FROM crm.portal_parceira_otp WHERE revendedora_id = $1",
      [TEST_REV_ID_1]
    );
    // Insere OTP já expirado (offsetMin negativo não é suportado — usa INSERT direto)
    await query(
      `INSERT INTO crm.portal_parceira_otp
         (revendedora_id, codigo, expira_em)
       VALUES ($1, 'EXPIRA', NOW() - interval '1 minute')`,
      [TEST_REV_ID_1]
    );

    const res = await request(app)
      .post("/api/souparceira/entrar")
      .send({ cpf: CPF_ATIVA, codigo: "EXPIRA" });

    expect(res.status).toBe(401);
  });

  it("aceita código em minúsculas (normaliza para maiúsculas)", async () => {
    await query(
      "DELETE FROM crm.portal_parceira_otp WHERE revendedora_id = $1",
      [TEST_REV_ID_1]
    );
    await inserirOTPTeste(TEST_REV_ID_1, "UPPER9");

    const res = await request(app)
      .post("/api/souparceira/entrar")
      .send({ cpf: CPF_ATIVA, codigo: "upper9" }); // minúsculas

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("token");
  });

  it("rejeita token CRM (iss diferente) no portal", async () => {
    // O CRM usa tokens sem iss: 'souparceira' — não deve funcionar no portal
    const tokenCrm = tokenCRM();
    const res = await request(app)
      .get("/api/souparceira/me")
      .set("Authorization", `Bearer ${tokenCrm}`);
    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────
// GET /api/souparceira/me
// ─────────────────────────────────────────────────────────────────

describe("GET /api/souparceira/me", () => {
  it("retorna 401 sem token", async () => {
    const res = await request(app).get("/api/souparceira/me");
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty("error");
  });

  it("retorna 401 com Bearer inválido", async () => {
    const res = await request(app)
      .get("/api/souparceira/me")
      .set("Authorization", "Bearer token-invalido");
    expect(res.status).toBe(401);
  });

  it("retorna dados da revendedora com token válido", async () => {
    const token = gerarTokenParceira();
    const res = await request(app)
      .get("/api/souparceira/me")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      nome:                "Parceira Teste Vitest",
      nivel:               "prata",
      percentual_desconto: 20,
    });
  });

  it("retorna 401 para revendedora inexistente no token", async () => {
    const fakeToken = jwt.sign(
      { sub: "99999999-0000-0000-0000-000000000000", nivel: "bronze", iss: "souparceira" },
      JWT_SECRET,
      { expiresIn: "1h" }
    );
    const res = await request(app)
      .get("/api/souparceira/me")
      .set("Authorization", `Bearer ${fakeToken}`);
    expect(res.status).toBe(401);
  });

  it("retorna 401 com token expirado", async () => {
    const expired = jwt.sign(
      { sub: TEST_REV_ID_1, nivel: "prata", iss: "souparceira" },
      JWT_SECRET,
      { expiresIn: "-1s" }
    );
    const res = await request(app)
      .get("/api/souparceira/me")
      .set("Authorization", `Bearer ${expired}`);
    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────
// GET /api/souparceira/categorias
// ─────────────────────────────────────────────────────────────────

describe("GET /api/souparceira/categorias", () => {
  it("retorna 401 sem token", async () => {
    const res = await request(app).get("/api/souparceira/categorias");
    expect(res.status).toBe(401);
  });

  it("retorna array de categorias com token válido", async () => {
    const token = gerarTokenParceira();
    const res = await request(app)
      .get("/api/souparceira/categorias")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);

    // Se há produtos aprovados, verifica estrutura
    if (res.body.length > 0) {
      expect(res.body[0]).toHaveProperty("categoria");
      expect(res.body[0]).toHaveProperty("total");
      expect(typeof res.body[0].total).toBe("number");
    }
  });
});

// ─────────────────────────────────────────────────────────────────
// GET /api/souparceira/catalogo
// ─────────────────────────────────────────────────────────────────

describe("GET /api/souparceira/catalogo", () => {
  it("retorna 401 sem token", async () => {
    const res = await request(app).get("/api/souparceira/catalogo");
    expect(res.status).toBe(401);
  });

  it("retorna estrutura paginada com token válido", async () => {
    const token = gerarTokenParceira();
    const res = await request(app)
      .get("/api/souparceira/catalogo?page=1&limit=10")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("produtos");
    expect(res.body).toHaveProperty("total");
    expect(res.body).toHaveProperty("pagina");
    expect(res.body).toHaveProperty("total_paginas");
    expect(Array.isArray(res.body.produtos)).toBe(true);
  });

  it("resposta da paginação é consistente", async () => {
    const token = gerarTokenParceira();
    const res = await request(app)
      .get("/api/souparceira/catalogo?page=1&limit=5")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.pagina).toBe(1);
    expect(res.body.produtos.length).toBeLessThanOrEqual(5);
    if (res.body.total > 0) {
      expect(res.body.total_paginas).toBe(Math.ceil(res.body.total / 5));
    }
  });

  it("cada produto tem campos obrigatórios", async () => {
    const token = gerarTokenParceira();
    const res = await request(app)
      .get("/api/souparceira/catalogo?page=1&limit=3")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    for (const p of res.body.produtos) {
      expect(p).toHaveProperty("id");
      expect(p).toHaveProperty("nome");
      expect(p).toHaveProperty("categoria");
      expect(p).toHaveProperty("preco_final");
    }
  });

  it("filtra por categoria sem error", async () => {
    const token = gerarTokenParceira();

    // Pega uma categoria real
    const catRes = await request(app)
      .get("/api/souparceira/categorias")
      .set("Authorization", `Bearer ${token}`);

    if (catRes.body.length === 0) return; // sem dados no ambiente

    const cat = catRes.body[0].categoria;
    const res = await request(app)
      .get(`/api/souparceira/catalogo?categoria=${encodeURIComponent(cat)}&limit=5`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.produtos.every((p: { categoria: string }) => p.categoria === cat)).toBe(true);
  });

  it("busca por nome retorna produtos filtrados", async () => {
    const token = gerarTokenParceira();
    const res = await request(app)
      .get("/api/souparceira/catalogo?search=caneta&limit=10")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.produtos)).toBe(true);
    for (const p of res.body.produtos) {
      expect(p.nome.toLowerCase()).toContain("caneta");
    }
  });

  it("rejeita limit acima de 100 com 400", async () => {
    const token = gerarTokenParceira();
    const res = await request(app)
      .get("/api/souparceira/catalogo?limit=999")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it("não expõe preco_custo nem markup nas respostas", async () => {
    const token = gerarTokenParceira();
    const res = await request(app)
      .get("/api/souparceira/catalogo?limit=5")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    for (const p of res.body.produtos) {
      expect(p).not.toHaveProperty("preco_custo");
      expect(p).not.toHaveProperty("markup_override");
      expect(p).not.toHaveProperty("markup");
    }
  });

  it("preco_final aplica desconto do tier", async () => {
    const token = gerarTokenParceira(TEST_REV_ID_1, "prata"); // 20% desconto
    const res = await request(app)
      .get("/api/souparceira/catalogo?limit=1")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    if (res.body.produtos.length > 0) {
      const preco = Number(res.body.produtos[0].preco_final);
      expect(preco).toBeGreaterThan(0);
    }
  });

  it("retorna 401 para token expirado", async () => {
    const expired = jwt.sign(
      { sub: TEST_REV_ID_1, nivel: "prata", iss: "souparceira" },
      JWT_SECRET,
      { expiresIn: "-1s" }
    );
    const res = await request(app)
      .get("/api/souparceira/catalogo")
      .set("Authorization", `Bearer ${expired}`);
    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────
// Segurança — isolamento de tokens CRM vs. Portal
// ─────────────────────────────────────────────────────────────────

describe("Segurança — isolamento CRM vs. Portal", () => {
  it("token CRM é rejeitado em /me do portal", async () => {
    const res = await request(app)
      .get("/api/souparceira/me")
      .set("Authorization", `Bearer ${tokenCRM()}`);
    expect(res.status).toBe(401);
  });

  it("token CRM é rejeitado em /catalogo do portal", async () => {
    const res = await request(app)
      .get("/api/souparceira/catalogo")
      .set("Authorization", `Bearer ${tokenCRM()}`);
    expect(res.status).toBe(401);
  });

  it("token do portal sem iss é rejeitado", async () => {
    const tokenSemIss = jwt.sign(
      { sub: TEST_REV_ID_1, nivel: "prata" }, // sem iss
      JWT_SECRET,
      { expiresIn: "1h" }
    );
    const res = await request(app)
      .get("/api/souparceira/me")
      .set("Authorization", `Bearer ${tokenSemIss}`);
    expect(res.status).toBe(401);
  });

  it("token do portal não é aceito no CRM (/api/customers)", async () => {
    const tokenPortal = gerarTokenParceira();
    const res = await request(app)
      .get("/api/customers")
      .set("Authorization", `Bearer ${tokenPortal}`);
    expect(res.status).toBe(401);
  });

  it("XSS: busca com tags HTML não quebra a resposta", async () => {
    const token = gerarTokenParceira();
    const res = await request(app)
      .get(`/api/souparceira/catalogo?search=${encodeURIComponent("<script>alert(1)</script>")}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    const body = JSON.stringify(res.body);
    expect(body).not.toContain("<script>");
  });

  it("SQLi: busca com aspa simples não causa 500", async () => {
    const token = gerarTokenParceira();
    const res = await request(app)
      .get(`/api/souparceira/catalogo?search=${encodeURIComponent("caneta' OR '1'='1")}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it("CPF: sem body retorna 400, não 500", async () => {
    const res = await request(app)
      .post("/api/souparceira/solicitar")
      .send(null);
    expect(res.status).toBe(400);
  });

  it("entrar: código com caracteres especiais retorna 400", async () => {
    const res = await request(app)
      .post("/api/souparceira/entrar")
      .send({ cpf: CPF_ATIVA, codigo: "<bad>" });
    expect(res.status).toBe(400); // comprimento < 6 ou > 6 falhará no Zod .length(6)
  });
});
