import { Router, Request, Response } from "express";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { query, queryOne } from "../db";
import { logger } from "../utils/logger";
import { sendEmail } from "../integrations/resend/email";
import rateLimit from "express-rate-limit";

export const portalSouParceiraRouter = Router();

// ── Rate limits ─────────────────────────────────────────────────
// Solicitação de código: 5 tentativas por 10 min por IP
const limiterSolicitar = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Muitas tentativas. Aguarde alguns minutos." },
  skip: () => process.env.VITEST === "true",
});

// Verificação de código: 10 tentativas por 15 min por IP
const limiterEntrar = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Muitas tentativas. Aguarde alguns minutos." },
  skip: () => process.env.VITEST === "true",
});

// Leitura do catálogo: permissivo (revendedora navega bastante)
const limiterCatalogo = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Muitas requisições. Aguarde um momento." },
});

// ── Helpers ──────────────────────────────────────────────────────

// Caracteres sem ambiguidade visual (sem 0/O, 1/I/L)
const OTP_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function gerarOTP(): string {
  const bytes = crypto.randomBytes(6);
  return Array.from(bytes)
    .map(b => OTP_CHARS[b % OTP_CHARS.length])
    .join("");
}

function validarCPF(raw: string): boolean {
  const d = raw.replace(/\D/g, "");
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(d[i]) * (10 - i);
  let rest = (sum * 10) % 11;
  if (rest >= 10) rest = 0;
  if (rest !== parseInt(d[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(d[i]) * (11 - i);
  rest = (sum * 10) % 11;
  if (rest >= 10) rest = 0;
  return rest === parseInt(d[10]);
}

function normalizarCPF(raw: string): string {
  return raw.replace(/\D/g, "");
}

function gerarJWT(revendedoraId: string, nivel: string): string {
  return jwt.sign(
    { sub: revendedoraId, nivel, iss: "souparceira" },
    process.env.JWT_SECRET!,
    { expiresIn: "24h" }
  );
}

function verificarJWT(token: string): { sub: string; nivel: string } {
  const payload = jwt.verify(token, process.env.JWT_SECRET!) as {
    sub: string;
    nivel: string;
    iss: string;
  };
  if (payload.iss !== "souparceira") throw new Error("token inválido");
  return { sub: payload.sub, nivel: payload.nivel };
}

// Middleware de auth para rotas protegidas do portal
function authParceira(req: Request, res: Response, next: () => void): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }
  try {
    const payload = verificarJWT(header.slice(7));
    (req as Request & { parceiraId?: string; parceiraNivel?: string })
      .parceiraId = payload.sub;
    (req as Request & { parceiraId?: string; parceiraNivel?: string })
      .parceiraNivel = payload.nivel;
    next();
  } catch {
    res.status(401).json({ error: "Sessão expirada. Faça login novamente." });
  }
}

function buildOTPEmail(nome: string, codigo: string): string {
  const nomeEsc = nome.replace(/[<>&"']/g, c =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" }[c]!)
  );
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Seu código de acesso — Bibelô</title>
</head>
<body style="margin:0;padding:0;background:#ffe5ec;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#ffe5ec;padding:32px 16px;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0"
             style="background:#ffffff;border-radius:16px;overflow:hidden;max-width:480px;width:100%;">

        <!-- Header -->
        <tr>
          <td style="background:#fe68c4;padding:28px 32px;text-align:center;">
            <p style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.5px;">
              🎀 Papelaria Bibelô
            </p>
            <p style="margin:8px 0 0;color:rgba(255,255,255,0.88);font-size:13px;">
              Catálogo Exclusivo para Revendedoras
            </p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:32px;">
            <p style="margin:0 0 8px;color:#333;font-size:15px;">
              Olá, <strong>${nomeEsc}</strong>!
            </p>
            <p style="margin:0 0 24px;color:#555;font-size:14px;line-height:1.6;">
              Seu código de acesso ao Catálogo Sou Parceira:
            </p>

            <!-- Código em destaque -->
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td align="center"
                    style="background:#ffe5ec;border:2px solid #fe68c4;border-radius:12px;padding:28px 16px;">
                  <p style="margin:0;font-size:40px;font-weight:800;color:#fe68c4;
                             letter-spacing:12px;font-family:'Courier New',Courier,monospace;">
                    ${codigo}
                  </p>
                  <p style="margin:12px 0 0;color:#888;font-size:12px;">
                    Válido por <strong>15 minutos</strong> · Não compartilhe este código
                  </p>
                </td>
              </tr>
            </table>

            <p style="margin:24px 0 0;color:#888;font-size:12px;line-height:1.6;">
              Se você não solicitou este código, pode ignorar este email com segurança.
              Nenhuma ação será tomada sem a confirmação.
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f9f9f9;padding:16px 32px;text-align:center;
                     border-top:1px solid #f0e0e8;">
            <p style="margin:0;color:#aaa;font-size:11px;">
              Papelaria Bibelô · Timbó/SC ·
              <a href="https://papelariabibelo.com.br"
                 style="color:#fe68c4;text-decoration:none;">papelariabibelo.com.br</a>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ── Mascara email para exibição segura ──────────────────────────

function mascaraEmail(email: string): string {
  const [user, domain] = email.split("@");
  if (!user || !domain) return "***@***";
  const visible = user.length <= 3 ? user[0] : user.slice(0, 2);
  return `${visible}${"*".repeat(Math.max(3, user.length - 2))}@${domain}`;
}

// ── POST /solicitar — só CPF → envia OTP ao email do cadastro ───

portalSouParceiraRouter.post(
  "/solicitar",
  limiterSolicitar,
  async (req: Request, res: Response) => {
    const schema = z.object({
      cpf: z.string().min(11).max(18),
    });
    const parse = schema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({ error: "CPF é obrigatório." });
      return;
    }

    const { cpf } = parse.data;
    const cpfNorm = normalizarCPF(cpf);

    if (!validarCPF(cpfNorm)) {
      res.status(400).json({ error: "CPF inválido." });
      return;
    }

    // Busca revendedora ativa pelo CPF
    const rev = await queryOne<{ id: string; nome: string; nivel: string; email: string }>(
      `SELECT id, nome, nivel, email
         FROM crm.revendedoras
        WHERE REGEXP_REPLACE(documento, '[^0-9]', '', 'g') = $1
          AND status = 'ativa'`,
      [cpfNorm]
    );

    const email = rev?.email ?? null;

    // CPF não encontrado como revendedora ativa
    if (!rev || !email) {
      await new Promise(r => setTimeout(r, 400)); // evita timing attack
      res.json({ ok: false, cadastrada: false });
      return;
    }

    // Rate limit por revendedora: máximo 3 solicitações por hora
    const recentes = await queryOne<{ total: string }>(
      `SELECT COUNT(*)::text AS total
         FROM crm.portal_parceira_otp
        WHERE revendedora_id = $1
          AND criado_em > NOW() - INTERVAL '1 hour'`,
      [rev.id]
    );
    if (parseInt(recentes?.total || "0") >= 3) {
      res.status(429).json({
        error: "Limite de solicitações atingido. Tente novamente em 1 hora.",
      });
      return;
    }

    // Invalida OTPs anteriores pendentes
    await queryOne(
      `UPDATE crm.portal_parceira_otp
          SET usado_em = NOW()
        WHERE revendedora_id = $1
          AND usado_em IS NULL
          AND expira_em > NOW()`,
      [rev.id]
    );

    // Gera novo OTP
    const codigo = gerarOTP();
    const expira = new Date(Date.now() + 15 * 60 * 1000);
    const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim()
      ?? req.socket.remoteAddress ?? null;

    await queryOne(
      `INSERT INTO crm.portal_parceira_otp
         (revendedora_id, codigo, expira_em, ip_solicitacao)
       VALUES ($1, $2, $3, $4)`,
      [rev.id, codigo, expira, ip]
    );

    // Envia email
    await sendEmail({
      to:      email,
      subject: `${codigo} — Seu código de acesso ao Catálogo Bibelô`,
      html:    buildOTPEmail(rev.nome, codigo),
      tags:    [{ name: "tipo", value: "otp_parceira" }],
    });

    logger.info("OTP parceira enviado", { revendedoraId: rev.id, nivel: rev.nivel });

    res.json({ ok: true, email_masked: mascaraEmail(email) });
  }
);

