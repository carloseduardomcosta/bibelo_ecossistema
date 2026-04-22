import { query, queryOne } from "../db";
import { logger } from "../utils/logger";
import { sendEmail } from "../integrations/resend/email";

function simpleEmailWrapper(content: string): string {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#fdf5f5;font-family:'Jost',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#fdf5f5;padding:32px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
<tr><td style="background:linear-gradient(135deg,#fe68c4,#f472b6);padding:24px 32px;text-align:center;">
  <h1 style="color:#fff;margin:0;font-size:22px;font-weight:700;">Papelaria Bibelô — CRM</h1>
</td></tr>
<tr><td style="padding:32px;">${content}</td></tr>
<tr><td style="background:#fdf5f5;padding:16px 32px;text-align:center;font-size:12px;color:#aaa;">
  BibelôCRM · Timbó/SC · crm.papelariabibelo.com.br
</td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

// ── Tipos ──────────────────────────────────────────────────────────────────────

export type TipoNotificacao =
  | "carrinho_abandonado_alto_valor"
  | "cliente_high_intent"
  | "cliente_vip_inativo"
  | "novo_membro_grupo_vip"
  | "whatsapp_step";

export interface NotificacaoInput {
  tipo: TipoNotificacao;
  customerId: string | null;
  nomeCliente: string;
  telefone?: string | null;
  titulo: string;
  descricao?: string;
  dados?: Record<string, unknown>;
}

// ── Normalizar telefone para whatsapp (55DDDXXXXXXXX) ──────────────────────────

function normalizarWhatsapp(tel: string | null | undefined): string | null {
  if (!tel) return null;
  const digits = tel.replace(/\D/g, "");
  if (digits.length < 10) return null;
  return digits.startsWith("55") ? digits : `55${digits}`;
}

// ── Construir link wa.me com mensagem pré-preenchida ──────────────────────────

function buildWaLink(whatsapp: string, mensagem: string): string {
  return `https://wa.me/${whatsapp}?text=${encodeURIComponent(mensagem)}`;
}

function buildMensagem(tipo: TipoNotificacao, nome: string, dados: Record<string, unknown>): string {
  const n = nome.split(" ")[0] || nome; // primeiro nome

  switch (tipo) {
    case "carrinho_abandonado_alto_valor": {
      const valor = dados.valor ? `R$ ${Number(dados.valor).toFixed(2).replace(".", ",")}` : "";
      const produto = Array.isArray(dados.itens) && dados.itens.length > 0
        ? String((dados.itens[0] as Record<string, unknown>).name || (dados.itens[0] as Record<string, unknown>).nome || "")
        : "";
      return produto
        ? `Oi ${n}! Vi que você deixou o "${produto}"${valor ? ` (${valor})` : ""} no carrinho. Posso ajudar com alguma dúvida? 🎀`
        : `Oi ${n}! Vi que você deixou alguns produtos no carrinho${valor ? ` (${valor})` : ""}. Posso ajudar? 🎀`;
    }

    case "cliente_high_intent": {
      const produto = String(dados.produto_destaque || "");
      return produto
        ? `Oi ${n}! Percebi que você está olhando muito o "${produto}". Tem alguma dúvida que posso tirar? 😊`
        : `Oi ${n}! Vi que você está conferindo vários produtos na nossa loja. Posso ajudar a escolher? 🎀`;
    }

    case "cliente_vip_inativo": {
      const dias = Number(dados.dias_sem_compra) || 0;
      return `Oi ${n}! Sentimos sua falta! Faz ${dias} dias da sua última visita e temos novidades incríveis esperando por você no Clube VIP 🎀`;
    }

    case "novo_membro_grupo_vip":
      return `Oi ${n}! Seja muito bem-vinda ao Clube VIP Bibelô! 🎀 Que bom ter você com a gente. Qualquer dúvida estou aqui!`;

    case "whatsapp_step": {
      const template = String(dados.template || "");
      return template
        ? `Oi ${n}! Passando para${template ? ` falar sobre "${template}"` : " um recado especial"} 🎀`
        : `Oi ${n}! Temos um recado especial para você 🎀`;
    }

    default:
      return `Oi ${n}! Temos uma mensagem especial para você da Papelaria Bibelô 🎀`;
  }
}

// ── createNotificacaoOperador ─────────────────────────────────────────────────

export async function createNotificacaoOperador(input: NotificacaoInput): Promise<string | null> {
  const { tipo, customerId, nomeCliente, telefone, titulo, descricao, dados = {} } = input;
  const whatsapp = normalizarWhatsapp(telefone);
  const linkDireto = whatsapp ? buildWaLink(whatsapp, buildMensagem(tipo, nomeCliente, dados)) : null;

  try {
    const row = await queryOne<{ id: string }>(
      `INSERT INTO crm.notificacoes_operador
         (tipo, customer_id, titulo, descricao, dados, whatsapp, link_direto, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pendente')
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [tipo, customerId, titulo, descricao || null, JSON.stringify(dados), whatsapp, linkDireto],
    );

    if (!row) {
      // Já existe notificação pendente do mesmo tipo para este cliente — ignorado silenciosamente
      return null;
    }

    logger.info("Notificação operador criada", { tipo, customerId, id: row.id });
    return row.id;
  } catch (err: unknown) {
    logger.error("Erro ao criar notificação operador", {
      tipo, customerId, error: err instanceof Error ? err.message : "Erro",
    });
    return null;
  }
}

// ── checkHighIntentClients ────────────────────────────────────────────────────
// Clientes que viram 4+ produtos distintos em 48h sem comprar.
// Roda a cada 6h. Índice parcial garante dedup.

export async function checkHighIntentClients(): Promise<number> {
  const candidates = await query<{
    customer_id: string;
    nome: string;
    telefone: string | null;
    email: string | null;
    produtos: number;
    produto_destaque: string;
    preco_destaque: number;
  }>(`
    SELECT
      c.id          AS customer_id,
      c.nome,
      c.telefone,
      c.email,
      COUNT(DISTINCT t.resource_id)::int         AS produtos,
      MAX(t.resource_nome) FILTER (
        WHERE t.resource_preco = (
          SELECT MAX(t2.resource_preco) FROM crm.tracking_events t2
          WHERE t2.customer_id = c.id AND t2.evento = 'product_view'
            AND t2.criado_em >= NOW() - INTERVAL '48 hours'
        )
      )                                          AS produto_destaque,
      MAX(t.resource_preco)::float               AS preco_destaque
    FROM crm.tracking_events t
    JOIN crm.customers c ON c.id = t.customer_id
    WHERE t.evento = 'product_view'
      AND t.customer_id IS NOT NULL
      AND t.resource_id IS NOT NULL
      AND t.criado_em >= NOW() - INTERVAL '48 hours'
      -- Não comprou recentemente
      AND NOT EXISTS (
        SELECT 1 FROM crm.order_items oi
        WHERE oi.customer_id = t.customer_id
          AND oi.criado_em >= NOW() - INTERVAL '48 hours'
      )
      -- Não existe notificação pendente deste tipo para o cliente
      AND NOT EXISTS (
        SELECT 1 FROM crm.notificacoes_operador no2
        WHERE no2.tipo = 'cliente_high_intent'
          AND no2.customer_id = c.id
          AND no2.status = 'pendente'
      )
    GROUP BY c.id, c.nome, c.telefone, c.email
    HAVING COUNT(DISTINCT t.resource_id) >= 4
    ORDER BY COUNT(DISTINCT t.resource_id) DESC
    LIMIT 30
  `);

  let criadas = 0;

  for (const c of candidates) {
    const id = await createNotificacaoOperador({
      tipo: "cliente_high_intent",
      customerId: c.customer_id,
      nomeCliente: c.nome,
      telefone: c.telefone,
      titulo: `🔥 ${c.nome} viu ${c.produtos} produtos nas últimas 48h`,
      descricao: c.produto_destaque
        ? `Produto em destaque: ${c.produto_destaque}${c.preco_destaque ? ` — R$ ${c.preco_destaque.toFixed(2).replace(".", ",")}` : ""}`
        : undefined,
      dados: {
        produtos_vistos: c.produtos,
        produto_destaque: c.produto_destaque || null,
        preco_destaque: c.preco_destaque || null,
        email: c.email,
      },
    });
    if (id) criadas++;
  }

  if (criadas > 0) logger.info("High intent detectado", { total: candidates.length, criadas });
  return criadas;
}

// ── checkVipInactivos ─────────────────────────────────────────────────────────
// VIPs (vip_grupo_wp = true) sem compra há 60+ dias.
// Roda 1x/dia às 08:45 BRT (11:45 UTC).

export async function checkVipInactivos(): Promise<number> {
  const candidates = await query<{
    customer_id: string;
    nome: string;
    telefone: string | null;
    email: string | null;
    dias_sem_compra: number;
    ultima_compra_valor: number | null;
  }>(`
    SELECT
      c.id          AS customer_id,
      c.nome,
      c.telefone,
      c.email,
      EXTRACT(DAY FROM NOW() - MAX(oi.criado_em))::int  AS dias_sem_compra,
      SUM(oi.valor_total)::float                         AS ultima_compra_valor
    FROM crm.customers c
    LEFT JOIN crm.order_items oi ON oi.customer_id = c.id
    WHERE c.vip_grupo_wp = true
      AND c.telefone IS NOT NULL
      -- Não existe notificação pendente deste tipo para o cliente
      AND NOT EXISTS (
        SELECT 1 FROM crm.notificacoes_operador no2
        WHERE no2.tipo = 'cliente_vip_inativo'
          AND no2.customer_id = c.id
          AND no2.status = 'pendente'
      )
    GROUP BY c.id, c.nome, c.telefone, c.email
    HAVING MAX(oi.criado_em) IS NULL
        OR EXTRACT(DAY FROM NOW() - MAX(oi.criado_em)) >= 60
    ORDER BY EXTRACT(DAY FROM NOW() - MAX(oi.criado_em)) DESC NULLS LAST
    LIMIT 30
  `);

  let criadas = 0;

  for (const c of candidates) {
    const dias = c.dias_sem_compra ?? 999;
    const id = await createNotificacaoOperador({
      tipo: "cliente_vip_inativo",
      customerId: c.customer_id,
      nomeCliente: c.nome,
      telefone: c.telefone,
      titulo: `👑 VIP inativa há ${dias} dias — ${c.nome}`,
      descricao: c.ultima_compra_valor
        ? `Última compra: R$ ${c.ultima_compra_valor.toFixed(2).replace(".", ",")}`
        : "Nunca comprou na loja online",
      dados: {
        dias_sem_compra: dias,
        ultima_compra_valor: c.ultima_compra_valor || null,
        email: c.email,
      },
    });
    if (id) criadas++;
  }

  if (criadas > 0) logger.info("VIPs inativos detectados", { total: candidates.length, criadas });
  return criadas;
}

// ── sendOperatorDailySummary ──────────────────────────────────────────────────
// Email de resumo diário às 9h BRT com links wa.me clicáveis.

export async function sendOperatorDailySummary(): Promise<void> {
  const pendentes = await query<{
    id: string; tipo: TipoNotificacao; titulo: string; descricao: string | null;
    link_direto: string | null; created_at: string;
  }>(
    `SELECT id, tipo, titulo, descricao, link_direto, created_at
     FROM crm.notificacoes_operador
     WHERE status = 'pendente'
     ORDER BY tipo, created_at DESC`
  );

  if (pendentes.length === 0) {
    logger.info("Resumo operador: nenhuma notificação pendente — email não enviado");
    return;
  }

  const grupos: Record<string, typeof pendentes> = {
    carrinho_abandonado_alto_valor: [],
    cliente_high_intent: [],
    cliente_vip_inativo: [],
    novo_membro_grupo_vip: [],
    whatsapp_step: [],
  };

  for (const n of pendentes) {
    (grupos[n.tipo] || (grupos["whatsapp_step"] as typeof pendentes)).push(n);
  }

  function renderSecao(emoji: string, titulo: string, items: typeof pendentes): string {
    if (items.length === 0) return "";
    const linhas = items.map((n) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #f3e3e3;font-size:14px;color:#333;">
          ${n.titulo}
          ${n.descricao ? `<br><span style="font-size:12px;color:#888;">${n.descricao}</span>` : ""}
        </td>
        <td style="padding:8px 12px;border-bottom:1px solid #f3e3e3;text-align:right;white-space:nowrap;">
          ${n.link_direto
            ? `<a href="${n.link_direto}" style="background:#25D366;color:#fff;padding:6px 14px;border-radius:20px;text-decoration:none;font-size:12px;font-weight:600;">📲 Enviar WA</a>`
            : `<span style="color:#bbb;font-size:12px;">Sem telefone</span>`
          }
        </td>
      </tr>`).join("");

    return `
      <h3 style="color:#fe68c4;margin:24px 0 8px;">${emoji} ${titulo} <span style="font-size:14px;color:#aaa;">(${items.length})</span></h3>
      <table style="width:100%;border-collapse:collapse;background:#fff;border-radius:8px;overflow:hidden;border:1px solid #f3e3e3;">
        ${linhas}
      </table>`;
  }

  const corpo = [
    renderSecao("🛒", "Carrinhos abandonados (valor alto)", grupos.carrinho_abandonado_alto_valor),
    renderSecao("🔥", "Clientes com alto interesse", grupos.cliente_high_intent),
    renderSecao("👑", "VIPs inativas", grupos.cliente_vip_inativo),
    renderSecao("💎", "Novos membros do grupo VIP identificados", grupos.novo_membro_grupo_vip),
    renderSecao("💬", "Steps de WhatsApp em fluxos", grupos.whatsapp_step),
  ].filter(Boolean).join("\n");

  const hoje = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });

  const html = simpleEmailWrapper(`
    <p style="font-size:16px;color:#333;">
      Bom dia, Carlos! Aqui está o resumo das notificações pendentes de hoje.
    </p>
    <p style="font-size:14px;color:#888;margin-bottom:4px;">${hoje} — ${pendentes.length} ação${pendentes.length !== 1 ? "ões" : ""} pendente${pendentes.length !== 1 ? "s" : ""}</p>
    ${corpo}
    <p style="font-size:13px;color:#aaa;margin-top:24px;">
      Clique em "Enviar WA" para abrir o WhatsApp com a mensagem pré-preenchida.<br>
      Após enviar, marque como <em>enviado</em> no painel do CRM.
    </p>
  `);

  await sendEmail({
    to: process.env.ADMIN_EMAIL || "contato@papelariabibelo.com.br",
    subject: `📋 Resumo CRM — ${pendentes.length} ação${pendentes.length !== 1 ? "ões" : ""} pendente${pendentes.length !== 1 ? "s" : ""}`,
    html,
  });

  logger.info("Resumo operador enviado", { pendentes: pendentes.length });
}
