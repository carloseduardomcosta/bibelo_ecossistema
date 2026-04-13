import { Router, Request, Response } from "express";
import axios from "axios";
import * as iconv from "iconv-lite";
import { z } from "zod";
import { query, queryOne } from "../db";
import { logger } from "../utils/logger";
import { authMiddleware } from "../middleware/auth";

export const fornecedorCatalogoRouter = Router();
fornecedorCatalogoRouter.use(authMiddleware);

// ── Tipos internos do scraper ─────────────────────────────────

interface ScrapedItem {
  item_id: string;
  nome: string;
  categoria: string;
  preco_custo: number;
}

interface ScraperState {
  running: boolean;
  total_categorias: number;
  categorias_feitas: number;
  categoria_atual: string;
  produtos_salvos: number;
  produtos_atualizados: number;
  erros: number;
  log_id: string | null;
  iniciado_em: string | null;
  mensagem: string;
}

// Estado em memória — único por processo
const scraperState: ScraperState = {
  running: false,
  total_categorias: 0,
  categorias_feitas: 0,
  categoria_atual: "",
  produtos_salvos: 0,
  produtos_atualizados: 0,
  erros: 0,
  log_id: null,
  iniciado_em: null,
  mensagem: "Aguardando início",
};

// ── Estado do enriquecimento ──────────────────────────────────

interface EnrichState {
  running: boolean;
  fase: "idle" | "imagens" | "galeria" | "concluido" | "erro";
  total: number;
  feitos: number;
  com_imagem: number;
  com_galeria: number;
  com_descricao: number;
  erros: number;
  iniciado_em: string | null;
  mensagem: string;
}

const enrichState: EnrichState = {
  running: false,
  fase: "idle",
  total: 0,
  feitos: 0,
  com_imagem: 0,
  com_galeria: 0,
  com_descricao: 0,
  erros: 0,
  iniciado_em: null,
  mensagem: "Aguardando início",
};

// ── Helpers do scraper ────────────────────────────────────────

const BASE_URL = "https://www.atacadojc.com.br";
const DELAY_MS = 900; // respeita o servidor, ~65 req/min

const HTTP = axios.create({
  timeout: 15000,
  headers: {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
  },
});

// HTTP com resposta em buffer para suporte a ISO-8859-1
const HTTP_BUFFER = axios.create({
  timeout: 15000,
  responseType: "arraybuffer",
  headers: {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
  },
});

/** Converte buffer ISO-8859-1 para string UTF-8 */
function decodeIso(buffer: Buffer): string {
  return iconv.decode(buffer, "iso-8859-1");
}

/** Extrai (item_id → {imagem_url, produto_url}) de uma página de listagem */
function extrairImagensEUrls(html: string): Map<string, { imagem: string; url: string }> {
  const result = new Map<string, { imagem: string; url: string }>();
  // Padrão: class="BoxProduto BoxProduto_{item_id}"
  const boxPattern = /class="BoxProduto BoxProduto_(\d+)"([\s\S]*?)(?=class="BoxProduto BoxProduto_|$)/g;
  let match: RegExpExecArray | null;
  while ((match = boxPattern.exec(html)) !== null) {
    const itemId = match[1];
    const chunk  = match[2];
    // Extrair primeiro href (relativo ao domínio)
    const hrefMatch = chunk.match(/href="([a-z0-9][a-z0-9-/]+)"/);
    // Extrair imagem (data-src ou src no CDN de produtos)
    const imgMatch  = chunk.match(/data-src="(https:\/\/cdn[^"]+)"/);
    if (hrefMatch && imgMatch) {
      result.set(itemId, {
        imagem: imgMatch[1],
        url:    hrefMatch[1].replace(/\/$/, ""),
      });
    } else if (imgMatch) {
      result.set(itemId, { imagem: imgMatch[1], url: "" });
    }
  }
  return result;
}

/** Extrai descrição de uma página de produto (ISO-8859-1) */
function extrairDescricao(html: string): string {
  // A descrição fica em elemento com class contendo "texto"
  const m = html.match(/class="[^"]*texto[^"]*"[^>]*>([\s\S]*?)(?:<\/div>|<\/p>)/i);
  if (!m) return "";
  let desc = m[1]
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ").replace(/&#039;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return desc.slice(0, 1000); // max 1000 chars
}

/**
 * Extrai galeria de imagens de alta qualidade de uma página de produto.
 * Filtra pelo item_id no path da URL para garantir que são fotos do produto correto.
 * Converte M_ → G_ (grande, ~2× maior no CDN toplojas.com.br).
 */
function extrairGaleria(html: string, itemId: string): string[] {
  // Somente imagens do CDN no path /Produtos/{itemId}/Fotos/
  const regex = new RegExp(
    `src="(https://cdn[^"]+/Produtos/${itemId}/Fotos/[^"]+\\.(?:jpg|jpeg|png))"`,
    "gi"
  );
  const seen = new Set<string>();
  const imgs: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = regex.exec(html)) !== null) {
    // G_ = versão grande; se não houver, mantém M_ (mesmo arquivo sem prefix pode existir)
    const url = m[1].replace(/\/M_/, "/G_").replace(/\/P_/, "/G_");
    if (!seen.has(url)) {
      seen.add(url);
      imgs.push(url);
    }
  }
  return imgs;
}

