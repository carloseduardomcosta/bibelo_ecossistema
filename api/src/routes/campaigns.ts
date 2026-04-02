import { Router, Request, Response } from "express";
import { z } from "zod";
import { query, queryOne, db } from "../db";
import { authMiddleware } from "../middleware/auth";
import { logger } from "../utils/logger";
import { sendCampaignEmails, sendEmail, isResendConfigured, getResendStatus } from "../integrations/resend/email";
import { gerarLinkDescadastro, proxyImageUrl } from "./email";

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
// Inteligência: filtra esgotados, expande período se poucos, adapta layout ao volume

campaignsRouter.get("/gerar-novidades", async (req: Request, res: Response) => {
  const diasPedido = Math.min(Number(req.query.dias) || 7, 90);
  const limite = Math.min(Number(req.query.limite) || 30, 50);
  const minProdutos = Math.min(Number(req.query.min) || 3, limite);
  const linkBase = "https://www.papelariabibelo.com.br";

  // Query que filtra esgotados e prioriza produtos com imagem HD + URL real
  async function buscarProdutos(dias: number, lim: number) {
    return query<{
      descricao: string; valor_unitario: string;
      preco_venda: string | null; categoria: string | null;
      imagem_url: string | null; bling_id: string | null;
      estoque_bling: number | null; estoque_ns: number | null;
      ns_imagem: string | null; ns_url: string | null;
      ns_nome: string | null;
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
          AND ne.data_emissao >= CURRENT_DATE - make_interval(days => $2)
        ORDER BY LOWER(ni.descricao), ne.data_emissao DESC
      )
      SELECT
        i.descricao,
        i.valor_unitario::text,
        bp.preco_venda::text,
        bp.categoria,
        bp.dados_raw->>'imagemURL' as imagem_url,
        bp.bling_id,
        (bp.dados_raw->'estoque'->>'saldoVirtualTotal')::int as estoque_bling,
        ns.estoque::int as estoque_ns,
        ns.imagens->>0 as ns_imagem,
        ns.dados_raw->>'canonical_url' as ns_url,
        ns.nome as ns_nome
      FROM itens_nf i
      LEFT JOIN LATERAL (
        SELECT p.preco_venda, p.categoria, p.dados_raw, p.bling_id, p.sku
        FROM sync.bling_products p
        WHERE LOWER(p.nome) LIKE '%' || LOWER(SUBSTRING(i.descricao FROM 1 FOR 20)) || '%'
          OR p.sku = i.codigo_produto
        ORDER BY CASE WHEN p.dados_raw->>'imagemURL' <> '' THEN 0 ELSE 1 END
        LIMIT 1
      ) bp ON true
      LEFT JOIN LATERAL (
        SELECT np.imagens, np.dados_raw, np.estoque, np.nome
        FROM sync.nuvemshop_products np
        WHERE np.sku = bp.sku
          OR LOWER(np.nome) LIKE '%' || LOWER(SUBSTRING(i.descricao FROM 1 FOR 15)) || '%'
        LIMIT 1
      ) ns ON true
      WHERE
        -- Filtra esgotados: precisa ter estoque > 0 em pelo menos uma fonte
        (
          (ns.estoque IS NOT NULL AND ns.estoque > 0)
          OR (ns.estoque IS NULL AND (bp.dados_raw->'estoque'->>'saldoVirtualTotal')::int > 0)
          OR (ns.estoque IS NULL AND (bp.dados_raw->'estoque'->>'saldoVirtualTotal') IS NULL)
        )
      ORDER BY
        -- Prioridade: com imagem NS > com imagem Bling > sem imagem
        CASE WHEN ns.imagens->>0 IS NOT NULL THEN 0
             WHEN bp.dados_raw->>'imagemURL' <> '' THEN 1
             ELSE 2 END,
        -- Depois: mais estoque primeiro (não mostrar quase esgotando no topo)
        COALESCE(ns.estoque, (bp.dados_raw->'estoque'->>'saldoVirtualTotal')::int, 0) DESC,
        i.data_emissao DESC
      LIMIT $1
    `, [lim, dias]);
  }

  // Expansão automática: se poucos produtos no período, amplia até 60 dias
  let produtos = await buscarProdutos(diasPedido, limite);
  let diasUsado = diasPedido;

  if (produtos.length < minProdutos && diasPedido < 60) {
    const expansoes = [14, 21, 30, 45, 60].filter(d => d > diasPedido);
    for (const d of expansoes) {
      produtos = await buscarProdutos(d, limite);
      diasUsado = d;
      if (produtos.length >= minProdutos) break;
    }
  }

  if (produtos.length === 0) {
    res.json({ html: "", produtos: 0, message: "Nenhum produto novo com estoque encontrado" });
    return;
  }

  // Agrupa categorias para o subject line
  const categorias = [...new Set(produtos.map(p => p.categoria).filter(Boolean))];
  const categoriasResumo = categorias.length > 0
    ? categorias.slice(0, 2).join(", ") + (categorias.length > 2 ? " e mais" : "")
    : "novidades";

  // Limpa nome do produto (remove sufixos de NF, usa nome NS quando disponível)
  function limparNome(p: { descricao: string; ns_nome: string | null }): string {
    // Nome da NuvemShop é mais limpo e é o que o cliente vê na loja
    if (p.ns_nome) return p.ns_nome;
    return p.descricao
      .split(" C/")[0]
      .split(" CART.")[0]
      .replace(/\s+miolo:.*$/i, "")
      .replace(/\s+folhas?\s+decorad.*$/i, "")
      .replace(/\s+Cor:.*$/i, "")
      .trim();
  }

  // Estoque efetivo (NuvemShop > Bling)
  function estoqueEfetivo(p: { estoque_bling: number | null; estoque_ns: number | null }): number | null {
    return p.estoque_ns ?? p.estoque_bling ?? null;
  }

  // ── Layout adaptativo ao volume de produtos ─────────────────
  // 1-2: hero (1col grande), 3-6: medio (2col), 7+: catalogo moderno (2col compacto)
  const qtd = produtos.length;
  const layout = qtd <= 2 ? "hero" : qtd <= 6 ? "medio" : "catalogo";

  // Gera card individual — tamanho e detalhes adaptam ao layout
  const produtosHtml = produtos.map((p, idx) => {
    const preco = p.preco_venda ? parseFloat(p.preco_venda) : null;
    const precoFormatado = preco ? `R$ ${preco.toFixed(2).replace(".", ",")}` : "";
    const nome = limparNome(p);
    const est = estoqueEfetivo(p);
    const estoqueBaixo = est !== null && est > 0 && est <= 3;

    const rawImgSrc = p.ns_imagem || (p.imagem_url && p.imagem_url.startsWith("http") ? p.imagem_url : null);
    const imgSrc = rawImgSrc ? proxyImageUrl(rawImgSrc) : null;
    const link = p.ns_url || `${linkBase}/novidades/`;

    if (layout === "catalogo") {
      // Card moderno 2-col: imagem quadrada + nome + preço + link sutil
      const imgBlock = imgSrc
        ? `<img src="${imgSrc}" alt="${nome}" width="248" style="width:100%;height:auto;aspect-ratio:1;object-fit:cover;display:block;" />`
        : `<div style="width:100%;aspect-ratio:1;background:linear-gradient(135deg,#ffe5ec,#fff7c1);display:flex;align-items:center;justify-content:center;font-size:36px;">🎀</div>`;

      return `
      <div style="display:inline-block;vertical-align:top;width:50%;max-width:268px;padding:6px;box-sizing:border-box;">
        <a href="${link}" style="text-decoration:none;display:block;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 6px rgba(0,0,0,0.06);border:1px solid #f5f0f2;">
          <div style="position:relative;overflow:hidden;">
            ${imgBlock}
            ${estoqueBaixo ? `<span style="position:absolute;top:6px;right:6px;background:#ff4444;color:#fff;font-size:9px;font-weight:700;padding:2px 6px;border-radius:10px;">Ultimas ${est}!</span>` : ""}
          </div>
          <div style="padding:10px 12px 12px;">
            <p style="margin:0 0 6px;color:#333;font-weight:600;font-size:12px;line-height:1.3;min-height:32px;">${nome}</p>
            <div style="display:flex;align-items:center;justify-content:space-between;">
              ${precoFormatado ? `<span style="color:#222;font-weight:800;font-size:15px;">${precoFormatado}</span>` : ""}
              <span style="color:#fe68c4;font-size:11px;font-weight:700;">Ver &rarr;</span>
            </div>
          </div>
        </a>
      </div>`;
    }

    // Hero e medio: imagem grande, botão, badge, categoria
    const maxW = layout === "hero" ? "500" : "260";
    const imgBlock = imgSrc
      ? `<img src="${imgSrc}" alt="${nome}" width="${maxW}" style="width:100%;max-width:${maxW}px;height:auto;aspect-ratio:1;object-fit:cover;border-radius:12px 12px 0 0;display:block;margin:0 auto;" />`
      : `<div style="width:100%;max-width:${maxW}px;height:200px;background:linear-gradient(135deg,#ffe5ec,#fff7c1);border-radius:12px 12px 0 0;display:flex;align-items:center;justify-content:center;font-size:48px;margin:0 auto;">🎀</div>`;

    const badgeHtml = estoqueBaixo
      ? `<span style="position:absolute;top:10px;left:10px;background:#ff4444;color:#fff;font-size:10px;font-weight:700;padding:4px 10px;border-radius:10px;">Ultimas ${est}!</span>`
      : `<span style="position:absolute;top:10px;left:10px;background:#fe68c4;color:#fff;font-size:10px;font-weight:700;padding:4px 10px;border-radius:10px;">Novo</span>`;

    const fontSize = layout === "hero"
      ? { nome: "18px", preco: "22px", btn: "15px" }
      : { nome: "14px", preco: "18px", btn: "13px" };

    return `
    <!--[if mso]><td valign="top" width="${maxW}" style="width:${maxW}px;padding:8px;"><![endif]-->
    <div style="display:inline-block;vertical-align:top;width:100%;max-width:${maxW}px;padding:8px;box-sizing:border-box;">
      <a href="${link}" style="text-decoration:none;display:block;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.06);border:1px solid #f5f0f2;">
        <div style="position:relative;">
          ${imgBlock}
          ${badgeHtml}
        </div>
        <div style="padding:16px 18px 18px;">
          ${p.categoria ? `<p style="margin:0 0 4px;color:#fe68c4;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">${p.categoria}</p>` : ""}
          <p style="margin:0 0 8px;color:#333;font-weight:700;font-size:${fontSize.nome};line-height:1.3;">${nome}</p>
          ${precoFormatado ? `<p style="margin:0 0 14px;color:#222;font-weight:800;font-size:${fontSize.preco};">${precoFormatado}</p>` : ""}
          <div style="background:#fe68c4;color:#fff;padding:11px 16px;border-radius:10px;text-align:center;font-weight:700;font-size:${fontSize.btn};">
            Quero este!
          </div>
        </div>
      </a>
    </div>
    <!--[if mso]></td><![endif]-->`;
  }).join("");

  // WhatsApp CTA
  const whatsappMsg = encodeURIComponent("Oi! Vi as novidades no email e quero saber mais!");
  const whatsappBaseUrl = process.env.WEBHOOK_BASE_URL || "https://webhook.papelariabibelo.com.br";
  const whatsappUrl = `${whatsappBaseUrl}/api/email/wa?text=${whatsappMsg}`;

  // Textos adaptativos ao volume
  const saudacao = qtd === 1
    ? `Tem um produto especial que acabou de chegar e e a sua cara:`
    : qtd <= 3
    ? `Acabaram de chegar <strong>${qtd} novidades</strong> na Bibelo e separamos pra voce:`
    : `Toda semana a Bibelo recebe produtos novos e separamos <strong>${qtd} destaques</strong> especialmente pra voce. Olha so o que chegou:`;

  const tituloHeader = qtd === 1 ? "Novidade Especial" :
                       qtd <= 3 ? "Novidades Frescas" : "Novidades da Semana";

  // Subject lines adaptativas
  const assuntosOpcoes = qtd === 1
    ? [
        `{{nome}}, chegou algo especial pra voce!`,
        `Novidade fresquinha: ${limparNome(produtos[0])}`,
        `Acabou de chegar na Bibelo e voce precisa ver!`,
      ]
    : qtd <= 3
    ? [
        `${qtd} novidades acabaram de chegar!`,
        `{{nome}}, olha o que chegou na Bibelo!`,
        `Acabou de chegar: ${categoriasResumo}!`,
      ]
    : [
        `${qtd} novidades fresquinhas esperando por voce!`,
        `Acabou de chegar: ${categoriasResumo} na Bibelo!`,
        `{{nome}}, separamos ${qtd} lancamentos pra voce!`,
      ];
  const assunto = assuntosOpcoes[Math.floor(Math.random() * assuntosOpcoes.length)];

  // Preheader adaptativo
  const preheader = qtd === 1
    ? `${limparNome(produtos[0])} acabou de chegar. Corre que tem pouca unidade!`
    : `${qtd} produtos novos acabaram de chegar. ${categorias.slice(0, 3).join(", ")}. Corre que o estoque e limitado!`;

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${tituloHeader} - Papelaria Bibelo</title>
  <!--[if mso]><style>table,td{font-family:Arial,Helvetica,sans-serif!important;}</style><![endif]-->
</head>
<body style="margin:0;padding:0;background:#f5f0f2;font-family:'Segoe UI',Arial,Helvetica,sans-serif;-webkit-font-smoothing:antialiased;">
  <!-- Preheader invisivel (aparece no preview do email) -->
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${preheader}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>

  <div style="max-width:600px;margin:0 auto;background:#ffffff;">

    <!-- Header com logo e titulo -->
    <div style="background:linear-gradient(135deg,#fe68c4,#ff8fd3);padding:30px 20px;text-align:center;">
      <a href="${linkBase}" target="_blank" style="text-decoration:none;">
        <img src="https://webhook.papelariabibelo.com.br/logo.png" alt="Papelaria Bibelo" width="70" height="70" style="width:70px;height:70px;border-radius:50%;border:3px solid #fff;" />
      </a>
      <h1 style="color:#fff;margin:12px 0 0;font-size:24px;font-weight:700;">${tituloHeader}</h1>
      <p style="color:rgba(255,255,255,0.9);margin:6px 0 0;font-size:14px;">${qtd === 1 ? "Produto especial acabou de chegar!" : "Produtos fresquinhos acabaram de chegar!"}</p>
    </div>

    <!-- Saudacao personalizada -->
    <div style="padding:28px 25px 8px;">
      <p style="color:#333;font-size:16px;line-height:1.6;margin:0 0 6px;">
        Oi, <strong>{{nome}}</strong>!
      </p>
      <p style="color:#555;font-size:15px;line-height:1.6;margin:0;">
        ${saudacao}
      </p>
    </div>

    <!-- Produtos: layout adaptativo -->
    <div style="padding:12px ${layout === "hero" ? "20px" : "10px"} 0;text-align:center;font-size:0;">
      <!--[if mso]><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><![endif]-->
      ${produtosHtml}
      <!--[if mso]></tr></table><![endif]-->
    </div>

    <!-- CTA principal -->
    <div style="padding:20px 25px 8px;text-align:center;">
      <a href="${linkBase}/novidades/" style="display:inline-block;background:linear-gradient(135deg,#fe68c4,#ff8fd3);color:#fff;padding:16px 40px;border-radius:30px;text-decoration:none;font-weight:700;font-size:16px;box-shadow:0 4px 15px rgba(254,104,196,0.3);">
        Ver Todas as Novidades
      </a>
    </div>

    <!-- Urgencia sutil -->
    <div style="padding:8px 25px 20px;text-align:center;">
      <p style="color:#999;font-size:12px;margin:0;">Estoque limitado — quando acaba, so na proxima remessa!</p>
    </div>

    <!-- Separador -->
    <div style="border-top:2px dashed #ffe5ec;margin:0 25px;"></div>

    <!-- WhatsApp CTA -->
    <div style="padding:22px 25px;text-align:center;background:#fafafa;">
      <p style="color:#555;font-size:14px;margin:0 0 12px;line-height:1.5;">
        Ficou com duvida sobre algum produto?<br>Fala com a gente!
      </p>
      <a href="${whatsappUrl}" style="display:inline-block;background:#25D366;color:#fff;padding:12px 28px;border-radius:30px;text-decoration:none;font-weight:700;font-size:14px;">
        Chamar no WhatsApp
      </a>
    </div>

    <!-- Footer -->
    <div style="background:#f9f9f9;padding:20px 25px;text-align:center;border-top:1px solid #eee;">
      <p style="color:#999;font-size:12px;margin:0;">Papelaria Bibelo</p>
      <p style="color:#bbb;font-size:11px;margin:5px 0 0;">
        <a href="${linkBase}" style="color:#fe68c4;text-decoration:none;">papelariabibelo.com.br</a>
      </p>
      <p style="color:#ccc;font-size:10px;margin:10px 0 0;line-height:1.5;">
        Voce recebeu este email porque e cliente da Papelaria Bibelo.<br>
        <a href="{{unsub_link}}" style="color:#ccc;text-decoration:underline;">Nao quero mais receber emails</a>
      </p>
    </div>

  </div>
</body>
</html>`;

  res.json({
    html,
    assunto,
    preheader,
    assuntos_alternativos: assuntosOpcoes,
    produtos: qtd,
    categorias,
    dias_usado: diasUsado,
    dias_pedido: diasPedido,
    expandiu: diasUsado > diasPedido,
    message: `Template gerado com ${qtd} produtos (${diasUsado === diasPedido ? `ultimos ${diasUsado} dias` : `expandiu de ${diasPedido} para ${diasUsado} dias`})`,
  });
});

// ── GET /api/campaigns/categorias — categorias com estoque para multi-select ──

campaignsRouter.get("/categorias", async (_req: Request, res: Response) => {
  const categorias = await query<{
    categoria: string;
    em_estoque: string;
    preco_medio: string;
  }>(`
    SELECT
      COALESCE(bp.categoria, 'OUTROS') as categoria,
      COUNT(*)::text as em_estoque,
      ROUND(AVG(np.preco)::numeric, 2)::text as preco_medio
    FROM sync.nuvemshop_products np
    LEFT JOIN sync.bling_products bp ON bp.sku = np.sku
      OR LOWER(bp.nome) LIKE '%' || LOWER(SUBSTRING(np.nome FROM 1 FOR 15)) || '%'
    WHERE np.estoque > 0
    GROUP BY bp.categoria
    HAVING COUNT(*) >= 2
    ORDER BY COUNT(*) DESC
  `);

  res.json(categorias.map((c) => ({
    categoria: c.categoria,
    em_estoque: Number(c.em_estoque),
    preco_medio: Number(c.preco_medio),
  })));
});

// ── GET /api/campaigns/produtos — busca produtos em estoque para seleção individual ──

const produtosSearchSchema = z.object({
  search: z.string().optional(),
  categoria: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

campaignsRouter.get("/produtos", async (req: Request, res: Response) => {
  const parse = produtosSearchSchema.safeParse(req.query);
  if (!parse.success) {
    res.status(400).json({ error: "Parâmetros inválidos" });
    return;
  }

  const { search, categoria, limit } = parse.data;
  const conditions = ["np.estoque > 0"];
  const params: unknown[] = [];
  let idx = 1;

  if (search) {
    conditions.push(`LOWER(np.nome) LIKE '%' || LOWER($${idx}) || '%'`);
    params.push(search);
    idx++;
  }
  if (categoria) {
    conditions.push(`COALESCE(bp.categoria, 'OUTROS') = $${idx}`);
    params.push(categoria);
    idx++;
  }

  params.push(limit);

  const produtos = await query<{
    id: string; nome: string; preco: string; estoque: number;
    img: string | null; url: string | null; categoria: string | null;
  }>(
    `SELECT * FROM (
       SELECT DISTINCT ON (SPLIT_PART(np.nome, ' Cor:', 1))
         np.id::text, np.nome, np.preco::text, np.estoque,
         np.imagens->>0 AS img,
         np.dados_raw->>'canonical_url' AS url,
         bp.categoria,
         np.dados_raw->>'created_at' AS criado_ns
       FROM sync.nuvemshop_products np
       LEFT JOIN LATERAL (
         SELECT p.categoria FROM sync.bling_products p
         WHERE p.sku = np.sku OR LOWER(p.nome) LIKE '%' || LOWER(SUBSTRING(np.nome FROM 1 FOR 15)) || '%'
         LIMIT 1
       ) bp ON true
       WHERE ${conditions.join(" AND ")}
       ORDER BY SPLIT_PART(np.nome, ' Cor:', 1), np.dados_raw->>'created_at' DESC NULLS LAST
     ) sub
     ORDER BY sub.criado_ns DESC NULLS LAST
     LIMIT $${idx}`,
    params
  );

  res.json(produtos.map((p) => ({
    id: p.id,
    nome: p.nome,
    preco: Number(p.preco),
    estoque: p.estoque,
    img: p.img,
    url: p.url,
    categoria: p.categoria,
  })));
});

// ── POST /api/campaigns/gerar-personalizada — preview com categorias + público ──

const gerarPersonalizadaSchema = z.object({
  categorias: z.array(z.string()).default([]),
  produto_ids: z.array(z.string()).default([]),
  max_por_categoria: z.number().int().min(1).max(4).default(2),
  limite_produtos: z.number().int().min(1).max(12).default(6),
  publico: z.enum(["todos", "todos_com_email", "nunca_contatados", "segmento", "manual"]),
  segmento: z.string().optional(),
  customer_ids: z.array(z.string().uuid()).optional(),
});

campaignsRouter.post("/gerar-personalizada", async (req: Request, res: Response) => {
  const parse = gerarPersonalizadaSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: "Dados inválidos", detalhes: parse.error.errors });
    return;
  }

  const { categorias, produto_ids, max_por_categoria, limite_produtos, publico, segmento, customer_ids } = parse.data;

  if (categorias.length === 0 && produto_ids.length === 0) {
    res.status(400).json({ error: "Selecione pelo menos uma categoria ou um produto" });
    return;
  }

  // 1. Busca produtos: individuais + por categoria (max N por categoria, mais recentes)
  let produtos: Array<{
    nome: string; preco: string; estoque: number;
    img: string | null; url: string | null; categoria: string | null;
  }> = [];

  // Produtos selecionados individualmente
  if (produto_ids.length > 0) {
    const idParams = produto_ids.map((_, i) => `$${i + 1}`).join(", ");
    const manuais = await query<{
      nome: string; preco: string; estoque: number;
      img: string | null; url: string | null; categoria: string | null;
    }>(
      `SELECT DISTINCT ON (np.id) np.nome, np.preco::text, np.estoque,
         np.imagens->>0 AS img,
         np.dados_raw->>'canonical_url' AS url,
         bp.categoria
       FROM sync.nuvemshop_products np
       LEFT JOIN LATERAL (
         SELECT p.categoria FROM sync.bling_products p
         WHERE p.sku = np.sku OR LOWER(p.nome) LIKE '%' || LOWER(SUBSTRING(np.nome FROM 1 FOR 15)) || '%'
         LIMIT 1
       ) bp ON true
       WHERE np.id::text IN (${idParams}) AND np.estoque > 0`,
      produto_ids
    );
    produtos.push(...manuais);
  }

  // Produtos por categoria (max_por_categoria cada, mais recentes, dedup variante Cor:)
  if (categorias.length > 0) {
    const catParams = categorias.map((_, i) => `$${i + 2}`).join(", ");
    const porCategoria = await query<{
      nome: string; preco: string; estoque: number;
      img: string | null; url: string | null; categoria: string | null;
      rn: string;
    }>(
      `SELECT * FROM (
         SELECT DISTINCT ON (SPLIT_PART(np.nome, ' Cor:', 1))
           np.nome, np.preco::text, np.estoque,
           np.imagens->>0 AS img,
           np.dados_raw->>'canonical_url' AS url,
           bp.categoria,
           np.dados_raw->>'created_at' AS criado_ns,
           ROW_NUMBER() OVER (
             PARTITION BY COALESCE(bp.categoria, 'OUTROS')
             ORDER BY np.dados_raw->>'created_at' DESC NULLS LAST
           )::text AS rn
         FROM sync.nuvemshop_products np
         LEFT JOIN LATERAL (
           SELECT p.categoria FROM sync.bling_products p
           WHERE p.sku = np.sku OR LOWER(p.nome) LIKE '%' || LOWER(SUBSTRING(np.nome FROM 1 FOR 15)) || '%'
           LIMIT 1
         ) bp ON true
         WHERE np.estoque > 0
           AND COALESCE(bp.categoria, 'OUTROS') IN (${catParams})
         ORDER BY SPLIT_PART(np.nome, ' Cor:', 1), np.dados_raw->>'created_at' DESC NULLS LAST
       ) sub
       WHERE sub.rn::int <= $1
       ORDER BY sub.criado_ns DESC NULLS LAST`,
      [max_por_categoria, ...categorias]
    );
    // Evita duplicatas com os manuais
    const nomesJa = new Set(produtos.map((p) => p.nome));
    for (const p of porCategoria) {
      if (!nomesJa.has(p.nome)) {
        produtos.push(p);
        nomesJa.add(p.nome);
      }
    }
  }

  // Limita total
  produtos = produtos.slice(0, limite_produtos);

  if (produtos.length === 0) {
    res.status(404).json({ error: "Nenhum produto em estoque nas categorias selecionadas" });
    return;
  }

  // 2. Busca destinatários
  let destinatarios: Array<{ id: string; nome: string; email: string }>;

  switch (publico) {
    case "todos":
      destinatarios = await query(
        `SELECT c.id, c.nome, c.email FROM crm.customers c
         JOIN crm.customer_scores cs ON cs.customer_id = c.id
         WHERE c.ativo = true AND c.email IS NOT NULL AND c.email_optout = false AND cs.total_pedidos::int > 0
         ORDER BY cs.ltv DESC`
      );
      break;

    case "todos_com_email":
      destinatarios = await query(
        `SELECT c.id, c.nome, c.email FROM crm.customers c
         WHERE c.ativo = true AND c.email IS NOT NULL AND c.email_optout = false
         ORDER BY c.nome`
      );
      break;

    case "nunca_contatados":
      destinatarios = await query(
        `SELECT c.id, c.nome, c.email FROM crm.customers c
         JOIN crm.customer_scores cs ON cs.customer_id = c.id
         WHERE c.ativo = true AND c.email IS NOT NULL AND c.email_optout = false AND cs.total_pedidos::int > 0
           AND NOT EXISTS (SELECT 1 FROM crm.interactions i WHERE i.customer_id = c.id AND i.tipo = 'email_enviado')
         ORDER BY cs.ltv DESC`
      );
      break;

    case "segmento":
      if (!segmento) {
        res.status(400).json({ error: "Segmento obrigatório quando público = segmento" });
        return;
      }
      destinatarios = await query(
        `SELECT c.id, c.nome, c.email FROM crm.customers c
         JOIN crm.customer_scores cs ON cs.customer_id = c.id
         WHERE c.ativo = true AND c.email IS NOT NULL AND c.email_optout = false
           AND cs.segmento = $1
         ORDER BY cs.ltv DESC`,
        [segmento]
      );
      break;

    case "manual":
      if (!customer_ids || customer_ids.length === 0) {
        res.status(400).json({ error: "customer_ids obrigatório quando público = manual" });
        return;
      }
      const placeholders = customer_ids.map((_, i) => `$${i + 1}`).join(", ");
      destinatarios = await query(
        `SELECT c.id, c.nome, c.email FROM crm.customers c
         WHERE c.id IN (${placeholders}) AND c.email IS NOT NULL AND c.email_optout = false`,
        customer_ids
      );
      break;

    default:
      destinatarios = [];
  }

  if (destinatarios.length === 0) {
    res.status(404).json({ error: "Nenhum destinatário encontrado para o público selecionado" });
    return;
  }

  // 3. Gera HTML
  const linkBase = "https://www.papelariabibelo.com.br";
  const whatsappMsg = encodeURIComponent("Oi! Vi as novidades no email e quero saber mais!");
  const whatsappBaseUrl = process.env.WEBHOOK_BASE_URL || "https://webhook.papelariabibelo.com.br";
  const whatsappUrl = `${whatsappBaseUrl}/api/email/wa?text=${whatsappMsg}`;
  const catLabel = categorias.slice(0, 3).join(", ");

  function limparNome(n: string): string {
    return n.replace(/\s*-\s*(PREMIUM|PROMO)$/i, "").replace(/\s+Cor:.*$/i, "").trim();
  }

  const produtosHtml = produtos.map((p) => {
    const preco = parseFloat(p.preco);
    const precoFmt = preco ? `R$ ${preco.toFixed(2).replace(".", ",")}` : "";
    const nomeLimpo = limparNome(p.nome);
    const link = p.url || linkBase;
    const imgBlock = p.img
      ? `<img src="${p.img}" alt="${nomeLimpo}" width="248" style="width:100%;height:auto;aspect-ratio:1;object-fit:cover;display:block;" />`
      : `<div style="width:100%;aspect-ratio:1;background:linear-gradient(135deg,#ffe5ec,#fff7c1);display:flex;align-items:center;justify-content:center;font-size:36px;">🎀</div>`;
    const badge = p.estoque <= 3
      ? `<span style="position:absolute;top:6px;right:6px;background:#ff4444;color:#fff;font-size:9px;font-weight:700;padding:2px 6px;border-radius:10px;">Últimas ${p.estoque}!</span>`
      : `<span style="position:absolute;top:6px;left:6px;background:#fe68c4;color:#fff;font-size:9px;font-weight:700;padding:2px 6px;border-radius:10px;">Novo</span>`;

    return `
    <div style="display:inline-block;vertical-align:top;width:50%;max-width:268px;padding:6px;box-sizing:border-box;">
      <a href="${link}" style="text-decoration:none;display:block;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 6px rgba(0,0,0,0.06);border:1px solid #f5f0f2;">
        <div style="position:relative;overflow:hidden;">${imgBlock}${badge}</div>
        <div style="padding:10px 12px 12px;">
          <p style="margin:0 0 6px;color:#333;font-weight:600;font-size:12px;line-height:1.3;min-height:32px;">${nomeLimpo}</p>
          <div style="display:flex;align-items:center;justify-content:space-between;">
            ${precoFmt ? `<span style="color:#222;font-weight:800;font-size:15px;">${precoFmt}</span>` : ""}
            <span style="color:#fe68c4;font-size:11px;font-weight:700;">Ver →</span>
          </div>
        </div>
      </a>
    </div>`;
  }).join("");

  const assunto = `{{nome}}, novidades em ${catLabel} na Bibelô! ✨`;

  const html = `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f0f2;font-family:'Segoe UI',Arial,Helvetica,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;">${produtos.length} produtos selecionados pra você — estoque limitado!&nbsp;&zwnj;&nbsp;&zwnj;</div>
  <div style="max-width:600px;margin:0 auto;background:#ffffff;">
    <div style="background:linear-gradient(135deg,#fe68c4,#ff8fd3);padding:30px 20px;text-align:center;">
      <a href="${linkBase}" style="text-decoration:none;">
        <img src="https://webhook.papelariabibelo.com.br/logo.png" alt="Papelaria Bibelô" width="70" height="70" style="width:70px;height:70px;border-radius:50%;border:3px solid #fff;" />
      </a>
      <h1 style="color:#fff;margin:12px 0 0;font-size:22px;font-weight:700;">Novidades Fresquinhas!</h1>
      <p style="color:rgba(255,255,255,0.9);margin:6px 0 0;font-size:13px;">${catLabel}</p>
    </div>
    <div style="padding:28px 25px 8px;">
      <p style="color:#333;font-size:16px;line-height:1.6;margin:0 0 6px;">Oi, <strong>{{nome}}</strong>! 💕</p>
      <p style="color:#555;font-size:14px;line-height:1.7;margin:0;">Separamos <strong>${produtos.length} produtos</strong> que acabaram de chegar na Bibelô. Dá uma olhada:</p>
    </div>
    <div style="padding:12px 10px 0;text-align:center;font-size:0;">${produtosHtml}</div>
    <div style="padding:20px 25px 8px;text-align:center;">
      <a href="${linkBase}/novidades/" style="display:inline-block;background:linear-gradient(135deg,#fe68c4,#ff8fd3);color:#fff;padding:14px 36px;border-radius:30px;text-decoration:none;font-weight:700;font-size:15px;box-shadow:0 4px 15px rgba(254,104,196,0.3);">Ver Mais Novidades</a>
    </div>
    <div style="padding:8px 25px 20px;text-align:center;"><p style="color:#999;font-size:12px;margin:0;">Estoque limitado — quando acaba, só na próxima remessa!</p></div>
    <div style="border-top:2px dashed #ffe5ec;margin:0 25px;"></div>
    <div style="padding:22px 25px;text-align:center;background:#fafafa;">
      <p style="color:#555;font-size:14px;margin:0 0 12px;line-height:1.5;">Ficou com dúvida?<br>Fala com a gente!</p>
      <a href="${whatsappUrl}" style="display:inline-block;background:#25D366;color:#fff;padding:12px 28px;border-radius:30px;text-decoration:none;font-weight:700;font-size:14px;">Chamar no WhatsApp</a>
    </div>
    <div style="background:#f9f9f9;padding:20px 25px;text-align:center;border-top:1px solid #eee;">
      <p style="color:#999;font-size:12px;margin:0;">Papelaria Bibelô — Timbó/SC</p>
      <p style="color:#bbb;font-size:11px;margin:5px 0 0;"><a href="${linkBase}" style="color:#fe68c4;text-decoration:none;">papelariabibelo.com.br</a></p>
      <p style="color:#ccc;font-size:10px;margin:10px 0 0;line-height:1.5;">Você recebeu este email porque é cliente da Papelaria Bibelô.<br><a href="{{unsub_link}}" style="color:#ccc;text-decoration:underline;">Não quero mais receber emails</a></p>
    </div>
  </div>
</body></html>`;

  logger.info("Campanha personalizada gerada", {
    categorias,
    produtos: produtos.length,
    destinatarios: destinatarios.length,
    publico,
    user: req.user?.email,
  });

  res.json({
    assunto,
    html,
    produtos: produtos.map((p) => ({
      nome: limparNome(p.nome),
      preco: Number(p.preco),
      estoque: p.estoque,
      img: p.img,
      url: p.url,
      categoria: p.categoria,
    })),
    destinatarios: destinatarios.map((d) => ({ id: d.id, nome: d.nome, email: d.email })),
    total_destinatarios: destinatarios.length,
    categorias,
  });
});

