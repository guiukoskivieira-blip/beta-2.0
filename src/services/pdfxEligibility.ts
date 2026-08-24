/**
 * ARTECHECK — PDF/X-4 Eligibility Engine (Phase 1)
 *
 * Deterministic pre-flight evaluation engine that verifies whether a PDF document
 * is eligible to be prepared and standardized as PDF/X-4 (ISO 15930-7).
 *
 * CRITICAL RULE: verifiedPdfX ALWAYS returns false in this phase.
 * Eligibility evaluation != declaration != verified conformity.
 */

import type {
  PdfDocumentStructure,
  RuleEvaluationResult,
  RuleEngineSummary,
  PreflightAnalysis,
  PdfPageStructure,
} from '../types/index.ts';
import type { ProductionProfile } from '../utils/productionProfiles.ts';
import { COMMERCIAL_PRINT_300DPI_PROFILE } from '../utils/productionProfiles.ts';
import { analyzeRgbConversionSupport } from './imageColorFix.ts';

export type PdfxEligibilityStatus = 'eligible' | 'fixable' | 'manual_required' | 'blocked';
export type PdfxCheckStatus = 'passed' | 'fixable' | 'manual_required' | 'blocked';
export type PdfxFixType = 'auto' | 'assisted' | 'manual' | 'none';

export interface PdfxCheckResult {
  id: string;
  title: string;
  category: 'structure' | 'data' | 'fonts' | 'output_intent' | 'geometry' | 'color' | 'transparency' | 'security' | 'external';
  status: PdfxCheckStatus;
  reasonCode?: string;
  message: string;
  fixType: PdfxFixType;
  details?: Record<string, any>;
}

export interface PdfxBlocker {
  code: string;
  title: string;
  reason: string;
  affectedObjects?: string[];
}

export interface PdfxWarning {
  code: string;
  title: string;
  reason: string;
}

export interface PdfxFixPlanItem {
  code: string;
  title: string;
  status: PdfxCheckStatus;
  fixType: PdfxFixType;
  description: string;
}

export interface PdfxEligibilityResult {
  targetStandard: 'PDF/X-4';
  eligible: boolean;
  status: PdfxEligibilityStatus;
  verifiedPdfX: false; // STRICT: always false during evaluation
  declaredPdfX: boolean;
  internallyEligibleForPdfX4: boolean;
  checks: PdfxCheckResult[];
  blockers: PdfxBlocker[];
  warnings: PdfxWarning[];
  fixPlan: PdfxFixPlanItem[];
  summaryMessage: string;
}

export interface EvaluatePdfxOptions {
  profile?: ProductionProfile;
  ruleResults?: RuleEvaluationResult[] | RuleEngineSummary;
  pdfBytes?: Uint8Array;
}

const EPSILON_PT = 0.75; // Tolerance for box containment floating comparisons

function checkContainment(inner: { xPt: number; yPt: number; widthPt: number; heightPt: number }, outer: { xPt: number; yPt: number; widthPt: number; heightPt: number }): boolean {
  const innerRight = inner.xPt + inner.widthPt;
  const innerTop = inner.yPt + inner.heightPt;
  const outerRight = outer.xPt + outer.widthPt;
  const outerTop = outer.yPt + outer.heightPt;

  return (
    inner.xPt >= outer.xPt - EPSILON_PT &&
    inner.yPt >= outer.yPt - EPSILON_PT &&
    innerRight <= outerRight + EPSILON_PT &&
    innerTop <= outerTop + EPSILON_PT
  );
}

/**
 * Evaluates whether a PDF document is technically eligible for PDF/X-4 standardization.
 */
