import { Router, Request, Response } from "express";
import crypto from "crypto";
import { z } from "zod";
import { query, queryOne } from "../db";
import { logger } from "../utils/logger";
import { authMiddleware } from "../middleware/auth";
import { sendEmail } from "../integrations/resend/email";
import { escHtml } from "../utils/sanitize";

export const revendedorasRouter = Router();
revendedorasRouter.use(authMiddleware);

// ── Helpers ──────────────────────────────────────────────────

// Estrutura de níveis:
//   iniciante : volume < 150  → 15%, frete por conta da revendedora
//   bronze    : 150 ≤ vol < 600 → 20%, frete por conta da revendedora
//   prata     : 600 ≤ vol < 1200 → 25%, frete por conta da revendedora
//   ouro      : vol ≥ 1200 → 30%, frete GRÁTIS (Bibelô arca)
function calcularNivel(volume: number): { nivel: string; desconto: number } {
  if (volume >= 1200) return { nivel: "ouro",      desconto: 30 };
  if (volume >= 600)  return { nivel: "prata",     desconto: 25 };
  if (volume >= 150)  return { nivel: "bronze",    desconto: 20 };
  return                    { nivel: "iniciante",  desconto: 15 };
}

function calcularProgresso(volume: number): {
  proximo: string | null;
  meta: number;
  faltam: number;
  percentual: number;
} {
  if (volume >= 1200) return { proximo: null,     meta: 1200, faltam: 0,              percentual: 100 };
  if (volume >= 600) {
    const faltam = Math.max(0, 1200 - volume);
    const percentual = Math.min(100, Math.max(0, ((volume - 600) / 600) * 100));
    return { proximo: "ouro",   meta: 1200, faltam, percentual };
  }
  if (volume >= 150) {
    const faltam = Math.max(0, 600 - volume);
    const percentual = Math.min(100, Math.max(0, ((volume - 150) / 450) * 100));
    return { proximo: "prata",  meta: 600,  faltam, percentual };
  }
  // iniciante
  const faltam = Math.max(0, 150 - volume);
  const percentual = Math.min(100, Math.max(0, (volume / 150) * 100));
  return { proximo: "bronze", meta: 150,  faltam, percentual };
}

// ── E-mail de boas-vindas — disparado ao cadastrar revendedora ────

const LOGO_URL = "https://webhook.papelariabibelo.com.br/logo.png";
const PORTAL_URL = "https://souparceira.papelariabibelo.com.br";
const FROM_PARCEIRAS = "Sou Parceira Bibelô <souparceira@papelariabibelo.com.br>";