// ── POST /api/campaigns/enviar-personalizada — disparo real ──────

const enviarPersonalizadaSchema = z.object({
  nome_campanha: z.string().min(3).max(255),
  assunto: z.string().min(3).max(255),
  html: z.string().min(10),
  customer_ids: z.array(z.string().uuid()).min(1),
});

campaignsRouter.post("/enviar-personalizada", async (req: Request, res: Response) => {
  const parse = enviarPersonalizadaSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: "Dados inválidos", detalhes: parse.error.errors });
    return;
  }

  if (!isResendConfigured()) {
    res.status(400).json({ error: "Resend não configurado" });
    return;
  }

  const { nome_campanha, assunto, html, customer_ids } = parse.data;

  // Busca clientes válidos
  const placeholders = customer_ids.map((_, i) => `$${i + 1}`).join(", ");
  const clientes = await query<{ id: string; nome: string; email: string }>(
    `SELECT id, nome, email FROM crm.customers
     WHERE id IN (${placeholders}) AND email IS NOT NULL AND email_optout = false`,
    customer_ids
  );

  if (clientes.length === 0) {
    res.status(400).json({ error: "Nenhum destinatário válido — todos os selecionados estão sem email ou fizeram opt-out (descadastro)" });
    return;
  }

  // Cria campanha
  const campaign = await queryOne<{ id: string }>(
    `INSERT INTO marketing.campaigns (nome, canal, status, total_envios, enviado_em)
     VALUES ($1, 'email', 'enviando', $2, NOW()) RETURNING id`,
    [nome_campanha, clientes.length]
  );

  if (!campaign) {
    res.status(500).json({ error: "Erro ao criar campanha" });
    return;
  }

  // Cria sends
  for (const c of clientes) {
    await query(
      `INSERT INTO marketing.campaign_sends (campaign_id, customer_id, status)
       VALUES ($1, $2, 'pendente') ON CONFLICT DO NOTHING`,
      [campaign.id, c.id]
    );
  }

  // Dispara emails em background
  let sent = 0;
  let failed = 0;

  const sendPromise = (async () => {
    for (const c of clientes) {
      try {
        const personalizedSubject = assunto.replace(/\{\{nome\}\}/g, c.nome.split(" ")[0]);
        const personalizedHtml = html
          .replace(/\{\{nome\}\}/g, c.nome.split(" ")[0])
          .replace(/\{\{unsub_link\}\}/g, gerarLinkDescadastro(c.email));

        const result = await sendEmail({
          to: c.email,
          subject: personalizedSubject,
          html: personalizedHtml,
          tags: [
            { name: "campaign_id", value: campaign.id },
            { name: "customer_id", value: c.id },
            { name: "tipo", value: "personalizada" },
          ],
        });

        await query(
          `UPDATE marketing.campaign_sends SET status = 'enviado', message_id = $3, enviado_em = NOW()
           WHERE campaign_id = $1 AND customer_id = $2`,
          [campaign.id, c.id, result?.id || null]
        );

        // Registra interação na timeline
        await query(
          `INSERT INTO crm.interactions (customer_id, tipo, canal, descricao, metadata)
           VALUES ($1, 'email_enviado', 'email', $2, $3)`,
          [c.id, `Campanha: ${nome_campanha}`, JSON.stringify({ campaignId: campaign.id, messageId: result?.id })]
        );

        sent++;
        await new Promise((r) => setTimeout(r, 150)); // Rate limit Resend
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Erro";
        logger.error("Erro ao enviar email personalizado", { customerId: c.id, error: msg });
        await query(
          "UPDATE marketing.campaign_sends SET status = 'erro' WHERE campaign_id = $1 AND customer_id = $2",
          [campaign.id, c.id]
        );
        failed++;
      }
    }

    // Finaliza campanha
    await query(
      `UPDATE marketing.campaigns SET status = 'concluida', total_envios = $2, atualizado_em = NOW() WHERE id = $1`,
      [campaign.id, sent]
    );

    logger.info("Campanha personalizada concluída", { campaignId: campaign.id, sent, failed });
  })();

  sendPromise.catch((err) => {
    logger.error("Erro geral na campanha personalizada", { campaignId: campaign.id, error: err.message });
  });

  res.json({
    campaign_id: campaign.id,
    message: `Campanha em envio para ${clientes.length} destinatários`,
    total: clientes.length,
  });
});

