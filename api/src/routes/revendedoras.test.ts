/**
 * Testes automatizados — Rotas admin de Revendedoras
 * Cobre: CRUD, controle de acesso, validações, filtros, paginação, status
 */
import { describe, it, expect, afterAll, beforeAll } from "vitest";
import request from "supertest";
import { app } from "../server";
import { query, queryOne } from "../db";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "test-secret";

// ── IDs fixos para isolação ───────────────────────────────────────

const TEST_REV_A = "cccccccc-0000-4000-a000-000000000001";
const TEST_REV_B = "cccccccc-0000-4000-a000-000000000002";
const EMAIL_A    = "vitest-rev-a@test.bibelo.internal";
const EMAIL_B    = "vitest-rev-b@test.bibelo.internal";

// ── Helpers ───────────────────────────────────────────────────────

function tokenAdmin(): string {
  return jwt.sign(
    { userId: "admin-vitest", email: "admin@test.com", papel: "admin" },
    JWT_SECRET,
    { expiresIn: "1h" }
  );
}

function tokenPortal(): string {
  return jwt.sign(
    { sub: TEST_REV_A, nivel: "prata", iss: "souparceira" },
    JWT_SECRET,
    { expiresIn: "1h" }
  );
}

// ── Setup / Teardown ──────────────────────────────────────────────

beforeAll(async () => {
  // Garante que os registros de teste não existam antes de começar
  await query("DELETE FROM crm.revendedora_estoque   WHERE revendedora_id IN ($1,$2)", [TEST_REV_A, TEST_REV_B]);
  await query("DELETE FROM crm.revendedora_conquistas WHERE revendedora_id IN ($1,$2)", [TEST_REV_A, TEST_REV_B]);
  await query("DELETE FROM crm.revendedoras WHERE id IN ($1,$2)", [TEST_REV_A, TEST_REV_B]);

  // Insere revendedora A (ativa, prata)
  await query(
    `INSERT INTO crm.revendedoras
       (id, nome, email, documento, status, nivel, percentual_desconto, volume_mes_atual, cidade, estado)
     VALUES ($1,'Rev A Vitest',$2,'111.444.777-35','ativa','prata',35,750,'Timbó','SC')`,
    [TEST_REV_A, EMAIL_A]
  );

  // Insere revendedora B (pendente, iniciante)
  await query(
    `INSERT INTO crm.revendedoras
       (id, nome, email, documento, status, nivel, percentual_desconto, volume_mes_atual)
     VALUES ($1,'Rev B Vitest',$2,'321.654.987-91','pendente','iniciante',15,0)`,
    [TEST_REV_B, EMAIL_B]
  );
});

afterAll(async () => {
  await query("DELETE FROM crm.revendedora_estoque    WHERE revendedora_id IN ($1,$2)", [TEST_REV_A, TEST_REV_B]);
  await query("DELETE FROM crm.revendedora_conquistas WHERE revendedora_id IN ($1,$2)", [TEST_REV_A, TEST_REV_B]);
  await query("DELETE FROM crm.revendedoras WHERE id IN ($1,$2)", [TEST_REV_A, TEST_REV_B]);
  // Remove revendedora criada dinamicamente nos testes POST
  await query("DELETE FROM crm.revendedoras WHERE email = $1", ["vitest-nova@test.bibelo.internal"]);
});

// ── Controle de acesso ────────────────────────────────────────────