function buildBoasVindasParceira(nome: string, cpf: string, desconto: number): string {
  const nomeEsc = escHtml(nome);
  const cpfFormatado = cpf.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4").replace(/[^\d.-]/g, "") || cpf;

  const nivelRow = (emoji: string, label: string, desc: number, meta: string, frete: string, destaque: boolean) => `
    <tr style="${destaque ? "background:#ffe5ec;" : ""}">
      <td style="padding:10px 14px;border-bottom:1px solid #fce8f0;">
        <span style="font-size:18px;">${emoji}</span>
      </td>
      <td style="padding:10px 0;border-bottom:1px solid #fce8f0;">
        <strong style="color:#2d2d2d;font-size:13px;">${label}</strong>
        <span style="color:#888;font-size:12px;"> · ${meta}</span>
      </td>
      <td style="padding:10px 14px;border-bottom:1px solid #fce8f0;text-align:right;">
        <strong style="color:#fe68c4;font-size:14px;">${desc}% OFF</strong>
      </td>
      <td style="padding:10px 14px;border-bottom:1px solid #fce8f0;text-align:right;white-space:nowrap;">
        <span style="font-size:11px;color:${frete === "Frete grátis" ? "#16a34a" : "#888"};">
          ${frete === "Frete grátis" ? "✅" : "📦"} ${frete}
        </span>
      </td>
    </tr>`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Bem-vinda ao Programa Sou Parceira — Bibelô</title>
</head>
<body style="margin:0;padding:0;background:#ffe5ec;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#ffe5ec;padding:32px 16px;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0"
             style="background:#ffffff;border-radius:16px;overflow:hidden;max-width:520px;width:100%;">

        <!-- Header com logo -->
        <tr>
          <td style="background:#fe68c4;padding:28px 32px;text-align:center;">
            <img src="${LOGO_URL}" alt="Papelaria Bibelô"
                 width="120" height="auto"
                 style="display:block;margin:0 auto 12px;max-height:50px;object-fit:contain;"
                 onerror="this.style.display='none'" />
            <p style="margin:0;color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-0.5px;">
              🤝 Programa Sou Parceira
            </p>
            <p style="margin:6px 0 0;color:rgba(255,255,255,0.88);font-size:13px;">
              Catálogo exclusivo com preços de revendedora
            </p>
          </td>
        </tr>

        <!-- Corpo -->
        <tr>
          <td style="padding:32px 32px 24px;">
            <p style="margin:0 0 6px;color:#2d2d2d;font-size:16px;font-weight:700;">
              Olá, ${nomeEsc}! 🎉
            </p>
            <p style="margin:0 0 20px;color:#555;font-size:14px;line-height:1.7;">
              Você foi cadastrada no <strong>Programa Sou Parceira da Papelaria Bibelô</strong>.
              Agora você tem acesso ao catálogo exclusivo com preços de revendedora e
              pode fazer pedidos direto pelo portal!
            </p>

            <!-- Como acessar -->
            <table width="100%" cellpadding="0" cellspacing="0"
                   style="background:#f9f0f8;border-radius:12px;margin-bottom:24px;">
              <tr>
                <td style="padding:18px 20px;">
                  <p style="margin:0 0 10px;font-size:13px;font-weight:700;color:#2d2d2d;">
                    🔑 Como acessar o portal
                  </p>
                  <p style="margin:0 0 6px;font-size:13px;color:#555;line-height:1.6;">
                    1. Acesse
                    <a href="${PORTAL_URL}" style="color:#fe68c4;font-weight:600;text-decoration:none;">
                      souparceira.papelariabibelo.com.br
                    </a>
                  </p>
                  <p style="margin:0 0 6px;font-size:13px;color:#555;line-height:1.6;">
                    2. Digite seu CPF: <strong style="color:#2d2d2d;">${cpfFormatado}</strong>
                  </p>
                  <p style="margin:0;font-size:13px;color:#555;line-height:1.6;">
                    3. Confirme o código enviado para este e-mail — pronto!
                  </p>
                </td>
              </tr>
            </table>

            <!-- Tabela de níveis -->
            <p style="margin:0 0 12px;font-size:13px;font-weight:700;color:#2d2d2d;">
              📊 Como funciona o programa de níveis
            </p>
            <table width="100%" cellpadding="0" cellspacing="0"
                   style="border-radius:10px;overflow:hidden;border:1px solid #fce8f0;margin-bottom:8px;">
              <thead>
                <tr style="background:#ffe5ec;">
                  <th style="padding:8px 14px;font-size:11px;color:#fe68c4;text-align:left;font-weight:700;" colspan="2">NÍVEL</th>
                  <th style="padding:8px 14px;font-size:11px;color:#fe68c4;text-align:right;font-weight:700;">DESCONTO</th>
                  <th style="padding:8px 14px;font-size:11px;color:#fe68c4;text-align:right;font-weight:700;">FRETE</th>
                </tr>
              </thead>
              <tbody>
                ${nivelRow("✨", "Iniciante", 15, "até R$149/mês", "Por sua conta", desconto === 15)}
                ${nivelRow("🥉", "Bronze", 20, "R$150 a R$599/mês", "Por sua conta", desconto === 20)}
                ${nivelRow("🥈", "Prata", 25, "R$600 a R$1.199/mês", "Por sua conta", desconto === 25)}
                ${nivelRow("🥇", "Ouro", 30, "R$1.200+/mês", "Frete grátis", desconto === 30)}
              </tbody>
            </table>
            <p style="margin:0 0 24px;font-size:11px;color:#aaa;line-height:1.5;">
              O nível é atualizado automaticamente conforme seu volume de compras no mês.
              Seu nível atual está destacado na tabela.
            </p>

            <!-- CTA -->
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td align="center">
                  <a href="${PORTAL_URL}"
                     style="display:inline-block;background:#fe68c4;color:#ffffff;font-size:15px;
                            font-weight:700;text-decoration:none;padding:14px 36px;
                            border-radius:10px;letter-spacing:-0.3px;">
                    Acessar catálogo →
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Dúvidas WhatsApp -->
        <tr>
          <td style="padding:0 32px 24px;">
            <table width="100%" cellpadding="0" cellspacing="0"
                   style="background:#f0fdf4;border-radius:10px;border:1px solid #bbf7d0;">
              <tr>
                <td style="padding:14px 18px;">
                  <p style="margin:0;font-size:13px;color:#166534;">
                    💬 <strong>Dúvidas?</strong> Fale com a gente pelo WhatsApp:
                    <a href="https://wa.me/5547933862514"
                       style="color:#166534;font-weight:700;text-decoration:none;">
                      (47) 9 3386-2514
                    </a>
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f9f9f9;padding:16px 32px;text-align:center;
                     border-top:1px solid #f0e0e8;">
            <p style="margin:0;color:#aaa;font-size:11px;line-height:1.6;">
              Papelaria Bibelô · Timbó/SC ·
              <a href="https://papelariabibelo.com.br"
                 style="color:#fe68c4;text-decoration:none;">papelariabibelo.com.br</a>
            </p>
            <p style="margin:6px 0 0;color:#ccc;font-size:10px;">
              Este e-mail foi enviado pois você foi cadastrada como revendedora Bibelô.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

async function gerarNumeroPedido(): Promise<string> {
  const now = new Date();
  const yyyymm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const rand = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `REV-${yyyymm}-${rand}`;
}

async function concederConquista(
  revendedoraId: string,
  tipo: string,
  descricao: string,
  pontos: number,
  metadata?: Record<string, unknown>
): Promise<void> {
  try {
    await queryOne(
      `INSERT INTO crm.revendedora_conquistas (revendedora_id, tipo, descricao, pontos, metadata)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (revendedora_id, tipo) DO NOTHING`,
      [revendedoraId, tipo, descricao, pontos, metadata ? JSON.stringify(metadata) : null]
    );
    // Atualiza pontos totais
    await queryOne(
      `UPDATE crm.revendedoras
       SET pontos = (SELECT COALESCE(SUM(pontos), 0) FROM crm.revendedora_conquistas WHERE revendedora_id = $1)
       WHERE id = $1`,
      [revendedoraId]
    );
  } catch {
    // conquista já existe — ignorar
  }
}

// ── Schemas ──────────────────────────────────────────────────

const createSchema = z.object({
  nome: z.string().min(2).max(255),
  email: z.string().email(),
  telefone: z.string().max(30).optional(),
  documento: z.string().max(20).optional(),
  cidade: z.string().max(100).optional(),
  estado: z.string().max(2).optional(),
  observacao: z.string().max(1000).optional(),
  customer_id: z.string().uuid().optional(),
  percentual_desconto: z.number().min(0).max(50).optional(),
  pedido_minimo: z.number().min(0).optional(),
  cep:         z.string().regex(/^\d{8}$/).optional(),
  logradouro:  z.string().max(200).optional(),
  numero:      z.string().max(20).optional(),
  complemento: z.string().max(100).optional(),
  bairro:      z.string().max(100).optional(),
});

const updateSchema = createSchema.partial();

const estoqueItemSchema = z.object({
  bling_produto_id: z.string().max(50).optional(),
  produto_nome: z.string().min(1).max(255),
  produto_sku: z.string().max(100).optional(),
  produto_imagem: z.string().max(500).optional(),
  produto_preco: z.number().min(0).optional(),
  quantidade: z.number().int().min(0),
  quantidade_minima: z.number().int().min(0).default(3),
  custo_unitario: z.number().min(0).optional(),
  preco_sugerido: z.number().min(0).optional(),
});

const novoPedidoSchema = z.object({
  itens: z.array(z.object({
    produto_nome: z.string().min(1).max(255),
    produto_sku: z.string().max(100).optional(),
    quantidade: z.number().int().min(1),
    preco_unitario: z.number().min(0),
    preco_com_desconto: z.number().min(0),
  })).min(1),
  observacao: z.string().max(1000).optional(),
});

const listQuerySchema = z.object({
  page:   z.coerce.number().int().min(1).default(1),
  limit:  z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  status: z.enum(["pendente", "ativa", "inativa", "suspensa"]).optional(),
  nivel:  z.enum(["iniciante", "bronze", "prata", "ouro"]).optional(),
});

// ── GET /stats ────────────────────────────────────────────────

revendedorasRouter.get("/stats", async (_req: Request, res: Response) => {
  const stats = await queryOne<{
    total: string; ativas: string; pendentes: string;
    volume_mes: string; pedidos_pendentes: string;
    nivel_iniciante: string; nivel_bronze: string; nivel_prata: string; nivel_ouro: string;
  }>(`
    SELECT
      COUNT(*)::text                                          AS total,
      COUNT(*) FILTER (WHERE status = 'ativa')::text         AS ativas,
      COUNT(*) FILTER (WHERE status = 'pendente')::text      AS pendentes,
      COALESCE(SUM(volume_mes_atual) FILTER (WHERE status = 'ativa'), 0)::text AS volume_mes,
      (SELECT COUNT(*)::text FROM crm.revendedora_pedidos WHERE status = 'pendente') AS pedidos_pendentes,
      COUNT(*) FILTER (WHERE nivel = 'iniciante')::text      AS nivel_iniciante,
      COUNT(*) FILTER (WHERE nivel = 'bronze')::text         AS nivel_bronze,
      COUNT(*) FILTER (WHERE nivel = 'prata')::text          AS nivel_prata,
      COUNT(*) FILTER (WHERE nivel = 'ouro')::text           AS nivel_ouro
    FROM crm.revendedoras
  `);
  res.json(stats);
});

// ── GET / ─────────────────────────────────────────────────────

revendedorasRouter.get("/", async (req: Request, res: Response) => {
  const parse = listQuerySchema.safeParse(req.query);
  if (!parse.success) {
    res.status(400).json({ error: "Parâmetros inválidos", detalhes: parse.error.errors });
    return;
  }

  const { page, limit, search, status, nivel } = parse.data;
  const offset = (page - 1) * limit;
  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (search) {
    conditions.push(`(LOWER(r.nome) LIKE $${idx} OR LOWER(r.email) LIKE $${idx} OR r.telefone LIKE $${idx})`);
    params.push(`%${search.toLowerCase()}%`);
    idx++;
  }
  if (status) { conditions.push(`r.status = $${idx++}`); params.push(status); }
  if (nivel)  { conditions.push(`r.nivel = $${idx++}`);  params.push(nivel); }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const total = await queryOne<{ total: string }>(
    `SELECT COUNT(*)::text AS total FROM crm.revendedoras r ${where}`, params
  );

  params.push(limit, offset);
  const rows = await query(`
    SELECT
      r.id, r.nome, r.email, r.telefone, r.documento,
      r.cidade, r.estado, r.nivel, r.pontos,
      r.volume_mes_atual, r.total_vendido,
      r.percentual_desconto, r.pedido_minimo,
      r.status, r.criado_em, r.aprovada_em, r.meses_consecutivos,
      (SELECT COUNT(*)::int  FROM crm.revendedora_pedidos p   WHERE p.revendedora_id = r.id)                                  AS total_pedidos,
      (SELECT COUNT(*)::int  FROM crm.revendedora_conquistas c WHERE c.revendedora_id = r.id)                                 AS total_conquistas,
      (SELECT COUNT(*)::int  FROM crm.revendedora_estoque e   WHERE e.revendedora_id = r.id AND e.quantidade <= e.quantidade_minima) AS alertas_estoque
    FROM crm.revendedoras r
    ${where}
    ORDER BY r.criado_em DESC
    LIMIT $${idx} OFFSET $${idx + 1}
  `, params);

  res.json({
    data: rows,
    pagination: {
      page, limit,
      total: parseInt(total?.total || "0"),
      pages: Math.ceil(parseInt(total?.total || "0") / limit),
    },
  });
});

// ── POST / ────────────────────────────────────────────────────

revendedorasRouter.post("/", async (req: Request, res: Response) => {
  const parse = createSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: "Dados inválidos", detalhes: parse.error.errors });
    return;
  }

  const d = parse.data;
  const existing = await queryOne(
    "SELECT id FROM crm.revendedoras WHERE LOWER(email) = LOWER($1)", [d.email]
  );
  if (existing) {
    res.status(409).json({ error: "Já existe uma revendedora com este e-mail" });
    return;
  }

  const desconto = d.percentual_desconto ?? 15; // novas revendedoras entram como Iniciante
  const minimo   = d.pedido_minimo ?? 150;

  const rev = await queryOne(
    `INSERT INTO crm.revendedoras
       (nome, email, telefone, documento, cidade, estado, observacao,
        customer_id, percentual_desconto, pedido_minimo,
        cep, logradouro, numero, complemento, bairro)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     RETURNING *`,
    [d.nome, d.email, d.telefone ?? null, d.documento ?? null,
     d.cidade ?? null, d.estado ?? null, d.observacao ?? null,
     d.customer_id ?? null, desconto, minimo,
     d.cep ?? null, d.logradouro ?? null, d.numero ?? null,
     d.complemento ?? null, d.bairro ?? null]
  );

  logger.info("Revendedora criada", { id: (rev as Record<string,unknown>).id, nome: d.nome });

  // E-mail de boas-vindas (não-bloqueante)
  if (d.email) {
    sendEmail({
      to:      d.email,
      from:    FROM_PARCEIRAS,
      subject: `Bem-vinda ao Programa Sou Parceira — Papelaria Bibelô! 🤝`,
      html:    buildBoasVindasParceira(d.nome, (d.documento ?? "").replace(/\D/g, ""), desconto),
      tags:    [{ name: "tipo", value: "boas_vindas_parceira" }],
    }).catch(err => logger.error("Erro ao enviar email boas-vindas parceira", { error: (err as Error).message }));
  }

  res.status(201).json(rev);
});

