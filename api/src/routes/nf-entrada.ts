import { Router, Request, Response } from "express";
import { z } from "zod";
import multer from "multer";
import path from "path";
import fs from "fs";
import { XMLParser } from "fast-xml-parser";
import { query, queryOne } from "../db";
import { authMiddleware } from "../middleware/auth";
import { logger } from "../utils/logger";

export const nfEntradaRouter = Router();
nfEntradaRouter.use(authMiddleware);

// ── Upload config ───────────────────────────────────────────
const uploadDir = path.resolve(process.cwd(), "uploads", "nf");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ts = Date.now();
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, `${ts}_${safe}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== ".xml") {
      cb(new Error("Apenas arquivos XML são permitidos"));
      return;
    }
    cb(null, true);
  },
});

// ── XML Parser ──────────────────────────────────────────────
const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseAttributeValue: true,
  trimValues: true,
});

interface NFeData {
  numero: string;
  serie: string;
  chave_acesso: string;
  fornecedor_cnpj: string;
  fornecedor_nome: string;
  fornecedor_uf: string;
  data_emissao: string;
  valor_produtos: number;
  valor_frete: number;
  valor_desconto: number;
  valor_outros: number;
  valor_total: number;
  icms_total: number;
  ipi_total: number;
  pis_total: number;
  cofins_total: number;
  itens: NFeItem[];
}

interface NFeItem {
  numero_item: number;
  codigo_produto: string;
  descricao: string;
  ncm: string;
  cfop: string;
  unidade: string;
  quantidade: number;
  valor_unitario: number;
  valor_total: number;
  valor_desconto: number;
  icms_valor: number;
  ipi_valor: number;
  pis_valor: number;
  cofins_valor: number;
}

function num(v: unknown): number {
  const n = parseFloat(String(v || "0"));
  return isNaN(n) ? 0 : n;
}

function str(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

function parseNFeXml(xmlContent: string): NFeData {
  const parsed = xmlParser.parse(xmlContent);

  // Navegar até o nó da NF-e (suporta nfeProc > NFe > infNFe ou NFe > infNFe)
  let nfe = parsed?.nfeProc?.NFe ?? parsed?.NFe;
  if (!nfe) {
    // Tentar com namespace
    const keys = Object.keys(parsed);
    for (const key of keys) {
      const val = parsed[key];
      if (val?.NFe) { nfe = val.NFe; break; }
      if (val?.infNFe) { nfe = val; break; }
    }
  }
  if (!nfe) throw new Error("Estrutura XML não reconhecida como NF-e");

  const infNFe = nfe.infNFe ?? nfe;
  const ide = infNFe.ide ?? {};
  const emit = infNFe.emit ?? {};
  const total = infNFe.total?.ICMSTot ?? {};

  // Chave de acesso
  let chave = str(infNFe["@_Id"] || "").replace(/^NFe/, "");
  if (!chave && parsed?.nfeProc?.protNFe?.infProt?.chNFe) {
    chave = str(parsed.nfeProc.protNFe.infProt.chNFe);
  }

  // Fornecedor
  const cnpjEmit = str(emit.CNPJ || emit.CPF || "");
  const nomeEmit = str(emit.xNome || emit.xFant || "");
  const ufEmit = str(emit.enderEmit?.UF || "");

  // Data emissão
  let dataEmissao = str(ide.dhEmi || ide.dEmi || "");
  if (dataEmissao.length > 10) dataEmissao = dataEmissao.substring(0, 10);

  // Itens
  let dets = infNFe.det;
  if (!dets) dets = [];
  if (!Array.isArray(dets)) dets = [dets];

  const itens: NFeItem[] = dets.map((det: any, idx: number) => {
    const prod = det.prod ?? {};
    const imposto = det.imposto ?? {};
    const icms = imposto.ICMS ?? {};
    const icmsInner = icms[Object.keys(icms)[0]] ?? {};
    const ipi = imposto.IPI ?? {};
    const ipiInner = ipi.IPITrib ?? ipi.IPINT ?? {};
    const pis = imposto.PIS ?? {};
    const pisInner = pis[Object.keys(pis)[0]] ?? {};
    const cofins = imposto.COFINS ?? {};
    const cofinsInner = cofins[Object.keys(cofins)[0]] ?? {};

    return {
      numero_item: num(det["@_nItem"] || idx + 1),
      codigo_produto: str(prod.cProd),
      descricao: str(prod.xProd),
      ncm: str(prod.NCM),
      cfop: str(prod.CFOP),
      unidade: str(prod.uCom || prod.uTrib),
      quantidade: num(prod.qCom || prod.qTrib),
      valor_unitario: num(prod.vUnCom || prod.vUnTrib),
      valor_total: num(prod.vProd),
      valor_desconto: num(prod.vDesc),
      icms_valor: num(icmsInner.vICMS),
      ipi_valor: num(ipiInner.vIPI),
      pis_valor: num(pisInner.vPIS),
      cofins_valor: num(cofinsInner.vCOFINS),
    };
  });

  return {
    numero: str(ide.nNF),
    serie: str(ide.serie),
    chave_acesso: chave,
    fornecedor_cnpj: cnpjEmit,
    fornecedor_nome: nomeEmit,
    fornecedor_uf: ufEmit,
    data_emissao: dataEmissao,
    valor_produtos: num(total.vProd),
    valor_frete: num(total.vFrete),
    valor_desconto: num(total.vDesc),
    valor_outros: num(total.vOutro),
    valor_total: num(total.vNF),
    icms_total: num(total.vICMS),
    ipi_total: num(total.vIPI),
    pis_total: num(total.vPIS),
    cofins_total: num(total.vCOFINS),
    itens,
  };
}

// ══════════════════════════════════════════════════════════════
// POST /nf-entrada — Upload XML e parse automático
// ══════════════════════════════════════════════════════════════

nfEntradaRouter.post("/", upload.single("xml"), async (req: Request, res: Response) => {
  if (!req.file) {
    res.status(400).json({ error: "Arquivo XML é obrigatório" });
    return;
  }

  let nfeData: NFeData;
  try {
    const xmlContent = fs.readFileSync(req.file.path, "utf-8");
    nfeData = parseNFeXml(xmlContent);
  } catch (err: any) {
    // Limpar arquivo se parse falhou
    fs.unlinkSync(req.file.path);
    logger.error("Erro ao parsear XML da NF-e", { error: err.message });
    res.status(400).json({ error: `Erro ao ler XML: ${err.message}` });
    return;
  }

  // Verificar duplicata por chave de acesso
  if (nfeData.chave_acesso) {
    const existente = await queryOne(
      `SELECT id FROM financeiro.notas_entrada WHERE chave_acesso = $1`,
      [nfeData.chave_acesso]
    );
    if (existente) {
      fs.unlinkSync(req.file.path);
      res.status(409).json({ error: "NF-e já cadastrada (chave de acesso duplicada)" });
      return;
    }
  }

  // Inserir NF
  const nota = await queryOne<{ id: string }>(`
    INSERT INTO financeiro.notas_entrada (
      numero, serie, chave_acesso,
      fornecedor_cnpj, fornecedor_nome, fornecedor_uf,
      valor_produtos, valor_frete, valor_desconto, valor_outros, valor_total,
      icms_total, ipi_total, pis_total, cofins_total,
      data_emissao, xml_path, xml_nome_arquivo, criado_por
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
    RETURNING id
  `, [
    nfeData.numero, nfeData.serie, nfeData.chave_acesso || null,
    nfeData.fornecedor_cnpj, nfeData.fornecedor_nome, nfeData.fornecedor_uf,
    nfeData.valor_produtos, nfeData.valor_frete, nfeData.valor_desconto,
    nfeData.valor_outros, nfeData.valor_total,
    nfeData.icms_total, nfeData.ipi_total, nfeData.pis_total, nfeData.cofins_total,
    nfeData.data_emissao || null, req.file.path, req.file.originalname,
    req.user?.userId || null,
  ]);

  // Inserir itens
  if (nota && nfeData.itens.length > 0) {
    const values: unknown[] = [];
    const placeholders: string[] = [];
    let idx = 1;

    for (const item of nfeData.itens) {
      placeholders.push(`($${idx},$${idx + 1},$${idx + 2},$${idx + 3},$${idx + 4},$${idx + 5},$${idx + 6},$${idx + 7},$${idx + 8},$${idx + 9},$${idx + 10},$${idx + 11},$${idx + 12},$${idx + 13})`);
      values.push(
        nota.id, item.numero_item, item.codigo_produto, item.descricao,
        item.ncm, item.cfop, item.unidade,
        item.quantidade, item.valor_unitario, item.valor_total, item.valor_desconto,
        item.icms_valor, item.ipi_valor, item.pis_valor
      );
      idx += 14;
    }

    await query(`
      INSERT INTO financeiro.notas_entrada_itens (
        nota_id, numero_item, codigo_produto, descricao,
        ncm, cfop, unidade,
        quantidade, valor_unitario, valor_total, valor_desconto,
        icms_valor, ipi_valor, pis_valor
      ) VALUES ${placeholders.join(",")}
    `, values);
  }

  logger.info("NF-e importada com sucesso", { nota_id: nota?.id, numero: nfeData.numero, fornecedor: nfeData.fornecedor_nome });

  // Retornar NF completa
  const result = await queryOne(`
    SELECT n.*,
      (SELECT COUNT(*)::integer FROM financeiro.notas_entrada_itens i WHERE i.nota_id = n.id) as total_itens
    FROM financeiro.notas_entrada n WHERE n.id = $1
  `, [nota?.id]);

  res.status(201).json(result);
});

// ══════════════════════════════════════════════════════════════
// GET /nf-entrada — Lista paginada
// ══════════════════════════════════════════════════════════════

const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(["pendente", "contabilizada", "cancelada"]).optional(),
  search: z.string().optional(),
  mes: z.string().regex(/^\d{4}-\d{2}$/).optional(),
});

nfEntradaRouter.get("/", async (req: Request, res: Response) => {
  const parse = listSchema.safeParse(req.query);
  if (!parse.success) { res.status(400).json({ error: "Parâmetros inválidos" }); return; }

  const { page, limit, status, search, mes } = parse.data;
  const offset = (page - 1) * limit;
  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (status) { conditions.push(`n.status = $${idx}`); params.push(status); idx++; }
  if (search) {
    conditions.push(`(n.fornecedor_nome ILIKE $${idx} OR n.numero ILIKE $${idx} OR n.chave_acesso ILIKE $${idx})`);
    params.push(`%${search}%`); idx++;
  }
  if (mes) { conditions.push(`TO_CHAR(n.data_emissao, 'YYYY-MM') = $${idx}`); params.push(mes); idx++; }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const countResult = await queryOne<{ total: string }>(
    `SELECT COUNT(*)::text AS total FROM financeiro.notas_entrada n ${where}`, params
  );
  const total = parseInt(countResult?.total || "0", 10);

  params.push(limit, offset);
  const rows = await query(`
    SELECT n.*,
      (SELECT COUNT(*)::integer FROM financeiro.notas_entrada_itens i WHERE i.nota_id = n.id) as total_itens
    FROM financeiro.notas_entrada n
    ${where}
    ORDER BY n.data_emissao DESC, n.criado_em DESC
    LIMIT $${idx} OFFSET $${idx + 1}
  `, params);

  res.json({ data: rows, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
});

// ══════════════════════════════════════════════════════════════
// GET /nf-entrada/:id — Detalhe com itens
// ══════════════════════════════════════════════════════════════

nfEntradaRouter.get("/:id", async (req: Request, res: Response) => {
  const nota = await queryOne(`
    SELECT n.* FROM financeiro.notas_entrada n WHERE n.id = $1
  `, [req.params.id]);

  if (!nota) { res.status(404).json({ error: "NF não encontrada" }); return; }

  const itens = await query(`
    SELECT * FROM financeiro.notas_entrada_itens
    WHERE nota_id = $1 ORDER BY numero_item
  `, [req.params.id]);

  res.json({ ...nota, itens });
});

// ══════════════════════════════════════════════════════════════
// POST /nf-entrada/:id/contabilizar — Gerar lançamento
// ══════════════════════════════════════════════════════════════

nfEntradaRouter.post("/:id/contabilizar", async (req: Request, res: Response) => {
  const nota = await queryOne<{
    id: string; status: string; valor_total: string; fornecedor_nome: string;
    numero: string; data_emissao: string; lancamento_id: string | null;
  }>(
    `SELECT id, status, valor_total::text, fornecedor_nome, numero, data_emissao::text, lancamento_id
     FROM financeiro.notas_entrada WHERE id = $1`,
    [req.params.id]
  );

  if (!nota) { res.status(404).json({ error: "NF não encontrada" }); return; }
  if (nota.status === "contabilizada") { res.status(400).json({ error: "NF já contabilizada" }); return; }
  if (nota.status === "cancelada") { res.status(400).json({ error: "NF cancelada" }); return; }

  // Buscar categoria Fornecedores
  const categoria = await queryOne<{ id: string }>(
    `SELECT id FROM financeiro.categorias WHERE nome = 'Fornecedores' AND tipo = 'despesa' LIMIT 1`, []
  );
  if (!categoria) { res.status(500).json({ error: "Categoria Fornecedores não encontrada" }); return; }

  // Criar lançamento
  const descricao = `NF ${nota.numero || "s/n"} — ${nota.fornecedor_nome}`;
  const lancamento = await queryOne<{ id: string }>(`
    INSERT INTO financeiro.lancamentos (
      data, descricao, categoria_id, tipo, valor, status, observacoes,
      referencia_id, referencia_tipo, criado_por
    ) VALUES ($1, $2, $3, 'despesa', $4, 'realizado', $5, $6, 'nf_entrada', $7)
    RETURNING id
  `, [
    nota.data_emissao || new Date().toISOString().split("T")[0],
    descricao,
    categoria.id,
    parseFloat(nota.valor_total),
    `Nota Fiscal de entrada #${nota.numero}`,
    nota.id,
    req.user?.userId || null,
  ]);

  // Atualizar NF
  await query(`
    UPDATE financeiro.notas_entrada SET status = 'contabilizada', lancamento_id = $1 WHERE id = $2
  `, [lancamento?.id, nota.id]);

  logger.info("NF-e contabilizada", { nota_id: nota.id, lancamento_id: lancamento?.id });

  res.json({
    message: "NF contabilizada com sucesso",
    lancamento_id: lancamento?.id,
    nota_id: nota.id,
  });
});

