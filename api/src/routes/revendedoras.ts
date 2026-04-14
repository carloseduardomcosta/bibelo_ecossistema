import { Router, Request, Response } from "express";
import crypto from "crypto";
import { z } from "zod";
import axios from "axios";
import { query, queryOne } from "../db";
import { logger } from "../utils/logger";
import { authMiddleware } from "../middleware/auth";
import { sendEmail } from "../integrations/resend/email";
import { escHtml } from "../utils/sanitize";
import { getValidToken, BLING_API } from "../integrations/bling/auth";

export const revendedorasRouter = Router();
revendedorasRouter.use(authMiddleware);

// ── Helpers ──────────────────────────────────────────────────

// Estrutura de níveis:
//   iniciante : volume < 300     → 0%, frete por conta da revendedora (transitório — sem compra mínima ainda)
//   bronze    : 300–599          → 15%, frete por conta da revendedora (pedido mínimo R$300)
//   prata     : 600–1199         → 20%, frete por conta da revendedora
//   ouro      : 1200–2999        → 25%, frete 50/50 (Bibelô arca metade)
//   diamante  : 3000+            → 30%, frete GRÁTIS (Bibelô arca 100%)
function calcularNivel(volume: number): { nivel: string; desconto: number } {
  if (volume >= 3000) return { nivel: "diamante",  desconto: 30 };
  if (volume >= 1200) return { nivel: "ouro",      desconto: 25 };
  if (volume >= 600)  return { nivel: "prata",     desconto: 20 };
  if (volume >= 300)  return { nivel: "bronze",    desconto: 15 };
  return                    { nivel: "iniciante",  desconto: 0  };
}

function calcularProgresso(volume: number): {
  proximo: string | null;
  meta: number;
  faltam: number;
  percentual: number;
} {
  if (volume >= 3000) return { proximo: null,       meta: 3000, faltam: 0,               percentual: 100 };
  if (volume >= 1200) {
    const faltam = Math.max(0, 3000 - volume);
    const percentual = Math.min(100, Math.max(0, ((volume - 1200) / 1800) * 100));
    return { proximo: "diamante", meta: 3000, faltam, percentual };
  }
  if (volume >= 600) {
    const faltam = Math.max(0, 1200 - volume);
    const percentual = Math.min(100, Math.max(0, ((volume - 600) / 600) * 100));
    return { proximo: "ouro",     meta: 1200, faltam, percentual };
  }
  if (volume >= 150) {
    const faltam = Math.max(0, 600 - volume);
    const percentual = Math.min(100, Math.max(0, ((volume - 150) / 450) * 100));
    return { proximo: "prata",    meta: 600,  faltam, percentual };
  }
  const faltam = Math.max(0, 300 - volume);
  const percentual = Math.min(100, Math.max(0, (volume / 300) * 100));
  return { proximo: "bronze",   meta: 300,  faltam, percentual };
}

// ── E-mail de boas-vindas — disparado ao cadastrar revendedora ────

const LOGO_URL = "https://webhook.papelariabibelo.com.br/logo.png";
const PORTAL_URL = "https://souparceira.papelariabibelo.com.br";
const FROM_PARCEIRAS = "Sou Parceira Bibelô <souparceira@papelariabibelo.com.br>";