// ── GET /pedidos-recentes — para o sininho do CRM ─────────────────
// IMPORTANTE: deve vir antes de /:id para não ser tratado como UUID

revendedorasRouter.get("/pedidos-recentes", async (_req: Request, res: Response) => {
  const rows = await query(`
    SELECT
      p.id, p.numero_pedido, p.status, p.total, p.criado_em,
      r.nome AS revendedora_nome,
      (SELECT COUNT(*)::int FROM crm.revendedora_pedido_mensagens m
        WHERE m.pedido_id = p.id AND m.lida = FALSE AND m.autor_tipo = 'revendedora') AS mensagens_nao_lidas
    FROM crm.revendedora_pedidos p
    JOIN crm.revendedoras r ON r.id = p.revendedora_id
    WHERE p.criado_em > NOW() - INTERVAL '7 days'
       OR p.status = 'pendente'
    ORDER BY p.criado_em DESC
    LIMIT 10
  `);

  const pendentes = rows.filter(
    (r: Record<string, unknown>) => r.status === "pendente"
  ).length;
  const mensagens_nao_lidas = rows.reduce(
    (s: number, r: Record<string, unknown>) => s + Number(r.mensagens_nao_lidas || 0), 0
  );

  res.json({ data: rows, pendentes, mensagens_nao_lidas });
});

