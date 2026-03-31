import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Package, DollarSign, TrendingUp, Warehouse,
  ShoppingCart, Tag, BarChart3,
} from 'lucide-react';
import api from '../lib/api';
import { useToast } from '../components/Toast';
import { formatCurrency, margemColor } from '../lib/format';

interface Produto {
  id: string;
  bling_id: string;
  nome: string;
  sku: string;
  preco_custo: number;
  preco_venda: number;
  categoria: string;
  ativo: boolean;
  tipo: string;
  unidade: string;
  gtin: string;
  margem_percentual: number;
  estoque: Array<{ deposito_nome: string; saldo_fisico: string; saldo_virtual: string }>;
  vendas: {
    total_vendido: number;
    receita_total: number;
    custo_total: number;
    lucro_total: number;
    ultima_venda: string | null;
  };
}

function margemBg(m: number) {
  if (m >= 50) return 'bg-emerald-400';
  if (m >= 20) return 'bg-amber-400';
  return 'bg-red-400';
}

export default function ProdutoPerfil() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [produto, setProduto] = useState<Produto | null>(null);
  const [loading, setLoading] = useState(true);
  const { error: showError } = useToast();

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    api.get(`/products/${id}`)
      .then(({ data }) => setProduto(data))
      .catch(() => { showError('Erro ao carregar dados'); })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 bg-bibelo-border rounded animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 bg-bibelo-card border border-bibelo-border rounded-xl p-5 animate-pulse h-64" />
          <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-5 animate-pulse h-64" />
        </div>
      </div>
    );
  }

  if (!produto) {
    return (
      <div className="text-center py-16">
        <Package size={48} className="mx-auto mb-4 text-bibelo-muted opacity-50" />
        <p className="text-bibelo-muted mb-4">Produto não encontrado</p>
        <button onClick={() => navigate('/produtos')} className="text-bibelo-primary text-sm hover:underline">Voltar</button>
      </div>
    );
  }

  const estoqueTotal = produto.estoque.reduce((s, e) => s + parseFloat(e.saldo_fisico), 0);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/produtos')} className="p-2 rounded-lg text-bibelo-muted hover:text-bibelo-text hover:bg-bibelo-border/50 transition-colors">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-bibelo-text">{produto.nome}</h1>
          <div className="flex items-center gap-3 mt-1">
            {produto.sku && <span className="text-xs text-bibelo-muted bg-bibelo-border/50 px-2 py-0.5 rounded">SKU: {produto.sku}</span>}
            {produto.categoria && <span className="text-xs text-bibelo-muted bg-bibelo-border/50 px-2 py-0.5 rounded">{produto.categoria}</span>}
            <span className={`text-xs px-2 py-0.5 rounded ${produto.ativo ? 'bg-emerald-400/10 text-emerald-400' : 'bg-red-400/10 text-red-400'}`}>
              {produto.ativo ? 'Ativo' : 'Inativo'}
            </span>
          </div>
        </div>
      </div>

      {/* KPIs de preço/margem */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-4">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-bibelo-muted">Preço Venda</p>
            <Tag size={14} className="text-bibelo-primary" />
          </div>
          <p className="text-xl font-bold text-bibelo-text">{formatCurrency(produto.preco_venda)}</p>
        </div>
        <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-4">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-bibelo-muted">Custo</p>
            <DollarSign size={14} className="text-amber-400" />
          </div>
          <p className="text-xl font-bold text-bibelo-text">{formatCurrency(produto.preco_custo)}</p>
        </div>
        <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-4">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-bibelo-muted">Margem</p>
            <TrendingUp size={14} className={margemColor(produto.margem_percentual)} />
          </div>
          <div className="flex items-center gap-2">
            <p className={`text-xl font-bold ${margemColor(produto.margem_percentual)}`}>{produto.margem_percentual}%</p>
            <div className="flex-1 h-2 bg-bibelo-border rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${margemBg(produto.margem_percentual)}`} style={{ width: `${Math.min(produto.margem_percentual, 100)}%` }} />
            </div>
          </div>
        </div>
        <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-4">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-bibelo-muted">Estoque Total</p>
            <Warehouse size={14} className={estoqueTotal > 0 ? 'text-blue-400' : 'text-red-400'} />
          </div>
          <p className={`text-xl font-bold ${estoqueTotal > 0 ? 'text-bibelo-text' : 'text-red-400'}`}>
            {estoqueTotal} {produto.unidade || 'un'}
          </p>
        </div>
        <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-4">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-bibelo-muted">Vendidos</p>
            <ShoppingCart size={14} className="text-violet-400" />
          </div>
          <p className="text-xl font-bold text-bibelo-text">{produto.vendas.total_vendido}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Vendas */}
        <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-5">
          <h2 className="text-sm font-medium text-bibelo-muted mb-4 flex items-center gap-2">
            <BarChart3 size={14} /> Desempenho de Vendas
          </h2>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-bibelo-muted">Receita Total</p>
                <p className="text-lg font-bold text-emerald-400">{formatCurrency(produto.vendas.receita_total)}</p>
              </div>
              <div>
                <p className="text-xs text-bibelo-muted">Custo Total</p>
                <p className="text-lg font-bold text-amber-400">{formatCurrency(produto.vendas.custo_total)}</p>
              </div>
              <div>
                <p className="text-xs text-bibelo-muted">Lucro Total</p>
                <p className={`text-lg font-bold ${produto.vendas.lucro_total >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {formatCurrency(produto.vendas.lucro_total)}
                </p>
              </div>
              <div>
                <p className="text-xs text-bibelo-muted">Última Venda</p>
                <p className="text-sm text-bibelo-text">
                  {produto.vendas.ultima_venda
                    ? new Date(produto.vendas.ultima_venda).toLocaleDateString('pt-BR')
                    : 'Sem vendas'}
                </p>
              </div>
            </div>

            {/* Barra lucro visual */}
            {produto.vendas.receita_total > 0 && (
              <div className="pt-3 border-t border-bibelo-border">
                <div className="flex justify-between text-xs text-bibelo-muted mb-2">
                  <span>Custo {Math.round((produto.vendas.custo_total / produto.vendas.receita_total) * 100)}%</span>
                  <span>Lucro {Math.round((produto.vendas.lucro_total / produto.vendas.receita_total) * 100)}%</span>
                </div>
                <div className="h-3 bg-bibelo-bg rounded-full overflow-hidden flex">
                  <div className="h-full bg-amber-400 rounded-l-full" style={{ width: `${(produto.vendas.custo_total / produto.vendas.receita_total) * 100}%` }} />
                  <div className="h-full bg-emerald-400 rounded-r-full" style={{ width: `${(produto.vendas.lucro_total / produto.vendas.receita_total) * 100}%` }} />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Estoque por depósito */}
        <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-5">
          <h2 className="text-sm font-medium text-bibelo-muted mb-4 flex items-center gap-2">
            <Warehouse size={14} /> Estoque por Depósito
          </h2>
          {produto.estoque.length === 0 ? (
            <div className="py-8 text-center text-bibelo-muted">
              <Warehouse size={24} className="mx-auto mb-2 opacity-50" />
              <p>Sem dados de estoque</p>
            </div>
          ) : (
            <div className="space-y-3">
              {produto.estoque.map((e, i) => {
                const saldo = parseFloat(e.saldo_fisico);
                return (
                  <div key={i} className="flex items-center justify-between py-2 border-b border-bibelo-border/50 last:border-0">
                    <div>
                      <p className="text-sm text-bibelo-text">{e.deposito_nome || `Depósito ${i + 1}`}</p>
                    </div>
                    <div className="text-right">
                      <p className={`text-lg font-bold ${saldo > 5 ? 'text-bibelo-text' : saldo > 0 ? 'text-amber-400' : 'text-red-400'}`}>
                        {saldo}
                      </p>
                      <p className="text-xs text-bibelo-muted">físico</p>
                    </div>
                  </div>
                );
              })}
              <div className="flex items-center justify-between pt-2 border-t border-bibelo-border">
                <p className="text-sm text-bibelo-muted font-medium">Total</p>
                <p className="text-lg font-bold text-bibelo-primary">{estoqueTotal}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
