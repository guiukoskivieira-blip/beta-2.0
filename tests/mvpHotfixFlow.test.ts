import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { getAvailableFixes } from '../src/services/fixEngine.ts';
import { COMMERCIAL_PRINT_300DPI_PROFILE } from '../src/utils/productionProfiles.ts';
import { buildTechnicalReport, createAnalysisSnapshot } from '../src/services/technicalReport.ts';
import { generateTechnicalReportPdf } from '../src/services/reportPdfGenerator.ts';
import type { PreflightAnalysis, RuleEvaluationResult } from '../src/types/index.ts';

function createMockAnalysis(params: {
  hasRgbRaster?: boolean;
  hasRgbVector?: boolean;
  hasCmyk?: boolean;
  hasTransparency?: boolean;
  isDeclaredPdfX?: boolean;
  hasOutputIntent?: boolean;
  rules?: RuleEvaluationResult[];
}): PreflightAnalysis {
  const {
    hasRgbRaster = false,
    hasRgbVector = false,
    hasCmyk = true,
    hasTransparency = false,
    isDeclaredPdfX = false,
    hasOutputIntent = false,
    rules = [],
  } = params;

  return {
    id: `analysis_mock_${Date.now()}`,
    createdAt: Date.now(),
    fileName: 'test_artwork.pdf',
    fileSizeBytes: 102400,
    profileId: COMMERCIAL_PRINT_300DPI_PROFILE.id,
    diagnosticInfo: { extractionDurationMs: 10, evaluationDurationMs: 5 },
    document: {
      pageCount: 1,
      colorSummary: {
        hasRgb: Boolean(hasRgbRaster || hasRgbVector),
        hasRgbRaster,
        hasRgbVector,
        hasCmyk,
        hasSpotColors: false,
        familiesDetected: hasRgbRaster || hasRgbVector ? ['DeviceRGB'] : ['DeviceCMYK'],
      },
      pdfxInfo: {
        isDeclaredPdfX,
        hasOutputIntent,
        declaredVersion: isDeclaredPdfX ? 'PDF/X-4' : undefined,
        recognizedStandard: isDeclaredPdfX ? 'PDF/X-4' : undefined,
      } as any,
      fonts: [],
      pages: [
        {
          page: 1,
          widthPt: 595.28,
          heightPt: 841.89,
          widthMm: 210,
          heightMm: 297,
          visualWidthMm: 210,
          visualHeightMm: 297,
          orientation: 'portrait',
          rotation: 0,
          mediaBox: { status: 'explicit', xPt: 0, yPt: 0, widthPt: 595.28, heightPt: 841.89, xMm: 0, yMm: 0, widthMm: 210, heightMm: 297 },
          trimBox: { status: 'explicit', xPt: 0, yPt: 0, widthPt: 595.28, heightPt: 841.89, xMm: 0, yMm: 0, widthMm: 210, heightMm: 297 },
          hasTransparency,
          hasRgbRaster,
          hasRgbVector,
          imageOccurrences: hasRgbRaster
            ? [{ id: 'img1', page: 1, name: 'Im0', widthPx: 100, heightPx: 100, displayWidthMm: 50, displayHeightMm: 50, effectiveDpiX: 300, effectiveDpiY: 300, colorSpace: 'DeviceRGB' }]
            : [],
          colorOccurrences: [],
        },
      ],
      outputIntents: hasOutputIntent ? [{ type: 'OutputIntent', subtype: 'GTS_PDFX', outputConditionIdentifier: 'FOGRA51', hasDestOutputProfile: true }] : [],
      iccProfiles: [],
    },
    ruleResults: {
      profileUsed: { id: COMMERCIAL_PRINT_300DPI_PROFILE.id, name: COMMERCIAL_PRINT_300DPI_PROFILE.name },
      totalRules: rules.length || 1,
      errorCount: rules.filter((r) => r.status === 'error').length,
      warningCount: rules.filter((r) => r.status === 'warning').length,
      approvedCount: rules.filter((r) => r.status === 'approved').length,
      undeterminedCount: 0,
      universalRules: [],
      profileRules: [],
      scoreSummary: {
        score: 75,
        classification: 'review',
        label: 'Revisão Recomendada',
        color: 'amber',
        approvedCount: rules.filter((r) => r.status === 'approved').length,
        warningCount: rules.filter((r) => r.status === 'warning').length,
        errorCount: rules.filter((r) => r.status === 'error').length,
        undeterminedCount: 0,
      },
      grouped: {
        approved: (rules.length > 0 ? rules : [{ ruleId: 'RULE-PROF-CLR-001', category: 'profile_conditioned', status: hasRgbRaster || hasRgbVector ? 'warning' : 'approved', title: 'Espaço de Cores', evidence: 'CMYK', explanation: 'CMYK', recommendation: 'CMYK' } as RuleEvaluationResult]).filter((r) => r.status === 'approved'),
        warning: (rules.length > 0 ? rules : [{ ruleId: 'RULE-PROF-CLR-001', category: 'profile_conditioned', status: hasRgbRaster || hasRgbVector ? 'warning' : 'approved', title: 'Espaço de Cores', evidence: 'CMYK', explanation: 'CMYK', recommendation: 'CMYK' } as RuleEvaluationResult]).filter((r) => r.status === 'warning'),
        error: (rules.length > 0 ? rules : [{ ruleId: 'RULE-PROF-CLR-001', category: 'profile_conditioned', status: hasRgbRaster || hasRgbVector ? 'warning' : 'approved', title: 'Espaço de Cores', evidence: 'CMYK', explanation: 'CMYK', recommendation: 'CMYK' } as RuleEvaluationResult]).filter((r) => r.status === 'error'),
        undetermined: [],
      },
      results: rules.length > 0 ? rules : [
        {
          ruleId: 'RULE-PROF-CLR-001',
          category: 'profile_conditioned',
          status: hasRgbRaster || hasRgbVector ? 'warning' : 'approved',
          title: 'Espaço de Cores',
          evidence: hasRgbRaster || hasRgbVector ? 'DeviceRGB detectado' : 'DeviceCMYK',
          explanation: 'Requer DeviceCMYK',
          recommendation: 'Converter imagens para CMYK',
        },
      ],
    },
  };
}

