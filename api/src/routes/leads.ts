import { Router, Request, Response } from "express";
import crypto from "crypto";
import { z } from "zod";
import { query, queryOne } from "../db";
import { logger } from "../utils/logger";
import { upsertCustomer } from "../services/customer.service";
import { triggerFlow } from "../services/flow.service";
import { sendEmail } from "../integrations/resend/email";
import { getNuvemShopToken, nsRequest } from "../integrations/nuvemshop/auth";
import { authMiddleware } from "../middleware/auth";

import rateLimit from "express-rate-limit";

// ── Sanitização HTML (anti-XSS) ─────────────────────────────
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export const leadsRouter = Router();

// ── NuvemShop: garantir cupom Clube Bibelô (7% OFF 1ª compra) ──

async function garantirCupomClube(): Promise<string | null> {
  try {
    const token = await getNuvemShopToken();
    if (!token) return null;

    const cupomCode = "CLUBEBIBELO";

    // Verifica se cupom já existe (API retorna 404 quando 0 resultados)
    try {
      const existing = await nsRequest<Array<{ id: number; code: string }>>("get", `coupons?q=${cupomCode}`, token);
      if (existing && existing.some(c => c.code === cupomCode)) {
        return cupomCode;
      }
    } catch (searchErr) {
      const axErr = searchErr as { response?: { status?: number } };
      if (axErr.response?.status !== 404) throw searchErr;
    }

    // Cria cupom de 7% OFF na primeira compra
    await nsRequest<{ id: number }>("post", "coupons", token, {
      code: cupomCode,
      type: "percentage",
      value: "7.00",
      first_consumer_purchase: true,
      max_uses: 5000,
      end_date: "2026-12-31",
      valid: true,
      combines_with_other_discounts: true,
    });

    logger.info("NuvemShop: cupom CLUBEBIBELO (7% OFF) criado");
    return cupomCode;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("NuvemShop: erro ao criar cupom clube", { error: msg });
    return null;
  }
}

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

export function gerarLinkVerificacao(email: string): string {
  const token = gerarTokenVerificacao(email);
  const base = process.env.WEBHOOK_URL || "https://webhook.papelariabibelo.com.br";
  return `${base}/api/leads/confirm?email=${encodeURIComponent(email)}&token=${token}`;
}

