import React, { useState } from 'react';
import { Sparkles, ChevronDown, Wand2, ShieldCheck, Crop, Droplet, FileCheck2, AlertCircle } from 'lucide-react';
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
  const [activeTab, setActiveTab] = useState<'all' | 'color' | 'boxes' | 'pdfx'>('all');
  const [isExpanded, setIsExpanded] = useState(false);

  // Check what issues actually exist in the file
  const hasRgb = analysis.document.colorSummary.hasRgb;
  const isDeclaredPdfX = Boolean(analysis.document.pdfxInfo?.isDeclaredPdfX);
  const p1 = analysis.document.pages[0];
  const needsTrimBleed = !p1?.bleedBox || (p1.bleedBox.widthMm <= p1.widthMm);

  // If no fixes needed, show clean state
  const hasAnyFixes = hasRgb || !isDeclaredPdfX || needsTrimBleed;

  return (
    <div id="correcoes-disponiveis" className="bg-white rounded-3xl border border-slate-200/90 shadow-xs p-5 sm:p-6 mb-6 select-none">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-[#FAF5FF] text-[#8B5CF6]">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-black text-[#0F172A] tracking-tight">
              Correções Disponíveis
            </h3>
            <p className="text-xs text-[#64748B] font-medium">
              Ajustes determinísticos que podem ser realizados com segurança antes da gravação de matrizes.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-[#475569] hover:bg-slate-50 transition-colors cursor-pointer"
        >
          <span>{isExpanded ? 'Recolher painéis' : 'Expandir ferramentas'}</span>
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {/* Actionable Cards: What was found, Why it matters, What to do */}
      <div className="space-y-3">
        {/* Fix 1: RGB -> CMYK Color Conversion */}
        {hasRgb && (
          <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-50/70 to-white border border-blue-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-[#EFF6FF] text-[#2563EB] shrink-0 mt-0.5">
                <Droplet className="w-4 h-4" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-[#0F172A]">IMAGEM RGB DETECTADA</span>
                  <span className="px-2 py-0.5 rounded-md bg-[#FEF3C7] text-[#B45309] text-[10px] font-bold">Ajustável</span>
                </div>
                <p className="text-xs text-[#475569] leading-relaxed">
                  <strong>O que foi encontrado:</strong> O documento contém imagens em espaço de cor DeviceRGB.<br />
                  <strong>Por que importa:</strong> Na impressão comercial offset/digital, imagens RGB sofrem alteração de matiz não controlada no RIP.<br />
                  <strong>Ação recomendada:</strong> Converter para CMYK via LittleCMS CMM com perfil ICC normativo calibrado.
                </p>
              </div>
            </div>

            <div className="shrink-0 flex items-center justify-end">
              <button
                type="button"
                onClick={() => { setIsExpanded(true); setActiveTab('color'); }}
                className="px-4 py-2 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-bold shadow-xs transition-all cursor-pointer"
              >
                Converter para CMYK
              </button>
            </div>
          </div>
        )}

        {/* Fix 2: PDF/X-4 Preparation */}
        {!isDeclaredPdfX && (
          <div className="p-4 rounded-2xl bg-gradient-to-r from-purple-50/70 to-white border border-purple-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-[#FAF5FF] text-[#7C3AED] shrink-0 mt-0.5">
                <FileCheck2 className="w-4 h-4" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-[#0F172A]">PDF/X NÃO DECLARADO</span>
                  <span className="px-2 py-0.5 rounded-md bg-[#EFF6FF] text-[#1D4ED8] text-[10px] font-bold">Normativo</span>
                </div>
                <p className="text-xs text-[#475569] leading-relaxed">
                  <strong>O que foi encontrado:</strong> O arquivo não possui Output Intent normativo (ISO 15930-7).<br />
                  <strong>Por que importa:</strong> Sem o Output Intent, os sistemas de CtP/RIP não sabem qual o perfil ICC alvo pretendido pela criação.<br />
                  <strong>Ação recomendada:</strong> Injetar metadados PDF/X-4 e OutputConditionIdentifier correspondente ao papel e perfil selecionados.
                </p>
              </div>
            </div>

            <div className="shrink-0 flex items-center justify-end">
              <button
                type="button"
                onClick={() => { setIsExpanded(true); setActiveTab('pdfx'); }}
                className="px-4 py-2 rounded-xl bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-xs font-bold shadow-xs transition-all cursor-pointer"
              >
                Preparar PDF/X-4
              </button>
            </div>
          </div>
        )}

        {/* Fix 3: TrimBox & BleedBox Calibration */}
        {needsTrimBleed && (
          <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-50/70 to-white border border-emerald-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-[#ECFDF5] text-[#059669] shrink-0 mt-0.5">
                <Crop className="w-4 h-4" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-[#0F172A]">CALIBRAÇÃO DE SANGRIA E TRIMBOX</span>
                  <span className="px-2 py-0.5 rounded-md bg-[#ECFDF5] text-[#059669] text-[10px] font-bold">Geometria</span>
                </div>
                <p className="text-xs text-[#475569] leading-relaxed">
                  <strong>O que foi encontrado:</strong> Caixas técnicas MediaBox/TrimBox/BleedBox ausentes ou sem margem de 3 mm.<br />
                  <strong>Por que importa:</strong> O corte na guilhotina pode deixar filetes brancos caso o BleedBox não cubra a área de sangria.<br />
                  <strong>Ação recomendada:</strong> Aplicar alinhamento geométrico de TrimBox e expansão de BleedBox.
                </p>
              </div>
            </div>

            <div className="shrink-0 flex items-center justify-end">
              <button
                type="button"
                onClick={() => { setIsExpanded(true); setActiveTab('boxes'); }}
                className="px-4 py-2 rounded-xl bg-[#059669] hover:bg-[#047857] text-white text-xs font-bold shadow-xs transition-all cursor-pointer"
              >
                Ajustar Caixas Técnicas
              </button>
            </div>
          </div>
        )}

        {/* If no fixes required */}
        {!hasAnyFixes && (
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 text-center py-6">
            <ShieldCheck className="w-8 h-8 text-[#10B981] mx-auto mb-2" />
            <div className="text-xs font-bold text-[#0F172A]">Nenhuma correção automática necessária</div>
            <p className="text-xs text-[#64748B] mt-1">O arquivo já se encontra com todas as caixas, perfis e espaços de cores calibrados.</p>
          </div>
        )}
      </div>

      {/* Expanded Granular Fix Engines Panels */}
      {isExpanded && (
        <div className="mt-6 pt-6 border-t border-slate-100 space-y-6 animate-in fade-in duration-200">
          {(activeTab === 'all' || activeTab === 'pdfx') && (
            <PdfxPreparationPanel 
              analysis={analysis} 
              profile={profile} 
              originalFile={originalFile} 
            />
          )}
          {(activeTab === 'all' || activeTab === 'color') && (
            <ImageColorFixPanel 
              analysis={analysis} 
              profile={profile} 
              originalFile={originalFile} 
            />
          )}
          {(activeTab === 'all' || activeTab === 'boxes') && (
            <TrimBleedFixPanel 
              analysis={analysis} 
              profile={profile} 
              originalFile={originalFile} 
            />
          )}
          <FixEnginePanel analysis={analysis} />
        </div>
      )}
    </div>
  );
};
