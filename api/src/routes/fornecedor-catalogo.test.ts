import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { app } from "../server";
import { queryOne } from "../db";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "";

// ID de log criado no teste de iniciar — para parar depois
let logIdIniciado: string | null = null;

function adminToken(): string {
  return jwt.sign(
    { userId: "test-admin", email: "test@test.com", papel: "admin" },
    JWT_SECRET,
    { expiresIn: "1h" }
  );
}

// Limpa dados de teste inseridos pelo PUT /markup
afterAll(async () => {
  await queryOne(
    "DELETE FROM sync.fornecedor_markup_categorias WHERE categoria = $1",
    ["categoria-teste-unitario"]
  );
  // Garante que o scraper está parado (estado em memória do processo)
  if (logIdIniciado) {
    await request(app)
      .post("/api/fornecedor-catalogo/scraper/parar")
      .set("Authorization", `Bearer ${adminToken()}`);
  }
});

// ── GET /api/fornecedor-catalogo/stats ─────────────────────────────

describe("GET /api/fornecedor-catalogo/stats", () => {
  it("retorna 401 sem token", async () => {
    const res = await request(app).get("/api/fornecedor-catalogo/stats");
    expect(res.status).toBe(401);
  });

  it("retorna 200 com campos corretos", async () => {
    const res = await request(app)
      .get("/api/fornecedor-catalogo/stats")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("total");
    expect(res.body).toHaveProperty("rascunho");
    expect(res.body).toHaveProperty("aprovado");
    expect(res.body).toHaveProperty("pausado");
    expect(res.body).toHaveProperty("categorias");
    expect(typeof res.body.total).toBe("number");
    expect(typeof res.body.rascunho).toBe("number");
    expect(typeof res.body.aprovado).toBe("number");
    expect(typeof res.body.pausado).toBe("number");
    expect(typeof res.body.categorias).toBe("number");
  });

  it("valores numéricos são não-negativos", async () => {
    const res = await request(app)
      .get("/api/fornecedor-catalogo/stats")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThanOrEqual(0);
    expect(res.body.rascunho).toBeGreaterThanOrEqual(0);
    expect(res.body.aprovado).toBeGreaterThanOrEqual(0);
    expect(res.body.pausado).toBeGreaterThanOrEqual(0);
    expect(res.body.categorias).toBeGreaterThanOrEqual(0);
  });
});

// ── GET /api/fornecedor-catalogo/markup ───────────────────────────

