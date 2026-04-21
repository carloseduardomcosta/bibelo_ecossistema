import { Router, Request, Response } from "express";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { query, queryOne } from "../db";
import { logger } from "../utils/logger";
import { sendEmail } from "../integrations/resend/email";
import { escHtml } from "../utils/sanitize";
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

        <!-- Header com logo -->
        <tr>
          <td style="background:#fe68c4;padding:28px 32px;text-align:center;">
            <img src="https://webhook.papelariabibelo.com.br/logo.png"
                 alt="Papelaria Bibelô" width="60" height="60"
                 style="display:block;margin:0 auto 10px;width:60px;height:60px;
                        border-radius:50%;border:3px solid rgba(255,255,255,0.5);"
                 onerror="this.style.display='none'" />
            <p style="margin:0;color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-0.5px;">
              Papelaria Bibelô
            </p>
            <p style="margin:6px 0 0;color:rgba(255,255,255,0.88);font-size:13px;">
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

    // Notificação no sininho + interação CRM (não-bloqueante)
    const nivelLabel: Record<string, string> = {
      iniciante: "Iniciante", bronze: "Bronze", prata: "Prata", ouro: "Ouro", diamante: "Diamante",
    };
    const nomeEsc  = escHtml(rev.nome);
    const nivelEsc = escHtml(nivelLabel[rev.nivel] ?? rev.nivel);
    const ipReq    = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim()
                     ?? req.socket.remoteAddress ?? null;

    queryOne(
      `INSERT INTO public.notificacoes (tipo, titulo, corpo, link)
       VALUES ('acesso_portal_parceira', $1, $2, '/revendedoras')`,
      [
        `${nomeEsc} acessou o portal`,
        `${nivelEsc} · acesso via OTP confirmado`,
      ]
    ).catch(err => logger.error("Erro ao inserir notificação de acesso", { error: (err as Error).message }));

    // Registra na timeline do CRM se houver customer_id vinculado
    queryOne<{ customer_id: string | null }>(
      "SELECT customer_id FROM crm.revendedoras WHERE id = $1", [rev.id]
    ).then(r => {
      if (!r?.customer_id) return;
      return queryOne(
        `INSERT INTO crm.interactions (customer_id, tipo, canal, descricao, metadata)
         VALUES ($1, 'portal_acesso', 'web', 'Parceira acessou o portal Sou Parceira', $2)`,
        [r.customer_id, JSON.stringify({ nivel: rev.nivel, ip: ipReq })]
      );
    }).catch(err => logger.error("Erro ao registrar interação de acesso", { error: (err as Error).message }));

    const token = gerarJWT(rev.id, rev.nivel);

    // Conta novos produtos desde a última visita ao catálogo
    const novosRow = await queryOne<{ total: string; catalogo_visitado_em: string | null }>(
      `SELECT COUNT(p.*)::text AS total, r.catalogo_visitado_em
         FROM crm.revendedoras r
         LEFT JOIN sync.fornecedor_catalogo_jc p
           ON p.status = 'aprovado'
          AND p.atualizado_em > COALESCE(r.catalogo_visitado_em, '1970-01-01'::timestamptz)
        WHERE r.id = $1
        GROUP BY r.catalogo_visitado_em`,
      [rev.id]
    );

    logger.info("Login parceira via OTP", { revendedoraId: rev.id, nivel: rev.nivel });

    res.json({
      token,
      revendedora: {
        nome:                rev.nome,
        nivel:               rev.nivel,
        percentual_desconto: Number(rev.percentual_desconto),
        novos_produtos:      parseInt(novosRow?.total || "0"),
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
    const rev = await queryOne<{
      nome: string; nivel: string; percentual_desconto: string;
      catalogo_visitado_em: string | null;
    }>(
      `SELECT nome, nivel, percentual_desconto, catalogo_visitado_em
         FROM crm.revendedoras
        WHERE id = $1 AND status = 'ativa'`,
      [id]
    );
    if (!rev) {
      res.status(401).json({ error: "Revendedora não encontrada ou inativa." });
      return;
    }

    // Conta produtos aprovados desde a última visita ao catálogo
    const novosRow = await queryOne<{ total: string }>(
      `SELECT COUNT(*)::text AS total
         FROM sync.fornecedor_catalogo_jc
        WHERE status = 'aprovado'
          AND atualizado_em > COALESCE($1, '1970-01-01'::timestamptz)`,
      [rev.catalogo_visitado_em]
    );

    res.json({
      nome:                rev.nome,
      nivel:               rev.nivel,
      percentual_desconto: Number(rev.percentual_desconto),
      novos_produtos:      parseInt(novosRow?.total || "0"),
    });
  }
);

// ── POST /catalogo/visita — registra visita ao catálogo ──────────

portalSouParceiraRouter.post(
  "/catalogo/visita",
  limiterCatalogo,
  (req: Request, res: Response, next: () => void) => authParceira(req, res, next),
  async (req: Request, res: Response) => {
    const id = (req as Request & { parceiraId?: string }).parceiraId!;
    await queryOne(
      "UPDATE crm.revendedoras SET catalogo_visitado_em = NOW() WHERE id = $1",
      [id]
    );
    res.json({ ok: true });
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
      conditions.push(`(p.nome ILIKE $${idx} OR p.descricao ILIKE $${idx})`);
      params.push(`%${search}%`);
      idx++;
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
        , 2) AS preco_sem_desconto,
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
    // Progresso correto para todos os 5 níveis
    let progresso_nivel: { proximo: string | null; meta: number; faltam: number; percentual: number };
    if (vol >= 3000) {
      progresso_nivel = { proximo: null, meta: 3000, faltam: 0, percentual: 100 };
    } else if (vol >= 1200) {
      const faltam = Math.max(0, 3000 - vol);
      progresso_nivel = { proximo: "diamante", meta: 3000, faltam, percentual: Math.min(100, Math.max(0, ((vol - 1200) / 1800) * 100)) };
    } else if (vol >= 600) {
      const faltam = Math.max(0, 1200 - vol);
      progresso_nivel = { proximo: "ouro", meta: 1200, faltam, percentual: Math.min(100, Math.max(0, ((vol - 600) / 600) * 100)) };
    } else if (vol >= 300) {
      const faltam = Math.max(0, 600 - vol);
      progresso_nivel = { proximo: "prata", meta: 600, faltam, percentual: Math.min(100, Math.max(0, ((vol - 300) / 300) * 100)) };
    } else {
      const faltam = Math.max(0, 300 - vol);
      progresso_nivel = { proximo: "bronze", meta: 300, faltam, percentual: Math.min(100, Math.max(0, (vol / 300) * 100)) };
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
        (rm.revendedora_id IS NOT NULL) AS tem_acesso,
        rm.expira_em,
        rm.plano,
        rm.status AS assinatura_status
      FROM crm.modulos m
      LEFT JOIN crm.revendedora_modulos rm
        ON rm.modulo_id = m.id AND rm.revendedora_id = $1
        AND rm.status = 'ativo'
        AND (rm.expira_em IS NULL OR rm.expira_em > NOW())
      WHERE m.ativo = true
      ORDER BY m.id
    `, [id]);

    res.json(modulos);
  }
);

// ── Rate limit para escrita (pedidos / mensagens) ───────────────
const limiterEscrita = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Muitas requisições. Aguarde um momento." },
  skip: () => process.env.VITEST === "true",
});

// ── Helpers de nível ─────────────────────────────────────────────

function calcularNivelPortal(volume: number): { nivel: string; desconto: number } {
  if (volume >= 3000) return { nivel: "diamante", desconto: 30 };
  if (volume >= 1200) return { nivel: "ouro",     desconto: 25 };
  if (volume >= 600)  return { nivel: "prata",    desconto: 20 };
  if (volume >= 300)  return { nivel: "bronze",   desconto: 15 };
  return                    { nivel: "iniciante", desconto: 0  };
}

// ── Helpers de email ─────────────────────────────────────────────

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "contato@papelariabibelo.com.br";

function buildEmailNovoPedido(
  revNome: string,
  numeroPedido: string,
  total: string,
  itens: Array<{ produto_nome: string; quantidade: number; preco_com_desconto: number }>,
  observacao?: string | null
): string {
  const totalFmt = Number(total).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const itensHTML = itens.map(it => `
    <tr>
      <td style="padding:6px 8px;font-size:13px;color:#333;">${escHtml(it.produto_nome)}</td>
      <td style="padding:6px 8px;font-size:13px;color:#555;text-align:center;">${it.quantidade}</td>
      <td style="padding:6px 8px;font-size:13px;color:#fe68c4;text-align:right;font-weight:700;">
        ${Number(it.preco_com_desconto).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
      </td>
    </tr>`).join("");

  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#ffe5ec;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#ffe5ec;padding:32px 16px;">
<tr><td align="center">
<table width="520" cellpadding="0" cellspacing="0"
       style="background:#fff;border-radius:16px;overflow:hidden;max-width:520px;width:100%;">
  <tr><td style="background:#fe68c4;padding:24px 32px;text-align:center;">
    <img src="https://webhook.papelariabibelo.com.br/logo.png" alt="Papelaria Bibelô"
         width="52" height="52"
         style="display:block;margin:0 auto 8px;width:52px;height:52px;border-radius:50%;border:2px solid rgba(255,255,255,0.5);"
         onerror="this.style.display='none'" />
    <p style="margin:0;color:#fff;font-size:18px;font-weight:700;">Papelaria Bibelô</p>
    <p style="margin:5px 0 0;color:rgba(255,255,255,0.85);font-size:13px;">Novo pedido recebido pelo Portal Sou Parceira</p>
  </td></tr>
  <tr><td style="padding:28px 32px;">
    <p style="margin:0 0 4px;font-size:15px;color:#333;">Pedido de <strong>${escHtml(revNome)}</strong></p>
    <p style="margin:0 0 20px;font-size:22px;font-weight:800;color:#fe68c4;">${escHtml(numeroPedido)}</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #f0e0e8;border-radius:8px;overflow:hidden;">
      <thead><tr style="background:#ffe5ec;">
        <th style="padding:8px;font-size:11px;font-weight:700;color:#888;text-align:left;text-transform:uppercase;">Produto</th>
        <th style="padding:8px;font-size:11px;font-weight:700;color:#888;text-align:center;text-transform:uppercase;">Qtd</th>
        <th style="padding:8px;font-size:11px;font-weight:700;color:#888;text-align:right;text-transform:uppercase;">Valor</th>
      </tr></thead>
      <tbody>${itensHTML}</tbody>
      <tfoot><tr style="background:#fdf6f9;">
        <td colspan="2" style="padding:10px 8px;font-size:14px;font-weight:700;color:#333;">Total</td>
        <td style="padding:10px 8px;font-size:16px;font-weight:800;color:#fe68c4;text-align:right;">${escHtml(totalFmt)}</td>
      </tr></tfoot>
    </table>
    ${observacao ? `<p style="margin:16px 0 0;font-size:13px;color:#555;"><strong>Observação:</strong> ${escHtml(observacao)}</p>` : ""}
    <p style="margin:24px 0 0;font-size:13px;color:#888;">Acesse o CRM para aprovar e responder.</p>
  </td></tr>
  <tr><td style="background:#f9f9f9;padding:14px 32px;text-align:center;border-top:1px solid #f0e0e8;">
    <p style="margin:0;color:#aaa;font-size:11px;">Papelaria Bibelô · Timbó/SC · <a href="https://papelariabibelo.com.br" style="color:#fe68c4;text-decoration:none;">papelariabibelo.com.br</a></p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

function buildEmailStatusPedido(
  revNome: string,
  numeroPedido: string,
  status: string,
  observacaoAdmin?: string | null
): string {
  const STATUS_LABELS: Record<string, string> = {
    aprovado:  "✅ Aprovado",
    enviado:   "🚚 Enviado",
    entregue:  "📦 Entregue",
    cancelado: "❌ Cancelado",
  };
  const label = STATUS_LABELS[status] ?? status;
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#ffe5ec;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#ffe5ec;padding:32px 16px;">
<tr><td align="center">
<table width="480" cellpadding="0" cellspacing="0"
       style="background:#fff;border-radius:16px;overflow:hidden;max-width:480px;width:100%;">
  <tr><td style="background:#fe68c4;padding:24px 32px;">
    <p style="margin:0;color:#fff;font-size:20px;font-weight:700;">🎀 Papelaria Bibelô</p>
    <p style="margin:6px 0 0;color:rgba(255,255,255,0.85);font-size:13px;">Atualização do seu pedido</p>
  </td></tr>
  <tr><td style="padding:28px 32px;">
    <p style="margin:0 0 4px;font-size:14px;color:#555;">Olá, <strong>${escHtml(revNome)}</strong>!</p>
    <p style="margin:6px 0 16px;font-size:13px;color:#777;">Seu pedido <strong>${escHtml(numeroPedido)}</strong> foi atualizado:</p>
    <div style="text-align:center;padding:20px;background:#fdf6f9;border-radius:12px;margin:0 0 16px;">
      <p style="margin:0;font-size:24px;font-weight:800;color:#333;">${escHtml(label)}</p>
    </div>
    ${observacaoAdmin ? `<p style="font-size:13px;color:#555;background:#fff7c1;border-radius:8px;padding:12px 16px;margin:0;"><strong>Mensagem da Bibelô:</strong> ${escHtml(observacaoAdmin)}</p>` : ""}
    <p style="margin:20px 0 0;font-size:13px;color:#888;">Acesse o portal Sou Parceira para mais detalhes.</p>
  </td></tr>
  <tr><td style="background:#f9f9f9;padding:14px 32px;text-align:center;border-top:1px solid #f0e0e8;">
    <p style="margin:0;color:#aaa;font-size:11px;">Papelaria Bibelô · Timbó/SC</p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

function buildEmailNovaMensagem(
  destinatarioNome: string,
  remetente: string,
  numeroPedido: string,
  mensagem: string
): string {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#ffe5ec;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#ffe5ec;padding:32px 16px;">
<tr><td align="center">
<table width="480" cellpadding="0" cellspacing="0"
       style="background:#fff;border-radius:16px;overflow:hidden;max-width:480px;width:100%;">
  <tr><td style="background:#fe68c4;padding:24px 32px;">
    <p style="margin:0;color:#fff;font-size:20px;font-weight:700;">🎀 Papelaria Bibelô</p>
    <p style="margin:6px 0 0;color:rgba(255,255,255,0.85);font-size:13px;">Nova mensagem no pedido ${escHtml(numeroPedido)}</p>
  </td></tr>
  <tr><td style="padding:28px 32px;">
    <p style="margin:0 0 4px;font-size:14px;color:#555;">Olá, <strong>${escHtml(destinatarioNome)}</strong>!</p>
    <p style="margin:6px 0 16px;font-size:13px;color:#777;"><strong>${escHtml(remetente)}</strong> enviou uma mensagem:</p>
    <div style="background:#fdf6f9;border-left:4px solid #fe68c4;border-radius:0 8px 8px 0;padding:14px 16px;margin:0 0 16px;">
      <p style="margin:0;font-size:14px;color:#333;line-height:1.6;">${escHtml(mensagem)}</p>
    </div>
    <p style="margin:0;font-size:12px;color:#aaa;">Acesse o portal para responder.</p>
  </td></tr>
  <tr><td style="background:#f9f9f9;padding:14px 32px;text-align:center;border-top:1px solid #f0e0e8;">
    <p style="margin:0;color:#aaa;font-size:11px;">Papelaria Bibelô · Timbó/SC</p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

// ── Helper: criar notificação CRM ────────────────────────────────

async function criarNotificacao(
  tipo: string, titulo: string, corpo: string | null, link?: string | null
): Promise<void> {
  try {
    await queryOne(
      `INSERT INTO public.notificacoes (tipo, titulo, corpo, link)
       VALUES ($1, $2, $3, $4)`,
      [tipo, titulo, corpo ?? null, link ?? null]
    );
  } catch (err) {
    logger.error("Erro ao criar notificação CRM", { error: (err as Error).message });
  }
}

// ── Helper: gerar número de pedido ──────────────────────────────

async function gerarNumeroPedidoPortal(): Promise<string> {
  const now   = new Date();
  const yyyymm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  for (let i = 0; i < 5; i++) {
    const rand = crypto.randomBytes(3).toString("hex").toUpperCase();
    const num  = `REV-${yyyymm}-${rand}`;
    const exists = await queryOne("SELECT id FROM crm.revendedora_pedidos WHERE numero_pedido = $1", [num]);
    if (!exists) return num;
  }
  throw new Error("Não foi possível gerar número de pedido único");
}

// ── POST /pedidos — revendedora faz pedido direto pelo portal ────

portalSouParceiraRouter.post(
  "/pedidos",
  limiterEscrita,
  (req: Request, res: Response, next: () => void) => authParceira(req, res, next),
  async (req: Request, res: Response) => {
    const id = (req as Request & { parceiraId?: string }).parceiraId!;

    const schema = z.object({
      itens: z.array(z.object({
        produto_id:   z.string().uuid(),
        quantidade:   z.number().int().min(1).max(9999),
      })).min(1).max(200),
      observacao: z.string().max(1000).optional(),
    });
    const parse = schema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({ error: "Dados inválidos.", detalhes: parse.error.errors });
      return;
    }

    const rev = await queryOne<{
      nome: string; email: string; nivel: string; percentual_desconto: string; pedido_minimo: string;
    }>(
      "SELECT nome, email, nivel, percentual_desconto, pedido_minimo FROM crm.revendedoras WHERE id = $1 AND status = 'ativa'",
      [id]
    );
    if (!rev) { res.status(401).json({ error: "Sessão inválida." }); return; }

    const descPct = Number(rev.percentual_desconto);
    const minimo  = parseFloat(rev.pedido_minimo ?? "300");
    const { itens: itemsInput, observacao } = parse.data;

    // Buscar preços server-side — nunca confiar em preços do cliente
    const ids = itemsInput.map(i => i.produto_id);
    const produtos = await query<{
      id: string; nome: string; categoria: string;
      preco_custo: string; markup_override: string | null; markup: string | null;
    }>(`
      SELECT
        p.id,
        p.nome,
        COALESCE(p.slug_categoria, p.categoria, 'outros') AS categoria,
        p.preco_custo,
        p.markup_override,
        m.markup
      FROM sync.fornecedor_catalogo_jc p
      LEFT JOIN sync.fornecedor_markup_categorias m
        ON m.categoria = COALESCE(p.slug_categoria, p.categoria)
      WHERE p.id = ANY($1::uuid[]) AND p.status = 'aprovado'
    `, [ids]);

    if (produtos.length !== ids.length) {
      res.status(400).json({ error: "Um ou mais produtos não encontrados ou não disponíveis." });
      return;
    }

    const prodMap = new Map(produtos.map(p => [p.id, p]));

    // Calcular itens com o desconto atual (provisório)
    let itensCalculados = itemsInput.map(item => {
      const p     = prodMap.get(item.produto_id)!;
      const markup = Number(p.markup_override ?? p.markup ?? 2.00);
      const precoCusto = Number(p.preco_custo);
      const precoRevenda = Math.round(precoCusto * markup * 100) / 100;
      const precoComDesconto = Math.round(precoRevenda * (1 - descPct / 100) * 100) / 100;
      return {
        produto_id:         p.id,
        produto_nome:       p.nome,
        produto_sku:        "",
        quantidade:         item.quantidade,
        preco_unitario:     precoRevenda,
        preco_com_desconto: precoComDesconto,
      };
    });

    // ── Projeção de nível ──────────────────────────────────────────
    // Se este pedido (somado ao volume aprovado do mês) cruzar um threshold,
    // aplica o desconto melhor já neste pedido — não no próximo.
    //
    // Nota: o total armazenado será o valor com o desconto melhorado. Após
    // aprovação, recalcularVolume somará esse total, que pode ficar abaixo
    // do threshold Diamante (ex.: 30% reduz R$3.216→R$2.649 → Ouro no recalc).
    // A parceira recebeu o benefício neste pedido; os próximos usam o tier
    // recalculado sobre o valor real pago.
    const volumeRow = await queryOne<{ volume: string }>(
      `SELECT COALESCE(SUM(total), 0)::text AS volume
         FROM crm.revendedora_pedidos
        WHERE revendedora_id = $1
          AND status IN ('aprovado', 'enviado', 'entregue')
          AND DATE_TRUNC('month', criado_em) = DATE_TRUNC('month', NOW())`,
      [id]
    );
    const volumeAcumulado  = parseFloat(volumeRow?.volume || "0");
    const totalProvisorio  = itensCalculados.reduce((s, i) => s + i.preco_com_desconto * i.quantidade, 0);
    const volumeProjetado  = volumeAcumulado + totalProvisorio;
    const { nivel: nivelProjetado, desconto: descontoProjetado } = calcularNivelPortal(volumeProjetado);

    let descPctFinal = descPct;
    let nivelUpgrade: { de: string; para: string } | null = null;

    if (descontoProjetado > descPct) {
      descPctFinal = descontoProjetado;
      nivelUpgrade = { de: rev.nivel, para: nivelProjetado };
      itensCalculados = itensCalculados.map(i => ({
        ...i,
        preco_com_desconto: Math.round(i.preco_unitario * (1 - descPctFinal / 100) * 100) / 100,
      }));
    }
    // ──────────────────────────────────────────────────────────────

    const subtotal = itensCalculados.reduce((s, i) => s + i.preco_unitario * i.quantidade, 0);
    const total    = itensCalculados.reduce((s, i) => s + i.preco_com_desconto * i.quantidade, 0);
    const descVal  = subtotal - total;

    if (total < minimo) {
      res.status(400).json({
        error: `Pedido mínimo é R$ ${minimo.toFixed(2).replace(".", ",")}. Total atual: R$ ${total.toFixed(2).replace(".", ",")}`,
        pedido_minimo: minimo,
        total_atual: total,
      });
      return;
    }

    const numero = await gerarNumeroPedidoPortal();

    const pedido = await queryOne(
      `INSERT INTO crm.revendedora_pedidos
         (revendedora_id, numero_pedido, subtotal, desconto_percentual,
          desconto_valor, total, observacao, itens)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [id, numero, subtotal.toFixed(2), descPctFinal, descVal.toFixed(2),
       total.toFixed(2), observacao ?? null, JSON.stringify(itensCalculados)]
    );

    // Conquista: primeiro pedido
    const totalPedidos = await queryOne<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM crm.revendedora_pedidos WHERE revendedora_id = $1", [id]
    );
    if (parseInt(totalPedidos?.count || "0") === 1) {
      await queryOne(
        `INSERT INTO crm.revendedora_conquistas (revendedora_id, tipo, descricao, pontos)
         VALUES ($1, 'primeiro_pedido', 'Primeira Compra — bem-vinda ao Clube Bibelô!', 10)
         ON CONFLICT (revendedora_id, tipo) DO NOTHING`,
        [id]
      ).catch(() => {});
    }

    // Notificação CRM + email para Carlos
    const totalFmt = Number(total.toFixed(2)).toLocaleString("pt-BR", {
      style: "currency", currency: "BRL",
    });
    await criarNotificacao(
      "novo_pedido",
      `Novo pedido ${numero}`,
      `${rev.nome} · ${totalFmt}`,
      `/revendedoras`
    );
    sendEmail({
      to:      ADMIN_EMAIL,
      subject: `Novo pedido ${numero} — ${rev.nome}`,
      html:    buildEmailNovoPedido(rev.nome, numero, total.toFixed(2), itensCalculados, observacao),
      tags:    [{ name: "tipo", value: "pedido_parceira" }],
    }).catch(err => logger.error("Erro ao enviar email novo pedido", { error: (err as Error).message }));

    logger.info("Pedido portal criado", { revendedoraId: id, numero, total: total.toFixed(2), nivelUpgrade });
    res.status(201).json({ ...pedido, nivel_upgrade: nivelUpgrade });
  }
);

