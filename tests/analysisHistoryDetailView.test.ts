import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LocalStorageProvider } from '../src/storage/LocalStorageProvider';
import { createAnalysisSnapshot, buildTechnicalReport } from '../src/services/technicalReport';
import { COMMERCIAL_PRINT_300DPI_PROFILE } from '../src/utils/productionProfiles';
import { AnalysisDetailModal } from '../src/components/AnalysisDetailModal';
import { checkReportExportEligibility } from '../src/components/HistoryModal';
import type { PreflightAnalysis } from '../src/types';
import type { AnalysisRecordSummary } from '../src/domain/beta';

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
    id: 'test-analysis-view-1234',
    createdAt: 1772870400000, // Fixed timestamp for deterministic test
    fileName: 'folder_institucional_final.pdf',
    fileSizeBytes: 2097152, // 2 MB
    profileId: COMMERCIAL_PRINT_300DPI_PROFILE.id,
    diagnosticInfo: { extractionDurationMs: 12, evaluationDurationMs: 6 },
    document: {
      pageCount: 2,
      colorSummary: {
        hasRgb: Boolean(overrides.hasRgbRaster || overrides.hasRgbVector),
        hasRgbRaster: Boolean(overrides.hasRgbRaster),
        hasRgbVector: Boolean(overrides.hasRgbVector),
        hasCmyk: Boolean(overrides.hasCmyk ?? true),
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
        score: overrides.rules?.some((r) => r.status === 'error') ? 45 : 95,
        classification: overrides.rules?.some((r) => r.status === 'error') ? 'blocked' : 'approved',
        label: 'Pronto para Produção',
        color: '#10B981',
        approvedCount: 10,
        undeterminedCount: 0,
        errorCount: overrides.rules?.filter((r) => r.status === 'error').length || 0,
        warningCount: overrides.rules?.filter((r) => r.status === 'warning').length || 0,
      },
      results: overrides.rules || [
        {
          ruleId: 'RULE-PROF-DIM-001',
          title: 'Dimensões da Página',
          category: 'dimension',
          status: 'approved',
          evidence: '210.0 × 297.0 mm (A4)',
          explanation: 'Dimensões em conformidade.',
          recommendation: 'Nenhuma ação necessária.',
        },
        {
          ruleId: 'RULE-PROF-CLR-001',
          title: 'Espaço de Cor',
          category: 'color',
          status: 'approved',
          evidence: 'DeviceCMYK detectado',
          explanation: 'Cores adequadas.',
          recommendation: 'Nenhuma ação necessária.',
        },
        {
          ruleId: 'RULE-PROF-RES-001',
          title: 'Resolução das Imagens',
          category: 'resolution',
          status: 'approved',
          evidence: '300 DPI efetivo',
          explanation: 'Resolução adequada.',
          recommendation: 'Nenhuma ação necessária.',
        },
        {
          ruleId: 'RULE-PROF-BLD-001',
          title: 'Sangria Mínima',
          category: 'bleed',
          status: 'approved',
          evidence: 'Sangria 3.0 mm',
          explanation: 'Sangria em conformidade.',
          recommendation: 'Nenhuma ação necessária.',
        },
        {
          ruleId: 'RULE-PROF-FNT-001',
          title: 'Fontes Incorporadas',
          category: 'font',
          status: 'approved',
          evidence: 'Todas as fontes incorporadas',
          explanation: 'Tipografia íntegra.',
          recommendation: 'Nenhuma ação necessária.',
        },
      ],
    },
  };
}

