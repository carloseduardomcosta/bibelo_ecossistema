import { Router, Request, Response } from "express";
import { z } from "zod";
import { query, queryOne } from "../db";
import { resolveGeo } from "../utils/geoip";
import { upsertCustomer } from "../services/customer.service";
import { sendEmail } from "../integrations/resend/email";
import { logger } from "../utils/logger";
import { authMiddleware } from "../middleware/auth";
import rateLimit from "express-rate-limit";

export const linksRouter = Router();

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { error: "Rate limit" },
});

// ── Configuração dos links ────────────────────────────────────

interface LinkItem {
  slug: string;
  titulo: string;
  url: string;
  icone: string;
  destaque?: boolean;
  utm?: { source: string; medium: string; campaign: string };
}

const LINKS: LinkItem[] = [
  {
    slug: "loja",
    titulo: "Acessar Loja On-line",
    url: "https://www.papelariabibelo.com.br",
    icone: "🛍️",
    destaque: true,
    utm: { source: "instagram", medium: "bio_link", campaign: "menu" },
  },
  {
    slug: "whatsapp",
    titulo: "Fale conosco no WhatsApp",
    url: "https://api.whatsapp.com/send/?phone=5547933862514&text=Ol%C3%A1%2C+vim+pelo+link+do+Instagram!",
    icone: "💬",
  },
  {
    slug: "grupo-vip",
    titulo: "Clube VIP WhatsApp",
    url: "/api/links/grupo-vip",
    icone: "💖",
  },
  {
    slug: "formulario",
    titulo: "Preencha o formulário",
    url: "/api/links/formulario",
    icone: "📋",
  },
  {
    slug: "parcerias",
    titulo: "Parcerias e B2B",
    url: "/api/links/parcerias",
    icone: "🤝",
  },
];

// ── Helper: IP real via proxy ─────────────────────────────────

const DOCKER_NETS = ["172.21.", "172.22.", "172.23.", "10.0.", "192.168."];
function getRealIp(req: Request): string {
  const socketIp = req.socket.remoteAddress || "";
  if (DOCKER_NETS.some(net => socketIp.includes(net))) {
    return req.headers["x-forwarded-for"]?.toString().split(",")[0].trim() || socketIp;
  }
  return socketIp;
}

// ── GET /api/links/go/:slug — redirect com tracking ──────────