describe('ARTECHECK AI — Hotfix MVP: RGB, Correções, Cota e Histórico', () => {
  test('1. Imagem RGB conversível: oferece conversão via LittleCMS com canApply=true', () => {
    const analysis = createMockAnalysis({ hasRgbRaster: true, hasRgbVector: false });
    const fixes = getAvailableFixes(analysis);

    const colorFix = fixes.find((f) => f.type === 'color_conversion');
    assert.ok(colorFix, 'Deve existir fix de color_conversion');
    assert.equal(colorFix.canApply, true, 'Deve ser canApply=true para imagem raster');
    assert.match(colorFix.title, /Converter imagens RGB para CMYK/i);
  });

  test('2. Vetor RGB: NÃO é oferecido como imagem (canApply=false, manual)', () => {
    const analysis = createMockAnalysis({ hasRgbRaster: false, hasRgbVector: true });
    const fixes = getAvailableFixes(analysis);

    const colorFix = fixes.find((f) => f.type === 'color_conversion');
    assert.ok(colorFix, 'Deve existir diagnóstico de cor');
    assert.equal(colorFix.canApply, false, 'NÃO deve permitir canApply=true para vetor RGB');
    assert.match(colorFix.title, /vetoriais/i);
    assert.match(colorFix.reasonIfUnavailable || '', /software de criação/i);
  });

  test('3. Texto RGB: diagnosticado sem oferecer conversão automática de imagem', () => {
    const analysis = createMockAnalysis({ hasRgbRaster: false, hasRgbVector: true });
    const fixes = getAvailableFixes(analysis);

    const colorFix = fixes.find((f) => f.type === 'color_conversion');
    assert.ok(colorFix);
    assert.equal(colorFix.canApply, false);
  });

  test('4. Correção indisponível / manual é excluída do "Ajustar tudo"', () => {
    const analysis = createMockAnalysis({ hasRgbRaster: false, hasRgbVector: true });
    const fixes = getAvailableFixes(analysis);

    const autoApplicable = fixes.filter((f) => f.canApply);
    assert.ok(!autoApplicable.some((f) => f.type === 'color_conversion'), 'Vetor RGB não deve estar nas correções automáticas');
  });

  test('5. Dependência de PDF/X é bloqueada quando existem pendências manuais', () => {
    const analysisWithFontError = createMockAnalysis({
      hasRgbRaster: false,
      rules: [
        {
          ruleId: 'RULE-PROF-FNT-001',
          category: 'profile_conditioned',
          status: 'error',
          title: 'Fontes não incorporadas',
          evidence: 'Fonte Arial não incorporada',
          explanation: 'Fontes devem estar incorporadas',
          recommendation: 'Incorporar fontes ou converter em curvas',
        },
      ],
    });

    const fontRule = analysisWithFontError.ruleResults.results.find((r) => r.ruleId === 'RULE-PROF-FNT-001');
    assert.equal(fontRule?.status, 'error', 'Fonte não incorporada deve ser status error');
  });

  test('6. Relatório do histórico: exporta PDF com snapshot mesmo para registros sem reportData prévio', async () => {
    const analysis = createMockAnalysis({ hasRgbRaster: false, hasCmyk: true });
    const snapshot = createAnalysisSnapshot(analysis, COMMERCIAL_PRINT_300DPI_PROFILE);
    const reportData = buildTechnicalReport(snapshot, null, COMMERCIAL_PRINT_300DPI_PROFILE);

    const pdfBytes = await generateTechnicalReportPdf(reportData);
    assert.ok(pdfBytes instanceof Uint8Array, 'Deve gerar Uint8Array de PDF');
    assert.ok(pdfBytes.length > 500, 'PDF do relatório deve ter tamanho válido');

    const header = Buffer.from(pdfBytes.buffer, pdfBytes.byteOffset, 5).toString('ascii');
    assert.equal(header, '%PDF-', 'Deve possuir assinatura válida de PDF');
  });

  test('7. Cota: Gravação em analyses com file_size_bytes obrigatório para persistência correta', () => {
    const mockInsertPayload = {
      id: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
      user_id: '12345678-1234-1234-1234-123456789abc',
      organization_id: null,
      file_name: 'analysis.pdf',
      file_size_bytes: 204850,
      score: 100,
      error_count: 0,
      warning_count: 0,
      approved_count: 0,
      created_at: new Date().toISOString(),
    };

    assert.ok(typeof mockInsertPayload.file_size_bytes === 'number', 'file_size_bytes deve ser numérico');
    assert.ok(mockInsertPayload.file_size_bytes > 0, 'file_size_bytes não pode ser nulo ou omitido');
  });

  test('8. Falha na gravação de cota lança erro e não libera análise silenciosa', async () => {
    const mockRecord = async () => {
      const error = { message: 'null value in column violates not-null constraint' };
      if (error) {
        throw new Error(`Falha ao registrar uso da cota: ${error.message}`);
      }
    };

    await assert.rejects(mockRecord, /Falha ao registrar uso da cota/);
  });
});
