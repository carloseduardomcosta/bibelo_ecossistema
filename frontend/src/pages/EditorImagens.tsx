import { useState, useCallback, useRef, useEffect } from 'react';
import {
  Download, Trash2, Settings2, Loader2, Search,
  CheckCircle2, AlertTriangle, ArrowRight, FileImage,
  ZoomIn, X, UploadCloud, Store, Send, Package, CloudDownload,
} from 'lucide-react';
import api from '../lib/api';

// ── Tipos ──────────────────────────────────────────────────

interface ImageFile {
  id: string;
  file: File;
  preview: string;
  name: string;
  size: number;
}

interface ConvertedImage {
  originalName: string;
  originalSize: number;
  convertedSize: number;
  width: number;
  height: number;
  format: string;
  data: string;
}

interface ConvertResult {
  total: number;
  convertidos: number;
  erros: number;
  config: { width: number; height: number; format: string; quality: number; background: string; fit: string };
  results: ConvertedImage[];
}

interface BlingProduct {
  bling_id: number;
  nome: string;
  sku: string;
  preco_venda: number;
  imagens: string | null;
}

interface SendBlingResult {
  success: boolean;
  blingProductId: number;
  imagesCount: number;
  images: Array<{ link: string; fileName: string }>;
}

interface BlingApiProduct {
  id: number;
  nome: string;
  codigo: string;
  preco: number;
  situacao: string;
  imagemURL: string | null;
}

interface BlingProductImages {
  blingId: number;
  nome: string;
  imagens: Array<{ url: string; tipo: string }>;
}

// ── Presets ────────────────────────────────────────────────
const PRESETS = [
  { key: 'shopee', width: 1000, height: 1000, format: 'jpeg', quality: 90, label: 'Shopee' },
  { key: 'nuvemshop', width: 1024, height: 1024, format: 'jpeg', quality: 92, label: 'NuvemShop' },
  { key: 'medusa', width: 1200, height: 1200, format: 'png', quality: 95, label: 'Loja Própria' },
  { key: 'instagram', width: 1080, height: 1080, format: 'jpeg', quality: 95, label: 'Instagram' },
  { key: 'custom', width: 1000, height: 1000, format: 'jpeg', quality: 90, label: 'Personalizado' },
];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function compressionPercent(original: number, converted: number): string {
  if (!original || !converted) return '—';
  const pct = ((1 - converted / original) * 100).toFixed(0);
  return `${pct}% menor`;
}

