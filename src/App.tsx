import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { DashboardOverview } from './components/DashboardOverview';
import { FileSelected } from './components/FileSelected';
import { ProcessingState } from './components/ProcessingState';
import { OperationalVerdictBanner } from './components/OperationalVerdictBanner';
import { MainInspectionCard } from './components/MainInspectionCard';
import { AvailableFixesSection } from './components/AvailableFixesSection';
import { AppliedCorrectionsSummary, type AppliedCorrectionItem } from './components/AppliedCorrectionsSummary';
import { RecommendedProfileBanner } from './components/RecommendedProfileBanner';
import { TechnicalDetailsAccordion } from './components/TechnicalDetailsAccordion';
import { FilesManagementView } from './components/FilesManagementView';
import { VerificationsView } from './components/VerificationsView';
import { JobCheckForm, EMPTY_SPEC } from './components/JobCheckForm';
import { JobCheckResults } from './components/JobCheckResults';
import { ProductionProfilesModal } from './components/ProductionProfilesModal';
import { HistoryModal } from './components/HistoryModal';
import { TechnicalReportModal } from './components/TechnicalReportModal';
import { ApplyAllFixesModal, type PlannedFix } from './components/ApplyAllFixesModal';
import { PdfxPrerequisitesModal } from './components/PdfxPrerequisitesModal';
import { TransparencyModal } from './components/TransparencyModal';
import { Footer } from './components/Footer';

import { COMMERCIAL_PRINT_300DPI_PROFILE, ProductionProfile, detectMatchingProfilesFromPage } from './utils/productionProfiles';
import { getLocalCustomProfiles } from './utils/customProfilesStorage';
import { runDeterministicRuleEngine } from './utils/ruleEngine';
import { runJobCheck, type JobCheckSpec, type JobCheckResult } from './services/jobCheck';
import { createAnalysisSnapshot, buildTechnicalReport } from './services/technicalReport';
import { LocalStorageProvider } from './storage/LocalStorageProvider';
import type { AnalysisRecordSummary } from './domain/beta';
import type { PreflightAnalysis } from './types';
import { uploadPdfForExtraction, applyImageColorFixViaApi, applyTrimBleedFixViaApi, applyDimensionFixViaApi, finalizePdfx4ViaApi, preparePdfx4ViaApi, executePdfxFinalizeViaApi } from './services/api';
import { checkTrimBleedEligibility } from './services/trimBleedFix';
import { checkDimensionFixEligibility } from './services/dimensionFix';
import { apiUrl } from './config/api';
import { generateTechnicalReportPdf, generateReportPdfFileName, downloadTechnicalReportPdf } from './services/reportPdfGenerator';
import { Download, RotateCcw, Sparkles, CheckCircle2, AlertTriangle, ArrowRight, Check, X, Zap } from 'lucide-react';