function buildBoasVindasParceira(nome: string, cpf: string, desconto: number, nivel = "iniciante"): string {
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
                ${nivelRow("✨", "Iniciante", 0,  "1º pedido ≥ R$300",       "Por sua conta",  nivel === "iniciante")}
                ${nivelRow("🥉", "Bronze",    15, "R$300 a R$599/mês",       "Por sua conta",  nivel === "bronze")}
                ${nivelRow("🥈", "Prata",     20, "R$600 a R$1.199/mês",     "Por sua conta",  nivel === "prata")}
                ${nivelRow("🥇", "Ouro",      25, "R$1.200 a R$2.999/mês",   "Frete 50/50",    nivel === "ouro")}
                ${nivelRow("💎", "Diamante",  30, "R$3.000+/mês",            "Frete grátis",   nivel === "diamante")}
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

/** Recalcula volume do mês corrente a partir dos pedidos e ajusta nível/desconto. */
async function recalcularVolume(revendedoraId: string): Promise<void> {
  const result = await queryOne<{ volume: string }>(
    `SELECT COALESCE(SUM(total), 0)::text AS volume
       FROM crm.revendedora_pedidos
      WHERE revendedora_id = $1
        AND status IN ('aprovado', 'enviado', 'entregue')
        AND DATE_TRUNC('month', criado_em) = DATE_TRUNC('month', NOW())`,
    [revendedoraId]
  );
  const volume = parseFloat(result?.volume || "0");
  const { nivel, desconto } = calcularNivel(volume);
  await queryOne(
    `UPDATE crm.revendedoras
        SET volume_mes_atual  = $1,
            total_vendido     = GREATEST(total_vendido, $1),
            nivel             = $2,
            percentual_desconto = $3,
            atualizado_em     = NOW()
      WHERE id = $4`,
    [volume, nivel, desconto, revendedoraId]
  );
}

/** Busca ou cria o contato da revendedora no Bling pelo CPF. */
async function buscarOuCriarContatoBling(
  token: string,
  nome: string,
  cpf: string,
  email: string,
  telefone: string | null
): Promise<number | null> {
  try {
    // Pesquisa pelo CPF
    const cpfDigits = cpf.replace(/\D/g, "");
    const { data: search } = await axios.get(
      `${BLING_API}/contatos?pesquisa=${cpfDigits}&limite=5`,
      { headers: { Authorization: `Bearer ${token}` }, timeout: 10000 }
    );
    const found = (search?.data ?? []).find(
      (c: { id: number; numeroDocumento?: string }) =>
        c.numeroDocumento?.replace(/\D/g, "") === cpfDigits
    );
    if (found?.id) return found.id;

    // Cria o contato
    const body: Record<string, unknown> = {
      nome,
      tipoPessoa: "F",
      numeroDocumento: cpfDigits,
      email,
    };
    if (telefone) body.telefone = telefone.replace(/\D/g, "").slice(0, 11);

    const { data: created } = await axios.post(`${BLING_API}/contatos`, body, {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      timeout: 10000,
    });
    return created?.data?.id ?? null;
  } catch (err) {
    logger.error("Erro ao buscar/criar contato Bling", { error: (err as Error).message });
    return null;
  }
}

/** Cria pedido de venda no Bling quando um pedido B2B é aprovado. */
async function sincronizarPedidoBling(
  pedidoId: string,
  revendedoraId: string
): Promise<void> {
  try {
    const pedido = await queryOne<{
      numero_pedido: string;
      total: string;
      desconto_percentual: string;
      observacao: string | null;
      itens: Array<{ produto_nome: string; produto_sku: string; quantidade: number; preco_com_desconto: number }>;
    }>(
      "SELECT numero_pedido, total, desconto_percentual, observacao, itens FROM crm.revendedora_pedidos WHERE id = $1",
      [pedidoId]
    );
    if (!pedido) return;

    const rev = await queryOne<{
      nome: string; email: string; documento: string | null; telefone: string | null;
    }>(
      "SELECT nome, email, documento, telefone FROM crm.revendedoras WHERE id = $1",
      [revendedoraId]
    );
    if (!rev?.documento) {
      logger.warn("Revendedora sem CPF — pedido Bling não criado", { pedidoId, revendedoraId });
      return;
    }

    const token = await getValidToken();

    const contatoId = await buscarOuCriarContatoBling(
      token, rev.nome, rev.documento, rev.email, rev.telefone
    );
    if (!contatoId) {
      logger.warn("Não foi possível obter contato Bling — pedido B2B não sincronizado", { pedidoId });
      return;
    }

    const itens = (pedido.itens as Array<{
      produto_nome: string; produto_sku: string; quantidade: number; preco_com_desconto: number;
    }>).map(item => ({
      codigo:      item.produto_sku || undefined,
      descricao:   item.produto_nome,
      unidade:     "UN",
      quantidade:  item.quantidade,
      valor:       Number(item.preco_com_desconto),
    }));

    const hoje = new Date().toISOString().slice(0, 10);
    const obsBase = `Pedido B2B portal Sou Parceira — ${pedido.numero_pedido}`;
    const obs = pedido.observacao
      ? `${obsBase}\n${pedido.observacao}`
      : obsBase;

    const { data: resp } = await axios.post(
      `${BLING_API}/pedidos/vendas`,
      {
        contato:      { id: contatoId },
        data:         hoje,
        observacoes:  obs,
        observacoesInternas: `Pedido B2B criado automaticamente pelo BibelôCRM`,
        itens,
      },
      {
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        timeout: 15000,
      }
    );

    const blingId = resp?.data?.id;
    if (blingId) {
      await queryOne(
        "UPDATE crm.revendedora_pedidos SET bling_pedido_id = $1 WHERE id = $2",
        [blingId, pedidoId]
      );
      logger.info("Pedido B2B sincronizado com Bling", { pedidoId, blingId, numeroPedido: pedido.numero_pedido });
    }
  } catch (err) {
    // Não-bloqueante: log e segue
    logger.error("Erro ao sincronizar pedido B2B com Bling", {
      pedidoId,
      error: (err as Error).message,
    });
  }
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
  nivel:  z.enum(["iniciante", "bronze", "prata", "ouro", "diamante"]).optional(),
});