describe('ARTECHECK AI — Análise Histórica & Visualização de Detalhes', () => {
  it('A. Clicar em Visualizar renderiza os detalhes do registro selecionado', () => {
    const analysis = createMockAnalysis({ hasCmyk: true });
    const initialSnapshot = createAnalysisSnapshot(analysis, COMMERCIAL_PRINT_300DPI_PROFILE);
    const reportData = buildTechnicalReport(initialSnapshot, null, COMMERCIAL_PRINT_300DPI_PROFILE);

    const record: AnalysisRecordSummary = {
      id: 'analysis-view-abc-123',
      createdAt: analysis.createdAt,
      fileName: 'catalogo_automotivo.pdf',
      fileSizeBytes: 3145728, // 3 MB
      segmentName: 'Comercial',
      productName: 'Catálogo A4',
      variantName: 'Padrão',
      productionProfileId: COMMERCIAL_PRINT_300DPI_PROFILE.id,
      status: 'approved',
      score: 95,
      errorCount: 0,
      warningCount: 0,
      approvedCount: 10,
      initialSnapshot,
      reportData,
    };

    const html = renderToStaticMarkup(
      React.createElement(AnalysisDetailModal, {
        isOpen: true,
        onClose: () => {},
        record,
      })
    );

    assert.ok(html.includes('catalogo_automotivo.pdf'), 'Deve exibir o nome do arquivo selecionado');
    assert.ok(html.includes('95/100'), 'Deve exibir o score da análise');
    assert.ok(html.includes('Pronto para Produção'), 'Deve exibir o status formatado');
    assert.ok(html.includes('Catálogo A4'), 'Deve exibir o produto/perfil');
    assert.ok(html.includes('3.00 MB'), 'Deve exibir o tamanho formatado');
  });

  it('B & C & D. Visualização não executa nova análise, não consome cota e não cria registros', async () => {
    const storage = new LocalStorageProvider();
    const period = '2026-09';
    
    // Initial state
    const initialUsage = await storage.getUsage(period);
    const initialAnalyses = await storage.listAnalyses();
    const initialAnalysesCount = initialAnalyses.length;

    const mockItem: AnalysisRecordSummary = {
      id: 'analysis-readonly-test',
      createdAt: Date.now(),
      fileName: 'readonly_test.pdf',
      fileSizeBytes: 1024,
      segmentName: 'Comercial',
      productName: 'Folder',
      variantName: 'Padrão',
      productionProfileId: COMMERCIAL_PRINT_300DPI_PROFILE.id,
      status: 'approved',
      score: 100,
      errorCount: 0,
      warningCount: 0,
      approvedCount: 10,
    };

    // Save one test record
    await storage.saveAnalysis(mockItem);

    const analysesAfterSave = await storage.listAnalyses();
    assert.equal(analysesAfterSave.length, initialAnalysesCount + 1);

    // Simulate opening the detail modal
    const html = renderToStaticMarkup(
      React.createElement(AnalysisDetailModal, {
        isOpen: true,
        onClose: () => {},
        record: mockItem,
      })
    );
    assert.ok(html.includes('readonly_test.pdf'));

    // Check usage and storage AFTER viewing
    const usageAfterView = await storage.getUsage(period);
    assert.equal(usageAfterView.analyses, initialUsage.analyses, 'Cota de análises NÃO pode ser debitada ao visualizar');
    assert.equal(usageAfterView.bytesUploaded, initialUsage.bytesUploaded, 'Bytes uploaded NÃO podem ser alterados ao visualizar');

    const analysesAfterView = await storage.listAnalyses();
    assert.equal(analysesAfterView.length, initialAnalysesCount + 1, 'Nenhum registro adicional deve ser criado ao visualizar');
  });

  it('E. Dados técnicos exibidos correspondem estritamente às evidências persistidas', () => {
    const analysis = createMockAnalysis({
      hasCmyk: true,
      isDeclaredPdfX: true,
      rules: [
        {
          ruleId: 'RULE-PROF-CLR-001',
          title: 'Espaço de Cor',
          category: 'color',
          status: 'warning',
          evidence: 'Cores mistas DeviceCMYK + Spot',
          explanation: 'Presença de tintas especiais.',
          recommendation: 'Verifique na gráfica.',
        },
      ],
    });

    const initialSnapshot = createAnalysisSnapshot(analysis, COMMERCIAL_PRINT_300DPI_PROFILE);
    const reportData = buildTechnicalReport(initialSnapshot, null, COMMERCIAL_PRINT_300DPI_PROFILE);

    const record: AnalysisRecordSummary = {
      id: 'analysis-spec-test',
      createdAt: analysis.createdAt,
      fileName: 'especificacoes_reais.pdf',
      fileSizeBytes: 2048,
      segmentName: 'Comercial',
      productName: 'Flyer',
      variantName: 'Padrão',
      productionProfileId: COMMERCIAL_PRINT_300DPI_PROFILE.id,
      status: 'review',
      score: 80,
      errorCount: 0,
      warningCount: 1,
      approvedCount: 9,
      initialSnapshot,
      reportData,
    };

    const html = renderToStaticMarkup(
      React.createElement(AnalysisDetailModal, {
        isOpen: true,
        onClose: () => {},
        record,
      })
    );

    assert.ok(html.includes('especificacoes_reais.pdf'));
    assert.ok(html.includes('210.0 × 297.0 mm'), 'Deve exibir dimensões salvas');
    assert.ok(html.includes('DeviceCMYK'), 'Deve exibir famílias de cores detectadas');
  });

  it('F. Registro nulo ou indisponível apresenta estado de erro seguro sem quebrar', () => {
    const html = renderToStaticMarkup(
      React.createElement(AnalysisDetailModal, {
        isOpen: true,
        onClose: () => {},
        record: null,
      })
    );

    assert.ok(html.includes('Registro Indisponível'), 'Deve renderizar título de indisponibilidade');
    assert.ok(html.includes('Não foi possível carregar os detalhes'), 'Deve orientar o usuário de forma segura');
  });

  it('G. Registro legado (sem regras detalhadas) renderiza metadados sem inventar dados', () => {
    const legacyRecord: AnalysisRecordSummary = {
      id: 'legacy-record-1999',
      createdAt: 1772870400000,
      fileName: 'arquivo_legado.pdf',
      fileSizeBytes: 512000,
      segmentName: 'Geral',
      productName: 'Perfil Simples',
      variantName: 'Padrão',
      productionProfileId: 'profile-simple',
      status: 'blocked',
      score: 30,
      errorCount: 2,
      warningCount: 1,
      approvedCount: 5,
    };

    const html = renderToStaticMarkup(
      React.createElement(AnalysisDetailModal, {
        isOpen: true,
        onClose: () => {},
        record: legacyRecord,
      })
    );

    assert.ok(html.includes('arquivo_legado.pdf'));
    assert.ok(html.includes('Bloqueado / Revisão Manual'));
    assert.ok(html.includes('30/100'));
    assert.ok(html.includes('Registro histórico resumido'), 'Deve informar com transparência sobre metadados resumidos');
  });

  it('H. Modal fechado (isOpen=false) não renderiza nada no DOM', () => {
    const html = renderToStaticMarkup(
      React.createElement(AnalysisDetailModal, {
        isOpen: false,
        onClose: () => {},
        record: null,
      })
    );

    assert.equal(html, '', 'Quando isOpen for false, renderToStaticMarkup deve ser string vazia');
  });

  it('I. Elegibilidade de relatório técnico preservada para registros no histórico', () => {
    const recordWithData: AnalysisRecordSummary = {
      id: 'valid-id-1',
      createdAt: Date.now(),
      fileName: 'valid.pdf',
      fileSizeBytes: 1000,
      segmentName: 'Comercial',
      productName: 'Flyer',
      variantName: 'Padrão',
      productionProfileId: 'comm-profile',
      status: 'approved',
      score: 100,
      errorCount: 0,
      warningCount: 0,
      approvedCount: 10,
      reportData: { id: 'valid-id-1', fileName: 'valid.pdf' },
    };

    const recordWithoutData: AnalysisRecordSummary = {
      id: 'legacy-id-2',
      createdAt: Date.now(),
      fileName: 'legacy.pdf',
      fileSizeBytes: 1000,
      segmentName: 'Comercial',
      productName: 'Flyer',
      variantName: 'Padrão',
      productionProfileId: 'comm-profile',
      status: 'approved',
      score: 100,
      errorCount: 0,
      warningCount: 0,
      approvedCount: 10,
    };

    assert.equal(checkReportExportEligibility(recordWithData).eligible, true);
    assert.equal(checkReportExportEligibility(recordWithoutData).eligible, false);
  });
});