// ── GET /api/campaigns/gerar-reengajamento — email personalizado por histórico ──
// Cruza itens que o cliente comprou com produtos em estoque na NuvemShop

const reengajamentoSchema = z.object({
  customer_id: z.string().uuid(),
  limite: z.coerce.number().int().min(1).max(12).default(6),
});

campaignsRouter.get("/gerar-reengajamento", async (req: Request, res: Response) => {
  const parse = reengajamentoSchema.safeParse(req.query);
  if (!parse.success) {
    res.status(400).json({ error: "Parâmetros inválidos", detalhes: parse.error.errors });
    return;
  }

  const { customer_id, limite } = parse.data;

  // Busca dados do cliente
  const customer = await queryOne<{ id: string; nome: string; email: string | null }>(
    "SELECT id, nome, email FROM crm.customers WHERE id = $1",
    [customer_id]
  );
  if (!customer || !customer.email) {
    res.status(404).json({ error: "Cliente não encontrado ou sem email" });
    return;
  }

  // Busca itens que o cliente comprou (NuvemShop e Bling)
  const compras = await query<{ nome_item: string }>(
    `SELECT DISTINCT
       COALESCE(
         item->>'name',
         item->>'descricao',
         item->>'nome'
       ) AS nome_item
     FROM (
       SELECT jsonb_array_elements(itens) AS item FROM sync.nuvemshop_orders WHERE customer_id = $1
       UNION ALL
       SELECT jsonb_array_elements(itens) AS item FROM sync.bling_orders WHERE customer_id = $1
     ) sub
     WHERE COALESCE(item->>'name', item->>'descricao', item->>'nome') IS NOT NULL`,
    [customer_id]
  );

  // Extrai palavras-chave dos itens comprados para buscar similares
  const keywords: string[] = [];
  for (const c of compras) {
    const name = c.nome_item.toLowerCase();
    // Extrai palavras relevantes (ignora códigos, medidas, marcas genéricas)
    const words = name
      .replace(/[0-9.,]+\s*(mm|fls|cm|ml|un|x|cd|c\/)/gi, "")
      .replace(/\b(tilibra|faber|cis|brw|leo|bazze|dac|tris|pilot)\b/gi, "")
      .split(/[\s\-_/()]+/)
      .filter((w) => w.length > 3)
      .slice(0, 3);
    keywords.push(...words);
  }

  // Categorias inferidas dos itens comprados
  const categoriaMap: Record<string, string[]> = {
    caderno: ["caderno", "bloco", "caderneta", "agenda", "fichario"],
    caneta: ["caneta", "marca", "lapis", "lapiseira", "borracha"],
    papel: ["papel", "carta", "envelope", "adesivo", "post-it", "washi"],
    organizador: ["organizador", "estojo", "pasta", "porta"],
    kit: ["kit", "conjunto", "coleção"],
  };

  const categoriasRelevantes = new Set<string>();
  for (const c of compras) {
    const lower = c.nome_item.toLowerCase();
    for (const [cat, terms] of Object.entries(categoriaMap)) {
      if (terms.some((t) => lower.includes(t))) {
        categoriasRelevantes.add(cat);
      }
    }
  }

  // Busca produtos NuvemShop em estoque — priorizando categorias que o cliente comprou
  const searchTerms = [...categoriasRelevantes].length > 0
    ? [...categoriasRelevantes].flatMap((c) => categoriaMap[c] || [c])
    : ["caderno", "caneta", "papel", "kit", "agenda"];

  const likeConditions = searchTerms.map((_, i) => `LOWER(np.nome) LIKE '%' || $${i + 2} || '%'`).join(" OR ");

  const produtos = await query<{
    nome: string;
    preco: string;
    estoque: number;
    img: string | null;
    url: string | null;
  }>(
    `SELECT np.nome, np.preco::text, np.estoque,
       np.imagens->>0 AS img,
       np.dados_raw->>'canonical_url' AS url
     FROM sync.nuvemshop_products np
     WHERE np.estoque > 0
       AND (${likeConditions})
     ORDER BY
       np.estoque DESC,
       np.preco DESC
     LIMIT $1`,
    [limite, ...searchTerms]
  );

  if (produtos.length === 0) {
    res.status(404).json({ error: "Nenhum produto relacionado em estoque" });
    return;
  }

  // Gera nome limpo
  function limparNome(n: string): string {
    return n
      .replace(/\s*-\s*(PREMIUM|PROMO)$/i, "")
      .replace(/\s+Cor:.*$/i, "")
      .trim();
  }

  // Monta HTML do email
  const linkBase = "https://www.papelariabibelo.com.br";
  const unsubLink = "{{unsub_link}}";
  const whatsappMsg = encodeURIComponent("Oi! Vi as novidades no email e quero saber mais!");
  const whatsappBaseUrl = process.env.WEBHOOK_BASE_URL || "https://webhook.papelariabibelo.com.br";
  const whatsappUrl = `${whatsappBaseUrl}/api/email/wa?text=${whatsappMsg}`;
  const nome = customer.nome.split(" ")[0]; // Primeiro nome

  const itensCompradosTexto = compras.map((c) => limparNome(c.nome_item)).slice(0, 3).join(", ");

  const produtosHtml = produtos.map((p) => {
    const preco = parseFloat(p.preco);
    const precoFmt = preco ? `R$ ${preco.toFixed(2).replace(".", ",")}` : "";
    const nomeLimpo = limparNome(p.nome);
    const link = p.url || linkBase;
    const imgBlock = p.img
      ? `<img src="${p.img}" alt="${nomeLimpo}" width="248" style="width:100%;height:auto;aspect-ratio:1;object-fit:cover;display:block;" />`
      : `<div style="width:100%;aspect-ratio:1;background:linear-gradient(135deg,#ffe5ec,#fff7c1);display:flex;align-items:center;justify-content:center;font-size:36px;">🎀</div>`;
    const estoqueBadge = p.estoque <= 3
      ? `<span style="position:absolute;top:6px;right:6px;background:#ff4444;color:#fff;font-size:9px;font-weight:700;padding:2px 6px;border-radius:10px;">Últimas ${p.estoque}!</span>`
      : "";

    return `
    <div style="display:inline-block;vertical-align:top;width:50%;max-width:268px;padding:6px;box-sizing:border-box;">
      <a href="${link}" style="text-decoration:none;display:block;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 6px rgba(0,0,0,0.06);border:1px solid #f5f0f2;">
        <div style="position:relative;overflow:hidden;">
          ${imgBlock}
          ${estoqueBadge}
        </div>
        <div style="padding:10px 12px 12px;">
          <p style="margin:0 0 6px;color:#333;font-weight:600;font-size:12px;line-height:1.3;min-height:32px;">${nomeLimpo}</p>
          <div style="display:flex;align-items:center;justify-content:space-between;">
            ${precoFmt ? `<span style="color:#222;font-weight:800;font-size:15px;">${precoFmt}</span>` : ""}
            <span style="color:#fe68c4;font-size:11px;font-weight:700;">Ver →</span>
          </div>
        </div>
      </a>
    </div>`;
  }).join("");

  const assunto = `${nome}, separamos novidades especiais pra você! ✨`;
  const preheader = `Baseado na sua última compra, achamos que você vai amar esses produtos.`;

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body style="margin:0;padding:0;background:#f5f0f2;font-family:'Segoe UI',Arial,Helvetica,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;">${preheader}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>

  <div style="max-width:600px;margin:0 auto;background:#ffffff;">

    <div style="background:linear-gradient(135deg,#fe68c4,#ff8fd3);padding:30px 20px;text-align:center;">
      <a href="${linkBase}" style="text-decoration:none;">
        <img src="https://webhook.papelariabibelo.com.br/logo.png" alt="Papelaria Bibelô" width="70" height="70" style="width:70px;height:70px;border-radius:50%;border:3px solid #fff;" />
      </a>
      <h1 style="color:#fff;margin:12px 0 0;font-size:22px;font-weight:700;">Pensamos em Você!</h1>
      <p style="color:rgba(255,255,255,0.9);margin:6px 0 0;font-size:13px;">Produtos selecionados especialmente pra você</p>
    </div>

    <div style="padding:28px 25px 8px;">
      <p style="color:#333;font-size:16px;line-height:1.6;margin:0 0 6px;">
        Oi, <strong>{{nome}}</strong>! 💕
      </p>
      <p style="color:#555;font-size:14px;line-height:1.7;margin:0 0 4px;">
        Vimos que você levou <strong>${itensCompradosTexto}</strong> na sua última visita — adoramos o seu gosto!
      </p>
      <p style="color:#555;font-size:14px;line-height:1.7;margin:0;">
        Separamos alguns produtos que combinam com o que você gosta. Dá uma olhada:
      </p>
    </div>

    <div style="padding:12px 10px 0;text-align:center;font-size:0;">
      ${produtosHtml}
    </div>

    <div style="padding:20px 25px 8px;text-align:center;">
      <a href="${linkBase}/novidades/" style="display:inline-block;background:linear-gradient(135deg,#fe68c4,#ff8fd3);color:#fff;padding:14px 36px;border-radius:30px;text-decoration:none;font-weight:700;font-size:15px;box-shadow:0 4px 15px rgba(254,104,196,0.3);">
        Ver Mais Novidades
      </a>
    </div>

    <div style="padding:8px 25px 20px;text-align:center;">
      <p style="color:#999;font-size:12px;margin:0;">Estoque limitado — quando acaba, só na próxima remessa!</p>
    </div>

    <div style="border-top:2px dashed #ffe5ec;margin:0 25px;"></div>

    <div style="padding:22px 25px;text-align:center;background:#fafafa;">
      <p style="color:#555;font-size:14px;margin:0 0 12px;line-height:1.5;">
        Ficou com dúvida sobre algum produto?<br>Fala com a gente!
      </p>
      <a href="${whatsappUrl}" style="display:inline-block;background:#25D366;color:#fff;padding:12px 28px;border-radius:30px;text-decoration:none;font-weight:700;font-size:14px;">
        Chamar no WhatsApp
      </a>
    </div>

    <div style="background:#f9f9f9;padding:20px 25px;text-align:center;border-top:1px solid #eee;">
      <p style="color:#999;font-size:12px;margin:0;">Papelaria Bibelô — Timbó/SC</p>
      <p style="color:#bbb;font-size:11px;margin:5px 0 0;">
        <a href="${linkBase}" style="color:#fe68c4;text-decoration:none;">papelariabibelo.com.br</a>
      </p>
      <p style="color:#ccc;font-size:10px;margin:10px 0 0;line-height:1.5;">
        Você recebeu este email porque é cliente da Papelaria Bibelô.<br>
        <a href="${unsubLink}" style="color:#ccc;text-decoration:underline;">Não quero mais receber emails</a>
      </p>
    </div>

  </div>
</body>
</html>`;

  logger.info("Reengajamento gerado", {
    customerId: customer_id,
    nome: customer.nome,
    compras: compras.length,
    produtos: produtos.length,
    categorias: [...categoriasRelevantes],
  });

  res.json({
    customer: { id: customer.id, nome: customer.nome, email: customer.email },
    compras_anteriores: compras.map((c) => c.nome_item),
    categorias_detectadas: [...categoriasRelevantes],
    produtos_sugeridos: produtos.map((p) => ({
      nome: limparNome(p.nome),
      preco: parseFloat(p.preco),
      estoque: p.estoque,
      url: p.url,
    })),
    assunto,
    preheader,
    html,
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
    // Gera link de descadastro real se o HTML ainda tem {{unsub_link}}
    let finalHtml = parse.data.html;
    if (finalHtml.includes("{{unsub_link}}")) {
      finalHtml = finalHtml.replace(/\{\{unsub_link\}\}/g, gerarLinkDescadastro(parse.data.to));
    }

    const result = await sendEmail({
      to: parse.data.to,
      subject: parse.data.subject,
      html: finalHtml,
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

  const destinatarios = await query(
    `SELECT cs.status, cs.message_id, cs.enviado_em, cs.aberto_em, cs.clicado_em,
       cu.id AS customer_id, cu.nome, cu.email, cu.cidade, cu.estado
     FROM marketing.campaign_sends cs
     JOIN crm.customers cu ON cu.id = cs.customer_id
     WHERE cs.campaign_id = $1
     ORDER BY cs.enviado_em DESC NULLS LAST`,
    [req.params.id]
  );

  res.json({ ...campaign, sends_por_status: sends, destinatarios });
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
  // ── Transação com SELECT FOR UPDATE para evitar race condition ──
  const client = await db.connect();

  try {
    await client.query("BEGIN");

    // Lock na campanha para evitar disparo duplo concorrente
    const campaignResult = await client.query(
      "SELECT id, status, canal, template_id, segment_id FROM marketing.campaigns WHERE id = $1 FOR UPDATE",
      [req.params.id]
    );
    const campaign = campaignResult.rows[0] as {
      id: string; status: string; canal: string;
      template_id: string | null; segment_id: string | null;
    } | undefined;

    if (!campaign) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Campanha não encontrada" });
      return;
    }

    if (campaign.status === "enviando" || campaign.status === "enviada" || campaign.status === "concluida") {
      await client.query("ROLLBACK");
      res.status(409).json({ error: `Campanha já está com status "${campaign.status}" e não pode ser disparada novamente` });
      return;
    }

    if (campaign.status !== "rascunho" && campaign.status !== "agendada") {
      await client.query("ROLLBACK");
      res.status(400).json({ error: `Campanha com status "${campaign.status}" não pode ser disparada` });
      return;
    }

    if (!campaign.template_id) {
      await client.query("ROLLBACK");
      res.status(400).json({ error: "Campanha precisa de um template antes de disparar" });
      return;
    }

    // Busca clientes do segmento (ou todos ativos se sem segmento)
    let customersResult;
    if (campaign.segment_id) {
      customersResult = await client.query(
        `SELECT c.id FROM crm.customers c
         JOIN crm.customer_scores cs ON cs.customer_id = c.id
         JOIN crm.segments s ON s.id = $1
         WHERE c.ativo = true AND cs.segmento = s.nome`,
        [campaign.segment_id]
      );
    } else {
      customersResult = await client.query(
        "SELECT id FROM crm.customers WHERE ativo = true"
      );
    }
    const customers = customersResult.rows as { id: string }[];

    if (customers.length === 0) {
      await client.query("ROLLBACK");
      res.status(400).json({ error: "Nenhum cliente encontrado para esta campanha" });
      return;
    }

    // Cria registros de envio
    const values = customers.map((_, i) => `($1, $${i + 2}, 'pendente')`).join(", ");
    const params = [campaign.id, ...customers.map((c) => c.id)];

    await client.query(
      `INSERT INTO marketing.campaign_sends (campaign_id, customer_id, status)
       VALUES ${values}
       ON CONFLICT (campaign_id, customer_id) DO NOTHING`,
      params
    );

    // Atualiza status da campanha
    await client.query(
      `UPDATE marketing.campaigns
       SET status = 'enviando', enviado_em = NOW(), total_envios = $2, atualizado_em = NOW()
       WHERE id = $1`,
      [campaign.id, customers.length]
    );

    await client.query("COMMIT");

    logger.info("Campanha disparada", {
      id: campaign.id,
      canal: campaign.canal,
      total: customers.length,
      user: req.user?.email,
    });

    // Disparo real via Resend (email) — em background após commit
    if (campaign.canal === "email") {
      if (!isResendConfigured()) {
        res.status(400).json({ error: "Resend não configurado. Adicione RESEND_API_KEY no .env" });
        return;
      }

      sendCampaignEmails(campaign.id).catch((err) => {
        logger.error("Erro no disparo de campanha", { campaignId: campaign.id, error: err.message });
      });
    }

    res.json({
      message: campaign.canal === "email" ? "Campanha de email em envio" : "Campanha criada (WhatsApp pendente de integração)",
      total_envios: customers.length,
    });
  } catch (err: unknown) {
    await client.query("ROLLBACK");
    const message = err instanceof Error ? err.message : "Erro ao disparar campanha";
    logger.error("Erro na transação de disparo de campanha", { id: req.params.id, error: message });
    res.status(500).json({ error: "Erro ao disparar campanha" });
  } finally {
    client.release();
  }
});

