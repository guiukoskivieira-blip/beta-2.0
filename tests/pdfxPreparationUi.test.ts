import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { PdfxPreparationPanel } from '../src/components/PdfxPreparationPanel.tsx';
import { COMMERCIAL_PRINT_300DPI_PROFILE } from '../src/utils/productionProfiles.ts';
import type { PreflightAnalysis } from '../src/types/index.ts';

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

test('1. UI Test: Resposta real de /api/prepare-pdfx4 com sucesso -> Renderiza botões "Baixar PDF preparado" e "Gerar PDF/X-4"', () => {
  const analysis = createDummyAnalysis();

  // Exact shape returned by server.ts /api/prepare-pdfx4
  const realApiPreparationResponse = {
    success: true,
    status: 'prepared' as const,
    steps: [
      {
        code: 'PDFX_PREP_COLOR' as const,
        title: 'Conversão RGB → CMYK',
        status: 'applied' as const,
        before: 'DeviceRGB detectado no documento',
        after: 'DeviceCMYK calibrado via LittleCMS',
        evidence: 'RULE-PROF-CLR-001 aprovado pelo Motor 1',
      },
      {
        code: 'PDFX_PREP_OUTPUT_INTENT' as const,
        title: 'Configuração de Output Intent',
        status: 'applied' as const,
        before: 'Sem Output Intent GTS_PDFX',
        after: 'OutputIntent GTS_PDFX configurado (CGATS TR 001)',
        evidence: 'Perfil ICC incorporado (557168 bytes)',
        iccSha256: '992a7e7811f5fe042faebbb52479f64c67676634ce55a2985ca8654877f0a6d0',
      },
      {
        code: 'PDFX_PREP_BOXES' as const,
        title: 'Ajuste de TrimBox / BleedBox',
        status: 'applied' as const,
        before: 'Caixas de página incompletas ou ausentes',
        after: 'TrimBox e BleedBox explícitos configurados',
        evidence: 'RULE-PROF-BLD-001 aprovado pelo Motor 1',
      },
    ],
    eligibleAfterPreparation: {
      targetStandard: 'PDF/X-4' as const,
      eligible: true,
      status: 'eligible' as const,
      checks: [
        { id: 'PDFX_STRUCTURAL_VALIDITY', title: 'Estrutura Base do PDF', category: 'structure', status: 'passed', message: 'Estrutura PDF determinística aprovada pelo Motor 1.', fixType: 'none' },
        { id: 'PDFX_DETERMINABLE_DATA', title: 'Determinabilidade de Fluxos de Dados', category: 'structure', status: 'passed', message: 'Dados e fluxos de objetos determináveis e íntegros.', fixType: 'none' },
        { id: 'PDFX_FONTS', title: 'Incorporação de Tipografia', category: 'fonts', status: 'passed', message: 'Nenhuma fonte externa utilizada (ou texto já convertido em curvas).', fixType: 'none' },
        { id: 'PDFX_OUTPUT_INTENT', title: 'Output Intent (Intenção de Saída ICC)', category: 'output_intent', status: 'passed', message: 'Output Intent compatível detectado (CGATS TR 001).', fixType: 'none' },
        { id: 'PDFX_TRIMBOX', title: 'Caixa de Corte (TrimBox)', category: 'geometry', status: 'passed', message: 'TrimBox explícito e válido presente em todas as 1 página(s).', fixType: 'none' },
        { id: 'PDFX_BLEEDBOX', title: 'Caixa de Sangria (BleedBox)', category: 'geometry', status: 'passed', message: 'BleedBox válido e conforme com a sangria exigida de 3 mm.', fixType: 'none' },
        { id: 'PDFX_COLOR_SPACES', title: 'Espaços de Cor e Objetos RGB', category: 'color', status: 'passed', message: 'Documento contém exclusivamente espaços de cor CMYK / Gray / Spot compativeis.', fixType: 'none' },
        { id: 'PDFX_TRANSPARENCY', title: 'Transparências e Camadas', category: 'transparency', status: 'passed', message: 'Nenhuma transparência ativa detectada.', fixType: 'none' },
        { id: 'PDFX_ENCRYPTION', title: 'Criptografia e Senhas', category: 'security', status: 'passed', message: 'Documento sem criptografia ou restrições de acesso.', fixType: 'none' },
        { id: 'PDFX_EXTERNAL_CONTENT', title: 'Conteúdo e Referências Externas', category: 'external', status: 'passed', message: 'Todo o conteúdo gráfico é autocontido no documento.', fixType: 'none' },
        { id: 'PDFX_PAGE_BOXES', title: 'Consistência Geométrica de Caixas', category: 'geometry', status: 'passed', message: 'Hierarquia geométrica válida (TrimBox ⊆ BleedBox ⊆ MediaBox).', fixType: 'none' },
      ],
      blockers: [],
      warnings: [],
      fixPlan: [],
      verifiedPdfX: false,
      summaryMessage: 'Documento totalmente elegível para preparação no padrão PDF/X-4.',
    },
    preparedPdfBase64: 'JVBERi0xLjQKJcTl8uXr...',
    preparedPdfSize: 560000,
    originalSha256: '992a7e7811f5fe042faebbb52479f64c67676634ce55a2985ca8654877f0a6d0',
    preparedSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    verifiedPdfX: false as const,
    summaryMessage: 'Arquivo tecnicamente preparado para geração PDF/X-4. Todas as correções automáticas foram aplicadas e validadas pelo Motor 1.',
  };

  const html = renderToString(
    React.createElement(PdfxPreparationPanel, {
      analysis,
      profile: COMMERCIAL_PRINT_300DPI_PROFILE,
      initialPreparationResult: realApiPreparationResponse,
    })
  );

  // Assert both "Baixar PDF preparado" and "Gerar PDF/X-4" are rendered
  assert.ok(html.includes('Arquivo tecnicamente preparado'), 'Deve exibir título "Arquivo tecnicamente preparado"');
  assert.ok(html.includes('Pronto para geração PDF/X-4'), 'Deve exibir subtítulo "Pronto para geração PDF/X-4"');
  assert.ok(html.includes('Baixar PDF preparado'), 'Deve exibir botão "Baixar PDF preparado"');
  assert.ok(html.includes('Gerar PDF/X-4'), 'DEVE exibir botão "Gerar PDF/X-4"');
});