/**
 * Job de enriquecimento — roda em background
 *
 * Fase 1: re-scraping das listagens para obter produto_url de produtos aprovados
 *         que ainda não têm URL (caso haja; já foi executado na maioria dos produtos).
 *
 * Fase 2: visita página individual de cada produto aprovado sem galeria (imagens_urls IS NULL)
 *         e captura:
 *   - Galeria completa em alta qualidade (G_ no CDN, ~2× maior que M_)
 *     Filtrada por /Produtos/{item_id}/Fotos/ → garante fotos do produto correto
 *   - Descrição do produto
 */
async function executarEnriquecimento(): Promise<void> {
  try {
    // ── Fase 1: produto_url via listings (se ainda faltarem) ─────
    enrichState.fase = "imagens";

    const cats = await query<{ slug: string; total: number }>(
      `SELECT COALESCE(slug_categoria, categoria) AS slug, COUNT(*)::int AS total
       FROM sync.fornecedor_catalogo_jc
       WHERE status = 'aprovado' AND produto_url IS NULL
         AND COALESCE(slug_categoria, categoria) IS NOT NULL
       GROUP BY COALESCE(slug_categoria, categoria)
       ORDER BY slug`
    );

    if (cats.length > 0) {
      enrichState.total    = cats.reduce((s, c) => s + c.total, 0);
      enrichState.mensagem = `Fase 1/2: ${cats.length} categorias, ${enrichState.total} sem URL de produto`;
      logger.info("Enriquecimento JC — fase 1 (produto_url)", { categorias: cats.length, produtos: enrichState.total });

      for (const cat of cats) {
        if (!enrichState.running) break;
        const slug = cat.slug;
        try {
          const prods = await query<{ item_id: string }>(
            `SELECT item_id FROM sync.fornecedor_catalogo_jc
             WHERE status = 'aprovado' AND produto_url IS NULL
               AND COALESCE(slug_categoria, categoria) = $1`,
            [slug]
          );
          const pendingIds = new Set(prods.map(p => p.item_id));
          if (pendingIds.size === 0) continue;

          const deptRes = await HTTP.get(`${BASE_URL}/${slug}/`);
          await sleep(DELAY_MS);

          const allFound = new Map<string, { imagem: string; url: string }>();
          for (const [id, data] of extrairImagensEUrls(deptRes.data as string)) allFound.set(id, data);

          const deptCode = extrairDeptCode(deptRes.data as string, slug);
          let page = 2;
          while (page <= 80 && enrichState.running) {
            const res = await HTTP.get(urlPagina(slug, page, deptCode));
            await sleep(DELAY_MS);
            const found = extrairImagensEUrls(res.data as string);
            if (found.size === 0) break;
            for (const [id, data] of found) allFound.set(id, data);
            if ([...pendingIds].filter(id => allFound.has(id)).length >= pendingIds.size) break;
            page++;
          }

          let updated = 0;
          for (const itemId of pendingIds) {
            const data = allFound.get(itemId);
            if (!data?.url) continue;
            await queryOne(
              `UPDATE sync.fornecedor_catalogo_jc
               SET produto_url = $1, imagem_url = COALESCE(imagem_url, $2), atualizado_em = NOW()
               WHERE item_id = $3 AND produto_url IS NULL`,
              [data.url, data.imagem || null, itemId]
            );
            updated++;
            enrichState.feitos++;
            enrichState.com_imagem++;
          }
          logger.info(`Enriquecimento fase 1: ${slug} — ${updated}/${pendingIds.size} com URL`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          logger.warn(`Enriquecimento fase 1 erro: ${slug} — ${msg}`);
          enrichState.erros++;
          await sleep(DELAY_MS * 2);
        }
      }
    }

    // ── Fase 2: galeria HD (G_) + descrição via página individual ─
    enrichState.fase   = "galeria";
    enrichState.feitos = 0;

    // Aprovados com produto_url mas sem galeria ainda
    const semGaleria = await query<{ id: string; item_id: string; produto_url: string }>(
      `SELECT id, item_id, produto_url FROM sync.fornecedor_catalogo_jc
       WHERE status = 'aprovado' AND produto_url IS NOT NULL AND imagens_urls IS NULL
       ORDER BY slug_categoria, item_id
       LIMIT 3000`
    );

    enrichState.total    = semGaleria.length;
    enrichState.mensagem = `Fase 2/2: ${semGaleria.length} produtos — galeria HD + descrição`;
    logger.info("Enriquecimento JC — fase 2 (galeria HD + descrição)", { produtos: semGaleria.length });

    for (const prod of semGaleria) {
      if (!enrichState.running) break;
      enrichState.feitos++;

      try {
        const pageUrl = `${BASE_URL}/${prod.produto_url}/`;
        const res  = await HTTP_BUFFER.get(pageUrl);
        await sleep(DELAY_MS);

        const html    = decodeIso(res.data as Buffer);
        const galeria = extrairGaleria(html, prod.item_id);
        const desc    = extrairDescricao(html);

        // Sempre grava imagens_urls (mesmo vazio) para não reprocessar
        await queryOne(
          `UPDATE sync.fornecedor_catalogo_jc
           SET imagens_urls  = $1,
               imagem_url    = COALESCE($2, imagem_url),
               descricao     = COALESCE($3, descricao),
               atualizado_em = NOW()
           WHERE id = $4`,
          [
            galeria.length > 0 ? galeria : [],  // array vazio = "processado, sem galeria"
            galeria[0] ?? null,                  // 1ª foto G_ sobrescreve placeholder M_
            desc || null,
            prod.id,
          ]
        );

        if (galeria.length > 0) enrichState.com_galeria++;
        if (desc)               enrichState.com_descricao++;

      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn(`Enriquecimento galeria erro: ${prod.item_id} — ${msg}`);
        enrichState.erros++;
        await sleep(DELAY_MS * 2);
      }

      if (enrichState.feitos % 50 === 0) {
        enrichState.mensagem = `Fase 2: ${enrichState.feitos}/${semGaleria.length} | galeria: ${enrichState.com_galeria} | desc: ${enrichState.com_descricao}`;
      }
    }

    enrichState.fase     = "concluido";
    enrichState.mensagem = `Concluído: ${enrichState.com_galeria} galerias HD, ${enrichState.com_descricao} descrições`;
    logger.info("Enriquecimento JC concluído", {
      galerias:   enrichState.com_galeria,
      descricoes: enrichState.com_descricao,
      erros:      enrichState.erros,
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    enrichState.fase     = "erro";
    enrichState.mensagem = `Erro fatal: ${msg}`;
    logger.error("Enriquecimento JC erro fatal", { error: msg });
  } finally {
    enrichState.running = false;
  }
}

async function sleep(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms));
}

/** Extrai o array de itens do dataLayer usando bracket-matching
 *  O site usa JS literal: event: 'view_item_list' e items: [...] (sem aspas duplas nas chaves)
 */
function extrairProdutosDaPagina(html: string): ScrapedItem[] {
  // Busca sem aspas — HTML usa aspas simples em valores e chaves sem aspas
  const idx = html.indexOf('view_item_list');
  if (idx === -1) return [];

  // "items" está como chave JS sem aspas: "items: [", dentro de 600 chars do evento
  const searchRange = html.slice(idx, idx + 600);
  const itemsRelIdx = searchRange.search(/\bitems\s*:/);
  if (itemsRelIdx === -1) return [];

  const itemsIdx = idx + itemsRelIdx;
  const arrStart = html.indexOf('[', itemsIdx);
  if (arrStart === -1) return [];

  // Bracket matching para encontrar o fechamento do array
  let depth = 0;
  let i = arrStart;
  while (i < html.length) {
    if (html[i] === '[' || html[i] === '{') depth++;
    if (html[i] === ']' || html[i] === '}') depth--;
    if (depth === 0) break;
    i++;
  }

  try {
    const arr = JSON.parse(html.slice(arrStart, i + 1)) as Array<{
      item_id?: string | number;
      item_name?: string;
      item_category?: string;
      price?: number | string;
    }>;

    return arr
      .filter(it => it.item_id && it.item_name && Number(it.price) > 0)
      .map(it => ({
        item_id: String(it.item_id),
        nome: String(it.item_name).trim(),
        categoria: String(it.item_category || "Outros").trim(),
        preco_custo: parseFloat(String(it.price)) || 0,
      }));
  } catch {
    return [];
  }
}

/** Extrai CodigoDepartamento da página 1 para montar URLs de paginação */
function extrairDeptCode(html: string, slug: string): string | null {
  const patterns = [
    new RegExp(`/${slug}\\?CodigoDepartamento=(\\d+)`, "i"),
    /CodigoDepartamento=(\d+)/,
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m) return m[1];
  }
  return null;
}

