import { Router, Request, Response } from "express";
import { z } from "zod";
import { query, queryOne } from "../db";
import { authMiddleware } from "../middleware/auth";
import { logger } from "../utils/logger";
import { sendCampaignEmails, sendEmail, isResendConfigured, getResendStatus } from "../integrations/resend/email";

export const campaignsRouter = Router();
campaignsRouter.use(authMiddleware);

// ── Schemas ─────────────────────────────────────────────────────

const createSchema = z.object({
  nome: z.string().min(2).max(255),
  canal: z.enum(["email", "whatsapp"]),
  template_id: z.string().uuid().optional(),
  segment_id: z.string().uuid().optional(),
  agendado_em: z.string().datetime().optional(),
});

const updateSchema = createSchema.partial().extend({
  status: z.enum(["rascunho", "agendada", "pausada"]).optional(),
});

const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.string().optional(),
  canal: z.string().optional(),
});

// ── GET /api/campaigns — lista paginada ─────────────────────────

campaignsRouter.get("/", async (req: Request, res: Response) => {
  const parse = listSchema.safeParse(req.query);
  if (!parse.success) {
    res.status(400).json({ error: "Parâmetros inválidos", detalhes: parse.error.errors });
    return;
  }

  const { page, limit, status, canal } = parse.data;
  const offset = (page - 1) * limit;

  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (status) {
    conditions.push(`c.status = $${idx}`);
    params.push(status);
    idx++;
  }
  if (canal) {
    conditions.push(`c.canal = $${idx}`);
    params.push(canal);
    idx++;
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const countResult = await queryOne<{ total: string }>(
    `SELECT COUNT(*)::text AS total FROM marketing.campaigns c ${where}`,
    params
  );
  const total = parseInt(countResult?.total || "0", 10);

  params.push(limit, offset);
  const rows = await query(
    `SELECT c.*, t.nome AS template_nome, s.nome AS segment_nome
     FROM marketing.campaigns c
     LEFT JOIN marketing.templates t ON t.id = c.template_id
     LEFT JOIN crm.segments s ON s.id = c.segment_id
     ${where}
     ORDER BY c.criado_em DESC
     LIMIT $${idx} OFFSET $${idx + 1}`,
    params
  );

  res.json({
    data: rows,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

// ── GET /api/campaigns/resend-status — status da integração ─────

campaignsRouter.get("/resend-status", async (_req: Request, res: Response) => {
  const status = await getResendStatus();
  res.json(status);
});

// ── GET /api/campaigns/gerar-novidades — template dinâmico com produtos novos ──

campaignsRouter.get("/gerar-novidades", async (req: Request, res: Response) => {
  const dias = Math.min(Number(req.query.dias) || 30, 90);
  const limite = Math.min(Number(req.query.limite) || 8, 20);
  const linkBase = (req.query.link_base as string) || "https://www.papelariabibelo.com.br/novidades/";

  // Buscar itens de NFs recentes + cruzar com catálogo (preço + imagem)
  const produtos = await query<{
    descricao: string; valor_unitario: string;
    preco_venda: string | null; categoria: string | null;
    imagem_url: string | null; bling_id: string | null;
  }>(`
    WITH itens_nf AS (
      SELECT DISTINCT ON (LOWER(ni.descricao))
        ni.descricao,
        ni.valor_unitario,
        ni.codigo_produto,
        ne.data_emissao
      FROM financeiro.notas_entrada_itens ni
      JOIN financeiro.notas_entrada ne ON ne.id = ni.nota_id
      WHERE ne.status != 'cancelada'
        AND ne.data_emissao >= CURRENT_DATE - INTERVAL '${dias} days'
      ORDER BY LOWER(ni.descricao), ne.data_emissao DESC
    )
    SELECT
      i.descricao,
      i.valor_unitario::text,
      bp.preco_venda::text,
      bp.categoria,
      bp.dados_raw->>'imagemURL' as imagem_url,
      bp.bling_id
    FROM itens_nf i
    LEFT JOIN LATERAL (
      SELECT p.preco_venda, p.categoria, p.dados_raw, p.bling_id
      FROM sync.bling_products p
      WHERE LOWER(p.nome) LIKE '%' || LOWER(SUBSTRING(i.descricao FROM 1 FOR 20)) || '%'
        OR p.sku = i.codigo_produto
      ORDER BY CASE WHEN p.dados_raw->>'imagemURL' != '' THEN 0 ELSE 1 END
      LIMIT 1
    ) bp ON true
    ORDER BY i.data_emissao DESC
    LIMIT $1
  `, [limite]);

  if (produtos.length === 0) {
    res.json({ html: "", produtos: 0, message: "Nenhum produto novo encontrado no período" });
    return;
  }

  // Gerar HTML dos produtos com imagem e link
  const produtosHtml = produtos.map((p) => {
    const preco = p.preco_venda ? parseFloat(p.preco_venda) : null;
    const precoFormatado = preco ? `R$ ${preco.toFixed(2).replace(".", ",")}` : "";
    const nome = p.descricao.split(" C/")[0].split(" CART.")[0].trim();
    const hasImg = p.imagem_url && p.imagem_url.startsWith("http");
    const imgHtml = hasImg
      ? `<img src="${p.imagem_url}" alt="${nome}" style="width:70px;height:70px;object-fit:cover;border-radius:8px;border:1px solid #eee" />`
      : `<div style="width:70px;height:70px;background:#FFF0F5;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:28px;border:1px solid #eee">🎀</div>`;
    const link = linkBase;

    return `<a href="${link}" style="text-decoration:none;display:flex;align-items:center;gap:12px;background:#fff;border:1px solid #f0e0f0;border-radius:10px;padding:10px;margin:8px 0">${imgHtml}<div style="flex:1;min-width:0"><p style="margin:0;color:#E91E8C;font-weight:bold;font-size:13px;line-height:1.3">${nome}</p>${p.categoria ? `<p style="margin:3px 0 0;color:#999;font-size:11px">${p.categoria}</p>` : ""}</div>${precoFormatado ? `<div style="text-align:right;white-space:nowrap"><p style="margin:0;color:#333;font-weight:bold;font-size:15px">${precoFormatado}</p><p style="margin:2px 0 0;color:#E91E8C;font-size:10px;font-weight:bold">VER →</p></div>` : ""}</a>`;
  }).join("");

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#FFF0F5;font-family:Arial,Helvetica,sans-serif"><div style="max-width:600px;margin:0 auto;background:#ffffff"><div style="background:linear-gradient(135deg,#E91E8C,#FF69B4);padding:25px 20px;text-align:center"><a href="https://www.papelariabibelo.com.br" target="_blank" style="text-decoration:none"><img src="https://crm.papelariabibelo.com.br/logo.png" alt="Papelaria Bibelô" style="width:80px;height:80px;border-radius:50%;border:3px solid #fff" /></a><h1 style="color:#fff;font-size:20px;margin:10px 0 0">Chegou Novidade! 🆕</h1><p style="color:#FFE4E1;font-size:13px;margin:5px 0 0">Produtos fresquinhos acabaram de chegar</p></div><div style="padding:25px"><p style="color:#333;font-size:15px;line-height:1.6">Oi, {{nome}}! 👋</p><p style="color:#333;font-size:15px;line-height:1.6">Produtos novos acabaram de chegar na Bibelô e separamos os destaques para você:</p><div style="margin:15px 0">${produtosHtml}</div><a href="${linkBase}" style="display:block;background:#E91E8C;color:#fff;padding:14px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:15px;text-align:center;margin:20px 0">Ver Todas as Novidades</a></div><div style="background:#F8F8F8;padding:20px 25px;border-top:1px solid #eee"><p style="color:#999;font-size:11px;text-align:center;margin:0;line-height:1.5">Papelaria Bibelô — CNPJ 63.961.764/0001-63<br>contato@papelariabibelo.com.br<br>papelariabibelo.com.br<br><br>Você recebeu este email porque é cliente da Papelaria Bibelô.<br>Se não deseja mais receber nossos emails, responda com "DESCADASTRAR".</p></div></div></body></html>`;

  res.json({
    html,
    assunto: `🆕 Novidades acabaram de chegar na Bibelô!`,
    produtos: produtos.length,
    message: `Template gerado com ${produtos.length} produtos dos últimos ${dias} dias`,
  });
});

// ── POST /api/campaigns/test-email — enviar email de teste ──────

const testEmailSchema = z.object({
  to: z.string().email(),
  subject: z.string().min(1).default("Teste BibelôCRM"),
  html: z.string().min(1).default("<h1>Olá!</h1><p>Este é um email de teste do BibelôCRM.</p><p>Se você recebeu, a integração está funcionando! 🎀</p>"),
});

campaignsRouter.post("/test-email", async (req: Request, res: Response) => {
  if (!isResendConfigured()) {
    res.status(400).json({ error: "Resend não configurado" });
    return;
  }

  const parse = testEmailSchema.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: "Dados inválidos" }); return; }

  try {
    const result = await sendEmail({
      to: parse.data.to,
      subject: parse.data.subject,
      html: parse.data.html,
    });
    logger.info("Email de teste enviado", { to: parse.data.to, user: req.user?.email });
    res.json({ message: "Email de teste enviado", resend_id: result?.id });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro ao enviar";
    res.status(500).json({ error: msg });
  }
});

// ── GET /api/campaigns/:id — detalhes ───────────────────────────

campaignsRouter.get("/:id", async (req: Request, res: Response) => {
  const campaign = await queryOne(
    `SELECT c.*, t.nome AS template_nome, s.nome AS segment_nome
     FROM marketing.campaigns c
     LEFT JOIN marketing.templates t ON t.id = c.template_id
     LEFT JOIN crm.segments s ON s.id = c.segment_id
     WHERE c.id = $1`,
    [req.params.id]
  );

  if (!campaign) {
    res.status(404).json({ error: "Campanha não encontrada" });
    return;
  }

  const sends = await query(
    `SELECT status, COUNT(*)::text AS total
     FROM marketing.campaign_sends
     WHERE campaign_id = $1
     GROUP BY status`,
    [req.params.id]
  );

  res.json({ ...campaign, sends_por_status: sends });
});

// ── POST /api/campaigns — criar ─────────────────────────────────

campaignsRouter.post("/", async (req: Request, res: Response) => {
  const parse = createSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: "Dados inválidos", detalhes: parse.error.errors });
    return;
  }

  const { nome, canal, template_id, segment_id, agendado_em } = parse.data;
  const status = agendado_em ? "agendada" : "rascunho";

  const campaign = await queryOne(
    `INSERT INTO marketing.campaigns (nome, canal, template_id, segment_id, status, agendado_em)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [nome, canal, template_id || null, segment_id || null, status, agendado_em || null]
  );

  logger.info("Campanha criada", { id: (campaign as { id: string }).id, nome, user: req.user?.email });
  res.status(201).json(campaign);
});

// ── PUT /api/campaigns/:id — atualizar ──────────────────────────

campaignsRouter.put("/:id", async (req: Request, res: Response) => {
  const parse = updateSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: "Dados inválidos", detalhes: parse.error.errors });
    return;
  }

  const existing = await queryOne<{ id: string; status: string }>(
    "SELECT id, status FROM marketing.campaigns WHERE id = $1",
    [req.params.id]
  );

  if (!existing) {
    res.status(404).json({ error: "Campanha não encontrada" });
    return;
  }

  if (existing.status === "enviando" || existing.status === "concluida") {
    res.status(400).json({ error: `Não é possível editar campanha com status "${existing.status}"` });
    return;
  }

  const entries = Object.entries(parse.data).filter(([, v]) => v !== undefined);
  if (entries.length === 0) {
    res.status(400).json({ error: "Nenhum campo para atualizar" });
    return;
  }

  const sets = entries.map(([k], i) => `${k} = $${i + 1}`);
  const values = entries.map(([, v]) => v);
  values.push(req.params.id);

  const updated = await queryOne(
    `UPDATE marketing.campaigns SET ${sets.join(", ")}, atualizado_em = NOW()
     WHERE id = $${values.length} RETURNING *`,
    values
  );

  logger.info("Campanha atualizada", { id: req.params.id, user: req.user?.email });
  res.json(updated);
});

// ── POST /api/campaigns/:id/send — disparar campanha ────────────

campaignsRouter.post("/:id/send", async (req: Request, res: Response) => {
  const campaign = await queryOne<{
    id: string; status: string; canal: string;
    template_id: string | null; segment_id: string | null;
  }>(
    "SELECT id, status, canal, template_id, segment_id FROM marketing.campaigns WHERE id = $1",
    [req.params.id]
  );

  if (!campaign) {
    res.status(404).json({ error: "Campanha não encontrada" });
    return;
  }

  if (campaign.status !== "rascunho" && campaign.status !== "agendada") {
    res.status(400).json({ error: `Campanha com status "${campaign.status}" não pode ser disparada` });
    return;
  }

  if (!campaign.template_id) {
    res.status(400).json({ error: "Campanha precisa de um template antes de disparar" });
    return;
  }

  // Busca clientes do segmento (ou todos ativos se sem segmento)
  let customers: { id: string }[];
  if (campaign.segment_id) {
    customers = await query<{ id: string }>(
      `SELECT c.id FROM crm.customers c
       JOIN crm.customer_scores cs ON cs.customer_id = c.id
       JOIN crm.segments s ON s.id = $1
       WHERE c.ativo = true AND cs.segmento = s.nome`,
      [campaign.segment_id]
    );
  } else {
    customers = await query<{ id: string }>(
      "SELECT id FROM crm.customers WHERE ativo = true"
    );
  }

  if (customers.length === 0) {
    res.status(400).json({ error: "Nenhum cliente encontrado para esta campanha" });
    return;
  }

  // Cria registros de envio
  const values = customers.map((_, i) => `($1, $${i + 2}, 'pendente')`).join(", ");
  const params = [campaign.id, ...customers.map((c) => c.id)];

  await query(
    `INSERT INTO marketing.campaign_sends (campaign_id, customer_id, status)
     VALUES ${values}
     ON CONFLICT (campaign_id, customer_id) DO NOTHING`,
    params
  );

  // Atualiza status da campanha
  await query(
    `UPDATE marketing.campaigns
     SET status = 'enviando', enviado_em = NOW(), total_envios = $2, atualizado_em = NOW()
     WHERE id = $1`,
    [campaign.id, customers.length]
  );

  logger.info("Campanha disparada", {
    id: campaign.id,
    canal: campaign.canal,
    total: customers.length,
    user: req.user?.email,
  });

  // Disparo real via Resend (email) — síncrono para volumes baixos
  if (campaign.canal === "email") {
    if (!isResendConfigured()) {
      res.status(400).json({ error: "Resend não configurado. Adicione RESEND_API_KEY no .env" });
      return;
    }

    // Dispara em background (não bloqueia resposta)
    sendCampaignEmails(campaign.id).catch((err) => {
      logger.error("Erro no disparo de campanha", { campaignId: campaign.id, error: err.message });
    });
  }

  res.json({
    message: campaign.canal === "email" ? "Campanha de email em envio" : "Campanha criada (WhatsApp pendente de integração)",
    total_envios: customers.length,
  });
});

