import { Router, Request, Response } from "express";
import { z } from "zod";
import { query } from "../db";
import { authMiddleware } from "../middleware/auth";
import { getNuvemShopToken, nsRequest } from "../integrations/nuvemshop/auth";
import { logger } from "../utils/logger";

export const seoRouter = Router();
seoRouter.use(authMiddleware);

// ── Helpers de sanitização ───────────────────────────────────

/** Remove HTML, CSS, atributos, entidades e normaliza encoding */
function sanitizeDescription(html: string): string {
  return html
    // Primeiro: decodifica entidades HTML escapadas (&lt; → <, &gt; → >, &amp; → &)
    // Isso revela tags HTML que estavam escapadas (ex: ChatGPT HTML colado)
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    // Remove TODAS as tags HTML (inclusive as que estavam escapadas)
    .replace(/<[^>]*>/g, " ")
    // Remove atributos HTML/CSS soltos (quando tags foram removidas parcialmente)
    .replace(/\b(class|style|dir|tabindex|data-[\w-]+)\s*=\s*"[^"]*"/gi, " ")
    .replace(/\b(class|style|dir|tabindex|data-[\w-]+)\s*=\s*'[^']*'/gi, " ")
    // Remove data-attributes soltos sem aspas
    .replace(/data-[\w-]+=\S+/gi, " ")
    // Remove seletores CSS soltos (ex: [--shadow-height:45px])
    .replace(/\[[^\]]*\]/g, " ")
    // Remove UUIDs e IDs de conversação
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, " ")
    // Remove sinais < > soltos (restos de tags mal-formadas)
    .replace(/[<>]/g, " ")
    // Remove propriedades CSS soltas (ex: focus:outline-none, text-base, flex-col)
    .replace(/\b(flex-col|text-base|text-sm|pb-\d+|mt-\d+|pt-\d+|mx-auto|max-w-\S+|min-w-\S+|min-h-\S+|gap-\d+|w-full|flex-1|break-words|whitespace-normal|empty:hidden|prose|dark:prose-invert|markdown|wrap-break-word|light|inline|cursor-pointer|align-baseline|whitespace-normal)\b/gi, " ")
    // Remove padrões CSS complexos (focus:xxx, hover:xxx, @w-xxx, etc.)
    .replace(/@[\w-]+\/[\w-]+:\S+/g, " ")
    .replace(/\b[\w.-]+:[\w.-]+(?:-[\w.-]+)*/g, (match) => {
      // Preserva horários (12:30), medidas (76x76mm), URLs
      if (/^\d+:\d+/.test(match)) return match;
      if (match.includes("http") || match.includes("www")) return match;
      // Se parece CSS (contém - ou : com tokens CSS), remove
      if (/^(focus|hover|has|group|data|min|max|scroll|agent|text|flex|grid|overflow|pointer|outline|visible|hidden|relative|absolute|sticky)/.test(match)) return " ";
      return match;
    })
    // Remove restantes de entidades HTML
    .replace(/&[a-z]+;/gi, " ")
    // Remove tokens CSS residuais (qualquer coisa com hífens que parece CSS)
    .replace(/\*\]/g, " ")
    .replace(/(?:pointer-events|scroll-mt|var\()[^\s]*/g, " ")
    // Normaliza espaços
    .replace(/\s+/g, " ")
    .trim()
    // Limpeza final: corta tudo antes da primeira frase real
    // (sequência de 3+ letras seguidas de espaço e mais letras)
    .replace(/^[^A-Za-zÀ-ÿ]*?((?:[A-ZÀ-Ú][a-zà-ÿ]{2,}|[A-ZÀ-Ú]{2,})\s)/, "$1")
    .replace(/^[\s"'*\-:;.]+/, "")
    // Decode entidades HTML comuns
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&[a-z]+;/gi, " ")
    // Fix encoding quebrado: caracteres que perderam acentos
    .replace(/\bEsferogr fica\b/g, "Esferográfica")
    .replace(/\bprecis o\b/g, "precisão")
    .replace(/\bLav vel\b/g, "Lavável")
    .replace(/\bN O T XICO\b/g, "Não Tóxico")
    .replace(/\bF CIL\b/g, "Fácil")
    .replace(/\bC DIGO\b/g, "Código")
    .replace(/\bUniversit rio\b/g, "Universitário")
    .replace(/\bMat ria\b/g, "Matéria")
    .replace(/\bOrganiza o\b/g, "Organização")
    .replace(/\bcondi o\b/g, "condição")
    .replace(/\bDescri o\b/g, "Descrição")
    // Remove sequências de espaços/quebras
    .replace(/\s+/g, " ")
    .trim();
}

/** Converte nome ALL CAPS em Title Case legível */
function formatarNomeProduto(nome: string): string {
  // Se é tudo maiúsculo, converte para Title Case
  if (nome === nome.toUpperCase() && nome.length > 5) {
    return nome
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase())
      // Mantém siglas conhecidas em maiúsculo
      .replace(/\b(Brw|Cis|Tris|Cd|Fls|Esp)\b/gi, (m) => m.toUpperCase());
  }
  return nome;
}

