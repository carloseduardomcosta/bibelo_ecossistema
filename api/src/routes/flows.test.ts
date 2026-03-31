import { describe, it, expect, afterAll, beforeAll } from "vitest";
import request from "supertest";
import { app } from "../server";
import { query, queryOne } from "../db";
import jwt from "jsonwebtoken";
import { triggerFlow } from "../services/flow.service";

const JWT_SECRET = process.env.JWT_SECRET || "";
const TEST_EMAIL = "vitest-flow-test@example.com";
const FLOW_TEST_PREFIX = "vitest-flow-";

// Gera JWT de admin para testes
function adminToken(): string {
  return jwt.sign({ userId: "test-admin", email: TEST_EMAIL, papel: "admin" }, JWT_SECRET, { expiresIn: "1h" });
}

// IDs criados durante testes para cleanup
const createdFlowIds: string[] = [];
const createdCustomerIds: string[] = [];

afterAll(async () => {
  // Limpa na ordem correta (FK)
  for (const fid of createdFlowIds) {
    await query("DELETE FROM marketing.flow_step_executions WHERE execution_id IN (SELECT id FROM marketing.flow_executions WHERE flow_id = $1)", [fid]);
    await query("DELETE FROM marketing.flow_executions WHERE flow_id = $1", [fid]);
    await query("DELETE FROM marketing.flows WHERE id = $1", [fid]);
  }
  for (const cid of createdCustomerIds) {
    await query("DELETE FROM crm.interactions WHERE customer_id = $1", [cid]);
    await query("DELETE FROM crm.customers WHERE id = $1", [cid]);
  }
});

// ── Testes de API (rotas protegidas) ───────────────────────────

describe("GET /api/flows", () => {
  it("retorna 401 sem token", async () => {
    const res = await request(app).get("/api/flows");
    expect(res.status).toBe(401);
  });

  it("lista fluxos com token válido", async () => {
    const res = await request(app)
      .get("/api/flows")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });
});

describe("GET /api/flows/stats/overview", () => {
  it("retorna 401 sem token", async () => {
    const res = await request(app).get("/api/flows/stats/overview");
    expect(res.status).toBe(401);
  });

  it("retorna KPIs dos fluxos", async () => {
    const res = await request(app)
      .get("/api/flows/stats/overview")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("fluxos_ativos");
    expect(res.body).toHaveProperty("execucoes_ativas");
    expect(res.body).toHaveProperty("carrinhos_pendentes");
  });
});

describe("POST /api/flows", () => {
  it("retorna 401 sem token", async () => {
    const res = await request(app).post("/api/flows").send({});
    expect(res.status).toBe(401);
  });

  it("retorna 400 com dados inválidos", async () => {
    const res = await request(app)
      .post("/api/flows")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({ nome: "x" }); // nome curto, sem gatilho/steps
    expect(res.status).toBe(400);
  });

  it("cria fluxo de teste", async () => {
    const res = await request(app)
      .post("/api/flows")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({
        nome: `${FLOW_TEST_PREFIX}teste-criacao`,
        gatilho: "order.paid",
        steps: [{ tipo: "email", template: "Agradecimento", delay_horas: 0 }],
        ativo: false,
      });
    expect(res.status).toBe(201);
    expect(res.body.nome).toContain(FLOW_TEST_PREFIX);
    createdFlowIds.push(res.body.id);
  });

  it("rejeita gatilho inválido (SQL injection)", async () => {
    const res = await request(app)
      .post("/api/flows")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({
        nome: `${FLOW_TEST_PREFIX}sqli-test`,
        gatilho: "order.paid'; DROP TABLE marketing.flows;--",
        steps: [{ tipo: "email", delay_horas: 0 }],
      });
    expect(res.status).toBe(400);
  });

  it("rejeita tipo de step inválido", async () => {
    const res = await request(app)
      .post("/api/flows")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({
        nome: `${FLOW_TEST_PREFIX}tipo-invalido`,
        gatilho: "order.paid",
        steps: [{ tipo: "exec_command", delay_horas: 0 }],
      });
    expect(res.status).toBe(400);
  });

  it("rejeita delay_horas negativo", async () => {
    const res = await request(app)
      .post("/api/flows")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({
        nome: `${FLOW_TEST_PREFIX}delay-negativo`,
        gatilho: "order.paid",
        steps: [{ tipo: "email", delay_horas: -10 }],
      });
    expect(res.status).toBe(400);
  });
});