// ── GET /:id ──────────────────────────────────────────────────

revendedorasRouter.get("/:id", async (req: Request, res: Response) => {
  const { id } = req.params;

  const rev = await queryOne(`
    SELECT r.*,
      (SELECT COUNT(*)::int   FROM crm.revendedora_pedidos p   WHERE p.revendedora_id = r.id)                                  AS total_pedidos,
      (SELECT COUNT(*)::int   FROM crm.revendedora_conquistas c WHERE c.revendedora_id = r.id)                                 AS total_conquistas,
      (SELECT COUNT(*)::int   FROM crm.revendedora_estoque e   WHERE e.revendedora_id = r.id)                                  AS total_produtos,
      (SELECT COUNT(*)::int   FROM crm.revendedora_estoque e   WHERE e.revendedora_id = r.id AND e.quantidade <= e.quantidade_minima) AS alertas_estoque,
      (SELECT COALESCE(SUM(total),0) FROM crm.revendedora_pedidos p WHERE p.revendedora_id = r.id AND p.status = 'entregue')   AS total_comprado
    FROM crm.revendedoras r
    WHERE r.id = $1
  `, [id]);

  if (!rev) { res.status(404).json({ error: "Revendedora não encontrada" }); return; }

  const vol = parseFloat((rev as Record<string,unknown>).volume_mes_atual as string || "0");
  res.json({ ...rev, progresso_nivel: calcularProgresso(vol) });
});