linksRouter.get("/go/:slug", limiter, async (req: Request, res: Response) => {
  const { slug } = req.params;
  const link = LINKS.find(l => l.slug === slug);

  if (!link) {
    res.redirect("https://www.papelariabibelo.com.br");
    return;
  }

  // Registra clique em background (não bloqueia o redirect)
  const ip = getRealIp(req);
  const geo = resolveGeo(ip);
  query(
    `INSERT INTO marketing.link_clicks (slug, ip, geo_city, geo_region, geo_country, user_agent, referer)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      slug,
      geo?.ip || null,
      geo?.city || null,
      geo?.region || null,
      geo?.country || null,
      (req.headers["user-agent"] || "").slice(0, 500),
      (req.headers["referer"] || "").slice(0, 500),
    ]
  ).catch((err) => { logger.warn("Falha ao registrar clique no link", { slug, error: String(err) }); }); // fire-and-forget

  // Monta URL com UTM se aplicável
  let destino = link.url;
  if (link.utm && !destino.startsWith("mailto:")) {
    const sep = destino.includes("?") ? "&" : "?";
    destino += `${sep}utm_source=${link.utm.source}&utm_medium=${link.utm.medium}&utm_campaign=${link.utm.campaign}`;
  }

  res.redirect(302, destino);
});

// ── GET /api/links/stats — stats dos cliques (protegido) ─────

linksRouter.get("/stats", authMiddleware, async (_req: Request, res: Response) => {
  const stats = await query<{ slug: string; cliques: string; ultimo: string }>(
    `SELECT slug, COUNT(*)::text AS cliques, MAX(criado_em)::text AS ultimo
     FROM marketing.link_clicks
     WHERE criado_em > NOW() - INTERVAL '30 days'
     GROUP BY slug ORDER BY cliques DESC`
  );

  const total = await query<{ dia: string; cliques: string }>(
    `SELECT criado_em::date::text AS dia, COUNT(*)::text AS cliques
     FROM marketing.link_clicks
     WHERE criado_em > NOW() - INTERVAL '30 days'
     GROUP BY criado_em::date ORDER BY dia DESC LIMIT 30`
  );

  res.json({ stats, porDia: total, links: LINKS.map(l => ({ slug: l.slug, titulo: l.titulo })) });
});

// ── GET /api/links/page — página HTML dos links ──────────────

linksRouter.get("/page", (_req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=300");
  // CSP específico para a página de links (permite Google Fonts e inline styles/scripts para animação)
  res.setHeader("Content-Security-Policy",
    "default-src 'self'; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src 'self' https://fonts.gstatic.com; " +
    "img-src 'self' data: https:; " +
    "script-src 'self' 'unsafe-inline'; " +
    "frame-ancestors 'none';"
  );

  res.send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Papelaria Bibelô — Links</title>
  <meta name="description" content="Papelaria Bibelô — Loja On-line, WhatsApp, Clube VIP e mais">
  <meta property="og:title" content="Papelaria Bibelô">
  <meta property="og:description" content="Papelaria Bibelô — Loja On-line, WhatsApp, Clube VIP e mais">
  <meta property="og:image" content="https://boasvindas.papelariabibelo.com.br/logo.png">
  <meta property="og:type" content="website">
  <link rel="icon" href="/logo.png">
  <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">

  <style>
    /* ===== RESET & BASE ===== */
    *, *::before, *::after {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    :root {
      --pink-main:   #f43f8e;
      --pink-light:  #fce7f3;
      --pink-pale:   #fff0f6;
      --pink-dark:   #c2185b;
      --pink-glow:   rgba(244, 63, 142, 0.35);
      --yellow-soft: #fff9c4;
      --text-dark:   #2d1b2e;
      --text-mid:    #6b4c6b;
      --text-soft:   #a07090;
      --white:       #ffffff;
      --radius-lg:   18px;
      --radius-md:   12px;
      --shadow-card: 0 10px 40px rgba(244, 63, 142, 0.15);
    }

    html {
      scroll-behavior: smooth;
    }

    body {
      font-family: 'Nunito', 'Segoe UI', Arial, sans-serif;
      background: linear-gradient(160deg, #ffe0ef 0%, #fce7f3 40%, #fff0f6 100%);
      min-height: 100vh;
      min-height: 100dvh;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 0;
    }

    /* ===== CARD ===== */
    .card {
      width: 100%;
      max-width: 460px;
      background: var(--white);
      border-radius: 0 0 28px 28px;
      box-shadow: var(--shadow-card);
      overflow: hidden;
      min-height: 100vh;
      min-height: 100dvh;
      display: flex;
      flex-direction: column;
    }

    /* ===== HEADER ===== */
    .header {
      background: linear-gradient(160deg, var(--yellow-soft) 0%, #ffe8f5 60%, var(--pink-light) 100%);
      padding: 24px 20px 16px;
      text-align: center;
      border-bottom: 3px solid var(--pink-main);
      position: relative;
      overflow: hidden;
    }

    .header::before,
    .header::after {
      content: '';
      position: absolute;
      border-radius: 50%;
      opacity: 0.18;
    }
    .header::before {
      width: 140px; height: 140px;
      background: var(--pink-main);
      top: -50px; right: -40px;
    }
    .header::after {
      width: 90px; height: 90px;
      background: #f9a8d4;
      bottom: -30px; left: -20px;
    }

    .avatar-wrap {
      position: relative;
      display: block;
      margin: 0 auto 10px;
      width: fit-content;
    }
    .avatar {
      width: 72px;
      height: 72px;
      border-radius: 50%;
      border: 4px solid var(--pink-main);
      box-shadow: 0 0 0 6px rgba(244, 63, 142, 0.15), 0 6px 20px var(--pink-glow);
      display: block;
      margin: 0 auto;
      object-fit: cover;
      transition: transform 0.3s ease;
    }
    .avatar:hover {
      transform: scale(1.06) rotate(-2deg);
    }

    .avatar-ring {
      position: absolute;
      inset: -8px;
      border-radius: 50%;
      border: 2px solid var(--pink-main);
      opacity: 0;
      animation: pulse-ring 2.5s ease-out infinite;
    }
    @keyframes pulse-ring {
      0%   { transform: scale(0.9); opacity: 0.6; }
      100% { transform: scale(1.3); opacity: 0; }
    }

    .nome {
      font-size: 22px;
      font-weight: 900;
      color: var(--text-dark);
      margin-bottom: 4px;
      letter-spacing: -0.3px;
    }

    .boas-vindas {
      font-size: 14px;
      font-weight: 700;
      color: var(--pink-main);
      margin-bottom: 4px;
      line-height: 1.3;
    }

    .bio {
      font-size: 12px;
      color: var(--text-soft);
      font-weight: 600;
      line-height: 1.4;
    }

    /* ===== BANNER DESTAQUE LOJA ===== */
    .loja-banner {
      margin: 0;
      background: linear-gradient(135deg, #f43f8e 0%, #ec4899 50%, #db2777 100%);
      padding: 14px 20px;
      display: flex;
      align-items: center;
      gap: 14px;
      text-decoration: none;
      color: var(--white);
      position: relative;
      overflow: hidden;
      transition: filter 0.2s ease, transform 0.15s ease;
    }
    .loja-banner:hover {
      filter: brightness(1.08);
      transform: scaleY(1.02);
    }
    .loja-banner::before {
      content: '';
      position: absolute;
      inset: 0;
      background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.12) 50%, transparent 100%);
      transform: translateX(-100%);
      animation: shimmer 2.8s ease-in-out infinite;
    }
    @keyframes shimmer {
      0%   { transform: translateX(-100%); }
      60%  { transform: translateX(100%); }
      100% { transform: translateX(100%); }
    }

    .loja-icon {
      font-size: 32px;
      flex-shrink: 0;
      filter: drop-shadow(0 2px 4px rgba(0,0,0,0.2));
    }
    .loja-texto { flex: 1; }
    .loja-badge {
      display: inline-block;
      background: rgba(255,255,255,0.25);
      color: var(--white);
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 1px;
      text-transform: uppercase;
      padding: 2px 8px;
      border-radius: 20px;
      margin-bottom: 4px;
    }
    .loja-titulo {
      font-size: 18px;
      font-weight: 900;
      line-height: 1.2;
      display: block;
    }
    .loja-sub {
      font-size: 12px;
      font-weight: 600;
      opacity: 0.88;
      margin-top: 2px;
      display: block;
    }
    .loja-arrow {
      flex-shrink: 0;
      width: 36px;
      height: 36px;
      background: rgba(255,255,255,0.2);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    /* ===== CORPO DOS LINKS ===== */
    .body {
      padding: 14px 18px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    /* Espaço flexível entre links e footer */
    .spacer {
      flex: 1;
    }

    .link-btn {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 13px 16px;
      border-radius: var(--radius-md);
      text-decoration: none;
      font-size: 15px;
      font-weight: 700;
      color: var(--text-dark);
      background: var(--white);
      border: 2px solid #f3d0e8;
      transition: all 0.18s ease;
      position: relative;
      overflow: hidden;
    }
    .link-btn:hover {
      border-color: var(--pink-main);
      background: var(--pink-pale);
      transform: translateY(-2px);
      box-shadow: 0 6px 18px rgba(244, 63, 142, 0.15);
    }
    .link-btn:active {
      transform: translateY(0);
    }

    .btn-icon {
      font-size: 22px;
      flex-shrink: 0;
      width: 32px;
      text-align: center;
    }
    .btn-label {
      flex: 1;
      text-align: left;
      line-height: 1.3;
    }
    .btn-arrow {
      flex-shrink: 0;
      color: #d0a0c0;
      transition: transform 0.18s ease;
    }
    .link-btn:hover .btn-arrow {
      transform: translateX(3px);
      color: var(--pink-main);
    }

    .link-btn.whatsapp { border-color: #d4f4e0; }
    .link-btn.whatsapp:hover {
      border-color: #25d366;
      background: #f0fff6;
      box-shadow: 0 6px 18px rgba(37, 211, 102, 0.15);
    }

    .link-btn.instagram:hover {
      border-color: #e1306c;
      background: #fff5f8;
      box-shadow: 0 6px 18px rgba(225, 48, 108, 0.15);
    }

    .link-btn.vip-destaque {
      border: 2px solid var(--pink-main);
      background: linear-gradient(135deg, #fff0f8 0%, #ffe5ec 50%, #fff7c1 100%);
      position: relative;
      overflow: hidden;
      animation: vip-pulse 2.5s ease-in-out infinite;
      box-shadow: 0 4px 20px rgba(244, 63, 142, 0.2);
    }
    .link-btn.vip-destaque:hover {
      border-color: var(--pink-dark);
      background: linear-gradient(135deg, #ffe0f0, #ffd6e7, #fff3c4);
      box-shadow: 0 8px 28px rgba(244, 63, 142, 0.3);
      transform: translateY(-3px);
    }
    .link-btn.vip-destaque .btn-label {
      font-weight: 900;
      color: var(--pink-dark, #c2185b);
    }
    .link-btn.vip-destaque .btn-arrow {
      color: var(--pink-main);
    }
    .vip-sparkle {
      position: absolute;
      top: -2px;
      right: 8px;
      font-size: 14px;
      animation: sparkle-float 2s ease-in-out infinite;
      pointer-events: none;
    }
    @keyframes vip-pulse {
      0%, 100% { box-shadow: 0 4px 20px rgba(244, 63, 142, 0.2); }
      50% { box-shadow: 0 4px 25px rgba(244, 63, 142, 0.35); }
    }
    @keyframes sparkle-float {
      0%, 100% { transform: translateY(0) rotate(0deg); opacity: 1; }
      50% { transform: translateY(-4px) rotate(10deg); opacity: 0.7; }
    }

    /* ===== FOOTER ===== */
    .footer {
      background: linear-gradient(135deg, var(--yellow-soft), #fff5fb);
      padding: 10px 20px;
      text-align: center;
      border-top: 2px solid #fce7f3;
    }
    .footer-info {
      font-size: 11px;
      color: var(--text-soft);
      font-weight: 600;
      line-height: 1.6;
    }
    .footer-link {
      color: var(--pink-main);
      text-decoration: none;
      font-weight: 700;
    }
    .footer-link:hover {
      text-decoration: underline;
    }

    /* Mobile pequeno (iPhone SE, 667px height) */
    @media (max-height: 700px) {
      .header { padding: 16px 16px 10px; }
      .avatar { width: 56px; height: 56px; }
      .avatar-wrap { margin-bottom: 6px; }
      .nome { font-size: 20px; margin-bottom: 2px; }
      .boas-vindas { font-size: 13px; margin-bottom: 0; }
      .loja-banner { padding: 10px 16px; }
      .loja-icon { font-size: 26px; }
      .loja-titulo { font-size: 16px; }
      .loja-badge { font-size: 9px; padding: 1px 6px; margin-bottom: 2px; }
      .loja-sub { font-size: 11px; }
      .body { padding: 10px 14px; gap: 6px; }
      .link-btn { padding: 10px 12px; font-size: 14px; }
      .btn-icon { font-size: 19px; width: 26px; }
      .footer { padding: 8px 14px; }
      .footer-info { font-size: 10px; }
    }

    @media (min-width: 461px) {
      body { padding: 24px 16px 48px; }
      .card { min-height: auto; border-radius: 28px; }
    }
  </style>
</head>
<body>

  <div class="card">

    <!-- HEADER -->
    <div class="header">
      <a href="/api/links/go/loja" target="_blank" rel="noopener" class="avatar-wrap">
        <span class="avatar-ring"></span>
        <img src="/logo.png" alt="Papelaria Bibelô" class="avatar">
      </a>
      <h1 class="nome">Papelaria Bibelô</h1>
      <p class="boas-vindas">Curadoria especial em papelaria</p>
      <p class="bio">Timbó/SC &middot; Entregamos para todo o Brasil</p>
    </div>

    <!-- BANNER LOJA -->
    <a href="/api/links/go/loja" target="_blank" rel="noopener" class="loja-banner" aria-label="Acessar Loja On-line da Papelaria Bibelô">
      <span class="loja-icon">🛍️</span>
      <span class="loja-texto">
        <span class="loja-badge">✨ Compre aqui</span>
        <span class="loja-titulo">Acessar Loja On-line</span>
        <span class="loja-sub">papelariabibelo.com.br</span>
      </span>
      <span class="loja-arrow">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
      </span>
    </a>

    <!-- LINKS -->
    <div class="body">

      <a href="/api/links/go/grupo-vip" target="_blank" rel="noopener" class="link-btn vip-destaque">
        <span class="vip-sparkle">✨</span>
        <span class="btn-icon">💖</span>
        <span class="btn-label">Entrar no Clube VIP</span>
        <svg class="btn-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
      </a>

      <a href="/api/links/go/whatsapp" target="_blank" rel="noopener" class="link-btn whatsapp">
        <span class="btn-icon">💬</span>
        <span class="btn-label">Fale conosco no WhatsApp</span>
        <svg class="btn-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
      </a>

      <a href="/api/links/go/formulario" target="_blank" rel="noopener" class="link-btn">
        <span class="btn-icon">📋</span>
        <span class="btn-label">Cadastre-se para novidades</span>
        <svg class="btn-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
      </a>

      <a href="/api/links/go/parcerias" target="_blank" rel="noopener" class="link-btn">
        <span class="btn-icon">🤝</span>
        <span class="btn-label">Parcerias e atacado (B2B)</span>
        <svg class="btn-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
      </a>

    </div>

    <div class="spacer"></div>

    <!-- FOOTER -->
    <div class="footer">
      <p class="footer-info">
        <a href="https://www.papelariabibelo.com.br/" target="_blank" rel="noopener" class="footer-link">papelariabibelo.com.br</a>
        <br>&copy; Papelaria Bibelô &mdash; CNPJ 63.961.764/0001-63 &mdash; 2026. Todos os direitos reservados.
      </p>
    </div>

  </div>

  <script>
    document.addEventListener('DOMContentLoaded', function() {
      var items = document.querySelectorAll('.link-btn, .loja-banner');
      items.forEach(function(el, i) {
        el.style.opacity = '0';
        el.style.transform = 'translateY(16px)';
        el.style.transition = 'opacity 0.35s ease ' + (i * 0.07) + 's, transform 0.35s ease ' + (i * 0.07) + 's, border-color 0.18s ease, background 0.18s ease, box-shadow 0.18s ease, filter 0.2s ease';
        requestAnimationFrame(function() {
          requestAnimationFrame(function() {
            el.style.opacity = '1';
            el.style.transform = 'translateY(0)';
          });
        });
      });
    });
  </script>

</body>
</html>`);
});

