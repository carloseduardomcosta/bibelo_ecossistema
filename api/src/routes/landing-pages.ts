import { Router, Request, Response } from "express";
import { z } from "zod";
import { query, queryOne } from "../db";
import { authMiddleware } from "../middleware/auth";
import { logger } from "../utils/logger";
import rateLimit from "express-rate-limit";

export const landingPagesRouter = Router();

const publicLimiter = rateLimit({ windowMs: 60_000, max: 60, standardHeaders: true, legacyHeaders: false });

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// ══════════════════════════════════════════════════════════════════
// PÚBLICO — GET /lp/:slug — página da landing page
// ══════════════════════════════════════════════════════════════════

landingPagesRouter.get("/:slug", publicLimiter, async (req: Request, res: Response) => {
  const slug = (req.params.slug || "").toLowerCase().replace(/[^a-z0-9-]/g, "");
  if (!slug) { res.status(400).send("Slug inválido"); return; }

  const page = await queryOne<{
    id: string; slug: string; titulo: string; subtitulo: string | null;
    imagem_url: string | null; cor_primaria: string; cor_fundo: string;
    cupom: string | null; desconto_texto: string; campos: string[];
    cta_texto: string; mensagem_sucesso: string;
    redirect_url: string; redirect_delay: number;
    utm_source: string | null; utm_medium: string | null; utm_campaign: string | null;
  }>(
    "SELECT * FROM marketing.landing_pages WHERE slug = $1 AND ativo = true",
    [slug]
  );

  if (!page) { res.status(404).send(pagina404()); return; }

  // Incrementa visitas
  await query("UPDATE marketing.landing_pages SET visitas = visitas + 1 WHERE id = $1", [page.id]);

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  res.send(renderLandingPage(page));
});

// ══════════════════════════════════════════════════════════════════
// ADMIN — CRUD /api/landing-pages
// ══════════════════════════════════════════════════════════════════

const adminRouter = Router();
adminRouter.use(authMiddleware);

const createSchema = z.object({
  slug: z.string().min(2).max(100).regex(/^[a-z0-9-]+$/, "Slug: apenas letras minúsculas, números e hífens"),
  titulo: z.string().min(1).max(255),
  subtitulo: z.string().max(500).optional(),
  imagem_url: z.string().url().max(500).optional(),
  cor_primaria: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#fe68c4"),
  cor_fundo: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#ffe5ec"),
  cupom: z.string().max(50).optional(),
  desconto_texto: z.string().max(50).default("10% OFF"),
  campos: z.array(z.enum(["email", "nome", "telefone"])).default(["email", "nome"]),
  cta_texto: z.string().max(100).default("Quero meu desconto"),
  mensagem_sucesso: z.string().max(500).default("Verifique seu e-mail para ativar o cupom!"),
  redirect_url: z.string().url().max(500).default("https://www.papelariabibelo.com.br"),
  redirect_delay: z.number().int().min(0).max(30).default(5),
  utm_source: z.string().max(100).optional(),
  utm_medium: z.string().max(100).optional(),
  utm_campaign: z.string().max(100).optional(),
  ativo: z.boolean().default(true),
});

// GET /api/landing-pages — listar
adminRouter.get("/", async (_req: Request, res: Response) => {
  const rows = await query(
    `SELECT *, ROUND(CASE WHEN visitas > 0 THEN capturas::numeric / visitas * 100 ELSE 0 END, 1) as taxa_conversao
     FROM marketing.landing_pages ORDER BY criado_em DESC`
  );
  res.json({ data: rows });
});

// GET /api/landing-pages/:id — detalhe
adminRouter.get("/:id", async (req: Request, res: Response) => {
  const row = await queryOne("SELECT * FROM marketing.landing_pages WHERE id = $1", [req.params.id]);
  if (!row) { res.status(404).json({ error: "Landing page não encontrada" }); return; }
  res.json(row);
});