// ── GET /api/seo/products — lista produtos com status SEO ────

const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  search: z.string().optional(),
  status: z.enum(["todos", "com_seo", "sem_seo"]).default("todos"),
});

seoRouter.get("/products", async (req: Request, res: Response) => {
  const parse = listSchema.safeParse(req.query);
  if (!parse.success) {
    res.status(400).json({ error: "Parâmetros inválidos" });
    return;
  }

  const { page, limit, search, status } = parse.data;
  const offset = (page - 1) * limit;

  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (search) {
    conditions.push(`p.nome ILIKE $${idx}`);
    params.push(`%${search}%`);
    idx++;
  }

  if (status === "com_seo") {
    conditions.push(`(p.dados_raw::jsonb->'seo_title'->>'pt' IS NOT NULL AND p.dados_raw::jsonb->'seo_title'->>'pt' != '')`);
  } else if (status === "sem_seo") {
    conditions.push(`(p.dados_raw::jsonb->'seo_title'->>'pt' IS NULL OR p.dados_raw::jsonb->'seo_title'->>'pt' = '')`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const [countRes, rows] = await Promise.all([
    query<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM sync.nuvemshop_products p ${where}`,
      params
    ),
    query<{
      ns_id: string;
      nome: string;
      sku: string | null;
      preco: number;
      imagens: string;
      publicado: boolean;
      seo_title: string;
      seo_description: string;
      handle: string;
      descricao: string;
      categorias: string;
    }>(
      `SELECT
        p.ns_id,
        p.nome,
        p.sku,
        p.preco,
        p.imagens,
        p.publicado,
        COALESCE(p.dados_raw::jsonb->'seo_title'->>'pt', '') AS seo_title,
        COALESCE(p.dados_raw::jsonb->'seo_description'->>'pt', '') AS seo_description,
        COALESCE(p.dados_raw::jsonb->'handle'->>'pt', '') AS handle,
        COALESCE(p.dados_raw::jsonb->'description'->>'pt', '') AS descricao,
        COALESCE(p.dados_raw::jsonb->>'categories', '[]') AS categorias
      FROM sync.nuvemshop_products p
      ${where}
      ORDER BY p.nome ASC
      LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limit, offset]
    ),
  ]);

  const total = parseInt(countRes[0]?.total || "0", 10);

  const products = rows.map((r) => {
    let imagens: string[] = [];
    try { imagens = JSON.parse(r.imagens); } catch { /* */ }

    let categorias: Array<{ id: number; name: Record<string, string> }> = [];
    try { categorias = JSON.parse(r.categorias); } catch { /* */ }

    return {
      ns_id: r.ns_id,
      nome: r.nome,
      sku: r.sku,
      preco: r.preco,
      imagem: imagens[0] || null,
      publicado: r.publicado,
      seo_title: r.seo_title,
      seo_description: r.seo_description,
      handle: r.handle,
      descricao: r.descricao,
      categorias: categorias.map((c) => c.name?.pt || "").filter(Boolean),
      tem_seo: !!(r.seo_title && r.seo_title.trim()),
    };
  });

  // Resumo geral
  const resumoRes = await query<{ total: string; com_seo: string; sem_seo: string }>(
    `SELECT
      COUNT(*)::text AS total,
      COUNT(CASE WHEN dados_raw::jsonb->'seo_title'->>'pt' IS NOT NULL AND dados_raw::jsonb->'seo_title'->>'pt' != '' THEN 1 END)::text AS com_seo,
      COUNT(CASE WHEN dados_raw::jsonb->'seo_title'->>'pt' IS NULL OR dados_raw::jsonb->'seo_title'->>'pt' = '' THEN 1 END)::text AS sem_seo
    FROM sync.nuvemshop_products`
  );

  res.json({
    data: products,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    resumo: {
      total: parseInt(resumoRes[0]?.total || "0", 10),
      com_seo: parseInt(resumoRes[0]?.com_seo || "0", 10),
      sem_seo: parseInt(resumoRes[0]?.sem_seo || "0", 10),
    },
  });
});