// ── POST /entrar — CPF + email + código → JWT ───────────────────

portalSouParceiraRouter.post(
  "/entrar",
  limiterEntrar,
  async (req: Request, res: Response) => {
    const schema = z.object({
      cpf:    z.string().min(11).max(18),
      codigo: z.string().length(6).toUpperCase(),
    });
    const parse = schema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({ error: "Dados inválidos." });
      return;
    }

    const { cpf, codigo } = parse.data;
    const cpfNorm = normalizarCPF(cpf);

    // Busca revendedora pelo CPF
    const rev = await queryOne<{ id: string; nome: string; nivel: string; percentual_desconto: string }>(
      `SELECT id, nome, nivel, percentual_desconto
         FROM crm.revendedoras
        WHERE REGEXP_REPLACE(documento, '[^0-9]', '', 'g') = $1
          AND status = 'ativa'`,
      [cpfNorm]
    );

    if (!rev) {
      res.status(401).json({ error: "Credenciais inválidas ou código incorreto." });
      return;
    }

    // Valida OTP
    const otp = await queryOne<{ id: string }>(
      `SELECT id FROM crm.portal_parceira_otp
        WHERE revendedora_id = $1
          AND codigo         = $2
          AND expira_em      > NOW()
          AND usado_em       IS NULL`,
      [rev.id, codigo]
    );

    if (!otp) {
      res.status(401).json({ error: "Código inválido ou expirado. Solicite um novo código." });
      return;
    }

    // Marca OTP como usado
    await queryOne(
      "UPDATE crm.portal_parceira_otp SET usado_em = NOW() WHERE id = $1",
      [otp.id]
    );

    // Atualiza último acesso
    queryOne(
      "UPDATE crm.revendedoras SET portal_ultimo_acesso_em = NOW() WHERE id = $1",
      [rev.id]
    ).catch(() => {});

    const token = gerarJWT(rev.id, rev.nivel);

    logger.info("Login parceira via OTP", { revendedoraId: rev.id, nivel: rev.nivel });

    res.json({
      token,
      revendedora: {
        nome:                rev.nome,
        nivel:               rev.nivel,
        percentual_desconto: Number(rev.percentual_desconto),
      },
    });
  }
);

