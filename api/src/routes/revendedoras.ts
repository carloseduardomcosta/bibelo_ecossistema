import { Router, Request, Response } from "express";
import crypto from "crypto";
import { z } from "zod";
import { query, queryOne } from "../db";
import { logger } from "../utils/logger";
import { authMiddleware } from "../middleware/auth";

export const revendedorasRouter = Router();
revendedorasRouter.use(authMiddleware);

// ── Helpers ──────────────────────────────────────────────────

function calcularNivel(volume: number): { nivel: string; desconto: number } {
  if (volume >= 1200) return { nivel: "ouro", desconto: 30 };
  if (volume >= 600)  return { nivel: "prata", desconto: 25 };
  return { nivel: "bronze", desconto: 20 };
}

function calcularProgresso(volume: number): {
  proximo: string | null;
  meta: number;
  faltam: number;
  percentual: number;
} {
  if (volume < 600) {
    const faltam = Math.max(0, 600 - volume);
    const percentual = Math.min(100, Math.max(0, ((volume - 300) / 300) * 100));
    return { proximo: "prata", meta: 600, faltam, percentual };
  }
  if (volume < 1200) {
    const faltam = Math.max(0, 1200 - volume);
    const percentual = Math.min(100, Math.max(0, ((volume - 600) / 600) * 100));
    return { proximo: "ouro", meta: 1200, faltam, percentual };
  }
  return { proximo: null, meta: 1200, faltam: 0, percentual: 100 };
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
  nivel:  z.enum(["bronze", "prata", "ouro"]).optional(),
});

// ── GET /stats ────────────────────────────────────────────────

revendedorasRouter.get("/stats", async (_req: Request, res: Response) => {
  const stats = await queryOne<{
    total: string; ativas: string; pendentes: string;
    volume_mes: string; pedidos_pendentes: string;
    nivel_bronze: string; nivel_prata: string; nivel_ouro: string;
  }>(`
    SELECT
      COUNT(*)::text                                          AS total,
      COUNT(*) FILTER (WHERE status = 'ativa')::text         AS ativas,
      COUNT(*) FILTER (WHERE status = 'pendente')::text      AS pendentes,
      COALESCE(SUM(volume_mes_atual) FILTER (WHERE status = 'ativa'), 0)::text AS volume_mes,
      (SELECT COUNT(*)::text FROM crm.revendedora_pedidos WHERE status = 'pendente') AS pedidos_pendentes,
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

  const desconto = d.percentual_desconto ?? 20;
  const minimo   = d.pedido_minimo ?? 300;

  const rev = await queryOne(
    `INSERT INTO crm.revendedoras
       (nome, email, telefone, documento, cidade, estado, observacao,
        customer_id, percentual_desconto, pedido_minimo)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING *`,
    [d.nome, d.email, d.telefone ?? null, d.documento ?? null,
     d.cidade ?? null, d.estado ?? null, d.observacao ?? null,
     d.customer_id ?? null, desconto, minimo]
  );

  logger.info("Revendedora criada", { id: (rev as Record<string,unknown>).id, nome: d.nome });
  res.status(201).json(rev);
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
     SET status = $1,
         aprovada_em  = CASE WHEN $1 = 'ativa' AND aprovada_em IS NULL THEN NOW() ELSE aprovada_em END,
         aprovada_por = CASE WHEN $1 = 'ativa' AND aprovada_por IS NULL THEN $2 ELSE aprovada_por END,
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
    status: z.enum(["pendente", "aprovado", "enviado", "entregue", "cancelado"]),
  }).safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: "Status inválido" }); return; }

  const { status } = parse.data;

  const updated = await queryOne(`
    UPDATE crm.revendedora_pedidos SET
      status = $1,
      aprovado_em = CASE WHEN $1 = 'aprovado' AND aprovado_em IS NULL THEN NOW() ELSE aprovado_em END,
      enviado_em  = CASE WHEN $1 = 'enviado'  AND enviado_em  IS NULL THEN NOW() ELSE enviado_em  END,
      entregue_em = CASE WHEN $1 = 'entregue' AND entregue_em IS NULL THEN NOW() ELSE entregue_em END,
      atualizado_em = NOW()
    WHERE id = $2 AND revendedora_id = $3
    RETURNING *
  `, [status, pedidoId, id]);

  if (!updated) { res.status(404).json({ error: "Pedido não encontrado" }); return; }

  // Se entregue: atualizar volume e verificar nível
  if (status === "entregue") {
    const p = updated as Record<string, unknown>;
    const total = parseFloat(p.total as string || "0");

    const rev = await queryOne<{
      id: string; nivel: string; volume_mes_atual: string; total_vendido: string;
    }>(
      `UPDATE crm.revendedoras
       SET volume_mes_atual = volume_mes_atual + $1,
           total_vendido    = total_vendido + $1,
           atualizado_em    = NOW()
       WHERE id = $2 RETURNING id, nivel, volume_mes_atual, total_vendido`,
      [total, id]
    );

    if (rev) {
      const novoVol   = parseFloat(rev.volume_mes_atual);
      const { nivel: novoNivel, desconto: novoDesc } = calcularNivel(novoVol);

      if (novoNivel !== rev.nivel) {
        await queryOne(
          "UPDATE crm.revendedoras SET nivel = $1, percentual_desconto = $2 WHERE id = $3",
          [novoNivel, novoDesc, id]
        );
        // Conquista de nível
        if (novoNivel === "prata") {
          await concederConquista(id, "nivel_prata", "Subiu para Prata! 🥈 Parabéns!", 50);
        }
        if (novoNivel === "ouro") {
          await concederConquista(id, "nivel_ouro", "Chegou ao Ouro! 🥇 Você é incrível!", 100);
        }
        logger.info("Revendedora subiu de nível", { id, de: rev.nivel, para: novoNivel });
      }
    }
  }

  res.json(updated);
});

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