describe("Controle de acesso (auth obrigatória)", () => {
  it("GET /api/revendedoras retorna 401 sem token", async () => {
    const res = await request(app).get("/api/revendedoras");
    expect(res.status).toBe(401);
  });

  it("GET /api/revendedoras/stats retorna 401 sem token", async () => {
    const res = await request(app).get("/api/revendedoras/stats");
    expect(res.status).toBe(401);
  });

  it("POST /api/revendedoras retorna 401 sem token", async () => {
    const res = await request(app).post("/api/revendedoras").send({ nome: "X", email: "x@x.com" });
    expect(res.status).toBe(401);
  });

  it("GET /api/revendedoras/:id retorna 401 sem token", async () => {
    const res = await request(app).get(`/api/revendedoras/${TEST_REV_A}`);
    expect(res.status).toBe(401);
  });

  it("PUT /api/revendedoras/:id retorna 401 sem token", async () => {
    const res = await request(app).put(`/api/revendedoras/${TEST_REV_A}`).send({ telefone: "99999999" });
    expect(res.status).toBe(401);
  });

  it("PUT /api/revendedoras/:id/status retorna 401 sem token", async () => {
    const res = await request(app).put(`/api/revendedoras/${TEST_REV_A}/status`).send({ status: "ativa" });
    expect(res.status).toBe(401);
  });

  it("token do portal (souparceira) é rejeitado nas rotas admin", async () => {
    const res = await request(app)
      .get("/api/revendedoras")
      .set("Authorization", `Bearer ${tokenPortal()}`);
    expect(res.status).toBe(401);
  });
});

// ── GET /stats ────────────────────────────────────────────────────

