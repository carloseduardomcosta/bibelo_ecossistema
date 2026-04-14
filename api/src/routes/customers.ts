import { Router, Request, Response } from "express";
import { z } from "zod";
import { query, queryOne } from "../db";
import { authMiddleware } from "../middleware/auth";
import { logger } from "../utils/logger";
import { triggerFlow } from "../services/flow.service";
import {
  upsertCustomer,
  getTimeline,
  Customer,
  CustomerScore,
} from "../services/customer.service";

export const customersRouter = Router();
customersRouter.use(authMiddleware);

// ── Schemas Zod ────────────────────────────────────────────────

const createCustomerSchema = z.object({
  nome: z.string().min(2).max(255),
  email: z.string().email().optional(),
  telefone: z.string().max(30).optional(),
  cpf: z.string().max(14).optional(),
  data_nasc: z.string().optional(),
  canal_origem: z.string().max(50).optional(),
  bling_id: z.string().max(50).optional(),
  nuvemshop_id: z.string().max(50).optional(),
  instagram: z.string().max(100).optional(),
  logradouro: z.string().max(255).optional(),
  numero: z.string().max(20).optional(),
  complemento: z.string().max(100).optional(),
  bairro: z.string().max(100).optional(),
  cidade: z.string().max(100).optional(),
  estado: z.string().max(2).optional(),
  cep: z.string().max(10).optional(),
});

const updateCustomerSchema = createCustomerSchema.partial();

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  segmento: z.string().optional(),
  canal_origem: z.string().optional(),
  contato: z.enum(["com_email", "sem_email", "com_telefone", "sem_telefone"]).optional(),
  cidade: z.string().optional(),
  ordenar: z.enum(["recentes", "nome", "score", "score_desc"]).default("recentes"),
  tipo: z.enum(["cliente", "b2b", "todos"]).default("cliente"),
});

// ── GET /api/customers — lista paginada ────────────────────────

customersRouter.get("/", async (req: Request, res: Response) => {
  const parse = listQuerySchema.safeParse(req.query);
  if (!parse.success) {
    res.status(400).json({ error: "Parâmetros inválidos", detalhes: parse.error.errors });
    return;
  }

  const { page, limit, search, segmento, canal_origem, contato, cidade, ordenar, tipo } = parse.data;
  const offset = (page - 1) * limit;

  const conditions: string[] = ["c.ativo = true"];
  if (tipo === "cliente") conditions.push("COALESCE(c.tipo, 'cliente') = 'cliente'");
  else if (tipo === "b2b") conditions.push("c.tipo = 'b2b'");
  const params: unknown[] = [];
  let idx = 1;

  if (search) {
    conditions.push(`(c.nome ILIKE $${idx} OR c.email ILIKE $${idx} OR c.telefone ILIKE $${idx})`);
    params.push(`%${search}%`);
    idx++;
  }

  if (canal_origem) {
    conditions.push(`c.canal_origem = $${idx}`);
    params.push(canal_origem);
    idx++;
  }

  if (segmento) {
    conditions.push(`cs.segmento = $${idx}`);
    params.push(segmento);
    idx++;
  }

  if (contato === "com_email") {
    conditions.push("c.email IS NOT NULL AND c.email != ''");
  } else if (contato === "sem_email") {
    conditions.push("(c.email IS NULL OR c.email = '')");
  } else if (contato === "com_telefone") {
    conditions.push("c.telefone IS NOT NULL AND c.telefone != ''");
  } else if (contato === "sem_telefone") {
    conditions.push("(c.telefone IS NULL OR c.telefone = '')");
  }

  if (cidade) {
    conditions.push(`LOWER(c.cidade) = LOWER($${idx})`);
    params.push(cidade);
    idx++;
  }

  const where = conditions.join(" AND ");

  const countResult = await queryOne<{ total: string }>(
    `SELECT COUNT(*)::text AS total FROM crm.customers c
     LEFT JOIN crm.customer_scores cs ON cs.customer_id = c.id
     WHERE ${where}`,
    params
  );

  const total = parseInt(countResult?.total || "0", 10);

  let orderBy = "c.criado_em DESC";
  if (ordenar === "nome") orderBy = "COALESCE(c.nome, 'zzz') ASC";
  else if (ordenar === "score") orderBy = "COALESCE(cs.score, -1) ASC, c.nome ASC";
  else if (ordenar === "score_desc") orderBy = "COALESCE(cs.score, -1) DESC, c.nome ASC";

  params.push(limit, offset);
  const rows = await query(
    `SELECT c.*, cs.score, cs.ltv, cs.segmento, cs.risco_churn
     FROM crm.customers c
     LEFT JOIN crm.customer_scores cs ON cs.customer_id = c.id
     WHERE ${where}
     ORDER BY ${orderBy}
     LIMIT $${idx} OFFSET $${idx + 1}`,
    params
  );

  res.json({
    data: rows,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  });
});

