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
    const href = `/api/links/go/${link.slug}`;
    const cls = link.destaque ? "link-btn destaque" : "link-btn";
    return `<a href="${href}" target="_blank" rel="noopener" class="${cls}"><span class="icon">${link.icone}</span><span class="label">${link.titulo}</span><svg class="arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg></a>`;
  }).join("\n      ");

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
  <link href="https://fonts.googleapis.com/css2?family=Jost:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Jost','Segoe UI',Arial,sans-serif;background:#ffe5ec;min-height:100vh;display:flex;flex-direction:column;align-items:center}
    .card{width:100%;max-width:440px;background:#fff;border-radius:0 0 20px 20px;box-shadow:0 8px 30px rgba(254,104,196,0.12);overflow:hidden;min-height:100vh;display:flex;flex-direction:column}
    .header{background:linear-gradient(135deg,#fff7c1,#ffe5ec);padding:36px 24px 28px;text-align:center;border-bottom:3px solid #fe68c4}
    .avatar{width:88px;height:88px;border-radius:50%;border:3px solid #fe68c4;box-shadow:0 4px 15px rgba(254,104,196,0.2)}
    .nome{font-size:22px;font-weight:700;color:#333;margin:14px 0 4px}
    .bio{font-size:14px;color:#888;font-weight:500;line-height:1.4}
    .body{padding:24px 20px;flex:1;display:flex;flex-direction:column;gap:12px}
    .link-btn{display:flex;align-items:center;gap:12px;padding:15px 18px;border-radius:12px;text-decoration:none;font-size:15px;font-weight:500;color:#333;background:#fff;border:2px solid #f0e0f0;transition:all 0.15s}
    .link-btn:hover{transform:scale(1.02);border-color:#fe68c4}
    .link-btn.destaque{background:linear-gradient(135deg,#fe68c4,#f472b6);color:#fff;border:none;font-weight:700;box-shadow:0 4px 15px rgba(254,104,196,0.3)}
    .link-btn.destaque:hover{box-shadow:0 6px 20px rgba(254,104,196,0.4)}
    .icon{font-size:20px;flex-shrink:0;width:28px;text-align:center}
    .label{flex:1;text-align:left}
    .arrow{flex-shrink:0;opacity:0.3}
    .link-btn.destaque .arrow{opacity:0.6}
    .footer{background:#fff7c1;padding:20px 24px;text-align:center;border-top:1px solid #fee}
    .footer p{color:#777;font-size:13px;font-weight:500;margin:0}
    .footer .sub{color:#aaa;font-size:11px;margin:4px 0 0}
    .footer a{color:#fe68c4;text-decoration:none;font-weight:500}
    @media(min-width:441px){.card{min-height:auto;margin:20px auto;border-radius:20px}}
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <img src="/logo.png" alt="Papelaria Bibelô" class="avatar" />
      <h1 class="nome">Papelaria Bibelô</h1>
      <p class="bio">Papelaria fofa em Timbó/SC<br>Entrega para todo o Brasil</p>
    </div>

    <div class="body">
      ${linksHtml}
    </div>

    <div class="footer">
      <p>Papelaria Bibelô</p>
      <p class="sub">CNPJ 63.961.764/0001-63 &middot; contato@papelariabibelo.com.br &middot; (47) 9 3386-2514</p>
      <p style="margin:6px 0 0"><a href="https://www.papelariabibelo.com.br">papelariabibelo.com.br</a></p>
    </div>
  </div>
</body>
</html>`);
});