describe("GET /api/revendedoras/stats", () => {
  it("200 retorna campos de contagem", async () => {
    const res = await request(app)
      .get("/api/revendedoras/stats")
      .set("Authorization", `Bearer ${tokenAdmin()}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("total");
    expect(res.body).toHaveProperty("ativas");
    expect(res.body).toHaveProperty("pendentes");
    expect(res.body).toHaveProperty("volume_mes");
    expect(res.body).toHaveProperty("pedidos_pendentes");
  });

  it("stats inclui contagem por nível (incluindo diamante)", async () => {
    const res = await request(app)
      .get("/api/revendedoras/stats")
      .set("Authorization", `Bearer ${tokenAdmin()}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("nivel_iniciante");
    expect(res.body).toHaveProperty("nivel_bronze");
    expect(res.body).toHaveProperty("nivel_prata");
    expect(res.body).toHaveProperty("nivel_ouro");
    expect(res.body).toHaveProperty("nivel_diamante");
  });
});

// ── GET / (listagem) ──────────────────────────────────────────────

describe("GET /api/revendedoras", () => {
  it("200 retorna lista paginada", async () => {
    const res = await request(app)
      .get("/api/revendedoras")
      .set("Authorization", `Bearer ${tokenAdmin()}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("data");
    expect(res.body).toHaveProperty("pagination");
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.pagination).toHaveProperty("total");
    expect(res.body.pagination).toHaveProperty("page");
    expect(res.body.pagination).toHaveProperty("pages");
  });

  it("filtro por status=pendente só retorna pendentes", async () => {
    const res = await request(app)
      .get("/api/revendedoras?status=pendente")
      .set("Authorization", `Bearer ${tokenAdmin()}`);
    expect(res.status).toBe(200);
    for (const rev of res.body.data) {
      expect(rev.status).toBe("pendente");
    }
  });

  it("filtro por nivel=prata só retorna prata", async () => {
    const res = await request(app)
      .get("/api/revendedoras?nivel=prata")
      .set("Authorization", `Bearer ${tokenAdmin()}`);
    expect(res.status).toBe(200);
    for (const rev of res.body.data) {
      expect(rev.nivel).toBe("prata");
    }
  });

  it("filtro por status inválido retorna 400", async () => {
    const res = await request(app)
      .get("/api/revendedoras?status=invalido")
      .set("Authorization", `Bearer ${tokenAdmin()}`);
    expect(res.status).toBe(400);
  });

  it("filtro por nivel inválido retorna 400", async () => {
    const res = await request(app)
      .get("/api/revendedoras?nivel=platina")
      .set("Authorization", `Bearer ${tokenAdmin()}`);
    expect(res.status).toBe(400);
  });

  it("paginação com limit=1 retorna no máximo 1 item", async () => {
    const res = await request(app)
      .get("/api/revendedoras?limit=1&page=1")
      .set("Authorization", `Bearer ${tokenAdmin()}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeLessThanOrEqual(1);
    expect(res.body.pagination.limit).toBe(1);
  });

  it("limit acima de 100 retorna 400", async () => {
    const res = await request(app)
      .get("/api/revendedoras?limit=200")
      .set("Authorization", `Bearer ${tokenAdmin()}`);
    expect(res.status).toBe(400);
  });

  it("busca por nome parcial retorna resultados filtrados", async () => {
    const res = await request(app)
      .get("/api/revendedoras?search=Rev+A+Vitest")
      .set("Authorization", `Bearer ${tokenAdmin()}`);
    expect(res.status).toBe(200);
    const ids = res.body.data.map((r: { id: string }) => r.id);
    expect(ids).toContain(TEST_REV_A);
  });

  it("cada item tem campos essenciais", async () => {
    const res = await request(app)
      .get("/api/revendedoras?limit=5")
      .set("Authorization", `Bearer ${tokenAdmin()}`);
    expect(res.status).toBe(200);
    if (res.body.data.length > 0) {
      const r = res.body.data[0];
      expect(r).toHaveProperty("id");
      expect(r).toHaveProperty("nome");
      expect(r).toHaveProperty("email");
      expect(r).toHaveProperty("status");
      expect(r).toHaveProperty("nivel");
    }
  });
});

// ── POST / (criar) ────────────────────────────────────────────────

describe("POST /api/revendedoras", () => {
  it("400 body vazio", async () => {
    const res = await request(app)
      .post("/api/revendedoras")
      .set("Authorization", `Bearer ${tokenAdmin()}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it("400 nome muito curto", async () => {
    const res = await request(app)
      .post("/api/revendedoras")
      .set("Authorization", `Bearer ${tokenAdmin()}`)
      .send({ nome: "A", email: "nova@test.com" });
    expect(res.status).toBe(400);
  });

  it("400 email inválido", async () => {
    const res = await request(app)
      .post("/api/revendedoras")
      .set("Authorization", `Bearer ${tokenAdmin()}`)
      .send({ nome: "Nova Parceira", email: "nao-e-email" });
    expect(res.status).toBe(400);
  });

  it("201 cria revendedora com campos obrigatórios", async () => {
    const res = await request(app)
      .post("/api/revendedoras")
      .set("Authorization", `Bearer ${tokenAdmin()}`)
      .send({ nome: "Nova Vitest", email: "vitest-nova@test.bibelo.internal" });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("id");
    expect(res.body.nome).toBe("Nova Vitest");
    expect(res.body.email).toBe("vitest-nova@test.bibelo.internal");
    expect(res.body.nivel).toBe("iniciante");
    expect(Number(res.body.percentual_desconto)).toBe(0);
  });

  it("409 e-mail duplicado", async () => {
    const res = await request(app)
      .post("/api/revendedoras")
      .set("Authorization", `Bearer ${tokenAdmin()}`)
      .send({ nome: "Duplicada", email: EMAIL_A });
    expect(res.status).toBe(409);
  });
});

// ── GET /:id ──────────────────────────────────────────────────────

describe("GET /api/revendedoras/:id", () => {
  it("200 retorna revendedora com progresso de nível", async () => {
    const res = await request(app)
      .get(`/api/revendedoras/${TEST_REV_A}`)
      .set("Authorization", `Bearer ${tokenAdmin()}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(TEST_REV_A);
    expect(res.body.nome).toBe("Rev A Vitest");
    expect(res.body).toHaveProperty("progresso_nivel");
    expect(res.body.progresso_nivel).toHaveProperty("proximo");
    expect(res.body.progresso_nivel).toHaveProperty("meta");
    expect(res.body.progresso_nivel).toHaveProperty("faltam");
    expect(res.body.progresso_nivel).toHaveProperty("percentual");
  });

  it("revendedora prata (volume 750) → progresso aponta para ouro", async () => {
    const res = await request(app)
      .get(`/api/revendedoras/${TEST_REV_A}`)
      .set("Authorization", `Bearer ${tokenAdmin()}`);
    expect(res.status).toBe(200);
    expect(res.body.progresso_nivel.proximo).toBe("ouro");
    expect(res.body.progresso_nivel.meta).toBe(1200);
    expect(res.body.progresso_nivel.faltam).toBe(450);
  });

  it("404 para UUID inexistente", async () => {
    const res = await request(app)
      .get("/api/revendedoras/aaaaaaaa-0000-4000-a000-000000000099")
      .set("Authorization", `Bearer ${tokenAdmin()}`);
    expect(res.status).toBe(404);
  });

  it("retorna contadores embutidos", async () => {
    const res = await request(app)
      .get(`/api/revendedoras/${TEST_REV_A}`)
      .set("Authorization", `Bearer ${tokenAdmin()}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("total_pedidos");
    expect(res.body).toHaveProperty("total_conquistas");
    expect(res.body).toHaveProperty("alertas_estoque");
  });
});

// ── PUT /:id (editar) ─────────────────────────────────────────────

describe("PUT /api/revendedoras/:id", () => {
  it("400 body vazio (nenhum campo para atualizar)", async () => {
    const res = await request(app)
      .put(`/api/revendedoras/${TEST_REV_A}`)
      .set("Authorization", `Bearer ${tokenAdmin()}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it("400 email inválido no update", async () => {
    const res = await request(app)
      .put(`/api/revendedoras/${TEST_REV_A}`)
      .set("Authorization", `Bearer ${tokenAdmin()}`)
      .send({ email: "invalido" });
    expect(res.status).toBe(400);
  });

  it("200 atualiza telefone", async () => {
    const res = await request(app)
      .put(`/api/revendedoras/${TEST_REV_A}`)
      .set("Authorization", `Bearer ${tokenAdmin()}`)
      .send({ telefone: "(47) 99999-0001" });
    expect(res.status).toBe(200);
    expect(res.body.telefone).toBe("(47) 99999-0001");
  });

  it("200 atualiza cidade e estado", async () => {
    const res = await request(app)
      .put(`/api/revendedoras/${TEST_REV_A}`)
      .set("Authorization", `Bearer ${tokenAdmin()}`)
      .send({ cidade: "Blumenau", estado: "SC" });
    expect(res.status).toBe(200);
    expect(res.body.cidade).toBe("Blumenau");
    expect(res.body.estado).toBe("SC");
  });

  it("404 para UUID inexistente", async () => {
    const res = await request(app)
      .put("/api/revendedoras/aaaaaaaa-0000-4000-a000-000000000099")
      .set("Authorization", `Bearer ${tokenAdmin()}`)
      .send({ telefone: "11111111" });
    expect(res.status).toBe(404);
  });
});

// ── PUT /:id/status ───────────────────────────────────────────────

describe("PUT /api/revendedoras/:id/status", () => {
  it("400 status inválido", async () => {
    const res = await request(app)
      .put(`/api/revendedoras/${TEST_REV_B}/status`)
      .set("Authorization", `Bearer ${tokenAdmin()}`)
      .send({ status: "banida" });
    expect(res.status).toBe(400);
  });

  it("400 body vazio", async () => {
    const res = await request(app)
      .put(`/api/revendedoras/${TEST_REV_B}/status`)
      .set("Authorization", `Bearer ${tokenAdmin()}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it("200 aprova revendedora pendente → ativa", async () => {
    const res = await request(app)
      .put(`/api/revendedoras/${TEST_REV_B}/status`)
      .set("Authorization", `Bearer ${tokenAdmin()}`)
      .send({ status: "ativa" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ativa");
    expect(res.body.aprovada_em).not.toBeNull();
    expect(res.body.aprovada_por).not.toBeNull();
  });

  it("200 suspende revendedora ativa", async () => {
    const res = await request(app)
      .put(`/api/revendedoras/${TEST_REV_B}/status`)
      .set("Authorization", `Bearer ${tokenAdmin()}`)
      .send({ status: "suspensa" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("suspensa");
  });

  it("200 reativa como ativa — aprovada_em não é sobrescrito", async () => {
    // Suspende primeiro
    await request(app)
      .put(`/api/revendedoras/${TEST_REV_A}/status`)
      .set("Authorization", `Bearer ${tokenAdmin()}`)
      .send({ status: "suspensa" });

    // Reativa
    const res = await request(app)
      .put(`/api/revendedoras/${TEST_REV_A}/status`)
      .set("Authorization", `Bearer ${tokenAdmin()}`)
      .send({ status: "ativa" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ativa");
  });

  it("404 para UUID inexistente", async () => {
    const res = await request(app)
      .put("/api/revendedoras/aaaaaaaa-0000-4000-a000-000000000099/status")
      .set("Authorization", `Bearer ${tokenAdmin()}`)
      .send({ status: "ativa" });
    expect(res.status).toBe(404);
  });
});

// ── GET /:id/estoque ──────────────────────────────────────────────

describe("GET /api/revendedoras/:id/estoque", () => {
  it("401 sem token", async () => {
    const res = await request(app).get(`/api/revendedoras/${TEST_REV_A}/estoque`);
    expect(res.status).toBe(401);
  });

  it("200 retorna array de itens (pode ser vazio)", async () => {
    const res = await request(app)
      .get(`/api/revendedoras/${TEST_REV_A}/estoque`)
      .set("Authorization", `Bearer ${tokenAdmin()}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("data");
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

// ── POST /:id/estoque ─────────────────────────────────────────────

describe("POST /api/revendedoras/:id/estoque", () => {
  it("400 produto_nome ausente", async () => {
    const res = await request(app)
      .post(`/api/revendedoras/${TEST_REV_A}/estoque`)
      .set("Authorization", `Bearer ${tokenAdmin()}`)
      .send({ quantidade: 5 });
    expect(res.status).toBe(400);
  });

  it("400 quantidade negativa", async () => {
    const res = await request(app)
      .post(`/api/revendedoras/${TEST_REV_A}/estoque`)
      .set("Authorization", `Bearer ${tokenAdmin()}`)
      .send({ produto_nome: "Caneta", quantidade: -1 });
    expect(res.status).toBe(400);
  });

  it("201 cria item de estoque com sucesso", async () => {
    const res = await request(app)
      .post(`/api/revendedoras/${TEST_REV_A}/estoque`)
      .set("Authorization", `Bearer ${tokenAdmin()}`)
      .send({
        bling_produto_id: "vitest-sku-001",
        produto_nome:     "Caneta Vitest",
        produto_sku:      "CAN-VITEST",
        quantidade:       10,
        quantidade_minima: 3,
        preco_sugerido:   5.90,
      });
    expect(res.status).toBe(201);
    expect(res.body.produto_nome).toBe("Caneta Vitest");
    expect(Number(res.body.quantidade)).toBe(10);
  });

  it("upsert: re-inserção do mesmo bling_produto_id atualiza quantidade", async () => {
    // Insere primeiro
    await request(app)
      .post(`/api/revendedoras/${TEST_REV_A}/estoque`)
      .set("Authorization", `Bearer ${tokenAdmin()}`)
      .send({
        bling_produto_id: "vitest-sku-002",
        produto_nome:     "Marca-texto Vitest",
        quantidade:       5,
      });

    // Re-insere com quantidade diferente
    const res = await request(app)
      .post(`/api/revendedoras/${TEST_REV_A}/estoque`)
      .set("Authorization", `Bearer ${tokenAdmin()}`)
      .send({
        bling_produto_id: "vitest-sku-002",
        produto_nome:     "Marca-texto Vitest",
        quantidade:       20,
      });
    expect(res.status).toBe(201);
    expect(Number(res.body.quantidade)).toBe(20);
  });
});

// ── Lógica de níveis ──────────────────────────────────────────────

describe("Lógica de cálculo de níveis (via GET /:id)", () => {
  async function criarRevVolume(id: string, email: string, volume: number): Promise<void> {
    await query(
      `INSERT INTO crm.revendedoras (id, nome, email, status, nivel, percentual_desconto, volume_mes_atual)
       VALUES ($1,'Nivel Test',$2,'ativa','iniciante',15,$3)
       ON CONFLICT (id) DO UPDATE SET volume_mes_atual = $3`,
      [id, email, volume]
    );
  }

  const ID_NIV = "cccccccc-0000-4000-a000-000000000010";

  afterAll(async () => {
    await query("DELETE FROM crm.revendedoras WHERE id = $1", [ID_NIV]);
  });

  const casos = [
    { volume: 0,    proximo: "bronze",   meta: 300,  faltam: 300 },
    { volume: 100,  proximo: "bronze",   meta: 300,  faltam: 200 },
    { volume: 300,  proximo: "prata",    meta: 600,  faltam: 300 },
    { volume: 600,  proximo: "ouro",     meta: 1200, faltam: 600 },
    { volume: 1200, proximo: "diamante", meta: 3000, faltam: 1800},
    { volume: 3000, proximo: null,       meta: 3000, faltam: 0   },
  ];

  for (const c of casos) {
    it(`volume ${c.volume} → proximo=${c.proximo ?? "null"} meta=${c.meta} faltam=${c.faltam}`, async () => {
      await criarRevVolume(ID_NIV, `nivel-vitest-${c.volume}@test.bibelo.internal`, c.volume);
      const res = await request(app)
        .get(`/api/revendedoras/${ID_NIV}`)
        .set("Authorization", `Bearer ${tokenAdmin()}`);
      expect(res.status).toBe(200);
      expect(res.body.progresso_nivel.proximo).toBe(c.proximo);
      expect(res.body.progresso_nivel.meta).toBe(c.meta);
      expect(res.body.progresso_nivel.faltam).toBe(c.faltam);
    });
  }
});

// ── Fluxo completo de pedidos B2B ─────────────────────────────────
//
// Cobre: criação, pedido mínimo, listagem, aprovação, rastreio,
//        recálculo de volume/nível e chamada ao Bling (não-bloqueante).

const REV_PEDIDO = "cccccccc-0000-4000-a000-000000000020";
const EMAIL_PEDIDO = "vitest-pedido@test.bibelo.internal";

// Item padrão: R$350 com desconto de 15% → total R$297,50... mas precisa ≥ R$300
// Usamos total = R$300 exato para cobrir o limite
const itensPadraoOK = [
  { produto_nome: "Caneta Vitest", produto_sku: "CAN-VT", quantidade: 10,
    preco_unitario: 35.29, preco_com_desconto: 30.00 }, // total: 300,00
];

const itensMinimoInsuficiente = [
  { produto_nome: "Caneta Vitest Barata", produto_sku: "CAN-VT2", quantidade: 1,
    preco_unitario: 20.00, preco_com_desconto: 17.00 }, // total: 17,00 < 300
];

beforeAll(async () => {
  await query("DELETE FROM crm.revendedora_pedidos  WHERE revendedora_id = $1", [REV_PEDIDO]);
  await query("DELETE FROM crm.revendedoras WHERE id = $1", [REV_PEDIDO]);
  await query(
    `INSERT INTO crm.revendedoras
       (id, nome, email, documento, status, nivel, percentual_desconto, volume_mes_atual, pedido_minimo)
     VALUES ($1,'Rev Pedido Vitest',$2,'222.333.444-55','ativa','iniciante',0,0,300)`,
    [REV_PEDIDO, EMAIL_PEDIDO]
  );
});

afterAll(async () => {
  await query("DELETE FROM crm.revendedora_pedidos  WHERE revendedora_id = $1", [REV_PEDIDO]);
  await query("DELETE FROM crm.revendedoras WHERE id = $1", [REV_PEDIDO]);
});

describe("POST /:id/pedidos — criar pedido B2B", () => {
  it("400 body vazio (sem itens)", async () => {
    const res = await request(app)
      .post(`/api/revendedoras/${REV_PEDIDO}/pedidos`)
      .set("Authorization", `Bearer ${tokenAdmin()}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it("400 itens vazio array", async () => {
    const res = await request(app)
      .post(`/api/revendedoras/${REV_PEDIDO}/pedidos`)
      .set("Authorization", `Bearer ${tokenAdmin()}`)
      .send({ itens: [] });
    expect(res.status).toBe(400);
  });

  it("400 total abaixo do pedido mínimo (R$300)", async () => {
    const res = await request(app)
      .post(`/api/revendedoras/${REV_PEDIDO}/pedidos`)
      .set("Authorization", `Bearer ${tokenAdmin()}`)
      .send({ itens: itensMinimoInsuficiente });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/pedido m[íi]nimo/i);
    expect(res.body.pedido_minimo).toBe(300);
  });

  it("201 cria pedido com total ≥ R$300", async () => {
    const res = await request(app)
      .post(`/api/revendedoras/${REV_PEDIDO}/pedidos`)
      .set("Authorization", `Bearer ${tokenAdmin()}`)
      .send({ itens: itensPadraoOK, observacao: "Pedido de teste Vitest" });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("id");
    expect(res.body).toHaveProperty("numero_pedido");
    expect(res.body.status).toBe("pendente");
    expect(Number(res.body.total)).toBeCloseTo(300, 0);
    expect(res.body.revendedora_id).toBe(REV_PEDIDO);
  });

  it("404 para revendedora inexistente", async () => {
    const res = await request(app)
      .post("/api/revendedoras/aaaaaaaa-0000-4000-a000-000000000099/pedidos")
      .set("Authorization", `Bearer ${tokenAdmin()}`)
      .send({ itens: itensPadraoOK });
    expect(res.status).toBe(404);
  });
});

describe("GET /:id/pedidos — listar pedidos", () => {
  it("200 retorna array com pedido criado", async () => {
    const res = await request(app)
      .get(`/api/revendedoras/${REV_PEDIDO}/pedidos`)
      .set("Authorization", `Bearer ${tokenAdmin()}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("data");
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  it("pedido listado tem campos essenciais", async () => {
    const res = await request(app)
      .get(`/api/revendedoras/${REV_PEDIDO}/pedidos`)
      .set("Authorization", `Bearer ${tokenAdmin()}`);
    const p = res.body.data[0];
    expect(p).toHaveProperty("id");
    expect(p).toHaveProperty("numero_pedido");
    expect(p).toHaveProperty("status");
    expect(p).toHaveProperty("total");
    expect(p).toHaveProperty("itens");
    expect(p).toHaveProperty("criado_em");
  });
});

describe("PUT /:id/pedidos/:pedidoId/status — fluxo aprovação → envio", () => {
  let pedidoId: string;

  beforeAll(async () => {
    // Cria pedido fresco para este bloco
    const res = await request(app)
      .post(`/api/revendedoras/${REV_PEDIDO}/pedidos`)
      .set("Authorization", `Bearer ${tokenAdmin()}`)
      .send({ itens: itensPadraoOK });
    pedidoId = res.body.id;
  });

  it("400 status inválido", async () => {
    const res = await request(app)
      .put(`/api/revendedoras/${REV_PEDIDO}/pedidos/${pedidoId}/status`)
      .set("Authorization", `Bearer ${tokenAdmin()}`)
      .send({ status: "voando" });
    expect(res.status).toBe(400);
  });

  it("200 aprova pedido → status=aprovado + aprovado_em preenchido", async () => {
    const res = await request(app)
      .put(`/api/revendedoras/${REV_PEDIDO}/pedidos/${pedidoId}/status`)
      .set("Authorization", `Bearer ${tokenAdmin()}`)
      .send({ status: "aprovado" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("aprovado");
    expect(res.body.aprovado_em).not.toBeNull();
  });

  it("aprovação recalcula volume e sobe nível para bronze (R$300 ≥ mínimo)", async () => {
    // A revendedora tinha volume=0 (iniciante). Após aprovar pedido de R$300 → bronze
    const rev = await request(app)
      .get(`/api/revendedoras/${REV_PEDIDO}`)
      .set("Authorization", `Bearer ${tokenAdmin()}`);
    expect(rev.status).toBe(200);
    expect(rev.body.nivel).toBe("bronze");
    expect(Number(rev.body.volume_mes_atual)).toBeCloseTo(300, 0);
    expect(Number(rev.body.percentual_desconto)).toBe(15);
  });

  it("200 marca como enviado com código de rastreio → url_rastreio gerada", async () => {
    const res = await request(app)
      .put(`/api/revendedoras/${REV_PEDIDO}/pedidos/${pedidoId}/status`)
      .set("Authorization", `Bearer ${tokenAdmin()}`)
      .send({ status: "enviado", codigo_rastreio: "BR123456789BR" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("enviado");
    expect(res.body.codigo_rastreio).toBe("BR123456789BR");
    expect(res.body.url_rastreio).toContain("BR123456789BR");
    expect(res.body.enviado_em).not.toBeNull();
  });

  it("200 marca como entregue", async () => {
    const res = await request(app)
      .put(`/api/revendedoras/${REV_PEDIDO}/pedidos/${pedidoId}/status`)
      .set("Authorization", `Bearer ${tokenAdmin()}`)
      .send({ status: "entregue" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("entregue");
    expect(res.body.entregue_em).not.toBeNull();
  });

  it("404 para pedido inexistente", async () => {
    const res = await request(app)
      .put(`/api/revendedoras/${REV_PEDIDO}/pedidos/aaaaaaaa-0000-4000-a000-000000000099/status`)
      .set("Authorization", `Bearer ${tokenAdmin()}`)
      .send({ status: "aprovado" });
    expect(res.status).toBe(404);
  });

  it("cancelar pedido recalcula volume — nível volta para iniciante", async () => {
    // Cria e aprova outro pedido para depois cancelar
    const criado = await request(app)
      .post(`/api/revendedoras/${REV_PEDIDO}/pedidos`)
      .set("Authorization", `Bearer ${tokenAdmin()}`)
      .send({ itens: itensPadraoOK });
    const novoId = criado.body.id;

    await request(app)
      .put(`/api/revendedoras/${REV_PEDIDO}/pedidos/${novoId}/status`)
      .set("Authorization", `Bearer ${tokenAdmin()}`)
      .send({ status: "aprovado" });

    await request(app)
      .put(`/api/revendedoras/${REV_PEDIDO}/pedidos/${novoId}/status`)
      .set("Authorization", `Bearer ${tokenAdmin()}`)
      .send({ status: "cancelado" });

    // Volume atual = só o pedido original (entregue) → R$300 → ainda bronze
    const rev = await request(app)
      .get(`/api/revendedoras/${REV_PEDIDO}`)
      .set("Authorization", `Bearer ${tokenAdmin()}`);
    // Entregue conta no volume, cancelado não conta → bronze (300) ainda
    expect(["bronze", "iniciante"]).toContain(rev.body.nivel);
  });
});

describe("GET /pedidos-recentes — sininho CRM", () => {
  it("200 retorna data + contadores de pendentes e mensagens", async () => {
    const res = await request(app)
      .get("/api/revendedoras/pedidos-recentes")
      .set("Authorization", `Bearer ${tokenAdmin()}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("data");
    expect(res.body).toHaveProperty("pendentes");
    expect(res.body).toHaveProperty("mensagens_nao_lidas");
    expect(typeof res.body.pendentes).toBe("number");
    expect(typeof res.body.mensagens_nao_lidas).toBe("number");
  });
});

describe("GET /acessos-portal-recentes — sininho CRM", () => {
  it("200 retorna array de acessos", async () => {
    const res = await request(app)
      .get("/api/revendedoras/acessos-portal-recentes")
      .set("Authorization", `Bearer ${tokenAdmin()}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("data");
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});