// ── PUT /:id ──────────────────────────────────────────────────

revendedorasRouter.put("/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  const parse = updateSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: "Dados inválidos", detalhes: parse.error.errors });
    return;
  }

  const COLS: Record<string, string> = {
    nome: "nome", email: "email", telefone: "telefone",
    documento: "documento", cidade: "cidade", estado: "estado",
    observacao: "observacao", customer_id: "customer_id",
    percentual_desconto: "percentual_desconto", pedido_minimo: "pedido_minimo",
    cep: "cep", logradouro: "logradouro", numero: "numero",
    complemento: "complemento", bairro: "bairro",
  };

  const entries = Object.entries(parse.data).filter(([k, v]) => v !== undefined && k in COLS);
  if (entries.length === 0) { res.status(400).json({ error: "Nenhum campo para atualizar" }); return; }

  const sets   = entries.map(([k], i) => `"${COLS[k]}" = $${i + 1}`);
  const values = entries.map(([, v]) => v);
  values.push(id);

  const updated = await queryOne(
    `UPDATE crm.revendedoras SET ${sets.join(", ")}, atualizado_em = NOW()
     WHERE id = $${values.length} RETURNING *`,
    values
  );
  if (!updated) { res.status(404).json({ error: "Revendedora não encontrada" }); return; }
  res.json(updated);
});

// ── PUT /:id/status ───────────────────────────────────────────

revendedorasRouter.put("/:id/status", async (req: Request, res: Response) => {
  const { id } = req.params;
  const parse = z.object({
    status: z.enum(["pendente", "ativa", "inativa", "suspensa"]),
  }).safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: "Status inválido" }); return; }

  const { status } = parse.data;
  const user = (req as Request & { user?: { email: string } }).user?.email ?? "sistema";

  const updated = await queryOne(
    `UPDATE crm.revendedoras
     SET status = $1::text,
         aprovada_em  = CASE WHEN $1::text = 'ativa' AND aprovada_em IS NULL THEN NOW() ELSE aprovada_em END,
         aprovada_por = CASE WHEN $1::text = 'ativa' AND aprovada_por IS NULL THEN $2 ELSE aprovada_por END,
         atualizado_em = NOW()
     WHERE id = $3 RETURNING *`,
    [status, user, id]
  );
  if (!updated) { res.status(404).json({ error: "Revendedora não encontrada" }); return; }

  logger.info("Status revendedora atualizado", { id, status, user });
  res.json(updated);
});

// ── GET /:id/estoque ──────────────────────────────────────────

revendedorasRouter.get("/:id/estoque", async (req: Request, res: Response) => {
  const { id } = req.params;
  const alertas_only = req.query.alertas === "1";

  const where = alertas_only ? "AND e.quantidade <= e.quantidade_minima" : "";
  const rows = await query(`
    SELECT * FROM crm.revendedora_estoque e
    WHERE e.revendedora_id = $1 ${where}
    ORDER BY e.produto_nome ASC
  `, [id]);

  res.json({ data: rows });
});

// ── POST /:id/estoque ─────────────────────────────────────────

revendedorasRouter.post("/:id/estoque", async (req: Request, res: Response) => {
  const { id } = req.params;
  const parse = estoqueItemSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: "Dados inválidos", detalhes: parse.error.errors });
    return;
  }

  const d = parse.data;
  const item = await queryOne(
    `INSERT INTO crm.revendedora_estoque
       (revendedora_id, bling_produto_id, produto_nome, produto_sku,
        produto_imagem, produto_preco, quantidade, quantidade_minima,
        custo_unitario, preco_sugerido)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (revendedora_id, bling_produto_id)
     DO UPDATE SET
       produto_nome = EXCLUDED.produto_nome,
       quantidade = EXCLUDED.quantidade,
       quantidade_minima = EXCLUDED.quantidade_minima,
       custo_unitario = EXCLUDED.custo_unitario,
       preco_sugerido = EXCLUDED.preco_sugerido,
       atualizado_em = NOW()
     RETURNING *`,
    [id, d.bling_produto_id ?? null, d.produto_nome, d.produto_sku ?? null,
     d.produto_imagem ?? null, d.produto_preco ?? null, d.quantidade,
     d.quantidade_minima, d.custo_unitario ?? null, d.preco_sugerido ?? null]
  );

  res.status(201).json(item);
});

// ── PUT /:id/estoque/:itemId ──────────────────────────────────

revendedorasRouter.put("/:id/estoque/:itemId", async (req: Request, res: Response) => {
  const { id, itemId } = req.params;
  const parse = z.object({
    quantidade: z.number().int().min(0),
    quantidade_minima: z.number().int().min(0).optional(),
  }).safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: "Dados inválidos" }); return; }

  const { quantidade, quantidade_minima } = parse.data;
  const updated = await queryOne(
    `UPDATE crm.revendedora_estoque
     SET quantidade = $1,
         quantidade_minima = COALESCE($2, quantidade_minima),
         atualizado_em = NOW()
     WHERE id = $3 AND revendedora_id = $4 RETURNING *`,
    [quantidade, quantidade_minima ?? null, itemId, id]
  );
  if (!updated) { res.status(404).json({ error: "Item não encontrado" }); return; }
  res.json(updated);
});

