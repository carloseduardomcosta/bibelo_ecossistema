import { Router, Request, Response } from "express";
import crypto from "crypto";
import { z } from "zod";
import { query, queryOne } from "../db";
import { logger } from "../utils/logger";
import { upsertCustomer } from "../services/customer.service";
import { triggerFlow } from "../services/flow.service";
import { sendEmail } from "../integrations/resend/email";
import { authMiddleware } from "../middleware/auth";
import rateLimit from "express-rate-limit";

// ── Sanitização HTML (anti-XSS) ─────────────────────────────
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export const leadsRouter = Router();

// ── Rate limit agressivo para endpoints públicos ──────────────

const publicLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { error: "Muitas requisições — tente novamente em 1 minuto" },
});

// ── Token HMAC para verificação de email (sem banco) ─────────

function getSecret(): string {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET não definido — configure no .env antes de iniciar o servidor.");
  }
  return process.env.JWT_SECRET;
}

function gerarTokenVerificacao(email: string): string {
  return crypto.createHmac("sha256", getSecret())
    .update("lead-verify:" + email.toLowerCase().trim())
    .digest("hex");
}

function gerarLinkVerificacao(email: string): string {
  const token = gerarTokenVerificacao(email);
  const base = process.env.WEBHOOK_URL || "https://webhook.papelariabibelo.com.br";
  return `${base}/api/leads/confirm?email=${encodeURIComponent(email)}&token=${token}`;
}