/** Monta URL de paginação */
function urlPagina(slug: string, page: number, deptCode: string | null): string {
  if (page === 1) return `${BASE_URL}/${slug}/`;
  const base = `${BASE_URL}/${slug}?`;
  const params = deptCode
    ? `CodigoDepartamento=${deptCode}&Pagina=${page}`
    : `Pagina=${page}`;
  return base + params;
}

/** Busca todas as categorias (slugs) do sitemap */
async function getCategoriasSitemap(): Promise<string[]> {
  const res = await HTTP.get(`${BASE_URL}/sitemap.xml`);
  const html: string = res.data;

  const IGNORAR = new Set([
    "conta", "carrinho", "checkout", "contato", "sobre", "marcas",
    "produtos", "busca", "favoritos", "pedidos", "frete", "privacidade",
    "termos", "login", "cadastro", "minha-conta", "politica",
  ]);

  // URLs com exatamente 1 segmento de path — aceita múltiplos traços (ex: mochila---bolsa)
  const regex = /<loc>(https:\/\/www\.atacadojc\.com\.br\/([a-z0-9][a-z0-9-]{1,100})\/?)<\/loc>/g;
  const slugs = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = regex.exec(html)) !== null) {
    const slug = m[2];
    if (!IGNORAR.has(slug)) slugs.add(slug);
  }
  return [...slugs];
}