// ── DELETE /:id/estoque/:itemId ───────────────────────────────

revendedorasRouter.delete("/:id/estoque/:itemId", async (req: Request, res: Response) => {
  const { id, itemId } = req.params;
  const deleted = await queryOne(
    "DELETE FROM crm.revendedora_estoque WHERE id = $1 AND revendedora_id = $2 RETURNING id",
    [itemId, id]
  );
  if (!deleted) { res.status(404).json({ error: "Item não encontrado" }); return; }
  res.json({ ok: true });
});

// ── GET /:id/pedidos ──────────────────────────────────────────

revendedorasRouter.get("/:id/pedidos", async (req: Request, res: Response) => {
  const { id } = req.params;
  const rows = await query(`
    SELECT * FROM crm.revendedora_pedidos
    WHERE revendedora_id = $1
    ORDER BY criado_em DESC
  `, [id]);
  res.json({ data: rows });
});

// ── POST /:id/pedidos ─────────────────────────────────────────

revendedorasRouter.post("/:id/pedidos", async (req: Request, res: Response) => {
  const { id } = req.params;
  const parse = novoPedidoSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: "Dados inválidos", detalhes: parse.error.errors });
    return;
  }

  const rev = await queryOne<{ percentual_desconto: string }>(
    "SELECT percentual_desconto FROM crm.revendedoras WHERE id = $1", [id]
  );
  if (!rev) { res.status(404).json({ error: "Revendedora não encontrada" }); return; }

  const descPct  = parseFloat(rev.percentual_desconto);
  const { itens, observacao } = parse.data;

  const subtotal = itens.reduce((s, i) => s + i.preco_unitario * i.quantidade, 0);
  const total    = itens.reduce((s, i) => s + i.preco_com_desconto * i.quantidade, 0);
  const descVal  = subtotal - total;

  const numero = await gerarNumeroPedido();

  const pedido = await queryOne(
    `INSERT INTO crm.revendedora_pedidos
       (revendedora_id, numero_pedido, subtotal, desconto_percentual,
        desconto_valor, total, observacao, itens)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING *`,
    [id, numero, subtotal.toFixed(2), descPct, descVal.toFixed(2),
     total.toFixed(2), observacao ?? null, JSON.stringify(itens)]
  );

  // Conquista: primeiro pedido
  const totalPedidos = await queryOne<{ count: string }>(
    "SELECT COUNT(*)::text AS count FROM crm.revendedora_pedidos WHERE revendedora_id = $1", [id]
  );
  if (parseInt(totalPedidos?.count || "0") === 1) {
    await concederConquista(id, "primeiro_pedido", "Primeira Compra — bem-vinda ao Clube Bibelô!", 10);
  }

  logger.info("Pedido revendedora criado", { id, numero, total: total.toFixed(2) });
  res.status(201).json(pedido);
});

// ── PUT /:id/pedidos/:pedidoId/status ─────────────────────────

revendedorasRouter.put("/:id/pedidos/:pedidoId/status", async (req: Request, res: Response) => {
  const { id, pedidoId } = req.params;
  const parse = z.object({
    status:            z.enum(["pendente", "aprovado", "enviado", "entregue", "cancelado"]),
    observacao_admin:  z.string().max(1000).optional(),
  }).safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: "Status inválido" }); return; }

  const { status, observacao_admin } = parse.data;

  const updated = await queryOne(`
    UPDATE crm.revendedora_pedidos SET
      status = $1::text,
      aprovado_em = CASE WHEN $1::text = 'aprovado' AND aprovado_em IS NULL THEN NOW() ELSE aprovado_em END,
      enviado_em  = CASE WHEN $1::text = 'enviado'  AND enviado_em  IS NULL THEN NOW() ELSE enviado_em  END,
      entregue_em = CASE WHEN $1::text = 'entregue' AND entregue_em IS NULL THEN NOW() ELSE entregue_em END,
      atualizado_em = NOW()
    WHERE id = $2 AND revendedora_id = $3
    RETURNING *
  `, [status, pedidoId, id]);

  if (!updated) { res.status(404).json({ error: "Pedido não encontrado" }); return; }

  // Enviar email para revendedora e se necessário adicionar mensagem automática
  const pedidoData = updated as Record<string, unknown>;
  const numPedido  = String(pedidoData.numero_pedido ?? "");

  const rev = await queryOne<{ nome: string; email: string; nivel: string; volume_mes_atual: string }>(
    "SELECT nome, email, nivel, volume_mes_atual FROM crm.revendedoras WHERE id = $1", [id]
  );

  if (rev && status !== "pendente") {
    // Email de atualização de status para a revendedora
    sendEmail({
      to:      rev.email,
      subject: `Pedido ${numPedido} — status atualizado: ${status}`,
      html:    buildStatusEmail(rev.nome, numPedido, status, observacao_admin),
      tags:    [{ name: "tipo", value: "status_pedido" }],
    }).catch(err => logger.error("Erro ao enviar email status pedido", { error: (err as Error).message }));

    // Se admin enviou observação, criar mensagem no thread
    if (observacao_admin) {
      await queryOne(
        `INSERT INTO crm.revendedora_pedido_mensagens
           (pedido_id, autor_tipo, autor_nome, conteudo, lida)
         VALUES ($1, 'admin', 'Papelaria Bibelô', $2, FALSE)`,
        [pedidoId, observacao_admin]
      ).catch(() => {});
    }
  }

  // Se entregue: atualizar volume e verificar nível
  if (status === "entregue") {
    const total = parseFloat(pedidoData.total as string || "0");

    const revAtualizada = await queryOne<{
      id: string; nivel: string; volume_mes_atual: string; total_vendido: string;
    }>(
      `UPDATE crm.revendedoras
       SET volume_mes_atual = volume_mes_atual + $1,
           total_vendido    = total_vendido + $1,
           atualizado_em    = NOW()
       WHERE id = $2 RETURNING id, nivel, volume_mes_atual, total_vendido`,
      [total, id]
    );

    if (revAtualizada) {
      const novoVol   = parseFloat(revAtualizada.volume_mes_atual);
      const { nivel: novoNivel, desconto: novoDesc } = calcularNivel(novoVol);

      if (novoNivel !== revAtualizada.nivel) {
        await queryOne(
          "UPDATE crm.revendedoras SET nivel = $1, percentual_desconto = $2 WHERE id = $3",
          [novoNivel, novoDesc, id]
        );
        if (novoNivel === "bronze") {
          await concederConquista(id, "nivel_bronze", "Chegou ao Bronze! 🥉 Continue crescendo!", 25);
        }
        if (novoNivel === "prata") {
          await concederConquista(id, "nivel_prata", "Subiu para Prata! 🥈 Parabéns!", 50);
        }
        if (novoNivel === "ouro") {
          await concederConquista(id, "nivel_ouro", "Chegou ao Ouro! 🥇 Frete grátis desbloqueado!", 100);
        }
        logger.info("Revendedora subiu de nível", { id, de: revAtualizada.nivel, para: novoNivel });
      }
    }
  }

  res.json(updated);
});