describe("GET /api/fornecedor-catalogo/markup", () => {
  it("retorna 401 sem token", async () => {
    const res = await request(app).get("/api/fornecedor-catalogo/markup");
    expect(res.status).toBe(401);
  });

  it("retorna 200 com array", async () => {
    const res = await request(app)
      .get("/api/fornecedor-catalogo/markup")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("itens do array têm campos esperados", async () => {
    const res = await request(app)
      .get("/api/fornecedor-catalogo/markup")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    if (res.body.length > 0) {
      const item = res.body[0];
      expect(item).toHaveProperty("categoria");
      expect(item).toHaveProperty("markup");
      expect(typeof item.categoria).toBe("string");
      // O campo markup vem como string do PostgreSQL (tipo numeric) ou number — aceita ambos
      expect(["number", "string"]).toContain(typeof item.markup);
      expect(Number(item.markup)).toBeGreaterThan(0);
    }
  });
});

// ── PUT /api/fornecedor-catalogo/markup ───────────────────────────

describe("PUT /api/fornecedor-catalogo/markup", () => {
  it("retorna 401 sem token", async () => {
    const res = await request(app)
      .put("/api/fornecedor-catalogo/markup")
      .send({ markups: [{ categoria: "teste", markup: 2.0 }] });
    expect(res.status).toBe(401);
  });

  it("retorna 200 com markups válidos", async () => {
    const res = await request(app)
      .put("/api/fornecedor-catalogo/markup")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({ markups: [{ categoria: "categoria-teste-unitario", markup: 2.5 }] });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("ok", true);
    expect(res.body).toHaveProperty("atualizados", 1);
  });

  it("retorna 400 com markup abaixo do mínimo (0.5)", async () => {
    const res = await request(app)
      .put("/api/fornecedor-catalogo/markup")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({ markups: [{ categoria: "teste", markup: 0.5 }] });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("retorna 400 com markup acima do máximo (6.0)", async () => {
    const res = await request(app)
      .put("/api/fornecedor-catalogo/markup")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({ markups: [{ categoria: "teste", markup: 6.0 }] });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("retorna 400 sem campo markups", async () => {
    const res = await request(app)
      .put("/api/fornecedor-catalogo/markup")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it("retorna 400 com array vazio", async () => {
    const res = await request(app)
      .put("/api/fornecedor-catalogo/markup")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({ markups: [] });
    expect(res.status).toBe(400);
  });
});

// ── GET /api/fornecedor-catalogo/produtos ─────────────────────────

describe("GET /api/fornecedor-catalogo/produtos", () => {
  it("retorna 401 sem token", async () => {
    const res = await request(app).get("/api/fornecedor-catalogo/produtos");
    expect(res.status).toBe(401);
  });

  it("retorna 200 com campos de paginação", async () => {
    const res = await request(app)
      .get("/api/fornecedor-catalogo/produtos")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("produtos");
    expect(res.body).toHaveProperty("total");
    expect(res.body).toHaveProperty("pagina");
    expect(res.body).toHaveProperty("total_paginas");
    expect(Array.isArray(res.body.produtos)).toBe(true);
    expect(typeof res.body.total).toBe("number");
    expect(typeof res.body.pagina).toBe("number");
    expect(typeof res.body.total_paginas).toBe("number");
  });

  it("pagina corretamente com page e limit", async () => {
    const res = await request(app)
      .get("/api/fornecedor-catalogo/produtos?page=1&limit=5")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.pagina).toBe(1);
    expect(res.body.produtos.length).toBeLessThanOrEqual(5);
  });

  it("filtra por status rascunho", async () => {
    const res = await request(app)
      .get("/api/fornecedor-catalogo/produtos?status=rascunho")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.produtos)).toBe(true);
    res.body.produtos.forEach((p: { status: string }) => {
      expect(p.status).toBe("rascunho");
    });
  });

  it("filtra por status inválido retorna 400", async () => {
    const res = await request(app)
      .get("/api/fornecedor-catalogo/produtos?status=invalido")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(400);
  });

  it("busca por nome (search)", async () => {
    const res = await request(app)
      .get("/api/fornecedor-catalogo/produtos?search=caneta")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.produtos)).toBe(true);
  });
});

// ── GET /api/fornecedor-catalogo/produtos/por-categoria ───────────

describe("GET /api/fornecedor-catalogo/produtos/por-categoria", () => {
  it("retorna 401 sem token", async () => {
    const res = await request(app).get("/api/fornecedor-catalogo/produtos/por-categoria");
    expect(res.status).toBe(401);
  });

  it("retorna 200 com array", async () => {
    const res = await request(app)
      .get("/api/fornecedor-catalogo/produtos/por-categoria")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("itens têm campos esperados", async () => {
    const res = await request(app)
      .get("/api/fornecedor-catalogo/produtos/por-categoria")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    if (res.body.length > 0) {
      const item = res.body[0];
      expect(item).toHaveProperty("categoria");
      expect(item).toHaveProperty("total");
      expect(item).toHaveProperty("rascunho");
      expect(item).toHaveProperty("aprovado");
    }
  });
});

// ── PUT /api/fornecedor-catalogo/produtos/:id/status ──────────────

describe("PUT /api/fornecedor-catalogo/produtos/:id/status", () => {
  it("retorna 401 sem token", async () => {
    const res = await request(app)
      .put("/api/fornecedor-catalogo/produtos/00000000-0000-0000-0000-000000000000/status")
      .send({ status: "aprovado" });
    expect(res.status).toBe(401);
  });

  it("retorna 404 para UUID inexistente", async () => {
    const res = await request(app)
      .put("/api/fornecedor-catalogo/produtos/00000000-0000-0000-0000-000000000000/status")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({ status: "aprovado" });
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty("error");
  });

  it("retorna 400 para status inválido", async () => {
    const res = await request(app)
      .put("/api/fornecedor-catalogo/produtos/00000000-0000-0000-0000-000000000000/status")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({ status: "invalido" });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("retorna 400 sem corpo", async () => {
    const res = await request(app)
      .put("/api/fornecedor-catalogo/produtos/00000000-0000-0000-0000-000000000000/status")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it("atualiza produto real se existir", async () => {
    const prod = await queryOne<{ id: string }>(
      "SELECT id FROM sync.fornecedor_catalogo_jc LIMIT 1"
    );
    if (!prod) return; // nenhum produto no banco — pula

    const res = await request(app)
      .put(`/api/fornecedor-catalogo/produtos/${prod.id}/status`)
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({ status: "rascunho" });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("id", prod.id);
    expect(res.body).toHaveProperty("status", "rascunho");
  });
});

// ── POST /api/fornecedor-catalogo/aprovar-lote ────────────────────

describe("POST /api/fornecedor-catalogo/aprovar-lote", () => {
  it("retorna 401 sem token", async () => {
    const res = await request(app)
      .post("/api/fornecedor-catalogo/aprovar-lote")
      .send({ ids: ["00000000-0000-0000-0000-000000000000"] });
    expect(res.status).toBe(401);
  });

  it("retorna 400 sem campo ids", async () => {
    const res = await request(app)
      .post("/api/fornecedor-catalogo/aprovar-lote")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("retorna 400 com ids como array vazio", async () => {
    const res = await request(app)
      .post("/api/fornecedor-catalogo/aprovar-lote")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({ ids: [] });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("retorna 400 com ids não-UUID", async () => {
    const res = await request(app)
      .post("/api/fornecedor-catalogo/aprovar-lote")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({ ids: ["nao-e-uuid"] });
    expect(res.status).toBe(400);
  });

  it("retorna 200 com array de UUIDs válidos (inexistentes no banco)", async () => {
    const res = await request(app)
      .post("/api/fornecedor-catalogo/aprovar-lote")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({ ids: ["00000000-0000-0000-0000-000000000001"] });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("ok", true);
    expect(res.body).toHaveProperty("aprovados");
  });
});

// ── GET /api/fornecedor-catalogo/scraper/status ───────────────────

describe("GET /api/fornecedor-catalogo/scraper/status", () => {
  it("retorna 401 sem token", async () => {
    const res = await request(app).get("/api/fornecedor-catalogo/scraper/status");
    expect(res.status).toBe(401);
  });

  it("retorna 200 com campo running", async () => {
    const res = await request(app)
      .get("/api/fornecedor-catalogo/scraper/status")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("running");
    expect(typeof res.body.running).toBe("boolean");
  });

  it("retorna campos completos do estado do scraper", async () => {
    const res = await request(app)
      .get("/api/fornecedor-catalogo/scraper/status")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("total_categorias");
    expect(res.body).toHaveProperty("categorias_feitas");
    expect(res.body).toHaveProperty("produtos_salvos");
    expect(res.body).toHaveProperty("produtos_atualizados");
    expect(res.body).toHaveProperty("erros");
    expect(res.body).toHaveProperty("mensagem");
  });
});

// ── GET /api/fornecedor-catalogo/scraper/historico ────────────────

describe("GET /api/fornecedor-catalogo/scraper/historico", () => {
  it("retorna 401 sem token", async () => {
    const res = await request(app).get("/api/fornecedor-catalogo/scraper/historico");
    expect(res.status).toBe(401);
  });

  it("retorna 200 com array", async () => {
    const res = await request(app)
      .get("/api/fornecedor-catalogo/scraper/historico")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("itens do histórico têm campos esperados", async () => {
    const res = await request(app)
      .get("/api/fornecedor-catalogo/scraper/historico")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    if (res.body.length > 0) {
      const log = res.body[0];
      expect(log).toHaveProperty("id");
      expect(log).toHaveProperty("status");
      expect(log).toHaveProperty("iniciado_em");
    }
  });
});

// ── POST /api/fornecedor-catalogo/scraper/iniciar ─────────────────

describe("POST /api/fornecedor-catalogo/scraper/iniciar", () => {
  it("retorna 401 sem token", async () => {
    const res = await request(app)
      .post("/api/fornecedor-catalogo/scraper/iniciar")
      .send({});
    expect(res.status).toBe(401);
  });

  it("retorna 200 e inicia o scraper", async () => {
    // Garante que o scraper não está rodando antes do teste
    const statusBefore = await request(app)
      .get("/api/fornecedor-catalogo/scraper/status")
      .set("Authorization", `Bearer ${adminToken()}`);

    if (statusBefore.body.running) {
      // Já está rodando — para antes de iniciar
      await request(app)
        .post("/api/fornecedor-catalogo/scraper/parar")
        .set("Authorization", `Bearer ${adminToken()}`);
      // Aguarda estado atualizar (running = false é síncrono na rota /parar)
    }

    const res = await request(app)
      .post("/api/fornecedor-catalogo/scraper/iniciar")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("ok", true);
    expect(res.body).toHaveProperty("log_id");
    logIdIniciado = res.body.log_id;

    // Para imediatamente para não interferir em outros testes
    await request(app)
      .post("/api/fornecedor-catalogo/scraper/parar")
      .set("Authorization", `Bearer ${adminToken()}`);
  });

  it("retorna 409 se scraper já estiver rodando", async () => {
    // Inicia o scraper
    const ini = await request(app)
      .post("/api/fornecedor-catalogo/scraper/iniciar")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({});

    if (ini.status !== 200) {
      // Pode já estar rodando (estado do processo) — 409 é esperado
      expect(ini.status).toBe(409);
      return;
    }

    // Tenta iniciar novamente enquanto está rodando
    const res = await request(app)
      .post("/api/fornecedor-catalogo/scraper/iniciar")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({});
    expect(res.status).toBe(409);
    expect(res.body).toHaveProperty("error");

    // Para o scraper para limpar
    await request(app)
      .post("/api/fornecedor-catalogo/scraper/parar")
      .set("Authorization", `Bearer ${adminToken()}`);
  });
});

// ── POST /api/fornecedor-catalogo/scraper/parar ───────────────────

describe("POST /api/fornecedor-catalogo/scraper/parar", () => {
  it("retorna 401 sem token", async () => {
    const res = await request(app)
      .post("/api/fornecedor-catalogo/scraper/parar")
      .send({});
    expect(res.status).toBe(401);
  });

  it("retorna 409 se scraper não estiver rodando", async () => {
    // Garante que está parado
    const statusRes = await request(app)
      .get("/api/fornecedor-catalogo/scraper/status")
      .set("Authorization", `Bearer ${adminToken()}`);

    if (statusRes.body.running) {
      // Para primeiro
      await request(app)
        .post("/api/fornecedor-catalogo/scraper/parar")
        .set("Authorization", `Bearer ${adminToken()}`);
    }

    const res = await request(app)
      .post("/api/fornecedor-catalogo/scraper/parar")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(409);
    expect(res.body).toHaveProperty("error");
  });
});

// ── GET /scraper/atualizar-precos/status ──────────────────────────

describe("GET /api/fornecedor-catalogo/scraper/atualizar-precos/status", () => {
  it("retorna 401 sem token", async () => {
    const res = await request(app).get("/api/fornecedor-catalogo/scraper/atualizar-precos/status");
    expect(res.status).toBe(401);
  });

  it("retorna 200 com campo running", async () => {
    const res = await request(app)
      .get("/api/fornecedor-catalogo/scraper/atualizar-precos/status")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("running");
    expect(typeof res.body.running).toBe("boolean");
  });

  it("retorna campos completos do estado de atualização de preços", async () => {
    const res = await request(app)
      .get("/api/fornecedor-catalogo/scraper/atualizar-precos/status")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("total_categorias");
    expect(res.body).toHaveProperty("categorias_feitas");
    expect(res.body).toHaveProperty("atualizados");
    expect(res.body).toHaveProperty("sem_mudanca");
    expect(res.body).toHaveProperty("erros");
    expect(res.body).toHaveProperty("mensagem");
    expect(typeof res.body.total_categorias).toBe("number");
    expect(typeof res.body.atualizados).toBe("number");
    expect(typeof res.body.sem_mudanca).toBe("number");
    expect(typeof res.body.erros).toBe("number");
  });

  it("running=false quando nenhuma atualização está em andamento", async () => {
    // Garante que não está rodando antes de verificar
    const status = await request(app)
      .get("/api/fornecedor-catalogo/scraper/atualizar-precos/status")
      .set("Authorization", `Bearer ${adminToken()}`);
    if (status.body.running) {
      await request(app)
        .post("/api/fornecedor-catalogo/scraper/atualizar-precos/parar")
        .set("Authorization", `Bearer ${adminToken()}`);
    }

    const res = await request(app)
      .get("/api/fornecedor-catalogo/scraper/atualizar-precos/status")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.running).toBe(false);
  });
});

// ── POST /scraper/atualizar-precos ────────────────────────────────

describe("POST /api/fornecedor-catalogo/scraper/atualizar-precos", () => {
  it("retorna 401 sem token", async () => {
    const res = await request(app)
      .post("/api/fornecedor-catalogo/scraper/atualizar-precos")
      .send({});
    expect(res.status).toBe(401);
  });

  it("retorna 200 e inicia atualização de preços", async () => {
    // Garante que nada está rodando antes do teste
    const statusBefore = await request(app)
      .get("/api/fornecedor-catalogo/scraper/atualizar-precos/status")
      .set("Authorization", `Bearer ${adminToken()}`);
    if (statusBefore.body.running) {
      await request(app)
        .post("/api/fornecedor-catalogo/scraper/atualizar-precos/parar")
        .set("Authorization", `Bearer ${adminToken()}`);
    }

    const res = await request(app)
      .post("/api/fornecedor-catalogo/scraper/atualizar-precos")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("ok", true);
    expect(res.body).toHaveProperty("mensagem");

    // Para imediatamente para não interferir nos demais testes
    await request(app)
      .post("/api/fornecedor-catalogo/scraper/atualizar-precos/parar")
      .set("Authorization", `Bearer ${adminToken()}`);
  });

  it("retorna 409 se atualização já estiver em execução", async () => {
    // Inicia
    const ini = await request(app)
      .post("/api/fornecedor-catalogo/scraper/atualizar-precos")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({});

    if (ini.status !== 200) {
      // Já estava rodando — 409 é esperado
      expect(ini.status).toBe(409);
      return;
    }

    // Tenta iniciar novamente enquanto está rodando
    const res = await request(app)
      .post("/api/fornecedor-catalogo/scraper/atualizar-precos")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({});
    expect(res.status).toBe(409);
    expect(res.body).toHaveProperty("error");

    // Para para limpar
    await request(app)
      .post("/api/fornecedor-catalogo/scraper/atualizar-precos/parar")
      .set("Authorization", `Bearer ${adminToken()}`);
  });
});

// ── POST /scraper/atualizar-precos/parar ──────────────────────────

describe("POST /api/fornecedor-catalogo/scraper/atualizar-precos/parar", () => {
  it("retorna 401 sem token", async () => {
    const res = await request(app)
      .post("/api/fornecedor-catalogo/scraper/atualizar-precos/parar")
      .send({});
    expect(res.status).toBe(401);
  });

  it("retorna 409 se atualização não estiver rodando", async () => {
    // Garante que está parada
    const statusRes = await request(app)
      .get("/api/fornecedor-catalogo/scraper/atualizar-precos/status")
      .set("Authorization", `Bearer ${adminToken()}`);
    if (statusRes.body.running) {
      await request(app)
        .post("/api/fornecedor-catalogo/scraper/atualizar-precos/parar")
        .set("Authorization", `Bearer ${adminToken()}`);
    }

    const res = await request(app)
      .post("/api/fornecedor-catalogo/scraper/atualizar-precos/parar")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(409);
    expect(res.body).toHaveProperty("error");
  });

  it("retorna 200 ao parar uma atualização em andamento", async () => {
    // Inicia primeiro
    const ini = await request(app)
      .post("/api/fornecedor-catalogo/scraper/atualizar-precos")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({});

    if (ini.status !== 200) return; // conflito com outro estado — pula

    const res = await request(app)
      .post("/api/fornecedor-catalogo/scraper/atualizar-precos/parar")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("ok", true);
    expect(res.body).toHaveProperty("mensagem");
  });
});

// ── Segurança geral ───────────────────────────────────────────────

describe("Segurança — fornecedor-catalogo API", () => {
  it("rejeita JWT expirado", async () => {
    const expired = jwt.sign(
      { userId: "test", email: "test@test.com", papel: "admin" },
      JWT_SECRET,
      { expiresIn: "-1h" }
    );
    const res = await request(app)
      .get("/api/fornecedor-catalogo/stats")
      .set("Authorization", `Bearer ${expired}`);
    expect(res.status).toBe(401);
  });

  it("rejeita JWT com secret errado", async () => {
    const bad = jwt.sign(
      { userId: "test", email: "test@test.com", papel: "admin" },
      "secret-errado",
      { expiresIn: "1h" }
    );
    const res = await request(app)
      .get("/api/fornecedor-catalogo/stats")
      .set("Authorization", `Bearer ${bad}`);
    expect(res.status).toBe(401);
  });

  it("rejeita token malformado", async () => {
    const res = await request(app)
      .get("/api/fornecedor-catalogo/markup")
      .set("Authorization", "Bearer token.invalido.aqui");
    expect(res.status).toBe(401);
  });

  it("todos os endpoints principais retornam 401 sem token", async () => {
    const endpoints = [
      { method: "get",  path: "/api/fornecedor-catalogo/stats" },
      { method: "get",  path: "/api/fornecedor-catalogo/markup" },
      { method: "put",  path: "/api/fornecedor-catalogo/markup" },
      { method: "get",  path: "/api/fornecedor-catalogo/produtos" },
      { method: "get",  path: "/api/fornecedor-catalogo/produtos/por-categoria" },
      { method: "post", path: "/api/fornecedor-catalogo/aprovar-lote" },
      { method: "get",  path: "/api/fornecedor-catalogo/scraper/status" },
      { method: "get",  path: "/api/fornecedor-catalogo/scraper/historico" },
      { method: "post", path: "/api/fornecedor-catalogo/scraper/iniciar" },
      { method: "post", path: "/api/fornecedor-catalogo/scraper/parar" },
      { method: "get",  path: "/api/fornecedor-catalogo/scraper/atualizar-precos/status" },
      { method: "post", path: "/api/fornecedor-catalogo/scraper/atualizar-precos" },
      { method: "post", path: "/api/fornecedor-catalogo/scraper/atualizar-precos/parar" },
    ];

    for (const ep of endpoints) {
      const req = (request(app) as any)[ep.method](ep.path);
      const res = await req;
      expect(res.status, `${ep.method.toUpperCase()} ${ep.path} deve retornar 401`).toBe(401);
    }
  });
});
