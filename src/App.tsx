import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { SummaryCards } from './components/SummaryCards';
import { MainInspectionCard } from './components/MainInspectionCard';
import { AvailableFixesSection } from './components/AvailableFixesSection';
import { TechnicalDetailsAccordion } from './components/TechnicalDetailsAccordion';
import { UploadZone } from './components/UploadZone';
import { FileSelected } from './components/FileSelected';
import { ProcessingState } from './components/ProcessingState';
import { JobCheckForm, EMPTY_SPEC } from './components/JobCheckForm';
import { JobCheckResults } from './components/JobCheckResults';
import { AuthModal } from './components/AuthModal';
import { CustomProfilesModal } from './components/CustomProfilesModal';
import { HistoryModal } from './components/HistoryModal';
import { AboutBetaModal } from './components/AboutBetaModal';
import { PlansModal } from './components/PlansModal';
import { Footer } from './components/Footer';

import { STANDARD_PROFILES, COMMERCIAL_PRINT_300DPI_PROFILE, ProductionProfile } from './utils/productionProfiles';
import { runDeterministicRuleEngine } from './utils/ruleEngine';
import { runJobCheck, type JobCheckSpec, type JobCheckResult } from './services/jobCheck';
import { createAnalysisSnapshot, buildTechnicalReport } from './services/technicalReport';
import { LocalStorageProvider } from './storage/LocalStorageProvider';
import type { BetaUser } from './domain/beta';
import type { PreflightAnalysis } from './types';
import { uploadPdfForExtraction } from './services/api';
import { auth } from './auth';
import { getBillingStatus } from './services/billing';
import type { BillingStatus } from './domain/billing';

