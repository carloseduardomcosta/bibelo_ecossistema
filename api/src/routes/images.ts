import { Router, Request, Response } from "express";
import { z } from "zod";
import multer from "multer";
import sharp from "sharp";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import rateLimit from "express-rate-limit";
import { authMiddleware } from "../middleware/auth";
import { logger } from "../utils/logger";
import { getValidToken, BLING_API } from "../integrations/bling/auth";
import { rateLimitedPatch } from "../integrations/bling/sync";

export const imagesRouter = Router();

// ── Diretório para imagens servidas publicamente ────────────
const SERVE_DIR = path.resolve(process.cwd(), "uploads", "images-temp");
if (!fs.existsSync(SERVE_DIR)) {
  fs.mkdirSync(SERVE_DIR, { recursive: true });
}

// ── Limpeza automática: remove imagens com mais de 1 hora ──
setInterval(() => {
  try {
    const now = Date.now();
    const files = fs.readdirSync(SERVE_DIR);
    for (const file of files) {
      const filePath = path.join(SERVE_DIR, file);
      const stat = fs.statSync(filePath);
      if (now - stat.mtimeMs > 60 * 60 * 1000) {
        fs.unlinkSync(filePath);
        logger.info("Imagem temporária removida", { file });
      }
    }
  } catch (err) {
    // silencioso
  }
}, 10 * 60 * 1000); // a cada 10 min
imagesRouter.use(authMiddleware);

// ── Upload config (memória — sem salvar em disco) ──────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB por arquivo
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "image/webp", "image/png", "image/jpeg", "image/jpg",
      "image/gif", "image/bmp", "image/tiff", "image/avif",
    ];
    if (!allowed.includes(file.mimetype)) {
      cb(new Error("Formato não suportado. Use: WEBP, PNG, JPG, GIF, BMP, TIFF, AVIF"));
      return;
    }
    cb(null, true);
  },
});

// ── Presets por marketplace ────────────────────────────────
const PRESETS: Record<string, { width: number; height: number; format: "jpeg" | "png"; quality: number; label: string }> = {
  shopee: {
    width: 1000,
    height: 1000,
    format: "jpeg",
    quality: 90,
    label: "Shopee (1000×1000 JPG)",
  },
  nuvemshop: {
    width: 1024,
    height: 1024,
    format: "jpeg",
    quality: 92,
    label: "NuvemShop (1024×1024 JPG)",
  },
  medusa: {
    width: 1200,
    height: 1200,
    format: "png",
    quality: 95,
    label: "Loja Própria (1200×1200 PNG)",
  },
  instagram: {
    width: 1080,
    height: 1080,
    format: "jpeg",
    quality: 95,
    label: "Instagram (1080×1080 JPG)",
  },
  custom: {
    width: 1000,
    height: 1000,
    format: "jpeg",
    quality: 90,
    label: "Personalizado",
  },
};

// ── Schemas ────────────────────────────────────────────────
const convertSchema = z.object({
  preset: z.enum(["shopee", "nuvemshop", "medusa", "instagram", "custom"]).default("shopee"),
  width: z.coerce.number().int().min(100).max(4000).optional(),
  height: z.coerce.number().int().min(100).max(4000).optional(),
  format: z.enum(["jpeg", "png", "webp"]).optional(),
  quality: z.coerce.number().int().min(10).max(100).optional(),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  fit: z.enum(["contain", "cover", "fill"]).optional(),
});

// ── GET /api/images/presets — lista presets disponíveis ────
imagesRouter.get("/presets", (_req: Request, res: Response) => {
  const presets = Object.entries(PRESETS).map(([key, val]) => ({
    key,
    ...val,
  }));
  res.json({ presets });
});