export function evaluatePdfx4Eligibility(
  document: PdfDocumentStructure,
  options: EvaluatePdfxOptions = {}
): PdfxEligibilityResult {
  const profile = options.profile || COMMERCIAL_PRINT_300DPI_PROFILE;
  const rawRules: RuleEvaluationResult[] = Array.isArray(options.ruleResults)
    ? options.ruleResults
    : (options.ruleResults?.results || options.ruleResults?.profileRules || []);

  const checks: PdfxCheckResult[] = [];
  const blockers: PdfxBlocker[] = [];
  const warnings: PdfxWarning[] = [];
  const fixPlan: PdfxFixPlanItem[] = [];

  const declaredPdfX = Boolean(document.pdfxInfo?.isDeclaredPdfX);

  // -------------------------------------------------------------
  // Check A: PDFX_STRUCTURAL_VALIDITY
  // -------------------------------------------------------------
  const structRule = rawRules.find((r) => r.ruleId === 'RULE-STRUCT-001');
  const isStructApproved = structRule ? structRule.status === 'approved' : true;
  if (!isStructApproved) {
    checks.push({
      id: 'PDFX_STRUCTURAL_VALIDITY',
      title: 'Integridade Estrutural do PDF',
      category: 'structure',
      status: 'blocked',
      reasonCode: 'PDFX_STRUCTURAL_INVALID',
      message: 'A estrutura fundamental do arquivo PDF está corrompida ou incompleta (RULE-STRUCT-001 reprovado).',
      fixType: 'none',
    });
    blockers.push({
      code: 'PDFX_STRUCTURAL_INVALID',
      title: 'Estrutura Inválida',
      reason: 'O documento PDF não possui cabeçalho, trailer ou tabela xref íntegros.',
    });
  } else {
    checks.push({
      id: 'PDFX_STRUCTURAL_VALIDITY',
      title: 'Integridade Estrutural do PDF',
      category: 'structure',
      status: 'passed',
      message: 'Estrutura fundamental do PDF íntegra e verificada.',
      fixType: 'none',
    });
  }

  // -------------------------------------------------------------
  // Check B: PDFX_DETERMINABLE_DATA
  // -------------------------------------------------------------
  const dataRule = rawRules.find((r) => r.ruleId === 'RULE-DATA-001');
  const isDataApproved = dataRule ? dataRule.status === 'approved' : true;
  if (!isDataApproved) {
    checks.push({
      id: 'PDFX_DETERMINABLE_DATA',
      title: 'Determinabilidade de Dados e Fluxos',
      category: 'data',
      status: 'blocked',
      reasonCode: 'PDFX_DETERMINABLE_DATA_FAILED',
      message: 'Não foi possível extrair de forma determinística todos os fluxos e objetos do arquivo (RULE-DATA-001).',
      fixType: 'none',
    });
    blockers.push({
      code: 'PDFX_DETERMINABLE_DATA_FAILED',
      title: 'Fluxos Não Determináveis',
      reason: 'O PDF contém streams ilegíveis ou estruturas opacas que impedem a validação de pré-impressão.',
    });
  } else {
    checks.push({
      id: 'PDFX_DETERMINABLE_DATA',
      title: 'Determinabilidade de Dados e Fluxos',
      category: 'data',
      status: 'passed',
      message: 'Todos os fluxos e tabelas de objetos foram analisados deterministicamente.',
      fixType: 'none',
    });
  }

  // -------------------------------------------------------------
  // Check C: PDFX_FONTS
  // -------------------------------------------------------------
  const usedFonts = (document.fonts || []).filter((f) => f.isUsedInContent !== false);
  const unEmbeddedFonts = usedFonts.filter((f) => {
    return f.isEmbedded === 'no' || f.isEmbedded === false;
  });

  if (unEmbeddedFonts.length > 0) {
    const names = unEmbeddedFonts.map((f) => f.cleanFontName || f.baseFont || f.id).join(', ');
    checks.push({
      id: 'PDFX_FONTS',
      title: 'Incorporação de Tipografia',
      category: 'fonts',
      status: 'manual_required',
      reasonCode: 'PDFX_FONT_NOT_EMBEDDED',
      message: `${unEmbeddedFonts.length} fonte(s) utilizada(s) no conteúdo não incorporada(s): ${names}.`,
      fixType: 'manual',
      details: { unEmbeddedCount: unEmbeddedFonts.length, fontNames: names },
    });
    blockers.push({
      code: 'PDFX_FONT_NOT_EMBEDDED',
      title: 'Fontes Não Incorporadas',
      reason: `As fontes [${names}] não estão embutidas no PDF. PDF/X-4 exige que 100% dos glifos utilizados estejam incorporados ou convertidos em curvas.`,
      affectedObjects: unEmbeddedFonts.map((f) => f.cleanFontName || f.id),
    });
    fixPlan.push({
      code: 'PDFX_FONT_NOT_EMBEDDED',
      title: 'Incorporação de Fontes',
      status: 'manual_required',
      fixType: 'manual',
      description: `Incorporar as fontes [${names}] ou convertê-las em curvas no software gráfico de origem.`,
    });
  } else {
    checks.push({
      id: 'PDFX_FONTS',
      title: 'Incorporação de Tipografia',
      category: 'fonts',
      status: 'passed',
      message: usedFonts.length > 0
        ? `Todas as ${usedFonts.length} fonte(s) utilizadas no conteúdo estão devidamente incorporadas ou em subset.`
        : 'Nenhuma fonte externa utilizada (ou texto já convertido em curvas).',
      fixType: 'none',
    });
  }

  // -------------------------------------------------------------
  // Check D: PDFX_OUTPUT_INTENT
  // -------------------------------------------------------------
  const outputIntents = document.outputIntents || [];
  const validOutputIntent = outputIntents.find((oi) => {
    if (!oi) return false;
    const isPdfxSubtype = oi.subtype === 'GTS_PDFX' || oi.type === 'OutputIntent';
    const hasProfile = oi.hasDestOutputProfile || Boolean(oi.destOutputProfile);
    const isProfileValid = oi.destOutputProfile ? oi.destOutputProfile.isValidIcc : true;
    return isPdfxSubtype && hasProfile && isProfileValid;
  });

  const corruptOutputIntent = outputIntents.find((oi) => oi.destOutputProfile && !oi.destOutputProfile.isValidIcc);

  if (corruptOutputIntent) {
    checks.push({
      id: 'PDFX_OUTPUT_INTENT',
      title: 'Output Intent (Intenção de Saída ICC)',
      category: 'output_intent',
      status: 'blocked',
      reasonCode: 'PDFX_OUTPUT_INTENT_INVALID',
      message: 'O perfil ICC embutido no OutputIntent do documento está corrompido ou possui assinatura inválida.',
      fixType: 'none',
    });
    blockers.push({
      code: 'PDFX_OUTPUT_INTENT_INVALID',
      title: 'Output Intent Corrompido',
      reason: 'Perfil ICC presente no OutputIntent não atende aos padrões ISO de validação binária de cor.',
    });
  } else if (!validOutputIntent) {
    checks.push({
      id: 'PDFX_OUTPUT_INTENT',
      title: 'Output Intent (Intenção de Saída ICC)',
      category: 'output_intent',
      status: 'fixable',
      reasonCode: 'PDFX_OUTPUT_INTENT_MISSING',
      message: 'Output Intent ausente. Pode ser gerado deterministicamente a partir do perfil de impressão.',
      fixType: 'auto',
    });
    fixPlan.push({
      code: 'PDFX_OUTPUT_INTENT_MISSING',
      title: 'Geração de Output Intent GTS_PDFX',
      status: 'fixable',
      fixType: 'auto',
      description: 'Embutir perfil ICC CMYK padrão (CGATS TR 001 / SWOP) e criar dicionário OutputIntent GTS_PDFX.',
    });
  } else {
    checks.push({
      id: 'PDFX_OUTPUT_INTENT',
      title: 'Output Intent (Intenção de Saída ICC)',
      category: 'output_intent',
      status: 'passed',
      message: `Output Intent compatível detectado (${validOutputIntent.outputConditionIdentifier || validOutputIntent.info || 'GTS_PDFX'}).`,
      fixType: 'none',
    });
  }

  // -------------------------------------------------------------
  // Check E0: PDFX_PAGE_SIZE_UNIFORMITY
  // -------------------------------------------------------------
  const pages = document.pages || [];
  let isUniform = true;
  if (pages.length > 1) {
    const firstP = pages[0];
    const diff = pages.filter(
      (p) =>
        Math.abs(p.widthMm - firstP.widthMm) > 0.8 ||
        Math.abs(p.heightMm - firstP.heightMm) > 0.8
    );
    if (diff.length > 0) {
      isUniform = false;
    }
  }

  if (pages.length > 1 && !isUniform) {
    const pageDetails = pages.map((p) => `Pág. ${p.page} = ${p.widthMm.toFixed(1)}×${p.heightMm.toFixed(1)} mm`).join(', ');
    checks.push({
      id: 'PDFX_PAGE_SIZE_UNIFORMITY',
      title: 'Uniformidade Dimensional das Páginas',
      category: 'geometry',
      status: 'manual_required',
      reasonCode: 'PDFX_HETEROGENEOUS_PAGE_SIZES',
      message: `O documento contém páginas com dimensões diferentes (${pageDetails}). Separe as peças ou utilize um perfil que permita explicitamente páginas heterogêneas.`,
      fixType: 'manual',
      details: { pageDetails },
    });
    blockers.push({
      code: 'PDFX_HETEROGENEOUS_PAGE_SIZES',
      title: 'Dimensões Heterogêneas entre Páginas',
      reason: `O perfil de produção "${profile.name}" requer dimensões consistentes em todas as páginas do lote. Páginas detectadas: ${pageDetails}.`,
      affectedObjects: pages.map((p) => `Página ${p.page} (${p.widthMm.toFixed(1)}×${p.heightMm.toFixed(1)} mm)`),
    });
    fixPlan.push({
      code: 'PDFX_HETEROGENEOUS_PAGE_SIZES',
      title: 'Separação de Peças Heterogêneas',
      status: 'manual_required',
      fixType: 'manual',
      description: `Separar as páginas (${pageDetails}) em arquivos PDF individuais para cada formato no software de origem.`,
    });
  } else {
    checks.push({
      id: 'PDFX_PAGE_SIZE_UNIFORMITY',
      title: 'Uniformidade Dimensional das Páginas',
      category: 'geometry',
      status: 'passed',
      message: pages.length > 1
        ? `Todas as ${pages.length} páginas possuem dimensões uniformes (${pages[0]?.widthMm.toFixed(1)} × ${pages[0]?.heightMm.toFixed(1)} mm).`
        : 'Documento de página única.',
      fixType: 'none',
    });
  }

  // -------------------------------------------------------------
  // Check E: PDFX_TRIMBOX
  // -------------------------------------------------------------
  const pagesWithoutTrim = pages.filter((p) => !p.trimBox || p.trimBox.status !== 'explicit' || p.trimBox.widthPt <= 0);

  if (pagesWithoutTrim.length > 0) {
    const allHaveMediaBox = pages.every((p) => p.mediaBox && p.mediaBox.widthPt > 0 && p.mediaBox.heightPt > 0);
    if (allHaveMediaBox) {
      checks.push({
        id: 'PDFX_TRIMBOX',
        title: 'Caixa de Corte (TrimBox)',
        category: 'geometry',
        status: 'fixable',
        reasonCode: 'PDFX_TRIMBOX_FIXABLE',
        message: `${pagesWithoutTrim.length} página(s) sem TrimBox explícito. Pode ser inferido deterministicamente pelo Fix Engine.`,
        fixType: 'auto',
      });
      fixPlan.push({
        code: 'PDFX_TRIMBOX_FIXABLE',
        title: 'Geração de TrimBox',
        status: 'fixable',
        fixType: 'auto',
        description: 'Definir caixa de corte explícita (/TrimBox) alinhada com as dimensões de produção.',
      });
    } else {
      checks.push({
        id: 'PDFX_TRIMBOX',
        title: 'Caixa de Corte (TrimBox)',
        category: 'geometry',
        status: 'manual_required',
        reasonCode: 'PDFX_TRIMBOX_UNDETERMINED',
        message: 'Dimensões de MediaBox indeterminadas. Não é possível inferir o TrimBox de forma segura.',
        fixType: 'manual',
      });
      blockers.push({
        code: 'PDFX_TRIMBOX_UNDETERMINED',
        title: 'TrimBox Indeterminado',
        reason: 'O documento não possui caixas de página válidas para inferir o tamanho final de corte.',
      });
    }
  } else {
    checks.push({
      id: 'PDFX_TRIMBOX',
      title: 'Caixa de Corte (TrimBox)',
      category: 'geometry',
      status: 'passed',
      message: `TrimBox explícito e válido presente em todas as ${pages.length} página(s).`,
      fixType: 'none',
    });
  }

  // -------------------------------------------------------------
  // Check F: PDFX_BLEEDBOX
  // -------------------------------------------------------------
  const requiredBleedMm = profile.expectedBleedMm || 0;
  if (requiredBleedMm > 0) {
    const requiredBleedPt = (requiredBleedMm * 72) / 25.4;
    let bleedIssueFound = false;
    let canFixBleed = true;

    for (const page of pages) {
      const tb = page.trimBox?.status === 'explicit' ? page.trimBox : null;
      const bb = page.bleedBox?.status === 'explicit' ? page.bleedBox : null;
      const mb = page.mediaBox;

      if (!bb || !tb) {
        bleedIssueFound = true;
        // Check if mediaBox has enough physical margin for bleed
        if (mb && mb.widthPt > 0 && mb.heightPt > 0) {
          const trimW = tb ? tb.widthPt : (profile.expectedWidthMm ? (profile.expectedWidthMm * 72) / 25.4 : mb.widthPt - requiredBleedPt * 2);
          const trimH = tb ? tb.heightPt : (profile.expectedHeightMm ? (profile.expectedHeightMm * 72) / 25.4 : mb.heightPt - requiredBleedPt * 2);
          const hasPhysicalSpace =
            mb.widthPt >= trimW + requiredBleedPt * 2 - EPSILON_PT &&
            mb.heightPt >= trimH + requiredBleedPt * 2 - EPSILON_PT;
          if (!hasPhysicalSpace) {
            canFixBleed = false;
          }
        } else {
          canFixBleed = false;
        }
      } else {
        const bleedLeft = tb.xPt - bb.xPt;
        const bleedBottom = tb.yPt - bb.yPt;
        const bleedRight = bb.xPt + bb.widthPt - (tb.xPt + tb.widthPt);
        const bleedTop = bb.yPt + bb.heightPt - (tb.yPt + tb.heightPt);
        const minBleed = Math.min(bleedLeft, bleedBottom, bleedRight, bleedTop);
        if (minBleed < requiredBleedPt - EPSILON_PT) {
          bleedIssueFound = true;
          if (!mb || mb.widthPt < tb.widthPt + requiredBleedPt * 2 - EPSILON_PT || mb.heightPt < tb.heightPt + requiredBleedPt * 2 - EPSILON_PT) {
            canFixBleed = false;
          }
        }
      }
    }

    if (bleedIssueFound) {
      if (canFixBleed) {
        checks.push({
          id: 'PDFX_BLEEDBOX',
          title: 'Caixa de Sangria (BleedBox)',
          category: 'geometry',
          status: 'fixable',
          reasonCode: 'PDFX_BLEEDBOX_FIXABLE',
          message: `BleedBox ausente ou insuficiente (${requiredBleedMm} mm exigidos). Margem física suficiente disponível no MediaBox.`,
          fixType: 'auto',
        });
        fixPlan.push({
          code: 'PDFX_BLEEDBOX_FIXABLE',
          title: 'Ajuste de BleedBox',
          status: 'fixable',
          fixType: 'auto',
          description: `Criar /BleedBox com ${requiredBleedMm} mm de sangria uniforme ao redor do TrimBox.`,
        });
      } else {
        checks.push({
          id: 'PDFX_BLEEDBOX',
          title: 'Caixa de Sangria (BleedBox)',
          category: 'geometry',
          status: 'manual_required',
          reasonCode: 'PDFX_BLEEDBOX_MANUAL_REQUIRED',
          message: `Margem física no MediaBox insuficiente para acomodar a sangria exigida de ${requiredBleedMm} mm.`,
          fixType: 'manual',
        });
        blockers.push({
          code: 'PDFX_BLEEDBOX_MANUAL_REQUIRED',
          title: 'Sangria Física Insuficiente',
          reason: `O tamanho da prancheta (MediaBox) não possui margem física para comportar os ${requiredBleedMm} mm de sangria sem cortar conteúdo.`,
        });
      }
    } else {
      checks.push({
        id: 'PDFX_BLEEDBOX',
        title: 'Caixa de Sangria (BleedBox)',
        category: 'geometry',
        status: 'passed',
        message: `BleedBox válido e conforme com a sangria exigida de ${requiredBleedMm} mm.`,
        fixType: 'none',
      });
    }
  } else {
    checks.push({
      id: 'PDFX_BLEEDBOX',
      title: 'Caixa de Sangria (BleedBox)',
      category: 'geometry',
      status: 'passed',
      message: 'Perfil de produção não exige sangria física obrigatória.',
      fixType: 'none',
    });
  }

  // -------------------------------------------------------------
  // Check G: PDFX_COLOR_SPACES
  // -------------------------------------------------------------
  const hasRgb = document.colorSummary?.hasRgb || false;
  const hasRgbVector = Boolean(document.colorSummary?.hasRgbVector || pages.some((p) => (p as any).hasRgbVector));

  if (!hasRgb) {
    checks.push({
      id: 'PDFX_COLOR_SPACES',
      title: 'Espaços de Cor e Objetos RGB',
      category: 'color',
      status: 'passed',
      message: 'Documento contém exclusivamente espaços de cor CMYK / Gray / Spot compativeis.',
      fixType: 'none',
    });
  } else if (hasRgbVector) {
    // Vector RGB cannot be automatically converted by the raster image fix engine
    checks.push({
      id: 'PDFX_COLOR_SPACES',
      title: 'Espaços de Cor e Objetos RGB',
      category: 'color',
      status: 'manual_required',
      reasonCode: 'PDFX_RGB_VECTOR_MANUAL_REQUIRED',
      message: 'Objetos vetoriais RGB foram detectados no conteúdo. A conversão automática atual cobre imagens raster, não objetos vetoriais. Converta as cores no software de origem.',
      fixType: 'manual',
      details: { hasRgbVector: true, hasRgbRaster: Boolean(document.colorSummary?.hasRgbRaster) },
    });
    blockers.push({
      code: 'PDFX_RGB_VECTOR_MANUAL_REQUIRED',
      title: 'Vetores em DeviceRGB Não Elegíveis para Fix Automático',
      reason: 'O documento possui operadores gráficos vetoriais em DeviceRGB (ex: preenchimentos e contornos) que exigem conversão para CMYK no software de origem.',
    });
    fixPlan.push({
      code: 'PDFX_RGB_VECTOR_MANUAL_REQUIRED',
      title: 'Conversão de Vetores RGB',
      status: 'manual_required',
      fixType: 'manual',
      description: 'Converter cores de preenchimento e traço vetoriais para CMYK ou escala de cinza no software gráfico original.',
    });
  } else {
    // Canonical Safe Scope evaluation via analyzeRgbConversionSupport
    let allRgbInSafeScope = true;
    let unsupportedCount = 0;
    const rgbImages: any[] = [];

    for (const page of pages) {
      for (const img of page.imageOccurrences || []) {
        if (img.colorSpace?.includes('RGB')) {
          rgbImages.push(img);
          const support = analyzeRgbConversionSupport(img);
          if (!support.isSupported) {
            allRgbInSafeScope = false;
            unsupportedCount++;
          }
        }
      }
    }

    if (allRgbInSafeScope && rgbImages.length > 0) {
      checks.push({
        id: 'PDFX_COLOR_SPACES',
        title: 'Espaços de Cor e Objetos RGB',
        category: 'color',
        status: 'fixable',
        reasonCode: 'PDFX_RGB_FIXABLE',
        message: `${rgbImages.length} imagem(ns) RGB detectada(s), todas elegíveis para conversão automática LittleCMS (Safe Scope V1.2).`,
        fixType: 'auto',
        details: { rgbCount: rgbImages.length },
      });
      fixPlan.push({
        code: 'PDFX_RGB_FIXABLE',
        title: 'Conversão de Cores de Imagens RGB → CMYK',
        status: 'fixable',
        fixType: 'auto',
        description: `Converter ${rgbImages.length} imagem(ns) RGB para CMYK usando LittleCMS CMM com perfil de destino.`,
      });
    } else {
      const nonSupportedCount = unsupportedCount > 0 ? unsupportedCount : (rgbImages.length === 0 ? 1 : rgbImages.length);
      checks.push({
        id: 'PDFX_COLOR_SPACES',
        title: 'Espaços de Cor e Objetos RGB',
        category: 'color',
        status: 'manual_required',
        reasonCode: 'PDFX_RGB_MANUAL_REQUIRED',
        message: `Objetos RGB detectados fora do Safe Scope automático (${nonSupportedCount} não suportado(s)). Requer conversão manual no software gráfico.`,
        fixType: 'manual',
        details: { rgbCount: rgbImages.length, unsupportedCount: nonSupportedCount },
      });
      blockers.push({
        code: 'PDFX_RGB_MANUAL_REQUIRED',
        title: 'Objetos RGB Não Elegíveis para Fix Automático',
        reason: 'O documento possui imagens com filtros/profundidades não suportados que exigem conversão na ferramenta de criação.',
      });
    }
  }

  // -------------------------------------------------------------
  // Check H: PDFX_TRANSPARENCY
  // -------------------------------------------------------------
  // PDF/X-4 explicitly allows live PDF 1.4+ transparency!
  const hasTransp = pages.some((p) => p.hasTransparency) || Boolean(document.transparencySummary?.hasTransparency);
  checks.push({
    id: 'PDFX_TRANSPARENCY',
    title: 'Transparências e Camadas',
    category: 'transparency',
    status: 'passed',
    message: hasTransp
      ? 'Transparências ativas detectadas (permitidas pelo padrão PDF/X-4 ISO 15930-7).'
      : 'Nenhuma transparência ativa detectada.',
    fixType: 'none',
  });

  // -------------------------------------------------------------
  // Check I: PDFX_ENCRYPTION
  // -------------------------------------------------------------
  const isEncrypted = Boolean((document as any).isEncrypted || (document.metadata as any)?.encrypted);
  if (isEncrypted) {
    checks.push({
      id: 'PDFX_ENCRYPTION',
      title: 'Criptografia e Senhas',
      category: 'security',
      status: 'blocked',
      reasonCode: 'PDFX_ENCRYPTED_DOCUMENT',
      message: 'O documento possui criptografia ou senha ativa. Normas PDF/X proíbem restrições criptográficas.',
      fixType: 'none',
    });
    blockers.push({
      code: 'PDFX_ENCRYPTED_DOCUMENT',
      title: 'Documento Criptografado',
      reason: 'Remover senhas e proteções no software original antes de gerar PDF/X.',
    });
  } else {
    checks.push({
      id: 'PDFX_ENCRYPTION',
      title: 'Criptografia e Senhas',
      category: 'security',
      status: 'passed',
      message: 'Documento sem criptografia ou restrições de acesso.',
      fixType: 'none',
    });
  }

  // -------------------------------------------------------------
  // Check J: PDFX_EXTERNAL_CONTENT
  // -------------------------------------------------------------
  const hasExternalOpi = Boolean((document as any).hasOpi || (document as any).hasExternalStreams);
  if (hasExternalOpi) {
    checks.push({
      id: 'PDFX_EXTERNAL_CONTENT',
      title: 'Conteúdo e Referências Externas',
      category: 'external',
      status: 'blocked',
      reasonCode: 'PDFX_EXTERNAL_CONTENT_FOUND',
      message: 'Documento contém referências a streams ou links OPI externos.',
      fixType: 'none',
    });
    blockers.push({
      code: 'PDFX_EXTERNAL_CONTENT_FOUND',
      title: 'Conteúdo Externo Proibido',
      reason: 'PDF/X-4 exige que todo o conteúdo esteja autocontido no arquivo.',
    });
  } else {
    checks.push({
      id: 'PDFX_EXTERNAL_CONTENT',
      title: 'Conteúdo e Referências Externas',
      category: 'external',
      status: 'passed',
      message: 'Todo o conteúdo gráfico é autocontido no documento.',
      fixType: 'none',
    });
  }

  // -------------------------------------------------------------
  // Check K: PDFX_PAGE_BOXES
  // -------------------------------------------------------------
  let boxContainmentValid = true;
  let boxErrorMessage = '';

  for (const page of pages) {
    const mb = page.mediaBox;
    const tb = page.trimBox?.status === 'explicit' ? page.trimBox : null;
    const bb = page.bleedBox?.status === 'explicit' ? page.bleedBox : null;

    if (mb && mb.widthPt > 0 && mb.heightPt > 0) {
      if (tb && !checkContainment(tb, mb)) {
        boxContainmentValid = false;
        boxErrorMessage = `Página ${page.page}: TrimBox (${tb.widthMm.toFixed(1)}x${tb.heightMm.toFixed(1)}mm) ultrapassa os limites do MediaBox.`;
        break;
      }
      if (bb && !checkContainment(bb, mb)) {
        boxContainmentValid = false;
        boxErrorMessage = `Página ${page.page}: BleedBox ultrapassa os limites do MediaBox.`;
        break;
      }
    }
    if (tb && bb) {
      if (!checkContainment(tb, bb)) {
        boxContainmentValid = false;
        boxErrorMessage = `Página ${page.page}: TrimBox ultrapassa os limites do BleedBox.`;
        break;
      }
    }
  }

  if (!boxContainmentValid) {
    checks.push({
      id: 'PDFX_PAGE_BOXES',
      title: 'Consistência Geométrica de Caixas',
      category: 'geometry',
      status: 'blocked',
      reasonCode: 'PDFX_PAGE_BOXES_INVALID',
      message: boxErrorMessage || 'Conflito na hierarquia geométrica das caixas de página.',
      fixType: 'manual',
    });
    blockers.push({
      code: 'PDFX_PAGE_BOXES_INVALID',
      title: 'Hierarquia de Caixas Inválida',
      reason: boxErrorMessage,
    });
  } else {
    checks.push({
      id: 'PDFX_PAGE_BOXES',
      title: 'Consistência Geométrica de Caixas',
      category: 'geometry',
      status: 'passed',
      message: 'Hierarquia geométrica válida (TrimBox ⊆ BleedBox ⊆ MediaBox).',
      fixType: 'none',
    });
  }

  // -------------------------------------------------------------
  // Overall Status Determination
  // -------------------------------------------------------------
  const hasBlocked = checks.some((c) => c.status === 'blocked');
  const hasManualRequired = checks.some((c) => c.status === 'manual_required');
  const hasFixable = checks.some((c) => c.status === 'fixable');

  let status: PdfxEligibilityStatus = 'eligible';
  let summaryMessage = '';

  if (hasBlocked) {
    status = 'blocked';
    summaryMessage = 'Documento bloqueado para preparação PDF/X-4 devido a erros estruturais ou restrições graves.';
  } else if (hasManualRequired) {
    status = 'manual_required';
    summaryMessage = 'Documento requer intervenções manuais no software de criação antes de se qualificar para PDF/X-4.';
  } else if (hasFixable) {
    status = 'fixable';
    summaryMessage = 'Documento elegível para PDF/X-4 mediante aplicação das correções automáticas do Fix Engine.';
  } else {
    status = 'eligible';
    summaryMessage = 'Documento totalmente elegível para preparação no padrão PDF/X-4.';
  }

  const internallyEligibleForPdfX4 = status === 'eligible' || status === 'fixable';
  const eligible = internallyEligibleForPdfX4;

  return {
    targetStandard: 'PDF/X-4',
    eligible,
    status,
    verifiedPdfX: false, // ALWAYS false in Phase 1
    declaredPdfX,
    internallyEligibleForPdfX4,
    checks,
    blockers,
    warnings,
    fixPlan,
    summaryMessage,
  };
}