// ── GET /api/customers/cidades — cidades disponíveis para filtro ──

customersRouter.get("/cidades", async (_req: Request, res: Response) => {
  const cidades = await query<{ cidade: string; total: string }>(
    `SELECT cidade, COUNT(*)::text as total FROM crm.customers
     WHERE ativo = true AND cidade IS NOT NULL AND cidade != ''
     GROUP BY cidade ORDER BY COUNT(*) DESC LIMIT 50`
  );
  res.json(cidades);
});

// ── GET /api/customers/stats — KPIs rápidos ───────────────────

customersRouter.get("/stats", async (_req: Request, res: Response) => {
  const stats = await queryOne<Record<string, string>>(
    `SELECT
       COUNT(*)::text AS total,
       COUNT(*) FILTER (WHERE c.email IS NOT NULL AND c.email != '')::text AS com_email,
       COUNT(*) FILTER (WHERE c.telefone IS NOT NULL AND c.telefone != '')::text AS com_telefone,
       COUNT(*) FILTER (WHERE c.criado_em > NOW() - INTERVAL '30 days')::text AS novos_30d,
       COUNT(*) FILTER (WHERE cs.segmento = 'inativo')::text AS inativos,
       COUNT(*) FILTER (WHERE cs.score >= 70)::text AS score_alto,
       COALESCE(ROUND(AVG(cs.score), 0)::text, '0') AS score_medio
     FROM crm.customers c
     LEFT JOIN crm.customer_scores cs ON cs.customer_id = c.id
     WHERE c.ativo = true AND COALESCE(c.tipo, 'cliente') = 'cliente'`
  );
  res.json(stats);
});

// ── GET /api/customers/:id — perfil completo ───────────────────

customersRouter.get("/:id", async (req: Request, res: Response) => {
  const { id } = req.params;

  const customer = await queryOne<Customer>(
    "SELECT * FROM crm.customers WHERE id = $1",
    [id]
  );

  if (!customer) {
    res.status(404).json({ error: "Cliente não encontrado" });
    return;
  }

  const score = await queryOne<CustomerScore>(
    "SELECT * FROM crm.customer_scores WHERE customer_id = $1",
    [id]
  );

  const recentInteractions = await query(
    `SELECT * FROM crm.interactions WHERE customer_id = $1 ORDER BY criado_em DESC LIMIT 10`,
    [id]
  );

  res.json({ ...customer, score, recentInteractions });
});

// ── POST /api/customers — criar/upsert ─────────────────────────

customersRouter.post("/", async (req: Request, res: Response) => {
  const parse = createCustomerSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: "Dados inválidos", detalhes: parse.error.errors });
    return;
  }

  try {
    const { dispararFluxo: _df, ...dadosCustomer } = { dispararFluxo: true, ...parse.data };
    const ehManual = !dadosCustomer.canal_origem || dadosCustomer.canal_origem === "manual";
    const customerData = ehManual
      ? { ...dadosCustomer, canal_origem: "manual" as const }
      : dadosCustomer;

    const customer = await upsertCustomer(customerData);
    logger.info("Cliente criado/atualizado via API", { id: customer.id, user: req.user?.email });

    // Dispara fluxo Clube Bibelô para clientes criados manualmente com email
    if (ehManual && customer.email) {
      // Cria lead verificado (sem necessidade de confirmação por email)
      await query(
        `INSERT INTO marketing.leads
           (email, nome, telefone, fonte, cupom, customer_id, email_verificado, email_verificado_em)
         VALUES ($1, $2, $3, 'manual', 'BIBELO10', $4, true, NOW())
         ON CONFLICT (email) DO NOTHING`,
        [customer.email.toLowerCase(), customer.nome, customer.telefone || null, customer.id]
      );

      triggerFlow("lead.captured", customer.id, {
        email: customer.email,
        nome: customer.nome,
        cupom: "BIBELO10",
        fonte: "manual",
      }).catch((err) => logger.warn("Falha ao disparar fluxo para cliente manual", { error: String(err) }));
    }

    res.status(201).json(customer);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro ao criar cliente";
    logger.error("Erro ao criar cliente", { error: message });
    res.status(500).json({ error: "Erro ao criar cliente" });
  }
});

// ── PUT /api/customers/:id — atualizar ─────────────────────────

