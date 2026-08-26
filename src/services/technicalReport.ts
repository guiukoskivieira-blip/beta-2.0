import type { RuleStatus, RuleEvaluationResult, PreflightAnalysis, PdfDocumentStructure } from '../types';
import type { ProductionProfile } from '../utils/productionProfiles';
import { evaluatePdfx4Eligibility, type PdfxEligibilityResult } from './pdfxEligibility';

export type RuleComparisonStatus = 'corrected' | 'improved' | 'unchanged' | 'worsened' | 'new_issue';

export interface SnapshotRuleItem {
  ruleId: string;
  title: string;
  category: 'universal' | 'profile_conditioned';
  status: RuleStatus;
  evidence: string;
  explanation: string;
  recommendation: string;
}

export interface AnalysisSnapshot {
  id: string;
  createdAt: number;
  fileName: string;
  fileSizeBytes: number;
  profileId: string;
  profileName: string;
  profileCategory: string;
  score: number;
  classification: 'approved' | 'review' | 'blocked';
  label: string;
  errorCount: number;
  warningCount: number;
  approvedCount: number;
  undeterminedCount: number;
  reviewExplanation?: string;
  rules: SnapshotRuleItem[];
  documentSummary: {
    pageCount: number;
    dimensionsSummary: string;
    hasRgb: boolean;
    hasCmyk: boolean;
    hasSpotColors: boolean;
    familiesDetected: string[];
    isDeclaredPdfX: boolean;
    declaredPdfX: string | null;
    verifiedPdfX: boolean;
    pdfxStandard?: string;
    pdfxEligibility?: PdfxEligibilityResult;
  };
}

export interface RuleComparisonItem {
  ruleId: string;
  title: string;
  category: 'universal' | 'profile_conditioned';
  statusBefore: RuleStatus;
  statusAfter: RuleStatus;
  comparison: RuleComparisonStatus;
  evidenceBefore: string;
  evidenceAfter: string;
  explanation: string;
  actionTaken?: string;
}

export interface ManualInterventionItem {
  ruleId: string;
  title: string;
  severity: 'error' | 'warning';
  measuredEvidence: string;
  instruction: string;
}

export interface TechnicalReportData {
  id: string;
  generatedAt: number;
  fileName: string;
  fileSizeBytes: number;
  profileId: string;
  profileName: string;
  initialSnapshot: AnalysisSnapshot;
  postFixSnapshot?: AnalysisSnapshot;
  hasFixApplied: boolean;
  fixDescription?: string;
  reanalyzedByMotor1: boolean;
  comparisonResults?: RuleComparisonItem[];
  correctedCount: number;
  improvedCount: number;
  unchangedCount: number;
  worsenedCount: number;
  newIssueCount: number;
  remainingIssuesCount: number;
  undeterminedCount: number;
  reviewExplanation?: string;
  manualInterventions: ManualInterventionItem[];
  pdfxEligibility?: PdfxEligibilityResult;
  initialScore: number;
  finalScore: number;
  scoreDelta: number;
  initialClassification: 'approved' | 'review' | 'blocked';
  finalClassification: 'approved' | 'review' | 'blocked';
  finalTechnicalState: 'approved' | 'review' | 'blocked';
}

/**
 * Cria um snapshot IMUTÁVEL da análise original.
 * Utiliza cópia profunda para garantir que mutações posteriores não alterem o registro histórico.
 */