// ── GET /api/links/formulario — página do formulário de cadastro ──

linksRouter.get("/formulario", (_req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Content-Security-Policy",
    "default-src 'self'; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src 'self' https://fonts.gstatic.com; " +
    "img-src 'self' data: https:; " +
    "script-src 'self' 'unsafe-inline'; " +
    "connect-src 'self'; " +
    "frame-ancestors 'none';"
  );

  res.send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Cadastre-se — Papelaria Bibelô</title>
  <meta name="description" content="Cadastre-se na Papelaria Bibelô e receba novidades">
  <link rel="icon" href="/logo.png">
  <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    *,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
    :root{--pink-main:#f43f8e;--pink-light:#fce7f3;--pink-pale:#fff0f6;--pink-glow:rgba(244,63,142,0.35);--yellow-soft:#fff9c4;--text-dark:#2d1b2e;--text-mid:#6b4c6b;--text-soft:#a07090;--white:#fff}
    body{font-family:'Nunito','Segoe UI',Arial,sans-serif;background:linear-gradient(160deg,#ffe0ef 0%,#fce7f3 40%,#fff0f6 100%);min-height:100vh;min-height:100dvh;display:flex;flex-direction:column;align-items:center;padding:0}
    .card{width:100%;max-width:460px;background:var(--white);border-radius:0 0 28px 28px;box-shadow:0 10px 40px rgba(244,63,142,0.15);overflow:hidden;min-height:100vh;min-height:100dvh;display:flex;flex-direction:column}
    .header{background:linear-gradient(160deg,var(--yellow-soft) 0%,#ffe8f5 60%,var(--pink-light) 100%);padding:20px 20px 14px;text-align:center;border-bottom:3px solid var(--pink-main);position:relative;overflow:hidden}
    .header::before{content:'';position:absolute;width:140px;height:140px;border-radius:50%;opacity:0.18;background:var(--pink-main);top:-50px;right:-40px}
    .header::after{content:'';position:absolute;width:90px;height:90px;border-radius:50%;opacity:0.18;background:#f9a8d4;bottom:-30px;left:-20px}
    .avatar{width:56px;height:56px;border-radius:50%;border:3px solid var(--pink-main);box-shadow:0 4px 15px var(--pink-glow);margin:0 auto 8px;display:block}
    .header h1{font-size:19px;font-weight:900;color:var(--text-dark);margin-bottom:2px}
    .header p{font-size:12px;color:var(--text-soft);font-weight:600}
    .form-body{padding:16px 20px;flex:1;display:flex;flex-direction:column;gap:12px}
    .form-intro{font-size:13px;color:var(--text-mid);font-weight:600;line-height:1.4;text-align:center}
    .field{display:flex;flex-direction:column;gap:4px}
    .field label{font-size:11px;font-weight:800;color:var(--text-mid);text-transform:uppercase;letter-spacing:0.8px}
    .field input{padding:11px 14px;border:2px solid #f3d0e8;border-radius:10px;font-size:14px;font-family:'Nunito',sans-serif;font-weight:600;color:var(--text-dark);outline:none;transition:border-color 0.2s}
    .field input:focus{border-color:var(--pink-main);box-shadow:0 0 0 3px rgba(244,63,142,0.1)}
    .field input::placeholder{color:#c9a0b8;font-weight:500}
    .submit-btn{padding:13px;border:none;border-radius:12px;background:linear-gradient(135deg,#f43f8e 0%,#ec4899 50%,#db2777 100%);color:var(--white);font-size:15px;font-weight:900;font-family:'Nunito',sans-serif;cursor:pointer;transition:all 0.2s;box-shadow:0 4px 15px var(--pink-glow);margin-top:2px}
    .submit-btn:hover{filter:brightness(1.08);transform:translateY(-2px);box-shadow:0 6px 20px var(--pink-glow)}
    .submit-btn:active{transform:translateY(0)}
    .submit-btn:disabled{opacity:0.6;cursor:not-allowed;transform:none}
    .msg{padding:10px 14px;border-radius:10px;font-size:13px;font-weight:700;text-align:center;display:none}
    .msg.ok{display:block;background:#f0fff6;color:#166534;border:2px solid #bbf7d0}
    .msg.err{display:block;background:#fff5f5;color:#991b1b;border:2px solid #fecaca}
    .footer{background:linear-gradient(135deg,var(--yellow-soft),#fff5fb);padding:12px 20px;text-align:center;border-top:2px solid #fce7f3}
    .footer p{font-size:11px;color:var(--text-soft);font-weight:600}
    .footer a{color:var(--pink-main);text-decoration:none;font-weight:700}
    .back-link{display:inline-flex;align-items:center;gap:6px;color:var(--pink-main);font-size:13px;font-weight:700;text-decoration:none;margin-top:2px}
    .back-link:hover{text-decoration:underline}
    @media(max-height:700px){
      .header{padding:14px 16px 10px}
      .avatar{width:44px;height:44px;margin-bottom:6px}
      .header h1{font-size:17px}
      .header p{font-size:11px}
      .form-body{padding:12px 16px;gap:10px}
      .form-intro{font-size:12px}
      .field label{font-size:10px}
      .field input{padding:9px 12px;font-size:13px;border-radius:8px}
      .submit-btn{padding:11px;font-size:14px;border-radius:10px}
      .footer{padding:10px 16px}
      .back-link{font-size:12px}
    }
    @media(min-width:461px){body{padding:24px 16px 48px}.card{min-height:auto;border-radius:28px}}
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <img src="/logo.png" alt="Papelaria Bibelô" class="avatar">
      <h1>Cadastre-se</h1>
      <p>Receba novidades e promoções exclusivas</p>
    </div>

    <form class="form-body" id="leadForm">
      <p class="form-intro">Preencha seus dados e fique por dentro de tudo que acontece na Papelaria Bibelô!</p>

      <div class="field">
        <label for="nome">Seu nome</label>
        <input type="text" id="nome" name="nome" placeholder="Como podemos te chamar?" required maxlength="200">
      </div>

      <div class="field">
        <label for="email">Seu e-mail</label>
        <input type="email" id="email" name="email" placeholder="seuemail@exemplo.com" required maxlength="200">
      </div>

      <div class="field">
        <label for="telefone">WhatsApp</label>
        <input type="tel" id="telefone" name="telefone" placeholder="(47) 9 9999-9999" maxlength="20">
      </div>

      <div class="msg" id="msg"></div>

      <button type="submit" class="submit-btn" id="submitBtn">Cadastrar</button>

      <a href="/" class="back-link">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
        Voltar ao menu
      </a>
    </form>

    <div class="footer">
      <p><a href="https://www.papelariabibelo.com.br/" target="_blank" rel="noopener">papelariabibelo.com.br</a><br>&copy; Papelaria Bibelô &mdash; 63.961.764/0001-63 &mdash; 2026. Todos os direitos reservados.</p>
    </div>
  </div>

  <script>
    document.getElementById('leadForm').addEventListener('submit', function(e) {
      e.preventDefault();
      var btn = document.getElementById('submitBtn');
      var msg = document.getElementById('msg');
      btn.disabled = true;
      btn.textContent = 'Enviando...';
      msg.className = 'msg';
      msg.style.display = 'none';

      var data = {
        nome: document.getElementById('nome').value.trim(),
        email: document.getElementById('email').value.trim(),
        telefone: document.getElementById('telefone').value.trim(),
        fonte: 'formulario_menu'
      };

      fetch('/api/links/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })
      .then(function(r) { return r.json(); })
      .then(function(res) {
        if (res.ok) {
          msg.className = 'msg ok';
          msg.textContent = res.mensagem || 'Cadastro realizado com sucesso!';
          msg.style.display = 'block';
          btn.textContent = 'Cadastrado!';
          document.getElementById('leadForm').reset();
        } else {
          msg.className = 'msg err';
          msg.textContent = res.error || 'Erro ao cadastrar. Tente novamente.';
          msg.style.display = 'block';
          btn.disabled = false;
          btn.textContent = 'Cadastrar';
        }
      })
      .catch(function() {
        msg.className = 'msg err';
        msg.textContent = 'Erro de conexão. Tente novamente.';
        msg.style.display = 'block';
        btn.disabled = false;
        btn.textContent = 'Cadastrar';
      });
    });
  </script>
</body>
</html>`);
});

// ── POST /api/links/lead — receber cadastro do formulário ────

const leadFormSchema = z.object({
  nome: z.string().min(1).max(200),
  email: z.string().email().max(200),
  telefone: z.string().max(20).optional(),
  fonte: z.string().max(50).optional(),
});

linksRouter.post("/lead", limiter, async (req: Request, res: Response) => {
  const parsed = leadFormSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: "Dados inválidos. Verifique nome e email." });
    return;
  }

  const { nome, telefone, fonte } = parsed.data;
  const email = parsed.data.email.toLowerCase().trim();
  const nomeClean = nome.replace(/[<>"'&]/g, "");

  // Verifica se lead já existe
  const existing = await queryOne<{ id: string }>(
    "SELECT id FROM marketing.leads WHERE email = $1",
    [email]
  );

  if (existing) {
    res.json({ ok: true, mensagem: "Você já está cadastrada! Em breve receberá nossas novidades." });
    return;
  }

  // Cria/vincula customer no CRM
  const customer = await upsertCustomer({
    nome: nomeClean,
    email,
    telefone: telefone || undefined,
    canal_origem: "formulario",
  });

  // Salva lead
  await query(
    `INSERT INTO marketing.leads (email, nome, telefone, fonte, customer_id)
     VALUES ($1, $2, $3, $4, $5)`,
    [email, nomeClean, telefone || null, fonte || "formulario_menu", customer.id]
  );

  // Cria deal no pipeline
  await query(
    `INSERT INTO crm.deals (customer_id, titulo, valor, etapa, origem, probabilidade, notas)
     VALUES ($1, $2, 0, 'prospeccao', 'formulario', 20, $3)`,
    [customer.id, `Lead: ${nomeClean}`, `Captado via formulário do menu. WhatsApp: ${telefone || "não informado"}`]
  );

  // Notificação por email para o admin
  sendEmail({
    to: "contato@papelariabibelo.com.br",
    subject: `Novo cadastro: ${nomeClean}`,
    html: `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f0f2;font-family:'Segoe UI',Arial,sans-serif;">
  <div style="max-width:500px;margin:20px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.06);">
    <div style="background:linear-gradient(135deg,#f43f8e,#ec4899);padding:24px;text-align:center;">
      <p style="color:#fff;font-size:20px;font-weight:700;margin:0;">Novo cadastro no Menu!</p>
    </div>
    <div style="padding:24px;">
      <p style="font-size:15px;color:#333;margin:0 0 12px;"><strong>Nome:</strong> ${nomeClean}</p>
      <p style="font-size:15px;color:#333;margin:0 0 12px;"><strong>Email:</strong> ${email}</p>
      <p style="font-size:15px;color:#333;margin:0 0 12px;"><strong>WhatsApp:</strong> ${(telefone || "Não informado").replace(/[<>"'&]/g, "")}</p>
      <p style="font-size:13px;color:#999;margin:16px 0 0;">Fonte: formulário do menu (boasvindas.papelariabibelo.com.br)</p>
    </div>
  </div>
</body></html>`,
    tags: [{ name: "type", value: "lead_notification" }],
  }).catch(err => {
    logger.warn("Falha ao notificar novo lead do formulário", { email, error: String(err) });
  });

  logger.info("Lead captado via formulário do menu", { email, nome: nomeClean, telefone });
  res.json({ ok: true, mensagem: "Cadastro realizado com sucesso! Você receberá nossas novidades em breve." });
});

// ══════════════════════════════════════════════════════════════════
// GRUPO VIP — Página intermediária + captura + redirect ao grupo
// ══════════════════════════════════════════════════════════════════

const GRUPO_VIP_URL = "https://chat.whatsapp.com/DzOJHBZ2vECF1taXiRRv6g";

// ── GET /api/links/grupo-vip — página com formulário ─────────

linksRouter.get("/grupo-vip", (_req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Content-Security-Policy",
    "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; script-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none';"
  );

  res.send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Clube VIP Bibelô — Papelaria Bibelô</title>
  <meta name="description" content="Entre no Clube VIP da Papelaria Bibelô no WhatsApp e receba novidades em primeira mão">
  <link rel="icon" href="/logo.png">
  <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    *,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
    :root{--pink:#fe68c4;--pink-dark:#e550aa;--green:#25D366;--green-dark:#1da851;--rosa:#ffe5ec;--amarelo:#fff7c1;--dark:#2d2d2d;--mid:#6b4c6b;--soft:#a07090;--white:#fff}
    body{font-family:'Nunito','Segoe UI',Arial,sans-serif;background:linear-gradient(160deg,#ffe0ef 0%,#fce7f3 40%,#fff0f6 100%);min-height:100vh;min-height:100dvh;display:flex;flex-direction:column;align-items:center;padding:0}
    .card{width:100%;max-width:440px;background:var(--white);border-radius:0 0 28px 28px;box-shadow:0 10px 40px rgba(254,104,196,0.15);overflow:hidden;min-height:100vh;min-height:100dvh;display:flex;flex-direction:column}
    .header{background:linear-gradient(160deg,var(--amarelo) 0%,var(--rosa) 100%);padding:24px 20px 18px;text-align:center;border-bottom:3px solid var(--pink);position:relative;overflow:hidden}
    .header::before{content:'';position:absolute;width:120px;height:120px;border-radius:50%;opacity:0.12;background:var(--pink);top:-40px;right:-30px}
    .avatar{width:56px;height:56px;border-radius:50%;border:3px solid var(--pink);box-shadow:0 4px 15px rgba(254,104,196,0.3);margin:0 auto 10px;display:block}
    .badge{display:inline-block;background:linear-gradient(135deg,var(--green),var(--green-dark));color:var(--white);font-size:10px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;padding:4px 14px;border-radius:20px;margin-bottom:8px}
    .header h1{font-size:20px;font-weight:900;color:var(--dark);margin-bottom:4px}
    .header p{font-size:12px;color:var(--soft);font-weight:600}
    .benefits{padding:16px 20px;background:linear-gradient(135deg,#f0fdf4,#ecfdf5);border-bottom:1px solid #d1fae5}
    .benefits ul{list-style:none;display:flex;flex-direction:column;gap:8px}
    .benefits li{font-size:13px;color:#166534;font-weight:600;display:flex;align-items:center;gap:8px}
    .benefits li::before{content:'';display:none}
    .form-body{padding:16px 20px;flex:1;display:flex;flex-direction:column;gap:12px}
    .form-intro{font-size:13px;color:var(--mid);font-weight:600;line-height:1.4;text-align:center}
    .field{display:flex;flex-direction:column;gap:4px}
    .field label{font-size:11px;font-weight:800;color:var(--mid);text-transform:uppercase;letter-spacing:0.8px}
    .field input{padding:11px 14px;border:2px solid #d1fae5;border-radius:10px;font-size:14px;font-family:'Nunito',sans-serif;font-weight:600;color:var(--dark);outline:none;transition:border-color 0.2s}
    .field input:focus{border-color:var(--green);box-shadow:0 0 0 3px rgba(37,211,102,0.1)}
    .field input::placeholder{color:#a7c4b0;font-weight:500}
    .submit-btn{padding:14px;border:none;border-radius:12px;background:linear-gradient(135deg,#25D366 0%,#1da851 100%);color:var(--white);font-size:15px;font-weight:900;font-family:'Nunito',sans-serif;cursor:pointer;transition:all 0.2s;box-shadow:0 4px 15px rgba(37,211,102,0.3);margin-top:4px;display:flex;align-items:center;justify-content:center;gap:8px}
    .submit-btn:hover{filter:brightness(1.08);transform:translateY(-2px);box-shadow:0 6px 20px rgba(37,211,102,0.35)}
    .submit-btn:active{transform:translateY(0)}
    .submit-btn:disabled{opacity:0.6;cursor:not-allowed;transform:none}
    .msg{padding:10px 14px;border-radius:10px;font-size:13px;font-weight:700;text-align:center;display:none}
    .msg.ok{display:block;background:#f0fff6;color:#166534;border:2px solid #bbf7d0}
    .msg.err{display:block;background:#fff5f5;color:#991b1b;border:2px solid #fecaca}
    .footer{background:linear-gradient(135deg,var(--amarelo),#fff5fb);padding:12px 20px;text-align:center;border-top:2px solid #fce7f3}
    .footer p{font-size:11px;color:var(--soft);font-weight:600}
    .footer a{color:var(--pink);text-decoration:none;font-weight:700}
    .back-link{display:inline-flex;align-items:center;gap:6px;color:var(--pink);font-size:13px;font-weight:700;text-decoration:none;margin-top:2px}
    .back-link:hover{text-decoration:underline}
    @media(max-height:700px){.header{padding:16px 16px 12px}.avatar{width:44px;height:44px}.header h1{font-size:18px}.form-body{padding:12px 16px;gap:10px}.benefits{padding:12px 16px}}
    @media(min-width:441px){body{padding:24px 16px 48px}.card{min-height:auto;border-radius:28px}}
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <img src="/logo.png" alt="Papelaria Bibelô" class="avatar">
      <div class="badge">Clube VIP Bibelô</div>
      <h1>Clube Bibelô</h1>
      <p>Novidades e ofertas em primeira mão</p>
    </div>

    <div class="benefits">
      <ul>
        <li>🚚 Frete grátis em pedidos acima de R$ 79</li>
        <li>🎁 Mimo surpresa em toda compra</li>
        <li>✨ Lançamentos antes de todo mundo</li>
        <li>💖 Promoções exclusivas para o clube</li>
      </ul>
    </div>

    <form class="form-body" id="vipForm">
      <p class="form-intro">Informe seu nome e e-mail para entrar no Clube VIP e aproveitar benefícios exclusivos!</p>

      <div class="field">
        <label for="nome">Seu nome</label>
        <input type="text" id="nome" name="nome" placeholder="Como podemos te chamar?" required maxlength="200">
      </div>

      <div class="field">
        <label for="email">Seu e-mail</label>
        <input type="email" id="email" name="email" placeholder="seuemail@exemplo.com" required maxlength="200">
      </div>

      <div class="msg" id="msg"></div>

      <button type="submit" class="submit-btn" id="submitBtn">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.625.846 5.059 2.284 7.034L.789 23.492a.5.5 0 00.612.638l4.688-1.228A11.943 11.943 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-2.153 0-4.157-.655-5.816-1.776l-.405-.268-3.059.802.816-2.98-.293-.465A9.944 9.944 0 012 12C2 6.486 6.486 2 12 2s10 4.486 10 10-4.486 10-10 10z"/></svg>
        Entrar no Clube VIP
      </button>

      <a href="/" class="back-link">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
        Voltar ao menu
      </a>
    </form>

    <div class="footer">
      <p><a href="https://www.papelariabibelo.com.br/" target="_blank" rel="noopener">papelariabibelo.com.br</a><br>&copy; Papelaria Bibelô &mdash; 63.961.764/0001-63 &mdash; 2026. Todos os direitos reservados.</p>
    </div>
  </div>

  <script>
    document.getElementById('vipForm').addEventListener('submit', function(e) {
      e.preventDefault();
      var btn = document.getElementById('submitBtn');
      var msg = document.getElementById('msg');
      btn.disabled = true;
      btn.innerHTML = 'Entrando...';
      msg.className = 'msg';
      msg.style.display = 'none';

      var data = {
        nome: document.getElementById('nome').value.trim(),
        email: document.getElementById('email').value.trim()
      };

      fetch('/api/links/grupo-vip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })
      .then(function(r) { return r.json(); })
      .then(function(res) {
        if (res.ok) {
          msg.className = 'msg ok';
          msg.textContent = res.mensagem;
          msg.style.display = 'block';
          btn.innerHTML = 'Redirecionando...';
          setTimeout(function() {
            window.location.href = res.redirect;
          }, 1500);
        } else {
          msg.className = 'msg err';
          msg.textContent = res.error || 'Erro ao processar. Tente novamente.';
          msg.style.display = 'block';
          btn.disabled = false;
          btn.innerHTML = 'Entrar no Clube VIP';
        }
      })
      .catch(function() {
        msg.className = 'msg err';
        msg.textContent = 'Erro de conexão. Tente novamente.';
        msg.style.display = 'block';
        btn.disabled = false;
        btn.innerHTML = 'Entrar no Clube VIP';
      });
    });
  </script>
</body>
</html>`);
});

// ── POST /api/links/grupo-vip — processar entrada no Clube VIP ──

const grupoVipSchema = z.object({
  nome: z.string().min(1).max(200),
  email: z.string().email().max(200),
});

linksRouter.post("/grupo-vip", limiter, async (req: Request, res: Response) => {
  const parsed = grupoVipSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: "Preencha nome e e-mail corretamente." });
    return;
  }

  const nome = parsed.data.nome.replace(/[<>"'&]/g, "");
  const email = parsed.data.email.toLowerCase().trim();

  // Verifica se já está no grupo (por email)
  const existing = await queryOne<{ id: string }>(
    "SELECT id FROM marketing.leads WHERE email = $1 AND fonte = 'grupo_vip'",
    [email]
  );

  if (existing) {
    // Já cadastrado — redireciona direto
    res.json({
      ok: true,
      mensagem: "Você já está cadastrada! Redirecionando para o Clube VIP...",
      redirect: GRUPO_VIP_URL,
    });
    return;
  }

  // Cria/vincula customer no CRM
  const customer = await upsertCustomer({
    nome,
    email,
    canal_origem: "grupo_vip",
  });

  // Salva lead com fonte grupo_vip
  await query(
    `INSERT INTO marketing.leads (email, nome, fonte, customer_id, email_verificado)
     VALUES ($1, $2, 'grupo_vip', $3, true)
     ON CONFLICT (email) DO UPDATE SET
       nome = COALESCE(EXCLUDED.nome, marketing.leads.nome),
       fonte = 'grupo_vip'`,
    [email, nome, customer.id]
  );

  // Registra interação no CRM
  await query(
    `INSERT INTO crm.interactions (customer_id, tipo, canal, descricao, metadata)
     VALUES ($1, 'grupo_vip', 'whatsapp', $2, $3)`,
    [customer.id, `Entrou no Clube VIP Bibelô`, JSON.stringify({ nome, email })]
  );

  // Cria deal no pipeline
  await query(
    `INSERT INTO crm.deals (customer_id, titulo, valor, etapa, origem, probabilidade, notas)
     VALUES ($1, $2, 0, 'prospeccao', 'grupo_vip', 30, $3)`,
    [customer.id, `VIP: ${nome}`, `Clube VIP Bibelô. Email: ${email}`]
  );

  // Registra clique no tracking de links
  const ip = getRealIp(req);
  const geo = resolveGeo(ip);
  query(
    `INSERT INTO marketing.link_clicks (slug, ip, geo_city, geo_region, geo_country, user_agent, referer)
     VALUES ('grupo-vip-join', $1, $2, $3, $4, $5, $6)`,
    [geo?.ip || null, geo?.city || null, geo?.region || null, geo?.country || null,
     (req.headers["user-agent"] || "").slice(0, 500), (req.headers["referer"] || "").slice(0, 500)]
  ).catch(() => {});

  // Email de notificação para o admin
  sendEmail({
    to: "contato@papelariabibelo.com.br",
    subject: `💖 Nova membro VIP: ${nome}`,
    html: `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f0f2;font-family:'Segoe UI',Arial,sans-serif;">
  <div style="max-width:500px;margin:20px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.06);">
    <div style="background:linear-gradient(135deg,#25D366,#1da851);padding:24px;text-align:center;">
      <p style="color:#fff;font-size:20px;font-weight:700;margin:0;">Nova membro no Clube VIP!</p>
    </div>
    <div style="padding:24px;">
      <p style="font-size:15px;color:#333;margin:0 0 12px;"><strong>Nome:</strong> ${nome}</p>
      <p style="font-size:15px;color:#333;margin:0 0 12px;"><strong>Email:</strong> ${email}</p>
      <p style="font-size:13px;color:#999;margin:16px 0 0;">Via formulário do Clube VIP (boasvindas.papelariabibelo.com.br)</p>
    </div>
  </div>
</body></html>`,
    tags: [{ name: "type", value: "vip_notification" }],
  }).catch(err => {
    logger.warn("Falha ao notificar novo membro VIP", { nome, error: String(err) });
  });

  // Email de boas-vindas para a membro (se tem email)
  if (email) {
    sendEmail({
      to: email,
      subject: `💖 Bem-vinda ao Clube VIP Bibelô, ${nome}!`,
      html: `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><style>*{font-family:Jost,'Segoe UI',Arial,sans-serif;}</style></head>
<body style="margin:0;padding:0;background:#ffe5ec;">
<div style="max-width:600px;margin:0 auto;padding:20px 10px;">
  <div style="background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 20px 60px rgba(254,104,196,0.15);">
    <div style="background:linear-gradient(160deg,#ffe5ec 0%,#fff7c1 50%,#ffe5ec 100%);padding:32px 30px;text-align:center;">
      <div style="background:linear-gradient(135deg,#25D366,#1da851);color:#fff;display:inline-block;padding:5px 16px;border-radius:50px;font-size:11px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:12px;">CLUBE VIP</div>
      <h1 style="color:#2d2d2d;margin:0 0 6px;font-size:26px;font-weight:600;font-family:Cormorant Garamond,Georgia,serif;">Bem-vinda ao Clube!</h1>
    </div>
    <div style="height:3px;background:linear-gradient(90deg,#25D366,#1da851,#25D366);"></div>
    <div style="padding:32px 30px;text-align:center;">
      <p style="color:#333;font-size:16px;line-height:1.6;margin:0 0 20px;">
        Oi, <strong style="color:#fe68c4;">${nome}</strong>! Que bom ter voc&ecirc; no nosso Clube VIP!
      </p>
      <div style="background:linear-gradient(135deg,#f0fdf4,#ecfdf5);border-radius:12px;padding:16px 20px;margin:0 0 24px;text-align:left;">
        <p style="margin:0 0 6px;font-size:13px;color:#166534;">&#x1F69A; Frete gr&aacute;tis acima de R$79</p>
        <p style="margin:0 0 6px;font-size:13px;color:#166534;">&#x1F381; Mimo surpresa em toda compra</p>
        <p style="margin:0 0 6px;font-size:13px;color:#166534;">&#x2728; Lan&ccedil;amentos antes de todo mundo</p>
        <p style="margin:0;font-size:13px;color:#166534;">&#x1F496; Promo&ccedil;&otilde;es exclusivas para o clube</p>
      </div>
      <a href="https://www.papelariabibelo.com.br/?utm_source=email&amp;utm_medium=vip&amp;utm_campaign=boas_vindas" style="display:inline-block;background:linear-gradient(135deg,#fe68c4,#f472b6);color:#fff;padding:14px 40px;border-radius:50px;text-decoration:none;font-weight:600;font-size:15px;box-shadow:0 4px 15px rgba(254,104,196,0.3);">
        Conferir novidades
      </a>
    </div>
    <div style="padding:14px 30px;background:#fafafa;text-align:center;border-top:1px solid #ffe5ec;">
      <p style="color:#bbb;font-size:11px;margin:0;">Papelaria Bibel&ocirc; &middot; <span style="color:#fe68c4;">papelariabibelo.com.br</span></p>
    </div>
  </div>
</div>
</body></html>`,
      tags: [{ name: "type", value: "vip_welcome" }],
    }).catch(err => {
      logger.warn("Falha ao enviar boas-vindas VIP", { email, error: String(err) });
    });
  }

  logger.info("Nova membro no Clube VIP", { nome, email, customerId: customer.id });

  res.json({
    ok: true,
    mensagem: "Cadastro realizado! Redirecionando para o Clube VIP...",
    redirect: GRUPO_VIP_URL,
  });
});

// ══════════════════════════════════════════════════════════════════
// PARCERIAS B2B — Formulário de contato para empresas
// ══════════════════════════════════════════════════════════════════

linksRouter.get("/parcerias", (_req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Content-Security-Policy",
    "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; script-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none';"
  );

  res.send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Parcerias B2B — Papelaria Bibelô</title>
  <meta name="description" content="Entre em contato para parcerias, atacado e revenda com a Papelaria Bibelô">
  <link rel="icon" href="/logo.png">
  <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    *,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
    :root{--pink:#fe68c4;--rosa:#ffe5ec;--amarelo:#fff7c1;--dark:#2d2d2d;--mid:#6b4c6b;--soft:#a07090;--white:#fff;--blue:#3b82f6;--blue-dark:#2563eb}
    body{font-family:'Nunito','Segoe UI',Arial,sans-serif;background:linear-gradient(160deg,#ffe0ef 0%,#fce7f3 40%,#fff0f6 100%);min-height:100vh;min-height:100dvh;display:flex;flex-direction:column;align-items:center;padding:0}
    .card{width:100%;max-width:480px;background:var(--white);border-radius:0 0 28px 28px;box-shadow:0 10px 40px rgba(254,104,196,0.15);overflow:hidden;min-height:100vh;min-height:100dvh;display:flex;flex-direction:column}
    .header{background:linear-gradient(160deg,var(--amarelo) 0%,var(--rosa) 100%);padding:24px 20px 18px;text-align:center;border-bottom:3px solid var(--pink);position:relative;overflow:hidden}
    .header::before{content:'';position:absolute;width:120px;height:120px;border-radius:50%;opacity:0.12;background:var(--pink);top:-40px;right:-30px}
    .avatar{width:56px;height:56px;border-radius:50%;border:3px solid var(--pink);box-shadow:0 4px 15px rgba(254,104,196,0.3);margin:0 auto 10px;display:block}
    .badge{display:inline-block;background:linear-gradient(135deg,var(--blue),var(--blue-dark));color:var(--white);font-size:10px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;padding:4px 14px;border-radius:20px;margin-bottom:8px}
    .header h1{font-size:20px;font-weight:900;color:var(--dark);margin-bottom:4px}
    .header p{font-size:12px;color:var(--soft);font-weight:600}
    .form-body{padding:16px 20px;flex:1;display:flex;flex-direction:column;gap:12px}
    .form-intro{font-size:13px;color:var(--mid);font-weight:600;line-height:1.4;text-align:center}
    .field{display:flex;flex-direction:column;gap:4px}
    .field label{font-size:11px;font-weight:800;color:var(--mid);text-transform:uppercase;letter-spacing:0.8px}
    .field input,.field select,.field textarea{padding:11px 14px;border:2px solid #dbeafe;border-radius:10px;font-size:14px;font-family:'Nunito',sans-serif;font-weight:600;color:var(--dark);outline:none;transition:border-color 0.2s;resize:vertical}
    .field input:focus,.field select:focus,.field textarea:focus{border-color:var(--blue);box-shadow:0 0 0 3px rgba(59,130,246,0.1)}
    .field input::placeholder,.field textarea::placeholder{color:#93c5fd;font-weight:500}
    .row{display:grid;grid-template-columns:1fr 1fr;gap:10px}
    .submit-btn{padding:14px;border:none;border-radius:12px;background:linear-gradient(135deg,var(--blue) 0%,var(--blue-dark) 100%);color:var(--white);font-size:15px;font-weight:900;font-family:'Nunito',sans-serif;cursor:pointer;transition:all 0.2s;box-shadow:0 4px 15px rgba(59,130,246,0.3);margin-top:4px}
    .submit-btn:hover{filter:brightness(1.08);transform:translateY(-2px)}
    .submit-btn:active{transform:translateY(0)}
    .submit-btn:disabled{opacity:0.6;cursor:not-allowed;transform:none}
    .msg{padding:10px 14px;border-radius:10px;font-size:13px;font-weight:700;text-align:center;display:none}
    .msg.ok{display:block;background:#f0fff6;color:#166534;border:2px solid #bbf7d0}
    .msg.err{display:block;background:#fff5f5;color:#991b1b;border:2px solid #fecaca}
    .footer{background:linear-gradient(135deg,var(--amarelo),#fff5fb);padding:12px 20px;text-align:center;border-top:2px solid #fce7f3}
    .footer p{font-size:11px;color:var(--soft);font-weight:600}
    .footer a{color:var(--pink);text-decoration:none;font-weight:700}
    .back-link{display:inline-flex;align-items:center;gap:6px;color:var(--pink);font-size:13px;font-weight:700;text-decoration:none;margin-top:2px}
    .back-link:hover{text-decoration:underline}
    @media(max-height:700px){.header{padding:16px 16px 12px}.avatar{width:44px;height:44px}.header h1{font-size:18px}.form-body{padding:12px 16px;gap:10px}}
    @media(min-width:481px){body{padding:24px 16px 48px}.card{min-height:auto;border-radius:28px}}
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <img src="/logo.png" alt="Papelaria Bibelô" class="avatar">
      <div class="badge">Parcerias B2B</div>
      <h1>Vamos trabalhar juntos?</h1>
      <p>Atacado, revenda e parcerias corporativas</p>
    </div>

    <form class="form-body" id="b2bForm">
      <p class="form-intro">Preencha o formulário abaixo e entraremos em contato para alinhar os detalhes da parceria.</p>

      <div class="field">
        <label for="nome">Nome completo</label>
        <input type="text" id="nome" name="nome" placeholder="Seu nome" required maxlength="200">
      </div>

      <div class="field">
        <label for="empresa">Empresa</label>
        <input type="text" id="empresa" name="empresa" placeholder="Nome da empresa" maxlength="200">
      </div>

      <div class="row">
        <div class="field">
          <label for="documento">CPF ou CNPJ</label>
          <input type="text" id="documento" name="documento" placeholder="000.000.000-00" maxlength="20">
        </div>
        <div class="field">
          <label for="telefone">Telefone</label>
          <input type="tel" id="telefone" name="telefone" placeholder="(47) 9 9999-9999" maxlength="20">
        </div>
      </div>

      <div class="field">
        <label for="email">E-mail</label>
        <input type="email" id="email" name="email" placeholder="contato@empresa.com" required maxlength="200">
      </div>

      <div class="field">
        <label for="assunto">Assunto</label>
        <select id="assunto" name="assunto" required>
          <option value="">Selecione...</option>
          <option value="atacado">Compra no atacado</option>
          <option value="revenda">Revenda de produtos</option>
          <option value="corporativo">Brindes corporativos</option>
          <option value="evento">Eventos e workshops</option>
          <option value="outro">Outro assunto</option>
        </select>
      </div>

      <div class="field">
        <label for="mensagem">Mensagem</label>
        <textarea id="mensagem" name="mensagem" rows="3" placeholder="Conte-nos sobre sua necessidade..." maxlength="2000"></textarea>
      </div>

      <div class="msg" id="msg"></div>

      <button type="submit" class="submit-btn" id="submitBtn">Enviar solicitação</button>

      <a href="/" class="back-link">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
        Voltar ao menu
      </a>
    </form>

    <div class="footer">
      <p><a href="https://www.papelariabibelo.com.br/" target="_blank" rel="noopener">papelariabibelo.com.br</a><br>&copy; Papelaria Bibelô &mdash; 63.961.764/0001-63 &mdash; 2026. Todos os direitos reservados.</p>
    </div>
  </div>

  <script>
    document.getElementById('b2bForm').addEventListener('submit', function(e) {
      e.preventDefault();
      var btn = document.getElementById('submitBtn');
      var msg = document.getElementById('msg');
      btn.disabled = true;
      btn.textContent = 'Enviando...';
      msg.className = 'msg';
      msg.style.display = 'none';

      var data = {
        nome: document.getElementById('nome').value.trim(),
        empresa: document.getElementById('empresa').value.trim() || undefined,
        documento: document.getElementById('documento').value.trim() || undefined,
        telefone: document.getElementById('telefone').value.trim() || undefined,
        email: document.getElementById('email').value.trim(),
        assunto: document.getElementById('assunto').value,
        mensagem: document.getElementById('mensagem').value.trim() || undefined
      };

      fetch('/api/links/parcerias', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })
      .then(function(r) { return r.json(); })
      .then(function(res) {
        if (res.ok) {
          msg.className = 'msg ok';
          msg.textContent = res.mensagem;
          msg.style.display = 'block';
          btn.textContent = 'Enviado!';
          document.getElementById('b2bForm').reset();
        } else {
          msg.className = 'msg err';
          msg.textContent = res.error || 'Erro ao enviar. Tente novamente.';
          msg.style.display = 'block';
          btn.disabled = false;
          btn.textContent = 'Enviar solicitação';
        }
      })
      .catch(function() {
        msg.className = 'msg err';
        msg.textContent = 'Erro de conexão. Tente novamente.';
        msg.style.display = 'block';
        btn.disabled = false;
        btn.textContent = 'Enviar solicitação';
      });
    });
  </script>
</body>
</html>`);
});

// ── POST /api/links/parcerias — processar solicitação B2B ────

const parceriasSchema = z.object({
  nome: z.string().min(1).max(200),
  empresa: z.string().max(200).optional(),
  documento: z.string().max(20).optional(),
  telefone: z.string().max(20).optional(),
  email: z.string().email().max(200),
  assunto: z.enum(["atacado", "revenda", "corporativo", "evento", "outro"]),
  mensagem: z.string().max(2000).optional(),
});

const ASSUNTO_LABELS: Record<string, string> = {
  atacado: "Compra no atacado",
  revenda: "Revenda de produtos",
  corporativo: "Brindes corporativos",
  evento: "Eventos e workshops",
  outro: "Outro assunto",
};

linksRouter.post("/parcerias", limiter, async (req: Request, res: Response) => {
  const parsed = parceriasSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: "Preencha nome, e-mail e assunto corretamente." });
    return;
  }

  const { assunto, mensagem } = parsed.data;
  const nome = parsed.data.nome.replace(/[<>"'&]/g, "");
  const empresa = (parsed.data.empresa || "").replace(/[<>"'&]/g, "");
  const documento = (parsed.data.documento || "").replace(/[<>"'&]/g, "");
  const telefone = (parsed.data.telefone || "").replace(/[<>"'&]/g, "");
  const email = parsed.data.email.toLowerCase().trim();
  const msgClean = (mensagem || "").replace(/[<>"'&]/g, "");

  // Cria/vincula customer no CRM
  const customer = await upsertCustomer({
    nome,
    email,
    telefone: telefone || undefined,
    canal_origem: "parcerias_b2b",
  });

  // Registra interação no CRM
  await query(
    `INSERT INTO crm.interactions (customer_id, tipo, canal, descricao, metadata)
     VALUES ($1, 'parceria_b2b', 'email', $2, $3)`,
    [customer.id, `Solicitação B2B: ${ASSUNTO_LABELS[assunto]}`, JSON.stringify({ nome, empresa, documento, telefone, email, assunto, mensagem: msgClean })]
  );

  // Cria deal B2B no pipeline
  await query(
    `INSERT INTO crm.deals (customer_id, titulo, valor, etapa, origem, probabilidade, notas)
     VALUES ($1, $2, 0, 'prospeccao', 'parcerias_b2b', 40, $3)`,
    [customer.id, `B2B: ${empresa || nome} — ${ASSUNTO_LABELS[assunto]}`, `${empresa ? `Empresa: ${empresa}\\n` : ""}${documento ? `Doc: ${documento}\\n` : ""}${telefone ? `Tel: ${telefone}\\n` : ""}Assunto: ${ASSUNTO_LABELS[assunto]}\\n${msgClean ? `Mensagem: ${msgClean}` : ""}`]
  );

  // Registra clique
  const ip = getRealIp(req);
  const geo = resolveGeo(ip);
  query(
    `INSERT INTO marketing.link_clicks (slug, ip, geo_city, geo_region, geo_country, user_agent, referer)
     VALUES ('parcerias-submit', $1, $2, $3, $4, $5, $6)`,
    [geo?.ip || null, geo?.city || null, geo?.region || null, geo?.country || null,
     (req.headers["user-agent"] || "").slice(0, 500), (req.headers["referer"] || "").slice(0, 500)]
  ).catch(() => {});

  // Email para o admin com todos os dados
  sendEmail({
    to: "contato@papelariabibelo.com.br",
    subject: `🤝 Parceria B2B: ${empresa || nome} — ${ASSUNTO_LABELS[assunto]}`,
    html: `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f0f2;font-family:'Segoe UI',Arial,sans-serif;">
  <div style="max-width:500px;margin:20px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.06);">
    <div style="background:linear-gradient(135deg,#3b82f6,#2563eb);padding:24px;text-align:center;">
      <p style="color:#fff;font-size:20px;font-weight:700;margin:0;">Nova solicitação B2B</p>
      <p style="color:rgba(255,255,255,0.8);font-size:14px;font-weight:600;margin:4px 0 0;">${ASSUNTO_LABELS[assunto]}</p>
    </div>
    <div style="padding:24px;">
      <p style="font-size:15px;color:#333;margin:0 0 10px;"><strong>Nome:</strong> ${nome}</p>
      ${empresa ? `<p style="font-size:15px;color:#333;margin:0 0 10px;"><strong>Empresa:</strong> ${empresa}</p>` : ""}
      ${documento ? `<p style="font-size:15px;color:#333;margin:0 0 10px;"><strong>CPF/CNPJ:</strong> ${documento}</p>` : ""}
      ${telefone ? `<p style="font-size:15px;color:#333;margin:0 0 10px;"><strong>Telefone:</strong> ${telefone}</p>` : ""}
      <p style="font-size:15px;color:#333;margin:0 0 10px;"><strong>Email:</strong> <a href="mailto:${email}" style="color:#3b82f6;">${email}</a></p>
      ${msgClean ? `<div style="margin:16px 0 0;padding:14px;background:#f8fafc;border-radius:10px;border:1px solid #e2e8f0;"><p style="font-size:12px;color:#64748b;margin:0 0 6px;font-weight:700;">MENSAGEM:</p><p style="font-size:14px;color:#334155;margin:0;line-height:1.5;white-space:pre-wrap;">${msgClean}</p></div>` : ""}
      <p style="font-size:12px;color:#999;margin:16px 0 0;">Via formulário de parcerias (boasvindas.papelariabibelo.com.br)</p>
    </div>
  </div>
</body></html>`,
    tags: [{ name: "type", value: "b2b_notification" }],
  }).catch(err => {
    logger.warn("Falha ao notificar parceria B2B", { email, error: String(err) });
  });

  logger.info("Solicitação de parceria B2B", { nome, empresa, email, assunto });
  res.json({ ok: true, mensagem: "Solicitação enviada com sucesso! Entraremos em contato em breve." });
});