// ══════════════════════════════════════════════════════════════
// DELETE /nf-entrada/:id — Cancelar NF
// ══════════════════════════════════════════════════════════════

nfEntradaRouter.delete("/:id", async (req: Request, res: Response) => {
  const nota = await queryOne<{ id: string; status: string; lancamento_id: string | null }>(
    `SELECT id, status, lancamento_id FROM financeiro.notas_entrada WHERE id = $1`,
    [req.params.id]
  );

  if (!nota) { res.status(404).json({ error: "NF não encontrada" }); return; }

  // Se já contabilizada, cancelar o lançamento também
  if (nota.lancamento_id) {
    await query(
      `UPDATE financeiro.lancamentos SET status = 'cancelado' WHERE id = $1`,
      [nota.lancamento_id]
    );
  }

  await query(
    `UPDATE financeiro.notas_entrada SET status = 'cancelada' WHERE id = $1`,
    [req.params.id]
  );

  res.json({ message: "NF cancelada" });
});

// ══════════════════════════════════════════════════════════════
// GET /nf-entrada/resumo — KPIs
// ══════════════════════════════════════════════════════════════

nfEntradaRouter.get("/resumo/geral", async (_req: Request, res: Response) => {
  const resumo = await queryOne<{
    total_notas: string; pendentes: string; contabilizadas: string;
    valor_total: string; valor_contabilizado: string;
  }>(`
    SELECT
      COUNT(*)::text AS total_notas,
      COUNT(*) FILTER (WHERE status = 'pendente')::text AS pendentes,
      COUNT(*) FILTER (WHERE status = 'contabilizada')::text AS contabilizadas,
      COALESCE(SUM(valor_total), 0)::text AS valor_total,
      COALESCE(SUM(valor_total) FILTER (WHERE status = 'contabilizada'), 0)::text AS valor_contabilizado
    FROM financeiro.notas_entrada
    WHERE status != 'cancelada'
  `, []);

  res.json(resumo);
});
