import type { PreflightAnalysis, RuleEvaluationResult } from '../types';

export type FixSafetyLevel = 'auto' | 'assisted' | 'manual';
export type FixType =
  | 'pdfx_declaration'
  | 'color_conversion'
  | 'dpi_enhancement'
  | 'bleed_generation'
  | 'font_embedding'
  | 'transparency_flattening'
  | 'output_intent';

export type FixActionResult =
  | 'corrected'
  | 'partially_corrected'
  | 'manual_required'
  | 'user_input_required'
  | 'failed'
  | 'not_supported';

export interface FixContractResult {
  ruleId: string;
  fixId: string;
  statusBefore: 'error' | 'warning' | 'undetermined' | 'approved';
  actionAttempted: string;
  actionResult: FixActionResult;
  statusAfter?: 'error' | 'warning' | 'undetermined' | 'approved';
  verified: boolean;
  message: string;
}

export function evaluateFixContract(
  ruleId: string,
  fixId: string,
  statusBefore: 'error' | 'warning' | 'undetermined' | 'approved',
  actionAttempted: string,
  actionResult: FixActionResult,
  statusAfter?: 'error' | 'warning' | 'undetermined' | 'approved',
  message?: string
): FixContractResult {
  const verified = actionResult === 'corrected' && statusAfter === 'approved';
  return {
    ruleId,
    fixId,
    statusBefore,
    actionAttempted,
    actionResult,
    statusAfter,
    verified,
    message: message || (verified ? 'Correção verificada com sucesso pelo Motor 1.' : 'Correção não verificada.'),
  };
}

export interface FixProposal {
  id: string;
  ruleId: string;
  type: FixType;
  safetyLevel: FixSafetyLevel;
  title: string;
  description: string;
  affectedPages: number[];
  canApply: boolean;
  requiresHumanApproval: boolean;
  reasonIfUnavailable: string;
  measuredValue?: string;
  expectedValue?: string;
  requiredInputDescription?: string;
}

export interface FixEngineResult {
  proposals: FixProposal[];
  autoCount: number;
  assistedCount: number;
  manualCount: number;
}

const RULE_ID_TO_FIX_TYPE: Record<string, FixType> = {
  'RULE-PDFX-001': 'pdfx_declaration',
  'RULE-PROF-CLR-001': 'color_conversion',
  'RULE-PROF-DPI-001': 'dpi_enhancement',
  'RULE-PROF-BLD-001': 'bleed_generation',
  'RULE-FONT-001': 'font_embedding',
};

function extractPages(rule: RuleEvaluationResult): number[] {
  if (!rule.references || rule.references.length === 0) return [];
  const pages = new Set<number>();
  for (const ref of rule.references) {
    if (typeof ref.page === 'number') pages.add(ref.page);
  }
  return Array.from(pages).sort((a, b) => a - b);
}