// ── POST /api/images/convert — converte 1 ou mais imagens ─
imagesRouter.post(
  "/convert",
  upload.array("images", 50),
  async (req: Request, res: Response) => {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      res.status(400).json({ error: "Nenhuma imagem enviada" });
      return;
    }

    const parse = convertSchema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({ error: "Parâmetros inválidos", details: parse.error.flatten() });
      return;
    }

    const opts = parse.data;
    const preset = PRESETS[opts.preset];

    const width = opts.width || preset.width;
    const height = opts.height || preset.height;
    const format = opts.format || preset.format;
    const quality = opts.quality || preset.quality;
    const background = opts.background || "#FFFFFF";
    const fit = opts.fit || "contain";

    // Converter RGB hex para objeto
    const bg = {
      r: parseInt(background.slice(1, 3), 16),
      g: parseInt(background.slice(3, 5), 16),
      b: parseInt(background.slice(5, 7), 16),
    };

    const results: Array<{
      originalName: string;
      originalSize: number;
      convertedSize: number;
      width: number;
      height: number;
      format: string;
      data: string; // base64
    }> = [];

    for (const file of files) {
      try {
        let pipeline = sharp(file.buffer)
          .rotate() // auto-rotate EXIF
          .resize(width, height, {
            fit,
            background: { ...bg, alpha: 1 },
            withoutEnlargement: false,
          })
          .flatten({ background: bg }); // remove transparência, aplica fundo

        let output: Buffer;
        let mimeType: string;
        let ext: string;

        if (format === "jpeg") {
          output = await pipeline.jpeg({ quality, mozjpeg: true }).toBuffer();
          mimeType = "image/jpeg";
          ext = "jpg";
        } else if (format === "png") {
          output = await pipeline.png({ quality, compressionLevel: 6 }).toBuffer();
          mimeType = "image/png";
          ext = "png";
        } else {
          output = await pipeline.webp({ quality }).toBuffer();
          mimeType = "image/webp";
          ext = "webp";
        }

        // Metadata da imagem convertida
        const meta = await sharp(output).metadata();

        // Nome do arquivo sem extensão original
        const baseName = file.originalname.replace(/\.[^.]+$/, "");

        results.push({
          originalName: file.originalname,
          originalSize: file.buffer.length,
          convertedSize: output.length,
          width: meta.width || width,
          height: meta.height || height,
          format: ext,
          data: `data:${mimeType};base64,${output.toString("base64")}`,
        });

        logger.info("Imagem convertida", {
          original: file.originalname,
          originalSize: `${(file.buffer.length / 1024).toFixed(0)}KB`,
          convertedSize: `${(output.length / 1024).toFixed(0)}KB`,
          dimensions: `${meta.width}x${meta.height}`,
          format: ext,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Erro desconhecido";
        logger.error("Erro ao converter imagem", { file: file.originalname, error: msg });
        results.push({
          originalName: file.originalname,
          originalSize: file.buffer.length,
          convertedSize: 0,
          width: 0,
          height: 0,
          format: "erro",
          data: "",
        });
      }
    }

    res.json({
      total: files.length,
      convertidos: results.filter(r => r.format !== "erro").length,
      erros: results.filter(r => r.format === "erro").length,
      config: { width, height, format, quality, background, fit },
      results,
    });
  }
);

// ── POST /api/images/info — metadata de 1 imagem ──────────
imagesRouter.post(
  "/info",
  upload.single("image"),
  async (req: Request, res: Response) => {
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: "Nenhuma imagem enviada" });
      return;
    }

    const meta = await sharp(file.buffer).metadata();

    res.json({
      name: file.originalname,
      size: file.size,
      format: meta.format,
      width: meta.width,
      height: meta.height,
      channels: meta.channels,
      hasAlpha: meta.hasAlpha,
      space: meta.space,
      dpi: meta.density,
    });
  }
);

// ═══════════════════════════════════════════════════════════════
// SERVIR IMAGENS PUBLICAMENTE (sem auth — Bling precisa acessar)
// ═══════════════════════════════════════════════════════════════

// ── GET /api/images/serve/:id — serve imagem temporária ─────
// Rota SEM authMiddleware — registrada separadamente no server.ts
// Segurança:
//   1. Rate limit próprio (60 req/min por IP)
//   2. Regex whitelist no ID (só alfanuméricos + _ . -)
//   3. Extensão validada contra whitelist (.jpg/.png/.webp)
//   4. Path traversal impossível (regex bloqueia / e ..)
//   5. Resolve path e verifica que está dentro do SERVE_DIR
//   6. Auto-cleanup: imagens expiram em 1h
//   7. Sem listagem de diretório — só acesso por ID exato

const serveRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Muitas requisições — tente novamente em 1 minuto" },
});

export const imagesPublicRouter = Router();

imagesPublicRouter.get("/serve/:id", serveRateLimit, (req: Request, res: Response) => {
  const { id } = req.params;

  // 1. Whitelist de caracteres (bloqueia path traversal, null bytes, etc)
  if (!/^[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp)$/.test(id)) {
    res.status(400).json({ error: "ID inválido" });
    return;
  }

  // 2. Resolver path e garantir que está dentro do diretório esperado
  const filePath = path.resolve(SERVE_DIR, id);
  if (!filePath.startsWith(path.resolve(SERVE_DIR))) {
    res.status(400).json({ error: "Caminho inválido" });
    return;
  }

  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: "Imagem não encontrada ou expirada" });
    return;
  }

  const ext = path.extname(id).toLowerCase();
  const mimeMap: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
  };

  // 3. Content-Type seguro (só imagens)
  const contentType = mimeMap[ext];
  if (!contentType) {
    res.status(400).json({ error: "Formato não permitido" });
    return;
  }

  res.setHeader("Content-Type", contentType);
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.setHeader("X-Content-Type-Options", "nosniff");
  fs.createReadStream(filePath).pipe(res);
});

// ═══════════════════════════════════════════════════════════════
// ENVIAR IMAGENS AO BLING
// ═══════════════════════════════════════════════════════════════

const sendBlingSchema = z.object({
  blingProductId: z.coerce.number().int().positive(),
  preset: z.enum(["shopee", "nuvemshop", "medusa", "instagram", "custom"]).default("shopee"),
  width: z.coerce.number().int().min(100).max(4000).optional(),
  height: z.coerce.number().int().min(100).max(4000).optional(),
  format: z.enum(["jpeg", "png"]).optional(),
  quality: z.coerce.number().int().min(10).max(100).optional(),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  fit: z.enum(["contain", "cover", "fill"]).optional(),
  replaceAll: z.coerce.boolean().optional(), // true = substituir todas as imagens
});