export function createAnalysisSnapshot(
  analysis: PreflightAnalysis,
  profile: ProductionProfile
): AnalysisSnapshot {
  const pages = analysis.document?.pages || [];
  const firstPage = pages[0];
  const firstWidth = firstPage?.widthMm ?? firstPage?.mediaBox?.widthMm ?? 0;
  const firstHeight = firstPage?.heightMm ?? firstPage?.mediaBox?.heightMm ?? 0;
  const dimStr = firstPage
    ? `${firstWidth.toFixed(1)} × ${firstHeight.toFixed(1)} mm (${pages.length} pág${pages.length > 1 ? 's' : ''})`
    : `${pages.length} páginas`;

  const snapshotRules: SnapshotRuleItem[] = (analysis.ruleResults?.results || []).map((r) => ({
    ruleId: r.ruleId,
    title: r.title,
    category: r.category,
    status: r.status,
    evidence: r.evidence,
    explanation: r.explanation,
    recommendation: r.recommendation,
  }));

  const declaredVersion = analysis.document?.pdfxInfo?.declaredVersion || analysis.document?.pdfxInfo?.recognizedStandard;
  const isDeclared = Boolean(analysis.document?.pdfxInfo?.isDeclaredPdfX);
  const declaredPdfX = isDeclared ? (declaredVersion || 'PDF/X Declarado') : null;
  // Distinção conceitual estrita: metadado declarado NÃO equivale a validação/certificação normativa
  const verifiedPdfX = Boolean((analysis as any).verifiedPdfX);

  const undeterminedCount = analysis.ruleResults?.undeterminedCount ?? 
    snapshotRules.filter((r) => r.status === 'undetermined').length;
  const warningCount = analysis.ruleResults?.warningCount ?? 
    snapshotRules.filter((r) => r.status === 'warning').length;
  const errorCount = analysis.ruleResults?.errorCount ?? 
    snapshotRules.filter((r) => r.status === 'error').length;
  const approvedCount = analysis.ruleResults?.approvedCount ?? 
    snapshotRules.filter((r) => r.status === 'approved').length;

  const classification = analysis.ruleResults?.scoreSummary?.classification || (errorCount > 0 ? 'blocked' : (warningCount > 0 || undeterminedCount > 0 ? 'review' : 'approved'));

  let reviewExplanation: string | undefined;
  if (classification === 'review') {
    if (undeterminedCount > 0 && warningCount === 0 && errorCount === 0) {
      reviewExplanation = 'Status REVIEW — existem verificações que não puderam ser determinadas de forma conclusiva.';
    } else if (undeterminedCount > 0) {
      reviewExplanation = `Status REVIEW — existem verificações indeterminadas (${undeterminedCount}) e alertas técnicos.`;
    } else {
      reviewExplanation = 'Status REVIEW — o arquivo contém alertas técnicos que requerem atenção antes da impressão.';
    }
  }

  const pdfxEligibility = analysis.document
    ? evaluatePdfx4Eligibility(analysis.document, {
        profile,
        ruleResults: analysis.ruleResults,
      })
    : undefined;

  const snapshot: AnalysisSnapshot = {
    id: analysis.id,
    createdAt: analysis.createdAt,
    fileName: analysis.fileName,
    fileSizeBytes: analysis.fileSizeBytes,
    profileId: profile.id,
    profileName: profile.name,
    profileCategory: profile.category,
    score: analysis.ruleResults?.scoreSummary?.score ?? 0,
    classification,
    label: analysis.ruleResults?.scoreSummary?.label || '',
    errorCount,
    warningCount,
    approvedCount,
    undeterminedCount,
    reviewExplanation,
    rules: snapshotRules,
    documentSummary: {
      pageCount: analysis.document?.pageCount || pages.length,
      dimensionsSummary: dimStr,
      hasRgb: analysis.document?.colorSummary?.hasRgb ?? false,
      hasCmyk: analysis.document?.colorSummary?.hasCmyk ?? false,
      hasSpotColors: analysis.document?.colorSummary?.hasSpotColors ?? false,
      familiesDetected: [...(analysis.document?.colorSummary?.familiesDetected || [])],
      isDeclaredPdfX: isDeclared,
      declaredPdfX,
      verifiedPdfX,
      pdfxStandard: declaredVersion,
      pdfxEligibility,
    },
  };

  // Retorna clone imutável e congelado
  return Object.freeze(JSON.parse(JSON.stringify(snapshot)));
}

/**
 * Compara as regras da análise inicial contra a análise pós-correção.
 * 
 * Regras estritas:
 * - 'corrected': antes tinha erro/warning e agora está approved (REQUER reanálise obrigatória pelo Motor 1)
 * - 'improved': antes tinha error e agora virou warning
 * - 'unchanged': manteve o mesmo status
 * - 'worsened': antes estava aprovado/warning e piorou para warning/error
 * - 'new_issue': regra que antes não existia ou não era problema e agora falha
 */
export function compareRuleSnapshots(
  beforeRules: SnapshotRuleItem[],
  afterRules: SnapshotRuleItem[],
  reanalyzedByMotor1: boolean
): RuleComparisonItem[] {
  const beforeMap = new Map<string, SnapshotRuleItem>();
  for (const r of beforeRules) {
    beforeMap.set(r.ruleId, r);
  }

  const afterMap = new Map<string, SnapshotRuleItem>();
  for (const r of afterRules) {
    afterMap.set(r.ruleId, r);
  }

  const allRuleIds = Array.from(new Set([...beforeMap.keys(), ...afterMap.keys()]));
  const results: RuleComparisonItem[] = [];

  for (const ruleId of allRuleIds) {
    const before = beforeMap.get(ruleId);
    const after = afterMap.get(ruleId);

    const title = after?.title || before?.title || ruleId;
    const category = after?.category || before?.category || 'universal';
    const statusBefore: RuleStatus = before ? before.status : 'approved';
    const statusAfter: RuleStatus = after ? after.status : 'approved';
    const evidenceBefore = before?.evidence || 'Não avaliado';
    const evidenceAfter = after?.evidence || 'Não avaliado';
    const explanation = after?.explanation || before?.explanation || '';

    let comparison: RuleComparisonStatus = 'unchanged';

    const isProblem = (s: RuleStatus) => s === 'error' || s === 'warning';
    const isWorse = (sAfter: RuleStatus, sBefore: RuleStatus) => {
      if (sBefore === 'approved' && (sAfter === 'warning' || sAfter === 'error')) return true;
      if (sBefore === 'warning' && sAfter === 'error') return true;
      return false;
    };

    if (!before && after && isProblem(statusAfter)) {
      comparison = 'new_issue';
    } else if (isProblem(statusBefore) && statusAfter === 'approved') {
      if (reanalyzedByMotor1) {
        comparison = 'corrected';
      } else {
        // NUNCA declarar corrected sem reanálise pelo Motor 1
        comparison = 'unchanged';
      }
    } else if (statusBefore === 'error' && statusAfter === 'warning') {
      comparison = 'improved';
    } else if (isWorse(statusAfter, statusBefore)) {
      comparison = 'worsened';
    } else if (statusBefore === statusAfter) {
      comparison = 'unchanged';
    } else {
      comparison = 'unchanged';
    }

    results.push({
      ruleId,
      title,
      category,
      statusBefore,
      statusAfter,
      comparison,
      evidenceBefore,
      evidenceAfter,
      explanation,
    });
  }

  return results;
}

