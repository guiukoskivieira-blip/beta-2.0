import React, { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { UploadZone } from './components/UploadZone';
import { FileSelected } from './components/FileSelected';
import { ProcessingState } from './components/ProcessingState';
import { OperationalVerdictBanner } from './components/OperationalVerdictBanner';
import { MainInspectionCard } from './components/MainInspectionCard';
import { AvailableFixesSection } from './components/AvailableFixesSection';
import { TechnicalDetailsAccordion } from './components/TechnicalDetailsAccordion';
import { FilesManagementView } from './components/FilesManagementView';
import { VerificationsView } from './components/VerificationsView';
import { JobCheckForm, EMPTY_SPEC } from './components/JobCheckForm';
import { JobCheckResults } from './components/JobCheckResults';
import { AuthModal } from './components/AuthModal';
import { ProductionProfilesModal } from './components/ProductionProfilesModal';
import { HistoryModal } from './components/HistoryModal';
import { AboutBetaModal } from './components/AboutBetaModal';
import { PlansModal } from './components/PlansModal';
import { TechnicalReportModal } from './components/TechnicalReportModal';
import { Footer } from './components/Footer';

import { COMMERCIAL_PRINT_300DPI_PROFILE, ProductionProfile } from './utils/productionProfiles';
import { runDeterministicRuleEngine } from './utils/ruleEngine';
import { runJobCheck, type JobCheckSpec, type JobCheckResult } from './services/jobCheck';
import { createAnalysisSnapshot, buildTechnicalReport } from './services/technicalReport';
import { LocalStorageProvider } from './storage/LocalStorageProvider';
import type { BetaUser, AnalysisRecordSummary } from './domain/beta';
import type { PreflightAnalysis } from './types';
import { uploadPdfForExtraction } from './services/api';
import { auth } from './auth';
import { getBillingStatus } from './services/billing';
import type { BillingStatus } from './domain/billing';
import { generateTechnicalReportPdf, generateReportPdfFileName, downloadTechnicalReportPdf } from './services/reportPdfGenerator';
import { Download, RotateCcw, Sparkles, CheckCircle2, AlertTriangle, ArrowRight } from 'lucide-react';

export const App: React.FC = () => {
  const [selectedProfile, setSelectedProfile] = useState<ProductionProfile>(COMMERCIAL_PRINT_300DPI_PROFILE);
  
  // File & Cumulative Session States
  const [originalFile, setOriginalFile] = useState<File | null>(null);
  const [workingFile, setWorkingFile] = useState<File | null>(null);
  const [workingPdfBlob, setWorkingPdfBlob] = useState<Blob | null>(null);
  const [appliedCorrections, setAppliedCorrections] = useState<Array<{ id: string; label: string; appliedAt: number }>>([]);
  const [isFixingInProgress, setIsFixingInProgress] = useState<boolean>(false);
  const [pdfxVerifiedState, setPdfxVerifiedState] = useState<'not_verified' | 'verified' | 'needs_revalidation'>('not_verified');

  // Analysis states
  const [originalAnalysis, setOriginalAnalysis] = useState<PreflightAnalysis | null>(null);
  const [currentAnalysis, setCurrentAnalysis] = useState<PreflightAnalysis | null>(null);
  const [processingStatus, setProcessingStatus] = useState<'idle' | 'uploading' | 'extracting' | 'analyzing' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [limitReached, setLimitReached] = useState(false);

  // Active navigation tab ('dashboard' | 'files' | 'verifications' | 'reports' | 'history' | 'settings')
  const [activeTab, setActiveTab] = useState<string>('dashboard');

  // View mode: 'operational' vs 'technical'
  const [viewMode, setViewMode] = useState<'operational' | 'technical'>('operational');

  // Job Check state
  const [jobCheckEnabled, setJobCheckEnabled] = useState(false);
  const [jobCheckSpec, setJobCheckSpec] = useState<JobCheckSpec>(EMPTY_SPEC);
  const [jobCheckResult, setJobCheckResult] = useState<JobCheckResult | null>(null);

  // Modals
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isProfilesOpen, setIsProfilesOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [isPlansOpen, setIsPlansOpen] = useState(false);
  const [isReportOpen, setIsReportOpen] = useState(false);

  // User & Billing states
  const [currentUser, setCurrentUser] = useState<BetaUser | null>(null);
  const [billingStatus, setBillingStatus] = useState<BillingStatus | null>(null);
  const [historyList, setHistoryList] = useState<AnalysisRecordSummary[]>([]);

  const storage = new LocalStorageProvider();

  const loadHistory = useCallback(() => {
    storage.listAnalyses().then(setHistoryList).catch(() => {});
  }, []);

  useEffect(() => {
    loadHistory();
    auth.getCurrentUser().then((u) => {
      if (u) setCurrentUser(u);
    });

    if (auth.onAuthStateChange) {
      const unsubscribe = auth.onAuthStateChange((session) => {
        setCurrentUser(session?.user || null);
      });
      return () => {
        unsubscribe();
      };
    }
  }, [loadHistory]);

  useEffect(() => {
    if (currentUser) {
      getBillingStatus()
        .then((s) => setBillingStatus(s))
        .catch(() => setBillingStatus(null));
    } else {
      setBillingStatus(null);
    }
  }, [currentUser]);

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
    setActiveTab('dashboard');
  };

  const handleStartAnalysis = async () => {
    if (!workingFile) return;

    setProcessingStatus('uploading');
    setErrorMessage(null);
    setLimitReached(false);

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

      if (currentUser) {
        getBillingStatus().then(setBillingStatus).catch(() => {});
      }

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
      setLimitReached(msg.includes('limite') || msg.includes('upgrade') || msg.includes('atingiu'));
    }
  };

  // Cumulative Fix Application Handler
  const handleFixApplied = async (
    newBlob: Blob,
    fixId: string,
    fixLabel: string,
    isPdfxVerified?: boolean
  ) => {
    if (isFixingInProgress || !originalFile) return;

    try {
      setIsFixingInProgress(true);

      const updatedFileName = originalFile.name;
      const updatedWorkingFile = new File([newBlob], updatedFileName, { type: 'application/pdf' });

      setWorkingPdfBlob(newBlob);
      setWorkingFile(updatedWorkingFile);

      const newCorrections = [
        ...appliedCorrections,
        { id: fixId, label: fixLabel, appliedAt: Date.now() },
      ];
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
    } catch (err) {
      console.error('Erro ao reanalisar o PDF corrigido:', err);
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
    setLimitReached(false);
    setActiveTab('dashboard');
  };

  const scrollToFixes = () => {
    const el = window.document.getElementById('correcoes-disponiveis');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleSidebarTabSelect = (tab: string) => {
    setActiveTab(tab);
    if (tab === 'history') {
      setIsHistoryOpen(true);
    } else if (tab === 'settings') {
      setIsProfilesOpen(true);
    } else if (tab === 'reports') {
      if (currentAnalysis) {
        setIsReportOpen(true);
      } else {
        setIsHistoryOpen(true);
      }
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC] text-[#0F172A]">
      {/* Top Header */}
      <Header
        onReset={handleReset}
        canReset={Boolean(originalFile || currentAnalysis)}
        viewMode={viewMode}
        onToggleViewMode={(mode) => setViewMode(mode)}
        selectedProfile={selectedProfile}
        onOpenProfiles={() => setIsProfilesOpen(true)}
      />

      {/* Main Layout Area */}
      <div className="flex flex-1 min-w-0">
        {/* Left Narrow Sidebar */}
        <Sidebar
          activeTab={activeTab}
          onSelectTab={handleSidebarTabSelect}
          billingStatus={{
            planCode: billingStatus?.plan || 'free',
            used: billingStatus?.usedAnalyses || 0,
            limit: billingStatus?.limitAnalyses || 15,
            remaining: Math.max(0, (billingStatus?.limitAnalyses || 15) - (billingStatus?.usedAnalyses || 0)),
          }}
          currentUser={currentUser}
          onOpenUpgradeModal={() => setIsPlansOpen(true)}
          onLogout={async () => {
            await auth.signOut();
            setCurrentUser(null);
            setBillingStatus(null);
          }}
        />

        {/* Center Main Stage */}
        <main className="flex-1 min-w-0 px-4 sm:px-8 py-6 max-w-6xl mx-auto w-full">
          {processingStatus !== 'idle' ? (
            <ProcessingState
              status={processingStatus}
              errorMessage={errorMessage || undefined}
              onRetry={handleStartAnalysis}
              onUpgrade={limitReached ? () => setIsPlansOpen(true) : undefined}
            />
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
              onOpenReportModal={() => setIsReportOpen(true)}
              onReset={handleReset}
              historyList={historyList}
              onSelectHistoryItem={(id) => {
                const item = historyList.find(h => h.id === id);
                if (item) {
                  setIsHistoryOpen(true);
                }
              }}
              onDeleteHistoryItem={async (id) => {
                await storage.deleteAnalysis(id);
                loadHistory();
              }}
              onExportHistoryReport={async (item) => {
                try {
                  const snap = item.initialSnapshot;
                  const reportData = item.reportData || buildTechnicalReport(snap);
                  const pdfBytes = await generateTechnicalReportPdf(reportData);
                  const fileName = generateReportPdfFileName(reportData.fileName, reportData.generatedAt);
                  downloadTechnicalReportPdf(pdfBytes, fileName);
                } catch (e) {
                  console.error('Erro ao exportar relatório:', e);
                }
              }}
            />
          ) : activeTab === 'verifications' ? (
            <VerificationsView
              analysis={currentAnalysis}
              profile={selectedProfile}
              onGoToDashboard={() => setActiveTab('dashboard')}
              onScrollToFixes={scrollToFixes}
              onOpenReportModal={() => setIsReportOpen(true)}
              onReset={handleReset}
            />
          ) : currentAnalysis ? (
            <div className="space-y-6">
              {/* Global Cumulative Session Download Bar (Top Highlight) */}
              {appliedCorrections.length > 0 && (
                <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-600 via-teal-600 to-[#2563EB] text-white shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2 select-none">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-white/20 text-white shrink-0">
                      <Sparkles className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-black tracking-tight">
                          Sessão de Trabalho: {appliedCorrections.length} correção(ões) acumulada(s)
                        </span>
                      </div>
                      <p className="text-xs text-white/90 font-medium">
                        O PDF de trabalho está pronto com todas as alterações aplicadas e revalidadas.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleRestoreOriginal}
                      className="px-3 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-bold transition-all cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5 inline mr-1" />
                      Restaurar Original
                    </button>
                    <button
                      type="button"
                      onClick={handleDownloadWorkingPdf}
                      className="px-4 py-2 rounded-xl bg-white text-emerald-800 hover:bg-emerald-50 text-xs font-black shadow-xs transition-all cursor-pointer"
                    >
                      <Download className="w-4 h-4 inline mr-1.5" />
                      Baixar Arquivo Corrigido
                    </button>
                  </div>
                </div>
              )}

              {/* Operational Decision Banner */}
              <OperationalVerdictBanner
                ruleResults={currentAnalysis.ruleResults}
                availableFixesCount={
                  (currentAnalysis.document.colorSummary.hasRgb ? 1 : 0) +
                  (!currentAnalysis.document.pdfxInfo?.isDeclaredPdfX ? 1 : 0)
                }
                onScrollToFixes={scrollToFixes}
              />

              {/* Main 3-Column Inspection Card */}
              <MainInspectionCard
                analysis={currentAnalysis}
                profile={selectedProfile}
                file={workingFile || originalFile}
                onOpenReportModal={() => setIsReportOpen(true)}
                onOpenProfiles={() => setIsProfilesOpen(true)}
                userName={currentUser?.name}
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
              />
            </div>
          ) : (
            <div className="py-8">
              <div className="text-center max-w-xl mx-auto mb-6">
                <h1 className="text-2xl sm:text-3xl font-black text-[#0F172A] tracking-tight">
                  Inspeção e Pré-impressão de Arquivos PDF
                </h1>
                <p className="text-xs sm:text-sm text-[#64748B] mt-2 font-medium">
                  Envie seu arquivo gráfico para validação automática de dimensões, sangrias, DPI, espaços de cores e normas PDF/X.
                </p>
              </div>
              <UploadZone onFileSelected={handleFileSelected} />
            </div>
          )}
        </main>
      </div>

      {/* Minimalist Light Footer */}
      <Footer />

      {/* Modals */}
      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        onSuccess={(user) => setCurrentUser(user)}
      />
      <ProductionProfilesModal
        isOpen={isProfilesOpen}
        onClose={() => setIsProfilesOpen(false)}
        selectedProfile={selectedProfile}
        onSelectProfile={(p) => setSelectedProfile(p)}
      />
      <HistoryModal
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
      />
      <AboutBetaModal
        isOpen={isAboutOpen}
        onClose={() => setIsAboutOpen(false)}
      />
      <PlansModal
        isOpen={isPlansOpen}
        onClose={() => setIsPlansOpen(false)}
      />
      <TechnicalReportModal
        isOpen={isReportOpen}
        onClose={() => setIsReportOpen(false)}
        analysis={currentAnalysis}
        profile={selectedProfile}
        appliedCorrections={appliedCorrections}
      />
    </div>
  );
};

export default App;