// POST /api/landing-pages — criar
adminRouter.post("/", async (req: Request, res: Response) => {
  const parse = createSchema.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: "Dados inválidos", details: parse.error.flatten() }); return; }

  const d = parse.data;
  const existing = await queryOne("SELECT id FROM marketing.landing_pages WHERE slug = $1", [d.slug]);
  if (existing) { res.status(409).json({ error: "Slug já em uso" }); return; }

  const row = await queryOne(`
    INSERT INTO marketing.landing_pages (slug, titulo, subtitulo, imagem_url, cor_primaria, cor_fundo, cupom, desconto_texto, campos, cta_texto, mensagem_sucesso, redirect_url, redirect_delay, utm_source, utm_medium, utm_campaign, ativo)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *
  `, [d.slug, d.titulo, d.subtitulo || null, d.imagem_url || null, d.cor_primaria, d.cor_fundo, d.cupom || null, d.desconto_texto, JSON.stringify(d.campos), d.cta_texto, d.mensagem_sucesso, d.redirect_url, d.redirect_delay, d.utm_source || null, d.utm_medium || null, d.utm_campaign || null, d.ativo]);

  logger.info("Landing page criada", { slug: d.slug });
  res.status(201).json(row);
});

// PUT /api/landing-pages/:id — atualizar
adminRouter.put("/:id", async (req: Request, res: Response) => {
  const parse = createSchema.partial().safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: "Dados inválidos" }); return; }

  const ALLOWED = ["slug", "titulo", "subtitulo", "imagem_url", "cor_primaria", "cor_fundo", "cupom", "desconto_texto", "campos", "cta_texto", "mensagem_sucesso", "redirect_url", "redirect_delay", "utm_source", "utm_medium", "utm_campaign", "ativo"];
  const entries = Object.entries(parse.data).filter(([k, v]) => v !== undefined && ALLOWED.includes(k));
  if (entries.length === 0) { res.status(400).json({ error: "Nenhum campo" }); return; }

  const sets = entries.map(([k], i) => `"${k}" = $${i + 1}`);
  const values: unknown[] = entries.map(([k, v]) => k === "campos" ? JSON.stringify(v) : v);
  values.push(req.params.id);

  const row = await queryOne(`UPDATE marketing.landing_pages SET ${sets.join(", ")} WHERE id = $${values.length} RETURNING *`, values);
  if (!row) { res.status(404).json({ error: "Não encontrada" }); return; }
  res.json(row);
});

// DELETE /api/landing-pages/:id — remover
adminRouter.delete("/:id", async (req: Request, res: Response) => {
  const row = await queryOne("DELETE FROM marketing.landing_pages WHERE id = $1 RETURNING id", [req.params.id]);
  if (!row) { res.status(404).json({ error: "Não encontrada" }); return; }
  res.json({ message: "Landing page removida" });
});

// POST /api/landing-pages/track/:id — incrementa capturas (público, chamado pelo JS da LP)
landingPagesRouter.post("/track/:id", publicLimiter, async (req: Request, res: Response) => {
  await query("UPDATE marketing.landing_pages SET capturas = capturas + 1 WHERE id = $1", [req.params.id]);
  res.json({ ok: true });
});

landingPagesRouter.use("/", adminRouter);

// ══════════════════════════════════════════════════════════════════
// Renderização HTML da landing page
// ══════════════════════════════════════════════════════════════════

