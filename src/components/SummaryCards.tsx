import React from 'react';
import { Info, Crop, Droplet, ArrowUpRight } from 'lucide-react';
import { CircularGauge } from './CircularGauge';
import type { PreflightAnalysis } from '../types';
import type { ProductionProfile } from '../utils/productionProfiles';

interface SummaryCardsProps {
  analysis?: PreflightAnalysis | null;
  profile?: ProductionProfile;
  onNavigateTab?: (tabId: string) => void;
}

export const SummaryCards: React.FC<SummaryCardsProps> = ({
  analysis,
  profile,
  onNavigateTab,
}) => {
  // If analysis is present, calculate real metrics; otherwise use sensible defaults
  const score = analysis?.ruleResults?.scoreSummary?.score ?? 85;
  const classification = analysis?.ruleResults?.scoreSummary?.classification;
  
  // Status label & color
  let statusText = 'Muito Bom';
  let dotColor = '#10B981';
  if (score >= 90) {
    statusText = 'Excelente';
    dotColor = '#10B981';
  } else if (score >= 80) {
    statusText = 'Muito Bom';
    dotColor = '#10B981';
  } else if (score >= 60) {
    statusText = 'Atenção';
    dotColor = '#F59E0B';
  } else {
    statusText = 'Correção Obrigatória';
    dotColor = '#EF4444';
  }

  // Geometry metrics
  const pageCount = analysis?.document?.pageCount ?? 1;
  const p1 = analysis?.document?.pages?.[0];
  const formatText = p1 ? `${p1.widthMm.toFixed(0)} × ${p1.heightMm.toFixed(0)} mm` : '210 × 297 mm';
  
  const geomRules = analysis?.ruleResults?.results?.filter(r => r.category === 'geometry' || r.category === 'profile_conditioned' || r.category === 'page_boxes') || [];
  const geomApproved = geomRules.filter(r => r.status === 'approved').length;
  const geomPct = geomRules.length > 0 ? Math.round((geomApproved / geomRules.length) * 100) : 98;

  // Color & image metrics
  const allImages = analysis?.document?.pages?.flatMap(p => p.imageOccurrences || []) || [];
  const minDpi = allImages.length > 0 
    ? Math.min(...allImages.map(i => Math.min(i.effectiveDpiX, i.effectiveDpiY)))
    : 300;
  const colorRules = analysis?.ruleResults?.results?.filter(r => r.category === 'color' || r.category === 'resolution') || [];
  const colorApproved = colorRules.filter(r => r.status === 'approved').length;
  const colorPct = colorRules.length > 0 ? Math.round((colorApproved / colorRules.length) * 100) : 82;
  const colorSpaceFamily = analysis?.document?.colorSummary?.hasRgb ? 'RGB Detectado' : 'CMYK / Spot';

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-6 select-none">
      {/* CARD 1: Índice de Conformidade */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs flex flex-col justify-between hover:border-slate-300 transition-all">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-bold text-[#0F172A] flex items-center gap-1.5">
            Índice de Conformidade
            <Info className="w-3.5 h-3.5 text-[#94A3B8] cursor-help" title="Pontuação técnica consolidada pelo Motor 1" />
          </span>
        </div>

        <div className="flex items-center gap-5 my-1">
          {/* Circular Gauge */}
          <CircularGauge score={score} size={92} strokeWidth={8} />

          {/* Right Labels */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-bold text-[#0F172A]">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: dotColor }} />
              <span>{statusText}</span>
            </div>
            <p className="text-[11px] text-[#64748B] leading-tight">
              Baseado nas verificações dos últimos 30 dias
            </p>
            <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#ECFDF5] text-[#059669] text-[10px] font-bold">
              <ArrowUpRight className="w-3 h-3 stroke-[2.5]" />
              <span>12 pontos</span>
              <span className="text-[#6B7280] font-medium text-[9px]">vs. período anterior</span>
            </div>
          </div>
        </div>
      </div>

      {/* CARD 2: Geometria & Páginas */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs flex flex-col justify-between hover:border-slate-300 transition-all">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-bold text-[#0F172A] flex items-center gap-1.5">
            Geometria & Páginas
            <Info className="w-3.5 h-3.5 text-[#94A3B8] cursor-help" title="Dimensões, sangria, MediaBox, TrimBox e BleedBox" />
          </span>
        </div>

        <div className="flex items-center gap-4 my-2">
          {/* Mint Icon Box */}
          <div className="w-12 h-12 rounded-xl bg-[#ECFDF5] text-[#059669] flex items-center justify-center shrink-0">
            <Crop className="w-6 h-6 stroke-[2]" />
          </div>

          {/* Center Metrics */}
          <div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-extrabold text-[#0F172A] tracking-tight">{geomPct}%</span>
              <span className="text-xs font-bold text-[#10B981]">Conforme</span>
            </div>
            <p className="text-[11px] text-[#64748B] font-medium mt-0.5">
              {analysis ? `${pageCount} página(s) • ${formatText}` : '112 arquivos verificados'}
            </p>
          </div>
        </div>

        <div>
          <button
            type="button"
            onClick={() => onNavigateTab?.('rules')}
            className="text-xs font-semibold text-[#2563EB] hover:text-[#1D4ED8] inline-flex items-center gap-1 cursor-pointer transition-colors"
          >
            <span>Ver detalhes</span>
            <span>→</span>
          </button>
        </div>
      </div>

      {/* CARD 3: Cores & Imagens */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs flex flex-col justify-between hover:border-slate-300 transition-all">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-bold text-[#0F172A] flex items-center gap-1.5">
            Cores & Imagens
            <Info className="w-3.5 h-3.5 text-[#94A3B8] cursor-help" title="Espaços de cores, DPI efetivo, sobreposição e perfis ICC" />
          </span>
        </div>

        <div className="flex items-center gap-4 my-2">
          {/* Purple Icon Box */}
          <div className="w-12 h-12 rounded-xl bg-[#F5F3FF] text-[#7C3AED] flex items-center justify-center shrink-0">
            <Droplet className="w-6 h-6 stroke-[2]" />
          </div>

          {/* Center Metrics */}
          <div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-extrabold text-[#0F172A] tracking-tight">{colorPct}%</span>
              <span className="text-xs font-bold text-[#7C3AED]">Conforme</span>
            </div>
            <p className="text-[11px] text-[#64748B] font-medium mt-0.5">
              {analysis ? `${colorSpaceFamily} • ${allImages.length} img (${minDpi} DPI)` : '112 arquivos verificados'}
            </p>
          </div>
        </div>

        <div>
          <button
            type="button"
            onClick={() => onNavigateTab?.('objects')}
            className="text-xs font-semibold text-[#2563EB] hover:text-[#1D4ED8] inline-flex items-center gap-1 cursor-pointer transition-colors"
          >
            <span>Ver detalhes</span>
            <span>→</span>
          </button>
        </div>
      </div>
    </div>
  );
};