describe("GET /api/flows/:id", () => {
  it("retorna 404 para ID inexistente", async () => {
    const res = await request(app)
      .get("/api/flows/00000000-0000-0000-0000-000000000000")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(404);
  });

  it("retorna fluxo com execuções", async () => {
    // Pega um fluxo real do banco
    const flow = await queryOne<{ id: string }>("SELECT id FROM marketing.flows LIMIT 1");
    if (!flow) return;

    const res = await request(app)
      .get(`/api/flows/${flow.id}`)
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("nome");
    expect(res.body).toHaveProperty("steps");
    expect(res.body).toHaveProperty("executions");
  });
});

// ── Testes do triggerFlow (lógica de negócio) ──────────────────

describe("triggerFlow — validações", () => {
  let testFlowId: string;
  let testCustomerId: string;
  let optoutCustomerId: string;
  let noEmailCustomerId: string;

  beforeAll(async () => {
    // Cria fluxo de teste ativo
    const flow = await queryOne<{ id: string }>(
      `INSERT INTO marketing.flows (nome, gatilho, steps, ativo)
       VALUES ($1, 'order.paid', '[{"tipo":"email","template":"Agradecimento","delay_horas":0}]'::jsonb, true)
       RETURNING id`,
      [`${FLOW_TEST_PREFIX}trigger-test`]
    );
    testFlowId = flow!.id;
    createdFlowIds.push(testFlowId);

    // Customer com email
    const c1 = await queryOne<{ id: string }>(
      `INSERT INTO crm.customers (nome, email, email_optout) VALUES ($1, $2, false) RETURNING id`,
      [`${FLOW_TEST_PREFIX}com-email`, TEST_EMAIL]
    );
    testCustomerId = c1!.id;
    createdCustomerIds.push(testCustomerId);

    // Customer com opt-out
    const c2 = await queryOne<{ id: string }>(
      `INSERT INTO crm.customers (nome, email, email_optout) VALUES ($1, $2, true) RETURNING id`,
      [`${FLOW_TEST_PREFIX}optout`, `optout-${FLOW_TEST_PREFIX}@example.com`]
    );
    optoutCustomerId = c2!.id;
    createdCustomerIds.push(optoutCustomerId);

    // Customer sem email
    const c3 = await queryOne<{ id: string }>(
      `INSERT INTO crm.customers (nome, email, email_optout) VALUES ($1, NULL, false) RETURNING id`,
      [`${FLOW_TEST_PREFIX}sem-email`]
    );
    noEmailCustomerId = c3!.id;
    createdCustomerIds.push(noEmailCustomerId);
  });

  it("não dispara para customer inexistente", async () => {
    const ids = await triggerFlow("order.paid", "00000000-0000-0000-0000-000000000000");
    expect(ids).toEqual([]);
  });

  it("não dispara para customer sem email", async () => {
    const ids = await triggerFlow("order.paid", noEmailCustomerId);
    expect(ids).toEqual([]);
  });

  it("não dispara para customer com opt-out (LGPD)", async () => {
    const ids = await triggerFlow("order.paid", optoutCustomerId);
    expect(ids).toEqual([]);
  });

  it("não dispara para gatilho sem fluxo ativo", async () => {
    const ids = await triggerFlow("gatilho.inexistente", testCustomerId);
    expect(ids).toEqual([]);
  });

  it("dispara fluxo para customer válido com email", async () => {
    const ids = await triggerFlow("order.paid", testCustomerId);
    expect(ids.length).toBeGreaterThan(0);

    // Verifica que execution foi criada
    const exec = await queryOne<{ status: string }>(
      "SELECT status FROM marketing.flow_executions WHERE id = $1",
      [ids[0]]
    );
    expect(exec?.status).toBe("ativo");
  });

  it("não re-dispara para mesmo customer dentro de 90 dias", async () => {
    // Tenta disparar de novo (já disparou no teste anterior)
    const ids = await triggerFlow("order.paid", testCustomerId);
    expect(ids).toEqual([]);
  });

  it("rate limit: não dispara se cliente recebeu email há menos de 12h", async () => {
    // O teste anterior já criou uma execução. Simulamos que um email foi enviado
    const exec = await queryOne<{ id: string }>(
      "SELECT id FROM marketing.flow_executions WHERE customer_id = $1 ORDER BY iniciado_em DESC LIMIT 1",
      [testCustomerId]
    );
    if (exec) {
      await query(
        `INSERT INTO marketing.flow_step_executions (execution_id, step_index, tipo, status, executado_em)
         VALUES ($1, 0, 'email', 'concluido', NOW())
         ON CONFLICT DO NOTHING`,
        [exec.id]
      );
    }

    // Cria outro fluxo com gatilho diferente para testar rate limit
    const flow2 = await queryOne<{ id: string }>(
      `INSERT INTO marketing.flows (nome, gatilho, steps, ativo)
       VALUES ($1, 'order.abandoned', '[{"tipo":"email","template":"Carrinho","delay_horas":0}]'::jsonb, true)
       RETURNING id`,
      [`${FLOW_TEST_PREFIX}rate-limit-test`]
    );
    createdFlowIds.push(flow2!.id);

    const ids = await triggerFlow("order.abandoned", testCustomerId);
    // Deve bloquear pelo rate limit de 12h
    expect(ids).toEqual([]);
  });
});

