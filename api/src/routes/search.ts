import { Router, Request, Response } from "express";
import { z } from "zod";
import { query } from "../db";
import { authMiddleware } from "../middleware/auth";

export const searchRouter = Router();
searchRouter.use(authMiddleware);

const searchSchema = z.object({
  q: z.string().min(2).max(100),
  limit: z.coerce.number().int().min(1).max(20).default(5),
});

searchRouter.get("/", async (req: Request, res: Response) => {
  const parse = searchSchema.safeParse(req.query);
  if (!parse.success) { res.status(400).json({ error: "Busca deve ter pelo menos 2 caracteres" }); return; }

  const { q, limit } = parse.data;
  const term = `%${q}%`;

  const [clientes, produtos, lancamentos, nfs] = await Promise.all([
    query<{ id: string; nome: string; email: string; telefone: string }>(`
      SELECT id, nome, email, telefone FROM crm.customers
      WHERE ativo = true AND (nome ILIKE $1 OR email ILIKE $1 OR telefone ILIKE $1)
      ORDER BY nome LIMIT $2
    `, [term, limit]),

    query<{ id: string; nome: string; sku: string; preco_venda: number; categoria: string }>(`
      SELECT id, nome, sku, preco_venda, categoria FROM sync.bling_products
      WHERE ativo = true AND (nome ILIKE $1 OR sku ILIKE $1)
      ORDER BY nome LIMIT $2
    `, [term, limit]),

    query<{ id: string; data: string; descricao: string; valor: string; tipo: string }>(`
      SELECT id, data::text, descricao, valor::text, tipo FROM financeiro.lancamentos
      WHERE status != 'cancelado' AND (descricao ILIKE $1 OR observacoes ILIKE $1)
      ORDER BY data DESC LIMIT $2
    `, [term, limit]),

    query<{ id: string; numero: string; fornecedor_nome: string; valor_total: string }>(`
      SELECT id, numero, fornecedor_nome, valor_total::text FROM financeiro.notas_entrada
      WHERE status != 'cancelada' AND (fornecedor_nome ILIKE $1 OR numero ILIKE $1 OR chave_acesso ILIKE $1)
      ORDER BY data_emissao DESC LIMIT $2
    `, [term, limit]),
  ]);

  res.json({
    clientes: clientes.map(c => ({ ...c, _type: 'cliente', _url: `/clientes/${c.id}` })),
    produtos: produtos.map(p => ({ ...p, _type: 'produto', _url: `/produtos/${p.id}` })),
    lancamentos: lancamentos.map(l => ({ ...l, _type: 'lancamento', _url: '/financeiro' })),
    nfs: nfs.map(n => ({ ...n, _type: 'nf', _url: '/nf-entrada' })),
    total: clientes.length + produtos.length + lancamentos.length + nfs.length,
  });
});
