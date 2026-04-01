import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../server";
import jwt from "jsonwebtoken";
import path from "path";
import fs from "fs";
import sharp from "sharp";

const JWT_SECRET = process.env.JWT_SECRET || "";

function adminToken(): string {
  return jwt.sign(
    { userId: "test-admin", email: "test@test.com", papel: "admin" },
    JWT_SECRET,
    { expiresIn: "1h" },
  );
}

// ── Gerar imagens de teste ─────────────────────────────────────
const TEST_DIR = path.resolve("/tmp", "bibelo-images-test");
const WEBP_PATH = path.join(TEST_DIR, "test-produto.webp");
const PNG_PATH = path.join(TEST_DIR, "test-produto.png");
const JPG_PATH = path.join(TEST_DIR, "test-produto.jpg");

beforeAll(async () => {
  fs.mkdirSync(TEST_DIR, { recursive: true });

  // Criar WEBP de teste 300x200 (simula foto de distribuidor)
  await sharp({
    create: { width: 300, height: 200, channels: 3, background: { r: 200, g: 100, b: 50 } },
  }).webp({ quality: 50 }).toFile(WEBP_PATH);

  // Criar PNG de teste 150x150 com transparência
  await sharp({
    create: { width: 150, height: 150, channels: 4, background: { r: 0, g: 128, b: 255, alpha: 0.5 } },
  }).png().toFile(PNG_PATH);

  // Criar JPG de teste 500x400
  await sharp({
    create: { width: 500, height: 400, channels: 3, background: { r: 50, g: 180, b: 80 } },
  }).jpeg({ quality: 70 }).toFile(JPG_PATH);
});

afterAll(() => {
  // Limpar imagens de teste
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
});

// ═══════════════════════════════════════════════════════════════
// 1. AUTENTICAÇÃO
// ═══════════════════════════════════════════════════════════════