// ── GET /:id/pedidos/:pedidoId/mensagens ──────────────────────────

revendedorasRouter.get("/:id/pedidos/:pedidoId/mensagens", async (req: Request, res: Response) => {
  const { id, pedidoId } = req.params;
  if (!/^[0-9a-f-]{36}$/.test(pedidoId)) {
    res.status(400).json({ error: "ID inválido" }); return;
  }

  const pedido = await queryOne<{ id: string; numero_pedido: string }>(
    "SELECT id, numero_pedido FROM crm.revendedora_pedidos WHERE id = $1 AND revendedora_id = $2",
    [pedidoId, id]
  );
  if (!pedido) { res.status(404).json({ error: "Pedido não encontrado" }); return; }

  const mensagens = await query(
    `SELECT id, autor_tipo, autor_nome, conteudo, lida, criado_em
       FROM crm.revendedora_pedido_mensagens
      WHERE pedido_id = $1
      ORDER BY criado_em ASC`,
    [pedidoId]
  );

  // Marcar mensagens da revendedora como lidas pelo admin
  await query(
    `UPDATE crm.revendedora_pedido_mensagens
        SET lida = TRUE
      WHERE pedido_id = $1 AND autor_tipo = 'revendedora' AND lida = FALSE`,
    [pedidoId]
  );

  res.json({ data: mensagens });
});

// ── POST /:id/pedidos/:pedidoId/mensagens — admin envia mensagem ──

revendedorasRouter.post("/:id/pedidos/:pedidoId/mensagens", async (req: Request, res: Response) => {
  const { id, pedidoId } = req.params;
  if (!/^[0-9a-f-]{36}$/.test(pedidoId)) {
    res.status(400).json({ error: "ID inválido" }); return;
  }

  const parse = z.object({
    conteudo: z.string().trim().min(1).max(2000),
  }).safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: "Conteúdo inválido", detalhes: parse.error.errors }); return;
  }

  const pedido = await queryOne<{ id: string; numero_pedido: string }>(
    "SELECT id, numero_pedido FROM crm.revendedora_pedidos WHERE id = $1 AND revendedora_id = $2",
    [pedidoId, id]
  );
  if (!pedido) { res.status(404).json({ error: "Pedido não encontrado" }); return; }

  const rev = await queryOne<{ nome: string; email: string }>(
    "SELECT nome, email FROM crm.revendedoras WHERE id = $1", [id]
  );
  if (!rev) { res.status(404).json({ error: "Revendedora não encontrada" }); return; }

  const user = (req as Request & { user?: { nome: string; email: string } }).user;
  const autorNome = user?.nome || "Papelaria Bibelô";

  const { conteudo } = parse.data;

  const msg = await queryOne(
    `INSERT INTO crm.revendedora_pedido_mensagens
       (pedido_id, autor_tipo, autor_nome, conteudo, lida)
     VALUES ($1, 'admin', $2, $3, FALSE)
     RETURNING *`,
    [pedidoId, autorNome, conteudo]
  );

  // Email para a revendedora
  sendEmail({
    to:      rev.email,
    subject: `Nova mensagem no pedido ${pedido.numero_pedido} — Papelaria Bibelô`,
    html:    buildMensagemEmail(rev.nome, "Papelaria Bibelô", pedido.numero_pedido, conteudo),
    tags:    [{ name: "tipo", value: "mensagem_admin" }],
  }).catch(err => logger.error("Erro ao enviar email mensagem admin", { error: (err as Error).message }));

  logger.info("Mensagem admin enviada", { revendedoraId: id, pedidoId });
  res.status(201).json(msg);
});

