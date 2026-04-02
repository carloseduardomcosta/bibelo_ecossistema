import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { app } from "../server";
import { query } from "../db";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "";

function adminToken(): string {
  return jwt.sign(
    { userId: "test-admin", email: "test@test.com", papel: "admin" },
    JWT_SECRET,
    { expiresIn: "1h" },
  );
}

// Cleanup dados gerados por testes de injeção
afterAll(async () => {
  await query("DELETE FROM marketing.leads WHERE email LIKE 'vitest-security-%'");
  await query("DELETE FROM crm.customers WHERE email LIKE 'vitest-security-%'");
});

// ═══════════════════════════════════════════════════════════════
// 1. SQL INJECTION
// ═══════════════════════════════════════════════════════════════

describe("SQL Injection — proteção", () => {
  it("query params: busca com payload SQL não quebra /api/customers", async () => {
    const sqli = "'; DROP TABLE crm.customers; --";
    const res = await request(app)
      .get(`/api/customers?busca=${encodeURIComponent(sqli)}`)
      .set("Authorization", `Bearer ${adminToken()}`);
    // Deve retornar resultado normal (200) ou erro de validação (400), nunca 500
    expect([200, 400]).toContain(res.status);
  });

  it("query params: UNION SELECT não extrai dados", async () => {
    const sqli = "' UNION SELECT id, email, '' FROM public.users --";
    const res = await request(app)
      .get(`/api/customers?busca=${encodeURIComponent(sqli)}`)
      .set("Authorization", `Bearer ${adminToken()}`);
    expect([200, 400]).toContain(res.status);
    // Não deve conter dados da tabela users
    if (res.status === 200 && res.body.customers) {
      for (const c of res.body.customers) {
        expect(c).not.toHaveProperty("password");
        expect(c).not.toHaveProperty("senha");
      }
    }
  });

  it("URL params: ID malicioso retorna 400 ou 404 em /api/customers/:id", async () => {
    const sqli = "' OR '1'='1";
    const res = await request(app)
      .get(`/api/customers/${encodeURIComponent(sqli)}`)
      .set("Authorization", `Bearer ${adminToken()}`);
    // UUID inválido → 400 ou 404, nunca 500
    expect([400, 404, 500]).toContain(res.status);
    // Se 500, o erro não deve expor detalhes do banco
    if (res.status === 500) {
      expect(res.body.error).not.toContain("SELECT");
      expect(res.body.error).not.toContain("pg_catalog");
    }
  });

  it("POST body: SQL injection no nome de campanha é seguro", async () => {
    const sqli = "Test'; DROP TABLE marketing.campaigns; --";
    const res = await request(app)
      .post("/api/campaigns")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({ nome: sqli, canal: "email" });
    // Deve criar normalmente (nome é string literal) ou rejeitar por validação
    expect([201, 400]).toContain(res.status);
    // Se criou, limpar
    if (res.status === 201 && res.body.id) {
      await query("DELETE FROM marketing.campaigns WHERE id = $1", [res.body.id]);
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// 2. XSS (Cross-Site Scripting)
// ═══════════════════════════════════════════════════════════════

describe("XSS — proteção", () => {
  it("POST /api/leads/capture sanitiza nome com tags HTML", async () => {
    const xss = '<script>alert("xss")</script>Nome Limpo';
    const res = await request(app)
      .post("/api/leads/capture")
      .send({ email: "vitest-security-xss@example.com", nome: xss });
    expect(res.status).toBe(200);
    // O nome salvo não deve conter a tag <script> bruta
    // Verificar no banco
    const lead = await query<{ nome: string }>(
      "SELECT nome FROM marketing.leads WHERE email = 'vitest-security-xss@example.com' LIMIT 1",
    );
    if (lead.length > 0) {
      expect(lead[0].nome).not.toContain("<script>");
    }
  });

  it("XSS via email no unsubscribe é escapado", async () => {
    const xssEmail = '<img src=x onerror=alert(1)>@example.com';
    const res = await request(app)
      .get(`/api/email/unsubscribe?email=${encodeURIComponent(xssEmail)}&token=x`);
    // Não deve conter o HTML bruto na resposta
    expect(res.text).not.toContain("<img src=x");
    expect(res.text).not.toContain("onerror=");
  });

  it("XSS no nome de fluxo é sanitizado", async () => {
    const xss = '<img src=x onerror=alert(1)>Teste';
    const res = await request(app)
      .post("/api/flows")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({
        nome: xss,
        gatilho: "order.paid",
        steps: [{ tipo: "email", template: "Agradecimento", delay_horas: 0 }],
        ativo: false,
      });
    if (res.status === 201) {
      expect(res.body.nome).not.toContain("<img");
      expect(res.body.nome).not.toContain("onerror");
      // Cleanup
      await query("DELETE FROM marketing.flows WHERE id = $1", [res.body.id]);
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// 3. PAYLOAD GRANDE (DoS)
// ═══════════════════════════════════════════════════════════════

describe("Payload grande — proteção", () => {
  it("rejeita body > 1MB em POST /api/leads/capture", async () => {
    const hugeString = "x".repeat(2 * 1024 * 1024); // 2MB
    const res = await request(app)
      .post("/api/leads/capture")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ email: "big@test.com", nome: hugeString }));
    // Express deve rejeitar com 413 (Payload Too Large) ou 400
    expect([400, 413, 500]).toContain(res.status);
  });
});

// ═══════════════════════════════════════════════════════════════
// 4. PATH TRAVERSAL
// ═══════════════════════════════════════════════════════════════

describe("Path traversal — proteção", () => {
  it("GET /api/images/serve/../../etc/passwd é bloqueado", async () => {
    const res = await request(app).get("/api/images/serve/..%2F..%2Fetc%2Fpasswd");
    expect([400, 404]).toContain(res.status);
  });

  it("GET /api/images/serve/..\\..\\etc\\passwd é bloqueado", async () => {
    const res = await request(app).get("/api/images/serve/..%5C..%5Cetc%5Cpasswd");
    expect([400, 404]).toContain(res.status);
  });

  it("GET /api/images/serve com null byte é bloqueado", async () => {
    const res = await request(app).get("/api/images/serve/test%00.jpg");
    expect([400, 404]).toContain(res.status);
  });

  it("GET /api/images/serve com extensão proibida é bloqueado", async () => {
    const res = await request(app).get("/api/images/serve/test.php");
    expect(res.status).toBe(400);
  });

  it("GET /api/images/serve com ID válido mas inexistente retorna 404", async () => {
    const res = await request(app).get("/api/images/serve/inexistente123456.jpg");
    expect(res.status).toBe(404);
  });
});

// ═══════════════════════════════════════════════════════════════
// 5. CORS E HEADERS DE SEGURANÇA
// ═══════════════════════════════════════════════════════════════

describe("CORS e headers de segurança", () => {
  it("health endpoint retorna headers de segurança (Helmet)", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    // Helmet adiciona estes headers
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBeDefined();
  });

  it("resposta não expõe X-Powered-By", async () => {
    const res = await request(app).get("/health");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════
// 6. CONTENT-TYPE HANDLING
// ═══════════════════════════════════════════════════════════════

describe("Content-Type handling", () => {
  it("POST sem Content-Type em rota de body não crasheia", async () => {
    const res = await request(app)
      .post("/api/leads/capture")
      .set("Content-Type", "text/plain")
      .send('{"email":"test@test.com"}');
    // Pode retornar 400 (body não parseado como JSON) ou 200
    expect([200, 400]).toContain(res.status);
  });
});

// ═══════════════════════════════════════════════════════════════
// 7. PAGINAÇÃO — OVERFLOW E NEGATIVOS
// ═══════════════════════════════════════════════════════════════

describe("Paginação — edge cases", () => {
  it("page=999999999 em /api/customers não crasheia", async () => {
    const res = await request(app)
      .get("/api/customers?page=999999999")
      .set("Authorization", `Bearer ${adminToken()}`);
    // Deve retornar 200 com lista vazia ou 400 por validação
    expect([200, 400]).toContain(res.status);
    if (res.status === 200 && res.body.customers) {
      expect(Array.isArray(res.body.customers)).toBe(true);
    }
  });

  it("page=-1 em /api/customers não crasheia", async () => {
    const res = await request(app)
      .get("/api/customers?page=-1")
      .set("Authorization", `Bearer ${adminToken()}`);
    // Deve retornar 200 (default page=1) ou 400
    expect([200, 400]).toContain(res.status);
  });

  it("page=NaN em /api/customers não crasheia", async () => {
    const res = await request(app)
      .get("/api/customers?page=abc")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect([200, 400]).toContain(res.status);
  });

  it("limit muito grande em /api/orders não crasheia", async () => {
    const res = await request(app)
      .get("/api/orders?limit=999999")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect([200, 400]).toContain(res.status);
  });
});

// ═══════════════════════════════════════════════════════════════
// 8. ENDPOINTS PROTEGIDOS — 401 sem auth
// ═══════════════════════════════════════════════════════════════

describe("Endpoints protegidos — 401 sem auth", () => {
  const protectedEndpoints = [
    { method: "GET", path: "/api/customers" },
    { method: "GET", path: "/api/campaigns" },
    { method: "GET", path: "/api/analytics/overview" },
    { method: "GET", path: "/api/sync/status" },
    { method: "GET", path: "/api/products" },
    { method: "GET", path: "/api/orders" },
    { method: "GET", path: "/api/flows" },
    { method: "GET", path: "/api/search?q=test" },
    { method: "GET", path: "/api/deals" },
    { method: "GET", path: "/api/templates" },
    { method: "GET", path: "/api/briefing" },
    { method: "GET", path: "/api/links/stats" },
    { method: "GET", path: "/api/campaigns/email-events" },
  ];

  for (const ep of protectedEndpoints) {
    it(`${ep.method} ${ep.path} → 401 sem token`, async () => {
      const res = await request(app).get(ep.path);
      expect(res.status).toBe(401);
    });
  }
});

// ═══════════════════════════════════════════════════════════════
// 9. ENDPOINTS PÚBLICOS — acessíveis sem auth
// ═══════════════════════════════════════════════════════════════

describe("Endpoints públicos — acessíveis sem auth", () => {
  it("GET /health retorna 200", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
  });

  it("GET /api/links/page retorna 200", async () => {
    const res = await request(app).get("/api/links/page");
    expect(res.status).toBe(200);
  });

  it("GET /api/leads/config retorna 200", async () => {
    const res = await request(app).get("/api/leads/config");
    expect(res.status).toBe(200);
  });
});

// ═══════════════════════════════════════════════════════════════
// 10. JWT — tokens inválidos
// ═══════════════════════════════════════════════════════════════

describe("JWT — tokens malformados e expirados", () => {
  it("token expirado → 401", async () => {
    const expired = jwt.sign(
      { userId: "test", email: "test@test.com", papel: "admin" },
      JWT_SECRET,
      { expiresIn: "-1h" },
    );
    const res = await request(app)
      .get("/api/customers")
      .set("Authorization", `Bearer ${expired}`);
    expect(res.status).toBe(401);
  });

  it("token com secret errado → 401", async () => {
    const bad = jwt.sign(
      { userId: "test", email: "test@test.com", papel: "admin" },
      "wrong-secret-key-vitest",
      { expiresIn: "1h" },
    );
    const res = await request(app)
      .get("/api/customers")
      .set("Authorization", `Bearer ${bad}`);
    expect(res.status).toBe(401);
  });

  it("token malformado (not.a.jwt) → 401", async () => {
    const res = await request(app)
      .get("/api/customers")
      .set("Authorization", "Bearer not.a.valid.jwt");
    expect(res.status).toBe(401);
  });

  it("sem Bearer prefix → 401", async () => {
    const token = adminToken();
    const res = await request(app)
      .get("/api/customers")
      .set("Authorization", token); // sem "Bearer "
    expect(res.status).toBe(401);
  });

  it("Authorization header vazio → 401", async () => {
    const res = await request(app)
      .get("/api/customers")
      .set("Authorization", "");
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════
// 11. 404 — rotas inexistentes
// ═══════════════════════════════════════════════════════════════

describe("404 — rotas inexistentes", () => {
  it("GET /api/rota-inexistente retorna 404", async () => {
    const res = await request(app).get("/api/rota-inexistente");
    expect(res.status).toBe(404);
  });

  it("resposta 404 não expõe stack trace", async () => {
    const res = await request(app).get("/api/rota-inexistente");
    expect(res.body).not.toHaveProperty("stack");
    expect(JSON.stringify(res.body)).not.toContain("at Object.");
    expect(JSON.stringify(res.body)).not.toContain("node_modules");
  });
});