// ── GET /pedidos — listar meus pedidos ───────────────────────────

portalSouParceiraRouter.get(
  "/pedidos",
  limiterCatalogo,
  (req: Request, res: Response, next: () => void) => authParceira(req, res, next),
  async (req: Request, res: Response) => {
    const id = (req as Request & { parceiraId?: string }).parceiraId!;

    const schema = z.object({
      page:  z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(50).default(10),
    });
    const parse = schema.safeParse(req.query);
    if (!parse.success) { res.status(400).json({ error: "Parâmetros inválidos." }); return; }

    const { page, limit } = parse.data;
    const offset = (page - 1) * limit;

    const total = await queryOne<{ total: string }>(
      "SELECT COUNT(*)::text AS total FROM crm.revendedora_pedidos WHERE revendedora_id = $1",
      [id]
    );

    const rows = await query(`
      SELECT
        p.id, p.numero_pedido, p.status, p.total, p.subtotal,
        p.desconto_percentual, p.desconto_valor,
        p.observacao, p.itens, p.criado_em, p.aprovado_em, p.enviado_em, p.entregue_em,
        (SELECT COUNT(*)::int FROM crm.revendedora_pedido_mensagens m
          WHERE m.pedido_id = p.id AND m.lida = FALSE AND m.autor_tipo = 'admin') AS mensagens_nao_lidas
      FROM crm.revendedora_pedidos p
      WHERE p.revendedora_id = $1
      ORDER BY p.criado_em DESC
      LIMIT $2 OFFSET $3
    `, [id, limit, offset]);

    const totalInt = parseInt(total?.total || "0");
    res.json({
      data:          rows,
      total:         totalInt,
      pagina:        page,
      total_paginas: Math.ceil(totalInt / limit),
    });
  }
);