async function enviarEmailVerificacao(email: string, cupom: string | null, nome: string | null): Promise<void> {
  const link = gerarLinkVerificacao(email);
  const descontoTexto = cupom === "BIBELO10" ? "10% OFF" : "7% OFF";
  const nomeDisplay = (nome || "Cliente").replace(/[<>"'&]/g, "");

  await sendEmail({
    to: email,
    subject: `Confirme seu e-mail e ganhe ${descontoTexto}!`,
    html: `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f0f2;font-family:'Segoe UI',Arial,sans-serif;">
  <div style="max-width:500px;margin:0 auto;background:#fff;">
    <div style="background:linear-gradient(135deg,#fe68c4,#ff8fd3);padding:30px 20px;text-align:center;">
      <a href="https://www.papelariabibelo.com.br" style="text-decoration:none;">
        <img src="https://webhook.papelariabibelo.com.br/logo.png" alt="Papelaria Bibelô" width="60" height="60" style="width:60px;height:60px;border-radius:50%;border:3px solid #fff;" />
      </a>
      <h1 style="color:#fff;margin:12px 0 0;font-size:22px;">Falta só um clique!</h1>
    </div>
    <div style="padding:30px 25px;text-align:center;">
      <p style="color:#333;font-size:16px;line-height:1.6;margin:0 0 8px;">
        Oi, <strong>${nomeDisplay}</strong>!
      </p>
      <p style="color:#555;font-size:15px;line-height:1.6;margin:0 0 24px;">
        Confirme seu e-mail para receber seu cupom exclusivo de <strong style="color:#fe68c4;">${descontoTexto}</strong> na Papelaria Bibelô.
      </p>
      <a href="${link}" style="display:inline-block;background:linear-gradient(135deg,#fe68c4,#f472b6);color:#fff;padding:16px 40px;border-radius:30px;text-decoration:none;font-weight:700;font-size:16px;box-shadow:0 4px 15px rgba(254,104,196,0.3);">
        Confirmar e-mail e ganhar cupom
      </a>
      <p style="color:#999;font-size:12px;margin:20px 0 0;">
        Se você não se cadastrou na Papelaria Bibelô, ignore este e-mail.
      </p>
    </div>
    <div style="background:#f9f9f9;padding:16px;text-align:center;border-top:1px solid #eee;">
      <p style="color:#bbb;font-size:11px;margin:0;">Papelaria Bibelô · papelariabibelo.com.br</p>
    </div>
  </div>
</body>
</html>`,
    tags: [{ name: "type", value: "lead_verification" }],
  });
}

// ════════════════════════════════════════════════════════════════
// ENDPOINTS PÚBLICOS (sem auth, usados pelo script JS no site)
// ════════════════════════════════════════════════════════════════

// ── GET /api/leads/config — retorna popup ativo ───────────────

leadsRouter.get("/config", publicLimiter, async (_req: Request, res: Response) => {
  const popups = await query<Record<string, unknown>>(
    "SELECT id, titulo, subtitulo, tipo, delay_segundos, campos, cupom, desconto_texto FROM marketing.popup_config WHERE ativo = true ORDER BY tipo"
  );

  res.json({ popups });
});

// ── POST /api/leads/capture — capturar lead ───────────────────

const captureSchema = z.object({
  email: z.string().email(),
  nome: z.string().max(200).optional(),
  telefone: z.string().max(30).optional(),
  popup_id: z.string().max(50).optional(),
  visitor_id: z.string().max(100).optional(),
  pagina: z.string().max(500).optional(),
});

leadsRouter.post("/capture", publicLimiter, async (req: Request, res: Response) => {
  const parsed = captureSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Email inválido" });
    return;
  }

  const rawNome = parsed.data.nome;
  const nome = rawNome ? rawNome.replace(/<[^>]*>/g, "").trim() : undefined;
  const { telefone, popup_id, visitor_id, pagina } = parsed.data;
  const email = parsed.data.email.toLowerCase().trim();

  // ── Bloqueia clientes existentes que já compraram ──────────
  const clienteExistente = await queryOne<{ id: string; total_pedidos: string }>(
    `SELECT c.id, (
       (SELECT COUNT(*) FROM sync.bling_orders bo WHERE bo.customer_id = c.id)
       + (SELECT COUNT(*) FROM sync.nuvemshop_orders no2 WHERE no2.customer_id = c.id)
     )::text AS total_pedidos
     FROM crm.customers c
     WHERE LOWER(c.email) = $1`,
    [email]
  );

  if (clienteExistente && parseInt(clienteExistente.total_pedidos, 10) > 0) {
    logger.info("Lead bloqueado — cliente já tem compras", { email, customerId: clienteExistente.id });
    res.json({
      ok: true,
      verificacao: "cliente_existente",
      mensagem: "Você já é nossa cliente! Obrigado por fazer parte da família Bibelô. Fique de olho nas nossas novidades por e-mail!"
    });
    return;
  }

  // Busca cupom do popup
  let cupom: string | null = null;
  if (popup_id) {
    const popup = await queryOne<{ cupom: string }>(
      "SELECT cupom FROM marketing.popup_config WHERE id = $1 AND ativo = true",
      [popup_id]
    );
    cupom = popup?.cupom || null;

    // Incrementa contadores do popup
    await query(
      "UPDATE marketing.popup_config SET capturas = capturas + 1 WHERE id = $1",
      [popup_id]
    );
  }

  // Cria ou vincula cliente no CRM
  const customer = await upsertCustomer({
    nome: nome || email.split("@")[0],
    email,
    telefone: telefone || undefined,
    canal_origem: "popup",
  });

  // Insere lead atomicamente — ON CONFLICT evita race condition (TOCTOU)
  const insertResult = await queryOne<{ id: string; cupom: string | null; email_verificado: boolean; ja_existia: boolean }>(
    `INSERT INTO marketing.leads (email, nome, telefone, fonte, popup_id, cupom, visitor_id, pagina, customer_id)
     VALUES ($1, $2, $3, 'popup', $4, $5, $6, $7, $8)
     ON CONFLICT (email) DO UPDATE SET email = marketing.leads.email
     RETURNING id, cupom, email_verificado, (xmax <> 0) AS ja_existia`,
    [email, nome || null, telefone || null, popup_id || null, cupom, visitor_id || null, pagina || null, customer.id]
  );

  if (insertResult?.ja_existia) {
    if (insertResult.email_verificado) {
      // Já verificado — não entrega cupom de novo
      res.json({ ok: true, verificacao: "ja_verificado", mensagem: "Você já está cadastrada! Verifique seu e-mail para o cupom." });
      return;
    }

    // Ainda não confirmou — reenvia email de verificação
    try {
      await enviarEmailVerificacao(email, insertResult.cupom || cupom, nome || null);
    } catch (err) {
      logger.warn("Falha ao reenviar verificação", { email, error: String(err) });
    }
    res.json({ ok: true, verificacao: "pendente", mensagem: "Reenviamos o e-mail de confirmação! Verifique sua caixa de entrada." });
    return;
  }

  // Vincula visitor_id ao customer (fecha o loop de atribuição)
  if (visitor_id) {
    await query(
      `INSERT INTO crm.visitor_customers (visitor_id, customer_id)
       VALUES ($1, $2)
       ON CONFLICT (visitor_id) DO NOTHING`,
      [visitor_id, customer.id]
    );
    // Retroativamente atribui tracking_events anteriores ao customer
    await query(
      `UPDATE crm.tracking_events SET customer_id = $2
       WHERE visitor_id = $1 AND customer_id IS NULL`,
      [visitor_id, customer.id]
    );
    logger.info("Visitor vinculado ao customer via lead capture", { visitorId: visitor_id, customerId: customer.id });
  }

  // Cria deal no pipeline (prospecção automática)
  await query(
    `INSERT INTO crm.deals (customer_id, titulo, valor, etapa, origem, probabilidade, notas)
     VALUES ($1, $2, 0, 'prospeccao', 'popup', 20, $3)`,
    [customer.id, `Lead: ${nome || email.split("@")[0]}`, `Captado via popup${cupom ? ` — cupom ${cupom}` : ""}. Página: ${pagina || "home"}`]
  );

  // Envia email de verificação (cupom só após confirmar)
  try {
    await enviarEmailVerificacao(email, cupom, nome || null);
  } catch (err) {
    logger.warn("Falha ao enviar verificação de lead", { email, error: String(err) });
  }

  logger.info("Lead capturado — aguardando verificação", { email, popup_id, cupom, customerId: customer.id });
  res.json({ ok: true, verificacao: "pendente", mensagem: "Verifique seu e-mail para receber o cupom!" });
});

// ── POST /api/leads/view — registrar exibição do popup ────────

leadsRouter.post("/view", publicLimiter, async (req: Request, res: Response) => {
  const { popup_id } = req.body;
  if (popup_id) {
    await query(
      "UPDATE marketing.popup_config SET exibicoes = exibicoes + 1 WHERE id = $1",
      [popup_id]
    );
  }
  res.json({ ok: true });
});

// ── GET /api/leads/confirm — confirma email e entrega cupom ───

leadsRouter.get("/confirm", publicLimiter, async (req: Request, res: Response) => {
  const email = (req.query.email as string || "").toLowerCase().trim();
  const token = (req.query.token as string || "").trim();

  if (!email || !token) {
    res.status(400).send(paginaErroVerificacao("Link inválido. Tente se cadastrar novamente."));
    return;
  }

  // Verifica HMAC (timing-safe)
  const esperado = gerarTokenVerificacao(email);
  const tokenBuf = Buffer.from(token);
  const esperadoBuf = Buffer.from(esperado);
  if (tokenBuf.length !== esperadoBuf.length || !crypto.timingSafeEqual(tokenBuf, esperadoBuf)) {
    res.status(403).send(paginaErroVerificacao("Link inválido ou expirado."));
    return;
  }

  // Busca lead
  const lead = await queryOne<{ id: string; cupom: string | null; customer_id: string | null; email_verificado: boolean; nome: string | null }>(
    "SELECT id, cupom, customer_id, email_verificado, nome FROM marketing.leads WHERE email = $1",
    [email]
  );

  if (!lead) {
    res.status(404).send(paginaErroVerificacao("Cadastro não encontrado. Tente se cadastrar novamente."));
    return;
  }

  // ── Bloqueia cupom para clientes que já compraram ──────────
  if (lead.customer_id) {
    const pedidos = await queryOne<{ total: string }>(
      `SELECT (
         (SELECT COUNT(*) FROM sync.bling_orders WHERE customer_id = $1)
         + (SELECT COUNT(*) FROM sync.nuvemshop_orders WHERE customer_id = $1)
       )::text AS total`,
      [lead.customer_id]
    );
    if (pedidos && parseInt(pedidos.total, 10) > 0) {
      logger.info("Confirmação bloqueada — cliente já tem compras", { email, customerId: lead.customer_id });
      res.send(paginaClienteExistente(email));
      return;
    }
  }

  // Marca como verificado (idempotente)
  if (!lead.email_verificado) {
    await query(
      "UPDATE marketing.leads SET email_verificado = true, email_verificado_em = NOW() WHERE id = $1",
      [lead.id]
    );

    // Agora sim dispara o fluxo de boas-vindas (só para email verificado)
    if (lead.customer_id) {
      await triggerFlow("lead.captured", lead.customer_id, {
        email,
        nome: lead.nome || email.split("@")[0],
        cupom: lead.cupom || "",
        fonte: "popup",
      });
    }

    logger.info("Lead verificou email", { email, leadId: lead.id, customerId: lead.customer_id });
  }

  // Mostra página com o cupom
  res.send(paginaCupomVerificado(email, lead.cupom));
});

// ── Páginas HTML de verificação ──────────────────────────────

function paginaCupomVerificado(email: string, cupom: string | null): string {
  const cupomCode = esc(cupom || "BIBELO7");
  const emailSafe = esc(email);
  const desconto = cupom === "BIBELO10" ? "10%" : "7%";
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Cupom Ativado - Papelaria Bibelô</title>
<link href="https://fonts.googleapis.com/css2?family=Jost:wght@400;600;700&display=swap" rel="stylesheet"></head>
<body style="margin:0;padding:0;background:#f5f0f2;font-family:Jost,Arial,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;">
  <div style="background:#fff;border-radius:20px;padding:0;max-width:440px;width:90%;text-align:center;box-shadow:0 8px 30px rgba(254,104,196,0.15);overflow:hidden;">
    <div style="background:linear-gradient(135deg,#fe68c4,#ff8fd3);padding:28px 20px;">
      <img src="https://webhook.papelariabibelo.com.br/logo.png" alt="Papelaria Bibelô" width="56" height="56" style="width:56px;height:56px;border-radius:50%;border:3px solid #fff;" />
    </div>
    <div style="padding:30px 24px 20px;">
      <div style="font-size:40px;margin:0 0 12px;">🎉</div>
      <h1 style="color:#333;font-size:22px;margin:0 0 8px;font-weight:700;">E-mail confirmado!</h1>
      <p style="color:#666;font-size:15px;margin:0 0 20px;line-height:1.5;">
        Seu cupom de <strong style="color:#fe68c4;">${desconto}</strong> está pronto:
      </p>
      <div style="background:#fff7c1;border:2px dashed #fe68c4;border-radius:14px;padding:18px 20px;margin:0 0 20px;">
        <p style="margin:0 0 4px;color:#999;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Seu cupom</p>
        <p style="margin:0;color:#fe68c4;font-size:32px;font-weight:700;letter-spacing:2px;">${cupomCode}</p>
      </div>
      <p style="color:#777;font-size:13px;margin:0 0 20px;line-height:1.5;">
        Use no checkout da nossa loja para ganhar <strong>${desconto}</strong> de desconto na sua compra!
      </p>
      <a href="https://www.papelariabibelo.com.br" style="display:inline-block;background:linear-gradient(135deg,#fe68c4,#f472b6);color:#fff;padding:14px 36px;border-radius:30px;text-decoration:none;font-weight:700;font-size:15px;box-shadow:0 4px 15px rgba(254,104,196,0.3);">
        Ir para a loja
      </a>
    </div>
    <div style="padding:16px;border-top:1px solid #f0e0f0;">
      <p style="color:#ccc;font-size:11px;margin:0;">Papelaria Bibelô · papelariabibelo.com.br</p>
    </div>
  </div>
</body>
</html>`;
}

function paginaClienteExistente(_email: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Você já é nossa cliente! - Papelaria Bibelô</title>
<link href="https://fonts.googleapis.com/css2?family=Jost:wght@400;600;700&display=swap" rel="stylesheet"></head>
<body style="margin:0;padding:0;background:#f5f0f2;font-family:Jost,Arial,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;">
  <div style="background:#fff;border-radius:20px;padding:0;max-width:440px;width:90%;text-align:center;box-shadow:0 8px 30px rgba(254,104,196,0.15);overflow:hidden;">
    <div style="background:linear-gradient(135deg,#fe68c4,#ff8fd3);padding:28px 20px;">
      <img src="https://webhook.papelariabibelo.com.br/logo.png" alt="Papelaria Bibelô" width="56" height="56" style="width:56px;height:56px;border-radius:50%;border:3px solid #fff;" />
    </div>
    <div style="padding:30px 24px 20px;">
      <div style="font-size:40px;margin:0 0 12px;">💕</div>
      <h1 style="color:#333;font-size:22px;margin:0 0 8px;font-weight:700;">Você já faz parte da família!</h1>
      <p style="color:#666;font-size:15px;margin:0 0 20px;line-height:1.5;">
        Este cupom é exclusivo para novos clientes. Mas não se preocupe — preparamos ofertas especiais para quem já compra com a gente!
      </p>
      <p style="color:#777;font-size:13px;margin:0 0 20px;line-height:1.5;">
        Fique de olho no seu e-mail para promoções exclusivas de clientes VIP.
      </p>
      <a href="https://www.papelariabibelo.com.br" style="display:inline-block;background:linear-gradient(135deg,#fe68c4,#f472b6);color:#fff;padding:14px 36px;border-radius:30px;text-decoration:none;font-weight:700;font-size:15px;box-shadow:0 4px 15px rgba(254,104,196,0.3);">
        Ir para a loja
      </a>
    </div>
    <div style="padding:16px;border-top:1px solid #f0e0f0;">
      <p style="color:#ccc;font-size:11px;margin:0;">Papelaria Bibelô · papelariabibelo.com.br</p>
    </div>
  </div>
</body>
</html>`;
}

function paginaErroVerificacao(msg: string): string {
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

// ════════════════════════════════════════════════════════════════
// ENDPOINTS PROTEGIDOS (painel CRM)
// ════════════════════════════════════════════════════════════════

// ── GET /api/leads — listar leads capturados ──────────────────

leadsRouter.get("/", authMiddleware, async (req: Request, res: Response) => {
  const page = parseInt(String(req.query.page || "1"), 10);
  const limit = 50;
  const offset = (page - 1) * limit;
  const search = String(req.query.search || "").trim();
  const status = String(req.query.status || ""); // convertido, pendente, todos
  const ordenar = String(req.query.ordenar || "recentes"); // recentes, email_primeiro, nome

  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (search) {
    conditions.push(`(l.email ILIKE $${idx} OR l.nome ILIKE $${idx} OR l.telefone ILIKE $${idx})`);
    params.push(`%${search}%`);
    idx++;
  }

  if (status === "convertido") {
    conditions.push("l.convertido = true");
  } else if (status === "pendente") {
    conditions.push("l.convertido = false");
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  let orderBy = "l.criado_em DESC";
  if (ordenar === "email_primeiro") {
    orderBy = "CASE WHEN l.email IS NOT NULL AND l.email != '' THEN 0 ELSE 1 END, CASE WHEN l.telefone IS NOT NULL AND l.telefone != '' THEN 0 ELSE 1 END, l.criado_em DESC";
  } else if (ordenar === "nome") {
    orderBy = "COALESCE(l.nome, 'zzz') ASC, l.criado_em DESC";
  }

  params.push(limit, offset);

  const [leads, countResult] = await Promise.all([
    query<Record<string, unknown>>(
      `SELECT l.*, c.nome AS customer_nome
       FROM marketing.leads l
       LEFT JOIN crm.customers c ON c.id = l.customer_id
       ${where}
       ORDER BY ${orderBy}
       LIMIT $${idx} OFFSET $${idx + 1}`,
      params
    ),
    queryOne<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM marketing.leads l ${where}`,
      params.slice(0, -2)
    ),
  ]);

  res.json({
    leads,
    total: parseInt(countResult?.total || "0", 10),
    page,
    pages: Math.ceil(parseInt(countResult?.total || "0", 10) / limit),
  });
});

// ── GET /api/leads/stats — KPIs de captura ────────────────────

leadsRouter.get("/stats", authMiddleware, async (_req: Request, res: Response) => {
  const stats = await queryOne<Record<string, unknown>>(
    `SELECT
       (SELECT COUNT(*) FROM marketing.leads) AS total_leads,
       (SELECT COUNT(*) FROM marketing.leads WHERE criado_em > NOW() - INTERVAL '7 days') AS leads_7d,
       (SELECT COUNT(*) FROM marketing.leads WHERE criado_em > NOW() - INTERVAL '30 days') AS leads_30d,
       (SELECT COUNT(*) FROM marketing.leads WHERE convertido = true) AS convertidos,
       (SELECT ROUND(COUNT(*) FILTER (WHERE convertido = true) * 100.0 / NULLIF(COUNT(*), 0), 1) FROM marketing.leads) AS taxa_conversao`
  );

  const popups = await query<Record<string, unknown>>(
    "SELECT id, titulo, tipo, ativo, exibicoes, capturas, ROUND(capturas * 100.0 / NULLIF(exibicoes, 0), 1) AS taxa FROM marketing.popup_config ORDER BY criado_em"
  );

  res.json({ ...stats, popups });
});

// ── PUT /api/leads/popups/:id — atualizar config do popup ─────

const updatePopupSchema = z.object({
  titulo: z.string().max(200).optional(),
  subtitulo: z.string().optional(),
  delay_segundos: z.number().min(0).optional(),
  cupom: z.string().max(50).optional(),
  desconto_texto: z.string().max(100).optional(),
  ativo: z.boolean().optional(),
});

leadsRouter.put("/popups/:id", authMiddleware, async (req: Request, res: Response) => {
  const parsed = updatePopupSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Dados inválidos" });
    return;
  }

  const fields: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  const data = parsed.data;
  if (data.titulo !== undefined) { fields.push(`titulo = $${idx++}`); values.push(data.titulo); }
  if (data.subtitulo !== undefined) { fields.push(`subtitulo = $${idx++}`); values.push(data.subtitulo); }
  if (data.delay_segundos !== undefined) { fields.push(`delay_segundos = $${idx++}`); values.push(data.delay_segundos); }
  if (data.cupom !== undefined) { fields.push(`cupom = $${idx++}`); values.push(data.cupom); }
  if (data.desconto_texto !== undefined) { fields.push(`desconto_texto = $${idx++}`); values.push(data.desconto_texto); }
  if (data.ativo !== undefined) { fields.push(`ativo = $${idx++}`); values.push(data.ativo); }

  if (fields.length === 0) {
    res.json({ ok: true });
    return;
  }

  values.push(req.params.id);
  const popup = await queryOne<Record<string, unknown>>(
    `UPDATE marketing.popup_config SET ${fields.join(", ")} WHERE id = $${idx} RETURNING *`,
    values
  );

  if (!popup) {
    res.status(404).json({ error: "Popup não encontrado" });
    return;
  }

  res.json(popup);
});
