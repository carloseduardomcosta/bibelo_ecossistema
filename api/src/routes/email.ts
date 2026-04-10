import { Router, Request, Response } from "express";
import crypto from "crypto";
import path from "path";
import fs from "fs";
import rateLimit from "express-rate-limit";
import { query, queryOne } from "../db";
import { logger } from "../utils/logger";
import { sendEmail } from "../integrations/resend/email";

// ── Sanitização HTML (anti-XSS) ─────────────────────────────
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const publicLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { error: "Muitas requisições — tente novamente em 1 minuto" },
});

export const emailRouter = Router();

// ── Token HMAC para descadastro (sem precisar de auth) ─────
// Gera: hmac(email) com JWT_SECRET — verificável, sem banco

function getSecret(): string {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET não definido — configure no .env antes de iniciar o servidor.");
  }
  return process.env.JWT_SECRET;
}

export function gerarTokenDescadastro(email: string): string {
  return crypto.createHmac("sha256", getSecret()).update("email-unsub:" + email.toLowerCase().trim()).digest("hex");
}

export function gerarLinkDescadastro(email: string): string {
  const token = gerarTokenDescadastro(email);
  const base = process.env.APP_URL || "https://crm.papelariabibelo.com.br";
  return `${base}/api/email/unsubscribe?email=${encodeURIComponent(email)}&token=${token}`;
}

// ── GET /api/email/unsubscribe — descadastro 1-click (público) ──