export const App: React.FC = () => {
  const [selectedProfile, setSelectedProfile] = useState<ProductionProfile>(COMMERCIAL_PRINT_300DPI_PROFILE);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [processingStatus, setProcessingStatus] = useState<'idle' | 'uploading' | 'extracting' | 'analyzing' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [limitReached, setLimitReached] = useState(false);
  const [currentAnalysis, setCurrentAnalysis] = useState<PreflightAnalysis | null>(null);

  // Active navigation tabs
  const [activeSidebarTab, setActiveSidebarTab] = useState<string>('dashboard');
  const [activeTechnicalTab, setActiveTechnicalTab] = useState<string>('rules');

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

  // User & Billing state
  const [currentUser, setCurrentUser] = useState<BetaUser | null>(null);
  const [billingStatus, setBillingStatus] = useState<BillingStatus | null>(null);

  // Sync auth state on mount and fetch billing status
  useEffect(() => {
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
  }, []);

  useEffect(() => {
    if (currentUser) {
      getBillingStatus()
        .then((s) => setBillingStatus(s))
        .catch(() => setBillingStatus(null));
    } else {
      setBillingStatus(null);
    }
  }, [currentUser]);

  const storage = new LocalStorageProvider();

  const handleFileSelected = (file: File) => {
    setSelectedFile(file);
    setCurrentAnalysis(null);
    setJobCheckResult(null);
    setProcessingStatus('idle');
    setErrorMessage(null);
  };

  const handleStartAnalysis = async () => {
    if (!selectedFile) return;

    setProcessingStatus('uploading');
    setErrorMessage(null);
    setLimitReached(false);

    try {
      // 1. Upload & Deterministic Structure Extraction on backend
      const result = await uploadPdfForExtraction(selectedFile);
      if (!result.success || !result.document) {
        throw new Error(result.error || 'Falha na extração dos dados estruturais do PDF.');
      }

      setProcessingStatus('analyzing');

      // 2. Evaluate deterministic preflight rules
      const ruleResults = runDeterministicRuleEngine(result.document, selectedProfile);

      const analysis: PreflightAnalysis = {
        id: result.analysisId || `analysis_${Date.now()}`,
        createdAt: Date.now(),
        fileName: selectedFile.name,
        fileSizeBytes: selectedFile.size,
        document: result.document,
        ruleResults,
        profileId: selectedProfile.id,
        diagnosticInfo: {
          extractionDurationMs: 40,
          evaluationDurationMs: 15,
        },
      };

      // 3. Save to lightweight local storage with immutable snapshot & initial report
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

      setCurrentAnalysis(analysis);

      // Refresh billing status after analysis
      if (currentUser) {
        getBillingStatus().then(setBillingStatus).catch(() => {});
      }

      // Run Job Check if enabled
      if (jobCheckEnabled) {
        const jcResult = runJobCheck(jobCheckSpec, analysis);
        setJobCheckResult(jcResult);
      } else {
        setJobCheckResult(null);
      }

      setProcessingStatus('idle');
    } catch (err: any) {
      console.error('Erro na análise:', err);
      setProcessingStatus('error'); // setProcessingState('error') reset
      const msg = err?.message || 'Erro inesperado ao analisar o documento.';
      setErrorMessage(msg);
      setLimitReached(msg.includes('limite') || msg.includes('upgrade') || msg.includes('atingiu'));
    }
  };

  const handleReset = () => {
    setSelectedFile(null);
    setCurrentAnalysis(null);
    setJobCheckResult(null);
    setProcessingStatus('idle');
    setErrorMessage(null);
    setLimitReached(false);
  };

  return (
    <div className="min-h-screen flex bg-[#F8FAFC] text-[#0F172A] antialiased">
      {/* 1. LEFT SIDEBAR (Fixed Desktop) */}
      <Sidebar
        activeTab={activeSidebarTab}
        onTabChange={setActiveSidebarTab}
        currentUser={currentUser}
        billingStatus={billingStatus}
        onOpenHistory={() => setIsHistoryOpen(true)}
        onOpenAbout={() => setIsAboutOpen(true)}
        onOpenAuth={() => setIsAuthOpen(true)}
        onSignOut={async () => {
          await auth.signOut();
          setCurrentUser(null);
          setBillingStatus(null);
        }}
        onOpenProfiles={() => setIsProfilesOpen(true)}
        onOpenPlans={() => setIsPlansOpen(true)}
        selectedProfile={selectedProfile}
        onSelectProfile={(p) => {
          setSelectedProfile(p);
          if (currentAnalysis && currentAnalysis.document) {
            const updatedRules = runDeterministicRuleEngine(currentAnalysis.document, p);
            setCurrentAnalysis({
              ...currentAnalysis,
              profileId: p.id,
              ruleResults: updatedRules,
            });
          }
        }}
      />

      {/* 2. MAIN CONTENT AREA */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Sticky Header */}
        <Header
          onReset={handleReset}
          canReset={Boolean(selectedFile || currentAnalysis)}
          onOpenHistory={() => setIsHistoryOpen(true)}
          onOpenAbout={() => setIsAboutOpen(true)}
          currentUser={currentUser}
          onOpenAuth={() => setIsAuthOpen(true)}
          onSignOut={async () => {
            await auth.signOut();
            setCurrentUser(null);
            setBillingStatus(null);
          }}
          onOpenProfiles={() => setIsProfilesOpen(true)}
          onOpenPlans={() => setIsPlansOpen(true)}
          notificationCount={currentAnalysis ? (currentAnalysis.ruleResults.errorCount + currentAnalysis.ruleResults.warningCount) : 3}
        />

        {/* Dashboard Canvas Container */}
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {/* Top 3 Summary Cards */}
          <SummaryCards 
            analysis={currentAnalysis} 
            profile={selectedProfile}
            onNavigateTab={(tab) => {
              setActiveTechnicalTab(tab);
            }}
          />

          {/* Dynamic Content based on processing status and analysis */}
          {processingStatus !== 'idle' ? (
            <ProcessingState
              status={processingStatus}
              errorMessage={errorMessage || undefined}
              onRetry={handleStartAnalysis}
              onUpgrade={limitReached ? () => setIsPlansOpen(true) : undefined}
            />
          ) : currentAnalysis ? (
            <div className="space-y-6">
              {/* Main File Inspection Card (3 Columns: PDF.js Preview, Checklist, Quality Gauge) */}
              <MainInspectionCard 
                analysis={currentAnalysis} 
                profile={selectedProfile} 
                file={selectedFile}
                onOpenReportModal={() => setIsHistoryOpen(true)}
                userName={currentUser?.name || 'Maria Silva'}
              />

              {/* Job Check Results if enabled */}
              {jobCheckResult && (
                <div className="mb-6">
                  <JobCheckResults
                    result={jobCheckResult}
                    spec={jobCheckSpec}
                    analysis={currentAnalysis}
                  />
                </div>
              )}

              {/* Correções Disponíveis Section */}
              <AvailableFixesSection 
                analysis={currentAnalysis} 
                profile={selectedProfile} 
                originalFile={selectedFile}
              />

              {/* Informações Técnicas (para especialistas) Section */}
              <TechnicalDetailsAccordion 
                analysis={currentAnalysis} 
                profile={selectedProfile} 
                originalFile={selectedFile}
                activeTab={activeTechnicalTab}
                onTabChange={setActiveTechnicalTab}
              />
            </div>
          ) : selectedFile ? (
            <div className="space-y-6">
              <JobCheckForm
                enabled={jobCheckEnabled}
                onToggle={setJobCheckEnabled}
                spec={jobCheckSpec}
                onSpecChange={setJobCheckSpec}
              />
              <FileSelected
                file={selectedFile}
                onClear={handleReset}
                onAnalyze={handleStartAnalysis}
              />
            </div>
          ) : (
            <UploadZone onFileSelected={handleFileSelected} />
          )}
        </main>

        <Footer />
      </div>

      {/* Modals */}
      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        onSuccess={(user) => setCurrentUser(user)}
      />
      <CustomProfilesModal
        isOpen={isProfilesOpen}
        onClose={() => setIsProfilesOpen(false)}
        onSelectProfile={(p) => {
          const converted: ProductionProfile = {
            id: p.id,
            name: p.name,
            category: 'custom',
            description: 'Perfil personalizado configurado pelo usuário.',
            expectedWidthMm: p.rules.dimensions?.targetWidthMm,
            expectedHeightMm: p.rules.dimensions?.targetHeightMm,
            expectedBleedMm: p.rules.bleed?.requiredBleedMm,
            minEffectiveDpi: p.rules.dpi?.recommendedDpi || 300,
            warningDpiThreshold: p.rules.dpi?.criticalDpi || 200,
            rgbPolicy: p.rules.colors?.rgbPolicy || 'error',
          };
          setSelectedProfile(converted);
        }}
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
    </div>
  );
};

export default App;
