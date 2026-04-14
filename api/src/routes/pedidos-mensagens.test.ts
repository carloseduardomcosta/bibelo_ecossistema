/**
 * Testes automatizados — Pedidos Portal + Mensagens + Notificações
 * Cobre: POST /pedidos (portal), GET /pedidos, mensagens portal, mensagens CRM,
 *        notificações (GET, lida, lida-tudo), pedidos-recentes
 * Segurança: auth, UUID forjado, XSS, limite de mensagens, isolação entre revendedoras
 */
import { describe, it, expect, afterAll, beforeAll } from "vitest";
import request from "supertest";
import { app } from "../server";
import { query, queryOne } from "../db";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "test-secret";

// ── IDs de teste ─────────────────────────────────────────────────

const REV_ID_A  = "dddddddd-0000-4000-a000-000000000001";
const REV_ID_B  = "dddddddd-0000-4000-a000-000000000002"; // outra revendedora (isolação)
const PROD_ID_1 = "eeeeeeee-0000-4000-a000-000000000001";
const PROD_ID_2 = "eeeeeeee-0000-4000-a000-000000000002";

let pedidoIdA: string;  // criado durante os testes
let pedidoIdB: string;

// ── Helpers ───────────────────────────────────────────────────────

function tokenPortal(revId = REV_ID_A): string {
  return jwt.sign({ sub: revId, nivel: "prata", iss: "souparceira" }, JWT_SECRET, { expiresIn: "1h" });
}

function tokenCRM(): string {
  return jwt.sign(
    { userId: "admin-test", email: "admin@test.com", papel: "admin" },
    JWT_SECRET,
    { expiresIn: "1h" }
  );
}

// ── Setup ─────────────────────────────────────────────────────────

beforeAll(async () => {
  // Revendedora A (ativa, prata) — pedido_minimo=10 para testes de criação
  await query(
    `INSERT INTO crm.revendedoras (id, nome, email, documento, status, nivel, percentual_desconto, pedido_minimo)
     VALUES ($1,'Parceira A Pedido','revA-pedidos@vitest.bibelo.internal','111.444.777-35','ativa','prata',20,10.00)
     ON CONFLICT (id) DO UPDATE SET status='ativa', nome='Parceira A Pedido', email='revA-pedidos@vitest.bibelo.internal', percentual_desconto=20, pedido_minimo=10.00`,
    [REV_ID_A]
  );

  // Revendedora B (ativa) — pedido_minimo=10 para testes de criação
  await query(
    `INSERT INTO crm.revendedoras (id, nome, email, documento, status, nivel, percentual_desconto, pedido_minimo)
     VALUES ($1,'Parceira B Pedido','revB-pedidos@vitest.bibelo.internal','321.654.987-91','ativa','bronze',10,10.00)
     ON CONFLICT (id) DO UPDATE SET status='ativa', nome='Parceira B Pedido', email='revB-pedidos@vitest.bibelo.internal', percentual_desconto=10, pedido_minimo=10.00`,
    [REV_ID_B]
  );

  // Produtos aprovados no catálogo
  await query(
    `INSERT INTO sync.fornecedor_catalogo_jc
       (id, item_id, nome, preco_custo, status, slug_categoria)
     VALUES ($1,'TEST-ITEM-1','Produto Vitest A',10.00,'aprovado','canetas')
     ON CONFLICT (id) DO UPDATE SET nome='Produto Vitest A', preco_custo=10.00, status='aprovado'`,
    [PROD_ID_1]
  );
  await query(
    `INSERT INTO sync.fornecedor_catalogo_jc
       (id, item_id, nome, preco_custo, status, slug_categoria)
     VALUES ($1,'TEST-ITEM-2','Produto Vitest B',5.00,'aprovado','cadernos')
     ON CONFLICT (id) DO UPDATE SET nome='Produto Vitest B', preco_custo=5.00, status='aprovado'`,
    [PROD_ID_2]
  );

  // Markup fixo para categorias de teste (DO UPDATE garante 2.00 sempre)
  await query(
    `INSERT INTO sync.fornecedor_markup_categorias (categoria, markup)
     VALUES ('canetas', 2.00), ('cadernos', 2.00)
     ON CONFLICT (categoria) DO UPDATE SET markup = 2.00`
  );
});

