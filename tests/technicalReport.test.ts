/**
 * ARTECHECK — Testes de Relatórios Técnicos e Comparação Antes/Depois.
 */
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { PDFDocument } from 'pdf-lib';
import {
  createAnalysisSnapshot,
  compareRuleSnapshots,
  buildTechnicalReport,
  type SnapshotRuleItem,
} from '../src/services/technicalReport';
import {
  generateTechnicalReportPdf,
  generateReportPdfFileName,
} from '../src/services/reportPdfGenerator';
import { COMMERCIAL_PRINT_300DPI_PROFILE } from '../src/utils/productionProfiles';
import { LocalStorageProvider } from '../src/storage/LocalStorageProvider';
import type { PreflightAnalysis } from '../src/types';

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ REPORT ${passed}: ${name}`);
  } catch (err: any) {
    failed++;
    console.log(`  ✗ REPORT ${passed + failed}: ${name} — ${err.message}`);
  }
}

function extractAllPdfText(pdfBytes: Uint8Array): string {
  let combinedText = '';
  const buffer = Buffer.from(pdfBytes);
  let pos = 0;
  while (pos < buffer.length) {
    let streamIndex = buffer.indexOf('stream\r\n', pos);
    let offset = 8;
    if (streamIndex === -1) {
      streamIndex = buffer.indexOf('stream\n', pos);
      offset = 7;
    }
    if (streamIndex === -1) break;

    const streamStart = streamIndex + offset;
    const endStreamIndex = buffer.indexOf('endstream', streamStart);
    if (endStreamIndex === -1) break;

    const streamData = buffer.subarray(streamStart, endStreamIndex);
    let streamContent = '';
    try {
      streamContent = zlib.inflateSync(streamData).toString('latin1');
    } catch {
      streamContent = streamData.toString('latin1');
    }

    // Decodifica strings hexadecimais do PDF emitidas pelo pdf-lib: <hex> Tj
    const decodedStream = streamContent.replace(/<([0-9a-fA-F]+)>\s*Tj/g, (_, hex) => {
      try {
        return Buffer.from(hex, 'hex').toString('latin1');
      } catch {
        return hex;
      }
    });

    combinedText += ' ' + decodedStream;
    pos = endStreamIndex + 9;
  }
  return combinedText;
}

async function run() {
  console.log('================================================================');
  console.log('ARTECHECK — RELATÓRIOS TÉCNICOS E COMPARAÇÃO ANTES/DEPOIS');
  console.log('================================================================');

  const mockAnalysis: PreflightAnalysis = {
    id: 'test_analysis_001',
    createdAt: 1718000000000,
    fileName: 'catalogo_verao_2026.pdf',
    fileSizeBytes: 2048576,
    profileId: COMMERCIAL_PRINT_300DPI_PROFILE.id,
    document: {
      pageCount: 4,
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
          hasTransparency: false,
          imageOccurrences: [],
          colorOccurrences: [],
        },
      ],
      fonts: [
        { id: 'f1', cleanFontName: 'Helvetica', isEmbedded: 'yes', isUsedInContent: true },
      ],
      colorSummary: {
        hasRgb: true,
        hasCmyk: true,
        hasSpotColors: false,
        familiesDetected: ['DeviceCMYK', 'DeviceRGB'],
      },
      pdfxInfo: {
        isDeclaredPdfX: true,
        declarationStatus: 'declared',
        declaredVersion: 'PDF/X-1a:2001',
        recognizedStandard: 'PDF/X-1a',
      },
    },
    ruleResults: {
      profileUsed: { id: COMMERCIAL_PRINT_300DPI_PROFILE.id, name: COMMERCIAL_PRINT_300DPI_PROFILE.name },
      totalRules: 5,
      approvedCount: 3,
      warningCount: 1,
      errorCount: 1,
      undeterminedCount: 0,
      universalRules: [],
      profileRules: [],
      results: [
        {
          ruleId: 'RULE-PROF-BLD-001',
          title: 'Sangria de Impressão',
          category: 'profile_conditioned',
          status: 'error',
          evidence: 'TrimBox ausente; sangria indefinida',
          explanation: 'Arquivo não possui caixas de corte e sangria.',
          recommendation: 'Configurar TrimBox e sangria de 3mm.',
        },
        {
          ruleId: 'RULE-PROF-CLR-001',
          title: 'Espaço de Cor',
          category: 'profile_conditioned',
          status: 'warning',
          evidence: '12 elementos em RGB encontrados',
          explanation: 'Elementos em RGB podem sofrer variação de tonalidade.',
          recommendation: 'Converter imagens e vetores para CMYK.',
        },
        {
          ruleId: 'RULE-PAGE-SIZE-001',
          title: 'Dimensão das Páginas',
          category: 'profile_conditioned',
          status: 'approved',
          evidence: '210 x 297 mm em todas as páginas',
          explanation: 'Páginas dentro da tolerância.',
          recommendation: '',
        },
      ],
      scoreSummary: {
        score: 65,
        classification: 'blocked',
        label: 'Impressão Inviável',
        color: '#FF4D4D',
        approvedCount: 3,
        warningCount: 1,
        errorCount: 1,
        undeterminedCount: 0,
      },
      grouped: {
        approved: [],
        warning: [],
        error: [],
        undetermined: [],
      },
    },
  };

  // 1. PDF apenas declarado como PDF/X NÃO aparece como "Em conformidade"
  await test('1. PDF apenas declarado como PDF/X NÃO aparece como "Em conformidade"', async () => {
    const snapshot = createAnalysisSnapshot(mockAnalysis, COMMERCIAL_PRINT_300DPI_PROFILE);
    const report = buildTechnicalReport(snapshot, null, COMMERCIAL_PRINT_300DPI_PROFILE);
    const pdfBytes = await generateTechnicalReportPdf(report);
    const decompressedText = extractAllPdfText(pdfBytes);

    // Não pode conter "PDF/X: Em conformidade" ou "Em conformidade"
    assert.ok(!decompressedText.includes('PDF/X: Em conformidade'));
    assert.ok(!decompressedText.includes('Em conformidade'));
  });

  // 2. Versão declarada aparece corretamente
  await test('2. Versão declarada aparece corretamente (PDF/X declarado: PDF/X-1a:2001)', async () => {
    const snapshot = createAnalysisSnapshot(mockAnalysis, COMMERCIAL_PRINT_300DPI_PROFILE);
    assert.equal(snapshot.documentSummary.declaredPdfX, 'PDF/X-1a:2001');

    const report = buildTechnicalReport(snapshot, null, COMMERCIAL_PRINT_300DPI_PROFILE);
    const pdfBytes = await generateTechnicalReportPdf(report);
    const decompressedText = extractAllPdfText(pdfBytes);

    assert.ok(decompressedText.includes('PDF/X declarado:'));
    assert.ok(decompressedText.includes('PDF/X-1a:2001'));
  });

  // 3. declaredPdfX não implica verifiedPdfX
  await test('3. declaredPdfX não implica verifiedPdfX (verifiedPdfX === false)', () => {
    const snapshot = createAnalysisSnapshot(mockAnalysis, COMMERCIAL_PRINT_300DPI_PROFILE);
    assert.equal(snapshot.documentSummary.isDeclaredPdfX, true);
    assert.equal(snapshot.documentSummary.declaredPdfX, 'PDF/X-1a:2001');
    assert.equal(snapshot.documentSummary.verifiedPdfX, false);
  });

  // 4. UNDETERMINED aparece no contador
  await test('4. UNDETERMINED aparece no contador do resumo', async () => {
    const analysisWithUndetermined: PreflightAnalysis = {
      ...mockAnalysis,
      ruleResults: {
        ...mockAnalysis.ruleResults,
        approvedCount: 8,
        warningCount: 0,
        errorCount: 0,
        undeterminedCount: 1,
        scoreSummary: {
          score: 85,
          classification: 'review',
          label: 'Necessita Revisão',
          color: '#F59E0B',
          approvedCount: 8,
          warningCount: 0,
          errorCount: 0,
          undeterminedCount: 1,
        },
      },
    };

    const snapshot = createAnalysisSnapshot(analysisWithUndetermined, COMMERCIAL_PRINT_300DPI_PROFILE);
    assert.equal(snapshot.undeterminedCount, 1);

    const report = buildTechnicalReport(snapshot, null, COMMERCIAL_PRINT_300DPI_PROFILE);
    assert.equal(report.undeterminedCount, 1);

    const pdfBytes = await generateTechnicalReportPdf(report);
    const decompressedText = extractAllPdfText(pdfBytes);
    assert.ok(decompressedText.includes('Indeterminados: 1'));
  });

  // 5. 8 approved + 1 undetermined resulta exatamente nesses números
  await test('5. 8 approved + 1 undetermined resulta exatamente nesses números', () => {
    const analysis8Plus1: PreflightAnalysis = {
      ...mockAnalysis,
      ruleResults: {
        ...mockAnalysis.ruleResults,
        approvedCount: 8,
        warningCount: 0,
        errorCount: 0,
        undeterminedCount: 1,
        scoreSummary: {
          score: 88,
          classification: 'review',
          label: 'Necessita Revisão',
          color: '#F59E0B',
          approvedCount: 8,
          warningCount: 0,
          errorCount: 0,
          undeterminedCount: 1,
        },
      },
    };

    const snapshot = createAnalysisSnapshot(analysis8Plus1, COMMERCIAL_PRINT_300DPI_PROFILE);
    assert.equal(snapshot.approvedCount, 8);
    assert.equal(snapshot.warningCount, 0);
    assert.equal(snapshot.errorCount, 0);
    assert.equal(snapshot.undeterminedCount, 1);
  });

  // 6. REVIEW com indeterminado possui explicação adequada
  await test('6. REVIEW com indeterminado possui explicação adequada', async () => {
    const analysisReviewUndetermined: PreflightAnalysis = {
      ...mockAnalysis,
      ruleResults: {
        ...mockAnalysis.ruleResults,
        approvedCount: 8,
        warningCount: 0,
        errorCount: 0,
        undeterminedCount: 1,
        scoreSummary: {
          score: 88,
          classification: 'review',
          label: 'Necessita Revisão',
          color: '#F59E0B',
          approvedCount: 8,
          warningCount: 0,
          errorCount: 0,
          undeterminedCount: 1,
        },
      },
    };

    const snapshot = createAnalysisSnapshot(analysisReviewUndetermined, COMMERCIAL_PRINT_300DPI_PROFILE);
    assert.ok(snapshot.reviewExplanation);
    assert.equal(
      snapshot.reviewExplanation,
      'Status REVIEW — existem verificações que não puderam ser determinadas de forma conclusiva.'
    );

    const report = buildTechnicalReport(snapshot, null, COMMERCIAL_PRINT_300DPI_PROFILE);
    const pdfBytes = await generateTechnicalReportPdf(report);
    const decompressedText = extractAllPdfText(pdfBytes);
    assert.ok(decompressedText.includes('Status REVIEW'));
    assert.ok(decompressedText.includes('determinadas de forma conclusiva'));
  });

  // 7. Relatório final pós-correção usa a mesma semântica
  await test('7. Relatório final pós-correção usa a mesma semântica (distinção PDF/X e contadores)', async () => {
    const snapshotBefore = createAnalysisSnapshot(mockAnalysis, COMMERCIAL_PRINT_300DPI_PROFILE);

    const postFixAnalysis: PreflightAnalysis = {
      ...mockAnalysis,
      id: 'test_analysis_fixed',
      document: {
        ...mockAnalysis.document,
        pdfxInfo: {
          isDeclaredPdfX: true,
          declarationStatus: 'declared',
          declaredVersion: 'PDF/X-1a:2001',
          recognizedStandard: 'PDF/X-1a',
        },
      },
      ruleResults: {
        ...mockAnalysis.ruleResults,
        errorCount: 0,
        warningCount: 1,
        approvedCount: 4,
        undeterminedCount: 0,
        results: [
          {
            ruleId: 'RULE-PROF-BLD-001',
            title: 'Sangria de Impressão',
            category: 'profile_conditioned',
            status: 'approved',
            evidence: 'TrimBox e BleedBox configurados',
            explanation: 'Corrigido',
            recommendation: '',
          },
          {
            ruleId: 'RULE-PROF-CLR-001',
            title: 'Espaço de Cor',
            category: 'profile_conditioned',
            status: 'warning',
            evidence: '12 elementos em RGB encontrados',
            explanation: 'Elementos em RGB podem sofrer variação de tonalidade.',
            recommendation: 'Converter imagens e vetores para CMYK.',
          },
          {
            ruleId: 'RULE-PAGE-SIZE-001',
            title: 'Dimensão das Páginas',
            category: 'profile_conditioned',
            status: 'approved',
            evidence: '210 x 297 mm em todas as páginas',
            explanation: 'Páginas dentro da tolerância.',
            recommendation: '',
          },
        ],
        scoreSummary: {
          score: 95,
          classification: 'approved',
          label: 'Pronto para Impressão',
          color: '#00D18F',
          approvedCount: 4,
          warningCount: 1,
          errorCount: 0,
          undeterminedCount: 0,
        },
      },
    };

    const report = buildTechnicalReport(snapshotBefore, postFixAnalysis, COMMERCIAL_PRINT_300DPI_PROFILE, {
      fixDescription: 'Correção de TrimBox e BleedBox',
      reanalyzedByMotor1: true,
    });

    assert.equal(report.postFixSnapshot?.documentSummary.declaredPdfX, 'PDF/X-1a:2001');
    assert.equal(report.postFixSnapshot?.documentSummary.verifiedPdfX, false);
    assert.equal(report.correctedCount, 1);
    assert.equal(report.undeterminedCount, 0);

    const pdfBytes = await generateTechnicalReportPdf(report);
    const decompressedText = extractAllPdfText(pdfBytes);
    assert.ok(decompressedText.includes('PDF/X declarado:'));
    assert.ok(!decompressedText.includes('Em conformidade'));
    assert.ok(decompressedText.includes('Indeterminados: 0'));
  });

  // 8. Exportação PDF continua válida
  await test('8. Exportação PDF continua válida e parseável pelo PDFDocument', async () => {
    const snapshot = createAnalysisSnapshot(mockAnalysis, COMMERCIAL_PRINT_300DPI_PROFILE);
    const report = buildTechnicalReport(snapshot, null, COMMERCIAL_PRINT_300DPI_PROFILE);

    const pdfBytes = await generateTechnicalReportPdf(report);

    assert.ok(pdfBytes instanceof Uint8Array);
    assert.ok(pdfBytes.length > 1000);

    // Valida cabeçalho PDF
    const header = String.fromCharCode(...pdfBytes.slice(0, 5));
    assert.equal(header, '%PDF-');

    // Valida carregamento real pelo pdf-lib
    const parsedDoc = await PDFDocument.load(pdfBytes);
    assert.ok(parsedDoc.getPageCount() >= 1);

    // Valida nome do arquivo
    const fileName = generateReportPdfFileName(report.fileName, report.generatedAt);
    assert.match(fileName, /^ArteCheck_Relatorio_catalogo_verao_2026_\d{4}-\d{2}-\d{2}_\d{4}\.pdf$/);
  });

  // 9. Snapshot inicial é IMUTÁVEL
  await test('9. Snapshot inicial é IMUTÁVEL e não sofre mutação externa', () => {
    const snapshot = createAnalysisSnapshot(mockAnalysis, COMMERCIAL_PRINT_300DPI_PROFILE);

    assert.equal(snapshot.id, 'test_analysis_001');
    assert.equal(snapshot.score, 65);
    assert.equal(snapshot.errorCount, 1);
    assert.equal(snapshot.warningCount, 1);

    // Tenta mutar o mock
    (mockAnalysis.ruleResults.scoreSummary as any).score = 100;
    (mockAnalysis as any).fileName = 'modificado_depois.pdf';

    assert.equal(snapshot.score, 65);
    assert.equal(snapshot.fileName, 'catalogo_verao_2026.pdf');

    // Restaura o mock
    (mockAnalysis.ruleResults.scoreSummary as any).score = 65;
    (mockAnalysis as any).fileName = 'catalogo_verao_2026.pdf';
  });

  // 10. Histórico mantém e recupera estado de antes/depois
  await test('10. Histórico mantém e recupera snapshots de antes e depois com dados técnicos', async () => {
    const storage = new LocalStorageProvider();
    const snapshotBefore = createAnalysisSnapshot(mockAnalysis, COMMERCIAL_PRINT_300DPI_PROFILE);

    await storage.saveAnalysis({
      id: 'history_record_pdfx_undetermined',
      createdAt: Date.now(),
      fileName: 'banner_promocional.pdf',
      fileSizeBytes: 512000,
      segmentName: 'Comercial',
      productName: 'Banner Lona',
      variantName: 'Padrão',
      productionProfileId: COMMERCIAL_PRINT_300DPI_PROFILE.id,
      status: 'review',
      score: 85,
      errorCount: 0,
      warningCount: 0,
      approvedCount: 8,
      initialSnapshot: snapshotBefore,
    });

    const retrieved = await storage.getAnalysis('history_record_pdfx_undetermined');
    assert.ok(retrieved);
    assert.equal(retrieved?.initialSnapshot?.documentSummary.declaredPdfX, 'PDF/X-1a:2001');
    assert.equal(retrieved?.initialSnapshot?.documentSummary.verifiedPdfX, false);
  });

  console.log(`Relatórios Técnicos: ${passed}/${passed + failed} aprovados`);
  if (failed > 0) process.exit(1);
}

run();
