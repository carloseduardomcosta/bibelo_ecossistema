import { Router, Request, Response } from "express";
import { query } from "../db";
import { resolveGeo } from "../utils/geoip";
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
    titulo: "Acessar Loja Online",
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
    titulo: "Entrar no Grupo VIP",
    url: "https://chat.whatsapp.com/DzOJHBZ2vECF1taXiRRv6g",
    icone: "💖",
  },
  {
    slug: "instagram",
    titulo: "Siga no Instagram",
    url: "https://www.instagram.com/papelariabibelo",
    icone: "📸",
  },
  {
    slug: "formulario",
    titulo: "Preencha o formulário",
    url: "https://www.papelariabibelo.com.br",
    icone: "📋",
    utm: { source: "instagram", medium: "bio_link", campaign: "formulario" },
  },
  {
    slug: "email",
    titulo: "Nos envie um E-mail (B2B)",
    url: "mailto:contato@papelariabibelo.com.br",
    icone: "📧",
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
  ).catch(() => {}); // fire-and-forget

  // Monta URL com UTM se aplicável
  let destino = link.url;
  if (link.utm && !destino.startsWith("mailto:")) {
    const sep = destino.includes("?") ? "&" : "?";
    destino += `${sep}utm_source=${link.utm.source}&utm_medium=${link.utm.medium}&utm_campaign=${link.utm.campaign}`;
  }

  res.redirect(302, destino);
});

// ── GET /api/links/stats — stats dos cliques (protegido) ─────

