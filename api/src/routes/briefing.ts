import { Router, Request, Response } from "express";
import { z } from "zod";
import { query, queryOne } from "../db";
import { authMiddleware } from "../middleware/auth";
import { logger } from "../utils/logger";
import { sendEmail } from "../integrations/resend/email";

export const briefingRouter = Router();
briefingRouter.use(authMiddleware);

// ── Schema ─────────────────────────────────────────────────────

const briefingQuerySchema = z.object({
  horas: z.coerce.number().int().min(1).max(168).default(24),
});

// ── Interfaces ─────────────────────────────────────────────────

interface BriefingData {
  periodo: { horas: number; de: string; ate: string };
  site: {
    visitantes_unicos: number;
    total_eventos: number;
    page_views: number;
    produto_views: number;
    add_to_cart: number;
    checkouts: number;
    compras: number;
    top_produtos: Array<{ produto: string; views: number }>;
    top_estados: Array<{ estado: string; visitantes: number }>;
  };
  leads: {
    novos: number;
    verificados: number;
    convertidos: number;
    recentes: Array<{
      nome: string | null;
      email: string;
      fonte: string;
      email_verificado: boolean;
      criado_em: string;
    }>;
  };
  vendas: {
    nuvemshop: { pedidos: number; receita: number; ticket_medio: number };
    bling: { pedidos: number; receita: number };
    carrinhos: { detectados: number; convertidos: number; notificados: number };
  };
  automacoes: {
    execucoes: Array<{ fluxo: string; status: string; total: number }>;
    steps: Array<{ fluxo: string; tipo: string; status: string; total: number }>;
  };
  proximas: Array<{ fluxo: string; proximo_step_em: string; cliente: string | null }>;
  syncs: Array<{
    fonte: string;
    tipo: string;
    status: string;
    registros: number;
    erro: string | null;
    criado_em: string;
  }>;
  alertas: {
    descadastros: number;
    erros_sync: number;
    funil_travado: boolean;
    leads_sem_verificar: number;
  };
}

// ── Fetch briefing data (exportado para uso no job agendado) ───