/** Salva produtos no banco com UPSERT — retorna [salvos, atualizados] */
async function salvarProdutos(produtos: ScrapedItem[]): Promise<[number, number]> {
  let salvos = 0;
  let atualizados = 0;

  for (const p of produtos) {
    try {
      const existing = await queryOne<{ id: string }>(
        "SELECT id FROM sync.fornecedor_catalogo_jc WHERE item_id = $1", [p.item_id]
      );
      if (existing) {
        await queryOne(
          `UPDATE sync.fornecedor_catalogo_jc
           SET nome = $1, categoria = $2, preco_custo = $3, atualizado_em = NOW()
           WHERE item_id = $4`,
          [p.nome, p.categoria, p.preco_custo, p.item_id]
        );
        atualizados++;
      } else {
        await queryOne(
          `INSERT INTO sync.fornecedor_catalogo_jc (item_id, nome, categoria, preco_custo)
           VALUES ($1, $2, $3, $4) ON CONFLICT (item_id) DO NOTHING`,
          [p.item_id, p.nome, p.categoria, p.preco_custo]
        );
        salvos++;
      }

      // markup é registrado por slug após o UPDATE de slug_categoria no executarScraper
    } catch {
      // produto individual com erro — continua
    }
  }
  return [salvos, atualizados];
}

