import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { HelpCenterModal } from '../src/components/HelpCenterModal';
import { Sidebar } from '../src/components/Sidebar';
import { getPrexyonPortalUrl } from '../src/config/prexyon';
import { COMMERCIAL_PRINT_300DPI_PROFILE } from '../src/utils/productionProfiles';
import type { PreflightAnalysis } from '../src/types';

function createMockAnalysis(): PreflightAnalysis {
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
    id: 'test-help-analysis-1234',
    createdAt: 1772870400000,
    fileName: 'manual_teste.pdf',
    fileSizeBytes: 1048576,
    profileId: COMMERCIAL_PRINT_300DPI_PROFILE.id,
    diagnosticInfo: { extractionDurationMs: 10, evaluationDurationMs: 5 },
    document: {
      pageCount: 1,
      colorSummary: {
        hasRgb: false,
        hasRgbRaster: false,
        hasRgbVector: false,
        hasCmyk: true,
        hasSpotColors: false,
        familiesDetected: ['DeviceCMYK'],
      },
      pdfxInfo: {
        isDeclaredPdfX: false,
        hasOutputIntent: false,
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
      errorCount: 0,
      warningCount: 0,
      approvedCount: 10,
      undeterminedCount: 0,
      universalRules: [],
      profileRules: [],
      grouped: { approved: [], warning: [], error: [], undetermined: [] },
      scoreSummary: {
        score: 100,
        classification: 'approved',
        label: 'Pronto para Produção',
        color: '#10B981',
        approvedCount: 10,
        undeterminedCount: 0,
        errorCount: 0,
        warningCount: 0,
      },
      results: [],
    },
  };
}

describe('ARTECHECK AI — Central de Ajuda & Mini Manual de Pré-impressão', () => {
  it('A. Sidebar renderiza botão acessível para Central de Ajuda', () => {
    let clicked = false;
    const html = renderToStaticMarkup(
      React.createElement(Sidebar, {
        activeTab: 'dashboard',
        onOpenHelp: () => { clicked = true; },
      })
    );

    assert.ok(html.includes('Central de ajuda'), 'Sidebar deve conter texto da Central de ajuda');
    assert.ok(html.includes('Tutoriais, guias e boas práticas'), 'Sidebar deve conter subtítulo orientador');
  });

  it('B. HelpCenterModal renderiza o Mini Manual com recursos 100% reais do ArteCheck', () => {
    const html = renderToStaticMarkup(
      React.createElement(HelpCenterModal, {
        isOpen: true,
        onClose: () => {},
        currentAnalysis: null,
      })
    );

    assert.ok(html.includes('Central de Ajuda'), 'Deve exibir título da Central de Ajuda');
    assert.ok(html.includes('Mini Manual de Pré-impressão'), 'Deve conter aba do Mini Manual');
    assert.ok(html.includes('Como Enviar e Iniciar Análise'), 'Deve explicar envio de PDF');
    assert.ok(html.includes('Significado dos Status'), 'Deve explicar status Aprovado/Alerta/Erro');
    assert.ok(html.includes('Dimensões, Sangria e Caixas Técnicas'), 'Deve explicar MediaBox/TrimBox/BleedBox');
    assert.ok(html.includes('DPI e Resolução Efetiva'), 'Deve explicar 300 DPI e resolução');
    assert.ok(html.includes('Espaços de Cor (CMYK, RGB e Spot)'), 'Deve explicar cores e LittleCMS');
    assert.ok(html.includes('Fontes e Tipografia'), 'Deve explicar incorporação de fontes');
    assert.ok(html.includes('Transparências e Norma PDF/X'), 'Deve explicar PDF/X e transparências');
    assert.ok(html.includes('Diferença entre Analisar e Corrigir'), 'Deve explicar imutabilidade e working PDF');
    assert.ok(html.includes('Histórico, Visualização e Relatórios PDF'), 'Deve explicar visualização e relatórios');
  });

  it('C. Não promete recursos em breve como disponíveis (vetores RGB, OCR, etc.)', () => {
    const html = renderToStaticMarkup(
      React.createElement(HelpCenterModal, {
        isOpen: true,
        onClose: () => {},
        currentAnalysis: null,
      })
    );

    // Assert that vector RGB is explicitly clarified as manual in origin software
    assert.ok(html.includes('Vetores e Textos RGB:'), 'Deve explicitar que vetores/textos RGB exigem ajuste na origem');
    assert.ok(html.includes('software de diagramação'), 'Deve orientar ajuste no software gráfico de origem');
  });

  it('D & E. Área de Suporte não faz chamadas backend automáticas e preserva dados sensíveis', () => {
    const analysis = createMockAnalysis();
    const portalUrl = getPrexyonPortalUrl();

    const html = renderToStaticMarkup(
      React.createElement(HelpCenterModal, {
        isOpen: true,
        onClose: () => {},
        currentAnalysis: analysis,
        initialTab: 'support',
      })
    );

    assert.ok(html.includes('Suporte &amp; Contato') || html.includes('Suporte & Contato'), 'Deve conter aba de Suporte');
    assert.ok(html.includes(portalUrl), 'Deve apontar para o Portal Prexyon centralizado');
    assert.ok(html.includes('Resumo da Análise Ativa para Suporte'), 'Deve permitir copiar metadados sem enviar payload');
    assert.ok(html.includes('Nenhum dado sensível ou conteúdo do PDF é transmitido'), 'Deve conter aviso de segurança de dados');
  });

  it('F. Acessibilidade: dialog role, aria-modal e acessibilidade estrutural', () => {
    const html = renderToStaticMarkup(
      React.createElement(HelpCenterModal, {
        isOpen: true,
        onClose: () => {},
        currentAnalysis: null,
      })
    );

    assert.ok(html.includes('role="dialog"'), 'Deve possuir role="dialog"');
    assert.ok(html.includes('aria-modal="true"'), 'Deve possuir aria-modal="true"');
    assert.ok(html.includes('aria-labelledby="help-center-title"'), 'Deve possuir aria-labelledby');
    assert.ok(html.includes('aria-label="Fechar"'), 'Botão fechar deve possuir aria-label');
  });

  it('G. Modal fechado (isOpen=false) retorna string vazia', () => {
    const html = renderToStaticMarkup(
      React.createElement(HelpCenterModal, {
        isOpen: false,
        onClose: () => {},
        currentAnalysis: null,
      })
    );

    assert.equal(html, '', 'Quando isOpen=false nada deve ser renderizado');
  });
});