// ── POST /api/images/send-bling — converte e envia ao Bling ─
imagesRouter.post(
  "/send-bling",
  upload.array("images", 20),
  async (req: Request, res: Response) => {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      res.status(400).json({ error: "Nenhuma imagem enviada" });
      return;
    }

    const parse = sendBlingSchema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({ error: "Parâmetros inválidos", details: parse.error.flatten() });
      return;
    }

    const opts = parse.data;
    const preset = PRESETS[opts.preset] || PRESETS.shopee;
    const width = opts.width || preset.width;
    const height = opts.height || preset.height;
    const format = opts.format || preset.format;
    const quality = opts.quality || preset.quality;
    const background = opts.background || "#FFFFFF";
    const fit = opts.fit || "contain";

    const bg = {
      r: parseInt(background.slice(1, 3), 16),
      g: parseInt(background.slice(3, 5), 16),
      b: parseInt(background.slice(5, 7), 16),
    };

    // URL pública acessível externamente (sem Cloudflare Access)
    // api.papelariabibelo.com.br tem bloco Nginx para /api/images/serve/ → porta 4000
    const baseUrl = process.env.IMAGES_PUBLIC_URL || "https://api.papelariabibelo.com.br";

    // 1. Converter e salvar cada imagem em disco com URL pública
    const imageUrls: Array<{ link: string; fileName: string }> = [];

    for (const file of files) {
      try {
        let pipeline = sharp(file.buffer)
          .rotate()
          .resize(width, height, {
            fit,
            background: { ...bg, alpha: 1 },
            withoutEnlargement: false,
          })
          .flatten({ background: bg });

        let output: Buffer;
        let ext: string;

        if (format === "jpeg") {
          output = await pipeline.jpeg({ quality, mozjpeg: true }).toBuffer();
          ext = "jpg";
        } else {
          output = await pipeline.png({ quality, compressionLevel: 6 }).toBuffer();
          ext = "png";
        }

        // Salvar no disco com nome único
        const id = `${Date.now()}_${crypto.randomBytes(8).toString("hex")}.${ext}`;
        const filePath = path.join(SERVE_DIR, id);
        fs.writeFileSync(filePath, output);

        const publicUrl = `${baseUrl}/api/images/serve/${id}`;
        imageUrls.push({ link: publicUrl, fileName: file.originalname });

        logger.info("Imagem convertida e salva para Bling", {
          original: file.originalname,
          publicUrl,
          size: `${(output.length / 1024).toFixed(0)}KB`,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Erro desconhecido";
        logger.error("Erro ao converter imagem para Bling", { file: file.originalname, error: msg });
      }
    }

    if (imageUrls.length === 0) {
      res.status(500).json({ error: "Nenhuma imagem foi convertida com sucesso" });
      return;
    }

    // 2. Enviar ao Bling via PATCH /produtos/{id}
    try {
      const token = await getValidToken();

      const blingBody: Record<string, unknown> = {
        midia: {
          imagens: {
            imagensURL: imageUrls.map(u => ({ link: u.link })),
          },
        },
      };

      const result = await rateLimitedPatch<{ data: unknown }>(
        `${BLING_API}/produtos/${opts.blingProductId}`,
        token,
        blingBody,
      );

      logger.info("Imagens enviadas ao Bling", {
        blingProductId: opts.blingProductId,
        qtd: imageUrls.length,
      });

      res.json({
        success: true,
        blingProductId: opts.blingProductId,
        imagesCount: imageUrls.length,
        images: imageUrls,
        blingResponse: result,
      });
    } catch (err: unknown) {
      const axiosErr = err as { response?: { status?: number; data?: unknown }; message?: string };
      const msg = axiosErr.response?.data || axiosErr.message || "Erro desconhecido";
      logger.error("Erro ao enviar imagens ao Bling", {
        blingProductId: opts.blingProductId,
        error: msg,
      });
      res.status(502).json({
        error: "Erro ao enviar ao Bling",
        details: axiosErr.response?.data || axiosErr.message,
        images: imageUrls,
      });
    }
  }
);

// ── GET /api/images/bling-products — busca produtos Bling para seleção ─
imagesRouter.get("/bling-products", async (req: Request, res: Response) => {
  const search = z.string().optional().parse(req.query.search);

  const conditions = ["p.ativo = true"];
  const params: unknown[] = [];

  if (search) {
    conditions.push(`(p.nome ILIKE $1 OR p.sku ILIKE $1)`);
    params.push(`%${search}%`);
  }

  const { query: dbQuery } = await import("../db");
  const rows = await dbQuery(
    `SELECT p.bling_id, p.nome, p.sku, p.preco_venda, p.imagens
     FROM sync.bling_products p
     WHERE ${conditions.join(" AND ")}
     ORDER BY p.nome ASC
     LIMIT 50`,
    params,
  );

  res.json({ products: rows });
});
