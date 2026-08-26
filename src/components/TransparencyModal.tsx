import React, { useState, useEffect } from 'react';
import {
  Layers,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Download,
  Loader2,
  X,
  Sparkles,
  Info,
} from 'lucide-react';
import {
  FLATTENING_PRE_WARNING,
  type TransparencyValidationResult,
} from '../services/transparencyFlattening.ts';
import type { PreflightAnalysis } from '../types/index.ts';

export interface TransparencyModalProps {
  isOpen: boolean;
  onClose: () => void;
  analysis: PreflightAnalysis;
  workingFile?: File | Blob | Uint8Array | null;
  onApplyFlattenedPdf?: (flattenedPdfBytes: Uint8Array, fileName: string) => void;
}

export const TransparencyModal: React.FC<TransparencyModalProps> = ({
  isOpen,
  onClose,
  analysis,
  workingFile,
  onApplyFlattenedPdf,
}) => {
  const [isCheckingCapability, setIsCheckingCapability] = useState(true);
  const [ghostscriptAvailable, setGhostscriptAvailable] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [flattenedResult, setFlattenedResult] = useState<{
    fileName: string;
    bytes: Uint8Array;
    validation: TransparencyValidationResult;
  } | null>(null);

  const pagesWithTransp = (analysis.document.pages || []).filter((p) => p.hasTransparency);
  const totalTranspPages = pagesWithTransp.length;

  useEffect(() => {
    if (!isOpen) {
      setErrorMessage(null);
      setFlattenedResult(null);
      return;
    }

    let isMounted = true;
    setIsCheckingCapability(true);
    fetch('/api/transparency-capability')
      .then((res) => res.json())
      .then((data) => {
        if (isMounted) {
          setGhostscriptAvailable(Boolean(data.ghostscriptAvailable));
          setIsCheckingCapability(false);
        }
      })
      .catch(() => {
        if (isMounted) {
          setGhostscriptAvailable(false);
          setIsCheckingCapability(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleFlatten = async () => {
    if (!workingFile) {
      setErrorMessage('Nenhum buffer de PDF disponível para processamento.');
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);

    try {
      const formData = new FormData();
      if (workingFile instanceof File) {
        formData.append('file', workingFile, workingFile.name);
      } else if (workingFile instanceof Blob) {
        formData.append('file', workingFile, analysis.fileName || 'documento.pdf');
      } else {
        const blob = new Blob([workingFile as Uint8Array], { type: 'application/pdf' });
        formData.append('file', blob, analysis.fileName || 'documento.pdf');
      }

      const res = await fetch('/api/flatten-transparency', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message || data.error || 'Falha ao processar achatamento de transparências.');
      }

      const binaryStr = atob(data.base64);
      const len = binaryStr.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }

      setFlattenedResult({
        fileName: data.fileName,
        bytes,
        validation: data.validation,
      });
    } catch (err: any) {
      setErrorMessage(err.message || 'Falha na comunicação com o serviço de achatamento.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownload = () => {
    if (!flattenedResult) return;
    const blob = new Blob([flattenedResult.bytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = flattenedResult.fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleApplyToWorking = () => {
    if (!flattenedResult) return;
    onApplyFlattenedPdf?.(flattenedResult.bytes, flattenedResult.fileName);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in select-none">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-violet-50 text-violet-600">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-[#0F172A]">Achatar Transparências</h3>
              <p className="text-xs text-[#64748B]">Processamento determinístico para PDF/X-1a (PDF 1.3)</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-4 text-xs text-[#334155]">
          {/* Pre-warning Notice */}
          <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-amber-900 leading-relaxed font-medium">
              {FLATTENING_PRE_WARNING}
            </p>
          </div>

          {/* Current Status Overview */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-[#0F172A]">Ocorrências detectadas:</span>
              <span className="font-semibold px-2 py-0.5 rounded-md bg-violet-100 text-violet-800">
                {totalTranspPages} página(s) com transparência ativa
              </span>
            </div>
            <div className="flex items-center justify-between text-slate-500">
              <span>Padrão gráfico destino:</span>
              <span className="font-medium text-slate-700">PDF/X-1a (requer PDF 1.3 sem transparência)</span>
            </div>
            <div className="flex items-center justify-between text-slate-500">
              <span>Motor de achatamento:</span>
              <span className="font-medium text-slate-700">Ghostscript (backend isolado)</span>
            </div>
          </div>

          {/* Error Message */}
          {errorMessage && (
            <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 flex items-start gap-2.5">
              <XCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <p className="leading-relaxed font-medium">{errorMessage}</p>
            </div>
          )}

          {/* Success / Before-After Report */}
          {flattenedResult && (
            <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 space-y-3">
              <div className="flex items-center gap-2 text-emerald-800 font-bold text-sm">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <span>Transparências achatadas e validadas com sucesso!</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
                <div className="p-2.5 rounded-xl bg-white/80 border border-emerald-100">
                  <span className="font-bold text-slate-500 block mb-1">Antes:</span>
                  <span>{flattenedResult.validation.beforeSnapshot.totalTransparencyPages} pág. com transparência</span>
                </div>
                <div className="p-2.5 rounded-xl bg-white/80 border border-emerald-100">
                  <span className="font-bold text-slate-500 block mb-1">Depois:</span>
                  <span className="text-emerald-700 font-semibold">0 transparências ativas (PDF 1.3)</span>
                </div>
              </div>
            </div>
          )}

          {/* Ghostscript Not Available Info */}
          {!isCheckingCapability && !ghostscriptAvailable && !flattenedResult && (
            <div className="p-3.5 rounded-2xl bg-blue-50 border border-blue-200 text-blue-900 flex items-start gap-2.5">
              <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <p className="leading-relaxed">
                O backend do servidor não possui o utilitário <strong>Ghostscript</strong> instalado para achatamento automático no momento. O recurso está identificado como <strong>Em breve</strong> até a disponibilização do serviço.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-200/70 transition-colors cursor-pointer"
          >
            Fechar
          </button>

          {flattenedResult ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleDownload}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Baixar PDF</span>
              </button>
              {onApplyFlattenedPdf && (
                <button
                  type="button"
                  onClick={handleApplyToWorking}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Aplicar ao arquivo</span>
                </button>
              )}
            </div>
          ) : (
            <button
              type="button"
              disabled={isProcessing || isCheckingCapability || !ghostscriptAvailable}
              onClick={handleFlatten}
              className={`px-5 py-2.5 rounded-xl text-xs font-bold shadow-xs transition-all flex items-center gap-2 ${
                !ghostscriptAvailable
                  ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
                  : 'bg-violet-600 hover:bg-violet-700 text-white cursor-pointer active:scale-[0.98]'
              }`}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Achatando transparências...</span>
                </>
              ) : isCheckingCapability ? (
                <span>Verificando...</span>
              ) : !ghostscriptAvailable ? (
                <span>Em breve</span>
              ) : (
                <>
                  <Layers className="w-4 h-4" />
                  <span>Achatar transparências</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
