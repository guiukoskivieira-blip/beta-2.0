import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { PdfxPreparationPanel } from '../src/components/PdfxPreparationPanel.tsx';
import { COMMERCIAL_PRINT_300DPI_PROFILE } from '../src/utils/productionProfiles.ts';
import type { PreflightAnalysis } from '../src/types/index.ts';
import type { PdfxPreparationResult } from '../src/services/pdfxPreparation.ts';

function createDummyAnalysis(): PreflightAnalysis {
  return {
    id: 'test-analysis-1',
    fileName: 'teste_documento.pdf',
    fileSizeBytes: 1024,
    createdAt: Date.now(),
    document: {
      pageCount: 1,
      pages: [
        {
          page: 1,
          widthPt: 272.126,
          heightPt: 158.74,
          widthMm: 96,
          heightMm: 56,
          visualWidthMm: 96,
          visualHeightMm: 56,
          orientation: 'landscape',
          rotation: 0,
          mediaBox: { status: 'explicit', xPt: 0, yPt: 0, widthPt: 272.126, heightPt: 158.74, xMm: 0, yMm: 0, widthMm: 96, heightMm: 56 },
          trimBox: { status: 'explicit', xPt: 8.5, yPt: 8.5, widthPt: 255.126, heightPt: 141.74, xMm: 3, yMm: 3, widthMm: 90, heightMm: 50 },
          bleedBox: { status: 'explicit', xPt: 0, yPt: 0, widthPt: 272.126, heightPt: 158.74, xMm: 0, yMm: 0, widthMm: 96, heightMm: 56 },
          hasTransparency: false,
        },
      ],
      fonts: [],
      colorSummary: {
        hasRgb: false,
        hasCmyk: true,
        hasSpotColors: false,
        familiesDetected: [],
      },
    },
    ruleResults: {
      results: [],
      universalRules: [],
      profileRules: [],
      approvedCount: 10,
      warningCount: 0,
      errorCount: 0,
      undeterminedCount: 0,
    },
  };
}

test('1. UI Test: Quando preparationResult.status === "prepared" e eligible === true -> Renderiza botão "Gerar PDF/X-4"', () => {
  const analysis = createDummyAnalysis();
  const mockPreparationResult: PdfxPreparationResult = {
    success: true,
    status: 'prepared',
    steps: [
      {
        code: 'PDFX_PREP_COLOR',
        title: 'Conversão RGB → CMYK',
        status: 'applied',
        before: 'DeviceRGB',
        after: 'DeviceCMYK',
        evidence: 'RULE-PROF-CLR-001 aprovado',
      },
      {
        code: 'PDFX_PREP_OUTPUT_INTENT',
        title: 'Configuração de Output Intent',
        status: 'applied',
        before: 'Sem Output Intent',
        after: 'OutputIntent GTS_PDFX configurado',
        evidence: 'Perfil ICC embutido',
      },
      {
        code: 'PDFX_PREP_BOXES',
        title: 'Ajuste de TrimBox / BleedBox',
        status: 'applied',
        before: 'Caixas incompletas',
        after: 'TrimBox e BleedBox configurados',
        evidence: 'RULE-PROF-BLD-001 aprovado',
      },
    ],
    preparedPdfBase64: 'JVBERi0xLjQKJcTl8uXr...',
    originalSha256: 'abc123original',
    preparedSha256: 'def456prepared',
    eligibleAfterPreparation: {
      eligible: true,
      status: 'eligible',
      checks: [
        { id: 'PDFX_STRUCTURAL_VALIDITY', title: 'Estrutura Base do PDF', category: 'structure', status: 'passed', message: 'OK', fixType: 'none' },
        { id: 'PDFX_COLOR_SPACES', title: 'Espaços de Cor', category: 'color', status: 'passed', message: 'OK', fixType: 'none' },
        { id: 'PDFX_OUTPUT_INTENT', title: 'Output Intent', category: 'output_intent', status: 'passed', message: 'OK', fixType: 'none' },
        { id: 'PDFX_PAGE_BOXES', title: 'Caixas de Página', category: 'geometry', status: 'passed', message: 'OK', fixType: 'none' },
      ],
      blockers: [],
      warnings: [],
      fixPlan: [],
      verifiedPdfX: false,
      summaryMessage: 'Arquivo tecnicamente elegível para PDF/X-4.',
    },
    verifiedPdfX: false,
    summaryMessage: 'Arquivo preparado.',
  };

  const html = renderToString(
    React.createElement(PdfxPreparationPanel, {
      analysis,
      profile: COMMERCIAL_PRINT_300DPI_PROFILE,
      initialPreparationResult: mockPreparationResult,
    })
  );

  // Assert both "Baixar PDF preparado" and "Gerar PDF/X-4" are rendered
  assert.ok(html.includes('Arquivo tecnicamente preparado'), 'Deve exibir título de arquivo preparado');
  assert.ok(html.includes('Pronto para geração PDF/X-4'), 'Deve exibir subtítulo de prontidão para PDF/X-4');
  assert.ok(html.includes('Baixar PDF preparado'), 'Deve exibir botão "Baixar PDF preparado"');
  assert.ok(html.includes('Gerar PDF/X-4'), 'DEVE exibir botão "Gerar PDF/X-4"');
});

test('2. UI Test Negativo: Quando eligibleAfterPreparation.eligible === false -> NÃO renderiza botão "Gerar PDF/X-4"', () => {
  const analysis = createDummyAnalysis();
  const mockPreparationResult: PdfxPreparationResult = {
    success: false,
    status: 'partially_prepared',
    steps: [],
    preparedPdfBase64: 'JVBERi0xLjQKJcTl8uXr...',
    originalSha256: 'abc123original',
    preparedSha256: 'def456prepared',
    eligibleAfterPreparation: {
      eligible: false,
      status: 'manual_required',
      checks: [
        { id: 'PDFX_FONTS', title: 'Fontes', category: 'fonts', status: 'manual_required', message: 'Fonte não incorporada', fixType: 'manual' },
      ],
      blockers: [{ code: 'PDFX_FONT_NOT_EMBEDDED', title: 'Fonte não incorporada', reason: 'Manual' }],
      warnings: [],
      fixPlan: [],
      verifiedPdfX: false,
      summaryMessage: 'Documento não elegível.',
    },
    verifiedPdfX: false,
    summaryMessage: 'Preparação parcial.',
  };

  const html = renderToString(
    React.createElement(PdfxPreparationPanel, {
      analysis,
      profile: COMMERCIAL_PRINT_300DPI_PROFILE,
      initialPreparationResult: mockPreparationResult,
    })
  );

  // Assert "Gerar PDF/X-4" is NOT rendered
  assert.ok(!html.includes('Gerar PDF/X-4'), 'NÃO deve exibir botão "Gerar PDF/X-4" quando elegibilidade for false');
});