// ── GET /pedidos/:id — detalhe do pedido ─────────────────────────

portalSouParceiraRouter.get(
  "/pedidos/:id",
  limiterCatalogo,
  (req: Request, res: Response, next: () => void) => authParceira(req, res, next),
  async (req: Request, res: Response) => {
    const parceiraId = (req as Request & { parceiraId?: string }).parceiraId!;
    const { id } = req.params;
    if (!/^[0-9a-f-]{36}$/.test(id)) {
      res.status(400).json({ error: "ID inválido" }); return;
    }

    const pedido = await queryOne(
      `SELECT * FROM crm.revendedora_pedidos
       WHERE id = $1 AND revendedora_id = $2`,
      [id, parceiraId]
    );
    if (!pedido) { res.status(404).json({ error: "Pedido não encontrado." }); return; }

    // Marcar mensagens do admin como lidas
    await query(
      `UPDATE crm.revendedora_pedido_mensagens
          SET lida = TRUE
        WHERE pedido_id = $1 AND autor_tipo = 'admin' AND lida = FALSE`,
      [id]
    );

    res.json(pedido);
  }
);

// ── GET /pedidos/:id/mensagens ───────────────────────────────────

portalSouParceiraRouter.get(
  "/pedidos/:id/mensagens",
  limiterCatalogo,
  (req: Request, res: Response, next: () => void) => authParceira(req, res, next),
  async (req: Request, res: Response) => {
    const parceiraId = (req as Request & { parceiraId?: string }).parceiraId!;
    const { id } = req.params;
    if (!/^[0-9a-f-]{36}$/.test(id)) {
      res.status(400).json({ error: "ID inválido" }); return;
    }

    // Verificar que o pedido pertence à revendedora
    const pedido = await queryOne<{ id: string; numero_pedido: string }>(
      "SELECT id, numero_pedido FROM crm.revendedora_pedidos WHERE id = $1 AND revendedora_id = $2",
      [id, parceiraId]
    );
    if (!pedido) { res.status(404).json({ error: "Pedido não encontrado." }); return; }

    const mensagens = await query(
      `SELECT id, autor_tipo, autor_nome, conteudo, lida, criado_em
         FROM crm.revendedora_pedido_mensagens
        WHERE pedido_id = $1
        ORDER BY criado_em ASC`,
      [id]
    );

    // Marcar mensagens do admin como lidas
    await query(
      `UPDATE crm.revendedora_pedido_mensagens
          SET lida = TRUE
        WHERE pedido_id = $1 AND autor_tipo = 'admin' AND lida = FALSE`,
      [id]
    );

    res.json({ data: mensagens });
  }
);