/** Função principal do scraper — roda em background */
async function executarScraper(logId: string, retomar = false): Promise<void> {
  const logs: string[] = [];

  try {
    // 1. Busca categorias do sitemap
    scraperState.mensagem = "Buscando categorias no sitemap...";
    const slugs = await getCategoriasSitemap();

    // Em modo retomar: descobre quais slugs já têm produtos no banco
    let slugsJaConcluidos = new Set<string>();
    if (retomar) {
      const rows = await query<{ categoria: string }>(
        "SELECT categoria FROM sync.fornecedor_markup_categorias"
      );
      slugsJaConcluidos = new Set(rows.map(r => r.categoria));
      logs.push(`Modo retomar: ${slugsJaConcluidos.size} categorias já concluídas serão puladas`);
    }

    const slugsPendentes = retomar
      ? slugs.filter(s => !slugsJaConcluidos.has(s))
      : slugs;

    scraperState.total_categorias = slugs.length;
    // Já conta as puladas como feitas
    scraperState.categorias_feitas = slugs.length - slugsPendentes.length;
    logs.push(`Categorias encontradas: ${slugs.length} | Pendentes: ${slugsPendentes.length}`);

    await queryOne(
      "UPDATE sync.fornecedor_sync_log SET total_categorias = $1 WHERE id = $2",
      [slugs.length, logId]
    );

    // 2. Percorre cada categoria pendente
    for (const slug of slugsPendentes) {
      if (!scraperState.running) {
        logs.push("Interrompido pelo usuário.");
        break;
      }

      scraperState.categoria_atual = slug;

      try {
        // Busca página 1
        const url1 = urlPagina(slug, 1, null);
        const res1 = await HTTP.get(url1);
        await sleep(DELAY_MS);

        const produtos1 = extrairProdutosDaPagina(res1.data);
        if (produtos1.length === 0) {
          scraperState.categorias_feitas++;
          continue; // não é uma categoria de produtos — pula
        }

        const deptCode = extrairDeptCode(res1.data, slug);
        const [s1, a1] = await salvarProdutos(produtos1);
        scraperState.produtos_salvos += s1;
        scraperState.produtos_atualizados += a1;

        // Atualiza slug_categoria nos produtos salvos
        await queryOne(
          `UPDATE sync.fornecedor_catalogo_jc
           SET slug_categoria = $1
           WHERE item_id = ANY($2::text[]) AND slug_categoria IS NULL`,
          [slug, produtos1.map(p => p.item_id)]
        );

        // 3. Percorre páginas seguintes
        let page = 2;
        const MAX_PAGES = 80; // segurança contra loops infinitos

        while (page <= MAX_PAGES && scraperState.running) {
          const url = urlPagina(slug, page, deptCode);
          const res = await HTTP.get(url);
          await sleep(DELAY_MS);

          const produtos = extrairProdutosDaPagina(res.data);
          if (produtos.length === 0) break; // fim da paginação

          const [s, a] = await salvarProdutos(produtos);
          scraperState.produtos_salvos += s;
          scraperState.produtos_atualizados += a;

          await queryOne(
            `UPDATE sync.fornecedor_catalogo_jc
             SET slug_categoria = $1
             WHERE item_id = ANY($2::text[]) AND slug_categoria IS NULL`,
            [slug, produtos.map(p => p.item_id)]
          );

          page++;
        }

        scraperState.categorias_feitas++;
        logs.push(`✓ ${slug}: ${page - 1} páginas`);

        // Garante que o slug tem entrada na tabela de markups
        await queryOne(
          `INSERT INTO sync.fornecedor_markup_categorias (categoria)
           VALUES ($1) ON CONFLICT (categoria) DO NOTHING`,
          [slug]
        );

        // Atualiza progresso no banco a cada categoria
        await queryOne(
          `UPDATE sync.fornecedor_sync_log
           SET categorias_processadas = $1, produtos_salvos = $2, produtos_atualizados = $3
           WHERE id = $4`,
          [scraperState.categorias_feitas, scraperState.produtos_salvos, scraperState.produtos_atualizados, logId]
        );

      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logs.push(`✗ ${slug}: ${msg}`);
        scraperState.erros++;
        await sleep(DELAY_MS * 2); // pausa maior após erro
      }
    }

    // 4. Finaliza
    const finalStatus = scraperState.running ? "concluido" : "interrompido";
    await queryOne(
      `UPDATE sync.fornecedor_sync_log
       SET status = $1, concluido_em = NOW(), erros = $2, log = $3,
           categorias_processadas = $4, produtos_salvos = $5, produtos_atualizados = $6
       WHERE id = $7`,
      [finalStatus, scraperState.erros, logs.join("\n"),
       scraperState.categorias_feitas, scraperState.produtos_salvos,
       scraperState.produtos_atualizados, logId]
    );

    scraperState.mensagem = scraperState.running
      ? `Concluído — ${scraperState.produtos_salvos} novos, ${scraperState.produtos_atualizados} atualizados`
      : "Interrompido pelo usuário";

    logger.info("Scraper JC concluído", {
      salvos: scraperState.produtos_salvos,
      atualizados: scraperState.produtos_atualizados,
      categorias: scraperState.categorias_feitas,
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    scraperState.mensagem = `Erro fatal: ${msg}`;
    await queryOne(
      "UPDATE sync.fornecedor_sync_log SET status = 'erro', concluido_em = NOW(), log = $1 WHERE id = $2",
      [msg, logId]
    ).catch(() => {});
    logger.error("Scraper JC erro fatal", { error: msg });
  } finally {
    scraperState.running = false;
  }
}

// ── Endpoints ─────────────────────────────────────────────────

/** GET /stats — totais para o dashboard */
fornecedorCatalogoRouter.get("/stats", async (_req: Request, res: Response) => {
  const stats = await queryOne<{
    total: string; rascunho: string; aprovado: string; pausado: string;
    categorias: string; ultima_sync: string | null; ultimo_status: string | null;
  }>(`
    SELECT
      COUNT(*)::text                                      AS total,
      COUNT(*) FILTER (WHERE status = 'rascunho')::text  AS rascunho,
      COUNT(*) FILTER (WHERE status = 'aprovado')::text  AS aprovado,
      COUNT(*) FILTER (WHERE status = 'pausado')::text   AS pausado,
      COUNT(DISTINCT categoria)::text                    AS categorias,
      (SELECT concluido_em::text FROM sync.fornecedor_sync_log
       ORDER BY iniciado_em DESC LIMIT 1)                AS ultima_sync,
      (SELECT status FROM sync.fornecedor_sync_log
       ORDER BY iniciado_em DESC LIMIT 1)                AS ultimo_status
    FROM sync.fornecedor_catalogo_jc
  `);
  const s = stats ?? { total: "0", rascunho: "0", aprovado: "0", pausado: "0", categorias: "0", ultima_sync: null, ultimo_status: null };
  res.json({
    total:         parseInt(s.total),
    rascunho:      parseInt(s.rascunho),
    aprovado:      parseInt(s.aprovado),
    pausado:       parseInt(s.pausado),
    categorias:    parseInt(s.categorias),
    ultima_sync:   s.ultima_sync,
    ultimo_status: s.ultimo_status,
  });
});

/** GET /markup — lista markups por categoria */
fornecedorCatalogoRouter.get("/markup", async (_req: Request, res: Response) => {
  const rows = await query<{
    categoria: string; markup: number; atualizado_em: string;
    total_produtos: number; rascunho: number; aprovados: number;
  }>(`
    SELECT
      m.categoria,
      m.markup,
      m.atualizado_em,
      COUNT(p.id)::int                                          AS total_produtos,
      COUNT(p.id) FILTER (WHERE p.status = 'rascunho')::int     AS rascunho,
      COUNT(p.id) FILTER (WHERE p.status = 'aprovado')::int     AS aprovados,
      ROUND(AVG(p.preco_custo)::numeric, 2)                     AS preco_custo_medio
    FROM sync.fornecedor_markup_categorias m
    LEFT JOIN sync.fornecedor_catalogo_jc p ON p.categoria = m.categoria
    GROUP BY m.categoria, m.markup, m.atualizado_em
    ORDER BY COUNT(p.id) DESC, m.categoria
  `);
  // Retorna array direto (sem wrapper { data })
  res.json(rows);
});

/** PUT /markup — atualiza markups (batch) */
fornecedorCatalogoRouter.put("/markup", async (req: Request, res: Response) => {
  const itemSchema = z.array(z.object({
    categoria: z.string().min(1).max(200),
    markup: z.number().min(1.0).max(5.0),
  })).min(1);
  // aceita { markups: [...] } ou { updates: [...] }
  const list = req.body.markups ?? req.body.updates;
  const parse = itemSchema.safeParse(list);
  if (!parse.success) { res.status(400).json({ error: "Dados inválidos", detalhes: parse.error.errors }); return; }

  for (const { categoria, markup } of parse.data) {
    await queryOne(
      `INSERT INTO sync.fornecedor_markup_categorias (categoria, markup, atualizado_em)
       VALUES ($1, $2, NOW())
       ON CONFLICT (categoria) DO UPDATE SET markup = $2, atualizado_em = NOW()`,
      [categoria, markup]
    );
  }

  logger.info("Markups do catálogo JC atualizados", { qtd: parse.data.length });
  res.json({ ok: true, atualizados: parse.data.length });
});

/** GET /produtos — listagem com filtros e paginação */
fornecedorCatalogoRouter.get("/produtos", async (req: Request, res: Response) => {
  const schema = z.object({
    page:      z.coerce.number().int().min(1).default(1),
    limit:     z.coerce.number().int().min(1).max(500).default(24),
    search:    z.string().optional(),
    categoria: z.string().optional(),
    status:    z.enum(["rascunho", "aprovado", "pausado"]).optional(),
  });
  const parse = schema.safeParse(req.query);
  if (!parse.success) { res.status(400).json({ error: "Parâmetros inválidos" }); return; }

  const { page, limit, search, categoria, status } = parse.data;
  const offset = (page - 1) * limit;
  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (search) {
    conditions.push(`p.nome ILIKE $${idx++}`);
    params.push(`%${search}%`);
  }
  if (categoria) { conditions.push(`COALESCE(p.slug_categoria, p.categoria) = $${idx++}`); params.push(categoria); }
  if (status)    { conditions.push(`p.status = $${idx++}`);    params.push(status); }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const total = await queryOne<{ total: string }>(
    `SELECT COUNT(*)::text AS total FROM sync.fornecedor_catalogo_jc p ${where}`, params
  );

  params.push(limit, offset);
  const rows = await query(`
    SELECT
      p.*,
      COALESCE(p.markup_override, m.markup, 2.00) AS markup_efetivo,
      ROUND(p.preco_custo * COALESCE(p.markup_override, m.markup, 2.00), 2) AS preco_revenda
    FROM sync.fornecedor_catalogo_jc p
    LEFT JOIN sync.fornecedor_markup_categorias m
      ON m.categoria = COALESCE(p.slug_categoria, p.categoria)
    ${where}
    ORDER BY COALESCE(p.slug_categoria, p.categoria), p.nome
    LIMIT $${idx} OFFSET $${idx + 1}
  `, params);

  const totalInt = parseInt(total?.total || "0");
  res.json({
    produtos:      rows,
    total:         totalInt,
    pagina:        page,
    total_paginas: Math.ceil(totalInt / limit),
  });
});

/** GET /produtos/por-categoria — agrupado para curadoria (usa slug_categoria como chave) */
fornecedorCatalogoRouter.get("/produtos/por-categoria", async (_req: Request, res: Response) => {
  const rows = await query(`
    SELECT
      COALESCE(p.slug_categoria, p.categoria, 'outros')        AS categoria,
      m.markup,
      COUNT(*)::int                                             AS total,
      COUNT(*) FILTER (WHERE p.status = 'rascunho')::int       AS rascunho,
      COUNT(*) FILTER (WHERE p.status = 'aprovado')::int       AS aprovado,
      ROUND(MIN(p.preco_custo)::numeric, 2)                    AS preco_min,
      ROUND(MAX(p.preco_custo)::numeric, 2)                    AS preco_max,
      ROUND(AVG(p.preco_custo)::numeric, 2)                    AS preco_medio
    FROM sync.fornecedor_catalogo_jc p
    LEFT JOIN sync.fornecedor_markup_categorias m
      ON m.categoria = COALESCE(p.slug_categoria, p.categoria, 'outros')
    GROUP BY COALESCE(p.slug_categoria, p.categoria, 'outros'), m.markup
    ORDER BY COUNT(*) FILTER (WHERE p.status = 'rascunho') DESC,
             COALESCE(p.slug_categoria, p.categoria, 'outros')
  `);
  res.json(rows);
});

/** PUT /produtos/:id/status — altera status individual */
fornecedorCatalogoRouter.put("/produtos/:id/status", async (req: Request, res: Response) => {
  const parse = z.object({
    status: z.enum(["rascunho", "aprovado", "pausado"]),
    markup_override: z.number().min(1.0).max(5.0).optional(),
  }).safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: "Dados inválidos" }); return; }

  const updated = await queryOne(
    `UPDATE sync.fornecedor_catalogo_jc
     SET status = $1,
         markup_override = COALESCE($2, markup_override),
         atualizado_em = NOW()
     WHERE id = $3 RETURNING *`,
    [parse.data.status, parse.data.markup_override ?? null, req.params.id]
  );
  if (!updated) { res.status(404).json({ error: "Produto não encontrado" }); return; }
  res.json(updated);
});

