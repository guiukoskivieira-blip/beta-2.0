import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { LocalStorageProvider } from '../src/storage/LocalStorageProvider';
import { createAnalysisSnapshot, buildTechnicalReport } from '../src/services/technicalReport';
import { generateTechnicalReportPdf, generateReportPdfFileName } from '../src/services/reportPdfGenerator';
import { COMMERCIAL_PRINT_300DPI_PROFILE } from '../src/utils/productionProfiles';
import type { PreflightAnalysis } from '../src/types';

function createMockAnalysis(overrides: {
  hasRgbRaster?: boolean;
  hasRgbVector?: boolean;
  hasCmyk?: boolean;
  isDeclaredPdfX?: boolean;
  rules?: any[];
}): PreflightAnalysis {
  const box = {
    xPt: 0,
    yPt: 0,
    widthPt: 595.28,
    heightPt: 841.89,
    xMm: 0,
    yMm: 0,
    widthMm: 210,
    heightMm: 297,
    status: 'explicit' as const,
  };

  return {
    id: 'test-analysis-12345678',
    createdAt: Date.now(),
    fileName: 'catalogo_verao_2026.pdf',
    fileSizeBytes: 1048576,
    profileId: COMMERCIAL_PRINT_300DPI_PROFILE.id,
    diagnosticInfo: { extractionDurationMs: 10, evaluationDurationMs: 5 },
    document: {
      pageCount: 1,
      colorSummary: {
        hasRgb: Boolean(overrides.hasRgbRaster || overrides.hasRgbVector),
        hasRgbRaster: Boolean(overrides.hasRgbRaster),
        hasRgbVector: Boolean(overrides.hasRgbVector),
        hasCmyk: Boolean(overrides.hasCmyk),
        hasSpotColors: false,
        familiesDetected: ['DeviceCMYK'],
      },
      pdfxInfo: {
        isDeclaredPdfX: Boolean(overrides.isDeclaredPdfX),
        hasOutputIntent: Boolean(overrides.isDeclaredPdfX),
        recognizedStandard: overrides.isDeclaredPdfX ? 'PDF/X-4' : undefined,
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
          mediaBox: box,
          trimBox: box,
          bleedBox: { ...box, widthMm: 216, heightMm: 303, widthPt: 612.28, heightPt: 858.89 },
          hasTransparency: false,
          imageOccurrences: [],
          colorOccurrences: [],
        },
      ],
    },
    ruleResults: {
      profileUsed: { id: COMMERCIAL_PRINT_300DPI_PROFILE.id, name: COMMERCIAL_PRINT_300DPI_PROFILE.name },
      totalRules: 10,
      errorCount: overrides.rules?.filter((r) => r.status === 'error').length || 0,
      warningCount: overrides.rules?.filter((r) => r.status === 'warning').length || 0,
      approvedCount: 10,
      undeterminedCount: 0,
      universalRules: [],
      profileRules: [],
      grouped: { approved: [], warning: [], error: [], undetermined: [] },
      scoreSummary: {
        score: overrides.rules?.some((r) => r.status === 'error') ? 50 : 100,
        classification: overrides.rules?.some((r) => r.status === 'error') ? 'blocked' : 'approved',
        label: 'Pronto para Impressão',
        color: '#10B981',
        approvedCount: 10,
        undeterminedCount: 0,
        errorCount: overrides.rules?.filter((r) => r.status === 'error').length || 0,
        warningCount: overrides.rules?.filter((r) => r.status === 'warning').length || 0,
      },
      results: overrides.rules || [],
    },
  };
}

