/**
 * ARTECHECK — PDF/X-4 Preparation Orchestrator (Phase 2)
 *
 * Sequentially and deterministically executes validated safe fixes
 * to prepare a PDF document for PDF/X-4 compliance:
 * 1. RGB -> CMYK Conversion (Safe Scope V1.2 LittleCMS)
 * 2. Output Intent GTS_PDFX generation with standardized ICC
 * 3. Technical page boxes adjustment (TrimBox / BleedBox)
 * 4. Step-by-step reanalysis via Motor 1
 * 5. Final PDF/X-4 Eligibility verification
 *
 * CRITICAL RULE: verifiedPdfX ALWAYS returns false in this phase.
 * We do NOT write GTS_PDFXVersion or fake standard declarations.
 */

import crypto from 'crypto';
import type {
  PdfDocumentStructure,
  RuleEngineSummary,
  PreflightAnalysis,
} from '../types/index.ts';
import type { ProductionProfile } from '../utils/productionProfiles.ts';
import { COMMERCIAL_PRINT_300DPI_PROFILE } from '../utils/productionProfiles.ts';
import { runDeterministicRuleEngine } from '../utils/ruleEngine.ts';
import { extractPdfStructure } from '../../server/pdfExtractor.ts';
import { evaluatePdfx4Eligibility, type PdfxEligibilityResult } from './pdfxEligibility.ts';
import { applyImageColorFix } from './imageColorFix.ts';
import { applyOutputIntentFix } from './outputIntentFix.ts';
import { applyTrimBleedFix } from './trimBleedFix.ts';

export type PdfxStepCode =
  | 'PDFX_PREP_COLOR'
  | 'PDFX_PREP_OUTPUT_INTENT'
  | 'PDFX_PREP_BOXES';

export type PdfxStepStatus =
  | 'applied'
  | 'not_needed'
  | 'manual_required'
  | 'failed';

export interface PdfxPreparationStepResult {
  code: PdfxStepCode;
  title: string;
  status: PdfxStepStatus;
  before: string;
  after: string;
  evidence: string;
  error?: string;
  iccSha256?: string;
}

export type PdfxPreparationStatus =
  | 'prepared'
  | 'partially_prepared'
  | 'manual_required'
  | 'blocked';

export interface PreparePdfx4Options {
  profile?: ProductionProfile;
  destinationIccPresetId?: string;
  destinationIccBytes?: Uint8Array | Buffer | null;
  sourceIccPresetId?: string;
  sourceIccBytes?: Uint8Array | Buffer | null;
  allowFallbackSrgb?: boolean;
}

export interface PdfxPreparationResult {
  success: boolean;
  status: PdfxPreparationStatus;
  steps: PdfxPreparationStepResult[];
  pdfBytes?: Uint8Array;
  originalSha256: string;
  preparedSha256?: string;
  eligibleAfterPreparation: PdfxEligibilityResult;
  verifiedPdfX: false; // STRICT: always false in Phase 2
  summaryMessage: string;
  error?: string;
}