/** POST /aprovar-lote — aprova uma lista de produtos por ID */
fornecedorCatalogoRouter.post("/aprovar-lote", async (req: Request, res: Response) => {
  const parse = z.object({
    ids: z.array(z.string().uuid()).min(1).max(500),
  }).safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: "Dados inválidos", detalhes: parse.error.errors }); return; }

  const { ids } = parse.data;

  await queryOne(
    `UPDATE sync.fornecedor_catalogo_jc
     SET status = 'aprovado', atualizado_em = NOW()
     WHERE id = ANY($1::uuid[]) AND status = 'rascunho'`,
    [ids]
  );

  logger.info("Lote aprovado", { qtd: ids.length, user: (req as Request & { user?: { email: string } }).user?.email });
  res.json({ ok: true, aprovados: ids.length });
});

/** POST /scraper/iniciar — dispara varredura em background
 *  Body opcional: { retomar: true } para pular categorias já importadas
 */
fornecedorCatalogoRouter.post("/scraper/iniciar", async (req: Request, res: Response) => {
  if (scraperState.running) {
    res.status(409).json({ error: "Scraper já está em execução", estado: scraperState });
    return;
  }

  const retomar = req.body?.retomar === true;

  // Cria registro de log
  const logRow = await queryOne<{ id: string }>(
    "INSERT INTO sync.fornecedor_sync_log DEFAULT VALUES RETURNING id"
  );
  if (!logRow) { res.status(500).json({ error: "Erro ao criar log" }); return; }

  // Reinicia estado
  Object.assign(scraperState, {
    running: true,
    total_categorias: 0,
    categorias_feitas: 0,
    categoria_atual: "",
    produtos_salvos: 0,
    produtos_atualizados: 0,
    erros: 0,
    log_id: logRow.id,
    iniciado_em: new Date().toISOString(),
    mensagem: "Iniciando...",
  });

  logger.info("Scraper JC iniciado", { retomar, user: (req as Request & { user?: { email: string } }).user?.email });

  // Dispara em background sem bloquear a resposta
  setImmediate(() => { executarScraper(logRow.id, retomar).catch(e => logger.error("Scraper erro", { error: e.message })); });

  res.json({ ok: true, log_id: logRow.id, retomar, mensagem: retomar ? "Retomando — categorias já importadas serão puladas" : "Scraper iniciado em background" });
});