// ── POST /pedidos/:id/mensagens — revendedora envia mensagem ─────

portalSouParceiraRouter.post(
  "/pedidos/:id/mensagens",
  limiterEscrita,
  (req: Request, res: Response, next: () => void) => authParceira(req, res, next),
  async (req: Request, res: Response) => {
    const parceiraId = (req as Request & { parceiraId?: string }).parceiraId!;
    const { id } = req.params;
    if (!/^[0-9a-f-]{36}$/.test(id)) {
      res.status(400).json({ error: "ID inválido" }); return;
    }

    const schema = z.object({
      conteudo: z.string().trim().min(1).max(2000),
    });
    const parse = schema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({ error: "Conteúdo inválido.", detalhes: parse.error.errors });
      return;
    }

    // Verificar que o pedido pertence à revendedora
    const pedido = await queryOne<{ id: string; numero_pedido: string }>(
      `SELECT p.id, p.numero_pedido
         FROM crm.revendedora_pedidos p
        WHERE p.id = $1 AND p.revendedora_id = $2`,
      [id, parceiraId]
    );
    if (!pedido) { res.status(404).json({ error: "Pedido não encontrado." }); return; }

    const rev = await queryOne<{ nome: string; email: string }>(
      "SELECT nome, email FROM crm.revendedoras WHERE id = $1", [parceiraId]
    );
    if (!rev) { res.status(401).json({ error: "Sessão inválida." }); return; }

    const { conteudo } = parse.data;

    const msg = await queryOne(
      `INSERT INTO crm.revendedora_pedido_mensagens
         (pedido_id, autor_tipo, autor_nome, conteudo, lida)
       VALUES ($1, 'revendedora', $2, $3, FALSE)
       RETURNING *`,
      [id, rev.nome, conteudo]
    );

    // Notificação CRM + email para Carlos
    await criarNotificacao(
      "nova_mensagem_revendedora",
      `Mensagem de ${rev.nome}`,
      `Pedido ${pedido.numero_pedido}: ${conteudo.slice(0, 80)}${conteudo.length > 80 ? "…" : ""}`,
      `/revendedoras`
    );
    sendEmail({
      to:      ADMIN_EMAIL,
      subject: `Nova mensagem de ${rev.nome} — Pedido ${pedido.numero_pedido}`,
      html:    buildEmailNovaMensagem("Bibelô", rev.nome, pedido.numero_pedido, conteudo),
      tags:    [{ name: "tipo", value: "mensagem_parceira" }],
    }).catch(err => logger.error("Erro ao enviar email nova mensagem", { error: (err as Error).message }));

    logger.info("Mensagem portal enviada", { parceiraId, pedidoId: id });
    res.status(201).json(msg);
  }
);