function renderLandingPage(p: {
  id: string; slug: string; titulo: string; subtitulo: string | null;
  imagem_url: string | null; cor_primaria: string; cor_fundo: string;
  cupom: string | null; desconto_texto: string; campos: string[];
  cta_texto: string; mensagem_sucesso: string;
  redirect_url: string; redirect_delay: number;
  utm_source: string | null; utm_medium: string | null; utm_campaign: string | null;
}): string {
  const campos = Array.isArray(p.campos) ? p.campos : JSON.parse(p.campos as unknown as string);
  const temNome = campos.includes("nome");
  const temTelefone = campos.includes("telefone");
  const apiBase = process.env.LEADS_API_URL || "https://webhook.papelariabibelo.com.br";
  const primaryColor = esc(p.cor_primaria);
  const bgColor = esc(p.cor_fundo);

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(p.titulo)} — Papelaria Bibelô</title>
<meta name="description" content="${esc(p.subtitulo || p.titulo)}">
<meta property="og:title" content="${esc(p.titulo)}">
<meta property="og:description" content="${esc(p.subtitulo || '')}">
${p.imagem_url ? `<meta property="og:image" content="${esc(p.imagem_url)}">` : ''}
<meta property="og:type" content="website">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Jost:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:Jost,Arial,sans-serif;background:linear-gradient(160deg,${bgColor},#fff7c1);min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
  .card{background:#fff;border-radius:24px;max-width:480px;width:100%;overflow:hidden;box-shadow:0 25px 80px rgba(254,104,196,0.2)}
  .hero{background:linear-gradient(135deg,${primaryColor},${primaryColor}dd);padding:36px 28px;text-align:center;position:relative;overflow:hidden}
  .hero::before{content:'';position:absolute;top:-50px;right:-50px;width:160px;height:160px;background:rgba(255,255,255,0.08);border-radius:50%}
  .hero img.logo{width:52px;height:52px;border-radius:50%;border:3px solid rgba(255,255,255,0.5);margin-bottom:16px}
  .hero img.banner{width:100%;max-height:200px;object-fit:cover;border-radius:12px;margin-bottom:16px}
  .badge{display:inline-block;background:rgba(255,255,255,0.2);backdrop-filter:blur(10px);color:#fff;padding:8px 24px;border-radius:50px;font-size:20px;font-weight:700;letter-spacing:1px;margin-bottom:14px;animation:pulse 2s ease-in-out infinite}
  @keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.05)}}
  .hero h1{color:#fff;font-size:28px;font-weight:700;font-family:'Cormorant Garamond',Georgia,serif;line-height:1.2;margin-bottom:8px}
  .hero p{color:rgba(255,255,255,0.9);font-size:15px;line-height:1.5}
  .form-area{padding:28px 24px 20px}
  .input-wrap{position:relative;margin-bottom:12px}
  .input-wrap span{position:absolute;left:14px;top:50%;transform:translateY(-50%);font-size:16px;opacity:0.5}
  input[type="text"],input[type="email"],input[type="tel"]{width:100%;padding:14px 16px 14px 44px;border:2px solid ${bgColor};border-radius:14px;font-size:15px;outline:none;font-family:Jost,Arial,sans-serif;transition:border-color 0.2s,box-shadow 0.2s;background:#fff}
  input:focus{border-color:${primaryColor};box-shadow:0 0 0 3px ${primaryColor}20}
  .btn{width:100%;padding:16px;background:linear-gradient(135deg,${primaryColor},${primaryColor}cc);color:#fff;border:none;border-radius:14px;font-size:17px;font-weight:700;cursor:pointer;font-family:Jost,Arial,sans-serif;box-shadow:0 6px 25px ${primaryColor}60;transition:transform 0.2s;letter-spacing:0.3px}
  .btn:hover{transform:translateY(-2px)}
  .btn:disabled{opacity:0.6;transform:none}
  .benefits{display:flex;justify-content:center;gap:14px;margin-top:16px;flex-wrap:wrap}
  .benefits span{font-size:12px;color:#888}
  .success{display:none;text-align:center;padding:20px 0}
  .footer{padding:12px 24px;background:#fafafa;text-align:center;border-top:1px solid ${bgColor}}
  .footer p{color:#bbb;font-size:11px}
  .footer a{color:#ccc;text-decoration:none}
</style>
</head>
<body>
<div class="card">
  <div class="hero">
    <img class="logo" src="https://webhook.papelariabibelo.com.br/logo.png" alt="Papelaria Bibelô" width="52" height="52">
    ${p.imagem_url ? `<img class="banner" src="${esc(p.imagem_url)}" alt="${esc(p.titulo)}">` : ''}
    ${p.desconto_texto ? `<div class="badge">${esc(p.desconto_texto)}</div>` : ''}
    <h1>${esc(p.titulo)}</h1>
    ${p.subtitulo ? `<p>${esc(p.subtitulo)}</p>` : ''}
  </div>

  <div class="form-area">
    <form id="lp-form">
      ${temNome ? '<div class="input-wrap"><span>👤</span><input type="text" name="nome" placeholder="Seu nome" required></div>' : ''}
      <div class="input-wrap"><span>✉️</span><input type="email" name="email" placeholder="Seu melhor e-mail" required></div>
      ${temTelefone ? '<div class="input-wrap"><span>📱</span><input type="tel" name="telefone" placeholder="WhatsApp (opcional)"></div>' : ''}
      <button type="submit" class="btn" id="lp-btn">${esc(p.cta_texto)} 🎉</button>
    </form>

    <div class="benefits">
      <span>🏷️ ${esc(p.desconto_texto)}</span>
      <span>🚚 Frete grátis*</span>
      <span>🎁 Mimo surpresa</span>
    </div>

    <div class="success" id="lp-success">
      <p style="font-size:44px;margin-bottom:12px">✉️</p>
      <p style="font-size:22px;font-weight:600;color:#2d2d2d;font-family:'Cormorant Garamond',Georgia,serif;margin-bottom:8px" id="lp-msg">${esc(p.mensagem_sucesso)}</p>
      <p style="font-size:13px;color:#999" id="lp-submsg">Verifique também a pasta de spam.</p>
      <a href="${esc(p.redirect_url)}" id="lp-redirect" style="display:inline-block;margin-top:16px;background:linear-gradient(135deg,${primaryColor},${primaryColor}cc);color:#fff;padding:12px 32px;border-radius:50px;text-decoration:none;font-size:14px;font-weight:600">
        Ir para a loja 🛍️
      </a>
    </div>
  </div>

  <div class="footer">
    <p>Papelaria Bibelô · <span style="color:${primaryColor}">papelariabibelo.com.br</span></p>
  </div>
</div>

<script>
(function(){
  var API = '${apiBase}/api/leads';
  var form = document.getElementById('lp-form');
  var btn = document.getElementById('lp-btn');

  form.onsubmit = function(e) {
    e.preventDefault();
    var email = form.email.value.trim();
    if (!email) return;
    btn.textContent = 'Enviando...';
    btn.disabled = true;

    fetch(API + '/capture', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: email,
        nome: form.nome ? form.nome.value.trim() : undefined,
        telefone: form.telefone ? form.telefone.value.trim() : undefined,
        popup_id: 'lp_${esc(p.slug)}',
        pagina: window.location.href
      })
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      form.style.display = 'none';
      document.querySelector('.benefits').style.display = 'none';
      var success = document.getElementById('lp-success');
      success.style.display = 'block';
      if (data.verificacao === 'ja_verificado') {
        document.getElementById('lp-msg').textContent = 'Seu desconto já está ativo!';
      }
      // Incrementa capturas
      fetch('${apiBase}/api/landing-pages/track/${esc(p.id)}', { method: 'POST' }).catch(function(){});
      ${p.redirect_delay > 0 ? `
      // Redirect automático
      var delay = ${p.redirect_delay};
      var sub = document.getElementById('lp-submsg');
      var timer = setInterval(function() {
        delay--;
        sub.textContent = 'Redirecionando em ' + delay + 's...';
        if (delay <= 0) { clearInterval(timer); window.location.href = '${esc(p.redirect_url)}'; }
      }, 1000);` : ''}
    })
    .catch(function() {
      btn.textContent = 'Tente novamente';
      btn.disabled = false;
    });
  };
})();
</script>
</body>
</html>`;
}

function pagina404(): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Página não encontrada — Papelaria Bibelô</title></head>
<body style="margin:0;padding:0;background:linear-gradient(160deg,#ffe5ec,#fff7c1);font-family:Jost,Arial,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;">
<div style="text-align:center;padding:40px 20px;">
  <p style="font-size:60px;margin-bottom:16px;">🎀</p>
  <h1 style="font-size:24px;color:#2d2d2d;font-family:'Cormorant Garamond',Georgia,serif;margin-bottom:8px;">Ops! Página não encontrada</h1>
  <p style="color:#888;font-size:15px;margin-bottom:24px;">Essa promoção pode ter expirado ou o link está incorreto.</p>
  <a href="https://www.papelariabibelo.com.br" style="display:inline-block;background:linear-gradient(135deg,#fe68c4,#f472b6);color:#fff;padding:14px 36px;border-radius:30px;text-decoration:none;font-weight:600;font-size:15px;font-family:Jost,sans-serif;">Visitar a loja</a>
</div>
</body></html>`;
}