// ── GET /stats ────────────────────────────────────────────────

revendedorasRouter.get("/stats", async (_req: Request, res: Response) => {
  const stats = await queryOne<{
    total: string; ativas: string; pendentes: string;
    volume_mes: string; pedidos_pendentes: string;
    nivel_iniciante: string; nivel_bronze: string; nivel_prata: string; nivel_ouro: string; nivel_diamante: string;
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
      COUNT(*) FILTER (WHERE nivel = 'ouro')::text           AS nivel_ouro,
      COUNT(*) FILTER (WHERE nivel = 'diamante')::text       AS nivel_diamante
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

  const desconto = d.percentual_desconto ?? 0; // novas revendedoras entram como Iniciante (sem desconto até 1º pedido ≥ R$300)
  const minimo   = d.pedido_minimo ?? 300;
  const criador  = (req as Request & { user?: { email: string } }).user?.email ?? "sistema";

  const rev = await queryOne(
    `INSERT INTO crm.revendedoras
       (nome, email, telefone, documento, cidade, estado, observacao,
        customer_id, percentual_desconto, pedido_minimo,
        cep, logradouro, numero, complemento, bairro,
        status, aprovada_em, aprovada_por)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,
             'ativa', NOW(), $16)
     RETURNING *`,
    [d.nome, d.email, d.telefone ?? null, d.documento ?? null,
     d.cidade ?? null, d.estado ?? null, d.observacao ?? null,
     d.customer_id ?? null, desconto, minimo,
     d.cep ?? null, d.logradouro ?? null, d.numero ?? null,
     d.complemento ?? null, d.bairro ?? null, criador]
  );

  logger.info("Revendedora criada", { id: (rev as Record<string,unknown>).id, nome: d.nome });

  // E-mail de boas-vindas (não-bloqueante)
  if (d.email) {
    const revId = (rev as Record<string, unknown>).id as string;
    const NIVEL_LABELS: Record<string, string> = { iniciante: "Iniciante", bronze: "Bronze", prata: "Prata", ouro: "Ouro", diamante: "Diamante" };
    const tabelaNiveis = buildTabelaNiveis(desconto);
    getRenderedEmailTemplate("revendedoras_boas_vindas", {
      nome:         d.nome,
      cpf_formatado: (d.documento ?? "").replace(/\D/g, "").replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4") || (d.documento ?? ""),
      desconto:     String(desconto),
      nivel_label:  NIVEL_LABELS["iniciante"] ?? "Iniciante",
      tabela_niveis: tabelaNiveis,
    }).then(async tpl => {
      await sendEmail({
        to:      d.email!,
        from:    FROM_PARCEIRAS,
        subject: tpl?.subject ?? `Bem-vinda ao Programa Sou Parceira — Papelaria Bibelô! 🤝`,
        html:    tpl?.html    ?? buildBoasVindasParceira(d.nome, (d.documento ?? "").replace(/\D/g, ""), desconto, "iniciante"),
        tags:    [{ name: "tipo", value: "boas_vindas_parceira" }],
      });
      // Vincula customer_id se não foi passado e registra interação
      const customer = await queryOne<{ id: string }>(
        "SELECT id FROM crm.customers WHERE LOWER(email) = LOWER($1)", [d.email]
      );
      if (customer) {
        await query(
          "UPDATE crm.revendedoras SET customer_id = $1 WHERE id = $2 AND customer_id IS NULL",
          [customer.id, revId]
        );
        await query(
          `INSERT INTO crm.interactions (customer_id, tipo, canal, descricao, metadata)
           VALUES ($1, 'email_enviado', 'email', 'Email de boas-vindas Sou Parceira enviado',
                   $2::jsonb)`,
          [customer.id, JSON.stringify({ template: "revendedoras_boas_vindas", assunto: tpl?.subject ?? "Bem-vinda ao Programa Sou Parceira — Papelaria Bibelô! 🤝" })]
        );
      }
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

// ── GET /email-templates — lista os 3 templates de revendedoras ──

revendedorasRouter.get("/email-templates", async (_req: Request, res: Response) => {
  const rows = await query<{ id: string; slug: string; nome: string; assunto: string; html: string; variaveis: unknown }>(
    `SELECT id, slug, nome, assunto, html, variaveis
     FROM marketing.templates
     WHERE categoria = 'revendedoras' AND ativo = true
     ORDER BY criado_em ASC`
  );
  res.json(rows);
});

// ── PUT /email-templates/:slug — atualiza assunto e HTML ─────────

const emailTemplateSchema = z.object({
  assunto: z.string().min(1).max(255),
  html:    z.string().min(10),
});

revendedorasRouter.put("/email-templates/:slug", async (req: Request, res: Response) => {
  const { slug } = req.params;
  const d = emailTemplateSchema.parse(req.body);

  const tpl = await queryOne<{ id: string }>(
    `UPDATE marketing.templates SET assunto = $1, html = $2
     WHERE slug = $3 AND categoria = 'revendedoras' AND ativo = true
     RETURNING id`,
    [d.assunto, d.html, slug]
  );
  if (!tpl) return res.status(404).json({ error: "Template não encontrado" });

  logger.info("Template email revendedora atualizado", { slug });
  res.json({ ok: true });
});

// ── GET /acessos-portal-recentes — últimos logins via OTP (sininho) ─

revendedorasRouter.get("/acessos-portal-recentes", async (_req: Request, res: Response) => {
  const rows = await query(
    `SELECT id, titulo, corpo, criado_em
       FROM public.notificacoes
      WHERE tipo = 'acesso_portal_parceira'
        AND criado_em > NOW() - INTERVAL '48 hours'
      ORDER BY criado_em DESC
      LIMIT 15`,
    []
  );
  res.json({ data: rows });
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

  // Busca status anterior para detectar primeira aprovação
  const anterior = await queryOne<{
    status: string; email: string; nome: string; documento: string | null; nivel: string; percentual_desconto: number;
  }>(
    "SELECT status, email, nome, documento, nivel, percentual_desconto FROM crm.revendedoras WHERE id = $1",
    [id]
  );

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

  const rev = await queryOne<{ percentual_desconto: string; pedido_minimo: string }>(
    "SELECT percentual_desconto, pedido_minimo FROM crm.revendedoras WHERE id = $1", [id]
  );
  if (!rev) { res.status(404).json({ error: "Revendedora não encontrada" }); return; }

  const descPct  = parseFloat(rev.percentual_desconto);
  const minimo   = parseFloat(rev.pedido_minimo ?? "300");
  const { itens, observacao } = parse.data;

  const subtotal = itens.reduce((s, i) => s + i.preco_unitario * i.quantidade, 0);

  // ── Projeção de nível ──────────────────────────────────────────
  // Se o volume acumulado do mês + este pedido cruzar um threshold,
  // aplica o desconto melhor já neste pedido.
  const volumeRow = await queryOne<{ volume: string }>(
    `SELECT COALESCE(SUM(total), 0)::text AS volume
       FROM crm.revendedora_pedidos
      WHERE revendedora_id = $1
        AND status IN ('aprovado', 'enviado', 'entregue')
        AND DATE_TRUNC('month', criado_em) = DATE_TRUNC('month', NOW())`,
    [id]
  );
  const volumeAcumulado = parseFloat(volumeRow?.volume || "0");
  const totalProvisorio = itens.reduce((s, i) => s + i.preco_com_desconto * i.quantidade, 0);
  const volumeProjetado = volumeAcumulado + totalProvisorio;
  const { nivel: nivelProjetado, desconto: descontoProjetado } = calcularNivel(volumeProjetado);

  let descPctFinal = descPct;
  let nivelUpgrade: { de: string; para: string } | null = null;
  let itensFinais = itens;

  if (descontoProjetado > descPct) {
    descPctFinal = descontoProjetado;
    const nivelAtual = await queryOne<{ nivel: string }>(
      "SELECT nivel FROM crm.revendedoras WHERE id = $1", [id]
    );
    nivelUpgrade = { de: nivelAtual?.nivel ?? "iniciante", para: nivelProjetado };
    itensFinais = itens.map(i => ({
      ...i,
      preco_com_desconto: Math.round(i.preco_unitario * (1 - descPctFinal / 100) * 100) / 100,
    }));
  }
  // ──────────────────────────────────────────────────────────────

  const total  = itensFinais.reduce((s, i) => s + i.preco_com_desconto * i.quantidade, 0);
  const descVal = subtotal - total;

  if (total < minimo) {
    res.status(400).json({
      error: `Pedido mínimo é R$ ${minimo.toFixed(2).replace(".", ",")}. Total atual: R$ ${total.toFixed(2).replace(".", ",")}`,
      pedido_minimo: minimo,
      total_atual: total,
    });
    return;
  }

  const numero = await gerarNumeroPedido();

  const pedido = await queryOne(
    `INSERT INTO crm.revendedora_pedidos
       (revendedora_id, numero_pedido, subtotal, desconto_percentual,
        desconto_valor, total, observacao, itens)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING *`,
    [id, numero, subtotal.toFixed(2), descPctFinal, descVal.toFixed(2),
     total.toFixed(2), observacao ?? null, JSON.stringify(itensFinais)]
  );

  // Conquista: primeiro pedido
  const totalPedidos = await queryOne<{ count: string }>(
    "SELECT COUNT(*)::text AS count FROM crm.revendedora_pedidos WHERE revendedora_id = $1", [id]
  );
  if (parseInt(totalPedidos?.count || "0") === 1) {
    await concederConquista(id, "primeiro_pedido", "Primeira Compra — bem-vinda ao Clube Bibelô!", 10);
  }

  logger.info("Pedido revendedora criado", { id, numero, total: total.toFixed(2), nivelUpgrade });
  res.status(201).json({ ...pedido, nivel_upgrade: nivelUpgrade });
});

// ── PUT /:id/pedidos/:pedidoId/status ─────────────────────────

revendedorasRouter.put("/:id/pedidos/:pedidoId/status", async (req: Request, res: Response) => {
  const { id, pedidoId } = req.params;
  const parse = z.object({
    status:           z.enum(["pendente", "aprovado", "enviado", "entregue", "cancelado"]),
    observacao_admin: z.string().max(1000).optional(),
    codigo_rastreio:  z.string().max(100).trim().optional(),
  }).safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: "Status inválido" }); return; }

  const { status, observacao_admin, codigo_rastreio } = parse.data;

  // Monta URL de rastreio Melhor Envio quando há código
  const urlRastreio = codigo_rastreio
    ? `https://melhorrastreio.com.br/rastreio/${codigo_rastreio.trim()}`
    : undefined;

  const updated = await queryOne(`
    UPDATE crm.revendedora_pedidos SET
      status           = $1::text,
      aprovado_em      = CASE WHEN $1::text = 'aprovado' AND aprovado_em IS NULL THEN NOW() ELSE aprovado_em END,
      enviado_em       = CASE WHEN $1::text = 'enviado'  AND enviado_em  IS NULL THEN NOW() ELSE enviado_em  END,
      entregue_em      = CASE WHEN $1::text = 'entregue' AND entregue_em IS NULL THEN NOW() ELSE entregue_em END,
      codigo_rastreio  = COALESCE($4, codigo_rastreio),
      url_rastreio     = COALESCE($5, url_rastreio),
      atualizado_em    = NOW()
    WHERE id = $2 AND revendedora_id = $3
    RETURNING *
  `, [status, pedidoId, id, codigo_rastreio ?? null, urlRastreio ?? null]);

  if (!updated) { res.status(404).json({ error: "Pedido não encontrado" }); return; }

  const pedidoData = updated as Record<string, unknown>;
  const numPedido  = String(pedidoData.numero_pedido ?? "");
  const rastreioUrl = String(pedidoData.url_rastreio ?? "");

  const rev = await queryOne<{ nome: string; email: string }>(
    "SELECT nome, email FROM crm.revendedoras WHERE id = $1", [id]
  );

  if (rev && status !== "pendente") {
    const STATUS_LABELS: Record<string, string> = {
      aprovado: "✅ Aprovado", enviado: "🚚 Enviado", entregue: "📦 Entregue", cancelado: "❌ Cancelado",
    };
    const statusLabel = STATUS_LABELS[status] ?? status;
    const obsBlock    = observacao_admin
      ? `<p style="font-size:13px;color:#555;background:#fff7c1;border-radius:8px;padding:12px 16px;margin:0 0 12px;"><strong>Mensagem:</strong> ${escHtml(observacao_admin)}</p>`
      : "";
    const rastreioBlock = rastreioUrl
      ? `<p style="font-size:13px;color:#555;margin:0;"><strong>Rastreio:</strong> <a href="${rastreioUrl}" style="color:#fe68c4;">${escHtml(String(pedidoData.codigo_rastreio ?? ""))}</a></p>`
      : "";

    getRenderedEmailTemplate("revendedoras_status_pedido", {
      nome:             rev.nome,
      numero_pedido:    numPedido,
      status_label:     statusLabel,
      observacao_block: obsBlock + rastreioBlock,
    }).then(tpl => sendEmail({
      to:      rev!.email,
      subject: tpl?.subject ?? `Pedido ${numPedido} — status atualizado: ${status}`,
      html:    tpl?.html    ?? buildStatusEmail(rev!.nome, numPedido, status, observacao_admin),
      tags:    [{ name: "tipo", value: "status_pedido" }],
    })).catch(err => logger.error("Erro ao enviar email status pedido", { error: (err as Error).message }));

    if (observacao_admin) {
      queryOne(
        `INSERT INTO crm.revendedora_pedido_mensagens
           (pedido_id, autor_tipo, autor_nome, conteudo, lida)
         VALUES ($1, 'admin', 'Papelaria Bibelô', $2, FALSE)`,
        [pedidoId, observacao_admin]
      ).catch(() => {});
    }
  }

  // Volume automático: recalcula sempre que o status afeta contagem
  if (["aprovado", "enviado", "entregue", "cancelado"].includes(status)) {
    const nivelAntes = await queryOne<{ nivel: string }>(
      "SELECT nivel FROM crm.revendedoras WHERE id = $1", [id]
    );
    await recalcularVolume(id);
    const nivelDepois = await queryOne<{ nivel: string }>(
      "SELECT nivel FROM crm.revendedoras WHERE id = $1", [id]
    );
    if (nivelAntes && nivelDepois && nivelAntes.nivel !== nivelDepois.nivel) {
      const novoNivel = nivelDepois.nivel;
      if (novoNivel === "bronze")   await concederConquista(id, "nivel_bronze",   "Chegou ao Bronze! 🥉 Continue crescendo!", 25);
      if (novoNivel === "prata")    await concederConquista(id, "nivel_prata",    "Subiu para Prata! 🥈 Parabéns!", 50);
      if (novoNivel === "ouro")     await concederConquista(id, "nivel_ouro",     "Chegou ao Ouro! 🥇 Frete grátis desbloqueado!", 100);
      if (novoNivel === "diamante") await concederConquista(id, "nivel_diamante", "Diamante! 💎 Você é top de linha Bibelô!", 200);
      logger.info("Revendedora mudou de nível", { id, de: nivelAntes.nivel, para: novoNivel });
    }
  }

  // Integração Bling: cria pedido de venda ao aprovar (não-bloqueante)
  if (status === "aprovado") {
    const jaTemBling = !!(pedidoData.bling_pedido_id);
    if (!jaTemBling) {
      sincronizarPedidoBling(pedidoId, id).catch(() => {});
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
  getRenderedEmailTemplate("revendedoras_nova_mensagem", {
    destinatario:  rev.nome,
    remetente:     "Papelaria Bibelô",
    numero_pedido: pedido.numero_pedido,
    conteudo:      escHtml(conteudo),
  }).then(tpl => sendEmail({
    to:      rev!.email,
    subject: tpl?.subject ?? `Nova mensagem no pedido ${pedido.numero_pedido} — Papelaria Bibelô`,
    html:    tpl?.html    ?? buildMensagemEmail(rev!.nome, "Papelaria Bibelô", pedido.numero_pedido, conteudo),
    tags:    [{ name: "tipo", value: "mensagem_admin" }],
  })).catch(err => logger.error("Erro ao enviar email mensagem admin", { error: (err as Error).message }));

  logger.info("Mensagem admin enviada", { revendedoraId: id, pedidoId });
  res.status(201).json(msg);
});

/** Gera a tabela HTML comparativa de níveis para o email de boas-vindas.
 *  Usado como valor da variável {{tabela_niveis}} no template do banco. */
function buildTabelaNiveis(descontoAtual: number): string {
  const niveis = [
    { emoji: "✨", label: "Iniciante", desc: 0,   meta: "1º pedido ≥ R$300",  frete: "Por conta da revendedora" },
    { emoji: "🥉", label: "Bronze",    desc: 15,  meta: "R$300–599/mês",      frete: "Por conta da revendedora" },
    { emoji: "🥈", label: "Prata",     desc: 20,  meta: "R$600–1199/mês",     frete: "Por conta da revendedora" },
    { emoji: "🥇", label: "Ouro",      desc: 25,  meta: "R$1200–2999/mês",    frete: "Frete 50/50" },
    { emoji: "💎", label: "Diamante",  desc: 30,  meta: "R$3000+/mês",        frete: "Frete grátis" },
  ];
  const rows = niveis.map(n => {
    const destaque = n.desc === descontoAtual;
    const freteColor = n.frete === "Frete grátis" ? "#16a34a" : n.frete === "Frete 50/50" ? "#d97706" : "#888";
    const freteEmoji = n.frete === "Frete grátis" ? "✅" : n.frete === "Frete 50/50" ? "🤝" : "📦";
    return `<tr style="${destaque ? "background:#ffe5ec;" : ""}">
      <td style="padding:9px 12px;border-bottom:1px solid #fce8f0;font-size:16px;">${n.emoji}</td>
      <td style="padding:9px 0;border-bottom:1px solid #fce8f0;">
        <strong style="color:#2d2d2d;font-size:13px;">${n.label}</strong>
        <span style="color:#888;font-size:11px;"> · ${n.meta}</span>
      </td>
      <td style="padding:9px 12px;border-bottom:1px solid #fce8f0;text-align:right;">
        <strong style="color:#fe68c4;font-size:14px;">${n.desc}% OFF</strong>
      </td>
      <td style="padding:9px 12px;border-bottom:1px solid #fce8f0;white-space:nowrap;font-size:11px;color:${freteColor};">
        ${freteEmoji} ${n.frete}
      </td>
    </tr>`;
  }).join("");
  return `<table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #fce8f0;border-radius:10px;overflow:hidden;margin:16px 0;font-family:Arial,sans-serif;">${rows}</table>`;
}

// ── Helpers de templates de email editáveis ──────────────────────

/** Busca template do banco pelo slug e substitui placeholders.
 *  Retorna null se não encontrado (fallback para funções hardcoded). */
async function getRenderedEmailTemplate(
  slug: string,
  vars: Record<string, string>
): Promise<{ subject: string; html: string } | null> {
  const tpl = await queryOne<{ assunto: string; html: string }>(
    `SELECT assunto, html FROM marketing.templates
     WHERE slug = $1 AND ativo = true LIMIT 1`,
    [slug]
  );
  if (!tpl) return null;

  let subject = tpl.assunto;
  let html    = tpl.html;
  for (const [key, val] of Object.entries(vars)) {
    const placeholder = new RegExp(`\\{\\{${key}\\}\\}`, "g");
    subject = subject.replace(placeholder, escHtml(val));
    html    = html.replace(placeholder, val); // HTML já contém escaping necessário
  }
  return { subject, html };
}

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