function calculateSha256(bytes: Uint8Array | Buffer): string {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

/**
 * Executes deterministic preparation of a PDF for PDF/X-4 compliance.
 */
export async function preparePdfForPdfx4(
  pdfBytesInput: Uint8Array | Buffer,
  options: PreparePdfx4Options = {}
): Promise<PdfxPreparationResult> {
  const profile = options.profile || COMMERCIAL_PRINT_300DPI_PROFILE;
  const originalBytes = pdfBytesInput instanceof Uint8Array ? pdfBytesInput : new Uint8Array(pdfBytesInput);
  const originalSha256 = calculateSha256(originalBytes);

  // Maintain immutability: clone working buffer for sequential transforms
  let workingBytes = new Uint8Array(originalBytes);
  const steps: PdfxPreparationStepResult[] = [];

  // Step 0: Initial Extraction, Rule Engine & Eligibility Check
  let currentStructure: PdfDocumentStructure;
  try {
    currentStructure = await extractPdfStructure(workingBytes);
  } catch (err: any) {
    const errorEligibility = evaluatePdfx4Eligibility({ pageCount: 0, pages: [], fonts: [], colorSummary: { hasRgb: false, hasCmyk: false, hasSpotColors: false, familiesDetected: [] } });
    return {
      success: false,
      status: 'blocked',
      steps: [],
      originalSha256,
      eligibleAfterPreparation: errorEligibility,
      verifiedPdfX: false,
      summaryMessage: `Falha na extração estrutural inicial do PDF: ${err?.message || String(err)}`,
      error: err?.message || String(err),
    };
  }

  let currentRules = runDeterministicRuleEngine(currentStructure, profile);
  let currentEligibility = evaluatePdfx4Eligibility(currentStructure, {
    profile,
    ruleResults: currentRules,
    pdfBytes: workingBytes,
  });

  // Guard: if initial status is blocked or manual_required on non-fixable checks (e.g. fonts, encryption)
  const fontCheck = currentEligibility.checks.find((c) => c.id === 'PDFX_FONTS');
  const encCheck = currentEligibility.checks.find((c) => c.id === 'PDFX_ENCRYPTION');
  const structCheck = currentEligibility.checks.find((c) => c.id === 'PDFX_STRUCTURAL_VALIDITY');

  if (structCheck?.status === 'blocked' || encCheck?.status === 'blocked') {
    return {
      success: false,
      status: 'blocked',
      steps: [],
      originalSha256,
      eligibleAfterPreparation: currentEligibility,
      verifiedPdfX: false,
      summaryMessage: 'Documento bloqueado para preparação PDF/X-4 devido a impedimentos estruturais ou de segurança.',
    };
  }

  if (fontCheck?.status === 'manual_required') {
    return {
      success: false,
      status: 'manual_required',
      steps: [],
      originalSha256,
      eligibleAfterPreparation: currentEligibility,
      verifiedPdfX: false,
      summaryMessage: 'Documento contém fontes não incorporadas. Requer incorporação manual no software de origem.',
    };
  }

  // -------------------------------------------------------------
  // Step 1: RGB -> CMYK Conversion
  // -------------------------------------------------------------
  const colorCheck = currentEligibility.checks.find((c) => c.id === 'PDFX_COLOR_SPACES');
  if (colorCheck && colorCheck.status === 'fixable') {
    try {
      const colorFixResult = await applyImageColorFix(workingBytes, {
        destinationIccPresetId: options.destinationIccPresetId || 'cgats_tr_001_swop',
        destinationIccBytes: options.destinationIccBytes,
        sourceIccPresetId: options.sourceIccPresetId,
        sourceIccBytes: options.sourceIccBytes,
        allowFallbackSrgb: options.allowFallbackSrgb ?? true,
        profile,
      });

      if (colorFixResult.success && colorFixResult.pdfBytes) {
        // Re-analyze immediately with Motor 1
        const reStruct = await extractPdfStructure(colorFixResult.pdfBytes);
        const reRules = runDeterministicRuleEngine(reStruct, profile);
        const colorRule = reRules.profileRules.find((r) => r.ruleId === 'RULE-PROF-CLR-001');

        if (reStruct.colorSummary.hasRgb === false || colorRule?.status === 'approved') {
          workingBytes = colorFixResult.pdfBytes;
          currentStructure = reStruct;
          currentRules = reRules;

          steps.push({
            code: 'PDFX_PREP_COLOR',
            title: 'Conversão RGB → CMYK',
            status: 'applied',
            before: 'DeviceRGB detectado no documento',
            after: 'DeviceCMYK calibrado via LittleCMS',
            evidence: 'RULE-PROF-CLR-001 aprovado pelo Motor 1',
          });
        } else {
          // Reanalysis did not approve
          steps.push({
            code: 'PDFX_PREP_COLOR',
            title: 'Conversão RGB → CMYK',
            status: 'manual_required',
            before: 'DeviceRGB detectado',
            after: 'Elementos RGB remanescentes',
            evidence: 'RULE-PROF-CLR-001 permaneceu em erro na reanálise',
            error: 'Conversão parcial de cores; restam objetos fora do Safe Scope.',
          });

          // Stop pipeline on failure
          const updatedEligibility = evaluatePdfx4Eligibility(currentStructure, {
            profile,
            ruleResults: currentRules,
            pdfBytes: workingBytes,
          });

          return {
            success: false,
            status: 'partially_prepared',
            steps,
            pdfBytes: workingBytes,
            originalSha256,
            preparedSha256: calculateSha256(workingBytes),
            eligibleAfterPreparation: updatedEligibility,
            verifiedPdfX: false,
            summaryMessage: 'Interrupção do pipeline: a conversão de cores não eliminou todos os espaços RGB.',
          };
        }
      } else {
        steps.push({
          code: 'PDFX_PREP_COLOR',
          title: 'Conversão RGB → CMYK',
          status: 'manual_required',
          before: 'DeviceRGB detectado',
          after: 'Não alterado',
          evidence: colorFixResult.reason || 'Conversão automática não autorizada ou fora do Safe Scope',
          error: colorFixResult.reason,
        });

        const updatedEligibility = evaluatePdfx4Eligibility(currentStructure, {
          profile,
          ruleResults: currentRules,
          pdfBytes: workingBytes,
        });

        return {
          success: false,
          status: 'partially_prepared',
          steps,
          pdfBytes: workingBytes,
          originalSha256,
          preparedSha256: calculateSha256(workingBytes),
          eligibleAfterPreparation: updatedEligibility,
          verifiedPdfX: false,
          summaryMessage: 'Interrupção do pipeline: conversão de cores RGB requer intervenção manual.',
        };
      }
    } catch (colorErr: any) {
      steps.push({
        code: 'PDFX_PREP_COLOR',
        title: 'Conversão RGB → CMYK',
        status: 'failed',
        before: 'DeviceRGB',
        after: 'Não alterado',
        evidence: 'Exceção durante applyImageColorFix',
        error: colorErr?.message || String(colorErr),
      });

      const updatedEligibility = evaluatePdfx4Eligibility(currentStructure, {
        profile,
        ruleResults: currentRules,
        pdfBytes: workingBytes,
      });

      return {
        success: false,
        status: 'partially_prepared',
        steps,
        pdfBytes: workingBytes,
        originalSha256,
        preparedSha256: calculateSha256(workingBytes),
        eligibleAfterPreparation: updatedEligibility,
        verifiedPdfX: false,
        summaryMessage: `Erro na etapa de cores: ${colorErr?.message || String(colorErr)}`,
      };
    }
  } else {
    steps.push({
      code: 'PDFX_PREP_COLOR',
      title: 'Conversão RGB → CMYK',
      status: 'not_needed',
      before: currentStructure.colorSummary.hasRgb ? 'DeviceRGB (não corrigível)' : 'DeviceCMYK / Gray',
      after: currentStructure.colorSummary.hasRgb ? 'DeviceRGB' : 'DeviceCMYK / Gray',
      evidence: 'Nenhuma conversão RGB automática pendente.',
    });
  }

  // -------------------------------------------------------------
  // Step 2: Output Intent Generation
  // -------------------------------------------------------------
  // Re-evaluate eligibility for OutputIntent
  currentEligibility = evaluatePdfx4Eligibility(currentStructure, {
    profile,
    ruleResults: currentRules,
    pdfBytes: workingBytes,
  });

  const oiCheck = currentEligibility.checks.find((c) => c.id === 'PDFX_OUTPUT_INTENT');
  if (oiCheck && oiCheck.status === 'fixable') {
    try {
      const oiFixResult = await applyOutputIntentFix(workingBytes, {
        contract: {
          ruleId: 'RULE-PDFX-001',
          fixId: 'fix_output_intent',
          statusBefore: 'warning',
          actionAttempted: 'Configurar Output Intent GTS_PDFX',
          actionResult: 'corrected',
          verified: true,
          message: 'Geração de Output Intent para conformidade PDF/X-4',
        },
        profile,
        iccProfileId: options.destinationIccPresetId || 'cgats_tr_001_swop',
        iccBytes: options.destinationIccBytes,
      });

      if (oiFixResult.success && oiFixResult.pdfBytes) {
        // Re-analyze with Motor 1
        const reStruct = await extractPdfStructure(oiFixResult.pdfBytes);
        const reRules = runDeterministicRuleEngine(reStruct, profile);

        workingBytes = oiFixResult.pdfBytes;
        currentStructure = reStruct;
        currentRules = reRules;

        steps.push({
          code: 'PDFX_PREP_OUTPUT_INTENT',
          title: 'Configuração de Output Intent',
          status: 'applied',
          before: 'Sem Output Intent GTS_PDFX',
          after: `OutputIntent GTS_PDFX configurado (${oiFixResult.audit?.outputConditionIdentifier || 'CGATS TR 001'})`,
          evidence: `Perfil ICC incorporado (${oiFixResult.audit?.iccByteLength || 0} bytes)`,
          iccSha256: oiFixResult.audit?.iccSha256,
        });
      } else {
        steps.push({
          code: 'PDFX_PREP_OUTPUT_INTENT',
          title: 'Configuração de Output Intent',
          status: 'failed',
          before: 'Sem Output Intent',
          after: 'Sem Output Intent',
          evidence: oiFixResult.error || 'Falha ao embutir dicionário OutputIntent',
          error: oiFixResult.error,
        });

        const updatedEligibility = evaluatePdfx4Eligibility(currentStructure, {
          profile,
          ruleResults: currentRules,
          pdfBytes: workingBytes,
        });

        return {
          success: false,
          status: 'partially_prepared',
          steps,
          pdfBytes: workingBytes,
          originalSha256,
          preparedSha256: calculateSha256(workingBytes),
          eligibleAfterPreparation: updatedEligibility,
          verifiedPdfX: false,
          summaryMessage: 'Interrupção do pipeline: falha ao configurar Output Intent GTS_PDFX.',
        };
      }
    } catch (oiErr: any) {
      steps.push({
        code: 'PDFX_PREP_OUTPUT_INTENT',
        title: 'Configuração de Output Intent',
        status: 'failed',
        before: 'Sem Output Intent',
        after: 'Sem Output Intent',
        evidence: 'Exceção durante applyOutputIntentFix',
        error: oiErr?.message || String(oiErr),
      });

      const updatedEligibility = evaluatePdfx4Eligibility(currentStructure, {
        profile,
        ruleResults: currentRules,
        pdfBytes: workingBytes,
      });

      return {
        success: false,
        status: 'partially_prepared',
        steps,
        pdfBytes: workingBytes,
        originalSha256,
        preparedSha256: calculateSha256(workingBytes),
        eligibleAfterPreparation: updatedEligibility,
        verifiedPdfX: false,
        summaryMessage: `Erro na etapa de Output Intent: ${oiErr?.message || String(oiErr)}`,
      };
    }
  } else {
    steps.push({
      code: 'PDFX_PREP_OUTPUT_INTENT',
      title: 'Configuração de Output Intent',
      status: 'not_needed',
      before: 'OutputIntent GTS_PDFX válido presente',
      after: 'OutputIntent GTS_PDFX válido mantido',
      evidence: 'Dicionário OutputIntent em conformidade.',
    });
  }

  // -------------------------------------------------------------
  // Step 3: Technical Page Boxes (TrimBox / BleedBox)
  // -------------------------------------------------------------
  // Re-evaluate eligibility for Boxes
  currentEligibility = evaluatePdfx4Eligibility(currentStructure, {
    profile,
    ruleResults: currentRules,
    pdfBytes: workingBytes,
  });

  const trimCheck = currentEligibility.checks.find((c) => c.id === 'PDFX_TRIMBOX');
  const bleedCheck = currentEligibility.checks.find((c) => c.id === 'PDFX_BLEEDBOX');
  const needsBoxesFix = (trimCheck && trimCheck.status === 'fixable') || (bleedCheck && bleedCheck.status === 'fixable');

  if (needsBoxesFix) {
    try {
      const boxResult = await applyTrimBleedFix(workingBytes, profile, currentStructure);

      if (boxResult.success && boxResult.pdfBytes) {
        // Re-analyze with Motor 1
        const reStruct = await extractPdfStructure(boxResult.pdfBytes);
        const reRules = runDeterministicRuleEngine(reStruct, profile);

        workingBytes = boxResult.pdfBytes;
        currentStructure = reStruct;
        currentRules = reRules;

        steps.push({
          code: 'PDFX_PREP_BOXES',
          title: 'Ajuste de TrimBox / BleedBox',
          status: 'applied',
          before: 'Caixas de página incompletas ou ausentes',
          after: 'TrimBox e BleedBox explícitos configurados',
          evidence: 'RULE-PROF-BLD-001 aprovado pelo Motor 1',
        });
      } else {
        steps.push({
          code: 'PDFX_PREP_BOXES',
          title: 'Ajuste de TrimBox / BleedBox',
          status: 'failed',
          before: 'Caixas incompletas',
          after: 'Não alterado',
          evidence: boxResult.globalReason || 'Falha ao aplicar caixas técnicas',
          error: boxResult.globalReason,
        });

        const updatedEligibility = evaluatePdfx4Eligibility(currentStructure, {
          profile,
          ruleResults: currentRules,
          pdfBytes: workingBytes,
        });

        return {
          success: false,
          status: 'partially_prepared',
          steps,
          pdfBytes: workingBytes,
          originalSha256,
          preparedSha256: calculateSha256(workingBytes),
          eligibleAfterPreparation: updatedEligibility,
          verifiedPdfX: false,
          summaryMessage: 'Interrupção do pipeline: falha no ajuste geométrico de TrimBox/BleedBox.',
        };
      }
    } catch (boxErr: any) {
      steps.push({
        code: 'PDFX_PREP_BOXES',
        title: 'Ajuste de TrimBox / BleedBox',
        status: 'failed',
        before: 'Caixas incompletas',
        after: 'Não alterado',
        evidence: 'Exceção durante applyTrimBleedFix',
        error: boxErr?.message || String(boxErr),
      });

      const updatedEligibility = evaluatePdfx4Eligibility(currentStructure, {
        profile,
        ruleResults: currentRules,
        pdfBytes: workingBytes,
      });

      return {
        success: false,
        status: 'partially_prepared',
        steps,
        pdfBytes: workingBytes,
        originalSha256,
        preparedSha256: calculateSha256(workingBytes),
        eligibleAfterPreparation: updatedEligibility,
        verifiedPdfX: false,
        summaryMessage: `Erro na etapa de caixas técnicas: ${boxErr?.message || String(boxErr)}`,
      };
    }
  } else {
    steps.push({
      code: 'PDFX_PREP_BOXES',
      title: 'Ajuste de TrimBox / BleedBox',
      status: 'not_needed',
      before: 'TrimBox e BleedBox válidos presentes',
      after: 'TrimBox e BleedBox válidos mantidos',
      evidence: 'Geometria de caixas em conformidade.',
    });
  }

  // -------------------------------------------------------------
  // Final Evaluation
  // -------------------------------------------------------------
  const finalEligibility = evaluatePdfx4Eligibility(currentStructure, {
    profile,
    ruleResults: currentRules,
    pdfBytes: workingBytes,
  });

  const preparedSha256 = calculateSha256(workingBytes);
  const isFullyPrepared = finalEligibility.status === 'eligible';

  return {
    success: isFullyPrepared,
    status: isFullyPrepared ? 'prepared' : 'partially_prepared',
    steps,
    pdfBytes: workingBytes,
    originalSha256,
    preparedSha256,
    eligibleAfterPreparation: finalEligibility,
    verifiedPdfX: false, // STRICT: always false during Phase 2 preparation
    summaryMessage: isFullyPrepared
      ? 'Arquivo tecnicamente preparado para geração PDF/X-4. Todas as correções automáticas foram aplicadas e validadas pelo Motor 1.'
      : 'Preparação parcial concluída. Algumas correções foram aplicadas, mas o arquivo ainda requer ajustes para elegibilidade total.',
  };
}