// ── Email builders para revendedoras ────────────────────────────

function buildStatusEmail(
  revNome: string,
  numeroPedido: string,
  status: string,
  observacao?: string | null
): string {
  const STATUS_LABELS: Record<string, string> = {
    aprovado:  "✅ Aprovado",
    enviado:   "🚚 Enviado",
    entregue:  "📦 Entregue",
    cancelado: "❌ Cancelado",
  };
  const label = STATUS_LABELS[status] ?? status;
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#ffe5ec;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#ffe5ec;padding:32px 16px;">
<tr><td align="center">
<table width="480" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;max-width:480px;width:100%;">
  <tr><td style="background:#fe68c4;padding:24px 32px;">
    <p style="margin:0;color:#fff;font-size:20px;font-weight:700;">🎀 Papelaria Bibelô</p>
    <p style="margin:6px 0 0;color:rgba(255,255,255,0.85);font-size:13px;">Atualização do seu pedido</p>
  </td></tr>
  <tr><td style="padding:28px 32px;">
    <p style="margin:0 0 6px;font-size:14px;color:#555;">Olá, <strong>${escHtml(revNome)}</strong>!</p>
    <p style="margin:0 0 16px;font-size:13px;color:#777;">Seu pedido <strong>${escHtml(numeroPedido)}</strong> foi atualizado:</p>
    <div style="text-align:center;padding:20px;background:#fdf6f9;border-radius:12px;margin:0 0 16px;">
      <p style="margin:0;font-size:24px;font-weight:800;color:#333;">${escHtml(label)}</p>
    </div>
    ${observacao ? `<p style="font-size:13px;color:#555;background:#fff7c1;border-radius:8px;padding:12px 16px;margin:0;"><strong>Mensagem:</strong> ${escHtml(observacao)}</p>` : ""}
    <p style="margin:20px 0 0;font-size:12px;color:#aaa;">Acesse o portal Sou Parceira para mais detalhes.</p>
  </td></tr>
  <tr><td style="background:#f9f9f9;padding:14px 32px;text-align:center;border-top:1px solid #f0e0e8;">
    <p style="margin:0;color:#aaa;font-size:11px;">Papelaria Bibelô · Timbó/SC</p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

function buildMensagemEmail(
  destinatario: string,
  remetente: string,
  numeroPedido: string,
  conteudo: string
): string {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#ffe5ec;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#ffe5ec;padding:32px 16px;">
<tr><td align="center">
<table width="480" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;max-width:480px;width:100%;">
  <tr><td style="background:#fe68c4;padding:24px 32px;">
    <p style="margin:0;color:#fff;font-size:20px;font-weight:700;">🎀 Papelaria Bibelô</p>
    <p style="margin:6px 0 0;color:rgba(255,255,255,0.85);font-size:13px;">Nova mensagem — Pedido ${escHtml(numeroPedido)}</p>
  </td></tr>
  <tr><td style="padding:28px 32px;">
    <p style="margin:0 0 4px;font-size:14px;color:#555;">Olá, <strong>${escHtml(destinatario)}</strong>!</p>
    <p style="margin:6px 0 16px;font-size:13px;color:#777;"><strong>${escHtml(remetente)}</strong> enviou uma mensagem:</p>
    <div style="background:#fdf6f9;border-left:4px solid #fe68c4;border-radius:0 8px 8px 0;padding:14px 16px;">
      <p style="margin:0;font-size:14px;color:#333;line-height:1.6;">${escHtml(conteudo)}</p>
    </div>
    <p style="margin:16px 0 0;font-size:12px;color:#aaa;">Acesse o portal para responder.</p>
  </td></tr>
  <tr><td style="background:#f9f9f9;padding:14px 32px;text-align:center;border-top:1px solid #f0e0e8;">
    <p style="margin:0;color:#aaa;font-size:11px;">Papelaria Bibelô · Timbó/SC</p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

// ── GET /:id/conquistas ───────────────────────────────────────

revendedorasRouter.get("/:id/conquistas", async (req: Request, res: Response) => {
  const { id } = req.params;
  const rows = await query(`
    SELECT * FROM crm.revendedora_conquistas
    WHERE revendedora_id = $1
    ORDER BY criado_em ASC
  `, [id]);
  res.json({ data: rows });
});

// ── POST /:id/gerar-token — gera/renova token do portal B2B ─

revendedorasRouter.post("/:id/gerar-token", async (req: Request, res: Response) => {
  const { id } = req.params;

  const rev = await queryOne<{ id: string; nome: string }>(
    "SELECT id, nome FROM crm.revendedoras WHERE id = $1",
    [id]
  );
  if (!rev) { res.status(404).json({ error: "Revendedora não encontrada" }); return; }

  const token = crypto.randomBytes(32).toString("hex");
  const expira = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000); // 90 dias

  await queryOne(
    `UPDATE crm.revendedoras
     SET portal_token = $1, portal_token_expira_em = $2, atualizado_em = NOW()
     WHERE id = $3`,
    [token, expira, id]
  );

  logger.info("Token portal gerado", { id, nome: rev.nome });
  res.json({
    portal_token: token,
    portal_token_expira_em: expira.toISOString(),
    link: `/portal/${token}`,
  });
});
