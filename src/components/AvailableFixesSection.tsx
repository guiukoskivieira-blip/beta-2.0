import React, { useState } from 'react';
import { Sparkles, ChevronDown, Wand2, ShieldCheck, CheckCircle2 } from 'lucide-react';
import type { PreflightAnalysis } from '../types';
import type { ProductionProfile } from '../utils/productionProfiles';
import { ImageColorFixPanel } from './ImageColorFixPanel';
import { TrimBleedFixPanel } from './TrimBleedFixPanel';
import { PdfxPreparationPanel } from './PdfxPreparationPanel';
import { FixEnginePanel } from './FixEnginePanel';

interface AvailableFixesSectionProps {
  analysis: PreflightAnalysis;
  profile: ProductionProfile;
  originalFile?: File | Blob | Uint8Array | ArrayBuffer | null;
  onAnalysisUpdated?: (updated: PreflightAnalysis) => void;
}

export const AvailableFixesSection: React.FC<AvailableFixesSectionProps> = ({
  analysis,
  profile,
  originalFile,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  // Check what fixes are really available from analysis
  const hasRgb = analysis.document.colorSummary.hasRgb;
  const isDeclaredPdfX = Boolean(analysis.document.pdfxInfo?.isDeclaredPdfX);
  const p1 = analysis.document.pages[0];
  const needsTrimBleed = !p1?.bleedBox || (p1.bleedBox.widthMm <= p1.widthMm);

  let alertCount = 0;
  if (hasRgb) alertCount++;
  if (!isDeclaredPdfX) alertCount++;
  if (needsTrimBleed) alertCount++;

  let mainTitle = 'PDF/X & Ajustes de Produção';
  let mainDesc = 'O arquivo possui parâmetros que podem ser preparados normativamente para PDF/X-4 com alta fidelidade.';

  if (hasRgb && !isDeclaredPdfX) {
    mainTitle = 'Espaço de Cores & PDF/X-4';
    mainDesc = 'Elementos em RGB e ausência de Output Intent podem ser convertidos automaticamente via CMM e PDF/X-4.';
  } else if (hasRgb) {
    mainTitle = 'Conversão de Imagens RGB → CMYK';
    mainDesc = 'Imagens em DeviceRGB detectadas podem ser convertidas pelo motor LittleCMS CMM com perfil ICC normativo.';
  } else if (!isDeclaredPdfX) {
    mainTitle = 'Preparação Normativa PDF/X-4';
    mainDesc = 'O arquivo é compatível com os padrões gráficos, mas a inclusão do Output Intent elevará sua conformidade.';
  }

  return (
    <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xs p-6 mb-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-[#FAF5FF] text-[#8B5CF6]">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-extrabold text-[#0F172A] tracking-tight">
              Correções Disponíveis
            </h3>
            <p className="text-xs text-[#64748B] font-medium">
              Pequenos ajustes podem elevar ainda mais a qualidade do seu arquivo.
            </p>
          </div>
        </div>
      </div>

      {/* Summary Fix Row */}
      <div className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200/70 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start sm:items-center gap-3">
          {alertCount > 0 ? (
            <span className="px-2.5 py-1 rounded-lg bg-[#FEF3C7] text-[#B45309] text-xs font-bold shrink-0">
              {alertCount} {alertCount === 1 ? 'Alerta' : 'Alertas'}
            </span>
          ) : (
            <span className="px-2.5 py-1 rounded-lg bg-[#ECFDF5] text-[#059669] text-xs font-bold shrink-0 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Conforme
            </span>
          )}
          <div>
            <div className="text-xs font-bold text-[#0F172A]">
              {mainTitle}
            </div>
            <div className="text-[11px] text-[#64748B] font-medium mt-0.5 leading-snug">
              {mainDesc}
            </div>
          </div>
        </div>

        {/* Action Button and Toggle Chevron */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold text-white bg-gradient-to-r from-[#0066FF] via-[#5B21B6] to-[#7C3AED] hover:opacity-95 shadow-md shadow-indigo-500/20 active:scale-[0.98] transition-all cursor-pointer select-none"
          >
            <Wand2 className="w-4 h-4" />
            <span>Corrigir automaticamente</span>
          </button>

          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-2.5 rounded-xl text-[#64748B] hover:text-[#0F172A] hover:bg-slate-200/60 transition-colors cursor-pointer"
            title={isExpanded ? 'Recolher detalhes de correção' : 'Expandir ferramentas de correção'}
          >
            <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>

      {/* Expandable Granular Fix Engines */}
      {isExpanded && (
        <div className="mt-6 pt-6 border-t border-slate-100 space-y-6 animate-in fade-in duration-200">
          <PdfxPreparationPanel 
            analysis={analysis} 
            profile={profile} 
            originalFile={originalFile} 
          />
          <ImageColorFixPanel 
            analysis={analysis} 
            profile={profile} 
            originalFile={originalFile} 
          />
          <TrimBleedFixPanel 
            analysis={analysis} 
            profile={profile} 
            originalFile={originalFile} 
          />
          <FixEnginePanel 
            analysis={analysis} 
          />
        </div>
      )}
    </div>
  );
};
