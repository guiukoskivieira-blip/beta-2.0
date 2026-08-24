import React, { useState } from 'react';
import { Sparkles, ChevronDown, Wand2, ShieldCheck, Crop, Droplet, FileCheck2, AlertTriangle, CheckCircle2, Zap } from 'lucide-react';
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
  appliedCorrections?: Array<{ id: string; label: string; appliedAt: number; details?: { before?: string; after?: string; summary?: string } }>;
  onFixApplied?: (blob: Blob, fixId: string, fixLabel: string, isPdfxVerified?: boolean, details?: { before?: string; after?: string; summary?: string }) => void;
  onOpenApplyAllModal?: () => void;
  isFixingInProgress?: boolean;
  pdfxVerifiedState?: 'not_verified' | 'verified' | 'needs_revalidation';
  onAnalysisUpdated?: (updated: PreflightAnalysis) => void;
}

export const AvailableFixesSection: React.FC<AvailableFixesSectionProps> = ({
  analysis,
  profile,
  originalFile,
  appliedCorrections = [],
  onFixApplied,
  onOpenApplyAllModal,
  isFixingInProgress = false,
  pdfxVerifiedState = 'not_verified',
}) => {
  const [activeTab, setActiveTab] = useState<'all' | 'color' | 'boxes' | 'pdfx'>('all');
  const [isExpanded, setIsExpanded] = useState(false);

  // Check what issues actually exist in the working file
  const hasRgb = analysis.document.colorSummary.hasRgb;
  const isDeclaredPdfX = Boolean(analysis.document.pdfxInfo?.isDeclaredPdfX);
  const p1 = analysis.document.pages[0];
  const needsTrimBleed = !p1?.bleedBox || (p1.bleedBox.widthMm <= p1.widthMm);

  const hasRgbApplied = appliedCorrections.some(c => c.id === 'rgb_cmyk');
  const hasBoxesApplied = appliedCorrections.some(c => c.id === 'trim_bleed');
  const hasPdfxApplied = appliedCorrections.some(c => c.id.startsWith('pdfx'));

  const canFixRgb = Boolean(hasRgb && !hasRgbApplied);
  const profileHasDimensions = Boolean(profile.expectedBleedMm && profile.expectedBleedMm > 0 && profile.expectedWidthMm && profile.expectedHeightMm);
  const canFixBoxes = Boolean(needsTrimBleed && !hasBoxesApplied && profileHasDimensions);
  const canFixPdfx = Boolean(!isDeclaredPdfX || !analysis.document.pdfxInfo?.hasOutputIntent || pdfxVerifiedState === 'needs_revalidation');

  const autoFixesCount = (canFixRgb ? 1 : 0) + (canFixBoxes ? 1 : 0) + (canFixPdfx ? 1 : 0);
  const hasAnyFixes = hasRgb || !isDeclaredPdfX || needsTrimBleed || appliedCorrections.length > 0;

  // Detect manual issues that cannot be auto-fixed
  const dpiRule = analysis.ruleResults.results.find(r => (r.ruleId === 'RULE-PROF-DPI-001' || r.category === 'dpi') && (r.status === 'error' || r.status === 'warning'));
  const fontRule = analysis.ruleResults.results.find(r => (r.ruleId === 'RULE-PROF-FNT-001' || r.category === 'font' || r.category === 'typography') && (r.status === 'error' || r.status === 'warning'));
  const manualIssues: string[] = [];
  if (dpiRule) manualIssues.push('Resolução de imagem baixa — Requer imagens originais em 300 DPI no software de criação.');
  if (fontRule) manualIssues.push('Fontes não incorporadas — Requer converter textos em curvas ou incorporar as fontes.');

  return (
    <div id="correcoes-disponiveis" className="bg-white rounded-3xl border border-slate-200/90 shadow-xs p-5 sm:p-6 mb-6 select-none">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-[#FAF5FF] text-[#8B5CF6]">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-black text-[#0F172A] tracking-tight">
                Correções Acumulativas no Arquivo
              </h3>
              {appliedCorrections.length > 0 && (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  {appliedCorrections.length} aplicada(s)
                </span>
              )}
            </div>
            <p className="text-xs text-[#64748B] font-medium">
              Cada correção é aplicada diretamente sobre o resultado anterior, mantendo a integridade do PDF de trabalho.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-[#475569] hover:bg-slate-50 transition-colors cursor-pointer self-start sm:self-auto"
        >
          <span>{isExpanded ? 'Recolher ferramentas' : 'Expandir ferramentas'}</span>
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {/* Applied Corrections Status Strip */}
      {appliedCorrections.length > 0 && (
        <div className="p-3.5 mb-4 rounded-2xl bg-emerald-50/60 border border-emerald-100 flex flex-wrap items-center gap-2 text-xs">
          <span className="font-bold text-emerald-800 flex items-center gap-1">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            Alterações na Sessão:
          </span>
          {appliedCorrections.map((c, i) => (
            <span key={i} className="px-2 py-0.5 rounded-lg bg-white border border-emerald-200 text-emerald-800 font-semibold text-[11px]">
              ✓ {c.label}
            </span>
          ))}
        </div>
      )}

      {/* Prominent CTA: Ajustar Tudo Automaticamente */}
      {autoFixesCount > 0 && (
        <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-violet-700 via-indigo-600 to-blue-600 text-white shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 select-none animate-in fade-in">
          <div className="flex items-start sm:items-center gap-3">
            <div className="p-2.5 rounded-xl bg-white/20 text-white shrink-0">
              <Zap className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-black tracking-tight">
                  Ajustar tudo automaticamente ({autoFixesCount} {autoFixesCount === 1 ? 'correção disponível' : 'correções disponíveis'})
                </h4>
              </div>
              <p className="text-xs text-white/90 mt-0.5">
                Executa em sequência CMYK, caixas técnicas e conformidade PDF/X-4 de forma determinística no arquivo de trabalho.
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={isFixingInProgress}
            onClick={onOpenApplyAllModal}
            className="px-5 py-2.5 rounded-xl bg-white text-indigo-900 hover:bg-indigo-50 active:scale-[0.98] text-xs font-black shadow-md transition-all cursor-pointer shrink-0 disabled:opacity-50 flex items-center gap-2"
          >
            <Sparkles className="w-4 h-4 text-indigo-600" />
            <span>Ajustar tudo automaticamente</span>
          </button>
        </div>
      )}

      {/* Actionable Cards: What was found, Why it matters, What to do */}
      <div className="space-y-3">
        {/* Fix 1: RGB -> CMYK Color Conversion */}
        {hasRgb ? (
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
                disabled={isFixingInProgress}
                onClick={() => { setIsExpanded(true); setActiveTab('color'); }}
                className="px-4 py-2 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-bold shadow-xs transition-all cursor-pointer disabled:opacity-50"
              >
                Converter para CMYK
              </button>
            </div>
          </div>
        ) : hasRgbApplied ? (
          <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span className="font-bold text-[#0F172A]">Imagens RGB convertidas com sucesso para CMYK (LittleCMS)</span>
            </div>
            <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[10px] font-bold">✓ Aplicada</span>
          </div>
        ) : null}

        {/* Fix 2: PDF/X-4 Preparation */}
        {!isDeclaredPdfX ? (
          <div className="p-4 rounded-2xl bg-gradient-to-r from-purple-50/70 to-white border border-purple-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-[#FAF5FF] text-[#7C3AED] shrink-0 mt-0.5">
                <FileCheck2 className="w-4 h-4" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-[#0F172A]">PDF/X NÃO DECLARADO</span>
                  <span className="px-2 py-0.5 rounded-md bg-[#EFF6FF] text-[#1D4ED8] text-[10px] font-bold">Normativo</span>
                  {pdfxVerifiedState === 'needs_revalidation' && (
                    <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 text-[10px] font-bold flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> Revalidação necessária
                    </span>
                  )}
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
                disabled={isFixingInProgress}
                onClick={() => { setIsExpanded(true); setActiveTab('pdfx'); }}
                className="px-4 py-2 rounded-xl bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-xs font-bold shadow-xs transition-all cursor-pointer disabled:opacity-50"
              >
                Preparar PDF/X-4
              </button>
            </div>
          </div>
        ) : hasPdfxApplied ? (
          <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span className="font-bold text-[#0F172A]">Estrutura PDF/X-4 e Output Intent normativo embutidos</span>
            </div>
            <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[10px] font-bold">✓ Aplicada</span>
          </div>
        ) : null}

        {/* Fix 3: TrimBox & BleedBox Calibration */}
        {needsTrimBleed ? (
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
                disabled={isFixingInProgress}
                onClick={() => { setIsExpanded(true); setActiveTab('boxes'); }}
                className="px-4 py-2 rounded-xl bg-[#059669] hover:bg-[#047857] text-white text-xs font-bold shadow-xs transition-all cursor-pointer disabled:opacity-50"
              >
                Ajustar Caixas Técnicas
              </button>
            </div>
          </div>
        ) : hasBoxesApplied ? (
          <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span className="font-bold text-[#0F172A]">TrimBox e BleedBox calibrados geometricamente</span>
            </div>
            <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[10px] font-bold">✓ Aplicada</span>
          </div>
        ) : null}

        {/* Manual Items Alert (Non-blocking) */}
        {manualIssues.length > 0 && (
          <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200/80 flex items-start gap-3 text-xs">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-bold text-amber-900">
                Itens que requerem intervenção manual (não bloqueiam correções automáticas):
              </span>
              <ul className="list-disc list-inside space-y-0.5 text-amber-800 text-[11px]">
                {manualIssues.map((issue, idx) => (
                  <li key={idx}>{issue}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* If no fixes required */}
        {!hasAnyFixes && manualIssues.length === 0 && (
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
              originalFile={originalFile as any}
              onFixApplied={onFixApplied}
              isFixingInProgress={isFixingInProgress}
            />
          )}
          {(activeTab === 'all' || activeTab === 'color') && (
            <ImageColorFixPanel 
              analysis={analysis} 
              profile={profile} 
              originalFile={originalFile as any}
              onFixApplied={onFixApplied}
              isFixingInProgress={isFixingInProgress}
            />
          )}
          {(activeTab === 'all' || activeTab === 'boxes') && (
            <TrimBleedFixPanel 
              analysis={analysis} 
              profile={profile} 
              originalFile={originalFile as any}
              onFixApplied={onFixApplied}
              isFixingInProgress={isFixingInProgress}
            />
          )}
          <FixEnginePanel analysis={analysis} />
        </div>
      )}
    </div>
  );
};
