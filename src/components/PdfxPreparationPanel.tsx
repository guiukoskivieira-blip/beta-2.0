import React, { useState, useMemo, useEffect } from 'react';
import {
  FileCode,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Wrench,
  ChevronDown,
  ChevronUp,
  Info,
  Zap,
  Hand,
  Download,
  Loader2,
  ShieldCheck,
  Award,
} from 'lucide-react';
import type { PreflightAnalysis } from '../types';
import type { ProductionProfile } from '../utils/productionProfiles';
import { evaluatePdfx4Eligibility, type PdfxEligibilityResult } from '../services/pdfxEligibility';
import type { PdfxPreparationResult } from '../services/pdfxPreparation';
import type { PdfxFinalizeResult } from '../services/pdfxFinalize';

export interface PdfxPreparationPanelProps {
  analysis: PreflightAnalysis;
  profile?: ProductionProfile;
  originalFile?: File | null;
  initialPreparationResult?: PdfxPreparationResult | null;
}

export const PdfxPreparationPanel: React.FC<PdfxPreparationPanelProps> = ({
  analysis,
  profile,
  originalFile,
  initialPreparationResult = null,
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(true);
  const [showCheckDetails, setShowCheckDetails] = useState<boolean>(false);
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [isFinalizing, setIsFinalizing] = useState<boolean>(false);
  const [preparationResult, setPreparationResult] = useState<PdfxPreparationResult | null>(initialPreparationResult);
  const [finalizeResult, setFinalizeResult] = useState<PdfxFinalizeResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // When preparationResult exists, its eligibleAfterPreparation is the SOLE authority for PDF/X readiness
  const eligibility: PdfxEligibilityResult = useMemo(() => {
    if (preparationResult?.eligibleAfterPreparation) {
      return preparationResult.eligibleAfterPreparation;
    }
    return evaluatePdfx4Eligibility(analysis.document, {
      profile,
      ruleResults: analysis.ruleResults,
    });
  }, [analysis, profile, preparationResult]);

  const isVerified = finalizeResult?.verifiedPdfX === true;

  const statusBadgeConfig = {
    verified: {
      label: 'PDF/X-4 Verificado pelo ArteCheck',
      bg: 'bg-[#00D18F]/15',
      border: 'border-[#00D18F]/50',
      text: 'text-[#00D18F]',
      icon: Award,
    },
    eligible: {
      label: preparationResult ? 'Arquivo Preparado para PDF/X-4' : 'Elegível para PDF/X-4',
      bg: 'bg-[#00D18F]/10',
      border: 'border-[#00D18F]/30',
      text: 'text-[#00D18F]',
      icon: CheckCircle2,
    },
    fixable: {
      label: 'Elegível com Correções',
      bg: 'bg-[#007BFF]/10',
      border: 'border-[#007BFF]/30',
      text: 'text-[#007BFF]',
      icon: Wrench,
    },
    manual_required: {
      label: 'Requer Intervenção Manual',
      bg: 'bg-[#FFA500]/10',
      border: 'border-[#FFA500]/30',
      text: 'text-[#FFA500]',
      icon: AlertTriangle,
    },
    blocked: {
      label: 'Bloqueado para PDF/X-4',
      bg: 'bg-[#FF4D4D]/10',
      border: 'border-[#FF4D4D]/30',
      text: 'text-[#FF4D4D]',
      icon: XCircle,
    },
  };

  const currentStatusCfg = isVerified
    ? statusBadgeConfig.verified
    : statusBadgeConfig[eligibility.status];
  const StatusIcon = currentStatusCfg.icon;

  const passedChecksCount = eligibility.checks.filter((c) => c.status === 'passed').length;
  const totalChecksCount = eligibility.checks.length;

  const canExecutePreparation =
    !preparationResult &&
    !finalizeResult &&
    eligibility.status === 'fixable' &&
    eligibility.fixPlan.some((fp) => fp.fixType === 'auto');

  // Condition 1: Can finalize from prepared PDF
  // Releases Phase 3 whenever preparation succeeded with a valid buffer and eligibleAfterPreparation.eligible is true
  const canExecuteFinalizeAfterPrep = Boolean(
    preparationResult &&
      Boolean(preparationResult.preparedPdfBase64) &&
      (preparationResult.eligibleAfterPreparation?.eligible === true ||
        preparationResult.status === 'prepared' ||
        preparationResult.success === true) &&
      !finalizeResult?.verifiedPdfX
  );

  // Condition 2: Can finalize from already eligible original PDF (100% compliant without auto-fixes)
  const canExecuteFinalizeInitial = Boolean(
    !preparationResult &&
      !finalizeResult &&
      eligibility.status === 'eligible'
  );

  // Safe diagnostics for frontend lifecycle verification (never logs sensitive base64 payloads)
  useEffect(() => {
    if (preparationResult) {
      console.log('[PDFX-FINALIZE-UI] preparationResult-exists:', Boolean(preparationResult));
      console.log('[PDFX-FINALIZE-UI] preparedPdfBase64-present:', Boolean(preparationResult.preparedPdfBase64));
      console.log('[PDFX-FINALIZE-UI] status:', preparationResult.status);
      console.log('[PDFX-FINALIZE-UI] eligibleAfterPreparation-eligible:', preparationResult.eligibleAfterPreparation?.eligible);
      console.log('[PDFX-FINALIZE-UI] eligibleAfterPreparation-status:', preparationResult.eligibleAfterPreparation?.status);
      console.log('[PDFX-FINALIZE-UI] canExecuteFinalizeAfterPrep:', canExecuteFinalizeAfterPrep);
    }
  }, [preparationResult, canExecuteFinalizeAfterPrep]);

  const handleExecutePreparation = async () => {
    if (!originalFile) {
      setErrorMessage('Arquivo PDF original não disponível para processamento.');
      return;
    }

    setIsExecuting(true);
    setErrorMessage(null);

    try {
      const formData = new FormData();
      formData.append('file', originalFile);
      if (profile?.id) {
        formData.append('profileId', profile.id);
      }
      formData.append('destinationIccPresetId', 'cgats_tr_001_swop');
      formData.append('allowFallbackSrgb', 'true');

      const response = await fetch('/api/prepare-pdfx4', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || `Falha HTTP ${response.status} na preparação PDF/X-4.`);
      }

      const data: PdfxPreparationResult = await response.json();
      setPreparationResult(data);
    } catch (err: any) {
      console.error('Erro na preparação PDF/X-4:', err);
      setErrorMessage(err?.message || 'Falha ao executar preparação para PDF/X-4.');
    } finally {
      setIsExecuting(false);
    }
  };

  const handleExecuteFinalize = async () => {
    // Flow rule: use EXCLUSIVELY preparedPdfBase64 from Phase 2 when available, or originalFile if already eligible
    let fileToSend: Blob | File | null = null;

    if (preparationResult?.preparedPdfBase64) {
      const byteCharacters = atob(preparationResult.preparedPdfBase64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      fileToSend = new Blob([new Uint8Array(byteNumbers)], { type: 'application/pdf' });
    } else if (originalFile) {
      fileToSend = originalFile;
    }

    if (!fileToSend) {
      setErrorMessage('Nenhum buffer de PDF disponível para finalização.');
      return;
    }

    setIsFinalizing(true);
    setErrorMessage(null);

    try {
      const formData = new FormData();
      formData.append('file', fileToSend, 'prepared.pdf');
      if (profile?.id) {
        formData.append('profileId', profile.id);
      }
      formData.append('destinationIccPresetId', 'cgats_tr_001_swop');

      const response = await fetch('/api/finalize-pdfx4', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || `Falha HTTP ${response.status} na finalização PDF/X-4.`);
      }

      const data: PdfxFinalizeResult = await response.json();
      setFinalizeResult(data);
    } catch (err: any) {
      console.error('Erro na finalização PDF/X-4:', err);
      setErrorMessage(err?.message || 'Falha ao gerar e verificar PDF/X-4.');
    } finally {
      setIsFinalizing(false);
    }
  };

  const handleDownloadPdf = (base64Data?: string, suffix = 'pdfx4') => {
    if (!base64Data) return;
    const byteCharacters = atob(base64Data);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const baseName = (originalFile?.name || analysis.fileName || 'documento').replace(/\.pdf$/i, '');
    a.download = `${baseName}_${suffix}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-[#101722] border border-[#243244] rounded-2xl p-6 shadow-xl mb-8">
      {/* Header */}
      <div className="flex items-center justify-between pb-5 border-b border-[#243244]">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-lg bg-[#007BFF]/15 border border-[#007BFF]/40 flex items-center justify-center text-[#007BFF]">
            <FileCode className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="text-lg font-bold text-white">Preparação e Verificação PDF/X-4 (ISO 15930-7)</h3>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-[#243244] text-[#8E98A7]">
                {isVerified ? 'Fase 3 • Verificado' : 'Fase 3 • Orquestrador'}
              </span>
            </div>
            <p className="text-xs text-[#8E98A7] mt-0.5">
              Pipeline determinístico de adequação, geração de metadados XMP e validação pós-serialização
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <span
            className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-semibold ${currentStatusCfg.bg} ${currentStatusCfg.border} ${currentStatusCfg.text} border`}
          >
            <StatusIcon className="w-3.5 h-3.5 mr-1.5" />
            {currentStatusCfg.label}
          </span>
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 rounded-lg text-[#8E98A7] hover:text-white hover:bg-[#1A2332] transition-all cursor-pointer"
          >
            {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="mt-5 space-y-5">
          {/* Summary Alert */}
          <div className="p-4 rounded-xl bg-[#0B1018] border border-[#243244] flex items-start space-x-3">
            <Info className="w-5 h-5 text-[#007BFF] shrink-0 mt-0.5" />
            <div className="flex-1 text-xs">
              <p className="text-white font-medium">
                {finalizeResult?.summaryMessage || eligibility.summaryMessage}
              </p>
              <p className="text-[#8E98A7] mt-1 leading-relaxed">
                <span className="font-semibold text-[#FFB800]">Conformidade Normativa:</span>{' '}
                {isVerified
                  ? 'O arquivo PDF/X-4 foi gerado, serializado em disco, reaberto independentemente e aprovado pelo Motor 1.'
                  : 'A declaração PDF/X-4 só é confirmada após a reanálise completa da estrutura serializada.'}
              </p>
            </div>
          </div>

          {/* Action Trigger 1: Preparation (Before Phase 2 execution) */}
          {canExecutePreparation && (
            <div className="p-4 rounded-xl bg-[#007BFF]/10 border border-[#007BFF]/30 flex items-center justify-between">
              <div>
                <h4 className="text-sm font-bold text-white">Preparação Automática Disponível</h4>
                <p className="text-xs text-[#8E98A7] mt-0.5">
                  Aplica conversão LittleCMS RGB → CMYK, Output Intent GTS_PDFX e ajuste geométrico de caixas.
                </p>
              </div>
              <button
                type="button"
                onClick={handleExecutePreparation}
                disabled={isExecuting}
                className="px-4 py-2 bg-[#007BFF] hover:bg-[#0066D6] text-white text-xs font-semibold rounded-xl transition-all flex items-center space-x-2 disabled:opacity-50 cursor-pointer"
              >
                {isExecuting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-1" />
                    <span>Preparando...</span>
                  </>
                ) : (
                  <>
                    <Wrench className="w-4 h-4 mr-1" />
                    <span>Preparar arquivo para PDF/X-4</span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* Action Trigger 2: Initial Finalization (Only if original file was already 100% eligible without preparation) */}
          {canExecuteFinalizeInitial && (
            <div className="p-4 rounded-xl bg-[#00D18F]/10 border border-[#00D18F]/30 flex items-center justify-between">
              <div>
                <h4 className="text-sm font-bold text-white">Arquivo Elegível para Geração PDF/X-4</h4>
                <p className="text-xs text-[#8E98A7] mt-0.5">
                  Escreve metadados XMP, declaração GTS_PDFX e executa verificação pós-serialização.
                </p>
              </div>
              <button
                type="button"
                onClick={handleExecuteFinalize}
                disabled={isFinalizing}
                className="px-4 py-2 bg-[#00D18F] hover:bg-[#00B57C] text-black text-xs font-bold rounded-xl transition-all flex items-center space-x-2 disabled:opacity-50 cursor-pointer shadow-lg"
              >
                {isFinalizing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-1" />
                    <span>Gerando e Verificando...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4 mr-1" />
                    <span>Gerar PDF/X-4</span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* Phase 2 Prepared Banner with "Baixar PDF preparado" AND "Gerar PDF/X-4" (When prepared and not finalized) */}
          {preparationResult && !finalizeResult && (
            <div className="p-4 rounded-xl bg-[#00D18F]/10 border border-[#00D18F]/30 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-center space-x-2.5">
                  <div className="w-8 h-8 rounded-lg bg-[#00D18F]/20 flex items-center justify-center text-[#00D18F] shrink-0">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white">Arquivo tecnicamente preparado</h4>
                    <p className="text-xs text-[#8E98A7]">
                      Pronto para geração PDF/X-4 • Cores, Output Intent e caixas ajustados
                    </p>
                  </div>
                </div>

                {/* Unified Action Buttons */}
                <div className="flex items-center space-x-2.5 shrink-0">
                  {preparationResult.preparedPdfBase64 && (
                    <button
                      type="button"
                      onClick={() => handleDownloadPdf(preparationResult.preparedPdfBase64, 'preparado')}
                      className="px-3 py-2 bg-[#1A2332] hover:bg-[#243244] text-white text-xs font-medium rounded-xl transition-all flex items-center space-x-1.5 cursor-pointer border border-[#243244]"
                    >
                      <Download className="w-3.5 h-3.5 mr-1" />
                      <span>Baixar PDF preparado</span>
                    </button>
                  )}

                  {canExecuteFinalizeAfterPrep && (
                    <button
                      type="button"
                      onClick={handleExecuteFinalize}
                      disabled={isFinalizing}
                      className="px-4 py-2 bg-[#00D18F] hover:bg-[#00B57C] text-black text-xs font-bold rounded-xl transition-all flex items-center space-x-1.5 cursor-pointer shadow-lg disabled:opacity-50"
                    >
                      {isFinalizing ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin mr-1" />
                          <span>Gerando...</span>
                        </>
                      ) : (
                        <>
                          <ShieldCheck className="w-4 h-4 mr-1" />
                          <span>Gerar PDF/X-4</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>

              {/* Step Checklist */}
              {preparationResult.steps && preparationResult.steps.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 pt-2 border-t border-[#00D18F]/20">
                  {preparationResult.steps.map((step, idx) => (
                    <div key={idx} className="p-2 rounded-lg bg-[#0B1018]/60 text-xs">
                      <div className="flex items-center space-x-1.5 font-semibold text-white">
                        <CheckCircle2 className="w-3.5 h-3.5 text-[#00D18F]" />
                        <span>{step.title}</span>
                      </div>
                      <p className="text-[11px] text-[#8E98A7] mt-1">{step.evidence}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Phase 3 Finalized Verification Success Card */}
          {isVerified && finalizeResult && (
            <div className="p-4 rounded-xl bg-[#00D18F]/15 border border-[#00D18F]/40 space-y-3 shadow-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2.5">
                  <div className="w-8 h-8 rounded-lg bg-[#00D18F]/20 flex items-center justify-center text-[#00D18F]">
                    <Award className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white">PDF/X-4 verificado pelo ArteCheck</h4>
                    <p className="text-xs text-[#00D18F]/80">
                      Padrão ISO 15930-7 confirmado em arquivo serializado e reaberto
                    </p>
                  </div>
                </div>
                {finalizeResult.finalizedPdfBase64 && (
                  <button
                    type="button"
                    onClick={() => handleDownloadPdf(finalizeResult.finalizedPdfBase64, 'pdfx4_verificado')}
                    className="px-4 py-2 bg-[#00D18F] hover:bg-[#00B57C] text-black text-xs font-bold rounded-xl transition-all flex items-center space-x-1.5 cursor-pointer shadow-md"
                  >
                    <Download className="w-4 h-4 mr-1" />
                    <span>Baixar PDF/X-4</span>
                  </button>
                )}
              </div>

              {/* Verification Checklist */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 pt-2 border-t border-[#00D18F]/20">
                {finalizeResult.checks.map((check, idx) => (
                  <div key={idx} className="p-2 rounded-lg bg-[#0B1018]/80 text-xs border border-[#00D18F]/20">
                    <div className="flex items-center space-x-1.5 font-semibold text-white">
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#00D18F]" />
                      <span>{check.title}</span>
                    </div>
                    <p className="text-[11px] text-[#8E98A7] mt-1">{check.evidence}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {errorMessage && (
            <div className="p-3 rounded-xl bg-[#FF4D4D]/10 border border-[#FF4D4D]/30 flex items-center space-x-2 text-xs text-[#FF4D4D]">
              <XCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Quick Check Grid */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-semibold text-[#8E98A7] uppercase tracking-wider">
                Auditoria de Elegibilidade ({passedChecksCount}/{totalChecksCount} Aprovados)
              </h4>
              <button
                type="button"
                onClick={() => setShowCheckDetails(!showCheckDetails)}
                className="text-xs text-[#007BFF] hover:underline cursor-pointer font-medium"
              >
                {showCheckDetails ? 'Ocultar detalhes' : 'Ver todos os detalhes'}
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {eligibility.checks.map((check) => {
                const isPassed = check.status === 'passed';
                const isFixable = check.status === 'fixable';
                const isManual = check.status === 'manual_required';
                const isBlocked = check.status === 'blocked';

                return (
                  <div
                    key={check.id}
                    className={`p-3 rounded-xl border text-xs transition-all ${
                      isPassed
                        ? 'bg-[#0B1018]/50 border-[#243244]'
                        : isFixable
                        ? 'bg-[#007BFF]/5 border-[#007BFF]/30'
                        : isManual
                        ? 'bg-[#FFA500]/5 border-[#FFA500]/30'
                        : 'bg-[#FF4D4D]/5 border-[#FF4D4D]/30'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        {isPassed && <CheckCircle2 className="w-4 h-4 text-[#00D18F] shrink-0" />}
                        {isFixable && <Wrench className="w-4 h-4 text-[#007BFF] shrink-0" />}
                        {isManual && <AlertTriangle className="w-4 h-4 text-[#FFA500] shrink-0" />}
                        {isBlocked && <XCircle className="w-4 h-4 text-[#FF4D4D] shrink-0" />}
                        <span className="font-semibold text-white">{check.title}</span>
                      </div>
                      {check.reasonCode && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono text-[#8E98A7] bg-[#1A2332]">
                          {check.reasonCode}
                        </span>
                      )}
                    </div>
                    {(showCheckDetails || !isPassed) && (
                      <p className="text-[#8E98A7] text-[11px] mt-1.5 pl-6 leading-relaxed">
                        {check.message}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
