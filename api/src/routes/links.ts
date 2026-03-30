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
// Cada link tem slug, título, URL destino, ícone e UTM params

interface LinkItem {
  slug: string;
  titulo: string;
  url: string;
  icone: string;  // emoji ou SVG inline
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
    utm: { source: "instagram", medium: "bio_link", campaign: "links" },
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
    slug: "email",
    titulo: "Nos envie um E-mail",
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
  // Stats por link (últimos 30 dias)
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

  const apiBase = process.env.WEBHOOK_URL || "https://webhook.papelariabibelo.com.br";

  const linksHtml = LINKS.map(link => {
    const href = `${apiBase}/api/links/go/${link.slug}`;
    const destaqueStyle = link.destaque
      ? "background:linear-gradient(135deg,#fe68c4,#f472b6);color:#fff;font-weight:700;box-shadow:0 4px 15px rgba(254,104,196,0.3);"
      : "background:#fff;color:#333;border:2px solid #f0e0f0;";
    return `
      <a href="${href}" target="_blank" rel="noopener" style="display:flex;align-items:center;gap:12px;padding:16px 20px;border-radius:14px;text-decoration:none;font-size:15px;transition:transform 0.15s;${destaqueStyle}" onmouseover="this.style.transform='scale(1.02)'" onmouseout="this.style.transform='scale(1)'">
        <span style="font-size:22px;flex-shrink:0;">${link.icone}</span>
        <span style="flex:1;text-align:left;">${link.titulo}</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;opacity:0.4;"><path d="M9 18l6-6-6-6"/></svg>
      </a>`;
  }).join("\n");

  res.send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Papelaria Bibelô — Links</title>
  <meta name="description" content="Papelaria Bibelô — Loja online, WhatsApp, Grupo VIP e mais">
  <meta property="og:title" content="Papelaria Bibelô">
  <meta property="og:description" content="Papelaria fofa em São Bento do Sul — Loja online, WhatsApp, Grupo VIP">
  <meta property="og:image" content="${apiBase}/logo.png">
  <meta property="og:type" content="website">
  <link rel="icon" href="${apiBase}/logo.png">
  <link href="https://fonts.googleapis.com/css2?family=Jost:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body {
      font-family: 'Jost', 'Segoe UI', Arial, sans-serif;
      background: linear-gradient(180deg, #fff0f5 0%, #fff7fa 40%, #f5f0f2 100%);
      min-height: 100vh;
      display: flex;
      justify-content: center;
      padding: 20px 16px 40px;
    }
    .container {
      width: 100%;
      max-width: 420px;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .avatar {
      width: 96px; height: 96px;
      border-radius: 50%;
      border: 4px solid #fe68c4;
      box-shadow: 0 4px 20px rgba(254,104,196,0.25);
      margin-top: 20px;
    }
    .nome {
      font-size: 22px;
      font-weight: 700;
      color: #333;
      margin: 16px 0 4px;
    }
    .bio {
      font-size: 14px;
      color: #888;
      margin-bottom: 28px;
      text-align: center;
      line-height: 1.4;
    }
    .links {
      width: 100%;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .footer {
      margin-top: 32px;
      text-align: center;
      color: #ccc;
      font-size: 11px;
    }
    .footer a { color: #fe68c4; text-decoration: none; }
    .cupom-banner {
      width: 100%;
      background: linear-gradient(135deg, #fff7c1, #ffe5ec);
      border: 2px dashed #fe68c4;
      border-radius: 14px;
      padding: 16px;
      text-align: center;
      margin-bottom: 8px;
    }
    .cupom-banner p { font-size: 13px; color: #666; margin: 0 0 6px; }
    .cupom-banner strong { color: #fe68c4; font-size: 20px; letter-spacing: 1px; }
    .cupom-banner small { display: block; color: #999; font-size: 11px; margin-top: 4px; }
  </style>
</head>
<body>
  <div class="container">
    <img src="${apiBase}/logo.png" alt="Papelaria Bibelô" class="avatar" />
    <h1 class="nome">Papelaria Bibelô</h1>
    <p class="bio">Papelaria fofa em São Bento do Sul/SC<br>Entrega para todo o Brasil</p>

    <div class="cupom-banner">
      <p>Primeira compra no site?</p>
      <strong>BIBELO10</strong>
      <small>10% OFF no seu primeiro pedido</small>
    </div>

    <div class="links">
      ${linksHtml}
    </div>

    <div class="footer">
      <p>Papelaria Bibelô &middot; <a href="https://www.papelariabibelo.com.br">papelariabibelo.com.br</a></p>
    </div>
  </div>
</body>
</html>`);
});