export async function fetchBriefingData(horas: number): Promise<BriefingData> {
  const [
      siteStats,
      topProdutos,
      topEstados,
      leadsStats,
      leadsRecentes,
      nsOrders,
      blingOrders,
      carrinhos,
      flowExecs,
      flowSteps,
      proximas,
      syncs,
      descadastros,
    ] = await Promise.all([
      // 1. Site stats
      queryOne<{
        visitantes_unicos: string;
        total_eventos: string;
        page_views: string;
        produto_views: string;
        add_to_cart: string;
        checkouts: string;
        compras: string;
      }>(`
        SELECT
          COUNT(DISTINCT visitor_id) as visitantes_unicos,
          COUNT(*) as total_eventos,
          COUNT(*) FILTER (WHERE evento = 'page_view') as page_views,
          COUNT(*) FILTER (WHERE evento = 'product_view') as produto_views,
          COUNT(*) FILTER (WHERE evento = 'add_to_cart') as add_to_cart,
          COUNT(*) FILTER (WHERE evento = 'checkout') as checkouts,
          COUNT(*) FILTER (WHERE evento = 'purchase') as compras
        FROM crm.tracking_events
        WHERE criado_em >= NOW() - make_interval(hours => $1)
      `, [horas]),

      // 2. Top produtos
      query<{ produto: string; views: string }>(`
        SELECT resource_nome as produto, COUNT(*) as views
        FROM crm.tracking_events
        WHERE evento = 'product_view'
          AND criado_em >= NOW() - make_interval(hours => $1)
          AND resource_nome IS NOT NULL
        GROUP BY resource_nome ORDER BY views DESC LIMIT 5
      `, [horas]),

      // 3. Top estados
      query<{ estado: string; visitantes: string }>(`
        SELECT geo_region as estado, COUNT(DISTINCT visitor_id) as visitantes
        FROM crm.tracking_events
        WHERE criado_em >= NOW() - make_interval(hours => $1)
          AND geo_region IS NOT NULL
        GROUP BY geo_region ORDER BY visitantes DESC LIMIT 5
      `, [horas]),

      // 4. Leads stats
      queryOne<{ novos: string; verificados: string; convertidos: string }>(`
        SELECT
          COUNT(*) as novos,
          COUNT(*) FILTER (WHERE email_verificado = true) as verificados,
          COUNT(*) FILTER (WHERE convertido = true) as convertidos
        FROM marketing.leads
        WHERE criado_em >= NOW() - make_interval(hours => $1)
      `, [horas]),

      // 5. Leads recentes
      query<{
        nome: string | null;
        email: string;
        fonte: string;
        email_verificado: boolean;
        criado_em: string;
      }>(`
        SELECT nome, email, fonte, email_verificado, criado_em
        FROM marketing.leads
        WHERE criado_em >= NOW() - make_interval(hours => $1)
        ORDER BY criado_em DESC LIMIT 10
      `, [horas]),

      // 6. NuvemShop orders
      queryOne<{ total_pedidos: string; receita_total: string; ticket_medio: string }>(`
        SELECT
          COUNT(*) as total_pedidos,
          COALESCE(SUM(valor), 0) as receita_total,
          ROUND(COALESCE(AVG(valor), 0), 2) as ticket_medio
        FROM sync.nuvemshop_orders
        WHERE webhook_em >= NOW() - make_interval(hours => $1)
      `, [horas]),

      // 7. Bling orders
      queryOne<{ total_pedidos: string; receita_total: string }>(`
        SELECT
          COUNT(*) as total_pedidos,
          COALESCE(SUM(valor), 0) as receita_total
        FROM sync.bling_orders
        WHERE criado_bling >= NOW() - make_interval(hours => $1)
      `, [horas]),

      // 8. Carrinhos abandonados
      queryOne<{ detectados: string; convertidos: string; notificados: string }>(`
        SELECT
          COUNT(*) as detectados,
          COUNT(*) FILTER (WHERE convertido = true) as convertidos,
          COUNT(*) FILTER (WHERE notificado = true) as notificados
        FROM marketing.pedidos_pendentes
        WHERE criado_em >= NOW() - make_interval(hours => $1)
      `, [horas]),

      // 9. Flow executions
      query<{ fluxo: string; status: string; total: string }>(`
        SELECT f.nome as fluxo, fe.status, COUNT(*) as total
        FROM marketing.flow_executions fe
        JOIN marketing.flows f ON f.id = fe.flow_id
        WHERE fe.iniciado_em >= NOW() - make_interval(hours => $1)
        GROUP BY f.nome, fe.status ORDER BY f.nome, total DESC
      `, [horas]),

      // 10. Flow steps
      query<{ fluxo: string; tipo: string; status: string; total: string }>(`
        SELECT f.nome as fluxo, fse.tipo, fse.status, COUNT(*) as total
        FROM marketing.flow_step_executions fse
        JOIN marketing.flow_executions fe ON fe.id = fse.execution_id
        JOIN marketing.flows f ON f.id = fe.flow_id
        WHERE fse.executado_em >= NOW() - make_interval(hours => $1)
        GROUP BY f.nome, fse.tipo, fse.status ORDER BY total DESC
      `, [horas]),

      // 11. Próximas automações
      query<{ fluxo: string; proximo_step_em: string; cliente: string | null }>(`
        SELECT f.nome as fluxo, fe.proximo_step_em, c.nome as cliente
        FROM marketing.flow_executions fe
        JOIN marketing.flows f ON f.id = fe.flow_id
        LEFT JOIN crm.customers c ON c.id = fe.customer_id
        WHERE fe.status = 'ativo' AND fe.proximo_step_em IS NOT NULL
          AND fe.proximo_step_em <= NOW() + INTERVAL '12 hours'
        ORDER BY fe.proximo_step_em ASC LIMIT 15
      `),

      // 12. Sync logs
      query<{
        fonte: string;
        tipo: string;
        status: string;
        registros: number;
        erro: string | null;
        criado_em: string;
      }>(`
        SELECT fonte, tipo, status, registros, erro, criado_em
        FROM sync.sync_logs
        WHERE criado_em >= NOW() - make_interval(hours => $1)
        ORDER BY criado_em DESC LIMIT 10
      `, [horas]),

      // 13. Descadastros
      queryOne<{ descadastros: string }>(`
        SELECT COUNT(*) as descadastros
        FROM crm.customers
        WHERE email_optout = true
          AND email_optout_em >= NOW() - make_interval(hours => $1)
      `, [horas]),
    ]);

    const errosSyncCount = syncs.filter((s) => s.status === "erro").length;
    const addToCart = Number(siteStats?.add_to_cart || 0);
    const checkoutsN = Number(siteStats?.checkouts || 0);
    const funilTravado = addToCart > 5 && checkoutsN === 0;
    const leadsSemVerificar = leadsRecentes.filter((l) => !l.email_verificado).length;

    const agora = new Date();
    const de = new Date(agora.getTime() - horas * 3600 * 1000);

    const data: BriefingData = {
      periodo: {
        horas,
        de: de.toISOString(),
        ate: agora.toISOString(),
      },
      site: {
        visitantes_unicos: Number(siteStats?.visitantes_unicos || 0),
        total_eventos: Number(siteStats?.total_eventos || 0),
        page_views: Number(siteStats?.page_views || 0),
        produto_views: Number(siteStats?.produto_views || 0),
        add_to_cart: addToCart,
        checkouts: checkoutsN,
        compras: Number(siteStats?.compras || 0),
        top_produtos: topProdutos.map((p) => ({ produto: p.produto, views: Number(p.views) })),
        top_estados: topEstados.map((e) => ({ estado: e.estado, visitantes: Number(e.visitantes) })),
      },
      leads: {
        novos: Number(leadsStats?.novos || 0),
        verificados: Number(leadsStats?.verificados || 0),
        convertidos: Number(leadsStats?.convertidos || 0),
        recentes: leadsRecentes,
      },
      vendas: {
        nuvemshop: {
          pedidos: Number(nsOrders?.total_pedidos || 0),
          receita: Number(nsOrders?.receita_total || 0),
          ticket_medio: Number(nsOrders?.ticket_medio || 0),
        },
        bling: {
          pedidos: Number(blingOrders?.total_pedidos || 0),
          receita: Number(blingOrders?.receita_total || 0),
        },
        carrinhos: {
          detectados: Number(carrinhos?.detectados || 0),
          convertidos: Number(carrinhos?.convertidos || 0),
          notificados: Number(carrinhos?.notificados || 0),
        },
      },
      automacoes: {
        execucoes: flowExecs.map((e) => ({ fluxo: e.fluxo, status: e.status, total: Number(e.total) })),
        steps: flowSteps.map((s) => ({ fluxo: s.fluxo, tipo: s.tipo, status: s.status, total: Number(s.total) })),
      },
      proximas: proximas.map((p) => ({
        fluxo: p.fluxo,
        proximo_step_em: p.proximo_step_em,
        cliente: p.cliente,
      })),
      syncs: syncs.map((s) => ({
        fonte: s.fonte,
        tipo: s.tipo,
        status: s.status,
        registros: Number(s.registros),
        erro: s.erro,
        criado_em: String(s.criado_em),
      })),
      alertas: {
        descadastros: Number(descadastros?.descadastros || 0),
        erros_sync: errosSyncCount,
        funil_travado: funilTravado,
        leads_sem_verificar: leadsSemVerificar,
      },
    };

    logger.info("Briefing gerado", { horas, visitantes: data.site.visitantes_unicos });
    return data;
}