// ═══════════════════════════════════════════════════════════════
// MÓDULOS — ASSINATURAS E CONTEÚDO
// ═══════════════════════════════════════════════════════════════

const MP_API    = "https://api.mercadopago.com";
const MP_TOKEN  = process.env.MP_ACCESS_TOKEN!;
const MP_SANDBOX = process.env.MP_SANDBOX === "true";

const PRECO_MENSAL = 7.90;
const PRECO_ANUAL  = parseFloat((PRECO_MENSAL * 12 * 0.85).toFixed(2)); // R$ 80,58

function valorPlano(plano: "mensal" | "anual"): number {
  return plano === "anual" ? PRECO_ANUAL : PRECO_MENSAL;
}

async function mpPost<T>(
  path: string,
  body: Record<string, unknown>,
  idempotencyKey?: string
): Promise<T> {
  const headers: Record<string, string> = {
    Authorization:  `Bearer ${MP_TOKEN}`,
    "Content-Type": "application/json",
    ...(idempotencyKey ? { "X-Idempotency-Key": idempotencyKey } : {}),
  };
  const res = await fetch(`${MP_API}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`MP API ${res.status}: ${err}`);
  }
  return res.json() as Promise<T>;
}

async function verificarAcessoModulo(revendedoraId: string, moduloId: string): Promise<boolean> {
  const row = await queryOne(
    `SELECT 1 FROM crm.revendedora_modulos
     WHERE revendedora_id = $1 AND modulo_id = $2 AND status = 'ativo'
     AND (expira_em IS NULL OR expira_em > NOW())`,
    [revendedoraId, moduloId]
  );
  return !!row;
}

// ── POST /modulos/:id/contratar ──────────────────────────────────

const schemaContratar = z.object({
  plano:  z.enum(["mensal", "anual"]),
  metodo: z.enum(["pix", "cartao"]),
});

portalSouParceiraRouter.post(
  "/modulos/:id/contratar",
  limiterEscrita,
  (req: Request, res: Response, next: () => void) => authParceira(req, res, next),
  async (req: Request, res: Response) => {
    const parceiraId = (req as Request & { parceiraId?: string }).parceiraId!;
    const moduloId   = req.params.id;

    const parsed = schemaContratar.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { plano, metodo } = parsed.data;

    const modulo = await queryOne<{ id: string; nome: string }>(
      `SELECT id, nome FROM crm.modulos WHERE id = $1 AND ativo = true`,
      [moduloId]
    );
    if (!modulo) return res.status(404).json({ error: "Módulo não encontrado" });

    const jaAtivo = await verificarAcessoModulo(parceiraId, moduloId);
    if (jaAtivo) return res.status(409).json({ error: "Módulo já está ativo" });

    const rev = await queryOne<{ nome: string; email: string }>(
      `SELECT r.nome, c.email
       FROM crm.revendedoras r JOIN crm.customers c ON c.id = r.customer_id
       WHERE r.id = $1`,
      [parceiraId]
    );
    if (!rev) return res.status(404).json({ error: "Revendedora não encontrada" });

    const valor      = valorPlano(plano);
    const diasAcesso = plano === "anual" ? 365 : 30;
    const inicio     = new Date();
    const fim        = new Date(inicio.getTime() + diasAcesso * 24 * 60 * 60 * 1000);

    // Cria registro pendente para obter o ID antes de chamar o MP
    const pagRow = await queryOne<{ id: string }>(
      `INSERT INTO crm.modulo_pagamentos
         (revendedora_id, modulo_id, plano, valor, metodo_pagamento, status, periodo_inicio, periodo_fim)
       VALUES ($1, $2, $3, $4, $5, 'pendente', $6, $7)
       RETURNING id`,
      [parceiraId, moduloId, plano, valor, metodo,
       inicio.toISOString().split("T")[0], fim.toISOString().split("T")[0]]
    );
    if (!pagRow) throw new Error("Falha ao criar registro de pagamento");

    const extRef = `modulo:${parceiraId}:${moduloId}:${pagRow.id}`;
    await query(
      `UPDATE crm.modulo_pagamentos SET external_reference = $1 WHERE id = $2`,
      [extRef, pagRow.id]
    );

    const labelModulo = `Módulo ${modulo.nome} — Plano ${plano === "anual" ? "Anual" : "Mensal"}`;

    try {
      if (metodo === "pix") {
        // PIX via Orders API (mesmo padrão do Medusa)
        const order = await mpPost<{
          id: string;
          transactions?: { payments?: Array<{ point_of_interaction?: { transaction_data?: { qr_code?: string; qr_code_base64?: string; ticket_url?: string } } }> };
        }>("/v1/orders", {
          type:             "online",
          processing_mode:  "automatic",
          total_amount:     valor.toFixed(2),
          external_reference: extRef,
          payer:            { email: rev.email },
          transactions: {
            payments: [{
              amount:         valor.toFixed(2),
              payment_method: { id: "pix", type: "bank_transfer" },
            }],
          },
        }, `PIX-MOD-${pagRow.id}`);

        const pixData  = order.transactions?.payments?.[0]?.point_of_interaction?.transaction_data;
        const pixExpira = new Date(Date.now() + 30 * 60 * 1000); // 30 min

        await query(
          `UPDATE crm.modulo_pagamentos
           SET mp_order_id = $1, qr_code = $2, qr_code_base64 = $3, ticket_url = $4, expira_pix_em = $5
           WHERE id = $6`,
          [order.id, pixData?.qr_code ?? null, pixData?.qr_code_base64 ?? null,
           pixData?.ticket_url ?? null, pixExpira, pagRow.id]
        );

        logger.info("PIX módulo criado", { parceiraId, moduloId, plano, orderId: order.id });

        return res.json({
          tipo:            "pix",
          pagamento_id:    pagRow.id,
          qr_code:         pixData?.qr_code ?? null,
          qr_code_base64:  pixData?.qr_code_base64 ?? null,
          ticket_url:      pixData?.ticket_url ?? null,
          expira_em:       pixExpira,
          valor,
          descricao:       labelModulo,
        });

      } else {
        // Cartão via Checkout Pro (MP gerencia o formulário)
        const portalUrl = "https://souparceira.papelariabibelo.com.br";
        const pref = await mpPost<{ id: string; init_point: string; sandbox_init_point: string }>(
          "/checkout/preferences",
          {
            items: [{
              id:         moduloId,
              title:      labelModulo,
              quantity:   1,
              unit_price: valor,
              currency_id: "BRL",
            }],
            payer:              { email: rev.email, name: rev.nome },
            external_reference: extRef,
            back_urls: {
              success: `${portalUrl}?pag_status=sucesso&pag_id=${pagRow.id}`,
              failure: `${portalUrl}?pag_status=falha&pag_id=${pagRow.id}`,
              pending: `${portalUrl}?pag_status=pendente&pag_id=${pagRow.id}`,
            },
            auto_return:         "approved",
            statement_descriptor: "BIBELO PARCEIRA",
          }
        );

        await query(
          `UPDATE crm.modulo_pagamentos SET mp_order_id = $1 WHERE id = $2`,
          [pref.id, pagRow.id]
        );

        logger.info("Checkout Pro módulo criado", { parceiraId, moduloId, plano, prefId: pref.id });

        return res.json({
          tipo:         "cartao",
          pagamento_id: pagRow.id,
          checkout_url: MP_SANDBOX ? pref.sandbox_init_point : pref.init_point,
          valor,
          descricao:    labelModulo,
        });
      }
    } catch (err) {
      await query(
        `UPDATE crm.modulo_pagamentos SET status = 'cancelado' WHERE id = $1`,
        [pagRow.id]
      );
      logger.error("Erro ao criar pagamento MP módulo", {
        error: (err as Error).message, parceiraId, moduloId,
      });
      return res.status(500).json({ error: "Falha ao gerar pagamento. Tente novamente." });
    }
  }
);

// ── GET /modulos/pagamento/:pagId — polling de status ───────────

portalSouParceiraRouter.get(
  "/modulos/pagamento/:pagId",
  limiterCatalogo,
  (req: Request, res: Response, next: () => void) => authParceira(req, res, next),
  async (req: Request, res: Response) => {
    const parceiraId = (req as Request & { parceiraId?: string }).parceiraId!;
    const { pagId }  = req.params;

    const pag = await queryOne<{
      id: string; status: string; qr_code: string | null;
      expira_pix_em: string | null; modulo_id: string; plano: string;
    }>(
      `SELECT id, status, qr_code, expira_pix_em, modulo_id, plano
       FROM crm.modulo_pagamentos WHERE id = $1 AND revendedora_id = $2`,
      [pagId, parceiraId]
    );
    if (!pag) return res.status(404).json({ error: "Pagamento não encontrado" });

    res.json(pag);
  }
);

// ── GET /modulos/fluxo-caixa/dados ──────────────────────────────

portalSouParceiraRouter.get(
  "/modulos/fluxo-caixa/dados",
  limiterCatalogo,
  (req: Request, res: Response, next: () => void) => authParceira(req, res, next),
  async (req: Request, res: Response) => {
    const parceiraId = (req as Request & { parceiraId?: string }).parceiraId!;
    if (!(await verificarAcessoModulo(parceiraId, "fluxo_caixa")))
      return res.status(403).json({ error: "Módulo não contratado" });

    const saidas = await query<{ mes: string; valor: string; pedidos: string }>(
      `SELECT
         TO_CHAR(DATE_TRUNC('month', criado_em), 'YYYY-MM') AS mes,
         COALESCE(SUM(total), 0)::TEXT AS valor,
         COUNT(*)::TEXT AS pedidos
       FROM crm.revendedora_pedidos
       WHERE revendedora_id = $1 AND status NOT IN ('cancelado')
         AND criado_em >= NOW() - INTERVAL '12 months'
       GROUP BY 1 ORDER BY 1`,
      [parceiraId]
    );

    const entradas = await query<{ mes: string; valor: string; qtd: string }>(
      `SELECT
         TO_CHAR(DATE_TRUNC('month', data_venda), 'YYYY-MM') AS mes,
         COALESCE(SUM(valor), 0)::TEXT AS valor,
         COUNT(*)::TEXT AS qtd
       FROM crm.revendedora_vendas
       WHERE revendedora_id = $1
         AND data_venda >= CURRENT_DATE - INTERVAL '12 months'
       GROUP BY 1 ORDER BY 1`,
      [parceiraId]
    );

    const vendasRecentes = await query(
      `SELECT id, descricao, valor, data_venda, categoria
       FROM crm.revendedora_vendas
       WHERE revendedora_id = $1
       ORDER BY data_venda DESC, criado_em DESC
       LIMIT 50`,
      [parceiraId]
    );

    res.json({ saidas, entradas, vendas_recentes: vendasRecentes });
  }
);

// ── POST /modulos/fluxo-caixa/venda ─────────────────────────────

const schemaVenda = z.object({
  descricao:  z.string().min(1).max(300).transform(s => s.replace(/<[^>]*>/g, "").trim()),
  valor:      z.number().positive(),
  data_venda: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato AAAA-MM-DD"),
  categoria:  z.string().max(100).optional(),
});

portalSouParceiraRouter.post(
  "/modulos/fluxo-caixa/venda",
  limiterEscrita,
  (req: Request, res: Response, next: () => void) => authParceira(req, res, next),
  async (req: Request, res: Response) => {
    const parceiraId = (req as Request & { parceiraId?: string }).parceiraId!;
    if (!(await verificarAcessoModulo(parceiraId, "fluxo_caixa")))
      return res.status(403).json({ error: "Módulo não contratado" });

    const parsed = schemaVenda.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { descricao, valor, data_venda, categoria } = parsed.data;

    const venda = await queryOne(
      `INSERT INTO crm.revendedora_vendas (revendedora_id, descricao, valor, data_venda, categoria)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [parceiraId, descricao, valor, data_venda, categoria ?? null]
    );
    res.status(201).json(venda);
  }
);

