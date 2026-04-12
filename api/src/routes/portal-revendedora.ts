import { Router, Request, Response } from "express";
import { z } from "zod";
import { query, queryOne } from "../db";
import { logger } from "../utils/logger";
import rateLimit from "express-rate-limit";

export const portalRevendedoraRouter = Router();

// Rate limit específico — mais permissivo que o global (revendedora navega sem login)
const portalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Muitas requisições — aguarde um momento" },
});
portalRevendedoraRouter.use(portalLimiter);

// ── Tipos ────────────────────────────────────────────────────

interface RevendedoraPortal {
  id: string;
  nome: string;
  nivel: string;
  percentual_desconto: string;
  status: string;
}

// ── Helper: valida token e retorna dados da revendedora ──────

async function validarToken(token: string): Promise<RevendedoraPortal | null> {
  return queryOne<RevendedoraPortal>(`
    SELECT id, nome, nivel, percentual_desconto, status
    FROM crm.revendedoras
    WHERE portal_token = $1
      AND status = 'ativa'
      AND (portal_token_expira_em IS NULL OR portal_token_expira_em > NOW())
  `, [token]);
}

// ── GET /:token — info da revendedora ───────────────────────

portalRevendedoraRouter.get("/:token", async (req: Request, res: Response) => {
  const rev = await validarToken(req.params.token);
  if (!rev) {
    res.status(403).json({ error: "Link inválido ou expirado" });
    return;
  }

  // Registra acesso (fire-and-forget)
  queryOne(
    "UPDATE crm.revendedoras SET portal_ultimo_acesso_em = NOW() WHERE id = $1",
    [rev.id]
  ).catch(() => {});

  logger.info("Portal revendedora acessado", { id: rev.id, nivel: rev.nivel });

  res.json({
    nome: rev.nome,
    nivel: rev.nivel,
    percentual_desconto: Number(rev.percentual_desconto),
  });
});

// ── GET /:token/categorias — lista categorias com contagem ──

portalRevendedoraRouter.get("/:token/categorias", async (req: Request, res: Response) => {
  const rev = await validarToken(req.params.token);
  if (!rev) { res.status(403).json({ error: "Link inválido ou expirado" }); return; }

  const rows = await query(`
    SELECT
      COALESCE(p.slug_categoria, p.categoria, 'outros') AS categoria,
      COUNT(*)::int AS total
    FROM sync.fornecedor_catalogo_jc p
    WHERE p.status = 'aprovado'
    GROUP BY COALESCE(p.slug_categoria, p.categoria, 'outros')
    ORDER BY COUNT(*) DESC, COALESCE(p.slug_categoria, p.categoria, 'outros')
  `);

  res.json(rows);
});

// ── GET /:token/catalogo — produtos com preço final do tier ─

portalRevendedoraRouter.get("/:token/catalogo", async (req: Request, res: Response) => {
  const rev = await validarToken(req.params.token);
  if (!rev) { res.status(403).json({ error: "Link inválido ou expirado" }); return; }

  const schema = z.object({
    page:      z.coerce.number().int().min(1).default(1),
    limit:     z.coerce.number().int().min(1).max(100).default(24),
    search:    z.string().optional(),
    categoria: z.string().optional(),
  });
  const parse = schema.safeParse(req.query);
  if (!parse.success) { res.status(400).json({ error: "Parâmetros inválidos" }); return; }

  const { page, limit, search, categoria } = parse.data;
  const offset = (page - 1) * limit;
  const desconto = Number(rev.percentual_desconto);

  const conditions: string[] = ["p.status = 'aprovado'"];
  const params: unknown[] = [];
  let idx = 1;

  if (search) {
    conditions.push(`p.nome ILIKE $${idx++}`);
    params.push(`%${search}%`);
  }
  if (categoria) {
    conditions.push(`COALESCE(p.slug_categoria, p.categoria) = $${idx++}`);
    params.push(categoria);
  }

  const where = `WHERE ${conditions.join(" AND ")}`;

  const total = await queryOne<{ total: string }>(
    `SELECT COUNT(*)::text AS total FROM sync.fornecedor_catalogo_jc p ${where}`,
    params
  );

  params.push(desconto, limit, offset);

  // Expõe APENAS preco_final — nunca preco_custo, markup ou markup_override
  const rows = await query(`
    SELECT
      p.id,
      p.nome,
      COALESCE(p.slug_categoria, p.categoria, 'outros') AS categoria,
      ROUND(
        p.preco_custo
        * COALESCE(p.markup_override, m.markup, 2.00)
        * (1.0 - $${idx} / 100.0)
      , 2) AS preco_final
    FROM sync.fornecedor_catalogo_jc p
    LEFT JOIN sync.fornecedor_markup_categorias m
      ON m.categoria = COALESCE(p.slug_categoria, p.categoria)
    ${where}
    ORDER BY COALESCE(p.slug_categoria, p.categoria), p.nome
    LIMIT $${idx + 1} OFFSET $${idx + 2}
  `, params);

  const totalInt = parseInt(total?.total || "0");
  res.json({
    produtos:      rows,
    total:         totalInt,
    pagina:        page,
    total_paginas: Math.ceil(totalInt / limit),
  });
});