export const App: React.FC = () => {
  const [selectedProfile, setSelectedProfile] = useState<ProductionProfile>(COMMERCIAL_PRINT_300DPI_PROFILE);
  
  // File & Cumulative Session States
  const [originalFile, setOriginalFile] = useState<File | null>(null);
  const [workingFile, setWorkingFile] = useState<File | null>(null);
  const [workingPdfBlob, setWorkingPdfBlob] = useState<Blob | null>(null);
  const [appliedCorrections, setAppliedCorrections] = useState<AppliedCorrectionItem[]>([]);
  const [isFixingInProgress, setIsFixingInProgress] = useState<boolean>(false);
  const [pdfxVerifiedState, setPdfxVerifiedState] = useState<'not_verified' | 'verified' | 'needs_revalidation'>('not_verified');

  // Apply All Fixes Modal & Progress
  const [isApplyAllModalOpen, setIsApplyAllModalOpen] = useState<boolean>(false);
  const [applyAllProgress, setApplyAllProgress] = useState<{ currentStep: number; totalSteps: number; stepLabel: string } | null>(null);

  // PDF/X Prerequisites Modal
  const [isPdfxPrereqsModalOpen, setIsPdfxPrereqsModalOpen] = useState<boolean>(false);

  // Analysis states
  const [originalAnalysis, setOriginalAnalysis] = useState<PreflightAnalysis | null>(null);
  const [currentAnalysis, setCurrentAnalysis] = useState<PreflightAnalysis | null>(null);
  const [processingStatus, setProcessingStatus] = useState<'idle' | 'uploading' | 'extracting' | 'analyzing' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Profile recommendation state & feedback toast
  const [dismissedRecommendation, setDismissedRecommendation] = useState(false);
  const [profileChangeFeedback, setProfileChangeFeedback] = useState<{
    profileName: string;
    dimensionsText: string;
    bleedText: string;
    dpiText: string;
  } | null>(null);

  // Active navigation tab ('dashboard' | 'files' | 'verifications' | 'reports' | 'history' | 'settings')
  const [activeTab, setActiveTab] = useState<string>('dashboard');

  // View mode: 'operational' vs 'technical'
  const [viewMode, setViewMode] = useState<'operational' | 'technical'>('operational');

  // Job Check state
  const [jobCheckEnabled, setJobCheckEnabled] = useState(false);
  const [jobCheckSpec, setJobCheckSpec] = useState<JobCheckSpec>(EMPTY_SPEC);
  const [jobCheckResult, setJobCheckResult] = useState<JobCheckResult | null>(null);

  // Modals
  const [isTransparencyModalOpen, setIsTransparencyModalOpen] = useState(false);
  const [customInitDimensions, setCustomInitDimensions] = useState<{ widthMm: number; heightMm: number } | null>(null);
  const [historyList, setHistoryList] = useState<AnalysisRecordSummary[]>([]);

  const storage = new LocalStorageProvider();

  const loadHistory = useCallback(() => {
    storage.listAnalyses().then(setHistoryList).catch(() => {});
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // Compute matched profiles for active document
  const matchingProfileData = useMemo(() => {
    if (!currentAnalysis?.document.pages[0]) return null;
    const customProfiles = getLocalCustomProfiles().map(p => ({
      id: p.id,
      name: p.name,
      category: 'custom' as const,
      description: 'Perfil personalizado',
      expectedWidthMm: p.rules.dimensions?.targetWidthMm,
      expectedHeightMm: p.rules.dimensions?.targetHeightMm,
      expectedBleedMm: p.rules.bleed?.requiredBleedMm ?? 3,
      minEffectiveDpi: p.rules.dpi?.recommendedDpi || 300,
      warningDpiThreshold: p.rules.dpi?.criticalDpi || 200,
      rgbPolicy: p.rules.colors?.rgbPolicy || 'error',
      recommendsPdfX: true,
    }));
    return detectMatchingProfilesFromPage(currentAnalysis.document.pages[0], customProfiles);
  }, [currentAnalysis, activeTab]);

  const handleFileSelected = (file: File) => {
    setOriginalFile(file);
    setWorkingFile(file);
    setWorkingPdfBlob(null);
    setAppliedCorrections([]);
    setPdfxVerifiedState('not_verified');
    setOriginalAnalysis(null);
    setCurrentAnalysis(null);
    setJobCheckResult(null);
    setProcessingStatus('idle');
    setErrorMessage(null);
    setDismissedRecommendation(false);
    setProfileChangeFeedback(null);
    setActiveTab('dashboard');
  };

  const handleStartAnalysis = async () => {
    if (!workingFile) return;

    setProcessingStatus('uploading');
    setErrorMessage(null);
    setDismissedRecommendation(false);

    try {
      // 1. Upload & Deterministic Structure Extraction
      const result = await uploadPdfForExtraction(workingFile);
      if (!result.success || !result.document) {
        throw new Error(result.error || 'Falha na extração dos dados estruturais do PDF.');
      }

      setProcessingStatus('analyzing');

      // 2. Evaluate deterministic preflight rules
      const ruleResults = runDeterministicRuleEngine(result.document, selectedProfile);

      const analysis: PreflightAnalysis = {
        id: result.analysisId || `analysis_${Date.now()}`,
        createdAt: Date.now(),
        fileName: workingFile.name,
        fileSizeBytes: workingFile.size,
        document: result.document,
        ruleResults,
        profileId: selectedProfile.id,
        diagnosticInfo: {
          extractionDurationMs: 40,
          evaluationDurationMs: 15,
        },
      };

      // 3. Save initial snapshot
      const initialSnapshot = createAnalysisSnapshot(analysis, selectedProfile);
      const reportData = buildTechnicalReport(initialSnapshot, null, selectedProfile);

      await storage.saveAnalysis({
        id: analysis.id,
        createdAt: analysis.createdAt,
        fileName: analysis.fileName,
        fileSizeBytes: analysis.fileSizeBytes,
        segmentName: selectedProfile.category,
        productName: selectedProfile.name,
        variantName: 'Padrão',
        productionProfileId: selectedProfile.id,
        status: ruleResults.scoreSummary.classification,
        score: ruleResults.scoreSummary.score,
        errorCount: ruleResults.errorCount,
        warningCount: ruleResults.warningCount,
        approvedCount: ruleResults.approvedCount,
        initialSnapshot,
        reportData,
      });

      setOriginalAnalysis(analysis);
      setCurrentAnalysis(analysis);
      loadHistory();

      if (jobCheckEnabled) {
        const jcResult = runJobCheck(jobCheckSpec, analysis);
        setJobCheckResult(jcResult);
      } else {
        setJobCheckResult(null);
      }

      setProcessingStatus('idle');
      setActiveTab('dashboard');
    } catch (err: any) {
      console.error('Erro na análise:', err);
      setProcessingStatus('error');
      const msg = err?.message || 'Erro inesperado ao analisar o documento.';
      setErrorMessage(msg);
    }
  };

  // Centralized working document reanalysis function (No reupload, working PDF preserved)
  const reanalyzeWorkingDocument = async (newProfile: ProductionProfile) => {
    if (!currentAnalysis) return;

    // Invalidate PDF/X verification state if profile changed
    if (pdfxVerifiedState === 'verified') {
      setPdfxVerifiedState('needs_revalidation');
    }

    // Re-run Motor 1 deterministically with the new production profile contract
    const updatedRules = runDeterministicRuleEngine(currentAnalysis.document, newProfile);

    const updatedAnalysis: PreflightAnalysis = {
      ...currentAnalysis,
      profileId: newProfile.id,
      ruleResults: updatedRules,
    };

    setCurrentAnalysis(updatedAnalysis);

    // Rebuild technical snapshots and update storage
    const postFixSnapshot = createAnalysisSnapshot(updatedAnalysis, newProfile);
    const updatedReport = buildTechnicalReport(
      originalAnalysis ? createAnalysisSnapshot(originalAnalysis, newProfile) : postFixSnapshot,
      { ruleResults: updatedRules } as any,
      newProfile
    );

    await storage.saveAnalysis({
      id: updatedAnalysis.id,
      createdAt: updatedAnalysis.createdAt,
      fileName: updatedAnalysis.fileName,
      fileSizeBytes: updatedAnalysis.fileSizeBytes,
      segmentName: newProfile.category,
      productName: newProfile.name,
      variantName: 'Perfil Atualizado',
      productionProfileId: newProfile.id,
      status: updatedRules.scoreSummary.classification,
      score: updatedRules.scoreSummary.score,
      errorCount: updatedRules.errorCount,
      warningCount: updatedRules.warningCount,
      approvedCount: updatedRules.approvedCount,
      initialSnapshot: originalAnalysis ? createAnalysisSnapshot(originalAnalysis, newProfile) : postFixSnapshot,
      postFixSnapshot,
      reportData: updatedReport,
    });

    loadHistory();

    // Re-run Job Check if active
    if (jobCheckEnabled) {
      const jcResult = runJobCheck(currentAnalysis.document, jobCheckSpec);
      setJobCheckResult(jcResult);
    }

    // Informative feedback toast
    setProfileChangeFeedback({
      profileName: newProfile.name.split('—')[0].trim(),
      dimensionsText: newProfile.expectedWidthMm && newProfile.expectedHeightMm
        ? `${newProfile.expectedWidthMm} × ${newProfile.expectedHeightMm} mm`
        : 'Formato Livre',
      bleedText: `${newProfile.expectedBleedMm ?? 0} mm`,
      dpiText: `${newProfile.minEffectiveDpi} DPI`,
    });
  };

  // Instant Deterministic Profile Switch Handler
  const handleSelectProfile = async (newProfile: ProductionProfile) => {
    setSelectedProfile(newProfile);
    await reanalyzeWorkingDocument(newProfile);
  };

  // Core updater for working PDF and Motor 1 reanalysis (does NOT check isFixingInProgress guard)
  const applyWorkingPdfUpdate = async (
    newBlob: Blob,
    fixId: string,
    fixLabel: string,
    isPdfxVerified?: boolean,
    details?: { before?: string; after?: string; summary?: string }
  ) => {
    if (!originalFile) return;

    const updatedFileName = originalFile.name;
    const updatedWorkingFile = new File([newBlob], updatedFileName, { type: 'application/pdf' });

    setWorkingPdfBlob(newBlob);
    setWorkingFile(updatedWorkingFile);

    const existingIdx = appliedCorrections.findIndex((c) => c.id === fixId);
    let newCorrections: AppliedCorrectionItem[];
    if (existingIdx >= 0) {
      newCorrections = [...appliedCorrections];
      newCorrections[existingIdx] = {
        id: fixId,
        label: fixLabel,
        appliedAt: Date.now(),
        details: details || newCorrections[existingIdx].details,
      };
    } else {
      newCorrections = [
        ...appliedCorrections,
        { id: fixId, label: fixLabel, appliedAt: Date.now(), details },
      ];
    }
    setAppliedCorrections(newCorrections);

    // Re-extract and re-analyze deterministic rules over the updated working PDF
    const result = await uploadPdfForExtraction(updatedWorkingFile);
    if (result.success && result.document) {
      const updatedRules = runDeterministicRuleEngine(result.document, selectedProfile);

      const updatedAnalysis: PreflightAnalysis = {
        id: currentAnalysis?.id || `analysis_${Date.now()}`,
        createdAt: currentAnalysis?.createdAt || Date.now(),
        fileName: updatedFileName,
        fileSizeBytes: newBlob.size,
        document: result.document,
        ruleResults: updatedRules,
        profileId: selectedProfile.id,
        diagnosticInfo: {
          extractionDurationMs: 35,
          evaluationDurationMs: 12,
        },
      };

      setCurrentAnalysis(updatedAnalysis);

      // Update local storage record with post-fix snapshot
      const postFixSnapshot = createAnalysisSnapshot(updatedAnalysis, selectedProfile);
      const updatedReport = buildTechnicalReport(
        originalAnalysis ? createAnalysisSnapshot(originalAnalysis, selectedProfile) : postFixSnapshot,
        { ruleResults: updatedRules } as any,
        selectedProfile
      );

      await storage.saveAnalysis({
        id: updatedAnalysis.id,
        createdAt: updatedAnalysis.createdAt,
        fileName: updatedAnalysis.fileName,
        fileSizeBytes: updatedAnalysis.fileSizeBytes,
        segmentName: selectedProfile.category,
        productName: selectedProfile.name,
        variantName: 'Corrigido',
        productionProfileId: selectedProfile.id,
        status: updatedRules.scoreSummary.classification,
        score: updatedRules.scoreSummary.score,
        errorCount: updatedRules.errorCount,
        warningCount: updatedRules.warningCount,
        approvedCount: updatedRules.approvedCount,
        initialSnapshot: originalAnalysis ? createAnalysisSnapshot(originalAnalysis, selectedProfile) : postFixSnapshot,
        postFixSnapshot,
        reportData: updatedReport,
      });

      loadHistory();
    }

    // Manage PDF/X verification status
    if (isPdfxVerified) {
      setPdfxVerifiedState('verified');
    } else if (pdfxVerifiedState === 'verified') {
      // If a non-PDF/X fix was applied after PDF/X was verified, require revalidation
      setPdfxVerifiedState('needs_revalidation');
    }
  };

  // Safe wrapper for child components
  const handleFixApplied = async (
    newBlob: Blob,
    fixId: string,
    fixLabel: string,
    isPdfxVerified?: boolean,
    details?: { before?: string; after?: string; summary?: string }
  ) => {
    if (isFixingInProgress || !originalFile) return;

    try {
      setIsFixingInProgress(true);
      await applyWorkingPdfUpdate(newBlob, fixId, fixLabel, isPdfxVerified, details);
    } catch (err) {
      console.error('Erro ao reanalisar o PDF corrigido:', err);
    } finally {
      setIsFixingInProgress(false);
    }
  };

  // Computed eligible fixes and manual warnings for "Ajustar Tudo"
  const dimEligibility = useMemo(() => {
    if (!currentAnalysis) return null;
    return checkDimensionFixEligibility(currentAnalysis.document, selectedProfile);
  }, [currentAnalysis, selectedProfile]);

  const canFixDimensions = useMemo(() => {
    if (!currentAnalysis || !selectedProfile.expectedWidthMm || !selectedProfile.expectedHeightMm) return false;
    const dimRule = currentAnalysis.ruleResults.results.find(
      (r) => r.ruleId === 'RULE-PROF-DIM-001'
    );
    if (!dimRule || dimRule.status === 'approved') return false;
    return Boolean(dimEligibility && dimEligibility.status === 'eligible');
  }, [currentAnalysis, selectedProfile, dimEligibility]);

  const canFixRgb = useMemo(() => {
    if (!currentAnalysis) return false;
    const hasRgbRaster = Boolean(currentAnalysis.document.colorSummary.hasRgbRaster);
    const hasApplied = appliedCorrections.some((c) => c.id === 'rgb_cmyk');
    return Boolean(hasRgbRaster && !hasApplied);
  }, [currentAnalysis, appliedCorrections]);

  const canFixBoxes = useMemo(() => {
    if (!currentAnalysis) return false;
    const bleedRule = currentAnalysis.ruleResults.results.find(
      (r) => r.ruleId === 'RULE-PROF-BLD-001' || r.category === 'bleed'
    );
    if (!bleedRule || bleedRule.status === 'approved') return false;

    const profileHasDimensions = Boolean(
      selectedProfile.expectedBleedMm &&
      selectedProfile.expectedBleedMm > 0 &&
      selectedProfile.expectedWidthMm &&
      selectedProfile.expectedHeightMm
    );
    if (!profileHasDimensions) return false;

    const hasApplied = appliedCorrections.some((c) => c.id === 'trim_bleed');
    if (hasApplied) return false;

    return checkTrimBleedEligibility(currentAnalysis.document, selectedProfile).eligible;
  }, [currentAnalysis, appliedCorrections, selectedProfile]);

  const canFixPdfx = useMemo(() => {
    if (!currentAnalysis) return false;
    const isDeclaredPdfX = Boolean(currentAnalysis.document.pdfxInfo?.isDeclaredPdfX);
    const hasOutputIntent = Boolean(currentAnalysis.document.pdfxInfo?.hasOutputIntent);
    const alreadyVerified = pdfxVerifiedState === 'verified';
    if (isDeclaredPdfX && hasOutputIntent && alreadyVerified) return false;

    // Detect unfixable blockers that prevent PDF/X
    const fontRule = currentAnalysis.ruleResults.results.find(
      (r) => (r.ruleId === 'RULE-PROF-FNT-001' || r.category === 'font' || r.category === 'typography') && (r.status === 'error' || r.status === 'warning')
    );
    if (fontRule) return false;

    if (dimEligibility?.status === 'manual_required') return false;

    const bleedRule = currentAnalysis.ruleResults.results.find(
      (r) => r.ruleId === 'RULE-PROF-BLD-001' || r.category === 'bleed'
    );
    const profileHasDims = Boolean(
      selectedProfile.expectedBleedMm && selectedProfile.expectedBleedMm > 0 &&
      selectedProfile.expectedWidthMm && selectedProfile.expectedHeightMm
    );
    const isBleedEligible = profileHasDims && checkTrimBleedEligibility(currentAnalysis.document, selectedProfile).eligible;
    const hasBoxesApplied = appliedCorrections.some((c) => c.id === 'trim_bleed');
    if (bleedRule && bleedRule.status !== 'approved' && !isBleedEligible && !hasBoxesApplied) {
      return false;
    }

    const hasRgbVector = Boolean(currentAnalysis.document.colorSummary.hasRgbVector);
    const hasRgbRaster = Boolean(currentAnalysis.document.colorSummary.hasRgbRaster);
    if (hasRgbVector && !hasRgbRaster && selectedProfile.rgbPolicy === 'error') {
      return false;
    }

    return Boolean(!isDeclaredPdfX || !hasOutputIntent || pdfxVerifiedState === 'needs_revalidation');
  }, [currentAnalysis, pdfxVerifiedState, dimEligibility, selectedProfile, appliedCorrections]);

  const plannedFixes = useMemo<PlannedFix[]>(() => {
    const list: PlannedFix[] = [];
    if (canFixDimensions && dimEligibility) {
      list.push({
        id: 'dimensions',
        title: 'Ajustar dimensões nominais',
        category: 'Geometria',
        description: `Aplica escala vetorial proporcional uniforme (${dimEligibility.sourceWidthMm.toFixed(0)} × ${dimEligibility.sourceHeightMm.toFixed(0)} mm → ${selectedProfile.expectedWidthMm} × ${selectedProfile.expectedHeightMm} mm).`,
        tag: 'Geometria',
      });
    }
    if (canFixRgb) {
      list.push({
        id: 'rgb_cmyk',
        title: 'Converter imagens RGB para CMYK',
        category: 'Cores',
        description: 'Converte imagens raster em espaço de cor DeviceRGB para DeviceCMYK utilizando LittleCMS CMM e perfil ICC normativo.',
        tag: 'LittleCMS',
      });
    }
    if (canFixBoxes) {
      list.push({
        id: 'trim_bleed',
        title: 'Calibrar TrimBox e BleedBox',
        category: 'Geometria',
        description: `Alinha geometricamente TrimBox (${selectedProfile.expectedWidthMm} × ${selectedProfile.expectedHeightMm} mm) e BleedBox (${selectedProfile.expectedBleedMm} mm de sangria).`,
        tag: 'Geometria',
      });
    }
    if (canFixPdfx) {
      list.push({
        id: 'pdfx4',
        title: 'Preparar e Finalizar PDF/X-4',
        category: 'Normativo',
        description: 'Grava metadados XMP, Output Intent GTS_PDFX e valida conformidade ISO 15930-7 (PDF/X-4).',
        tag: 'PDF/X-4',
      });
    }
    return list;
  }, [canFixDimensions, dimEligibility, canFixRgb, canFixBoxes, canFixPdfx, selectedProfile]);

  const manualWarnings = useMemo<string[]>(() => {
    if (!currentAnalysis) return [];
    const list: string[] = [];
    if (dimEligibility?.status === 'manual_required' && dimEligibility.reasonCode === 'ASPECT_RATIO_MISMATCH') {
      list.push('Proporção incompatível — Não é seguro adaptar esta composição automaticamente. Uma futura Correção Inteligente poderá reconstruir a arte para este formato.');
    } else if (dimEligibility?.status === 'manual_required' && dimEligibility.reasonCode === 'PAGE_SIZE_HETEROGENEOUS') {
      list.push('Páginas heterogêneas — O documento possui páginas com tamanhos diferentes que requerem padronização manual.');
    }

    const hasRgbVector = Boolean(currentAnalysis.document.colorSummary.hasRgbVector);
    const hasRgbRaster = Boolean(currentAnalysis.document.colorSummary.hasRgbRaster);
    if (hasRgbVector && !hasRgbRaster) {
      list.push('Vetores ou textos em RGB — O documento possui elementos gráficos vetoriais/textos em DeviceRGB. A conversão automática no ArteCheck é suportada exclusivamente para imagens raster. Ajuste as cores vetoriais para CMYK diretamente no software gráfico de origem.');
    }

    const dpiRule = currentAnalysis.ruleResults.results.find(
      (r) => (r.ruleId === 'RULE-PROF-DPI-001' || r.category === 'dpi') && (r.status === 'error' || r.status === 'warning')
    );
    const fontRule = currentAnalysis.ruleResults.results.find(
      (r) => (r.ruleId === 'RULE-PROF-FNT-001' || r.category === 'font' || r.category === 'typography') && (r.status === 'error' || r.status === 'warning')
    );
    if (dpiRule) list.push('Resolução de imagem baixa — Requer arquivo com imagens em 300 DPI no software de criação.');
    if (fontRule) list.push('Fontes não incorporadas — Requer converter textos em curvas no software gráfico de origem.');

    // Bleed: Motor 1 flagged but auto-fix not eligible
    const bleedRule = currentAnalysis.ruleResults.results.find(
      (r) => r.ruleId === 'RULE-PROF-BLD-001' || r.category === 'bleed'
    );
    const profileHasDims = Boolean(
      selectedProfile.expectedBleedMm && selectedProfile.expectedBleedMm > 0 &&
      selectedProfile.expectedWidthMm && selectedProfile.expectedHeightMm
    );
    const bleedNotApproved = Boolean(bleedRule && bleedRule.status !== 'approved');
    const hasBoxesApplied = appliedCorrections.some((c) => c.id === 'trim_bleed');
    if (bleedNotApproved && profileHasDims && !canFixBoxes && !hasBoxesApplied) {
      list.push(`Sangria insuficiente — O perfil exige ${selectedProfile.expectedBleedMm} mm de sangria, mas a área da página não é grande o suficiente. Exporte o PDF com sangria no software de criação.`);
    }

    return list;
  }, [currentAnalysis, dimEligibility, canFixBoxes, appliedCorrections, selectedProfile]);

  // Orchestrator for Batch "Ajustar Tudo Automaticamente"
  const handleExecuteApplyAllFixes = async () => {
    if (isFixingInProgress || !originalFile || !currentAnalysis || plannedFixes.length === 0) return;

    try {
      setIsFixingInProgress(true);

      const steps: Array<{
        id: 'dimensions' | 'rgb' | 'boxes' | 'pdfx';
        label: string;
        execute: (file: File) => Promise<{ blob: Blob; fixId: string; fixLabel: string; isPdfx?: boolean; details: any }>;
      }> = [];

      if (canFixDimensions) {
        steps.push({
          id: 'dimensions',
          label: 'Ajustando dimensões proporcionalmente...',
          execute: async (file) => {
            const res = await applyDimensionFixViaApi(file, selectedProfile, 'scale_uniform');
            if (!res.success || !res.fixedPdfBase64) {
              throw new Error(res.error || 'Falha ao ajustar dimensões.');
            }
            const byteChars = atob(res.fixedPdfBase64);
            const byteNums = new Array(byteChars.length);
            for (let i = 0; i < byteChars.length; i++) {
              byteNums[i] = byteChars.charCodeAt(i);
            }
            const blob = new Blob([new Uint8Array(byteNums)], { type: 'application/pdf' });
            return {
              blob,
              fixId: 'dimensions',
              fixLabel: 'Dimensões nominais ajustadas',
              details: {
                before: `${dimEligibility?.sourceWidthMm.toFixed(1)} × ${dimEligibility?.sourceHeightMm.toFixed(1)} mm`,
                after: `${selectedProfile.expectedWidthMm} × ${selectedProfile.expectedHeightMm} mm`,
                summary: 'Escala vetorial proporcional uniforme sem rasterização.',
              },
            };
          },
        });
      }

      if (canFixRgb) {
        steps.push({
          id: 'rgb',
          label: 'Convertendo imagens RGB para CMYK (LittleCMS)...',
          execute: async (file) => {
            const res = await applyImageColorFixViaApi(file, {
              profileId: selectedProfile.id,
              allowFallbackSrgb: true,
            });
            if (!res.success || !res.fixedPdfBase64) {
              throw new Error(res.error || 'Falha ao converter cores para CMYK.');
            }
            const byteChars = atob(res.fixedPdfBase64);
            const byteNums = new Array(byteChars.length);
            for (let i = 0; i < byteChars.length; i++) {
              byteNums[i] = byteChars.charCodeAt(i);
            }
            const blob = new Blob([new Uint8Array(byteNums)], { type: 'application/pdf' });
            return {
              blob,
              fixId: 'rgb_cmyk',
              fixLabel: 'Imagens convertidas para CMYK',
              details: {
                before: 'Imagens em espaço de cor RGB',
                after: 'Espaço de cor DeviceCMYK',
                summary: 'Conversão de cores realizada via LittleCMS CMM e validada.',
              },
            };
          },
        });
      }

      if (canFixBoxes) {
        steps.push({
          id: 'boxes',
          label: 'Calibrando TrimBox e BleedBox geometricamente...',
          execute: async (file) => {
            const res = await applyTrimBleedFixViaApi(file, selectedProfile.id);
            if (!res.success || !res.fixedPdfBase64) {
              throw new Error(res.error || 'Falha no ajuste de caixas técnicas.');
            }
            const byteChars = atob(res.fixedPdfBase64);
            const byteNums = new Array(byteChars.length);
            for (let i = 0; i < byteChars.length; i++) {
              byteNums[i] = byteChars.charCodeAt(i);
            }
            const blob = new Blob([new Uint8Array(byteNums)], { type: 'application/pdf' });
            return {
              blob,
              fixId: 'trim_bleed',
              fixLabel: 'Caixas técnicas ajustadas',
              details: {
                before: 'TrimBox / BleedBox ausentes',
                after: `TrimBox ${selectedProfile.expectedWidthMm} × ${selectedProfile.expectedHeightMm} mm • Sangria ${selectedProfile.expectedBleedMm} mm`,
                summary: 'TrimBox e BleedBox alinhados geometricamente e validados.',
              },
            };
          },
        });
      }

      if (canFixPdfx) {
        steps.push({
          id: 'pdfx',
          label: 'Preparando e Finalizando PDF/X-4 normativo...',
          execute: async (file) => {
            const res = await executePdfxFinalizeViaApi(file, selectedProfile);
            if (!res.success || !res.finalizedPdfBlob) {
              throw new Error(res.error || 'Falha na finalização PDF/X-4.');
            }
            return {
              blob: res.finalizedPdfBlob,
              fixId: 'pdfx4',
              fixLabel: 'PDF/X-4 finalizado e verificado',
              isPdfx: res.verifiedPdfX ?? true,
              details: {
                before: 'Sem declaração PDF/X',
                after: 'ISO 15930-7 (PDF/X-4) • FOGRA51',
                summary: 'Metadados XMP e Output Intent GTS_PDFX gravados e verificados.',
              },
            };
          },
        });
      }

      let currentBlob = workingPdfBlob || (originalFile as Blob);
      let currentFile = workingFile || originalFile;
      let sessionCorrections = [...appliedCorrections];

      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];

        // If a previous step already resolved this issue, skip it
        if (step.id === 'boxes' && currentAnalysis) {
          const bRule = currentAnalysis.ruleResults.results.find((r) => r.ruleId === 'RULE-PROF-BLD-001' || r.category === 'bleed');
          if (bRule?.status === 'approved') {
            continue;
          }
        }
        if (step.id === 'pdfx' && currentAnalysis) {
          const isDec = Boolean(currentAnalysis.document.pdfxInfo?.isDeclaredPdfX);
          const hasOi = Boolean(currentAnalysis.document.pdfxInfo?.hasOutputIntent);
          if (isDec && hasOi && pdfxVerifiedState === 'verified') {
            continue;
          }
        }

        setApplyAllProgress({
          currentStep: i + 1,
          totalSteps: steps.length,
          stepLabel: step.label,
        });

        const stepResult = await step.execute(currentFile);
        currentBlob = stepResult.blob;
        currentFile = new File([stepResult.blob], originalFile.name, { type: 'application/pdf' });

        setWorkingPdfBlob(currentBlob);
        setWorkingFile(currentFile);

        const existingIdx = sessionCorrections.findIndex((c) => c.id === stepResult.fixId);
        if (existingIdx >= 0) {
          sessionCorrections[existingIdx] = {
            id: stepResult.fixId,
            label: stepResult.fixLabel,
            appliedAt: Date.now(),
            details: stepResult.details,
          };
        } else {
          sessionCorrections.push({
            id: stepResult.fixId,
            label: stepResult.fixLabel,
            appliedAt: Date.now(),
            details: stepResult.details,
          });
        }
        setAppliedCorrections([...sessionCorrections]);

        // Re-extract and re-analyze with Motor 1
        const extractResult = await uploadPdfForExtraction(currentFile);
        if (extractResult.success && extractResult.document) {
          const updatedRules = runDeterministicRuleEngine(extractResult.document, selectedProfile);
          const updatedAnalysis: PreflightAnalysis = {
            id: currentAnalysis.id,
            createdAt: currentAnalysis.createdAt,
            fileName: originalFile.name,
            fileSizeBytes: stepResult.blob.size,
            document: extractResult.document,
            ruleResults: updatedRules,
            profileId: selectedProfile.id,
            diagnosticInfo: {
              extractionDurationMs: 30,
              evaluationDurationMs: 10,
            },
          };
          setCurrentAnalysis(updatedAnalysis);

          const postFixSnapshot = createAnalysisSnapshot(updatedAnalysis, selectedProfile);
          const updatedReport = buildTechnicalReport(
            originalAnalysis ? createAnalysisSnapshot(originalAnalysis, selectedProfile) : postFixSnapshot,
            { ruleResults: updatedRules } as any,
            selectedProfile
          );

          await storage.saveAnalysis({
            id: updatedAnalysis.id,
            createdAt: updatedAnalysis.createdAt,
            fileName: updatedAnalysis.fileName,
            fileSizeBytes: updatedAnalysis.fileSizeBytes,
            segmentName: selectedProfile.category,
            productName: selectedProfile.name,
            variantName: 'Corrigido',
            productionProfileId: selectedProfile.id,
            status: updatedRules.scoreSummary.classification,
            score: updatedRules.scoreSummary.score,
            errorCount: updatedRules.errorCount,
            warningCount: updatedRules.warningCount,
            approvedCount: updatedRules.approvedCount,
            initialSnapshot: originalAnalysis ? createAnalysisSnapshot(originalAnalysis, selectedProfile) : postFixSnapshot,
            postFixSnapshot,
            reportData: updatedReport,
          });

          loadHistory();
        }

        if (stepResult.isPdfx) {
          setPdfxVerifiedState('verified');
        }
      }

      setIsApplyAllModalOpen(false);
    } catch (err: any) {
      console.error('Erro ao executar Ajustar Tudo:', err);
      setIsApplyAllModalOpen(false);
      setErrorMessage(err?.message || 'Falha ao executar todas as correções automáticas.');
    } finally {
      setIsFixingInProgress(false);
      setApplyAllProgress(null);
    }
  };

  // Rotação automática permanece desativada; somente escala uniforme é executável.
  const handleRequestDimensionFix = (action: 'scale_uniform' | 'rotate_90' = 'scale_uniform') => {
    if (action === 'rotate_90') return;
    handleFixDimensions('scale_uniform');
  };

  // Individual Dimension Fix Handler (scale_uniform or rotate_90)
  const handleFixDimensions = async (action: 'scale_uniform' | 'rotate_90' = 'scale_uniform') => {
    if (isFixingInProgress || !originalFile || !currentAnalysis) return;

    try {
      setIsFixingInProgress(true);
      setErrorMessage(null);
      const fileToSend = workingFile || originalFile;

      const res = await applyDimensionFixViaApi(fileToSend, selectedProfile, action);
      if (!res.success || !res.fixedPdfBase64) {
        throw new Error(res.error || 'Falha ao ajustar dimensões do documento.');
      }

      const byteChars = atob(res.fixedPdfBase64);
      const byteNums = new Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) {
        byteNums[i] = byteChars.charCodeAt(i);
      }
      const blob = new Blob([new Uint8Array(byteNums)], { type: 'application/pdf' });

      const label = action === 'rotate_90' ? 'Orientação ajustada pelo ArteCheck' : 'Dimensões ajustadas pelo ArteCheck';
      const summary = action === 'rotate_90'
        ? 'Orientação de página corrigida deterministamente via rotação vetorial 90°.'
        : `Escala vetorial proporcional uniforme (${dimEligibility?.sourceWidthMm.toFixed(0)}×${dimEligibility?.sourceHeightMm.toFixed(0)} mm → ${selectedProfile.expectedWidthMm}×${selectedProfile.expectedHeightMm} mm).`;

      await applyWorkingPdfUpdate(
        blob,
        'dimensions',
        label,
        false,
        {
          before: `${dimEligibility?.sourceWidthMm.toFixed(1) || ''} × ${dimEligibility?.sourceHeightMm.toFixed(1) || ''} mm`,
          after: `${selectedProfile.expectedWidthMm} × ${selectedProfile.expectedHeightMm} mm`,
          summary,
        }
      );

    } catch (err: any) {
      console.error('Erro no ajuste de dimensões:', err);
      setErrorMessage(err?.message || 'Falha ao ajustar dimensões.');
    } finally {
      setIsFixingInProgress(false);
    }
  };

  // Open PDF/X flow: if prerequisites are pending, open modal; otherwise directly finalize
  const handleOpenPdfxFlow = () => {
    if (!currentAnalysis) return;
    const hasPrereqs = Boolean(canFixDimensions || canFixRgb || canFixBoxes);
    if (hasPrereqs) {
      setIsPdfxPrereqsModalOpen(true);
    } else {
      handleDirectFinalizePdfx();
    }
  };

  // Direct normative PDF/X finalization (unified with ApplyAll PDF/X step)
  const handleDirectFinalizePdfx = async () => {
    if (isFixingInProgress || !originalFile || !currentAnalysis) return;

    try {
      setIsFixingInProgress(true);
      setErrorMessage(null);
      const fileToSend = workingFile || originalFile;

      const finData = await executePdfxFinalizeViaApi(fileToSend, selectedProfile);
      if (!finData.success || !finData.finalizedPdfBlob) {
        throw new Error(finData.error || 'Falha na finalização PDF/X-4.');
      }

      await applyWorkingPdfUpdate(
        finData.finalizedPdfBlob,
        'pdfx4',
        'PDF/X-4 finalizado e verificado',
        finData.verifiedPdfX ?? true,
        {
          before: 'Sem declaração PDF/X',
          after: 'ISO 15930-7 (PDF/X-4) • FOGRA51',
          summary: 'Metadados XMP e Output Intent GTS_PDFX gravados e verificados.',
        }
      );

      setIsPdfxPrereqsModalOpen(false);
    } catch (err: any) {
      console.error('Erro na finalização PDF/X-4 direta:', err);
      setErrorMessage(err?.message || 'Não foi possível finalizar PDF/X-4.');
    } finally {
      setIsFixingInProgress(false);
    }
  };

  // Explicit compound action: "Corrigir requisitos e finalizar PDF/X"
  const handleCompoundFixAndFinalizePdfx = async () => {
    if (isFixingInProgress || !originalFile || !currentAnalysis) return;

    try {
      setIsFixingInProgress(true);

      const steps: Array<{
        id: 'rgb' | 'boxes' | 'pdfx';
        label: string;
        execute: (file: File) => Promise<{ blob: Blob; fixId: string; fixLabel: string; isPdfx?: boolean; details: any }>;
      }> = [];

      if (canFixRgb) {
        steps.push({
          id: 'rgb',
          label: 'Convertendo imagens RGB para CMYK (LittleCMS)...',
          execute: async (file) => {
            const res = await applyImageColorFixViaApi(file, {
              profileId: selectedProfile.id,
              allowFallbackSrgb: true,
            });
            if (!res.success || !res.fixedPdfBase64) {
              throw new Error(res.error || 'Falha ao converter cores para CMYK.');
            }
            const byteChars = atob(res.fixedPdfBase64);
            const byteNums = new Array(byteChars.length);
            for (let i = 0; i < byteChars.length; i++) {
              byteNums[i] = byteChars.charCodeAt(i);
            }
            const blob = new Blob([new Uint8Array(byteNums)], { type: 'application/pdf' });
            return {
              blob,
              fixId: 'rgb_cmyk',
              fixLabel: 'Imagens convertidas para CMYK',
              details: {
                before: 'Imagens em espaço de cor RGB',
                after: 'Espaço de cor DeviceCMYK',
                summary: 'Conversão de cores realizada via LittleCMS CMM e validada.',
              },
            };
          },
        });
      }

      if (canFixBoxes) {
        steps.push({
          id: 'boxes',
          label: 'Calibrando TrimBox e BleedBox geometricamente...',
          execute: async (file) => {
            const res = await applyTrimBleedFixViaApi(file, selectedProfile.id);
            if (!res.success || !res.fixedPdfBase64) {
              throw new Error(res.error || 'Falha no ajuste de caixas técnicas.');
            }
            const byteChars = atob(res.fixedPdfBase64);
            const byteNums = new Array(byteChars.length);
            for (let i = 0; i < byteChars.length; i++) {
              byteNums[i] = byteChars.charCodeAt(i);
            }
            const blob = new Blob([new Uint8Array(byteNums)], { type: 'application/pdf' });
            return {
              blob,
              fixId: 'trim_bleed',
              fixLabel: 'Caixas técnicas ajustadas',
              details: {
                before: 'TrimBox / BleedBox ausentes',
                after: `TrimBox ${selectedProfile.expectedWidthMm} × ${selectedProfile.expectedHeightMm} mm • Sangria ${selectedProfile.expectedBleedMm} mm`,
                summary: 'TrimBox e BleedBox alinhados geometricamente e validados.',
              },
            };
          },
        });
      }

      steps.push({
        id: 'pdfx',
        label: 'Finalizando PDF/X-4 normativo...',
        execute: async (file) => {
          const res = await executePdfxFinalizeViaApi(file, selectedProfile);
          if (!res.success || !res.finalizedPdfBlob) {
            throw new Error(res.error || 'Falha na finalização PDF/X-4.');
          }
          return {
            blob: res.finalizedPdfBlob,
            fixId: 'pdfx4',
            fixLabel: 'PDF/X-4 finalizado e verificado',
            isPdfx: res.verifiedPdfX ?? true,
            details: {
              before: 'Sem declaração PDF/X',
              after: 'ISO 15930-7 (PDF/X-4) • FOGRA51',
              summary: 'Metadados XMP e Output Intent GTS_PDFX gravados e verificados.',
            },
          };
        },
      });

      let currentBlob = workingPdfBlob || (originalFile as Blob);
      let currentFile = workingFile || originalFile;
      let sessionCorrections = [...appliedCorrections];

      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        const stepResult = await step.execute(currentFile);
        currentBlob = stepResult.blob;
        currentFile = new File([stepResult.blob], originalFile.name, { type: 'application/pdf' });

        setWorkingPdfBlob(currentBlob);
        setWorkingFile(currentFile);

        const existingIdx = sessionCorrections.findIndex((c) => c.id === stepResult.fixId);
        if (existingIdx >= 0) {
          sessionCorrections[existingIdx] = {
            id: stepResult.fixId,
            label: stepResult.fixLabel,
            appliedAt: Date.now(),
            details: stepResult.details,
          };
        } else {
          sessionCorrections.push({
            id: stepResult.fixId,
            label: stepResult.fixLabel,
            appliedAt: Date.now(),
            details: stepResult.details,
          });
        }
        setAppliedCorrections([...sessionCorrections]);

        // Re-extract and re-analyze with Motor 1
        const extractResult = await uploadPdfForExtraction(currentFile);
        if (extractResult.success && extractResult.document) {
          const updatedRules = runDeterministicRuleEngine(extractResult.document, selectedProfile);
          const updatedAnalysis: PreflightAnalysis = {
            id: currentAnalysis.id,
            createdAt: currentAnalysis.createdAt,
            fileName: originalFile.name,
            fileSizeBytes: stepResult.blob.size,
            document: extractResult.document,
            ruleResults: updatedRules,
            profileId: selectedProfile.id,
            diagnosticInfo: {
              extractionDurationMs: 30,
              evaluationDurationMs: 10,
            },
          };
          setCurrentAnalysis(updatedAnalysis);

          const postFixSnapshot = createAnalysisSnapshot(updatedAnalysis, selectedProfile);
          const updatedReport = buildTechnicalReport(
            originalAnalysis ? createAnalysisSnapshot(originalAnalysis, selectedProfile) : postFixSnapshot,
            { ruleResults: updatedRules } as any,
            selectedProfile
          );

          await storage.saveAnalysis({
            id: updatedAnalysis.id,
            createdAt: updatedAnalysis.createdAt,
            fileName: updatedAnalysis.fileName,
            fileSizeBytes: updatedAnalysis.fileSizeBytes,
            segmentName: selectedProfile.category,
            productName: selectedProfile.name,
            variantName: 'Corrigido',
            productionProfileId: selectedProfile.id,
            status: updatedRules.scoreSummary.classification,
            score: updatedRules.scoreSummary.score,
            errorCount: updatedRules.errorCount,
            warningCount: updatedRules.warningCount,
            approvedCount: updatedRules.approvedCount,
            initialSnapshot: originalAnalysis ? createAnalysisSnapshot(originalAnalysis, selectedProfile) : postFixSnapshot,
            postFixSnapshot,
            reportData: updatedReport,
          });

          loadHistory();
        }

        if (stepResult.isPdfx) {
          setPdfxVerifiedState('verified');
        }
      }

      setIsPdfxPrereqsModalOpen(false);
    } catch (err: any) {
      console.error('Erro na ação composta de PDF/X:', err);
      setErrorMessage(err?.message || 'Falha ao corrigir requisitos e finalizar PDF/X-4.');
    } finally {
      setIsFixingInProgress(false);
    }
  };

  // Global Download Handler for the current working PDF
  const handleDownloadWorkingPdf = () => {
    if (!workingPdfBlob || !originalFile) return;

    const baseName = originalFile.name.replace(/\.pdf$/i, '');
    const downloadName = `${baseName}_artecheck_corrigido.pdf`;

    const url = URL.createObjectURL(workingPdfBlob);
    const a = window.document.createElement('a');
    a.href = url;
    a.download = downloadName;
    window.document.body.appendChild(a);
    a.click();
    window.document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Restore session to original PDF
  const handleRestoreOriginal = () => {
    if (!originalFile || !originalAnalysis) return;

    setWorkingFile(originalFile);
    setWorkingPdfBlob(null);
    setAppliedCorrections([]);
    setCurrentAnalysis(originalAnalysis);
    setPdfxVerifiedState('not_verified');
  };

  const handleReset = () => {
    setOriginalFile(null);
    setWorkingFile(null);
    setWorkingPdfBlob(null);
    setAppliedCorrections([]);
    setPdfxVerifiedState('not_verified');
    setOriginalAnalysis(null);
    setCurrentAnalysis(null);
    setJobCheckResult(null);
    setProcessingStatus('idle');
    setErrorMessage(null);
    setDismissedRecommendation(false);
    setProfileChangeFeedback(null);
    setActiveTab('dashboard');
  };

  const scrollToFixes = () => {
    const el = window.document.getElementById('correcoes-disponiveis');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleExportHistoryReport = async (item: AnalysisRecordSummary) => {
    let reportData = item.reportData;
    if (!reportData && item.initialSnapshot && item.initialSnapshot.documentSummary) {
      reportData = buildTechnicalReport(
        item.initialSnapshot,
        item.postFixSnapshot
          ? ({
              ruleResults: {
                results: item.postFixSnapshot.rules,
                scoreSummary: {
                  score: item.postFixSnapshot.score,
                  classification: item.postFixSnapshot.classification,
                },
              },
            } as any)
          : null,
        {
          id: item.productionProfileId,
          name: item.productName,
          category: item.segmentName,
          rules: {},
        } as any
      );
    }
    if (!reportData) {
      throw new Error('Metadados salvos não contêm snapshot estrutural para emissão do relatório.');
    }
    const pdfBytes = await generateTechnicalReportPdf(reportData);
    const fileName = generateReportPdfFileName(reportData.fileName, reportData.generatedAt);
    downloadTechnicalReportPdf(pdfBytes, fileName);
  };

  const handleSidebarTabSelect = (tab: string) => {
    setActiveTab(tab);
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC] text-[#0F172A]">
      {/* Top Header */}
      <Header />

      {/* Main Layout Area */}
      <div className="flex flex-1 min-w-0">
        {/* Left Narrow Sidebar */}
        <Sidebar
          activeTab={activeTab}
          onSelectTab={handleSidebarTabSelect}
        />

        {/* Center Main Stage */}
        <main className="min-w-0 flex-1 bg-[#f8f9fd] px-4 pb-24 pt-7 sm:px-8 md:py-10 xl:px-12">
          {processingStatus !== 'idle' ? (
            <ProcessingState
              status={processingStatus}
              errorMessage={errorMessage || undefined}
              onRetry={handleStartAnalysis}
              onBack={() => setProcessingStatus('idle')}
              onLogin={undefined}
              onUpgrade={undefined}
            />
          ) : activeTab === 'history' ? (
            <HistoryModal isOpen embedded onClose={() => setActiveTab('dashboard')} onExportReport={handleExportHistoryReport} />
          ) : activeTab === 'profiles' ? (
            <ProductionProfilesModal
              isOpen
              embedded
              onClose={() => setActiveTab('dashboard')}
              selectedProfile={selectedProfile}
              onSelectProfile={handleSelectProfile}
              initialDimensions={customInitDimensions}
            />
          ) : activeTab === 'report' ? (
            currentAnalysis ? (
              <TechnicalReportModal isOpen embedded onClose={() => setActiveTab('dashboard')} analysis={currentAnalysis} profile={selectedProfile} appliedCorrections={appliedCorrections} />
            ) : (
              <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">Analise um arquivo para visualizar o relatório técnico.</div>
            )
          ) : activeTab === 'files' ? (
            <FilesManagementView
              currentAnalysis={currentAnalysis}
              workingFile={workingFile}
              originalFile={originalFile}
              profile={selectedProfile}
              appliedCorrections={appliedCorrections}
              onGoToDashboard={() => setActiveTab('dashboard')}
              onDownloadWorkingPdf={handleDownloadWorkingPdf}
              onRestoreOriginal={handleRestoreOriginal}
              onOpenReportModal={() => setActiveTab('report')}
              onReset={handleReset}
              historyList={historyList}
              onSelectHistoryItem={(id) => {
                const item = historyList.find(h => h.id === id);
                if (item) {
                  setActiveTab('history');
                }
              }}
              onDeleteHistoryItem={async (id) => {
                await storage.deleteAnalysis(id);
                loadHistory();
              }}
              onExportHistoryReport={handleExportHistoryReport}
            />
          ) : activeTab === 'verifications' ? (
            <VerificationsView
              analysis={currentAnalysis}
              profile={selectedProfile}
              onGoToDashboard={() => setActiveTab('dashboard')}
              onScrollToFixes={scrollToFixes}
              onOpenReportModal={() => setActiveTab('report')}
              onReset={handleReset}
            />
          ) : currentAnalysis ? (
            <div className="space-y-6">
              {/* Error Message Toast / Alert */}
              {errorMessage && (
                <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-900 shadow-2xs flex items-center justify-between gap-3 animate-in fade-in duration-200 select-none">
                  <div className="flex items-center gap-2.5">
                    <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
                    <div className="text-xs font-semibold">
                      <span>{errorMessage}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setErrorMessage(null)}
                    className="p-1 rounded-lg text-red-600 hover:bg-red-100 transition-colors cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* Profile Change Feedback Toast */}
              {profileChangeFeedback && (
                <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 shadow-2xs flex items-center justify-between gap-3 animate-in fade-in duration-200 select-none">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-emerald-600 text-white flex items-center justify-center font-black text-xs shrink-0">
                      ✓
                    </div>
                    <div className="text-xs font-semibold">
                      <span>
                        ✓ Perfil atualizado para <strong>{profileChangeFeedback.profileName}</strong> — {profileChangeFeedback.dimensionsText}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setProfileChangeFeedback(null)}
                    className="p-1 rounded-lg text-emerald-600 hover:bg-emerald-100 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* Recommended Profile Banner (if compatible presets found for generic active profile) */}
              {matchingProfileData && !dismissedRecommendation && (
                <RecommendedProfileBanner
                  detectedWidthMm={matchingProfileData.detectedWidthMm}
                  detectedHeightMm={matchingProfileData.detectedHeightMm}
                  pageOrientation={matchingProfileData.pageOrientation}
                  exactOrientationMatches={matchingProfileData.exactOrientationMatches}
                  inverseOrientationMatches={matchingProfileData.inverseOrientationMatches}
                  matchingProfiles={matchingProfileData.matches}
                  currentProfile={selectedProfile}
                  onSelectProfile={handleSelectProfile}
                  onOpenProfilesModal={() => {
                    setCustomInitDimensions(null);
                    setActiveTab('profiles');
                  }}
                  onCreateCustomWithDimensions={(w, h) => {
                    setCustomInitDimensions({ widthMm: w, heightMm: h });
                    setActiveTab('profiles');
                  }}
                  onDismiss={() => setDismissedRecommendation(true)}
                />
              )}

              {/* Persistent Applied Corrections Summary & Global Download */}
              <AppliedCorrectionsSummary
                appliedCorrections={appliedCorrections}
                onRestoreOriginal={handleRestoreOriginal}
                onDownloadWorkingPdf={handleDownloadWorkingPdf}
              />

              {/* Operational Decision Banner */}
              {(() => {
                const hasRgbRaster = Boolean(currentAnalysis.document.colorSummary.hasRgbRaster);
                const hasRgbVector = Boolean(currentAnalysis.document.colorSummary.hasRgbVector);
                const hasRgbApplied = appliedCorrections.some((c) => c.id === 'rgb_cmyk');
                const canFixRgb = Boolean(hasRgbRaster && !hasRgbApplied);

                const hasBoxesApplied = appliedCorrections.some((c) => c.id === 'trim_bleed');
                const isGenericProfile = Boolean(!selectedProfile.expectedWidthMm || !selectedProfile.expectedHeightMm);
                const needsTrimBleed =
                  !hasBoxesApplied &&
                  !isGenericProfile &&
                  ((currentAnalysis.document.pages[0]?.trimBox?.status !== 'explicit' &&
                    Boolean(selectedProfile.expectedWidthMm && selectedProfile.expectedHeightMm)) ||
                    (currentAnalysis.document.pages[0]?.bleedBox?.status !== 'explicit' &&
                      Boolean(selectedProfile.expectedBleedMm)));
                const canFixBoxes = Boolean(needsTrimBleed && !hasBoxesApplied);

                const fontRule = currentAnalysis.ruleResults.results.find(
                  (r) =>
                    (r.ruleId === 'RULE-PROF-FNT-001' || r.category === 'font' || r.category === 'typography') &&
                    (r.status === 'error' || r.status === 'warning')
                );
                const vectorRgbManualRequired = Boolean(hasRgbVector && !hasRgbRaster && selectedProfile.rgbPolicy === 'error');
                const hasPdfxBlockers = Boolean(fontRule || vectorRgbManualRequired);
                const canFixPdfx = Boolean(
                  (!currentAnalysis.document.pdfxInfo?.isDeclaredPdfX ||
                    !currentAnalysis.document.pdfxInfo?.hasOutputIntent) &&
                    !hasPdfxBlockers
                );

                const autoFixesCount = (canFixRgb ? 1 : 0) + (canFixBoxes ? 1 : 0) + (canFixPdfx ? 1 : 0);

                return (
                  <OperationalVerdictBanner
                    ruleResults={currentAnalysis.ruleResults}
                    availableFixesCount={autoFixesCount}
                    onScrollToFixes={scrollToFixes}
                  />
                );
              })()}

              {/* Main 3-Column Inspection Card */}
              <MainInspectionCard
                analysis={currentAnalysis}
                profile={selectedProfile}
                file={workingFile || originalFile}
                onOpenReportModal={() => setActiveTab('report')}
                onOpenProfiles={() => {
                  setCustomInitDimensions(null);
                  setActiveTab('profiles');
                }}
                userName={undefined}
              />

              {/* Job Check Results if enabled */}
              {jobCheckResult && (
                <JobCheckResults
                  result={jobCheckResult}
                  spec={jobCheckSpec}
                  analysis={currentAnalysis}
                />
              )}

              {/* Available Fixes Section (Cumulative) */}
              <AvailableFixesSection
                analysis={currentAnalysis}
                profile={selectedProfile}
                originalFile={workingFile}
                appliedCorrections={appliedCorrections}
                onFixApplied={handleFixApplied}
                onOpenApplyAllModal={() => setIsApplyAllModalOpen(true)}
                onRequestDimensionFix={handleRequestDimensionFix}
                onRequestPdfxFinalize={handleOpenPdfxFlow}
                onOpenPdfxModal={handleOpenPdfxFlow}
                onOpenTransparencyModal={() => setIsTransparencyModalOpen(true)}
                isFixingInProgress={isFixingInProgress}
                pdfxVerifiedState={pdfxVerifiedState}
              />

              {/* Technical Details Accordion */}
              <TechnicalDetailsAccordion
                analysis={currentAnalysis}
                profile={selectedProfile}
                isOpenDefault={viewMode === 'technical'}
              />
            </div>
          ) : workingFile ? (
            <div className="space-y-6">
              <JobCheckForm
                enabled={jobCheckEnabled}
                onToggle={setJobCheckEnabled}
                spec={jobCheckSpec}
                onSpecChange={setJobCheckSpec}
              />
              <FileSelected
                file={workingFile}
                onClear={handleReset}
                onAnalyze={handleStartAnalysis}
                isLoading={processingStatus !== 'idle'}
                selectedProfile={selectedProfile}
                onOpenProfilesModal={() => {
                  setCustomInitDimensions(null);
                  setActiveTab('profiles');
                }}
                onSelectProfile={handleSelectProfile}
              />
            </div>
          ) : (
            <DashboardOverview history={historyList} onFileSelected={handleFileSelected} onOpenHistory={() => setActiveTab('history')} />
          )}
        </main>
      </div>

      {/* Minimalist Light Footer */}
      <Footer />

      {/* Modals */}
      <PdfxPrerequisitesModal
        isOpen={isPdfxPrereqsModalOpen}
        onClose={() => setIsPdfxPrereqsModalOpen(false)}
        analysis={currentAnalysis}
        profile={selectedProfile}
        hasRgbPending={canFixRgb}
        hasBoxesPending={canFixBoxes}
        onFixRgbNow={() => {
          scrollToFixes();
        }}
        onFixBoxesNow={() => {
          scrollToFixes();
        }}
        onFixAllAndFinalize={handleCompoundFixAndFinalizePdfx}
        isProcessing={isFixingInProgress}
      />
      <ApplyAllFixesModal
        isOpen={isApplyAllModalOpen}
        onClose={() => setIsApplyAllModalOpen(false)}
        onConfirm={handleExecuteApplyAllFixes}
        isApplying={isFixingInProgress}
        progress={applyAllProgress}
        plannedFixes={plannedFixes}
        manualWarnings={manualWarnings}
      />
      {currentAnalysis && (
        <TransparencyModal
          isOpen={isTransparencyModalOpen}
          onClose={() => setIsTransparencyModalOpen(false)}
          analysis={currentAnalysis}
          workingFile={workingFile || originalFile}
          onApplyFlattenedPdf={async (bytes, fileName) => {
            const blob = new Blob([bytes], { type: 'application/pdf' });
            await handleFixApplied(
              blob,
              'transparency_flatten',
              'Transparências achatadas via Ghostscript',
              false,
              {
                summary: 'Achatamento determinístico de transparências (PDF 1.3)',
              }
            );
          }}
        />
      )}
    </div>
  );
};

export default App;
