/**
 * ARTECHECK — Testes de Relatórios Técnicos e Comparação Antes/Depois.
 */
import assert from 'node:assert/strict';
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
        isDeclaredPdfX: false,
        declarationStatus: 'not_declared',
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

  await test('Snapshot inicial é IMUTÁVEL e não é sobrescrito quando o objeto original sofre mutação', () => {
    const snapshot = createAnalysisSnapshot(mockAnalysis, COMMERCIAL_PRINT_300DPI_PROFILE);

    assert.equal(snapshot.id, 'test_analysis_001');
    assert.equal(snapshot.score, 65);
    assert.equal(snapshot.errorCount, 1);
    assert.equal(snapshot.warningCount, 1);
    assert.equal(snapshot.rules.length, 3);

    // Tenta mutar o objeto mock original
    (mockAnalysis.ruleResults.scoreSummary as any).score = 100;
    (mockAnalysis.ruleResults as any).errorCount = 0;
    (mockAnalysis as any).fileName = 'modificado_depois.pdf';

    // O snapshot não pode ter sido alterado
    assert.equal(snapshot.score, 65);
    assert.equal(snapshot.errorCount, 1);
    assert.equal(snapshot.fileName, 'catalogo_verao_2026.pdf');

    // Restaura o mock
    (mockAnalysis.ruleResults.scoreSummary as any).score = 65;
    (mockAnalysis.ruleResults as any).errorCount = 1;
    (mockAnalysis as any).fileName = 'catalogo_verao_2026.pdf';
  });

  await test('Comparação de regras: "corrected" EXIGE reanálise obrigatória pelo Motor 1', () => {
    const beforeRules: SnapshotRuleItem[] = [
      {
        ruleId: 'RULE-PROF-BLD-001',
        title: 'Sangria de Impressão',
        category: 'profile_conditioned',
        status: 'error',
        evidence: 'TrimBox ausente',
        explanation: 'Falta sangria',
        recommendation: 'Ajustar sangria',
      },
    ];

    const afterRules: SnapshotRuleItem[] = [
      {
        ruleId: 'RULE-PROF-BLD-001',
        title: 'Sangria de Impressão',
        category: 'profile_conditioned',
        status: 'approved',
        evidence: 'TrimBox e BleedBox configurados',
        explanation: 'Corrigido',
        recommendation: '',
      },
    ];

    // SEM reanálise (reanalyzedByMotor1: false) -> NUNCA declarar 'corrected'
    const unverifiedComparison = compareRuleSnapshots(beforeRules, afterRules, false);
    assert.notEqual(unverifiedComparison[0].comparison, 'corrected');
    assert.equal(unverifiedComparison[0].comparison, 'unchanged');

    // COM reanálise confirmada pelo Motor 1 (reanalyzedByMotor1: true) -> 'corrected'
    const verifiedComparison = compareRuleSnapshots(beforeRules, afterRules, true);
    assert.equal(verifiedComparison[0].comparison, 'corrected');
  });

  await test('Comparação de regras: detecta "new_issue" corretamente', () => {
    const beforeRules: SnapshotRuleItem[] = [
      {
        ruleId: 'RULE-PROF-BLD-001',
        title: 'Sangria',
        category: 'profile_conditioned',
        status: 'approved',
        evidence: 'Ok',
        explanation: '',
        recommendation: '',
      },
    ];

    const afterRules: SnapshotRuleItem[] = [
      {
        ruleId: 'RULE-PROF-BLD-001',
        title: 'Sangria',
        category: 'profile_conditioned',
        status: 'approved',
        evidence: 'Ok',
        explanation: '',
        recommendation: '',
      },
      {
        ruleId: 'RULE-FONT-001',
        title: 'Fontes Não Incorporadas',
        category: 'universal',
        status: 'error',
        evidence: 'Fonte Arial não embutida',
        explanation: 'Novo problema detectado',
        recommendation: 'Incorporar fonte',
      },
    ];

    const comparison = compareRuleSnapshots(beforeRules, afterRules, true);
    const newIssue = comparison.find((r) => r.ruleId === 'RULE-FONT-001');

    assert.ok(newIssue);
    assert.equal(newIssue?.comparison, 'new_issue');
  });

  await test('Comparação de regras: detecta "worsened" e "improved" corretamente', () => {
    const beforeRules: SnapshotRuleItem[] = [
      {
        ruleId: 'RULE-1',
        title: 'Regra 1',
        category: 'universal',
        status: 'approved',
        evidence: 'Ok',
        explanation: '',
        recommendation: '',
      },
      {
        ruleId: 'RULE-2',
        title: 'Regra 2',
        category: 'universal',
        status: 'error',
        evidence: 'Erro gravíssimo',
        explanation: '',
        recommendation: '',
      },
    ];

    const afterRules: SnapshotRuleItem[] = [
      {
        ruleId: 'RULE-1',
        title: 'Regra 1',
        category: 'universal',
        status: 'warning',
        evidence: 'Aviso detectado',
        explanation: '',
        recommendation: '',
      },
      {
        ruleId: 'RULE-2',
        title: 'Regra 2',
        category: 'universal',
        status: 'warning',
        evidence: 'Aviso tolerável',
        explanation: '',
        recommendation: '',
      },
    ];

    const comparison = compareRuleSnapshots(beforeRules, afterRules, true);
    const rule1 = comparison.find((r) => r.ruleId === 'RULE-1');
    const rule2 = comparison.find((r) => r.ruleId === 'RULE-2');

    assert.equal(rule1?.comparison, 'worsened');
    assert.equal(rule2?.comparison, 'improved');
  });

  await test('Geração de PDF do relatório: gera documento válido e parseável', async () => {
    const snapshot = createAnalysisSnapshot(mockAnalysis, COMMERCIAL_PRINT_300DPI_PROFILE);
    const report = buildTechnicalReport(snapshot, null, COMMERCIAL_PRINT_300DPI_PROFILE);

    const pdfBytes = await generateTechnicalReportPdf(report);

    assert.ok(pdfBytes instanceof Uint8Array);
    assert.ok(pdfBytes.length > 1000);

    // Valida cabeçalho PDF (%PDF-1.)
    const header = String.fromCharCode(...pdfBytes.slice(0, 5));
    assert.equal(header, '%PDF-');

    // Valida que pode ser carregado por um parser PDF real
    const parsedDoc = await PDFDocument.load(pdfBytes);
    assert.ok(parsedDoc.getPageCount() >= 1);

    // Valida nome do arquivo padronizado
    const fileName = generateReportPdfFileName(report.fileName, report.generatedAt);
    assert.match(fileName, /^ArteCheck_Relatorio_catalogo_verao_2026_\d{4}-\d{2}-\d{2}_\d{4}\.pdf$/);
  });

  await test('Relatório NÃO contém tokens, chaves de API, senhas ou segredos', async () => {
    const snapshot = createAnalysisSnapshot(mockAnalysis, COMMERCIAL_PRINT_300DPI_PROFILE);
    const report = buildTechnicalReport(snapshot, null, COMMERCIAL_PRINT_300DPI_PROFILE);
    const pdfBytes = await generateTechnicalReportPdf(report);

    const rawPdfText = new TextDecoder('latin1').decode(pdfBytes);

    assert.ok(!rawPdfText.includes('AIzaSy'));
    assert.ok(!rawPdfText.includes('GEMINI_API_KEY'));
    assert.ok(!rawPdfText.includes('SUPABASE_KEY'));
    assert.ok(!rawPdfText.includes('sk-'));
    assert.ok(!rawPdfText.includes('Bearer '));
  });

  await test('Histórico mantém e recupera estado de antes/depois', async () => {
    const storage = new LocalStorageProvider();

    const snapshotBefore = createAnalysisSnapshot(mockAnalysis, COMMERCIAL_PRINT_300DPI_PROFILE);

    const postFixAnalysis: PreflightAnalysis = {
      ...mockAnalysis,
      id: 'test_analysis_001_fixed',
      ruleResults: {
        ...mockAnalysis.ruleResults,
        errorCount: 0,
        warningCount: 1,
        approvedCount: 4,
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
          ...mockAnalysis.ruleResults.scoreSummary,
          score: 95,
          classification: 'approved',
          label: 'Pronto para Impressão',
          color: '#00D18F',
        },
      },
    };

    const snapshotAfter = createAnalysisSnapshot(postFixAnalysis, COMMERCIAL_PRINT_300DPI_PROFILE);
    const reportData = buildTechnicalReport(snapshotBefore, postFixAnalysis, COMMERCIAL_PRINT_300DPI_PROFILE, {
      fixDescription: 'Correção de TrimBox e BleedBox',
      reanalyzedByMotor1: true,
    });

    await storage.saveAnalysis({
      id: 'history_record_123',
      createdAt: Date.now(),
      fileName: 'cartao_visita.pdf',
      fileSizeBytes: 102400,
      segmentName: 'Comercial',
      productName: 'Folheto A4',
      variantName: 'Padrão',
      productionProfileId: COMMERCIAL_PRINT_300DPI_PROFILE.id,
      status: 'approved',
      score: 95,
      errorCount: 0,
      warningCount: 1,
      approvedCount: 4,
      initialSnapshot: snapshotBefore,
      postFixSnapshot: snapshotAfter,
      reportData,
    });

    const retrieved = await storage.getAnalysis('history_record_123');
    assert.ok(retrieved);
    assert.equal(retrieved?.initialSnapshot?.score, 65);
    assert.equal(retrieved?.postFixSnapshot?.score, 95);
    assert.equal(retrieved?.reportData?.correctedCount, 1);
    assert.equal(retrieved?.reportData?.finalTechnicalState, 'approved');
  });

  console.log(`Relatórios Técnicos: ${passed}/${passed + failed} aprovados`);
  if (failed > 0) process.exit(1);
}

run();
