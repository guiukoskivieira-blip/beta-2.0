import React, { useState } from 'react';
import { Sparkles, ChevronDown, Wand2, ShieldCheck, Crop, Droplet, FileCheck2, AlertTriangle, CheckCircle2, Zap, Loader2, Maximize2, RotateCcw } from 'lucide-react';
import type { PreflightAnalysis } from '../types';
import type { ProductionProfile } from '../utils/productionProfiles';
import { ImageColorFixPanel } from './ImageColorFixPanel';
import { TrimBleedFixPanel } from './TrimBleedFixPanel';
import { PdfxPreparationPanel } from './PdfxPreparationPanel';
import { FixEnginePanel } from './FixEnginePanel';
import { AppliedFixStatusCard } from './AppliedFixStatusCard';
import { checkTrimBleedEligibility } from '../services/trimBleedFix';
import { checkDimensionFixEligibility } from '../services/dimensionFix';

interface AvailableFixesSectionProps {
  analysis: PreflightAnalysis;
  profile: ProductionProfile;
  originalFile?: File | Blob | Uint8Array | ArrayBuffer | null;
  appliedCorrections?: Array<{ id: string; label: string; appliedAt: number; details?: { before?: string; after?: string; summary?: string } }>;
  onFixApplied?: (blob: Blob, fixId: string, fixLabel: string, isPdfxVerified?: boolean, details?: { before?: string; after?: string; summary?: string }) => void;
  onOpenApplyAllModal?: () => void;
  onRequestDimensionFix?: (action?: 'scale_uniform' | 'rotate_90') => void;
  onRequestPdfxFinalize?: () => void;
  onOpenPdfxModal?: () => void;
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
  onRequestDimensionFix,
  onRequestPdfxFinalize,
  onOpenPdfxModal,
  isFixingInProgress = false,
  pdfxVerifiedState = 'not_verified',
}) => {
  const [activeTab, setActiveTab] = useState<'all' | 'color' | 'boxes' | 'pdfx'>('all');
  const [isExpanded, setIsExpanded] = useState(false);

  const handlePdfxClick = () => {
    if (onRequestPdfxFinalize) {
      onRequestPdfxFinalize();
    } else if (onOpenPdfxModal) {
      onOpenPdfxModal();
    } else {
      setIsExpanded(true);
      setActiveTab('pdfx');
    }
  };

  // Dimension eligibility evaluation
  const dimensionEligibility = checkDimensionFixEligibility(analysis.document, profile);
  const hasDimensionsApplied = appliedCorrections.some(c => c.id === 'dimensions');
  const dimRule = analysis.ruleResults.results.find(r => r.ruleId === 'RULE-PROF-DIM-001');

  const profileHasExpectedDimensions = Boolean(profile.expectedWidthMm && profile.expectedHeightMm);
  const isDimensionApproved = Boolean(!dimRule || dimRule.status === 'approved');

  const canFixDimensions = Boolean(
    profileHasExpectedDimensions &&
    !isDimensionApproved &&
    dimensionEligibility.status === 'eligible'
  );

  const dimensionConfirmationRequired = Boolean(
    profileHasExpectedDimensions &&
    !isDimensionApproved &&
    dimensionEligibility.status === 'confirmation_required'
  );

  // Check what issues actually exist in the working file using Motor 1 as the single source of truth
  const colorRule = analysis.ruleResults.results.find(r => r.ruleId === 'RULE-PROF-CLR-001' || r.category === 'color');
  const bleedRule = analysis.ruleResults.results.find(r => r.ruleId === 'RULE-PROF-BLD-001' || r.category === 'bleed');

  const hasRgb = Boolean(analysis.document.colorSummary.hasRgb || (colorRule && colorRule.status !== 'approved'));
  const isDeclaredPdfX = Boolean(analysis.document.pdfxInfo?.isDeclaredPdfX);
  const hasOutputIntent = Boolean(analysis.document.pdfxInfo?.hasOutputIntent);

  const profileHasDimensions = Boolean(
    profile.expectedBleedMm && profile.expectedBleedMm > 0 &&
    profile.expectedWidthMm && profile.expectedHeightMm
  );

  // Boxes need adjustment ONLY if Motor 1 rule is NOT approved AND profile expects bleed/dimensions AND is eligible
  const isBleedEligible = profileHasDimensions && checkTrimBleedEligibility(analysis.document, profile).eligible;
  const needsTrimBleed = Boolean(bleedRule && bleedRule.status !== 'approved' && isBleedEligible);

  const hasRgbApplied = appliedCorrections.some(c => c.id === 'rgb_cmyk');
  const hasBoxesApplied = appliedCorrections.some(c => c.id === 'trim_bleed');
  const hasPdfxApplied = appliedCorrections.some(c => c.id.startsWith('pdfx'));

  const canFixRgb = Boolean(hasRgb && !hasRgbApplied);
  const canFixBoxes = Boolean(needsTrimBleed && !hasBoxesApplied);
  const canFixPdfx = Boolean((!isDeclaredPdfX || !hasOutputIntent || pdfxVerifiedState === 'needs_revalidation') && pdfxVerifiedState !== 'verified');

  const autoFixesCount = (canFixDimensions ? 1 : 0) + (canFixRgb ? 1 : 0) + (canFixBoxes ? 1 : 0) + (canFixPdfx ? 1 : 0);
  const hasAnyFixes = canFixDimensions || dimensionConfirmationRequired || hasRgb || !isDeclaredPdfX || !hasOutputIntent || needsTrimBleed || (bleedRule && bleedRule.status !== 'approved') || appliedCorrections.length > 0;
  const hasPdfxPrereqs = Boolean(canFixDimensions || canFixRgb || canFixBoxes);

  // Detect manual issues that cannot be auto-fixed
  const dpiRule = analysis.ruleResults.results.find(r => (r.ruleId === 'RULE-PROF-DPI-001' || r.category === 'dpi') && (r.status === 'error' || r.status === 'warning'));
  const fontRule = analysis.ruleResults.results.find(r => (r.ruleId === 'RULE-PROF-FNT-001' || r.category === 'font' || r.category === 'typography') && (r.status === 'error' || r.status === 'warning'));
  const manualIssues: string[] = [];

  if (dimensionEligibility.status === 'manual_required' && dimensionEligibility.reasonCode === 'ASPECT_RATIO_MISMATCH') {
    manualIssues.push('Proporção incompatível — Não é seguro adaptar esta composição automaticamente. Uma futura Correção Inteligente poderá reconstruir a arte para este formato.');
  } else if (dimensionEligibility.status === 'manual_required' && dimensionEligibility.reasonCode === 'PAGE_SIZE_HETEROGENEOUS') {
    manualIssues.push('Páginas heterogêneas — O documento possui páginas com tamanhos diferentes que requerem padronização manual.');
  }

  if (dpiRule) manualIssues.push('Resolução de imagem baixa — Requer imagens originais em 300 DPI no software de criação.');
  if (fontRule) manualIssues.push('Fontes não incorporadas — Requer converter textos em curvas ou incorporar as fontes.');

  // Bleed: Motor 1 flagged but auto-fix not eligible (MediaBox too small to contain bleed area)
  const bleedNotApproved = Boolean(bleedRule && bleedRule.status !== 'approved');
  const bleedManualRequired = Boolean(bleedNotApproved && profileHasDimensions && !isBleedEligible && !hasBoxesApplied);
  if (bleedManualRequired) {
    manualIssues.push(`Sangria insuficiente — O perfil "${profile.name}" exige ${profile.expectedBleedMm} mm de sangria, mas a área da página (MediaBox) não é grande o suficiente para conter o formato final mais sangria. Exporte o PDF com sangria de ${profile.expectedBleedMm} mm no software de criação.`);
  }

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
        {/* Fix 0: Dimension Scaling / Rotation */}
        {canFixDimensions ? (
          <div className="p-4 rounded-2xl bg-gradient-to-r from-sky-50/70 to-white border border-sky-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-[#F0F9FF] text-[#0284C7] shrink-0 mt-0.5">
                <Maximize2 className="w-4 h-4" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-[#0F172A]">DIMENSÕES NOMINAIS DIVERGENTES</span>
                  <span className="px-2 py-0.5 rounded-md bg-[#E0F2FE] text-[#0369A1] text-[10px] font-bold">Geometria</span>
                </div>
                <p className="text-xs text-[#475569] leading-relaxed">
                  <strong>O que foi encontrado:</strong> O documento possui {dimensionEligibility.sourceWidthMm.toFixed(1)} × {dimensionEligibility.sourceHeightMm.toFixed(1)} mm, divergente do perfil nominal ({dimensionEligibility.targetWidthMm} × {dimensionEligibility.targetHeightMm} mm).<br />
                  <strong>Por que importa:</strong> Formatos não calibrados podem gerar cortes indevidos ou sangrias insuficientes na impressão.<br />
                  <strong>Ação recomendada:</strong> Aplicar escala vetorial proporcional uniforme ({dimensionEligibility.uniformScale.toFixed(2)}×) sem distorção visual.
                </p>
              </div>
            </div>

            <div className="shrink-0 flex items-center justify-end">
              <button
                type="button"
                disabled={isFixingInProgress}
                onClick={() => onRequestDimensionFix?.('scale_uniform')}
                className="px-4 py-2 rounded-xl bg-[#0284C7] hover:bg-[#0369A1] text-white text-xs font-bold shadow-xs transition-all cursor-pointer disabled:opacity-50 flex items-center gap-2"
              >
                {isFixingInProgress ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Ajustando...</span>
                  </>
                ) : (
                  'Ajustar Dimensões'
                )}
              </button>
            </div>
          </div>
        ) : dimensionConfirmationRequired ? (
          <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-50/70 to-white border border-amber-200/80 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-[#FFFBEB] text-[#D97706] shrink-0 mt-0.5">
                <RotateCcw className="w-4 h-4" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-[#0F172A]">ORIENTAÇÃO INCOMPATÍVEL</span>
                  <span className="px-2 py-0.5 rounded-md bg-[#FEF3C7] text-[#B45309] text-[10px] font-bold">Confirmação</span>
                </div>
                <p className="text-xs text-[#475569] leading-relaxed">
                  <strong>Arquivo:</strong> {dimensionEligibility.sourceWidthMm.toFixed(0)} × {dimensionEligibility.sourceHeightMm.toFixed(0)} mm — {dimensionEligibility.sourceWidthMm > dimensionEligibility.sourceHeightMm ? 'Horizontal' : 'Vertical'}<br />
                  <strong>Contrato:</strong> {dimensionEligibility.targetWidthMm} × {dimensionEligibility.targetHeightMm} mm — {dimensionEligibility.targetWidthMm > dimensionEligibility.targetHeightMm ? 'Horizontal' : 'Vertical'}<br />
                  <span className="text-slate-500">Esta ação altera apenas a orientação geométrica do PDF e não deforma a arte.</span>
                </p>
              </div>
            </div>

            <div className="shrink-0 flex items-center justify-end">
              <button
                type="button"
                disabled={isFixingInProgress}
                onClick={() => onRequestDimensionFix?.('rotate_90')}
                className="px-4 py-2 rounded-xl bg-[#D97706] hover:bg-[#B45309] text-white text-xs font-bold shadow-xs transition-all cursor-pointer disabled:opacity-50 flex items-center gap-2"
              >
                {isFixingInProgress ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Girando...</span>
                  </>
                ) : (
                  'Girar página 90°'
                )}
              </button>
            </div>
          </div>
        ) : (hasDimensionsApplied && isDimensionApproved) ? (
          <AppliedFixStatusCard
            title={appliedCorrections.find(c => c.id === 'dimensions')?.label?.includes('Orientação') || appliedCorrections.find(c => c.id === 'dimensions')?.label?.includes('giradas') || appliedCorrections.find(c => c.id === 'dimensions')?.label?.includes('Rotação') ? 'Orientação ajustada pelo ArteCheck' : 'Dimensões ajustadas pelo ArteCheck'}
            category="Geometria"
            details={appliedCorrections.find(c => c.id === 'dimensions')?.label?.includes('Orientação') || appliedCorrections.find(c => c.id === 'dimensions')?.label?.includes('giradas') || appliedCorrections.find(c => c.id === 'dimensions')?.label?.includes('Rotação') ? `${profile.expectedWidthMm} × ${profile.expectedHeightMm} mm • Rotação 90°` : `${profile.expectedWidthMm} × ${profile.expectedHeightMm} mm • Escala proporcional`}
            validationText="Revalidado pelo Motor 1"
          />
        ) : null}

        {/* Fix 1: RGB -> CMYK Color Conversion */}
        {canFixRgb ? (
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
        ) : (hasRgbApplied && !analysis.document.colorSummary.hasRgb) ? (
          <AppliedFixStatusCard
            title="Conversão CMYK realizada pelo ArteCheck"
            category="Cores"
            details="Espaço de cor DeviceCMYK • Conversão LittleCMS CMM e perfil normativo"
            validationText="Revalidado pelo Motor 1"
          />
        ) : null}

        {/* Fix 2: PDF/X-4 Preparation / Finalization */}
        {canFixPdfx ? (
          <div className="p-4 rounded-2xl bg-gradient-to-r from-purple-50/70 to-white border border-purple-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-[#FAF5FF] text-[#7C3AED] shrink-0 mt-0.5">
                <FileCheck2 className="w-4 h-4" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-[#0F172A]">FINALIZAÇÃO NORMATIVA PDF/X-4</span>
                  <span className="px-2 py-0.5 rounded-md bg-[#EFF6FF] text-[#1D4ED8] text-[10px] font-bold">Normativo</span>
                  {hasPdfxPrereqs ? (
                    <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 text-[10px] font-bold flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> Requisitos pendentes
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                      Pronto para finalizar
                    </span>
                  )}
                  {pdfxVerifiedState === 'needs_revalidation' && (
                    <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 text-[10px] font-bold flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> Revalidação necessária
                    </span>
                  )}
                </div>
                <p className="text-xs text-[#475569] leading-relaxed">
                  <strong>O que foi encontrado:</strong> {hasPdfxPrereqs 
                    ? `O arquivo requer adequação de ${[canFixRgb && 'Cores CMYK', canFixBoxes && 'Caixas Técnicas'].filter(Boolean).join(' e ')} antes de gravar a norma.`
                    : 'O arquivo está pronto para gravação de metadados XMP e Output Intent normativo (ISO 15930-7).'}
                  <br />
                  <strong>Ação recomendada:</strong> {hasPdfxPrereqs 
                    ? 'Ajustar os requisitos individualmente ou aplicar a correção conjunta.' 
                    : 'Gravar metadados XMP PDF/X-4 e OutputConditionIdentifier GTS_PDFX.'}
                </p>
              </div>
            </div>

            <div className="shrink-0 flex items-center justify-end">
              <button
                type="button"
                disabled={isFixingInProgress}
                onClick={handlePdfxClick}
                className="px-4 py-2 rounded-xl bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-xs font-bold shadow-xs transition-all cursor-pointer disabled:opacity-50 flex items-center gap-2"
              >
                {isFixingInProgress ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Finalizando PDF/X-4...</span>
                  </>
                ) : hasPdfxPrereqs ? (
                  'Ver Requisitos'
                ) : (
                  'Finalizar PDF/X-4'
                )}
              </button>
            </div>
          </div>
        ) : (hasPdfxApplied && (pdfxVerifiedState === 'verified' || (isDeclaredPdfX && hasOutputIntent))) ? (
          <AppliedFixStatusCard
            title="PDF/X-4 finalizado pelo ArteCheck"
            category="Normativo"
            details="ISO 15930-7 (PDF/X-4) • Metadados XMP e Output Intent GTS_PDFX"
            validationText="Revalidado pelo Motor 1"
          />
        ) : null}

        {/* Fix 3: TrimBox & BleedBox Calibration */}
        {canFixBoxes ? (
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
        ) : (hasBoxesApplied && bleedRule?.status === 'approved') ? (
          <AppliedFixStatusCard
            title="Caixas técnicas ajustadas pelo ArteCheck"
            category="Geometria"
            details={`TrimBox: ${analysis.document.pages[0]?.trimBox?.widthMm || profile.expectedWidthMm || 0} × ${analysis.document.pages[0]?.trimBox?.heightMm || profile.expectedHeightMm || 0} mm • Sangria: ${profile.expectedBleedMm || 3} mm`}
            validationText="Revalidado pelo Motor 1"
          />
        ) : null}

        {/* All automatic fixes applied banner */}
        {appliedCorrections.length > 0 && autoFixesCount === 0 && (
          <div className="p-4 rounded-2xl bg-emerald-50/80 border border-emerald-200 flex items-start gap-3 text-xs">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-emerald-900">
                Todas as correções automáticas disponíveis foram aplicadas com sucesso.
              </span>
              <p className="text-emerald-800 text-[11px] mt-0.5">
                O arquivo de trabalho está em conformidade com as regras automáticas avaliadas pelo Motor 1.
              </p>
            </div>
          </div>
        )}

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