test('2. UI Test Negativo: Resposta real com eligibleAfterPreparation.eligible === false -> NÃO renderiza botão "Gerar PDF/X-4"', () => {
  const analysis = createDummyAnalysis();
  const realApiBlockedResponse = {
    success: false,
    status: 'partially_prepared' as const,
    steps: [],
    eligibleAfterPreparation: {
      targetStandard: 'PDF/X-4' as const,
      eligible: false,
      status: 'manual_required' as const,
      checks: [
        { id: 'PDFX_FONTS', title: 'Incorporação de Tipografia', category: 'fonts', status: 'manual_required', message: 'Fonte não incorporada', fixType: 'manual' },
      ],
      blockers: [{ code: 'PDFX_FONT_NOT_EMBEDDED', title: 'Fonte não incorporada', reason: 'Requer curvas' }],
      warnings: [],
      fixPlan: [],
      verifiedPdfX: false,
      summaryMessage: 'Documento contém fontes não incorporadas.',
    },
    preparedPdfBase64: 'JVBERi0xLjQKJcTl8uXr...',
    preparedPdfSize: 1000,
    originalSha256: 'abc123',
    preparedSha256: 'def456',
    verifiedPdfX: false as const,
    summaryMessage: 'Preparação parcial.',
  };

  const html = renderToString(
    React.createElement(PdfxPreparationPanel, {
      analysis,
      profile: COMMERCIAL_PRINT_300DPI_PROFILE,
      initialPreparationResult: realApiBlockedResponse,
    })
  );

  // Assert "Gerar PDF/X-4" is NOT rendered
  assert.ok(!html.includes('Gerar PDF/X-4'), 'NÃO deve exibir botão "Gerar PDF/X-4" quando eligibleAfterPreparation.eligible for false');
});