/** POST /scraper/categorias — importa slugs específicos em background
 *  Body: { slugs: ["mochila---bolsa", "outro-slug"] }
 */
fornecedorCatalogoRouter.post("/scraper/categorias", async (req: Request, res: Response) => {
  if (scraperState.running) {
    res.status(409).json({ error: "Scraper já está em execução" });
    return;
  }

  const parse = z.object({
    slugs: z.array(z.string().min(1)).min(1).max(20),
  }).safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: "Dados inválidos" }); return; }

  const { slugs } = parse.data;

  const logRow = await queryOne<{ id: string }>(
    "INSERT INTO sync.fornecedor_sync_log DEFAULT VALUES RETURNING id"
  );
  if (!logRow) { res.status(500).json({ error: "Erro ao criar log" }); return; }

  Object.assign(scraperState, {
    running: true,
    total_categorias: slugs.length,
    categorias_feitas: 0,
    categoria_atual: "",
    produtos_salvos: 0,
    produtos_atualizados: 0,
    erros: 0,
    log_id: logRow.id,
    iniciado_em: new Date().toISOString(),
    mensagem: `Importando ${slugs.length} categoria(s) específica(s)...`,
  });

  logger.info("Scraper JC — categorias específicas", { slugs, user: (req as Request & { user?: { email: string } }).user?.email });

  // Reutiliza executarScraper mas com lista fixa
  async function executarSlugsDireto() {
    const logs: string[] = [`Categorias específicas: ${slugs.join(", ")}`];
    await queryOne(
      "UPDATE sync.fornecedor_sync_log SET total_categorias = $1 WHERE id = $2",
      [slugs.length, logRow!.id]
    );
    for (const slug of slugs) {
      if (!scraperState.running) { logs.push("Interrompido."); break; }
      scraperState.categoria_atual = slug;
      try {
        const url1 = urlPagina(slug, 1, null);
        const res1 = await HTTP.get(url1);
        await sleep(DELAY_MS);
        const produtos1 = extrairProdutosDaPagina(res1.data);
        if (produtos1.length === 0) {
          scraperState.categorias_feitas++;
          logs.push(`✗ ${slug}: sem produtos na página 1`);
          continue;
        }
        const deptCode = extrairDeptCode(res1.data, slug);
        const [s1, a1] = await salvarProdutos(produtos1);
        scraperState.produtos_salvos += s1;
        scraperState.produtos_atualizados += a1;
        await queryOne(
          `UPDATE sync.fornecedor_catalogo_jc SET slug_categoria = $1 WHERE item_id = ANY($2::text[]) AND slug_categoria IS NULL`,
          [slug, produtos1.map(p => p.item_id)]
        );
        let page = 2;
        while (page <= 80 && scraperState.running) {
          const res = await HTTP.get(urlPagina(slug, page, deptCode));
          await sleep(DELAY_MS);
          const prods = extrairProdutosDaPagina(res.data);
          if (prods.length === 0) break;
          const [s, a] = await salvarProdutos(prods);
          scraperState.produtos_salvos += s;
          scraperState.produtos_atualizados += a;
          await queryOne(
            `UPDATE sync.fornecedor_catalogo_jc SET slug_categoria = $1 WHERE item_id = ANY($2::text[]) AND slug_categoria IS NULL`,
            [slug, prods.map(p => p.item_id)]
          );
          page++;
        }
        scraperState.categorias_feitas++;
        logs.push(`✓ ${slug}: ${page - 1} páginas`);
        await queryOne(
          `INSERT INTO sync.fornecedor_markup_categorias (categoria) VALUES ($1) ON CONFLICT (categoria) DO NOTHING`,
          [slug]
        );
        await queryOne(
          `UPDATE sync.fornecedor_sync_log SET categorias_processadas=$1, produtos_salvos=$2, produtos_atualizados=$3 WHERE id=$4`,
          [scraperState.categorias_feitas, scraperState.produtos_salvos, scraperState.produtos_atualizados, logRow!.id]
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logs.push(`✗ ${slug}: ${msg}`);
        scraperState.erros++;
        await sleep(DELAY_MS * 2);
      }
    }
    const finalStatus = scraperState.running ? "concluido" : "interrompido";
    await queryOne(
      `UPDATE sync.fornecedor_sync_log SET status=$1, concluido_em=NOW(), erros=$2, log=$3, categorias_processadas=$4, produtos_salvos=$5, produtos_atualizados=$6 WHERE id=$7`,
      [finalStatus, scraperState.erros, logs.join("\n"), scraperState.categorias_feitas, scraperState.produtos_salvos, scraperState.produtos_atualizados, logRow!.id]
    );
    scraperState.mensagem = `Concluído — ${scraperState.produtos_salvos} novos, ${scraperState.produtos_atualizados} atualizados`;
    scraperState.running = false;
  }

  setImmediate(() => executarSlugsDireto().catch(e => {
    logger.error("Scraper categorias específicas — erro", { error: e.message });
    scraperState.running = false;
  }));

  res.json({ ok: true, log_id: logRow.id, slugs, mensagem: `Importando: ${slugs.join(", ")}` });
});