// ── POST /api/seo/products/generate — gera sugestões SEO ─────

const generateSchema = z.object({
  ns_ids: z.array(z.string()).min(1).max(200),
  sufixo_title: z.string().default("Papelaria Bibelô"),
});

seoRouter.post("/products/generate", async (req: Request, res: Response) => {
  const parse = generateSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: "Parâmetros inválidos" });
    return;
  }

  const { ns_ids, sufixo_title } = parse.data;

  const rows = await query<{
    ns_id: string;
    nome: string;
    descricao: string;
    categorias: string;
  }>(
    `SELECT
      ns_id,
      nome,
      COALESCE(dados_raw::jsonb->'description'->>'pt', '') AS descricao,
      COALESCE(dados_raw::jsonb->>'categories', '[]') AS categorias
    FROM sync.nuvemshop_products
    WHERE ns_id = ANY($1)`,
    [ns_ids]
  );

  const sugestoes = rows.map((r) => {
    let categorias: Array<{ id: number; name: Record<string, string> }> = [];
    try { categorias = JSON.parse(r.categorias); } catch { /* */ }

    const catNome = categorias.map((c) => c.name?.pt || "").filter(Boolean).join(", ");

    // SEO Title: "Nome do Produto | Papelaria Bibelô" (max 60 chars)
    const nomeClean = r.nome.replace(/\s+/g, " ").trim();
    const sufixoPart = ` | ${sufixo_title}`;
    let seoTitle = `${nomeClean}${sufixoPart}`;
    if (seoTitle.length > 60) {
      // Trunca na última palavra inteira que cabe
      const maxNome = 60 - sufixoPart.length;
      const truncado = nomeClean.slice(0, maxNome);
      const ultimoEspaco = truncado.lastIndexOf(" ");
      const nomeFinal = ultimoEspaco > 10 ? truncado.slice(0, ultimoEspaco) : truncado;
      seoTitle = `${nomeFinal}${sufixoPart}`;
    }

    // SEO Description: combina nome + categoria + CTA (max 160 chars)
    const descHtml = r.descricao || "";
    const descClean = sanitizeDescription(descHtml);

    // Detecta se a descrição limpa ainda é lixo (IDs, atributos HTML, ChatGPT)
    const lixoPatterns = ["data-turn", "tabindex", "conversation-turn", "text-token", "data-start", "data-end", "flex-col", "pb-25", "writing-block"];
    const descValida = descClean
      && descClean.length > 20
      && !/^[\s<>"=\-\d]+$/.test(descClean)
      && !lixoPatterns.some((p) => descClean.toLowerCase().includes(p));

    let seoDesc = "";
    if (descValida) {
      // Trunca na última palavra inteira
      const cta = " Compre online na Papelaria Bibelô.";
      const maxDesc = 160 - cta.length;
      let truncDesc = descClean.slice(0, maxDesc).trim();
      if (descClean.length > maxDesc) {
        const ultimoEspaco = truncDesc.lastIndexOf(" ");
        if (ultimoEspaco > 20) truncDesc = truncDesc.slice(0, ultimoEspaco);
        truncDesc += "...";
      }
      seoDesc = truncDesc + cta;
    } else {
      // Gera descrição padrão com nome legível (sem categorias genéricas)
      const nomeFormatado = formatarNomeProduto(nomeClean);
      const catFiltrado = catNome
        .split(", ")
        .filter((c) => !["Todas as Categorias", "Novidades"].includes(c))
        .join(", ");
      const parts = [`${nomeFormatado}.`];
      if (catFiltrado) parts.push(`Categoria: ${catFiltrado}.`);
      parts.push("Compre online na Papelaria Bibelô. Entrega para todo o Brasil. Loja em Timbó/SC.");
      seoDesc = parts.join(" ");
    }

    if (seoDesc.length > 160) {
      const corte = seoDesc.slice(0, 157);
      const ultimoEspaco = corte.lastIndexOf(" ");
      seoDesc = (ultimoEspaco > 100 ? corte.slice(0, ultimoEspaco) : corte) + "...";
    }

    return {
      ns_id: r.ns_id,
      seo_title: seoTitle,
      seo_description: seoDesc,
    };
  });

  res.json({ data: sugestoes });
});