afterAll(async () => {
  // Cleanup ordenado (FK)
  await query("DELETE FROM crm.revendedora_pedido_mensagens WHERE pedido_id IN (SELECT id FROM crm.revendedora_pedidos WHERE revendedora_id IN ($1,$2))", [REV_ID_A, REV_ID_B]);
  await query("DELETE FROM crm.revendedora_pedidos WHERE revendedora_id IN ($1,$2)", [REV_ID_A, REV_ID_B]);
  await query("DELETE FROM public.notificacoes WHERE tipo IN ('novo_pedido','nova_mensagem_revendedora') AND titulo LIKE 'REV-%'", []);
  await query("DELETE FROM sync.fornecedor_catalogo_jc WHERE id IN ($1,$2)", [PROD_ID_1, PROD_ID_2]);
  await query("DELETE FROM sync.fornecedor_markup_categorias WHERE categoria IN ('canetas','cadernos')");
  await query("DELETE FROM crm.revendedoras WHERE id IN ($1,$2)", [REV_ID_A, REV_ID_B]);
});

// ══════════════════════════════════════════════════════════════════
// POST /souparceira/pedidos
// ══════════════════════════════════════════════════════════════════

describe("POST /api/souparceira/pedidos", () => {
  it("401 sem token", async () => {
    const res = await request(app)
      .post("/api/souparceira/pedidos")
      .send({ itens: [{ produto_id: PROD_ID_1, quantidade: 1 }] });
    expect(res.status).toBe(401);
  });

  it("401 token CRM (não portal)", async () => {
    const res = await request(app)
      .post("/api/souparceira/pedidos")
      .set("Authorization", `Bearer ${tokenCRM()}`)
      .send({ itens: [{ produto_id: PROD_ID_1, quantidade: 1 }] });
    expect(res.status).toBe(401);
  });

  it("400 itens vazio", async () => {
    const res = await request(app)
      .post("/api/souparceira/pedidos")
      .set("Authorization", `Bearer ${tokenPortal()}`)
      .send({ itens: [] });
    expect(res.status).toBe(400);
  });

  it("400 produto não existente", async () => {
    const res = await request(app)
      .post("/api/souparceira/pedidos")
      .set("Authorization", `Bearer ${tokenPortal()}`)
      .send({ itens: [{ produto_id: "00000000-0000-4000-a000-000000000999", quantidade: 1 }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("não encontrado");
  });

  it("400 quantidade inválida", async () => {
    const res = await request(app)
      .post("/api/souparceira/pedidos")
      .set("Authorization", `Bearer ${tokenPortal()}`)
      .send({ itens: [{ produto_id: PROD_ID_1, quantidade: 0 }] });
    expect(res.status).toBe(400);
  });

  it("201 cria pedido com preço calculado server-side", async () => {
    const res = await request(app)
      .post("/api/souparceira/pedidos")
      .set("Authorization", `Bearer ${tokenPortal()}`)
      .send({
        itens: [
          { produto_id: PROD_ID_1, quantidade: 2 },
          { produto_id: PROD_ID_2, quantidade: 1 },
        ],
        observacao: "Teste Vitest",
      });
    expect(res.status).toBe(201);
    expect(res.body.numero_pedido).toMatch(/^REV-\d{6}-[A-F0-9]{6}$/);
    expect(res.body.status).toBe("pendente");
    // Preços calculados server-side: preco_custo × markup × (1 - desconto%)
    // Prod A: 10 × 2.0 × 0.80 = 16 por unidade, × 2 = 32
    // Prod B: 5 × 2.0 × 0.80 = 8 por unidade, × 1 = 8
    // Total: 40
    expect(parseFloat(res.body.total)).toBeCloseTo(40, 1);
    pedidoIdA = res.body.id;
  });

  it("preços não são aceitados do cliente (segurança)", async () => {
    // Mesmo que o cliente mande preco_unitario no body, o server ignora e recalcula
    const res = await request(app)
      .post("/api/souparceira/pedidos")
      .set("Authorization", `Bearer ${tokenPortal(REV_ID_B)}`)
      .send({
        itens: [{ produto_id: PROD_ID_1, quantidade: 1, preco_unitario: 0.01, preco_com_desconto: 0.01 }],
      });
    expect(res.status).toBe(201);
    // Server recalcul: 10 × 2.0 × 0.90 = 18 (bronze 10%)
    expect(parseFloat(res.body.total)).toBeGreaterThan(1);
    pedidoIdB = res.body.id;
  });
});

// ══════════════════════════════════════════════════════════════════
// GET /souparceira/pedidos
// ══════════════════════════════════════════════════════════════════

describe("GET /api/souparceira/pedidos", () => {
  it("401 sem token", async () => {
    const res = await request(app).get("/api/souparceira/pedidos");
    expect(res.status).toBe(401);
  });

  it("200 lista pedidos da revendedora logada", async () => {
    const res = await request(app)
      .get("/api/souparceira/pedidos")
      .set("Authorization", `Bearer ${tokenPortal()}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    // Deve incluir o pedido criado
    const ids = res.body.data.map((p: { id: string }) => p.id);
    expect(ids).toContain(pedidoIdA);
    // Não deve incluir pedido da outra revendedora
    expect(ids).not.toContain(pedidoIdB);
  });

  it("isolação: revendedora B não vê pedidos da A", async () => {
    const res = await request(app)
      .get("/api/souparceira/pedidos")
      .set("Authorization", `Bearer ${tokenPortal(REV_ID_B)}`);
    expect(res.status).toBe(200);
    const ids = res.body.data.map((p: { id: string }) => p.id);
    expect(ids).not.toContain(pedidoIdA);
    expect(ids).toContain(pedidoIdB);
  });
});

// ══════════════════════════════════════════════════════════════════
// GET /souparceira/pedidos/:id
// ══════════════════════════════════════════════════════════════════

describe("GET /api/souparceira/pedidos/:id", () => {
  it("401 sem token", async () => {
    const res = await request(app).get(`/api/souparceira/pedidos/${pedidoIdA}`);
    expect(res.status).toBe(401);
  });

  it("400 UUID inválido", async () => {
    const res = await request(app)
      .get("/api/souparceira/pedidos/nao-e-uuid")
      .set("Authorization", `Bearer ${tokenPortal()}`);
    expect(res.status).toBe(400);
  });

  it("404 pedido de outra revendedora (isolação)", async () => {
    // Revendedora A tenta acessar pedido de B
    const res = await request(app)
      .get(`/api/souparceira/pedidos/${pedidoIdB}`)
      .set("Authorization", `Bearer ${tokenPortal()}`);
    expect(res.status).toBe(404);
  });

  it("200 detalhe do próprio pedido", async () => {
    const res = await request(app)
      .get(`/api/souparceira/pedidos/${pedidoIdA}`)
      .set("Authorization", `Bearer ${tokenPortal()}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(pedidoIdA);
  });
});

// ══════════════════════════════════════════════════════════════════
// POST + GET /souparceira/pedidos/:id/mensagens
// ══════════════════════════════════════════════════════════════════

describe("Mensagens Portal (revendedora)", () => {
  it("401 GET sem token", async () => {
    const res = await request(app).get(`/api/souparceira/pedidos/${pedidoIdA}/mensagens`);
    expect(res.status).toBe(401);
  });

  it("401 POST sem token", async () => {
    const res = await request(app)
      .post(`/api/souparceira/pedidos/${pedidoIdA}/mensagens`)
      .send({ conteudo: "Oi" });
    expect(res.status).toBe(401);
  });

  it("400 conteúdo vazio", async () => {
    const res = await request(app)
      .post(`/api/souparceira/pedidos/${pedidoIdA}/mensagens`)
      .set("Authorization", `Bearer ${tokenPortal()}`)
      .send({ conteudo: "   " });
    expect(res.status).toBe(400);
  });

  it("400 conteúdo ausente", async () => {
    const res = await request(app)
      .post(`/api/souparceira/pedidos/${pedidoIdA}/mensagens`)
      .set("Authorization", `Bearer ${tokenPortal()}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it("404 mensagem em pedido de outra revendedora", async () => {
    const res = await request(app)
      .post(`/api/souparceira/pedidos/${pedidoIdB}/mensagens`)
      .set("Authorization", `Bearer ${tokenPortal()}`)
      .send({ conteudo: "tentativa de acesso cruzado" });
    expect(res.status).toBe(404);
  });

  it("201 envia mensagem com sucesso", async () => {
    const res = await request(app)
      .post(`/api/souparceira/pedidos/${pedidoIdA}/mensagens`)
      .set("Authorization", `Bearer ${tokenPortal()}`)
      .send({ conteudo: "Olá! Quando meu pedido será aprovado?" });
    expect(res.status).toBe(201);
    expect(res.body.autor_tipo).toBe("revendedora");
    expect(res.body.conteudo).toBe("Olá! Quando meu pedido será aprovado?");
    expect(res.body.lida).toBe(false);
  });

  it("200 lista mensagens (portal)", async () => {
    const res = await request(app)
      .get(`/api/souparceira/pedidos/${pedidoIdA}/mensagens`)
      .set("Authorization", `Bearer ${tokenPortal()}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data[0].autor_tipo).toBe("revendedora");
  });

  it("XSS: conteúdo HTML não deve causar erro", async () => {
    const xssPayload = "<script>alert('xss')</script>";
    const res = await request(app)
      .post(`/api/souparceira/pedidos/${pedidoIdA}/mensagens`)
      .set("Authorization", `Bearer ${tokenPortal()}`)
      .send({ conteudo: xssPayload });
    expect(res.status).toBe(201);
    // Conteúdo salvo como texto puro (sem renderização no response)
    expect(res.body.conteudo).toBe(xssPayload);
  });
});

// ══════════════════════════════════════════════════════════════════
// GET + POST /:id/pedidos/:pedidoId/mensagens (CRM)
// ══════════════════════════════════════════════════════════════════

describe("Mensagens CRM (admin)", () => {
  it("401 sem token CRM", async () => {
    const res = await request(app).get(`/api/revendedoras/${REV_ID_A}/pedidos/${pedidoIdA}/mensagens`);
    expect(res.status).toBe(401);
  });

  it("400 UUID pedido inválido", async () => {
    const res = await request(app)
      .get(`/api/revendedoras/${REV_ID_A}/pedidos/nao-uuid/mensagens`)
      .set("Authorization", `Bearer ${tokenCRM()}`);
    expect(res.status).toBe(400);
  });

  it("404 pedido inexistente", async () => {
    const res = await request(app)
      .get(`/api/revendedoras/${REV_ID_A}/pedidos/00000000-0000-4000-a000-000000000999/mensagens`)
      .set("Authorization", `Bearer ${tokenCRM()}`);
    expect(res.status).toBe(404);
  });

  it("200 admin lista mensagens", async () => {
    const res = await request(app)
      .get(`/api/revendedoras/${REV_ID_A}/pedidos/${pedidoIdA}/mensagens`)
      .set("Authorization", `Bearer ${tokenCRM()}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    // Mensagens da revendedora marcadas como lidas após admin listar
    const msgRev = res.body.data.filter((m: { autor_tipo: string; lida: boolean }) =>
      m.autor_tipo === "revendedora"
    );
    if (msgRev.length > 0) {
      // As mensagens buscadas serão lidas (GET marca como lidas)
      const afterRes = await request(app)
        .get(`/api/revendedoras/${REV_ID_A}/pedidos/${pedidoIdA}/mensagens`)
        .set("Authorization", `Bearer ${tokenCRM()}`);
      const msgRevDepois = afterRes.body.data.filter(
        (m: { autor_tipo: string; lida: boolean }) => m.autor_tipo === "revendedora"
      );
      msgRevDepois.forEach((m: { lida: boolean }) => expect(m.lida).toBe(true));
    }
  });

  it("400 conteúdo vazio (admin)", async () => {
    const res = await request(app)
      .post(`/api/revendedoras/${REV_ID_A}/pedidos/${pedidoIdA}/mensagens`)
      .set("Authorization", `Bearer ${tokenCRM()}`)
      .send({ conteudo: "" });
    expect(res.status).toBe(400);
  });

  it("201 admin envia mensagem", async () => {
    const res = await request(app)
      .post(`/api/revendedoras/${REV_ID_A}/pedidos/${pedidoIdA}/mensagens`)
      .set("Authorization", `Bearer ${tokenCRM()}`)
      .send({ conteudo: "Seu pedido será aprovado em breve!" });
    expect(res.status).toBe(201);
    expect(res.body.autor_tipo).toBe("admin");
    expect(res.body.conteudo).toBe("Seu pedido será aprovado em breve!");
    expect(res.body.lida).toBe(false); // não lida pela revendedora ainda
  });
});

// ══════════════════════════════════════════════════════════════════
// GET /revendedoras/pedidos-recentes
// ══════════════════════════════════════════════════════════════════

describe("GET /api/revendedoras/pedidos-recentes", () => {
  it("401 sem auth", async () => {
    const res = await request(app).get("/api/revendedoras/pedidos-recentes");
    expect(res.status).toBe(401);
  });

  it("200 retorna pedidos pendentes e contadores", async () => {
    const res = await request(app)
      .get("/api/revendedoras/pedidos-recentes")
      .set("Authorization", `Bearer ${tokenCRM()}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(typeof res.body.pendentes).toBe("number");
    expect(typeof res.body.mensagens_nao_lidas).toBe("number");
  });
});

// ══════════════════════════════════════════════════════════════════
// PUT /:id/pedidos/:pedidoId/status (com email + mensagem automática)
// ══════════════════════════════════════════════════════════════════

describe("PUT /api/revendedoras/:id/pedidos/:pedidoId/status", () => {
  it("400 status inválido", async () => {
    const res = await request(app)
      .put(`/api/revendedoras/${REV_ID_A}/pedidos/${pedidoIdA}/status`)
      .set("Authorization", `Bearer ${tokenCRM()}`)
      .send({ status: "inexistente" });
    expect(res.status).toBe(400);
  });

  it("200 aprova pedido (cria mensagem automática quando observacao_admin enviada)", async () => {
    const res = await request(app)
      .put(`/api/revendedoras/${REV_ID_A}/pedidos/${pedidoIdA}/status`)
      .set("Authorization", `Bearer ${tokenCRM()}`)
      .send({ status: "aprovado", observacao_admin: "Pedido aprovado! Será separado em breve." });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("aprovado");

    // Mensagem automática deve ter sido criada
    const msgs = await queryOne<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM crm.revendedora_pedido_mensagens
       WHERE pedido_id = $1 AND autor_tipo = 'admin'`,
      [pedidoIdA]
    );
    expect(parseInt(msgs?.total || "0")).toBeGreaterThanOrEqual(1);
  });
});

// ══════════════════════════════════════════════════════════════════
// GET + PUT /api/notificacoes
// ══════════════════════════════════════════════════════════════════

describe("Notificações CRM", () => {
  let notifId: string;

  beforeAll(async () => {
    // Inserir notificação de teste
    const n = await queryOne<{ id: string }>(
      `INSERT INTO public.notificacoes (tipo, titulo, corpo, link)
       VALUES ('test_vitest', 'Notif Teste Vitest', 'corpo teste', '/test')
       RETURNING id`
    );
    notifId = n!.id;
  });

  afterAll(async () => {
    await query("DELETE FROM public.notificacoes WHERE tipo = 'test_vitest'");
  });

  it("401 GET sem auth", async () => {
    const res = await request(app).get("/api/notificacoes");
    expect(res.status).toBe(401);
  });

  it("200 lista notificações", async () => {
    const res = await request(app)
      .get("/api/notificacoes")
      .set("Authorization", `Bearer ${tokenCRM()}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(typeof res.body.total_nao_lidas).toBe("number");
    // Deve conter a notificação de teste
    const ids = res.body.data.map((n: { id: string }) => n.id);
    expect(ids).toContain(notifId);
  });

  it("200 filtra apenas não lidas", async () => {
    const res = await request(app)
      .get("/api/notificacoes?apenas_nao_lidas=1")
      .set("Authorization", `Bearer ${tokenCRM()}`);
    expect(res.status).toBe(200);
    res.body.data.forEach((n: { lida: boolean }) => expect(n.lida).toBe(false));
  });

  it("400 UUID inválido em PUT lida", async () => {
    const res = await request(app)
      .put("/api/notificacoes/nao-uuid/lida")
      .set("Authorization", `Bearer ${tokenCRM()}`);
    expect(res.status).toBe(400);
  });

  it("404 notificação inexistente", async () => {
    const res = await request(app)
      .put("/api/notificacoes/00000000-0000-4000-a000-000000000999/lida")
      .set("Authorization", `Bearer ${tokenCRM()}`);
    expect(res.status).toBe(404);
  });

  it("200 marca notificação individual como lida", async () => {
    const res = await request(app)
      .put(`/api/notificacoes/${notifId}/lida`)
      .set("Authorization", `Bearer ${tokenCRM()}`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    // Verificar no banco
    const n = await queryOne<{ lida: boolean }>(
      "SELECT lida FROM public.notificacoes WHERE id = $1", [notifId]
    );
    expect(n?.lida).toBe(true);
  });

  it("200 marca todas como lidas", async () => {
    // Inserir mais uma não lida
    await query(
      `INSERT INTO public.notificacoes (tipo, titulo) VALUES ('test_vitest', 'Outra Teste')`
    );
    const res = await request(app)
      .put("/api/notificacoes/lida-tudo")
      .set("Authorization", `Bearer ${tokenCRM()}`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    // Verificar que não restam não lidas do tipo test_vitest
    const naoLidas = await queryOne<{ total: string }>(
      "SELECT COUNT(*)::text AS total FROM public.notificacoes WHERE tipo='test_vitest' AND lida=FALSE"
    );
    expect(parseInt(naoLidas?.total || "0")).toBe(0);
  });
});