/** POST /scraper/parar — interrompe a varredura */
fornecedorCatalogoRouter.post("/scraper/parar", async (_req: Request, res: Response) => {
  if (!scraperState.running) {
    res.status(409).json({ error: "Scraper não está em execução" });
    return;
  }
  scraperState.running = false;
  scraperState.mensagem = "Interrompendo...";
  res.json({ ok: true, mensagem: "Solicitação de parada enviada" });
});

/** GET /scraper/status — estado atual (retorna scraperState direto) */
fornecedorCatalogoRouter.get("/scraper/status", async (_req: Request, res: Response) => {
  res.json(scraperState);
});

/** GET /scraper/historico — histórico de execuções */
fornecedorCatalogoRouter.get("/scraper/historico", async (_req: Request, res: Response) => {
  const rows = await query(
    "SELECT * FROM sync.fornecedor_sync_log ORDER BY iniciado_em DESC LIMIT 20"
  );
  res.json(rows);
});

/** POST /scraper/enriquecer — captura fotos + descrições dos produtos aprovados */
fornecedorCatalogoRouter.post("/scraper/enriquecer", async (req: Request, res: Response) => {
  if (scraperState.running) {
    res.status(409).json({ error: "Scraper principal está em execução — aguarde" });
    return;
  }
  if (enrichState.running) {
    res.status(409).json({ error: "Enriquecimento já está em execução" });
    return;
  }

  Object.assign(enrichState, {
    running: true,
    fase: "imagens",
    total: 0,
    feitos: 0,
    com_imagem: 0,
    com_descricao: 0,
    erros: 0,
    iniciado_em: new Date().toISOString(),
    mensagem: "Iniciando enriquecimento...",
  });

  logger.info("Enriquecimento JC iniciado", { user: (req as Request & { user?: { email: string } }).user?.email });
  setImmediate(() => executarEnriquecimento().catch(e => {
    logger.error("Enriquecimento erro", { error: e.message });
    enrichState.running = false;
    enrichState.fase = "erro";
  }));

  res.json({ ok: true, mensagem: "Enriquecimento iniciado em background — acompanhe em /scraper/enriquecer/status" });
});

/** POST /scraper/enriquecer/parar — para o enriquecimento */
fornecedorCatalogoRouter.post("/scraper/enriquecer/parar", (_req: Request, res: Response) => {
  if (!enrichState.running) {
    res.status(409).json({ error: "Enriquecimento não está em execução" });
    return;
  }
  enrichState.running = false;
  enrichState.mensagem = "Interrompendo...";
  res.json({ ok: true, mensagem: "Solicitação de parada enviada" });
});

/** GET /scraper/enriquecer/status — estado do enriquecimento */
fornecedorCatalogoRouter.get("/scraper/enriquecer/status", (_req: Request, res: Response) => {
  res.json(enrichState);
});