// ── PUT /api/seo/products/:nsId — atualiza SEO via NuvemShop API ──

const updateSchema = z.object({
  seo_title: z.string().max(70),
  seo_description: z.string().max(320),
});

seoRouter.put("/products/:nsId", async (req: Request, res: Response) => {
  const nsId = req.params.nsId;
  const parse = updateSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: "Parâmetros inválidos", details: parse.error.issues });
    return;
  }

  const { seo_title, seo_description } = parse.data;

  const token = await getNuvemShopToken();
  if (!token) {
    res.status(503).json({ error: "NuvemShop não conectada" });
    return;
  }

  try {
    await nsRequest("put", `products/${nsId}`, token, {
      seo_title: { pt: seo_title },
      seo_description: { pt: seo_description },
    });

    // Atualiza dados_raw local para refletir a mudança
    await query(
      `UPDATE sync.nuvemshop_products
       SET dados_raw = jsonb_set(
         jsonb_set(dados_raw::jsonb, '{seo_title}', $2::jsonb),
         '{seo_description}', $3::jsonb
       )
       WHERE ns_id = $1`,
      [nsId, JSON.stringify({ pt: seo_title }), JSON.stringify({ pt: seo_description })]
    );

    logger.info("SEO atualizado na NuvemShop", { ns_id: nsId, seo_title });
    res.json({ ok: true, ns_id: nsId });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    logger.error("Erro ao atualizar SEO na NuvemShop", { ns_id: nsId, error: msg });
    res.status(502).json({ error: "Falha ao atualizar na NuvemShop", detail: msg });
  }
});

// ── POST /api/seo/products/bulk-update — atualiza vários produtos ──

const bulkSchema = z.object({
  produtos: z.array(z.object({
    ns_id: z.string(),
    seo_title: z.string().max(70),
    seo_description: z.string().max(320),
  })).min(1).max(200),
});

seoRouter.post("/products/bulk-update", async (req: Request, res: Response) => {
  const parse = bulkSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: "Parâmetros inválidos" });
    return;
  }

  const { produtos } = parse.data;

  const token = await getNuvemShopToken();
  if (!token) {
    res.status(503).json({ error: "NuvemShop não conectada" });
    return;
  }

  const resultados: Array<{ ns_id: string; ok: boolean; error?: string }> = [];

  for (const prod of produtos) {
    try {
      await nsRequest("put", `products/${prod.ns_id}`, token, {
        seo_title: { pt: prod.seo_title },
        seo_description: { pt: prod.seo_description },
      });

      // Atualiza local
      await query(
        `UPDATE sync.nuvemshop_products
         SET dados_raw = jsonb_set(
           jsonb_set(dados_raw::jsonb, '{seo_title}', $2::jsonb),
           '{seo_description}', $3::jsonb
         )
         WHERE ns_id = $1`,
        [prod.ns_id, JSON.stringify({ pt: prod.seo_title }), JSON.stringify({ pt: prod.seo_description })]
      );

      resultados.push({ ns_id: prod.ns_id, ok: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro";
      logger.error("Erro SEO bulk", { ns_id: prod.ns_id, error: msg });
      resultados.push({ ns_id: prod.ns_id, ok: false, error: msg });
    }
  }

  const sucesso = resultados.filter((r) => r.ok).length;
  const falhas = resultados.filter((r) => !r.ok).length;

  logger.info("SEO bulk update concluído", { sucesso, falhas, total: produtos.length });
  res.json({ sucesso, falhas, total: produtos.length, resultados });
});