/**
 * Constrói o relatório técnico estruturado completo.
 */
export function buildTechnicalReport(
  initialSnapshot: AnalysisSnapshot,
  postFixAnalysis?: PreflightAnalysis | null,
  profile?: ProductionProfile,
  options?: {
    fixDescription?: string;
    reanalyzedByMotor1?: boolean;
  }
): TechnicalReportData {
  const reanalyzed = options?.reanalyzedByMotor1 ?? Boolean(postFixAnalysis);
  const postFixSnapshot = postFixAnalysis && profile
    ? createAnalysisSnapshot(postFixAnalysis, profile)
    : undefined;

  const hasFixApplied = Boolean(postFixSnapshot);

  let comparisonResults: RuleComparisonItem[] | undefined;
  let correctedCount = 0;
  let improvedCount = 0;
  let unchangedCount = 0;
  let worsenedCount = 0;
  let newIssueCount = 0;

  if (postFixSnapshot) {
    comparisonResults = compareRuleSnapshots(
      initialSnapshot.rules,
      postFixSnapshot.rules,
      reanalyzed
    );

    for (const c of comparisonResults) {
      if (c.comparison === 'corrected') correctedCount++;
      else if (c.comparison === 'improved') improvedCount++;
      else if (c.comparison === 'unchanged') unchangedCount++;
      else if (c.comparison === 'worsened') worsenedCount++;
      else if (c.comparison === 'new_issue') newIssueCount++;
    }
  }

  const activeSnapshot = postFixSnapshot || initialSnapshot;

  // Intervenções manuais restantes
  const manualInterventions: ManualInterventionItem[] = [];
  for (const rule of activeSnapshot.rules) {
    if (rule.status === 'error' || rule.status === 'warning') {
      let instruction = rule.recommendation;
      if (rule.ruleId === 'RULE-PROF-CLR-001') {
        instruction = 'Converter elementos RGB para CMYK no software de origem com o perfil de cor de destino apropriado.';
      } else if (rule.ruleId === 'RULE-PDFX-001') {
        instruction = 'Exportar novamente utilizando o padrão PDF/X (ex: PDF/X-1a ou PDF/X-4) com Output Intent definido.';
      } else if (rule.ruleId === 'RULE-FONT-001') {
        instruction = 'Incorporar todas as fontes no arquivo de origem ou converter textos em curvas (vetores).';
      } else if (rule.ruleId === 'RULE-PROF-DPI-001') {
        instruction = 'Substituir as matrizes originais das imagens por arquivos em resolução nativa suficiente (300 DPI para impressão comercial).';
      } else if (rule.ruleId === 'RULE-PROF-BLD-001' && activeSnapshot.errorCount > 0) {
        instruction = 'Ajustar a arte no software de origem expandindo os fundos e elementos de borda além da linha de corte (sangria mínima exigida).';
      }

      manualInterventions.push({
        ruleId: rule.ruleId,
        title: rule.title,
        severity: rule.status as 'error' | 'warning',
        measuredEvidence: rule.evidence,
        instruction,
      });
    }
  }

  const remainingIssuesCount = activeSnapshot.errorCount + activeSnapshot.warningCount;

  return {
    id: `rep_${initialSnapshot.id}_${Date.now()}`,
    generatedAt: Date.now(),
    fileName: initialSnapshot.fileName,
    fileSizeBytes: initialSnapshot.fileSizeBytes,
    profileId: initialSnapshot.profileId,
    profileName: initialSnapshot.profileName,
    initialSnapshot,
    postFixSnapshot,
    hasFixApplied,
    fixDescription: options?.fixDescription || (hasFixApplied ? 'Correção de Caixas Técnicas (TrimBox / BleedBox)' : undefined),
    reanalyzedByMotor1: reanalyzed,
    comparisonResults,
    correctedCount,
    improvedCount,
    unchangedCount,
    worsenedCount,
    newIssueCount,
    remainingIssuesCount,
    undeterminedCount: activeSnapshot.undeterminedCount,
    reviewExplanation: activeSnapshot.reviewExplanation,
    manualInterventions,
    pdfxEligibility: activeSnapshot.documentSummary.pdfxEligibility,
    initialScore: initialSnapshot.score,
    finalScore: activeSnapshot.score,
    scoreDelta: activeSnapshot.score - initialSnapshot.score,
    initialClassification: initialSnapshot.classification,
    finalClassification: activeSnapshot.classification,
    finalTechnicalState: activeSnapshot.classification,
  };
}