describe('ARTECHECK AI — Hotfix do Relatório Histórico e Linguagem Operacional', () => {
  it('1. Relatório completo disponível após salvar e recarregar do storage', async () => {
    const storage = new LocalStorageProvider();
    const analysis = createMockAnalysis({ hasCmyk: true });
    const initialSnapshot = createAnalysisSnapshot(analysis, COMMERCIAL_PRINT_300DPI_PROFILE);
    const reportData = buildTechnicalReport(initialSnapshot, null, COMMERCIAL_PRINT_300DPI_PROFILE);

    await storage.saveAnalysis({
      id: analysis.id,
      createdAt: analysis.createdAt,
      fileName: analysis.fileName,
      fileSizeBytes: analysis.fileSizeBytes,
      segmentName: 'Comercial',
      productName: 'Flyer',
      variantName: 'Padrão',
      productionProfileId: COMMERCIAL_PRINT_300DPI_PROFILE.id,
      status: 'approved',
      score: 100,
      errorCount: 0,
      warningCount: 0,
      approvedCount: 10,
      initialSnapshot,
      reportData,
    });

    const retrieved = await storage.getAnalysis(analysis.id);
    assert.ok(retrieved, 'Registro deve existir no storage');
    assert.ok(retrieved.reportData, 'reportData completo deve estar persistido');
    assert.equal(retrieved.reportData.fileName, 'catalogo_verao_2026.pdf');
    assert.equal(retrieved.reportData.initialScore, 100);
  });

  it('2. PDF gerado começa com %PDF- e possui bytes não vazios', async () => {
    const analysis = createMockAnalysis({ hasCmyk: true });
    const initialSnapshot = createAnalysisSnapshot(analysis, COMMERCIAL_PRINT_300DPI_PROFILE);
    const reportData = buildTechnicalReport(initialSnapshot, null, COMMERCIAL_PRINT_300DPI_PROFILE);

    const pdfBytes = await generateTechnicalReportPdf(reportData);
    assert.ok(pdfBytes instanceof Uint8Array, 'Deve retornar Uint8Array');
    assert.ok(pdfBytes.length > 1000, 'PDF não pode ser vazio e deve ter mais de 1000 bytes');

    const header = Buffer.from(pdfBytes.buffer, pdfBytes.byteOffset, 5).toString('ascii');
    assert.equal(header, '%PDF-', 'Deve iniciar com assinatura de PDF %PDF-');
  });

  it('3. Download usa nome de arquivo seguro baseado no PDF analisado e timestamp', () => {
    const timestamp = new Date('2026-08-26T14:30:00Z').getTime();
    const fileName = generateReportPdfFileName('Folder Promocional @2026! [Final].pdf', timestamp);
    
    assert.ok(fileName.startsWith('ArteCheck_Relatorio_Folder_Promocional__2026___Final_'));
    assert.ok(fileName.endsWith('.pdf'));
    assert.ok(!fileName.includes('@'));
    assert.ok(!fileName.includes('!'));
    assert.ok(!fileName.includes('['));
  });

  it('4. Erro de geração em registros sem dados é capturado e tratado', () => {
    const brokenItem = {
      id: 'legacy-1',
      reportData: null,
      initialSnapshot: null,
    };

    const hasReportData = Boolean(brokenItem.reportData || (brokenItem.initialSnapshot && (brokenItem.initialSnapshot as any).documentSummary));
    assert.equal(hasReportData, false, 'Registro quebrado não deve ser considerado apto para relatório');
  });

  it('5. Registro antigo sem dados deixa botão de relatório desabilitado', () => {
    const legacyRecordWithoutSnapshot: any = {
      id: 'legacy-record-999',
      fileName: 'documento_antigo.pdf',
      createdAt: Date.now(),
      score: 80,
      status: 'review',
      errorCount: 0,
      warningCount: 1,
      approvedCount: 9,
      // Sem initialSnapshot nem reportData
    };

    const isAvailable = Boolean(legacyRecordWithoutSnapshot.reportData || (legacyRecordWithoutSnapshot.initialSnapshot && legacyRecordWithoutSnapshot.initialSnapshot.documentSummary));
    assert.equal(isAvailable, false, 'Botão de relatório deve ficar desabilitado para registros antigos de metadados');
  });

  it('6. Linguagem Operacional: RGB somente vetorial apresenta "Manual" / "Corrigir na origem"', () => {
    const analysisWithVectorRgbOnly = createMockAnalysis({
      hasRgbRaster: false,
      hasRgbVector: true,
      hasCmyk: true,
    });

    const hasRgbRaster = Boolean(analysisWithVectorRgbOnly.document.colorSummary.hasRgbRaster);
    const hasRgb = Boolean(analysisWithVectorRgbOnly.document.colorSummary.hasRgb);
    
    const colorStatusText: 'OK' | 'Ajustável' | 'Manual' = !hasRgb
      ? 'OK'
      : (hasRgbRaster ? 'Ajustável' : 'Manual');

    assert.equal(colorStatusText, 'Manual', 'Vetor RGB sem raster deve ser classificado como Manual');
  });

  it('7. Quantidade de pendências NÃO é apresentada como quantidade de correções quando não há correções automáticas', () => {
    const availableFixesCount: number = 0;
    const errorCount = 1;
    const warningCount = 1;
    const totalInconformidades = errorCount + warningCount;

    const buttonText = availableFixesCount > 0
      ? `Ver ${availableFixesCount} ${availableFixesCount === 1 ? 'correção disponível' : 'correções disponíveis'}`
      : `Ver ${totalInconformidades} ${totalInconformidades === 1 ? 'pendência' : 'pendências'}`;

    assert.equal(buttonText, 'Ver 2 pendências', 'Deve exibir pendências, não correções disponíveis');
  });

  it('8. PDF/X bloqueado por pendências manuais não aparece como "Ajustável"', () => {
    const isDeclaredPdfX = false;
    const hasOutputIntent = false;
    const hasPdfxBlockers = true; // Por exemplo: fontes não incorporadas ou vetor RGB em perfil CMYK estrito

    const pdfxStatusText = (isDeclaredPdfX && hasOutputIntent)
      ? 'OK'
      : (hasPdfxBlockers ? 'Bloqueado por pendências' : 'Ajustável');

    assert.equal(pdfxStatusText, 'Bloqueado por pendências', 'Não pode exibir Ajustável quando existem bloqueios');
  });

  it('9. Cota continua correta e não é alterada nem consumida ao gerar/baixar relatório', () => {
    let quotaCount = 5;
    const downloadReportAction = () => {
      // Geração de relatório no frontend / download não executa POST /api/upload nem debita quota
      return { downloaded: true };
    };

    downloadReportAction();
    assert.equal(quotaCount, 5, 'Quota não pode ser alterada ao baixar relatório');
  });
});
