import React from 'react';
import {
  FileCode,
  CheckCircle2,
  AlertTriangle,
  X,
  Zap,
  ArrowRight,
  ShieldAlert,
  Crop,
  Palette,
  Loader2,
  ShieldCheck,
} from 'lucide-react';
import type { PreflightAnalysis } from '../types';
import type { ProductionProfile } from '../utils/productionProfiles';

export interface PdfxPrerequisitesModalProps {
  isOpen: boolean;
  onClose: () => void;
  analysis: PreflightAnalysis | null;
  profile: ProductionProfile;
  hasRgbPending: boolean;
  hasBoxesPending: boolean;
  onFixBoxesNow?: () => void;
  onFixRgbNow?: () => void;
  onFixAllAndFinalize: () => void;
  isProcessing?: boolean;
}

export const PdfxPrerequisitesModal: React.FC<PdfxPrerequisitesModalProps> = ({
  isOpen,
  onClose,
  analysis,
  profile,
  hasRgbPending,
  hasBoxesPending,
  onFixBoxesNow,
  onFixRgbNow,
  onFixAllAndFinalize,
  isProcessing = false,
}) => {
  if (!isOpen || !analysis) return null;

  const hasAnyPending = hasRgbPending || hasBoxesPending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl border border-slate-200/90 shadow-2xl max-w-lg w-full overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-6 bg-gradient-to-br from-[#7C3AED]/10 via-purple-50/50 to-white border-b border-purple-100 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-[#7C3AED] text-white shadow-md shadow-purple-500/20">
              <FileCode className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-black text-[#0F172A] tracking-tight">
                Finalizar Norma PDF/X-4 (ISO 15930-7)
              </h3>
              <p className="text-xs text-[#64748B] font-medium mt-0.5">
                Avaliação de conformidade prévia e pré-requisitos técnicos
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          {hasAnyPending ? (
            <div className="p-3.5 rounded-2xl bg-amber-50/80 border border-amber-200/90 flex items-start gap-2.5 text-xs text-amber-900">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <span className="font-bold">Pré-requisitos identificados</span>
                <p className="text-amber-800 text-[11px] leading-relaxed">
                  A norma PDF/X-4 proíbe inconsistências de geometria e espaços de cores não normalizados.
                  Para não realizar alterações surpresa, você pode escolher como deseja prosseguir:
                </p>
              </div>
            </div>
          ) : (
            <div className="p-3.5 rounded-2xl bg-emerald-50/80 border border-emerald-200/90 flex items-start gap-2.5 text-xs text-emerald-900">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Arquivo 100% elegível</span>
                <p className="text-emerald-800 text-[11px] mt-0.5">
                  Todos os pré-requisitos gráficos estão conformes. A finalização gravará apenas a camada normativa PDF/X-4.
                </p>
              </div>
            </div>
          )}

          {/* Prerequisites Status List */}
          <div className="space-y-2.5 pt-1">
            <h4 className="text-xs font-bold text-[#64748B] uppercase tracking-wider">
              Status dos Requisitos
            </h4>

            {/* Color requirement */}
            <div className={`p-3 rounded-2xl border flex items-center justify-between gap-3 text-xs ${
              hasRgbPending ? 'bg-amber-50/40 border-amber-200' : 'bg-slate-50/60 border-slate-200/80'
            }`}>
              <div className="flex items-center gap-2.5">
                <Palette className={`w-4 h-4 ${hasRgbPending ? 'text-amber-600' : 'text-emerald-600'}`} />
                <div>
                  <div className="font-bold text-[#0F172A]">Espaço de Cores das Imagens</div>
                  <div className="text-[11px] text-[#64748B]">
                    {hasRgbPending ? 'Imagens em espaço RGB detectadas (requer CMYK)' : 'Espaço de cores conforme (DeviceCMYK)'}
                  </div>
                </div>
              </div>
              {hasRgbPending ? (
                <button
                  type="button"
                  onClick={() => { onClose(); onFixRgbNow?.(); }}
                  className="px-2.5 py-1 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold text-[11px] transition-colors cursor-pointer"
                >
                  Ajustar Cores
                </button>
              ) : (
                <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[10px] font-bold">✓ Conforme</span>
              )}
            </div>

            {/* Geometry requirement */}
            <div className={`p-3 rounded-2xl border flex items-center justify-between gap-3 text-xs ${
              hasBoxesPending ? 'bg-amber-50/40 border-amber-200' : 'bg-slate-50/60 border-slate-200/80'
            }`}>
              <div className="flex items-center gap-2.5">
                <Crop className={`w-4 h-4 ${hasBoxesPending ? 'text-amber-600' : 'text-emerald-600'}`} />
                <div>
                  <div className="font-bold text-[#0F172A]">Geometria e Caixas Técnicas</div>
                  <div className="text-[11px] text-[#64748B]">
                    {hasBoxesPending
                      ? `TrimBox/BleedBox ausentes ou sem sangria de ${profile.expectedBleedMm ?? 3} mm`
                      : 'TrimBox e BleedBox calibrados geometricamente'}
                  </div>
                </div>
              </div>
              {hasBoxesPending ? (
                <button
                  type="button"
                  onClick={() => { onClose(); onFixBoxesNow?.(); }}
                  className="px-2.5 py-1 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold text-[11px] transition-colors cursor-pointer"
                >
                  Ajustar Caixas
                </button>
              ) : (
                <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[10px] font-bold">✓ Conforme</span>
              )}
            </div>

            {/* Normative Output Intent */}
            <div className="p-3 rounded-2xl bg-slate-50/60 border border-slate-200/80 flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2.5">
                <FileCode className="w-4 h-4 text-purple-600" />
                <div>
                  <div className="font-bold text-[#0F172A]">Output Intent e Metadados XMP</div>
                  <div className="text-[11px] text-[#64748B]">
                    Gravação de GTS_PDFX (FOGRA51 / SWOP) e ISO 15930-7
                  </div>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded-md bg-purple-100 text-purple-800 text-[10px] font-bold">⚙ Automático</span>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-6 bg-slate-50 border-t border-slate-100 flex flex-col-reverse sm:flex-row items-center justify-end gap-3">
          <button
            type="button"
            disabled={isProcessing}
            onClick={onClose}
            className="w-full sm:w-auto px-5 py-2.5 rounded-2xl border border-slate-200 text-slate-600 hover:bg-slate-100 text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
          >
            Cancelar
          </button>
          
          <button
            type="button"
            disabled={isProcessing}
            onClick={onFixAllAndFinalize}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-2xl bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-xs font-bold shadow-md shadow-purple-500/25 transition-all cursor-pointer disabled:opacity-50"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Processando...</span>
              </>
            ) : hasAnyPending ? (
              <>
                <Zap className="w-4 h-4" />
                <span>Corrigir requisitos e finalizar PDF/X-4</span>
              </>
            ) : (
              <>
                <FileCode className="w-4 h-4" />
                <span>Finalizar PDF/X-4 Agora</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