customersRouter.put("/:id", async (req: Request, res: Response) => {
  const parse = updateCustomerSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: "Dados inválidos", detalhes: parse.error.errors });
    return;
  }

  const { id } = req.params;

  const existing = await queryOne<Customer>(
    "SELECT id FROM crm.customers WHERE id = $1",
    [id]
  );

  if (!existing) {
    res.status(404).json({ error: "Cliente não encontrado" });
    return;
  }

  // Whitelist de colunas permitidas — previne SQL column injection
  const ALLOWED_COLS = new Set(["nome","email","telefone","cpf","data_nasc","canal_origem","bling_id","nuvemshop_id","instagram","logradouro","numero","complemento","bairro","cidade","estado","cep"]);
  const entries = Object.entries(parse.data).filter(([k, v]) => v !== undefined && ALLOWED_COLS.has(k));
  if (entries.length === 0) {
    res.status(400).json({ error: "Nenhum campo para atualizar" });
    return;
  }

  const sets = entries.map(([k], i) => `"${k}" = $${i + 1}`);
  const values = entries.map(([, v]) => v);
  values.push(id);

  const updated = await queryOne<Customer>(
    `UPDATE crm.customers SET ${sets.join(", ")} WHERE id = $${values.length} RETURNING *`,
    values
  );

  logger.info("Cliente atualizado via API", { id, user: req.user?.email });
  res.json(updated);
});

// ── POST /api/customers/:id/reativar-email — reverter opt-out ──

customersRouter.post("/:id/reativar-email", async (req: Request, res: Response) => {
  const { id } = req.params;

  const customer = await queryOne<{ id: string; email: string | null; email_optout: boolean; email_optout_em: string | null }>(
    "SELECT id, email, email_optout, email_optout_em FROM crm.customers WHERE id = $1",
    [id]
  );

  if (!customer) {
    res.status(404).json({ error: "Cliente não encontrado" });
    return;
  }

  if (!customer.email_optout) {
    res.json({ message: "Cliente já está ativo para emails", email_optout: false });
    return;
  }

  await query(
    "UPDATE crm.customers SET email_optout = false, email_optout_em = NULL WHERE id = $1",
    [id]
  );

  // Registra na timeline para auditoria
  await query(
    `INSERT INTO crm.interactions (customer_id, tipo, canal, descricao, metadata)
     VALUES ($1, 'sistema', 'email', 'Email reativado pelo admin', $2)`,
    [id, JSON.stringify({ reativado_por: req.user?.email, optout_anterior: customer.email_optout_em })]
  );

  logger.info("Email reativado pelo admin", { customerId: id, user: req.user?.email, optout_anterior: customer.email_optout_em });
  res.json({ message: "Email reativado com sucesso", email_optout: false });
});

// ── GET /api/customers/:id/tracking — histórico comportamental ─

customersRouter.get("/:id/tracking", async (req: Request, res: Response) => {
  const { id } = req.params;
  const limit = Math.min(Number(req.query.limit) || 100, 200);
  const offset = Number(req.query.offset) || 0;

  const customer = await queryOne("SELECT id FROM crm.customers WHERE id = $1", [id]);
  if (!customer) {
    res.status(404).json({ error: "Cliente não encontrado" });
    return;
  }

  const events = await query<Record<string, unknown>>(
    `SELECT t.id, t.visitor_id, t.evento, t.pagina, t.pagina_tipo,
            t.resource_id, t.resource_nome, t.resource_preco, t.resource_imagem,
            t.metadata, t.referrer, t.ip, t.criado_em,
            t.geo_city, t.geo_region, t.geo_country,
            t.utm_source, t.utm_medium, t.utm_campaign
     FROM crm.tracking_events t
     WHERE t.customer_id = $1
     ORDER BY t.criado_em DESC
     LIMIT $2 OFFSET $3`,
    [id, limit, offset]
  );

  const stats = await queryOne<Record<string, unknown>>(
    `SELECT
       COUNT(*)::int AS total_eventos,
       COUNT(DISTINCT DATE(criado_em))::int AS dias_ativos,
       COUNT(*) FILTER (WHERE evento = 'product_view')::int AS produtos_vistos,
       COUNT(*) FILTER (WHERE evento = 'add_to_cart')::int AS add_carrinho,
       COUNT(*) FILTER (WHERE evento = 'checkout_start')::int AS checkouts,
       MIN(criado_em) AS primeiro_evento,
       MAX(criado_em) AS ultimo_evento
     FROM crm.tracking_events WHERE customer_id = $1`,
    [id]
  );

  res.json({ events, stats });
});

// ── GET /api/customers/:id/timeline ────────────────────────────

customersRouter.get("/:id/timeline", async (req: Request, res: Response) => {
  const { id } = req.params;
  const limit = Math.min(Number(req.query.limit) || 50, 100);
  const offset = Number(req.query.offset) || 0;

  const customer = await queryOne("SELECT id FROM crm.customers WHERE id = $1", [id]);
  if (!customer) {
    res.status(404).json({ error: "Cliente não encontrado" });
    return;
  }

  const timeline = await getTimeline(id, limit, offset);
  res.json({ data: timeline });
});