async function enviarEmailVerificacao(email: string, cupom: string | null, nome: string | null): Promise<void> {
  const link = gerarLinkVerificacao(email);
  const isClube = cupom === "CLUBEBIBELO";
  const descontoTexto = isClube ? "7% OFF" : cupom === "BIBELO10" ? "10% OFF" : "7% OFF";
  const nomeDisplay = (nome || "Cliente").replace(/[<>"'&]/g, "");

  await sendEmail({
    to: email,
    subject: isClube ? `🎀 ${nomeDisplay}, confirme e ganhe 7% OFF na 1ª compra!` : `Confirme seu e-mail e ganhe ${descontoTexto}!`,
    html: `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>*{font-family:Jost,'Segoe UI',Arial,sans-serif;}</style>
</head>
<body style="margin:0;padding:0;background:#ffe5ec;">
<div style="max-width:600px;margin:0 auto;padding:20px 10px;">
  <div style="background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 20px 60px rgba(254,104,196,0.15);">
    <div style="background:linear-gradient(160deg,#ffe5ec 0%,#fff7c1 50%,#ffe5ec 100%);padding:32px 30px;text-align:center;position:relative;overflow:hidden;">
      <div style="position:absolute;top:-20px;right:-20px;width:80px;height:80px;background:rgba(254,104,196,0.06);border-radius:50%;"></div>
      <img src="https://webhook.papelariabibelo.com.br/logo.png" alt="Papelaria Bibelô" width="52" height="52" style="width:52px;height:52px;border-radius:50%;border:2px solid rgba(254,104,196,0.3);margin-bottom:12px;" />
      ${isClube ? '<div style="background:linear-gradient(135deg,#fe68c4,#f472b6);color:#fff;display:inline-block;padding:5px 16px;border-radius:50px;font-size:11px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:12px;">CLUBE BIBELÔ</div>' : ''}
      <h1 style="color:#2d2d2d;margin:0 0 6px;font-size:26px;font-weight:600;font-family:Cormorant Garamond,Georgia,serif;line-height:1.2;">Falta só um clique!</h1>
      <p style="color:#999;margin:0;font-size:13px;">Confirme seu e-mail para ${isClube ? 'ativar seus benefícios' : 'ganhar seu cupom'}</p>
    </div>
    <div style="height:3px;background:linear-gradient(90deg,#fe68c4,#f472b6,#fe68c4);"></div>
    <div style="padding:32px 30px;text-align:center;">
      <p style="color:#333;font-size:16px;line-height:1.6;margin:0 0 8px;">
        Oi, <strong style="color:#fe68c4;">${nomeDisplay}</strong>! 👋
      </p>
      <p style="color:#555;font-size:15px;line-height:1.7;margin:0 0 24px;">
        ${isClube
          ? 'Confirme seu e-mail para ativar seu <strong style="color:#fe68c4;">cupom de 7% OFF</strong> na 1ª compra + acesso às novidades em primeira mão!'
          : `Confirme seu e-mail para receber seu cupom exclusivo de <strong style="color:#fe68c4;">${descontoTexto}</strong> na Papelaria Bibelô.`}
      </p>
      ${isClube ? `
      <div style="background:linear-gradient(135deg,#ffe5ec,#fff7c1);border-radius:12px;padding:16px 20px;margin:0 0 24px;text-align:left;">
        <p style="margin:0 0 6px;font-size:13px;color:#555;">🏷️ 7% de desconto na 1ª compra</p>
        <p style="margin:0 0 6px;font-size:13px;color:#555;">🚚 Frete grátis Sul/Sudeste acima de R$79</p>
        <p style="margin:0 0 6px;font-size:13px;color:#555;">🎁 Mimo surpresa em toda compra</p>
        <p style="margin:0;font-size:13px;color:#555;">✨ Novidades antes de todo mundo</p>
      </div>` : ''}
      <a href="${link}" style="display:inline-block;background:linear-gradient(135deg,#fe68c4,#f472b6);color:#fff;padding:16px 44px;border-radius:50px;text-decoration:none;font-weight:600;font-size:16px;box-shadow:0 4px 15px rgba(254,104,196,0.3);">
        ${isClube ? 'Confirmar e ativar 7% OFF' : 'Confirmar e ganhar cupom'}
      </a>
      <p style="color:#aaa;font-size:12px;margin:20px 0 0;">
        Se você não se cadastrou na Papelaria Bibelô, ignore este e-mail.
      </p>
    </div>
    <div style="padding:14px 30px;background:#fafafa;text-align:center;border-top:1px solid #ffe5ec;">
      <p style="color:#bbb;font-size:11px;margin:0;">Papelaria Bibelô · <span style="color:#fe68c4;">papelariabibelo.com.br</span></p>
      <p style="color:#ccc;font-size:10px;margin:4px 0 0;"><a href="https://www.papelariabibelo.com.br/privacidade/" style="color:#ccc;text-decoration:none;">Política de Privacidade</a> · <a href="https://www.papelariabibelo.com.br/termos-de-uso/" style="color:#ccc;text-decoration:none;">Termos de Uso</a></p>
    </div>
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

  // ── NuvemShop: garantir cupom de frete (background) ──
  garantirCupomClube().catch(() => {});

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
  const cupomCode = esc(cupom || "CLUBEBIBELO");
  const isClube = cupom === "CLUBEBIBELO";
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${isClube ? "Bem-vinda ao Clube Bibelô!" : "Cupom Ativado"} - Papelaria Bibelô</title></head>
<body style="margin:0;padding:0;background:linear-gradient(160deg,#ffe5ec,#fff7c1);font-family:Jost,Arial,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;">
  <div style="background:#fff;border-radius:20px;padding:0;max-width:440px;width:90%;text-align:center;box-shadow:0 20px 60px rgba(254,104,196,0.2);overflow:hidden;">
    <div style="background:linear-gradient(135deg,#fe68c4,#f472b6);padding:32px 20px;">
      <img src="https://webhook.papelariabibelo.com.br/logo.png" alt="Papelaria Bibelô" width="56" height="56" style="width:56px;height:56px;border-radius:50%;border:3px solid rgba(255,255,255,0.5);" />
    </div>
    <div style="padding:30px 28px 24px;">
      <div style="font-size:44px;margin:0 0 12px;">${isClube ? "🎀" : "🎉"}</div>
      <h1 style="color:#2d2d2d;font-size:26px;margin:0 0 8px;font-weight:600;font-family:'Cormorant Garamond',Georgia,serif;">${isClube ? "Bem-vinda ao Clube Bibelô!" : "E-mail confirmado!"}</h1>
      ${isClube ? `
      <p style="color:#666;font-size:15px;margin:0 0 20px;line-height:1.6;">
        Seu cupom de <strong style="color:#fe68c4;">7% OFF</strong> na 1ª compra já está ativo! Use o cupom abaixo no checkout:
      </p>` : `
      <p style="color:#666;font-size:15px;margin:0 0 20px;line-height:1.6;">
        Seu cupom está pronto para usar:
      </p>`}
      <div style="background:linear-gradient(135deg,#ffe5ec,#fff7c1);border:2px dashed #fe68c4;border-radius:14px;padding:20px;margin:0 0 20px;">
        <p style="margin:0 0 4px;color:#999;font-size:11px;text-transform:uppercase;letter-spacing:1.5px;font-weight:600;">${isClube ? "Seu cupom de 7% OFF" : "Seu cupom"}</p>
        <p style="margin:0;color:#fe68c4;font-size:32px;font-weight:700;letter-spacing:3px;">${cupomCode}</p>
        ${isClube ? '<p style="margin:6px 0 0;color:#888;font-size:12px;">7% de desconto na primeira compra</p>' : ""}
      </div>
      ${isClube ? `
      <div style="background:#fff7c1;border-radius:10px;padding:14px 16px;margin:0 0 20px;text-align:left;">
        <p style="margin:0 0 8px;font-size:13px;color:#2d2d2d;font-weight:600;">O que você ganhou:</p>
        <p style="margin:0 0 4px;font-size:13px;color:#555;">🏷️ 7% de desconto na 1ª compra</p>
        <p style="margin:0 0 4px;font-size:13px;color:#555;">🚚 Frete grátis Sul/Sudeste acima de R$79</p>
        <p style="margin:0 0 4px;font-size:13px;color:#555;">🎁 Mimo surpresa em toda compra</p>
        <p style="margin:0;font-size:13px;color:#555;">✨ Novidades em primeira mão</p>
      </div>` : ""}
      <a href="https://www.papelariabibelo.com.br/novidades?utm_source=email&amp;utm_medium=flow&amp;utm_campaign=confirmacao&amp;utm_content=cta_principal" style="display:inline-block;background:linear-gradient(135deg,#fe68c4,#f472b6);color:#fff;padding:15px 40px;border-radius:30px;text-decoration:none;font-weight:700;font-size:16px;box-shadow:0 4px 15px rgba(254,104,196,0.3);font-family:Jost,sans-serif;">
        ${isClube ? "Começar a comprar" : "Ir para a loja"}
      </a>
      ${isClube ? `<div style="margin-top:16px;">
        <a href="https://boasvindas.papelariabibelo.com.br/api/links/grupo-vip" style="display:inline-block;background:#25D366;color:#fff;padding:12px 32px;border-radius:30px;text-decoration:none;font-weight:600;font-size:14px;font-family:Jost,sans-serif;">Entrar no Clube VIP WhatsApp 💬</a>
      </div>` : ""}
    </div>
    <div style="padding:14px;border-top:1px solid #ffe5ec;background:#fafafa;">
      <p style="color:#bbb;font-size:11px;margin:0;">Papelaria Bibelô · <span style="color:#fe68c4;">papelariabibelo.com.br</span></p>
      <p style="color:#ccc;font-size:10px;margin:4px 0 0;"><a href="https://www.papelariabibelo.com.br/privacidade/" style="color:#ccc;text-decoration:none;">Política de Privacidade</a> · <a href="https://www.papelariabibelo.com.br/termos-de-uso/" style="color:#ccc;text-decoration:none;">Termos de Uso</a></p>
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
      <p style="color:#ccc;font-size:10px;margin:4px 0 0;"><a href="https://www.papelariabibelo.com.br/privacidade/" style="color:#ccc;text-decoration:none;">Política de Privacidade</a> · <a href="https://www.papelariabibelo.com.br/termos-de-uso/" style="color:#ccc;text-decoration:none;">Termos de Uso</a></p>
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
<body style="margin:0;padding:0;background:#f5f0f2;font-family:Jost,'Segoe UI',Arial,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;">
  <div style="background:#fff;border-radius:20px;padding:0;max-width:440px;width:90%;text-align:center;box-shadow:0 8px 30px rgba(254,104,196,0.15);overflow:hidden;">
    <div style="background:linear-gradient(135deg,#fe68c4,#ff8fd3);padding:28px 20px;">
      <img src="https://webhook.papelariabibelo.com.br/logo.png" alt="Papelaria Bibelô" width="56" height="56" style="width:56px;height:56px;border-radius:50%;border:3px solid #fff;" />
    </div>
    <div style="padding:30px 24px 20px;">
      <div style="font-size:40px;margin:0 0 12px;">😕</div>
      <h1 style="color:#333;font-size:22px;margin:0 0 10px;font-family:'Cormorant Garamond',Georgia,serif;">Algo deu errado</h1>
      <p style="color:#666;font-size:15px;line-height:1.6;margin:0 0 20px;">${esc(msg)}</p>
      <a href="https://www.papelariabibelo.com.br" style="display:inline-block;background:linear-gradient(135deg,#fe68c4,#f472b6);color:#fff;padding:14px 36px;border-radius:30px;text-decoration:none;font-weight:700;font-size:15px;box-shadow:0 4px 15px rgba(254,104,196,0.3);">
        Voltar para a loja
      </a>
    </div>
    <div style="padding:16px;border-top:1px solid #f0e0f0;">
      <p style="color:#ccc;font-size:11px;margin:0;">Papelaria Bibelô · papelariabibelo.com.br</p>
      <p style="color:#ccc;font-size:10px;margin:4px 0 0;"><a href="https://www.papelariabibelo.com.br/privacidade/" style="color:#ccc;text-decoration:none;">Política de Privacidade</a> · <a href="https://www.papelariabibelo.com.br/termos-de-uso/" style="color:#ccc;text-decoration:none;">Termos de Uso</a></p>
    </div>
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