// ── GET /me — info da revendedora logada ────────────────────────

portalSouParceiraRouter.get(
  "/me",
  limiterCatalogo,
  (req: Request, res: Response, next: () => void) => authParceira(req, res, next),
  async (req: Request, res: Response) => {
    const id = (req as Request & { parceiraId?: string }).parceiraId!;
    const rev = await queryOne<{ nome: string; nivel: string; percentual_desconto: string }>(
      `SELECT nome, nivel, percentual_desconto
         FROM crm.revendedoras
        WHERE id = $1 AND status = 'ativa'`,
      [id]
    );
    if (!rev) {
      res.status(401).json({ error: "Revendedora não encontrada ou inativa." });
      return;
    }
    res.json({
      nome:                rev.nome,
      nivel:               rev.nivel,
      percentual_desconto: Number(rev.percentual_desconto),
    });
  }
);

// ── GET /categorias ─────────────────────────────────────────────

portalSouParceiraRouter.get(
  "/categorias",
  limiterCatalogo,
  (req: Request, res: Response, next: () => void) => authParceira(req, res, next),
  async (_req: Request, res: Response) => {
    const rows = await query(`
      SELECT
        COALESCE(p.slug_categoria, p.categoria, 'outros') AS categoria,
        COUNT(*)::int AS total
      FROM sync.fornecedor_catalogo_jc p
      WHERE p.status = 'aprovado'
      GROUP BY COALESCE(p.slug_categoria, p.categoria, 'outros')
      ORDER BY COALESCE(p.slug_categoria, p.categoria, 'outros') ASC
    `);
    res.json(rows);
  }
);

// ── GET /catalogo ───────────────────────────────────────────────

