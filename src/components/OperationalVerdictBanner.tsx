import React from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Sparkles, ArrowRight } from 'lucide-react';
import type { RuleEngineSummary } from '../types';

interface OperationalVerdictBannerProps {
  ruleResults: RuleEngineSummary;
  availableFixesCount?: number;
  onScrollToFixes?: () => void;
}

export const OperationalVerdictBanner: React.FC<OperationalVerdictBannerProps> = ({
  ruleResults,
  availableFixesCount = 0,
  onScrollToFixes,
}) => {
  const { errorCount, warningCount, scoreSummary } = ruleResults;

  // Prioritize blocking errors over numerical score
  let statusType: 'error' | 'warning' | 'approved' = 'approved';
  let title = 'PRONTO PARA PRODUÇÃO';
  let description = 'Nenhuma inconformidade obrigatória encontrada. O arquivo está calibrado para gravação e impressão direta.';
  let badgeBg = 'bg-[#ECFDF5] border-emerald-200 text-[#059669]';
  let containerBg = 'bg-gradient-to-r from-emerald-500/10 via-teal-500/5 to-white border-emerald-200/80';
  let Icon = CheckCircle2;

  if (errorCount > 0 || scoreSummary.classification === 'rejected') {
    statusType = 'error';
    title = 'CORREÇÃO OBRIGATÓRIA';
    description = `${errorCount} inconformidade(s) bloqueante(s) encontrada(s). O arquivo deve ser corrigido antes da produção.`;
    badgeBg = 'bg-[#FEE2E2] border-red-200 text-[#B91C1C]';
    containerBg = 'bg-gradient-to-r from-red-500/10 via-rose-500/5 to-white border-red-200/90';
    Icon = XCircle;
  } else if (warningCount > 0 || scoreSummary.classification === 'review') {
    statusType = 'warning';
    title = 'ATENÇÃO NECESSÁRIA';
    description = `${warningCount} ponto(s) de atenção detectado(s). Recomendamos revisar os itens apontados antes de gravar matrizes.`;
    badgeBg = 'bg-[#FEF3C7] border-amber-200 text-[#B45309]';
    containerBg = 'bg-gradient-to-r from-amber-500/10 via-yellow-500/5 to-white border-amber-200/90';
    Icon = AlertTriangle;
  }

  const totalInconformidades = errorCount + warningCount;
  const showButton = (availableFixesCount > 0 || totalInconformidades > 0) && onScrollToFixes;

  const buttonText = availableFixesCount > 0
    ? `Ver ${availableFixesCount} ${availableFixesCount === 1 ? 'correção disponível' : 'correções disponíveis'}`
    : `Ver ${totalInconformidades} ${totalInconformidades === 1 ? 'pendência' : 'pendências'}`;

  return (
    <div className={`p-4 sm:p-5 rounded-3xl border shadow-xs mb-6 select-none transition-all ${containerBg}`}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Left Status & Context */}
        <div className="flex items-start sm:items-center gap-3.5">
          <div className={`p-2.5 rounded-2xl border ${badgeBg} shrink-0 shadow-2xs`}>
            <Icon className="w-6 h-6 stroke-[2.5]" />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="text-sm sm:text-base font-black tracking-tight text-[#0F172A]">
                {title}
              </span>
              <span className="px-2 py-0.5 rounded-md bg-white border border-slate-200 text-[11px] font-bold text-[#475569] shadow-2xs">
                Score: {scoreSummary.score}/100
              </span>
            </div>
            <p className="text-xs text-[#475569] font-medium mt-1 leading-relaxed max-w-2xl">
              {description}
            </p>
          </div>
        </div>

        {/* Right Action Hint if fixes or manual issues available */}
        {showButton && (
          <div className="shrink-0 flex items-center">
            <button
              type="button"
              onClick={onScrollToFixes}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-[#4338CA] bg-[#EEF2FF] hover:bg-[#E0E7FF] border border-[#C7D2FE] transition-all cursor-pointer shadow-2xs"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#6366F1]" />
              <span>{buttonText}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