export function classifyRule(rule: RuleEvaluationResult, analysis?: PreflightAnalysis): FixProposal | null {
  if (rule.status === 'approved' || rule.status === 'undetermined') return null;

  const fixType = RULE_ID_TO_FIX_TYPE[rule.ruleId];
  if (!fixType) return null;

  const affectedPages = extractPages(rule);
  const isWarning = rule.status === 'warning';

  switch (fixType) {
    case 'pdfx_declaration':
      return {
        id: `fix_${rule.ruleId}`,
        ruleId: rule.ruleId,
        type: 'pdfx_declaration',
        safetyLevel: 'assisted',
        title: 'Declarar conformidade PDF/X',
        description: 'Preparar metadata de declaração PDF/X no documento. A conversão real requer validação do perfil de saída e output intent — não aplicada automaticamente.',
        affectedPages,
        canApply: false,
        requiresHumanApproval: true,
        reasonIfUnavailable: 'A declaração PDF/X exige configuração de output intent e ICC profile de saída. Deve ser aplicada no software de origem (Illustrator, InDesign) antes da exportação.',
        measuredValue: 'PDF padrão',
        expectedValue: 'PDF/X-1a:2001',
        requiredInputDescription: 'Configuração de OutputIntent (GTS_PDFX) e especificação de perfil ICC de destino (ex: ISO Coated v2 ou Fogra39) no software de exportação.',
      };

    case 'output_intent':
      return {
        id: `fix_output_intent`,
        ruleId: rule.ruleId,
        type: 'output_intent',
        safetyLevel: 'assisted',
        title: 'Configurar perfil de saída / Output Intent',
        description: 'Configurar Output Intent padronizado com perfil ICC de destino (ex: Fogra39, ISO Coated v2, CGATS TR 001) para calibração de cor e conformidade de pré-impressão.',
        affectedPages,
        canApply: false,
        requiresHumanApproval: true,
        reasonIfUnavailable: 'A configuração de Output Intent é assistida e requer seleção ou fornecimento de perfil ICC real (.icc/.icm). Não pode ser executada sem perfil válido.',
        measuredValue: 'Output Intent ausente',
        expectedValue: 'Output Intent com perfil ICC incorporado',
        requiredInputDescription: 'Seleção de perfil ICC padrão (FOGRA39, ISO Coated v2, SWOP) ou envio de arquivo .icc calibrado.',
      };

    case 'color_conversion': {
      const hasRgbRaster = Boolean(analysis?.document?.colorSummary?.hasRgbRaster);

      if (hasRgbRaster) {
        return {
          id: `fix_${rule.ruleId}`,
          ruleId: rule.ruleId,
          type: 'color_conversion',
          safetyLevel: 'assisted',
          title: 'Converter imagens RGB para CMYK',
          description: 'Conversão determinística de imagens raster RGB para CMYK via LittleCMS CMM WebAssembly com perfil ICC de destino calibrado e preservação dimensional.',
          affectedPages,
          canApply: true,
          requiresHumanApproval: true,
          reasonIfUnavailable: 'A conversão de cores exige seleção de perfil ICC CMYK de destino e autorização de renderização.',
          measuredValue: 'Imagens DeviceRGB detectadas',
          expectedValue: 'DeviceCMYK',
          requiredInputDescription: 'Seleção de Perfil ICC CMYK de destino (ex: CGATS TR 001 SWOP, FOGRA39, ISO Coated v2).',
        };
      }

      // Pure vector or text RGB without raster images
      return {
        id: `fix_${rule.ruleId}`,
        ruleId: rule.ruleId,
        type: 'color_conversion',
        safetyLevel: 'manual',
        title: 'Elementos vetoriais ou textos em RGB',
        description: 'Elementos vetoriais e textos definidos em espaço DeviceRGB não podem ser convertidos automaticamente pelo motor de imagens LittleCMS.',
        affectedPages,
        canApply: false,
        requiresHumanApproval: true,
        reasonIfUnavailable: 'A correção automática de vetores/textos RGB ainda não está disponível. Ajuste as cores dos elementos vetoriais para CMYK diretamente no software de criação.',
        measuredValue: 'Vetores/Textos DeviceRGB detectados',
        expectedValue: 'DeviceCMYK',
        requiredInputDescription: 'Ajuste manual da paleta de cores no software gráfico de origem.',
      };
    }

    case 'dpi_enhancement':
      return {
        id: `fix_${rule.ruleId}`,
        ruleId: rule.ruleId,
        type: 'dpi_enhancement',
        safetyLevel: 'manual',
        title: 'Resolução de imagem insuficiente',
        description: 'Aumentar pixels artificialmente (upsampling) não recupera detalhe real da imagem original.',
        affectedPages,
        canApply: false,
        requiresHumanApproval: true,
        reasonIfUnavailable: 'Upsampling não recupera detalhe real. Substitua a imagem por um arquivo original em alta resolução no software de origem.',
        measuredValue: rule.evidence.match(/[\d.]+\s*DPI/i)?.[0] || 'DPI insuficiente',
        expectedValue: '300 DPI',
        requiredInputDescription: 'Substituição das matrizes de imagem (fotografias ou bitmaps) por arquivos fonte em 300 DPI na escala 100% no software de diagramação.',
      };

    case 'bleed_generation':
      return {
        id: `fix_${rule.ruleId}`,
        ruleId: rule.ruleId,
        type: 'bleed_generation',
        safetyLevel: 'manual',
        title: 'Sangria ausente ou insuficiente',
        description: 'Gerar sangria artificialmente inventaria conteúdo que não existe na arte original.',
        affectedPages,
        canApply: false,
        requiresHumanApproval: true,
        reasonIfUnavailable: 'A sangria deve ser parte da arte original. Não é possível inventar conteúdo de borda com segurança. Reexporte o arquivo com sangria configurada.',
        requiredInputDescription: 'Extensão dos elementos gráficos e fundos até a margem de sangria (mínimo 3mm) e configuração de sangria na prancheta de exportação.',
      };

    case 'font_embedding':
      return {
        id: `fix_${rule.ruleId}`,
        ruleId: rule.ruleId,
        type: 'font_embedding',
        safetyLevel: 'manual',
        title: 'Fontes não incorporadas',
        description: 'A incorporação de fontes exige acesso aos arquivos de fonte originais e licença apropriada.',
        affectedPages,
        canApply: false,
        requiresHumanApproval: true,
        reasonIfUnavailable: 'A incorporação de fontes exige os arquivos de fonte licenciados. Reexporte o documento com fontes incorporadas no software de origem.',
        requiredInputDescription: 'Incorporação completa/subconjunto de todas as fontes TTF/OTF ou conversão de textos em curvas (vetores) antes do fechamento do PDF.',
      };

    case 'transparency_flattening':
      return {
        id: `fix_${rule.ruleId}`,
        ruleId: rule.ruleId,
        type: 'transparency_flattening',
        safetyLevel: 'manual',
        title: 'Transparência incompatível',
        description: 'Achatamento de transparência pode alterar significativamente a aparência visual.',
        affectedPages,
        canApply: false,
        requiresHumanApproval: true,
        reasonIfUnavailable: 'O achatamento de transparência deve ser feito no software de origem com configurações de prova adequadas.',
        requiredInputDescription: 'Achatamento de transparências no InDesign/Illustrator usando predefinição de alta resolução (High Resolution Flattener Preset).',
      };

    default:
      return null;
  }
}

export function buildFixProposals(analysis: PreflightAnalysis): FixEngineResult {
  const proposals: FixProposal[] = [];
  const allRules = [
    ...(analysis.ruleResults.universalRules || []),
    ...(analysis.ruleResults.profileRules || []),
    ...(analysis.ruleResults.results || []),
  ];

  const seenRuleIds = new Set<string>();
  for (const rule of allRules) {
    if (seenRuleIds.has(rule.ruleId)) continue;
    seenRuleIds.add(rule.ruleId);
    const proposal = classifyRule(rule, analysis);
    if (proposal) proposals.push(proposal);
  }

  const autoCount = proposals.filter((p) => p.safetyLevel === 'auto').length;
  const assistedCount = proposals.filter((p) => p.safetyLevel === 'assisted').length;
  const manualCount = proposals.filter((p) => p.safetyLevel === 'manual').length;

  return { proposals, autoCount, assistedCount, manualCount };
}

export function getAvailableFixes(analysis: PreflightAnalysis): FixProposal[] {
  return buildFixProposals(analysis).proposals;
}