export default function EditorImagens() {
  const [images, setImages] = useState<ImageFile[]>([]);
  const [results, setResults] = useState<ConvertResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [previewIdx, setPreviewIdx] = useState<number | null>(null);

  // Configurações
  const [selectedPresets, setSelectedPresets] = useState<string[]>(['shopee']);
  const [customWidth, setCustomWidth] = useState(1000);
  const [customHeight, setCustomHeight] = useState(1000);
  const [customFormat, setCustomFormat] = useState<'jpeg' | 'png' | 'webp'>('jpeg');
  const [customQuality, setCustomQuality] = useState(90);
  const [background, setBackground] = useState('#FFFFFF');
  const [fit, setFit] = useState<'contain' | 'cover' | 'fill'>('contain');

  // Bling
  const [blingSearch, setBlingSearch] = useState('');
  const [blingProducts, setBlingProducts] = useState<BlingProduct[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<BlingProduct | null>(null);
  const [blingLoading, setBlingLoading] = useState(false);
  const [sendingBling, setSendingBling] = useState(false);
  const [showBlingPanel, setShowBlingPanel] = useState(false);

  const [replaceAll, setReplaceAll] = useState(true);
  const [selectedProductImages, setSelectedProductImages] = useState<Array<{ url: string; tipo: string }>>([]);
  const [loadingProductImages, setLoadingProductImages] = useState(false);

  // Buscar do Bling (novo painel)
  const [showBlingBrowser, setShowBlingBrowser] = useState(false);
  const [blingApiProducts, setBlingApiProducts] = useState<BlingApiProduct[]>([]);
  const [blingApiLoading, setBlingApiLoading] = useState(false);
  const [blingApiSearch, setBlingApiSearch] = useState('');
  const [blingProductImages, setBlingProductImages] = useState<BlingProductImages | null>(null);
  const [importingImage, setImportingImage] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>();
  const blingApiTimeout = useRef<ReturnType<typeof setTimeout>>();

  // ── Buscar produtos do banco local (todos os 373+, busca real) ─
  const fetchBlingApiProducts = useCallback(async (search: string) => {
    setBlingApiLoading(true);
    try {
      const resp = await api.get<{ products: BlingProduct[] }>('/images/bling-products', {
        params: { search: search || undefined },
      });
      // Mapear para o formato BlingApiProduct
      setBlingApiProducts(resp.data.products.map((p: any) => ({
        id: p.bling_id,
        nome: p.nome,
        codigo: p.sku,
        preco: p.preco_venda,
        situacao: 'A',
        imagemURL: null,
      })));
    } catch {
      setBlingApiProducts([]);
    } finally {
      setBlingApiLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!showBlingBrowser) return;
    if (blingApiTimeout.current) clearTimeout(blingApiTimeout.current);
    blingApiTimeout.current = setTimeout(() => fetchBlingApiProducts(blingApiSearch), 400);
    return () => { if (blingApiTimeout.current) clearTimeout(blingApiTimeout.current); };
  }, [blingApiSearch, showBlingBrowser, fetchBlingApiProducts]);

  // ── Buscar imagens de um produto específico ──────────────
  const fetchProductImages = async (productId: number) => {
    setBlingApiLoading(true);
    try {
      const resp = await api.get<BlingProductImages>(`/images/bling-product/${productId}/images`);
      setBlingProductImages(resp.data);
    } catch {
      setError('Erro ao buscar imagens do produto no Bling');
    } finally {
      setBlingApiLoading(false);
    }
  };

  // ── Importar imagem do Bling para o editor ───────────────
  const importBlingImage = async (url: string, productName: string) => {
    setImportingImage(true);
    try {
      // Usa proxy do backend para evitar CORS do S3 Bling
      const resp = await api.get('/images/proxy', {
        params: { url },
        responseType: 'blob',
        timeout: 30000,
      });
      const blob = resp.data as Blob;
      const ext = blob.type.includes('png') ? '.png' : blob.type.includes('webp') ? '.webp' : '.jpg';
      const safeName = productName.replace(/[^a-zA-Z0-9À-ü ]/g, '').trim().replace(/\s+/g, '_');
      const file = new File([blob], `${safeName}${ext}`, { type: blob.type });

      const newImage: ImageFile = {
        id: `${Date.now()}_bling_${Math.random().toString(36).slice(2, 8)}`,
        file,
        preview: URL.createObjectURL(blob),
        name: file.name,
        size: file.size,
      };
      setImages(prev => [...prev, newImage]);
      setResults(null);
      setSuccess(`Imagem "${productName}" importada do Bling`);
    } catch {
      setError('Erro ao importar imagem do Bling — a URL pode ter expirado');
    } finally {
      setImportingImage(false);
    }
  };

  // ── Buscar imagens do produto selecionado (painel de envio) ──
  const fetchSelectedProductImages = useCallback(async (blingId: number) => {
    setLoadingProductImages(true);
    setSelectedProductImages([]);
    try {
      const resp = await api.get<BlingProductImages>(`/images/bling-product/${blingId}/images`);
      setSelectedProductImages(resp.data.imagens || []);
    } catch {
      setSelectedProductImages([]);
    } finally {
      setLoadingProductImages(false);
    }
  }, []);

  // ── Buscar produtos Bling (painel de envio) ──────────────
  useEffect(() => {
    if (!showBlingPanel) return;
    if (searchTimeout.current) clearTimeout(searchTimeout.current);

    searchTimeout.current = setTimeout(async () => {
      setBlingLoading(true);
      try {
        const resp = await api.get<{ products: BlingProduct[] }>('/images/bling-products', {
          params: { search: blingSearch || undefined },
        });
        setBlingProducts(resp.data.products);
      } catch {
        setBlingProducts([]);
      } finally {
        setBlingLoading(false);
      }
    }, 300);

    return () => { if (searchTimeout.current) clearTimeout(searchTimeout.current); };
  }, [blingSearch, showBlingPanel]);

  // ── Handlers ─────────────────────────────────────────────

  const addFiles = useCallback((fileList: FileList | null) => {
    if (!fileList) return;
    const newImages: ImageFile[] = [];
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      if (!file.type.startsWith('image/')) continue;
      newImages.push({
        id: `${Date.now()}_${i}_${Math.random().toString(36).slice(2, 8)}`,
        file,
        preview: URL.createObjectURL(file),
        name: file.name,
        size: file.size,
      });
    }
    setImages(prev => [...prev, ...newImages]);
    setResults(null);
    setError('');
    setSuccess('');
  }, []);

  const removeImage = (id: string) => {
    setImages(prev => {
      const img = prev.find(i => i.id === id);
      if (img) URL.revokeObjectURL(img.preview);
      return prev.filter(i => i.id !== id);
    });
    setResults(null);
  };

  const clearAll = () => {
    images.forEach(i => URL.revokeObjectURL(i.preview));
    setImages([]);
    setResults(null);
    setError('');
    setSuccess('');
  };

  const togglePreset = (key: string) => {
    setSelectedPresets(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
    setResults(null);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    addFiles(e.dataTransfer.files);
  }, [addFiles]);

  const handleDragOver = (e: React.DragEvent) => e.preventDefault();

  // ── Converter (preview local) ────────────────────────────

  const convertAll = async () => {
    if (images.length === 0) return;
    if (selectedPresets.length === 0) {
      setError('Selecione pelo menos um destino');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    const formData = new FormData();
    images.forEach(img => formData.append('images', img.file));
    formData.append('preset', selectedPresets[0]);

    if (selectedPresets[0] === 'custom') {
      formData.append('width', String(customWidth));
      formData.append('height', String(customHeight));
      formData.append('format', customFormat);
      formData.append('quality', String(customQuality));
    }

    formData.append('background', background);
    formData.append('fit', fit);

    try {
      const resp = await api.post<ConvertResult>('/images/convert', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 120000,
      });
      setResults(resp.data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao converter imagens');
    } finally {
      setLoading(false);
    }
  };

  // ── Enviar ao Bling ──────────────────────────────────────

  const sendToBling = async () => {
    if (!selectedProduct || images.length === 0) return;

    setSendingBling(true);
    setError('');
    setSuccess('');

    const formData = new FormData();
    images.forEach(img => formData.append('images', img.file));
    formData.append('blingProductId', String(selectedProduct.bling_id));
    formData.append('preset', selectedPresets[0] || 'shopee');
    formData.append('background', background);
    formData.append('fit', fit);
    if (replaceAll) formData.append('replaceAll', 'true');

    if (selectedPresets[0] === 'custom') {
      formData.append('width', String(customWidth));
      formData.append('height', String(customHeight));
      formData.append('format', customFormat);
      formData.append('quality', String(customQuality));
    }

    try {
      const resp = await api.post<SendBlingResult>('/images/send-bling', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 120000,
      });
      const action = replaceAll ? 'substituída(s)' : 'adicionada(s)';
      setSuccess(
        `${resp.data.imagesCount} imagem(ns) ${action} no Bling para "${selectedProduct.nome}" (ID: ${resp.data.blingProductId})`
      );
      // Atualizar preview das imagens do produto
      if (selectedProduct) fetchSelectedProductImages(selectedProduct.bling_id);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao enviar ao Bling');
    } finally {
      setSendingBling(false);
    }
  };

  // ── Download ─────────────────────────────────────────────

  const downloadOne = (result: ConvertedImage) => {
    if (!result.data) return;
    const link = document.createElement('a');
    link.href = result.data;
    const baseName = result.originalName.replace(/\.[^.]+$/, '');
    link.download = `${baseName}_converted.${result.format}`;
    link.click();
  };

  const downloadAll = () => {
    if (!results) return;
    results.results
      .filter(r => r.format !== 'erro')
      .forEach((r, i) => { setTimeout(() => downloadOne(r), i * 200); });
  };

  // ── Render ───────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-bibelo-text flex items-center gap-2">
            <FileImage className="w-7 h-7 text-bibelo-primary" />
            Editor de Imagens
          </h1>
          <p className="text-bibelo-muted mt-1">
            Converta, padronize e envie imagens para Bling, Shopee, NuvemShop e Loja Própria
          </p>
        </div>
        {images.length > 0 && (
          <button onClick={clearAll} className="flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors">
            <Trash2 className="w-4 h-4" /> Limpar tudo
          </button>
        )}
      </div>

      {/* Upload area */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onClick={() => fileInputRef.current?.click()}
        className="border-2 border-dashed border-bibelo-border rounded-xl p-8 text-center cursor-pointer hover:border-bibelo-primary hover:bg-bibelo-primary/5 transition-all"
      >
        <UploadCloud className="w-12 h-12 text-bibelo-muted mx-auto mb-3" />
        <p className="text-bibelo-text font-medium">Arraste imagens aqui ou clique para selecionar</p>
        <p className="text-bibelo-muted text-sm mt-1">
          WEBP, PNG, JPG, GIF, BMP, TIFF, AVIF — até 15MB cada — até 50 imagens por vez
        </p>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*"
          className="hidden"
          onChange={e => { addFiles(e.target.files); e.target.value = ''; }}
        />
      </div>

      {/* Botão Buscar do Bling */}
      <div className="flex justify-center">
        <button
          onClick={() => { setShowBlingBrowser(!showBlingBrowser); setBlingProductImages(null); }}
          className={`flex items-center gap-2 px-5 py-3 rounded-lg font-medium transition-all shadow-sm border ${
            showBlingBrowser
              ? 'bg-bibelo-primary text-white border-bibelo-primary'
              : 'bg-bibelo-card text-bibelo-text border-bibelo-border hover:border-bibelo-primary'
          }`}
        >
          <CloudDownload className="w-5 h-5" />
          {showBlingBrowser ? 'Fechar navegador Bling' : 'Buscar imagens do Bling'}
        </button>
      </div>

      {/* Painel: Buscar imagens do Bling */}
      {showBlingBrowser && (
        <div className="bg-bibelo-card rounded-xl border border-bibelo-border p-5">
          <h2 className="font-semibold text-bibelo-text flex items-center gap-2 mb-2">
            <Package className="w-5 h-5 text-bibelo-primary" />
            Buscar imagens do Bling
          </h2>
          <p className="text-sm text-bibelo-muted mb-4">
            Busque por nome ou SKU e importe as fotos para converter.
          </p>

          {/* Busca */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-bibelo-muted" />
            <input
              type="text"
              value={blingApiSearch}
              onChange={e => setBlingApiSearch(e.target.value)}
              placeholder="Buscar produto por nome ou SKU..."
              className="w-full pl-10 pr-4 py-2.5 border border-bibelo-border rounded-lg text-sm bg-bibelo-bg text-bibelo-text placeholder:text-bibelo-muted focus:outline-none focus:ring-2 focus:ring-bibelo-primary"
            />
          </div>

          {/* Detalhe de imagens de um produto */}
          {blingProductImages ? (
            <div>
              <button
                onClick={() => setBlingProductImages(null)}
                className="text-sm text-bibelo-primary hover:text-bibelo-primary-hover mb-3 flex items-center gap-1"
              >
                ← Voltar aos produtos
              </button>
              <div className="bg-bibelo-bg rounded-lg border border-bibelo-border p-4">
                <h3 className="font-medium text-bibelo-text mb-1">{blingProductImages.nome}</h3>
                <p className="text-xs text-bibelo-muted mb-3">Bling ID: {blingProductImages.blingId}</p>

                {blingProductImages.imagens.length === 0 ? (
                  <p className="text-sm text-bibelo-muted py-4 text-center">Este produto não tem imagens no Bling</p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {blingProductImages.imagens.map((img, i) => (
                      <div key={i} className="relative group">
                        <img
                          src={img.url}
                          alt={`Imagem ${i + 1}`}
                          className="w-full aspect-square object-contain rounded-lg border border-bibelo-border bg-bibelo-card"
                          onError={e => { (e.target as HTMLImageElement).src = ''; (e.target as HTMLImageElement).alt = 'Erro'; }}
                        />
                        <button
                          onClick={() => importBlingImage(img.url, blingProductImages.nome)}
                          disabled={importingImage}
                          className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-colors rounded-lg flex items-center justify-center"
                        >
                          <span className="bg-bibelo-primary text-white px-3 py-1.5 rounded-lg text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity shadow-lg flex items-center gap-1">
                            {importingImage ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                            Importar
                          </span>
                        </button>
                        <span className="absolute top-1 right-1 text-xs bg-bibelo-primary/20 text-bibelo-primary px-1.5 py-0.5 rounded">
                          {img.tipo}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="max-h-80 overflow-y-auto border border-bibelo-border rounded-lg bg-bibelo-bg divide-y divide-bibelo-border">
              {blingApiLoading ? (
                <div className="p-6 text-center text-bibelo-muted flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Buscando produtos...
                </div>
              ) : blingApiProducts.length === 0 ? (
                <div className="p-6 text-center text-bibelo-muted text-sm">
                  {blingApiSearch ? 'Nenhum produto encontrado' : 'Digite para buscar produtos'}
                </div>
              ) : (
                blingApiProducts.map(p => (
                  <button
                    key={p.id}
                    onClick={() => fetchProductImages(p.id)}
                    className="w-full text-left px-4 py-3 hover:bg-bibelo-card transition-colors flex items-center gap-3"
                  >
                    <div className="w-10 h-10 rounded bg-bibelo-card flex items-center justify-center flex-shrink-0 border border-bibelo-border">
                      <Package className="w-4 h-4 text-bibelo-muted" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-bibelo-text truncate">{p.nome}</p>
                      <p className="text-xs text-bibelo-muted">
                        {p.codigo ? `SKU: ${p.codigo}` : 'Sem SKU'}
                        {p.preco ? ` · R$ ${Number(p.preco).toFixed(2)}` : ''}
                      </p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-bibelo-muted flex-shrink-0" />
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {/* Imagens adicionadas */}
      {images.length > 0 && (
        <>
          <div className="bg-bibelo-card rounded-xl border border-bibelo-border p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-bibelo-text">
                {images.length} {images.length === 1 ? 'imagem' : 'imagens'} selecionada{images.length > 1 ? 's' : ''}
              </h2>
              <span className="text-sm text-bibelo-muted">
                Total: {formatBytes(images.reduce((sum, i) => sum + i.size, 0))}
              </span>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
              {images.map(img => (
                <div key={img.id} className="relative group">
                  <img src={img.preview} alt={img.name} className="w-full aspect-square object-cover rounded-lg border border-bibelo-border" />
                  <button
                    onClick={e => { e.stopPropagation(); removeImage(img.id); }}
                    className="absolute top-1 right-1 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-3 h-3" />
                  </button>
                  <p className="text-xs text-bibelo-muted truncate mt-1">{img.name}</p>
                  <p className="text-xs text-bibelo-muted">{formatBytes(img.size)}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Configurações */}
          <div className="bg-bibelo-card rounded-xl border border-bibelo-border p-5">
            <h2 className="font-semibold text-bibelo-text flex items-center gap-2 mb-4">
              <Settings2 className="w-5 h-5" />
              Configurações de conversão
            </h2>

            <div className="mb-5">
              <label className="text-sm font-medium text-bibelo-text mb-2 block">Destino</label>
              <div className="flex flex-wrap gap-2">
                {PRESETS.map(p => (
                  <button
                    key={p.key}
                    onClick={() => togglePreset(p.key)}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium transition-all ${
                      selectedPresets.includes(p.key)
                        ? 'bg-bibelo-primary text-white border-bibelo-primary shadow-sm'
                        : 'bg-bibelo-card text-bibelo-text border-bibelo-border hover:border-bibelo-primary'
                    }`}
                  >
                    <Store className="w-4 h-4" />
                    {p.label}
                    <span className="text-xs opacity-75">{p.width}×{p.height} {p.format.toUpperCase()}</span>
                  </button>
                ))}
              </div>
            </div>

            {selectedPresets.includes('custom') && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5 p-4 bg-bibelo-bg rounded-lg">
                <div>
                  <label className="text-xs font-medium text-bibelo-muted block mb-1">Largura (px)</label>
                  <input type="number" value={customWidth} onChange={e => setCustomWidth(Number(e.target.value))} min={100} max={4000} className="w-full px-3 py-2 border border-bibelo-border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="text-xs font-medium text-bibelo-muted block mb-1">Altura (px)</label>
                  <input type="number" value={customHeight} onChange={e => setCustomHeight(Number(e.target.value))} min={100} max={4000} className="w-full px-3 py-2 border border-bibelo-border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="text-xs font-medium text-bibelo-muted block mb-1">Formato</label>
                  <select value={customFormat} onChange={e => setCustomFormat(e.target.value as any)} className="w-full px-3 py-2 border border-bibelo-border rounded-lg text-sm">
                    <option value="jpeg">JPG</option>
                    <option value="png">PNG</option>
                    <option value="webp">WEBP</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-bibelo-muted block mb-1">Qualidade ({customQuality}%)</label>
                  <input type="range" value={customQuality} onChange={e => setCustomQuality(Number(e.target.value))} min={10} max={100} className="w-full mt-2" />
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <label className="text-xs font-medium text-bibelo-muted block mb-1">Cor de fundo</label>
                <div className="flex items-center gap-2">
                  <input type="color" value={background} onChange={e => setBackground(e.target.value)} className="w-10 h-10 rounded border border-bibelo-border cursor-pointer" />
                  <input type="text" value={background} onChange={e => /^#[0-9a-fA-F]{6}$/.test(e.target.value) && setBackground(e.target.value)} className="flex-1 px-3 py-2 border border-bibelo-border rounded-lg text-sm font-mono" />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-bibelo-muted block mb-1">Ajuste</label>
                <select value={fit} onChange={e => setFit(e.target.value as any)} className="w-full px-3 py-2 border border-bibelo-border rounded-lg text-sm">
                  <option value="contain">Conter (mantém proporção, preenche fundo)</option>
                  <option value="cover">Cobrir (corta para preencher)</option>
                  <option value="fill">Esticar (distorce se necessário)</option>
                </select>
              </div>
            </div>

            {/* Botões de ação */}
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button
                onClick={convertAll}
                disabled={loading || selectedPresets.length === 0}
                className="flex items-center gap-2 px-6 py-3 bg-bibelo-primary text-white rounded-lg font-medium hover:bg-bibelo-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
              >
                {loading ? (
                  <><Loader2 className="w-5 h-5 animate-spin" /> Convertendo...</>
                ) : (
                  <><ArrowRight className="w-5 h-5" /> Converter {images.length} {images.length === 1 ? 'imagem' : 'imagens'}</>
                )}
              </button>

              <button
                onClick={() => setShowBlingPanel(!showBlingPanel)}
                className={`flex items-center gap-2 px-5 py-3 rounded-lg font-medium transition-all shadow-sm border ${
                  showBlingPanel
                    ? 'bg-bibelo-primary text-white border-bibelo-primary'
                    : 'bg-bibelo-card text-bibelo-text border-bibelo-border hover:border-bibelo-primary'
                }`}
              >
                <Send className="w-5 h-5" />
                Enviar ao Bling
              </button>
            </div>
          </div>

          {/* ═══ Painel Bling ═══ */}
          {showBlingPanel && (
            <div className="bg-bibelo-card rounded-xl border border-bibelo-border p-5">
              <h2 className="font-semibold text-bibelo-text flex items-center gap-2 mb-4">
                <Package className="w-5 h-5 text-bibelo-primary" />
                Enviar imagens ao Bling
              </h2>
              <p className="text-sm text-bibelo-muted mb-4">
                Selecione o produto no Bling. As imagens serão convertidas e enviadas automaticamente.
              </p>

              {/* Busca de produto */}
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-bibelo-muted" />
                <input
                  type="text"
                  value={blingSearch}
                  onChange={e => setBlingSearch(e.target.value)}
                  placeholder="Buscar produto por nome ou SKU..."
                  className="w-full pl-10 pr-4 py-2.5 border border-bibelo-border rounded-lg text-sm bg-bibelo-bg text-bibelo-text focus:outline-none focus:ring-2 focus:ring-bibelo-primary"
                />
              </div>

              {/* Produto selecionado */}
              {selectedProduct && (
                <div className="mb-4 space-y-3">
                  <div className="p-3 bg-bibelo-bg border border-bibelo-border rounded-lg flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <CheckCircle2 className="w-5 h-5 text-green-500" />
                      <div>
                        <p className="text-sm font-medium text-bibelo-text">{selectedProduct.nome}</p>
                        <p className="text-xs text-bibelo-muted">
                          SKU: {selectedProduct.sku || '—'} | Bling ID: {selectedProduct.bling_id}
                          {selectedProduct.preco_venda ? ` | R$ ${Number(selectedProduct.preco_venda).toFixed(2)}` : ''}
                        </p>
                      </div>
                    </div>
                    <button onClick={() => { setSelectedProduct(null); setSelectedProductImages([]); }} className="text-bibelo-muted hover:text-red-500">
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Imagens atuais do produto no Bling */}
                  {loadingProductImages ? (
                    <div className="flex items-center gap-2 text-sm text-bibelo-muted px-1">
                      <Loader2 className="w-4 h-4 animate-spin" /> Carregando imagens atuais do Bling...
                    </div>
                  ) : selectedProductImages.length > 0 ? (
                    <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
                      <p className="text-sm font-medium text-amber-800 dark:text-amber-300 mb-2">
                        {selectedProductImages.length} imagem(ns) existente(s) no Bling:
                      </p>
                      <div className="flex gap-2 overflow-x-auto pb-1">
                        {selectedProductImages.map((img, i) => (
                          <img
                            key={i}
                            src={`/api/images/proxy?url=${encodeURIComponent(img.url)}`}
                            alt={`Atual ${i + 1}`}
                            className="w-16 h-16 rounded border border-amber-200 dark:border-amber-700 object-contain bg-white flex-shrink-0"
                          />
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-bibelo-muted px-1">Nenhuma imagem existente no Bling</p>
                  )}

                  {/* Toggle substituir */}
                  <label className="flex items-center gap-3 cursor-pointer px-1">
                    <div className="relative">
                      <input
                        type="checkbox"
                        checked={replaceAll}
                        onChange={e => setReplaceAll(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-10 h-5 bg-gray-300 dark:bg-gray-600 rounded-full peer-checked:bg-bibelo-primary transition-colors" />
                      <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow peer-checked:translate-x-5 transition-transform" />
                    </div>
                    <div>
                      <span className="text-sm font-medium text-bibelo-text">Substituir imagens existentes</span>
                      <p className="text-xs text-bibelo-muted">
                        {replaceAll
                          ? 'Remove as imagens antigas antes de enviar as novas'
                          : 'Adiciona as novas imagens sem remover as existentes'}
                      </p>
                    </div>
                  </label>
                </div>
              )}

              {/* Lista de produtos */}
              {!selectedProduct && (
                <div className="max-h-64 overflow-y-auto border border-bibelo-border rounded-lg bg-bibelo-bg divide-y divide-bibelo-border">
                  {blingLoading ? (
                    <div className="p-4 text-center text-bibelo-muted flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" /> Buscando...
                    </div>
                  ) : blingProducts.length === 0 ? (
                    <div className="p-4 text-center text-bibelo-muted text-sm">Nenhum produto encontrado</div>
                  ) : (
                    blingProducts.map(p => (
                      <button
                        key={p.bling_id}
                        onClick={() => { setSelectedProduct(p); fetchSelectedProductImages(p.bling_id); }}
                        className="w-full text-left px-4 py-3 hover:bg-bibelo-card transition-colors flex items-center gap-3"
                      >
                        {p.imagens ? (
                          <img
                            src={typeof p.imagens === 'string' && p.imagens.startsWith('[')
                              ? JSON.parse(p.imagens)[0]?.link || ''
                              : ''}
                            alt=""
                            className="w-10 h-10 rounded object-cover border border-bibelo-border"
                            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                        ) : (
                          <div className="w-10 h-10 rounded bg-bibelo-border/50 flex items-center justify-center">
                            <Package className="w-5 h-5 text-gray-400" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-bibelo-text truncate">{p.nome}</p>
                          <p className="text-xs text-bibelo-muted">
                            SKU: {p.sku || '—'}
                            {p.preco_venda ? ` | R$ ${Number(p.preco_venda).toFixed(2)}` : ''}
                          </p>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}

              {/* Botão enviar */}
              {selectedProduct && (
                <button
                  onClick={sendToBling}
                  disabled={sendingBling}
                  className={`mt-4 flex items-center gap-2 px-6 py-3 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm ${
                    replaceAll && selectedProductImages.length > 0
                      ? 'bg-amber-600 hover:bg-amber-700'
                      : 'bg-bibelo-primary hover:bg-bibelo-primary-hover'
                  }`}
                >
                  {sendingBling ? (
                    <><Loader2 className="w-5 h-5 animate-spin" /> Enviando ao Bling...</>
                  ) : replaceAll && selectedProductImages.length > 0 ? (
                    <><Send className="w-5 h-5" /> Substituir por {images.length} nova(s) imagem(ns)</>
                  ) : (
                    <><Send className="w-5 h-5" /> Enviar {images.length} imagem(ns) ao Bling</>
                  )}
                </button>
              )}
            </div>
          )}
        </>
      )}

      {/* Erro */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      {/* Sucesso */}
      {success && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
          <p className="text-green-700 text-sm">{success}</p>
        </div>
      )}

      {/* Resultados da conversão */}
      {results && (
        <div className="bg-bibelo-card rounded-xl border border-bibelo-border p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-6 h-6 text-green-500" />
              <div>
                <h2 className="font-semibold text-bibelo-text">
                  {results.convertidos} de {results.total} convertida{results.total > 1 ? 's' : ''}
                </h2>
                <p className="text-sm text-bibelo-muted">
                  {results.config.width}×{results.config.height} — {results.config.format.toUpperCase()} — Qualidade {results.config.quality}%
                </p>
              </div>
            </div>
            {results.convertidos > 1 && (
              <button onClick={downloadAll} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors">
                <Download className="w-4 h-4" /> Baixar todas ({results.convertidos})
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {results.results.map((r, idx) => (
              <div key={idx} className={`border rounded-xl overflow-hidden ${r.format === 'erro' ? 'border-red-200 bg-red-50' : 'border-bibelo-border'}`}>
                {r.format !== 'erro' ? (
                  <>
                    <div className="relative cursor-pointer group" onClick={() => setPreviewIdx(idx)}>
                      <img src={r.data} alt={r.originalName} className="w-full aspect-square object-contain bg-bibelo-bg" />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                        <ZoomIn className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </div>
                    <div className="p-3">
                      <p className="text-sm font-medium text-bibelo-text truncate">{r.originalName}</p>
                      <div className="flex items-center justify-between mt-1">
                        <div className="text-xs text-bibelo-muted">
                          {formatBytes(r.originalSize)} → {formatBytes(r.convertedSize)}
                          <span className="ml-1 text-green-600 font-medium">({compressionPercent(r.originalSize, r.convertedSize)})</span>
                        </div>
                        <span className="text-xs bg-bibelo-border/50 px-2 py-0.5 rounded font-mono">{r.width}×{r.height}</span>
                      </div>
                      <button onClick={() => downloadOne(r)} className="mt-2 w-full flex items-center justify-center gap-2 px-3 py-2 bg-bibelo-primary text-white rounded-lg text-sm hover:bg-bibelo-primary/90 transition-colors">
                        <Download className="w-4 h-4" /> Baixar .{r.format}
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="p-4 flex items-center gap-3">
                    <AlertTriangle className="w-5 h-5 text-red-500" />
                    <div>
                      <p className="text-sm font-medium text-red-700">{r.originalName}</p>
                      <p className="text-xs text-red-500">Erro na conversão</p>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal preview fullscreen */}
      {previewIdx !== null && results?.results[previewIdx]?.data && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setPreviewIdx(null)}>
          <button onClick={() => setPreviewIdx(null)} className="absolute top-4 right-4 w-10 h-10 bg-white/20 text-white rounded-full flex items-center justify-center hover:bg-white/30 transition-colors">
            <X className="w-6 h-6" />
          </button>
          <img src={results.results[previewIdx].data} alt="Preview" className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl" onClick={e => e.stopPropagation()} />
        </div>
      )}

      {/* Info sobre formatos */}
      {images.length === 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { name: 'Shopee', desc: 'JPG obrigatório, mínimo 500×500, máximo 2MB. Não aceita WEBP.', size: '1000×1000', format: 'JPG' },
            { name: 'NuvemShop', desc: 'JPG/PNG recomendado, ideal quadrado, boa qualidade.', size: '1024×1024', format: 'JPG' },
            { name: 'Loja Própria', desc: 'Medusa aceita JPG/PNG/WEBP. Maior resolução possível.', size: '1200×1200', format: 'PNG' },
            { name: 'Bling', desc: 'Aceita imagem via URL. O editor converte e envia automaticamente.', size: 'Quadrado', format: 'JPG/PNG' },
          ].map(mp => (
            <div key={mp.name} className="bg-bibelo-card rounded-xl border border-bibelo-border p-4">
              <div className="flex items-center gap-2 mb-2">
                <Store className="w-5 h-5 text-bibelo-primary" />
                <h3 className="font-semibold text-bibelo-text">{mp.name}</h3>
              </div>
              <p className="text-sm text-bibelo-muted mb-3">{mp.desc}</p>
              <div className="flex gap-2">
                <span className="text-xs bg-bibelo-border/50 px-2 py-1 rounded font-mono">{mp.size}</span>
                <span className="text-xs bg-bibelo-border/50 px-2 py-1 rounded font-mono">{mp.format}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
