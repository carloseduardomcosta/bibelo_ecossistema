import { useState, useCallback, useRef } from 'react';
import { FileText, Upload, Printer, X, CheckCircle, AlertCircle, Settings2 } from 'lucide-react';
import api from '../lib/api';

interface PdfFile { file: File; name: string; }
interface Dims { w: number; h: number; }

// A4 landscape real dims
const A4_W_MM = 297;
const A4_H_MM = 210;
const PREVIEW_PX = 540; // preview width in px
const PX_PER_MM  = PREVIEW_PX / A4_W_MM;
const PREVIEW_H  = Math.round(A4_H_MM * PX_PER_MM); // ≈381px
const MARGIN_PX  = Math.round(2.12 * PX_PER_MM);    // ≈4px (6pt)
const CUTGAP_PX  = Math.round(4.94 * PX_PER_MM);    // ≈9px (14pt)
const CUT_X      = PREVIEW_PX / 2;
const SLOT_W     = CUT_X - MARGIN_PX - CUTGAP_PX / 2;
const SLOT_H     = PREVIEW_H - MARGIN_PX * 2;

function cmToPx(cm: number) { return cm * 10 * PX_PER_MM; }

function DropZone({
  label, sublabel, value, onFile, onClear,
}: {
  label: string; sublabel: string; value: PdfFile | null;
  onFile: (f: File) => void; onClear: () => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file?.type === 'application/pdf') onFile(file);
  }, [onFile]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (file) onFile(file); e.target.value = '';
  };

  const formatSize = (b: number) =>
    b < 1024 * 1024 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`;

  return (
    <div className="flex-1">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">{label}</p>
      {value ? (
        <div className="flex items-center gap-3 p-4 bg-green-900/20 border border-green-700/40 rounded-xl">
          <CheckCircle size={20} className="text-green-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-200 truncate">{value.name}</p>
            <p className="text-xs text-gray-400">{formatSize(value.file.size)}</p>
          </div>
          <button onClick={onClear} className="p-1 rounded hover:bg-gray-700 text-gray-400 hover:text-gray-200 transition-colors">
            <X size={14} />
          </button>
        </div>
      ) : (
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={`
            flex flex-col items-center justify-center gap-2 p-6 rounded-xl border-2 border-dashed cursor-pointer
            transition-all duration-150 select-none
            ${dragOver ? 'border-pink-400 bg-pink-900/20' : 'border-gray-600 bg-gray-800/40 hover:border-gray-500 hover:bg-gray-800/60'}
          `}
        >
          <Upload size={24} className={dragOver ? 'text-pink-400' : 'text-gray-500'} />
          <div className="text-center">
            <p className="text-sm text-gray-300 font-medium">{dragOver ? 'Solte aqui' : 'Arraste o PDF ou clique para selecionar'}</p>
            <p className="text-xs text-gray-500 mt-0.5">{sublabel}</p>
          </div>
        </div>
      )}
      <input ref={inputRef} type="file" accept="application/pdf" className="hidden" onChange={handleChange} />
    </div>
  );
}

function DimRow({ label, dims, onChange }: { label: string; dims: Dims; onChange: (d: Dims) => void }) {
  const inputCls = "w-16 text-sm text-center bg-gray-700 border border-gray-600 rounded-lg py-1 px-2 text-gray-200 focus:border-pink-500 focus:outline-none";
  return (
    <div className="flex items-center gap-4">
      <span className="text-xs text-gray-400 w-20 shrink-0">{label}</span>
      <label className="flex items-center gap-1.5">
        <span className="text-xs text-gray-500">Largura</span>
        <input
          type="number" min={1} max={29} step={0.5} value={dims.w} className={inputCls}
          onChange={e => onChange({ ...dims, w: Math.max(1, parseFloat(e.target.value) || 15) })}
        />
        <span className="text-xs text-gray-500">cm</span>
      </label>
      <label className="flex items-center gap-1.5">
        <span className="text-xs text-gray-500">Altura</span>
        <input
          type="number" min={1} max={21} step={0.5} value={dims.h} className={inputCls}
          onChange={e => onChange({ ...dims, h: Math.max(1, parseFloat(e.target.value) || 10) })}
        />
        <span className="text-xs text-gray-500">cm</span>
      </label>
    </div>
  );
}

function A4Preview({ danfe, etiqueta, danfeDims, etiquetaDims }: {
  danfe: PdfFile | null; etiqueta: PdfFile | null;
  danfeDims: Dims; etiquetaDims: Dims;
}) {
  const dBlockW = Math.min(cmToPx(danfeDims.w), SLOT_W);
  const dBlockH = Math.min(cmToPx(danfeDims.h), SLOT_H);
  const dLeft   = MARGIN_PX + (SLOT_W - dBlockW) / 2;
  const dTop    = MARGIN_PX + (SLOT_H - dBlockH) / 2;

  const eBlockW = Math.min(cmToPx(etiquetaDims.w), SLOT_W);
  const eBlockH = Math.min(cmToPx(etiquetaDims.h), SLOT_H);
  const eLeft   = CUT_X + CUTGAP_PX / 2 + (SLOT_W - eBlockW) / 2;
  const eTop    = MARGIN_PX + (SLOT_H - eBlockH) / 2;

  const effDW = Math.min(danfeDims.w, 29.7 / 2 - 0.7).toFixed(1);
  const effDH = Math.min(danfeDims.h, A4_H_MM / 10 - 0.4).toFixed(1);
  const effEW = Math.min(etiquetaDims.w, 29.7 / 2 - 0.7).toFixed(1);
  const effEH = Math.min(etiquetaDims.h, A4_H_MM / 10 - 0.4).toFixed(1);

  return (
    <div
      style={{ width: PREVIEW_PX, height: PREVIEW_H }}
      className="relative bg-white rounded border border-gray-500 overflow-hidden mx-auto shadow-md select-none"
    >
      {/* DANFE block */}
      <div style={{
        position: 'absolute', left: dLeft, top: dTop, width: dBlockW, height: dBlockH,
        background: 'rgba(59,130,246,0.10)', border: '1.5px dashed rgba(59,130,246,0.55)',
        borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column', gap: 4,
      }}>
        <FileText size={dBlockH > 40 ? 18 : 12} className="text-blue-400" />
        {dBlockH > 32 && <span style={{ fontSize: 9, color: '#60a5fa', fontWeight: 600 }}>DANFE NF</span>}
        {dBlockH > 48 && (
          <span style={{ fontSize: 8, color: '#9ca3af' }}>
            {effDW} × {effDH} cm
          </span>
        )}
        {danfe && dBlockH > 60 && (
          <span style={{ fontSize: 7, color: '#6b7280', maxWidth: dBlockW - 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '0 4px' }}>
            {danfe.name}
          </span>
        )}
      </div>

      {/* Dashed cut line */}
      <div style={{
        position: 'absolute', left: CUT_X, top: 0, bottom: 0, width: 1,
        backgroundImage: 'repeating-linear-gradient(to bottom, #9ca3af 0px, #9ca3af 4px, transparent 4px, transparent 8px)',
      }} />

      {/* Etiqueta block */}
      <div style={{
        position: 'absolute', left: eLeft, top: eTop, width: eBlockW, height: eBlockH,
        background: 'rgba(249,115,22,0.10)', border: '1.5px dashed rgba(249,115,22,0.55)',
        borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column', gap: 4,
      }}>
        <FileText size={eBlockH > 40 ? 18 : 12} className="text-orange-400" />
        {eBlockH > 32 && <span style={{ fontSize: 9, color: '#fb923c', fontWeight: 600 }}>ETIQUETA ENVIO</span>}
        {eBlockH > 48 && (
          <span style={{ fontSize: 8, color: '#9ca3af' }}>
            {effEW} × {effEH} cm
          </span>
        )}
        {etiqueta && eBlockH > 60 && (
          <span style={{ fontSize: 7, color: '#6b7280', maxWidth: eBlockW - 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '0 4px' }}>
            {etiqueta.name}
          </span>
        )}
      </div>

      {/* Corner labels */}
      <span style={{ position: 'absolute', left: 3, top: 2, fontSize: 7, color: '#9ca3af', pointerEvents: 'none' }}>DANFE</span>
      <span style={{ position: 'absolute', left: CUT_X + CUTGAP_PX / 2 + 2, top: 2, fontSize: 7, color: '#9ca3af', pointerEvents: 'none' }}>ETIQUETA</span>
      <span style={{ position: 'absolute', left: 3, bottom: 2, fontSize: 7, color: '#6b7280', pointerEvents: 'none' }}>A4 paisagem · 29,7 × 21 cm</span>
    </div>
  );
}

export default function Impressao() {
  const [danfe,    setDanfe]    = useState<PdfFile | null>(null);
  const [etiqueta, setEtiqueta] = useState<PdfFile | null>(null);
  const [danfeDims,    setDanfeDims]    = useState<Dims>({ w: 15, h: 10 });
  const [etiquetaDims, setEtiquetaDims] = useState<Dims>({ w: 15, h: 10 });
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleCombinar = async () => {
    if (!danfe || !etiqueta) return;
    setLoading(true); setError(null); setSuccess(false);

    try {
      const form = new FormData();
      form.append('danfe',    danfe.file,    danfe.name);
      form.append('etiqueta', etiqueta.file, etiqueta.name);
      form.append('danfeW',    String(danfeDims.w));
      form.append('danfeH',    String(danfeDims.h));
      form.append('etiquetaW', String(etiquetaDims.w));
      form.append('etiquetaH', String(etiquetaDims.h));

      const response = await api.post('/impressao/combinar', form, {
        responseType: 'blob',
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = 'etiqueta-impressao.pdf'; a.click();
      URL.revokeObjectURL(url);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 4000);
    } catch (err: any) {
      const msg = err?.response?.data
        ? await err.response.data.text?.().then((t: string) => {
            try { return JSON.parse(t).error; } catch { return 'Erro ao processar os PDFs.'; }
          })
        : 'Erro ao processar os PDFs.';
      setError(typeof msg === 'string' ? msg : 'Erro ao processar os PDFs.');
    } finally {
      setLoading(false);
    }
  };

  const canCombine = danfe && etiqueta && !loading;

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-pink-500/10 border border-pink-500/20">
          <Printer size={22} className="text-pink-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-100">Impressão de Etiquetas</h1>
          <p className="text-sm text-gray-400">Combina DANFE + etiqueta em 1 folha A4 paisagem — pronto para recortar</p>
        </div>
      </div>

      {/* Upload */}
      <div className="bg-gray-800/40 border border-gray-700/50 rounded-xl p-5">
        <p className="text-sm font-semibold text-gray-200 mb-4">Selecione os PDFs gerados pelo Bling</p>
        <div className="flex flex-col sm:flex-row gap-4">
          <DropZone
            label="1. DANFE Simplificada" sublabel="PDF da nota fiscal (Bling)"
            value={danfe} onFile={(f) => setDanfe({ file: f, name: f.name })} onClear={() => setDanfe(null)}
          />
          <DropZone
            label="2. Etiqueta de Envio" sublabel="PDF da etiqueta do transportador"
            value={etiqueta} onFile={(f) => setEtiqueta({ file: f, name: f.name })} onClear={() => setEtiqueta(null)}
          />
        </div>
      </div>

      {/* Dimensões */}
      <div className="bg-gray-800/40 border border-gray-700/50 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Settings2 size={15} className="text-gray-400" />
          <p className="text-sm font-semibold text-gray-200">Tamanho no papel</p>
          <span className="text-xs text-gray-500 ml-1">— ajuste se os documentos ficarem grandes demais ou pequenos demais</span>
        </div>
        <div className="space-y-3">
          <DimRow label="DANFE"    dims={danfeDims}    onChange={setDanfeDims} />
          <DimRow label="Etiqueta" dims={etiquetaDims} onChange={setEtiquetaDims} />
        </div>
        <p className="text-xs text-gray-500 mt-3">
          Padrão recomendado: 15 × 10 cm. O PDF será redimensionado proporcionalmente dentro da área indicada — sem perda de qualidade vetorial.
        </p>
      </div>

      {/* Preview A4 */}
      <div className="bg-gray-800/40 border border-gray-700/50 rounded-xl p-5">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Pré-visualização do layout — atualiza ao mudar as dimensões
        </p>
        <A4Preview danfe={danfe} etiqueta={etiqueta} danfeDims={danfeDims} etiquetaDims={etiquetaDims} />
        <p className="text-xs text-gray-500 mt-2 text-center">
          Linha tracejada = corte vertical · cada documento centralizado na sua metade
        </p>
      </div>

      {/* Feedback */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-900/20 border border-red-700/40 rounded-lg text-sm text-red-300">
          <AlertCircle size={16} className="shrink-0" /> {error}
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 p-3 bg-green-900/20 border border-green-700/40 rounded-lg text-sm text-green-300">
          <CheckCircle size={16} className="shrink-0" />
          PDF gerado e baixado! Imprima em A4 paisagem em tamanho real e recorte na linha central.
        </div>
      )}

      {/* Botão */}
      <button
        onClick={handleCombinar}
        disabled={!canCombine}
        className={`
          w-full flex items-center justify-center gap-2 py-3 px-6 rounded-xl font-semibold text-sm
          transition-all duration-150
          ${canCombine ? 'bg-pink-500 hover:bg-pink-600 text-white shadow-lg shadow-pink-500/20' : 'bg-gray-700 text-gray-500 cursor-not-allowed'}
        `}
      >
        {loading ? (
          <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Gerando PDF...</>
        ) : (
          <><Printer size={16} /> Gerar PDF para Impressão</>
        )}
      </button>

      {!danfe && !etiqueta && (
        <p className="text-center text-xs text-gray-500">Selecione os dois PDFs para habilitar</p>
      )}
    </div>
  );
}