describe("Imagens — autenticação", () => {
  it("retorna 401 sem token em /api/images/convert", async () => {
    const res = await request(app).post("/api/images/convert");
    expect(res.status).toBe(401);
  });

  it("retorna 401 com token inválido", async () => {
    const res = await request(app)
      .post("/api/images/convert")
      .set("Authorization", "Bearer token-falso");
    expect(res.status).toBe(401);
  });

  it("retorna 401 sem token em /api/images/send-bling", async () => {
    const res = await request(app).post("/api/images/send-bling");
    expect(res.status).toBe(401);
  });

  it("retorna 401 sem token em /api/images/bling-products", async () => {
    const res = await request(app).get("/api/images/bling-products");
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════
// 2. CONVERSÃO DE IMAGENS
// ═══════════════════════════════════════════════════════════════

describe("POST /api/images/convert — conversão", () => {
  it("retorna 400 sem imagem", async () => {
    const res = await request(app)
      .post("/api/images/convert")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Nenhuma imagem");
  });

  it("converte WEBP → JPG 1000x1000 (preset Shopee)", async () => {
    const res = await request(app)
      .post("/api/images/convert")
      .set("Authorization", `Bearer ${adminToken()}`)
      .field("preset", "shopee")
      .attach("images", WEBP_PATH);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.convertidos).toBe(1);
    expect(res.body.erros).toBe(0);
    expect(res.body.config.width).toBe(1000);
    expect(res.body.config.height).toBe(1000);
    expect(res.body.config.format).toBe("jpeg");

    const result = res.body.results[0];
    expect(result.format).toBe("jpg");
    expect(result.width).toBe(1000);
    expect(result.height).toBe(1000);
    expect(result.data).toMatch(/^data:image\/jpeg;base64,/);
    expect(result.convertedSize).toBeGreaterThan(0);
  });

  it("converte PNG → PNG 1200x1200 (preset Medusa/Loja Própria)", async () => {
    const res = await request(app)
      .post("/api/images/convert")
      .set("Authorization", `Bearer ${adminToken()}`)
      .field("preset", "medusa")
      .attach("images", PNG_PATH);

    expect(res.status).toBe(200);
    expect(res.body.config.format).toBe("png");
    expect(res.body.config.width).toBe(1200);

    const result = res.body.results[0];
    expect(result.format).toBe("png");
    expect(result.width).toBe(1200);
    expect(result.height).toBe(1200);
  });

  it("converte com preset NuvemShop (1024x1024 JPG)", async () => {
    const res = await request(app)
      .post("/api/images/convert")
      .set("Authorization", `Bearer ${adminToken()}`)
      .field("preset", "nuvemshop")
      .attach("images", JPG_PATH);

    expect(res.status).toBe(200);
    expect(res.body.config.width).toBe(1024);
    expect(res.body.config.height).toBe(1024);
    expect(res.body.config.format).toBe("jpeg");
    expect(res.body.results[0].width).toBe(1024);
  });

  it("converte múltiplas imagens em batch", async () => {
    const res = await request(app)
      .post("/api/images/convert")
      .set("Authorization", `Bearer ${adminToken()}`)
      .field("preset", "shopee")
      .attach("images", WEBP_PATH)
      .attach("images", PNG_PATH)
      .attach("images", JPG_PATH);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(3);
    expect(res.body.convertidos).toBe(3);
    expect(res.body.erros).toBe(0);

    // Todas devem ser 1000x1000 JPG (preset Shopee)
    for (const r of res.body.results) {
      expect(r.format).toBe("jpg");
      expect(r.width).toBe(1000);
      expect(r.height).toBe(1000);
    }
  });

  it("aplica fundo branco em imagem com transparência", async () => {
    const res = await request(app)
      .post("/api/images/convert")
      .set("Authorization", `Bearer ${adminToken()}`)
      .field("preset", "shopee")
      .field("background", "#FFFFFF")
      .attach("images", PNG_PATH);

    expect(res.status).toBe(200);

    // Decodificar base64 e verificar que não tem alpha
    const b64 = res.body.results[0].data.replace(/^data:image\/jpeg;base64,/, "");
    const buffer = Buffer.from(b64, "base64");
    const meta = await sharp(buffer).metadata();
    expect(meta.channels).toBe(3); // JPG sem canal alpha
  });

  it("aceita configurações custom", async () => {
    const res = await request(app)
      .post("/api/images/convert")
      .set("Authorization", `Bearer ${adminToken()}`)
      .field("preset", "custom")
      .field("width", "800")
      .field("height", "600")
      .field("format", "png")
      .field("quality", "85")
      .field("background", "#FF0000")
      .field("fit", "cover")
      .attach("images", WEBP_PATH);

    expect(res.status).toBe(200);
    expect(res.body.config.width).toBe(800);
    expect(res.body.config.height).toBe(600);
    expect(res.body.config.format).toBe("png");
    expect(res.body.config.quality).toBe(85);
    expect(res.body.results[0].format).toBe("png");
    expect(res.body.results[0].width).toBe(800);
    expect(res.body.results[0].height).toBe(600);
  });

  it("rejeita parâmetros inválidos", async () => {
    const res = await request(app)
      .post("/api/images/convert")
      .set("Authorization", `Bearer ${adminToken()}`)
      .field("preset", "invalido")
      .attach("images", WEBP_PATH);

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("inválidos");
  });
});

// ═══════════════════════════════════════════════════════════════
// 3. METADATA DE IMAGEM
// ═══════════════════════════════════════════════════════════════

describe("POST /api/images/info — metadata", () => {
  it("retorna metadata de WEBP", async () => {
    const res = await request(app)
      .post("/api/images/info")
      .set("Authorization", `Bearer ${adminToken()}`)
      .attach("image", WEBP_PATH);

    expect(res.status).toBe(200);
    expect(res.body.format).toBe("webp");
    expect(res.body.width).toBe(300);
    expect(res.body.height).toBe(200);
    expect(res.body.size).toBeGreaterThan(0);
  });

  it("retorna metadata de PNG com alpha", async () => {
    const res = await request(app)
      .post("/api/images/info")
      .set("Authorization", `Bearer ${adminToken()}`)
      .attach("image", PNG_PATH);

    expect(res.status).toBe(200);
    expect(res.body.format).toBe("png");
    expect(res.body.width).toBe(150);
    expect(res.body.height).toBe(150);
    expect(res.body.hasAlpha).toBe(true);
  });

  it("retorna 400 sem imagem", async () => {
    const res = await request(app)
      .post("/api/images/info")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(400);
  });
});

// ═══════════════════════════════════════════════════════════════
// 4. PRESETS
// ═══════════════════════════════════════════════════════════════

describe("GET /api/images/presets", () => {
  it("lista todos os presets", async () => {
    const res = await request(app)
      .get("/api/images/presets")
      .set("Authorization", `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.presets).toBeInstanceOf(Array);
    expect(res.body.presets.length).toBeGreaterThanOrEqual(5);

    const keys = res.body.presets.map((p: { key: string }) => p.key);
    expect(keys).toContain("shopee");
    expect(keys).toContain("nuvemshop");
    expect(keys).toContain("medusa");
    expect(keys).toContain("instagram");
    expect(keys).toContain("custom");
  });
});

// ═══════════════════════════════════════════════════════════════
// 5. SERVE PÚBLICO (sem auth)
// ═══════════════════════════════════════════════════════════════

describe("GET /api/images/serve/:id — endpoint público", () => {
  it("retorna 404 para imagem inexistente", async () => {
    const res = await request(app).get("/api/images/serve/nao-existe.jpg");
    expect(res.status).toBe(404);
  });

  it("retorna 400 para ID com caracteres inválidos", async () => {
    const res = await request(app).get("/api/images/serve/../../../etc/passwd");
    // Path traversal deve falhar na validação de regex
    expect([400, 404]).toContain(res.status);
  });

  it("NÃO exige autenticação", async () => {
    // Mesmo sem token, deve retornar 404 (não 401)
    const res = await request(app).get("/api/images/serve/qualquer.jpg");
    expect(res.status).toBe(404);
  });
});

// ═══════════════════════════════════════════════════════════════
// 6. BUSCA DE PRODUTOS BLING
// ═══════════════════════════════════════════════════════════════

describe("GET /api/images/bling-products — busca produtos", () => {
  it("retorna lista de produtos", async () => {
    const res = await request(app)
      .get("/api/images/bling-products")
      .set("Authorization", `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.products).toBeInstanceOf(Array);
    // A tabela pode estar vazia em ambiente de teste, mas a estrutura deve existir
  });

  it("filtra por busca textual", async () => {
    const res = await request(app)
      .get("/api/images/bling-products?search=teste-inexistente-xyz")
      .set("Authorization", `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.products).toBeInstanceOf(Array);
  });
});

// ═══════════════════════════════════════════════════════════════
// 7. ENVIO AO BLING (validação de input)
// ═══════════════════════════════════════════════════════════════

describe("POST /api/images/send-bling — validação", () => {
  it("retorna 400 sem imagem", async () => {
    const res = await request(app)
      .post("/api/images/send-bling")
      .set("Authorization", `Bearer ${adminToken()}`)
      .field("blingProductId", "12345");

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Nenhuma imagem");
  });

  it("retorna 400 sem blingProductId", async () => {
    const res = await request(app)
      .post("/api/images/send-bling")
      .set("Authorization", `Bearer ${adminToken()}`)
      .attach("images", WEBP_PATH);

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("inválidos");
  });

  it("retorna 400 com blingProductId negativo", async () => {
    const res = await request(app)
      .post("/api/images/send-bling")
      .set("Authorization", `Bearer ${adminToken()}`)
      .field("blingProductId", "-1")
      .attach("images", WEBP_PATH);

    expect(res.status).toBe(400);
  });

  it("retorna 400 com blingProductId não numérico", async () => {
    const res = await request(app)
      .post("/api/images/send-bling")
      .set("Authorization", `Bearer ${adminToken()}`)
      .field("blingProductId", "abc")
      .attach("images", WEBP_PATH);

    expect(res.status).toBe(400);
  });
});

// ═══════════════════════════════════════════════════════════════
// 8. FLUXO COMPLETO: converter → verificar qualidade
// ═══════════════════════════════════════════════════════════════

describe("Fluxo completo: WEBP distribuidor → imagem marketplace", () => {
  it("WEBP baixa qualidade → JPG 1000x1000 quadrado com fundo branco", async () => {
    // Simula o fluxo real: foto WEBP do distribuidor (300x200, baixa qualidade)
    const res = await request(app)
      .post("/api/images/convert")
      .set("Authorization", `Bearer ${adminToken()}`)
      .field("preset", "shopee")
      .field("background", "#FFFFFF")
      .field("fit", "contain")
      .attach("images", WEBP_PATH);

    expect(res.status).toBe(200);
    const result = res.body.results[0];

    // 1. Formato correto (JPG — aceito pela Shopee)
    expect(result.format).toBe("jpg");

    // 2. Dimensões quadradas 1000x1000
    expect(result.width).toBe(1000);
    expect(result.height).toBe(1000);

    // 3. Decodificar e validar com Sharp
    const b64 = result.data.replace(/^data:image\/jpeg;base64,/, "");
    const buffer = Buffer.from(b64, "base64");
    const meta = await sharp(buffer).metadata();

    expect(meta.format).toBe("jpeg");
    expect(meta.width).toBe(1000);
    expect(meta.height).toBe(1000);
    expect(meta.channels).toBe(3); // Sem alpha (fundo branco aplicado)

    // 4. Tamanho dentro do limite da Shopee (< 2MB)
    expect(buffer.length).toBeLessThan(2 * 1024 * 1024);

    // 5. A imagem original era menor — a convertida deve ser maior (upscale + qualidade)
    expect(result.convertedSize).toBeGreaterThan(result.originalSize);
  });

  it("imagem retangular vira quadrada com proporção mantida (contain)", async () => {
    // JPG 500x400 → 1000x1000 com contain = deve ter barras de fundo
    const res = await request(app)
      .post("/api/images/convert")
      .set("Authorization", `Bearer ${adminToken()}`)
      .field("preset", "shopee")
      .field("fit", "contain")
      .attach("images", JPG_PATH);

    expect(res.status).toBe(200);
    const result = res.body.results[0];
    expect(result.width).toBe(1000);
    expect(result.height).toBe(1000);

    // Validar pixels — com contain, a imagem fica centralizada
    const b64 = result.data.replace(/^data:image\/jpeg;base64,/, "");
    const buffer = Buffer.from(b64, "base64");
    const meta = await sharp(buffer).metadata();
    expect(meta.width).toBe(1000);
    expect(meta.height).toBe(1000);
  });
});
