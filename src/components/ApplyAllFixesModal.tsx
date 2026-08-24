import React from 'react';
import { Sparkles, X, CheckCircle2, AlertTriangle, ShieldCheck, ArrowRight, Loader2, Zap } from 'lucide-react';

export interface PlannedFix {
  id: string;
  title: string;
  category: string;
  description: string;
  tag: string;
}

interface ApplyAllFixesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isApplying: boolean;
  progress?: {
    currentStep: number;
    totalSteps: number;
    stepLabel: string;
  } | null;
  plannedFixes: PlannedFix[];
  manualWarnings: string[];
}

export const ApplyAllFixesModal: React.FC<ApplyAllFixesModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  isApplying,
  progress,
  plannedFixes,
  manualWarnings,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs select-none animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="p-5 sm:p-6 bg-gradient-to-r from-violet-700 via-indigo-700 to-blue-700 text-white flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-white/20 text-white shrink-0">
              <Zap className="w-6 h-6 stroke-[2.5]" />
            </div>
            <div>
              <h3 className="text-lg font-black tracking-tight">Ajustar Tudo Automaticamente</h3>
              <p className="text-xs text-white/85 mt-0.5 font-medium">
                Execução sequencial e determinística no arquivo de trabalho
              </p>
            </div>
          </div>
          {!isApplying && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-4 text-xs text-[#334155]">
          {isApplying && progress ? (
            /* Live Progress State */
            <div className="py-8 text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-indigo-50 border-2 border-indigo-200 flex items-center justify-center mx-auto animate-pulse">
                <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
              </div>
              <div>
                <span className="px-3 py-1 rounded-full bg-indigo-100 text-indigo-800 text-xs font-bold">
                  Etapa {progress.currentStep} de {progress.totalSteps}
                </span>
                <h4 className="text-base font-black text-slate-900 mt-2">
                  {progress.stepLabel}
                </h4>
                <p className="text-xs text-slate-500 mt-1">
                  Aplicando correção diretamente sobre o resultado anterior e revalidando com o Motor 1...
                </p>
              </div>

              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden max-w-xs mx-auto">
                <div
                  className="bg-indigo-600 h-full transition-all duration-300 rounded-full"
                  style={{ width: `${(progress.currentStep / progress.totalSteps) * 100}%` }}
                />
              </div>
            </div>
          ) : (
            /* Pre-Confirmation Review */
            <>
              <div>
                <h4 className="font-bold text-slate-900 mb-2 uppercase tracking-wider text-[11px] text-[#64748B]">
                  Correções que serão aplicadas em sequência ({plannedFixes.length})
                </h4>
                <div className="space-y-2">
                  {plannedFixes.map((fix, idx) => (
                    <div
                      key={fix.id}
                      className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-start gap-3"
                    >
                      <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                        {idx + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900">{fix.title}</span>
                          <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 text-[10px] font-bold">
                            {fix.tag}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed">
                          {fix.description}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Safety Assurances */}
              <div className="p-3.5 rounded-2xl bg-emerald-50/70 border border-emerald-200/60 flex items-start gap-3">
                <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <div className="text-[11px] text-emerald-900 leading-relaxed">
                  <strong>Garantia de integridade gráfica:</strong> O layout visual, fontes, vetores e textos não sofrem alterações destrutivas. Cada etapa gera uma nova camada no PDF de trabalho.
                </div>
              </div>

              {/* Manual Pending Items (if any) */}
              {manualWarnings.length > 0 && (
                <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200/70 flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="text-[11px] text-amber-900 leading-relaxed">
                    <strong>Itens mantidos para intervenção manual:</strong>
                    <ul className="list-disc list-inside mt-1 space-y-0.5 text-amber-800">
                      {manualWarnings.map((w, idx) => (
                        <li key={idx}>{w}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Modal Footer */}
        {!isApplying && (
          <div className="p-4 sm:p-5 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white text-xs font-black shadow-md transition-all cursor-pointer flex items-center gap-2 active:scale-[0.98]"
            >
              <Sparkles className="w-4 h-4" />
              <span>Aplicar todas as correções ({plannedFixes.length})</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