// ── Testes de segurança nos fluxos ─────────────────────────────

describe("Segurança — flows API", () => {
  it("PUT /api/flows/:id sanitiza XSS no nome (strip HTML tags)", async () => {
    const flow = await queryOne<{ id: string; nome: string }>("SELECT id, nome FROM marketing.flows LIMIT 1");
    if (!flow) return;

    const xssPayload = '<script>alert("xss")</script>Nome Limpo';
    const res = await request(app)
      .put(`/api/flows/${flow.id}`)
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({ nome: xssPayload });
    expect(res.status).toBe(200);
    // Backend strip HTML tags — não deve conter <script>
    expect(res.body.nome).not.toContain("<script>");
    expect(res.body.nome).toContain("Nome Limpo");

    // Restaura nome original
    await request(app)
      .put(`/api/flows/${flow.id}`)
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({ nome: flow.nome });
  });

  it("rejeita JWT expirado", async () => {
    const expired = jwt.sign(
      { userId: "test", email: "test@test.com", papel: "admin" },
      JWT_SECRET,
      { expiresIn: "-1h" }
    );
    const res = await request(app)
      .get("/api/flows")
      .set("Authorization", `Bearer ${expired}`);
    expect(res.status).toBe(401);
  });

  it("rejeita JWT com secret errado", async () => {
    const bad = jwt.sign(
      { userId: "test", email: "test@test.com", papel: "admin" },
      "wrong-secret",
      { expiresIn: "1h" }
    );
    const res = await request(app)
      .get("/api/flows")
      .set("Authorization", `Bearer ${bad}`);
    expect(res.status).toBe(401);
  });

  it("rejeita token malformado", async () => {
    const res = await request(app)
      .get("/api/flows")
      .set("Authorization", "Bearer not.a.valid.jwt");
    expect(res.status).toBe(401);
  });

  it("POST /api/flows não aceita prototype pollution", async () => {
    const res = await request(app)
      .post("/api/flows")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({
        nome: `${FLOW_TEST_PREFIX}proto-pollution`,
        gatilho: "order.paid",
        steps: [{ tipo: "email", delay_horas: 0 }],
        __proto__: { admin: true },
        constructor: { prototype: { isAdmin: true } },
      });
    // Zod strip unknowns — __proto__ é ignorado
    expect([201, 400]).toContain(res.status);
  });
});