linksRouter.get("/stats", async (_req: Request, res: Response) => {
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
  <meta name="description" content="Papelaria Bibelô — Loja online, WhatsApp, Grupo VIP e mais">
  <meta property="og:title" content="Papelaria Bibelô">
  <meta property="og:description" content="Papelaria fofa em Timbó/SC — Loja online, WhatsApp, Grupo VIP">
  <meta property="og:image" content="https://menu.papelariabibelo.com.br/logo.png">
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
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 0 0 40px;
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
      display: flex;
      flex-direction: column;
    }

    /* ===== HEADER ===== */
    .header {
      background: linear-gradient(160deg, var(--yellow-soft) 0%, #ffe8f5 60%, var(--pink-light) 100%);
      padding: 40px 28px 32px;
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
      display: inline-block;
      margin-bottom: 16px;
    }
    .avatar {
      width: 96px;
      height: 96px;
      border-radius: 50%;
      border: 4px solid var(--pink-main);
      box-shadow: 0 0 0 6px rgba(244, 63, 142, 0.15), 0 6px 20px var(--pink-glow);
      display: block;
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
      font-size: 24px;
      font-weight: 900;
      color: var(--text-dark);
      margin-bottom: 6px;
      letter-spacing: -0.3px;
    }

    .boas-vindas {
      font-size: 15px;
      font-weight: 700;
      color: var(--pink-main);
      margin-bottom: 8px;
      line-height: 1.4;
    }

    .bio {
      font-size: 13px;
      color: var(--text-soft);
      font-weight: 600;
      line-height: 1.5;
    }

    /* ===== BANNER DESTAQUE LOJA ===== */
    .loja-banner {
      margin: 0;
      background: linear-gradient(135deg, #f43f8e 0%, #ec4899 50%, #db2777 100%);
      padding: 18px 24px;
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
      padding: 20px 18px;
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .section-label {
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 1.2px;
      text-transform: uppercase;
      color: var(--text-soft);
      padding: 4px 4px 2px;
    }

    .link-btn {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 14px 16px;
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
    .btn-sub {
      display: block;
      font-size: 11px;
      font-weight: 600;
      color: var(--text-soft);
      margin-top: 1px;
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

    .link-btn.vip {
      border-color: #f3d0e8;
      background: linear-gradient(135deg, #fff0f8, #fff);
    }
    .link-btn.vip:hover {
      border-color: var(--pink-main);
      background: linear-gradient(135deg, #ffe0f0, #fff5fb);
    }

    /* ===== FOOTER ===== */
    .footer {
      background: linear-gradient(135deg, var(--yellow-soft), #fff5fb);
      padding: 22px 24px;
      text-align: center;
      border-top: 2px solid #fce7f3;
    }
    .footer-brand {
      font-size: 13px;
      font-weight: 800;
      color: var(--text-mid);
      margin-bottom: 4px;
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
      <div class="avatar-wrap">
        <span class="avatar-ring"></span>
        <img src="/logo.png" alt="Papelaria Bibelô" class="avatar">
      </div>
      <h1 class="nome">Papelaria Bibelô</h1>
      <p class="boas-vindas">Olá! Bem-vindo(a) ao mundo da<br>Papelaria Bibelô</p>
      <p class="bio">Papelaria fofa em Timbó/SC<br>Entrega para todo o Brasil</p>
    </div>

    <!-- BANNER LOJA -->
    <a href="/api/links/go/loja" target="_blank" rel="noopener" class="loja-banner" aria-label="Acessar Loja Online da Papelaria Bibelô">
      <span class="loja-icon">🛍️</span>
      <span class="loja-texto">
        <span class="loja-badge">✨ Compre aqui</span>
        <span class="loja-titulo">Acessar Loja Online</span>
        <span class="loja-sub">papelariabibelo.com.br</span>
      </span>
      <span class="loja-arrow">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
      </span>
    </a>

    <!-- LINKS -->
    <div class="body">

      <p class="section-label">Fale com a gente</p>

      <a href="/api/links/go/whatsapp" target="_blank" rel="noopener" class="link-btn whatsapp">
        <span class="btn-icon">💬</span>
        <span class="btn-label">Fale conosco no WhatsApp<span class="btn-sub">Atendimento rápido e carinhoso</span></span>
        <svg class="btn-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
      </a>

      <a href="/api/links/go/grupo-vip" target="_blank" rel="noopener" class="link-btn vip">
        <span class="btn-icon">💖</span>
        <span class="btn-label">Entrar no Grupo VIP<span class="btn-sub">Promoções exclusivas para membros</span></span>
        <svg class="btn-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
      </a>

      <p class="section-label" style="margin-top:6px;">Nos acompanhe</p>

      <a href="/api/links/go/instagram" target="_blank" rel="noopener" class="link-btn instagram">
        <span class="btn-icon">📸</span>
        <span class="btn-label">Siga no Instagram<span class="btn-sub">Novidades e inspirações todo dia</span></span>
        <svg class="btn-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
      </a>

      <a href="/api/links/go/formulario" target="_blank" rel="noopener" class="link-btn">
        <span class="btn-icon">📋</span>
        <span class="btn-label">Preencha o formulário<span class="btn-sub">Cadastre-se e receba novidades</span></span>
        <svg class="btn-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
      </a>

      <p class="section-label" style="margin-top:6px;">Contato profissional</p>

      <a href="/api/links/go/email" target="_blank" rel="noopener" class="link-btn">
        <span class="btn-icon">📧</span>
        <span class="btn-label">Nos envie um E-mail (B2B)<span class="btn-sub">Parcerias e revendas</span></span>
        <svg class="btn-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
      </a>

    </div>

    <!-- FOOTER -->
    <div class="footer">
      <p class="footer-brand">Papelaria Bibelô</p>
      <p class="footer-info">
        CNPJ 63.961.764/0001-63 &nbsp;&middot;&nbsp;
        <a href="mailto:contato@papelariabibelo.com.br" class="footer-link">contato@papelariabibelo.com.br</a>
        <br>
        (47) 9 3386-2514 &nbsp;&middot;&nbsp;
        <a href="https://www.papelariabibelo.com.br/" target="_blank" rel="noopener" class="footer-link">papelariabibelo.com.br</a>
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