emailRouter.get("/unsubscribe", publicLimiter, async (req: Request, res: Response) => {
  const email = (req.query.email as string || "").toLowerCase().trim();
  const token = (req.query.token as string || "").trim();

  if (!email || !token) {
    res.status(400).send(paginaErro("Link inválido. Entre em contato: contato@papelariabibelo.com.br"));
    return;
  }

  // Verifica token HMAC (tamanho + conteúdo)
  const esperado = gerarTokenDescadastro(email);
  const tokenBuf = Buffer.from(token);
  const esperadoBuf = Buffer.from(esperado);
  if (tokenBuf.length !== esperadoBuf.length || !crypto.timingSafeEqual(tokenBuf, esperadoBuf)) {
    res.status(403).send(paginaErro("Link inválido ou expirado."));
    return;
  }

  // Busca cliente
  const cliente = await queryOne<{ id: string; nome: string; email_optout: boolean }>(
    "SELECT id, nome, email_optout FROM crm.customers WHERE LOWER(email) = $1",
    [email]
  );

  if (!cliente) {
    // Mesmo sem cliente, não revelar — mostra sucesso
    res.send(paginaSucesso(email));
    return;
  }

  if (cliente.email_optout) {
    // Já descadastrado
    res.send(paginaSucesso(email));
    return;
  }

  // Marca opt-out
  await query(
    "UPDATE crm.customers SET email_optout = true, email_optout_em = NOW() WHERE id = $1",
    [cliente.id]
  );

  // Registra interação na timeline
  await query(
    `INSERT INTO crm.interactions (customer_id, tipo, descricao, criado_em)
     VALUES ($1, 'email_optout', 'Cliente solicitou descadastro de emails', NOW())`,
    [cliente.id]
  );

  logger.info("Cliente descadastrou do email", { email, customerId: cliente.id, nome: cliente.nome });

  // Notifica o Carlos
  try {
    await sendEmail({
      to: process.env.ADMIN_EMAIL || "contato@papelariabibelo.com.br",
      subject: `[Descadastro] ${(cliente.nome || email).replace(/[<>"]/g, "")} saiu da lista de emails`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:20px;">
          <h2 style="color:#ff4444;margin:0 0 15px;">Descadastro de Email</h2>
          <p><strong>Cliente:</strong> ${esc(cliente.nome || "—")}</p>
          <p><strong>Email:</strong> ${esc(email)}</p>
          <p><strong>Data:</strong> ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</p>
          <hr style="border:none;border-top:1px solid #eee;margin:15px 0;" />
          <p style="color:#999;font-size:12px;">
            Este cliente não receberá mais emails automáticos nem campanhas.<br>
            Para recadastrar, acesse o CRM e desmarque o opt-out manualmente.
          </p>
        </div>
      `,
    });
  } catch {
    // Não falha o descadastro se a notificação der erro
    logger.warn("Falha ao notificar descadastro", { email });
  }

  res.send(paginaSucesso(email));
});

// ── Páginas HTML de resposta ─────────────────────────────────

function paginaSucesso(email: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Descadastrado - Papelaria Bibelô</title></head>
<body style="margin:0;padding:0;background:#f5f0f2;font-family:'Segoe UI',Arial,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;">
  <div style="background:#fff;border-radius:16px;padding:40px;max-width:440px;text-align:center;box-shadow:0 4px 20px rgba(0,0,0,0.06);">
    <div style="width:64px;height:64px;background:#f0fff0;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 20px;font-size:32px;">✓</div>
    <h1 style="color:#333;font-size:22px;margin:0 0 10px;">Descadastrado com sucesso</h1>
    <p style="color:#666;font-size:15px;line-height:1.6;margin:0 0 20px;">
      O email <strong>${esc(email)}</strong> não receberá mais comunicações da Papelaria Bibelô.
    </p>
    <p style="color:#999;font-size:13px;margin:0 0 25px;">
      Se isso foi um engano, entre em contato:<br>
      <a href="mailto:contato@papelariabibelo.com.br" style="color:#fe68c4;">contato@papelariabibelo.com.br</a>
    </p>
    <a href="https://www.papelariabibelo.com.br" style="display:inline-block;background:#fe68c4;color:#fff;padding:12px 30px;border-radius:30px;text-decoration:none;font-weight:600;font-size:14px;">
      Voltar para a loja
    </a>
  </div>
</body>
</html>`;
}

function paginaErro(msg: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Erro - Papelaria Bibelô</title></head>
<body style="margin:0;padding:0;background:#f5f0f2;font-family:'Segoe UI',Arial,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;">
  <div style="background:#fff;border-radius:16px;padding:40px;max-width:440px;text-align:center;box-shadow:0 4px 20px rgba(0,0,0,0.06);">
    <div style="width:64px;height:64px;background:#fff0f0;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 20px;font-size:32px;">!</div>
    <h1 style="color:#333;font-size:22px;margin:0 0 10px;">Algo deu errado</h1>
    <p style="color:#666;font-size:15px;line-height:1.6;margin:0 0 20px;">${esc(msg)}</p>
    <a href="https://www.papelariabibelo.com.br" style="display:inline-block;background:#fe68c4;color:#fff;padding:12px 30px;border-radius:30px;text-decoration:none;font-weight:600;font-size:14px;">
      Voltar para a loja
    </a>
  </div>
</body>
</html>`;
}

// ═══════════════════════════════════════════════════════════════
// PROXY DE IMAGENS PARA EMAILS (serve imagens externas pelo nosso domínio)
// Evita que Gmail/Outlook marque como spam por imagens de domínio diferente
// ═══════════════════════════════════════════════════════════════

const IMG_CACHE_DIR = path.resolve(process.cwd(), "uploads", "email-img-cache");
if (!fs.existsSync(IMG_CACHE_DIR)) fs.mkdirSync(IMG_CACHE_DIR, { recursive: true });

const imgProxyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  message: { error: "Muitas requisições" },
});

// Domínios permitidos para proxy
const ALLOWED_IMG_DOMAINS = [
  "dcdn-us.mitiendanube.com",
  "d2r9epyceweg5n.cloudfront.net",
  "orgbling.s3.amazonaws.com",
  "images.unsplash.com",
];

// Detecta se um buffer é WEBP pelos magic bytes (RIFF....WEBP)
function isWebpBuffer(buf: Buffer): boolean {
  return buf.length >= 12
    && buf.toString("ascii", 0, 4) === "RIFF"
    && buf.toString("ascii", 8, 12) === "WEBP";
}

// GET /api/email/img/:hash — serve imagem cacheada
emailRouter.get("/img/:hash", imgProxyLimiter, async (req: Request, res: Response) => {
  const { hash } = req.params;
  if (!/^[a-f0-9]{32,64}\.(jpg|jpeg|png|webp|gif)$/.test(hash)) {
    res.status(400).json({ error: "Hash inválido" });
    return;
  }

  const filePath = path.resolve(IMG_CACHE_DIR, hash);
  if (!filePath.startsWith(path.resolve(IMG_CACHE_DIR))) {
    res.status(400).json({ error: "Caminho inválido" });
    return;
  }

  if (fs.existsSync(filePath)) {
    const ext = path.extname(hash).toLowerCase();
    const buf = fs.readFileSync(filePath);

    // Arquivos .jpg que na verdade são WEBP (Bling S3 não inclui extensão na URL):
    // converte on-the-fly e substitui o cache para próximas requisições
    if ((ext === ".jpg" || ext === ".jpeg") && isWebpBuffer(buf)) {
      try {
        const sharp = (await import("sharp")).default;
        const converted = await sharp(buf).jpeg({ quality: 90 }).toBuffer();
        fs.writeFileSync(filePath, converted); // atualiza cache
        res.setHeader("Content-Type", "image/jpeg");
        res.setHeader("Cache-Control", "public, max-age=2592000");
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.end(converted);
        return;
      } catch (err) {
        logger.error("Erro ao converter WEBP cacheado", { hash });
      }
    }

    const mimeMap: Record<string, string> = {
      ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
      ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif",
    };
    res.setHeader("Content-Type", mimeMap[ext] || "image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=2592000"); // 30 dias
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.end(buf);
    return;
  }

  res.status(404).json({ error: "Imagem não encontrada" });
});

// ── Helper: baixar e cachear imagem de forma async ────────────
async function downloadAndCacheImage(externalUrl: string, filePath: string, originalExt: string): Promise<void> {
  const axios = (await import("axios")).default;
  const resp = await axios.get(externalUrl, {
    responseType: "arraybuffer",
    timeout: 15000,
  });
  const buf = Buffer.from(resp.data);
  const contentType = ((resp.headers["content-type"] as string) || "").toLowerCase();

  // Detecta WEBP pelo ext declarado, pelo Content-Type da resposta ou pelos magic bytes
  // (Bling S3 serve WEBP sem extensão na URL — content-type e magic bytes são as fontes corretas)
  const isWebp = originalExt === "webp"
    || contentType.includes("webp")
    || isWebpBuffer(buf);

  if (isWebp) {
    const sharp = (await import("sharp")).default;
    const converted = await sharp(buf).jpeg({ quality: 90 }).toBuffer();
    fs.writeFileSync(filePath, converted);
  } else {
    fs.writeFileSync(filePath, buf);
  }
}

// ── Helper: aquece o cache de uma imagem (aguarda o download) ──
// Usar antes de gerar HTML de email para garantir que a imagem existe no cache
export async function warmProxyImage(externalUrl: string): Promise<void> {
  if (!externalUrl || !externalUrl.startsWith("http")) return;

  try {
    const parsed = new URL(externalUrl);
    if (!ALLOWED_IMG_DOMAINS.some(d => parsed.hostname.endsWith(d))) return;
  } catch { return; }

  const hash = crypto.createHash("sha256").update(externalUrl).digest("hex");
  const urlPath = externalUrl.split("?")[0];
  const originalExt = urlPath.endsWith(".png") ? "png"
    : urlPath.endsWith(".gif") ? "gif"
    : urlPath.endsWith(".webp") ? "webp"
    : "jpg";
  const ext = originalExt === "webp" ? "jpg" : originalExt;
  const filePath = path.join(IMG_CACHE_DIR, `${hash}.${ext}`);

  if (!fs.existsSync(filePath)) {
    try {
      await downloadAndCacheImage(externalUrl, filePath, originalExt);
    } catch {
      logger.error("Erro ao aquecer cache de imagem", { url: externalUrl.substring(0, 80) });
    }
  }
}

// ── Helper: converter URL externa em URL proxy ────────────────
// Usado pelos templates de campanha. Chame warmProxyImage() antes de enviar
// para garantir que o arquivo está em cache quando o email for lido.
export function proxyImageUrl(externalUrl: string): string {
  if (!externalUrl || !externalUrl.startsWith("http")) return externalUrl;

  try {
    const parsed = new URL(externalUrl);
    if (!ALLOWED_IMG_DOMAINS.some(d => parsed.hostname.endsWith(d))) {
      return externalUrl; // domínio não permitido, retorna original
    }
  } catch { return externalUrl; }

  // Hash determinístico da URL
  const hash = crypto.createHash("sha256").update(externalUrl).digest("hex");
  const urlPath = externalUrl.split("?")[0];
  const originalExt = urlPath.endsWith(".png") ? "png"
    : urlPath.endsWith(".gif") ? "gif"
    : urlPath.endsWith(".webp") ? "webp"
    : "jpg";

  // Emails: webp → jpg (Outlook/Yahoo não suportam webp)
  const ext = originalExt === "webp" ? "jpg" : originalExt;
  const fileName = `${hash}.${ext}`;
  const filePath = path.join(IMG_CACHE_DIR, fileName);

  // Baixar em background se não cacheado (fire-and-forget para uso rápido)
  if (!fs.existsSync(filePath)) {
    downloadAndCacheImage(externalUrl, filePath, originalExt).catch(() => {
      logger.error("Erro ao cachear imagem para email", { url: externalUrl.substring(0, 80) });
    });
  }

  const baseUrl = process.env.WEBHOOK_BASE_URL || "https://webhook.papelariabibelo.com.br";
  return `${baseUrl}/api/email/img/${fileName}`;
}

// ── GET /api/email/wa — redirect WhatsApp pelo nosso domínio ──
emailRouter.get("/wa", (_req: Request, res: Response) => {
  const text = typeof _req.query.text === "string" ? _req.query.text : "Olá!";
  res.redirect(302, `https://wa.me/5547933862514?text=${encodeURIComponent(text)}`);
});