// ── DELETE /modulos/fluxo-caixa/venda/:id ───────────────────────

portalSouParceiraRouter.delete(
  "/modulos/fluxo-caixa/venda/:id",
  limiterEscrita,
  (req: Request, res: Response, next: () => void) => authParceira(req, res, next),
  async (req: Request, res: Response) => {
    const parceiraId = (req as Request & { parceiraId?: string }).parceiraId!;
    if (!(await verificarAcessoModulo(parceiraId, "fluxo_caixa")))
      return res.status(403).json({ error: "Módulo não contratado" });

    const deleted = await queryOne(
      `DELETE FROM crm.revendedora_vendas WHERE id = $1 AND revendedora_id = $2 RETURNING id`,
      [req.params.id, parceiraId]
    );
    if (!deleted) return res.status(404).json({ error: "Venda não encontrada" });
    res.json({ ok: true });
  }
);

// ── GET /modulos/relatorio-vendas/dados ─────────────────────────

portalSouParceiraRouter.get(
  "/modulos/relatorio-vendas/dados",
  limiterCatalogo,
  (req: Request, res: Response, next: () => void) => authParceira(req, res, next),
  async (req: Request, res: Response) => {
    const parceiraId = (req as Request & { parceiraId?: string }).parceiraId!;
    if (!(await verificarAcessoModulo(parceiraId, "relatorio_vendas")))
      return res.status(403).json({ error: "Módulo não contratado" });

    const volumeMensal = await query<{ mes: string; total: string; pedidos: string; desconto: string }>(
      `SELECT
         TO_CHAR(DATE_TRUNC('month', criado_em), 'YYYY-MM') AS mes,
         COALESCE(SUM(total), 0)::TEXT AS total,
         COUNT(*)::TEXT AS pedidos,
         ROUND(COALESCE(AVG(desconto_percentual), 0), 1)::TEXT AS desconto
       FROM crm.revendedora_pedidos
       WHERE revendedora_id = $1 AND status NOT IN ('cancelado')
         AND criado_em >= NOW() - INTERVAL '12 months'
       GROUP BY 1 ORDER BY 1`,
      [parceiraId]
    );

    const topProdutos = await query<{ nome: string; qtd: string; total: string }>(
      `SELECT
         item->>'produto_nome' AS nome,
         SUM((item->>'qtd')::numeric)::TEXT AS qtd,
         ROUND(SUM((item->>'preco_com_desconto')::numeric * (item->>'qtd')::numeric), 2)::TEXT AS total
       FROM crm.revendedora_pedidos p,
            jsonb_array_elements(p.itens) AS item
       WHERE p.revendedora_id = $1 AND p.status NOT IN ('cancelado')
         AND p.criado_em >= NOW() - INTERVAL '6 months'
       GROUP BY 1
       ORDER BY 2::numeric DESC
       LIMIT 10`,
      [parceiraId]
    );

    const resumo = await queryOne<{
      total_pedidos: string; total_gasto: string; ticket_medio: string;
      meses_consecutivos: string; nivel: string;
    }>(
      `SELECT
         COUNT(p.id)::TEXT AS total_pedidos,
         COALESCE(SUM(p.total), 0)::TEXT AS total_gasto,
         ROUND(COALESCE(AVG(p.total), 0), 2)::TEXT AS ticket_medio,
         r.meses_consecutivos::TEXT,
         r.nivel
       FROM crm.revendedoras r
       LEFT JOIN crm.revendedora_pedidos p
         ON p.revendedora_id = r.id AND p.status NOT IN ('cancelado')
       WHERE r.id = $1
       GROUP BY r.meses_consecutivos, r.nivel`,
      [parceiraId]
    );

    res.json({ volume_mensal: volumeMensal, top_produtos: topProdutos, resumo });
  }
);