// ── HTML do email do briefing ──────────────────────────────────

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function formatBRL(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function gerarEmailBriefing(data: BriefingData): string {
  const hoje = new Date().toLocaleDateString("pt-BR", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  const alertasHtml: string[] = [];
  if (data.alertas.funil_travado) alertasHtml.push('<span style="color:#f87171">&#9888; Funil travado no checkout</span>');
  if (data.alertas.erros_sync > 0) alertasHtml.push(`<span style="color:#f87171">&#9888; ${data.alertas.erros_sync} erro(s) de sync</span>`);
  if (data.alertas.descadastros > 0) alertasHtml.push(`<span style="color:#fbbf24">&#9888; ${data.alertas.descadastros} descadastro(s)</span>`);
  if (data.alertas.leads_sem_verificar > 0) alertasHtml.push(`<span style="color:#fbbf24">&#9888; ${data.alertas.leads_sem_verificar} lead(s) sem verificar</span>`);

  const topProdHtml = data.site.top_produtos.map((p, i) =>
    `<tr><td style="padding:4px 8px;color:#94a3b8">${i + 1}.</td><td style="padding:4px 8px">${esc(p.produto)}</td><td style="padding:4px 8px;text-align:right;font-weight:600">${p.views}</td></tr>`
  ).join("");

  const topEstHtml = data.site.top_estados.map((e) =>
    `<tr><td style="padding:4px 8px;font-weight:600;color:#8b5cf6">${esc(e.estado)}</td><td style="padding:4px 8px;text-align:right">${e.visitantes} visitantes</td></tr>`
  ).join("");

  const leadsHtml = data.leads.recentes.map((l) =>
    `<tr>
      <td style="padding:4px 8px">${esc(l.nome || "—")}</td>
      <td style="padding:4px 8px;color:#94a3b8">${esc(l.email)}</td>
      <td style="padding:4px 8px">${l.email_verificado ? "&#10003;" : "&#10060;"}</td>
    </tr>`
  ).join("");

  const autoHtml = data.automacoes.execucoes.map((e) =>
    `<tr><td style="padding:4px 8px">${esc(e.fluxo)}</td><td style="padding:4px 8px">${esc(e.status)}</td><td style="padding:4px 8px;text-align:right;font-weight:600">${e.total}</td></tr>`
  ).join("");

  const emailsEnviados = data.automacoes.steps
    .filter((s) => s.tipo === "email" && s.status === "concluido")
    .reduce((a, s) => a + s.total, 0);

  const receitaTotal = data.vendas.nuvemshop.receita + data.vendas.bling.receita;
  const pedidosTotal = data.vendas.nuvemshop.pedidos + data.vendas.bling.pedidos;
  const appUrl = process.env.APP_URL || "https://crm.papelariabibelo.com.br";

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0B1120;font-family:Arial,Helvetica,sans-serif;color:#e2e8f0">
<div style="max-width:600px;margin:0 auto;padding:20px">

  <div style="text-align:center;padding:20px 0;border-bottom:1px solid #1e293b">
    <h1 style="margin:0;font-size:22px;color:#fff">Briefing Diario</h1>
    <p style="margin:4px 0 0;font-size:13px;color:#94a3b8;text-transform:capitalize">${esc(hoje)}</p>
  </div>

  ${alertasHtml.length > 0 ? `
  <div style="margin:16px 0;padding:12px 16px;background:#1e1520;border:1px solid #3b1530;border-radius:8px">
    <p style="margin:0;font-size:13px;font-weight:600;color:#f87171;margin-bottom:8px">Alertas</p>
    ${alertasHtml.map((a) => `<p style="margin:4px 0;font-size:12px">${a}</p>`).join("")}
  </div>` : `
  <div style="margin:16px 0;padding:12px 16px;background:#0f2419;border:1px solid #15803d;border-radius:8px">
    <p style="margin:0;font-size:13px;color:#4ade80">&#10003; Tudo em dia — nenhum alerta</p>
  </div>`}

  <table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0">
    <tr>
      <td style="width:25%;padding:8px;background:#111827;border:1px solid #1e293b;border-radius:8px;text-align:center">
        <p style="margin:0;font-size:22px;font-weight:700;color:#60a5fa">${data.site.visitantes_unicos}</p>
        <p style="margin:2px 0 0;font-size:10px;color:#94a3b8">Visitantes</p>
      </td>
      <td style="width:4px"></td>
      <td style="width:25%;padding:8px;background:#111827;border:1px solid #1e293b;border-radius:8px;text-align:center">
        <p style="margin:0;font-size:22px;font-weight:700;color:#f472b6">${data.leads.novos}</p>
        <p style="margin:2px 0 0;font-size:10px;color:#94a3b8">Leads</p>
      </td>
      <td style="width:4px"></td>
      <td style="width:25%;padding:8px;background:#111827;border:1px solid #1e293b;border-radius:8px;text-align:center">
        <p style="margin:0;font-size:22px;font-weight:700;color:#34d399">${formatBRL(receitaTotal)}</p>
        <p style="margin:2px 0 0;font-size:10px;color:#94a3b8">${pedidosTotal} pedidos</p>
      </td>
      <td style="width:4px"></td>
      <td style="width:25%;padding:8px;background:#111827;border:1px solid #1e293b;border-radius:8px;text-align:center">
        <p style="margin:0;font-size:22px;font-weight:700;color:#a78bfa">${emailsEnviados}</p>
        <p style="margin:2px 0 0;font-size:10px;color:#94a3b8">Emails</p>
      </td>
    </tr>
  </table>

  <div style="margin:16px 0;padding:16px;background:#111827;border:1px solid #1e293b;border-radius:8px">
    <p style="margin:0 0 12px;font-size:13px;font-weight:600;color:#fff">Funil de Conversao</p>
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr style="text-align:center;font-size:18px;font-weight:700;color:#e2e8f0">
        <td>${data.site.visitantes_unicos}</td>
        <td style="color:#1e293b">&rarr;</td>
        <td>${data.site.produto_views}</td>
        <td style="color:#1e293b">&rarr;</td>
        <td>${data.site.add_to_cart}</td>
        <td style="color:#1e293b">&rarr;</td>
        <td>${data.site.checkouts}</td>
        <td style="color:#1e293b">&rarr;</td>
        <td>${data.site.compras}</td>
      </tr>
      <tr style="text-align:center;font-size:9px;color:#94a3b8">
        <td>Visitantes</td><td></td><td>Produtos</td><td></td><td>Carrinho</td><td></td><td>Checkout</td><td></td><td>Compras</td>
      </tr>
    </table>
  </div>

  ${topProdHtml ? `
  <div style="margin:16px 0;padding:16px;background:#111827;border:1px solid #1e293b;border-radius:8px">
    <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#fff">Produtos mais vistos</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="font-size:12px;color:#e2e8f0">${topProdHtml}</table>
  </div>` : ""}

  ${topEstHtml ? `
  <div style="margin:16px 0;padding:16px;background:#111827;border:1px solid #1e293b;border-radius:8px">
    <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#fff">Top estados</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="font-size:12px;color:#e2e8f0">${topEstHtml}</table>
  </div>` : ""}

  <div style="margin:16px 0;padding:16px;background:#111827;border:1px solid #1e293b;border-radius:8px">
    <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#fff">Vendas</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="font-size:12px;color:#e2e8f0">
      <tr><td style="padding:4px 8px">NuvemShop</td><td style="padding:4px 8px;text-align:right;font-weight:600">${formatBRL(data.vendas.nuvemshop.receita)}</td><td style="padding:4px 8px;color:#94a3b8">${data.vendas.nuvemshop.pedidos} pedidos</td></tr>
      <tr><td style="padding:4px 8px">Bling</td><td style="padding:4px 8px;text-align:right;font-weight:600">${formatBRL(data.vendas.bling.receita)}</td><td style="padding:4px 8px;color:#94a3b8">${data.vendas.bling.pedidos} pedidos</td></tr>
      <tr><td style="padding:4px 8px">Carrinhos abandonados</td><td colspan="2" style="padding:4px 8px;color:#94a3b8">${data.vendas.carrinhos.detectados} detectados · ${data.vendas.carrinhos.convertidos} convertidos</td></tr>
    </table>
  </div>

  ${leadsHtml ? `
  <div style="margin:16px 0;padding:16px;background:#111827;border:1px solid #1e293b;border-radius:8px">
    <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#fff">Leads recentes</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="font-size:12px;color:#e2e8f0">
      <tr style="color:#94a3b8;font-size:10px"><th style="text-align:left;padding:4px 8px">Nome</th><th style="text-align:left;padding:4px 8px">Email</th><th style="padding:4px 8px">Verificado</th></tr>
      ${leadsHtml}
    </table>
  </div>` : ""}

  ${autoHtml ? `
  <div style="margin:16px 0;padding:16px;background:#111827;border:1px solid #1e293b;border-radius:8px">
    <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#fff">Automações</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="font-size:12px;color:#e2e8f0">
      <tr style="color:#94a3b8;font-size:10px"><th style="text-align:left;padding:4px 8px">Fluxo</th><th style="text-align:left;padding:4px 8px">Status</th><th style="text-align:right;padding:4px 8px">Qtd</th></tr>
      ${autoHtml}
    </table>
  </div>` : ""}

  <div style="text-align:center;padding:20px 0;border-top:1px solid #1e293b;margin-top:16px">
    <a href="${esc(appUrl)}/briefing" style="display:inline-block;padding:10px 24px;background:#8b5cf6;color:#fff;border-radius:8px;text-decoration:none;font-size:13px;font-weight:600">Ver briefing completo</a>
    <p style="margin:12px 0 0;font-size:11px;color:#64748b">Ecossistema Bibelô — Briefing automático diário</p>
  </div>

</div>
</body></html>`;
}

// ── Enviar briefing por email ──────────────────────────────────

export async function enviarBriefingEmail(): Promise<void> {
  const data = await fetchBriefingData(24);
  const html = gerarEmailBriefing(data);
  const hoje = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

  const adminEmail = process.env.ADMIN_EMAIL || "contato@papelariabibelo.com.br";

  await sendEmail({
    to: adminEmail,
    subject: `Briefing BibeloCRM — ${hoje}`,
    html,
    tags: [{ name: "tipo", value: "briefing-diario" }],
  });

  logger.info("Briefing diário enviado por email", { to: adminEmail });
}

// ── GET /api/briefing ──────────────────────────────────────────

briefingRouter.get("/", async (req: Request, res: Response) => {
  const parse = briefingQuerySchema.safeParse(req.query);
  if (!parse.success) {
    res.status(400).json({ error: "Parâmetros inválidos", detalhes: parse.error.errors });
    return;
  }

  try {
    const data = await fetchBriefingData(parse.data.horas);
    res.json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    logger.error("Erro ao gerar briefing", { error: msg });
    res.status(500).json({ error: "Erro ao gerar briefing" });
  }
});

// ── POST /api/briefing/enviar — envio manual por email ─────────

briefingRouter.post("/enviar", async (_req: Request, res: Response) => {
  try {
    await enviarBriefingEmail();
    res.json({ ok: true, message: "Briefing enviado por email" });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    logger.error("Erro ao enviar briefing por email", { error: msg });
    res.status(500).json({ error: "Erro ao enviar briefing" });
  }
});