portalSouParceiraRouter.get(
  "/catalogo",
  limiterCatalogo,
  (req: Request, res: Response, next: () => void) => authParceira(req, res, next),
  async (req: Request, res: Response) => {
    const id = (req as Request & { parceiraId?: string }).parceiraId!;

    const rev = await queryOne<{ percentual_desconto: string }>(
      "SELECT percentual_desconto FROM crm.revendedoras WHERE id = $1 AND status = 'ativa'",
      [id]
    );
    if (!rev) { res.status(401).json({ error: "Sessão inválida." }); return; }

    const SORT_MAP: Record<string, string> = {
      nome_asc:   "p.nome ASC",
      nome_desc:  "p.nome DESC",
      preco_asc:  "preco_final ASC",
      preco_desc: "preco_final DESC",
    };

    const schema = z.object({
      page:      z.coerce.number().int().min(1).default(1),
      limit:     z.coerce.number().int().min(1).max(100).default(12),
      search:    z.string().optional(),
      categoria: z.string().optional(),
      sort:      z.enum(["nome_asc", "nome_desc", "preco_asc", "preco_desc"]).default("nome_asc"),
    });
    const parse = schema.safeParse(req.query);
    if (!parse.success) { res.status(400).json({ error: "Parâmetros inválidos." }); return; }

    const { page, limit, search, categoria, sort } = parse.data;
    const offset  = (page - 1) * limit;
    const desconto = Number(rev.percentual_desconto);
    const orderBy = SORT_MAP[sort];

    const conditions: string[] = ["p.status = 'aprovado'"];
    const params: unknown[] = [];
    let idx = 1;

    if (search) {
      conditions.push(`p.nome ILIKE $${idx++}`);
      params.push(`%${search}%`);
    }
    if (categoria) {
      conditions.push(`COALESCE(p.slug_categoria, p.categoria) = $${idx++}`);
      params.push(categoria);
    }

    const where = `WHERE ${conditions.join(" AND ")}`;

    const total = await queryOne<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM sync.fornecedor_catalogo_jc p ${where}`,
      params
    );

    params.push(desconto, limit, offset);

    const rows = await query(`
      SELECT
        p.id,
        p.nome,
        COALESCE(p.slug_categoria, p.categoria, 'outros') AS categoria,
        p.imagem_url,
        p.imagens_urls,
        p.descricao,
        ROUND(
          p.preco_custo
          * COALESCE(p.markup_override, m.markup, 2.00)
          * (1.0 - $${idx} / 100.0)
        , 2) AS preco_final
      FROM sync.fornecedor_catalogo_jc p
      LEFT JOIN sync.fornecedor_markup_categorias m
        ON m.categoria = COALESCE(p.slug_categoria, p.categoria)
      ${where}
      ORDER BY ${orderBy}
      LIMIT $${idx + 1} OFFSET $${idx + 2}
    `, params);

    const totalInt = parseInt(total?.total || "0");
    res.json({
      produtos:      rows,
      total:         totalInt,
      pagina:        page,
      total_paginas: Math.ceil(totalInt / limit),
    });
  }
);

// ── GET /dashboard ───────────────────────────────────────────────

portalSouParceiraRouter.get(
  "/dashboard",
  limiterCatalogo,
  (req: Request, res: Response, next: () => void) => authParceira(req, res, next),
  async (req: Request, res: Response) => {
    const id = (req as Request & { parceiraId?: string }).parceiraId!;

    const rev = await queryOne<{
      volume_mes_atual: string;
      pontos: number;
      nivel: string;
      percentual_desconto: string;
    }>(
      `SELECT volume_mes_atual, pontos, nivel, percentual_desconto
         FROM crm.revendedoras
        WHERE id = $1 AND status = 'ativa'`,
      [id]
    );
    if (!rev) { res.status(401).json({ error: "Sessão inválida." }); return; }

    const totalPedidos = await queryOne<{ total: string }>(
      "SELECT COUNT(*)::text AS total FROM crm.revendedora_pedidos WHERE revendedora_id = $1",
      [id]
    );

    const ultimosPedidos = await query(
      `SELECT id, status, total, criado_em
         FROM crm.revendedora_pedidos
        WHERE revendedora_id = $1
        ORDER BY criado_em DESC
        LIMIT 3`,
      [id]
    );

    const vol = parseFloat(rev.volume_mes_atual || "0");
    let progresso_nivel;
    if (vol < 600) {
      const faltam = Math.max(0, 600 - vol);
      progresso_nivel = { proximo: "prata", meta: 600, faltam, percentual: Math.min(100, Math.max(0, ((vol - 300) / 300) * 100)) };
    } else if (vol < 1200) {
      const faltam = Math.max(0, 1200 - vol);
      progresso_nivel = { proximo: "ouro", meta: 1200, faltam, percentual: Math.min(100, Math.max(0, ((vol - 600) / 600) * 100)) };
    } else {
      progresso_nivel = { proximo: null, meta: 1200, faltam: 0, percentual: 100 };
    }

    res.json({
      volume_mes_atual:    Number(rev.volume_mes_atual),
      total_pedidos:       parseInt(totalPedidos?.total || "0"),
      pontos:              Number(rev.pontos),
      nivel:               rev.nivel,
      percentual_desconto: Number(rev.percentual_desconto),
      progresso_nivel,
      ultimos_pedidos:     ultimosPedidos,
    });
  }
);

// ── GET /modulos ─────────────────────────────────────────────────

portalSouParceiraRouter.get(
  "/modulos",
  limiterCatalogo,
  (req: Request, res: Response, next: () => void) => authParceira(req, res, next),
  async (req: Request, res: Response) => {
    const id = (req as Request & { parceiraId?: string }).parceiraId!;

    const modulos = await query(`
      SELECT
        m.id, m.nome, m.descricao, m.preco_mensal, m.ativo,
        (rm.revendedora_id IS NOT NULL) AS tem_acesso
      FROM crm.modulos m
      LEFT JOIN crm.revendedora_modulos rm
        ON rm.modulo_id = m.id AND rm.revendedora_id = $1
        AND (rm.expira_em IS NULL OR rm.expira_em > NOW())
      ORDER BY m.id
    `, [id]);

    res.json(modulos);
  }
);
