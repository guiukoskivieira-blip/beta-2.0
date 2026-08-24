import React from 'react';
import { Sparkles, CheckCircle2, Download, RotateCcw, Check, ArrowRight } from 'lucide-react';

export interface AppliedCorrectionItem {
  id: string;
  label: string;
  appliedAt: number;
  details?: {
    before?: string;
    after?: string;
    summary?: string;
  };
}

interface AppliedCorrectionsSummaryProps {
  appliedCorrections: AppliedCorrectionItem[];
  onRestoreOriginal: () => void;
  onDownloadWorkingPdf: () => void;
}

export const AppliedCorrectionsSummary: React.FC<AppliedCorrectionsSummaryProps> = ({
  appliedCorrections,
  onRestoreOriginal,
  onDownloadWorkingPdf,
}) => {
  if (appliedCorrections.length === 0) return null;

  const count = appliedCorrections.length;
  const countLabel = count === 1 ? '1 correção aplicada' : `${count} correções aplicadas`;

  return (
    <div className="p-4 sm:p-5 rounded-3xl bg-gradient-to-r from-emerald-600 via-teal-700 to-indigo-700 text-white shadow-md mb-6 select-none animate-in fade-in slide-in-from-top-2 duration-200">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/20">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-2xl bg-white/20 flex items-center justify-center font-black text-sm shrink-0">
            <Check className="w-4 h-4 text-white stroke-[3]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-black tracking-tight">
                Sessão de trabalho • {countLabel}
              </h3>
            </div>
            <p className="text-xs text-white/85 font-medium">
              Todas as alterações foram aplicadas ao arquivo de trabalho e revalidadas pelo Motor 1.
            </p>
          </div>
        </div>

        {/* Global actions */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onRestoreOriginal}
            className="px-3.5 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
            title="Desfazer todas as correções e voltar ao PDF original"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Restaurar original</span>
          </button>
          <button
            type="button"
            onClick={onDownloadWorkingPdf}
            className="px-4 py-2 rounded-xl bg-white text-emerald-900 hover:bg-emerald-50 text-xs font-black shadow-xs transition-all cursor-pointer flex items-center gap-1.5 active:scale-[0.98]"
            title="Baixar PDF com todas as correções acumuladas"
          >
            <Download className="w-4 h-4 stroke-[2.5]" />
            <span>Baixar arquivo corrigido</span>
          </button>
        </div>
      </div>

      {/* Applied Corrections List & Detail */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-3">
        {appliedCorrections.map((fix) => (
          <div
            key={fix.id}
            className="p-3 rounded-2xl bg-white/10 backdrop-blur-xs border border-white/15 text-xs space-y-1.5 flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center gap-1.5 font-bold text-white">
                <CheckCircle2 className="w-4 h-4 text-emerald-300 shrink-0" />
                <span>{fix.label}</span>
              </div>

              {fix.details && (
                <div className="text-[11px] text-white/85 space-y-0.5 pt-1 font-mono">
                  {fix.details.before && (
                    <div className="text-white/70">
                      <span className="font-semibold text-white/60">Antes:</span> {fix.details.before}
                    </div>
                  )}
                  {fix.details.after && (
                    <div className="text-emerald-200 font-semibold">
                      <span className="text-white/60">Depois:</span> {fix.details.after}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="pt-1 border-t border-white/10 flex items-center justify-between text-[10px] text-emerald-300 font-medium">
              <span>✓ Revalidado pelo Motor 1</span>
              <span className="text-white/50">{new Date(fix.appliedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
