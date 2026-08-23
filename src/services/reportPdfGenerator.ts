import { PDFDocument, rgb, StandardFonts, PDFPage, PDFFont } from 'pdf-lib';
import type { TechnicalReportData } from './technicalReport';
import { formatBytes } from '../../server/pdfExtractor';

/**
 * Formata timestamp para o nome do arquivo: YYYY-MM-DD_HHmm
 */
export function formatReportDateForFileName(timestamp: number): string {
  const d = new Date(timestamp);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}_${hh}${min}`;
}

/**
 * Gera o nome padrão do arquivo de relatório técnico:
 * ArteCheck_Relatorio_<arquivo>_<data>.pdf
 */
export function generateReportPdfFileName(fileName: string, timestamp: number): string {
  const cleanName = fileName
    .replace(/\.pdf$/i, '')
    .replace(/[^a-zA-Z0-9_\-]/g, '_')
    .substring(0, 40);
  const dateStr = formatReportDateForFileName(timestamp);
  return `ArteCheck_Relatorio_${cleanName}_${dateStr}.pdf`;
}

/**
 * Utilitário de sanitização para evitar que textos inválidos quebrem a codificação WinAnsi do pdf-lib.
 */
function sanitizeText(str: string | undefined | null): string {
  if (!str) return '';
  return str
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2022\u2023\u25E6]/g, '*')
    .replace(/[^\x20-\x7E\xA0-\xFF\n\r\t]/g, ' ');
}

/**
 * Quebra um texto em linhas respeitando uma largura máxima em pontos.
 */
function wrapText(text: string, font: PDFFont, fontSize: number, maxWidth: number): string[] {
  const words = sanitizeText(text).split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const width = font.widthOfTextAtSize(testLine, fontSize);
    if (width <= maxWidth) {
      currentLine = testLine;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines.length > 0 ? lines : [''];
}

/**
 * Gera um documento PDF estruturado e profissional com os dados do Relatório Técnico.
 */
export async function generateTechnicalReportPdf(report: TechnicalReportData): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();

  // Metadados do PDF (Sem chaves ou tokens)
  pdfDoc.setTitle(`ArteCheck - Relatório Técnico: ${report.fileName}`);
  pdfDoc.setAuthor('ArteCheck Preflight Engine');
  pdfDoc.setSubject('Relatório de Inspeção e Validação Técnica de Pré-Impressão');
  pdfDoc.setCreator('ArteCheck Motor 1 Determinístico');
  pdfDoc.setProducer('ArteCheck Core Engine');
  pdfDoc.setCreationDate(new Date(report.generatedAt));

  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const PAGE_WIDTH = 595.28; // A4
  const PAGE_HEIGHT = 841.89; // A4
  const MARGIN = 40;
  const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

  let currentPage: PDFPage = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let cursorY = PAGE_HEIGHT - MARGIN;

  // Função auxiliar para quebra de página automática
  function checkPageBreak(requiredHeight: number) {
    if (cursorY - requiredHeight < MARGIN + 40) {
      currentPage = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      cursorY = PAGE_HEIGHT - MARGIN;
      drawHeaderBanner(false);
    }
  }

  function drawHeaderBanner(isFirstPage = true) {
    // Top colored line
    currentPage.drawRectangle({
      x: MARGIN,
      y: cursorY + 10,
      width: CONTENT_WIDTH,
      height: 3,
      color: rgb(0 / 255, 123 / 255, 255 / 255), // ArteCheck Primary Blue
    });

    if (isFirstPage) {
      // Header Title
      currentPage.drawText('ARTECHECK PREFLIGHT', {
        x: MARGIN,
        y: cursorY - 10,
        size: 18,
        font: helveticaBold,
        color: rgb(16 / 255, 23 / 255, 34 / 255),
      });

      currentPage.drawText('RELATÓRIO TÉCNICO DE AUDITORIA E PRÉ-IMPRESSÃO', {
        x: MARGIN,
        y: cursorY - 26,
        size: 9,
        font: helveticaBold,
        color: rgb(0 / 255, 123 / 255, 255 / 255),
      });

      const dateStr = new Date(report.generatedAt).toLocaleString('pt-BR');
      currentPage.drawText(`Emitido em: ${dateStr}`, {
        x: PAGE_WIDTH - MARGIN - 180,
        y: cursorY - 10,
        size: 8,
        font: helvetica,
        color: rgb(107 / 255, 119 / 255, 140 / 255),
      });

      currentPage.drawText(`ID: ${report.id.substring(0, 24)}...`, {
        x: PAGE_WIDTH - MARGIN - 180,
        y: cursorY - 22,
        size: 7,
        font: helvetica,
        color: rgb(142 / 255, 152 / 255, 167 / 255),
      });

      cursorY -= 45;
    } else {
      currentPage.drawText('ARTECHECK PREFLIGHT — RELATÓRIO TÉCNICO (CONTINUAÇÃO)', {
        x: MARGIN,
        y: cursorY - 5,
        size: 8,
        font: helveticaBold,
        color: rgb(107 / 255, 119 / 255, 140 / 255),
      });
      cursorY -= 20;
    }
  }

  // Desenha primeiro cabeçalho
  drawHeaderBanner(true);

  // 1. Box de Metadados do Arquivo
  const metaBoxHeight = 65;
  currentPage.drawRectangle({
    x: MARGIN,
    y: cursorY - metaBoxHeight,
    width: CONTENT_WIDTH,
    height: metaBoxHeight,
    color: rgb(245 / 255, 247 / 255, 250 / 255),
    borderColor: rgb(220 / 255, 226 / 255, 235 / 255),
    borderWidth: 1,
  });

  const col1X = MARGIN + 12;
  const col2X = MARGIN + 270;
  let metaY = cursorY - 18;

  currentPage.drawText('Arquivo:', { x: col1X, y: metaY, size: 8, font: helveticaBold, color: rgb(74 / 255, 85 / 255, 104 / 255) });
  currentPage.drawText(sanitizeText(report.fileName), { x: col1X + 45, y: metaY, size: 8, font: helveticaBold, color: rgb(16 / 255, 23 / 255, 34 / 255) });

  currentPage.drawText('Tamanho:', { x: col2X, y: metaY, size: 8, font: helveticaBold, color: rgb(74 / 255, 85 / 255, 104 / 255) });
  currentPage.drawText(formatBytes(report.fileSizeBytes), { x: col2X + 48, y: metaY, size: 8, font: helvetica, color: rgb(16 / 255, 23 / 255, 34 / 255) });

  metaY -= 15;
  currentPage.drawText('Perfil:', { x: col1X, y: metaY, size: 8, font: helveticaBold, color: rgb(74 / 255, 85 / 255, 104 / 255) });
  currentPage.drawText(sanitizeText(report.profileName), { x: col1X + 45, y: metaY, size: 8, font: helvetica, color: rgb(16 / 255, 23 / 255, 34 / 255) });

  currentPage.drawText('Páginas:', { x: col2X, y: metaY, size: 8, font: helveticaBold, color: rgb(74 / 255, 85 / 255, 104 / 255) });
  currentPage.drawText(sanitizeText(report.initialSnapshot.documentSummary.dimensionsSummary), { x: col2X + 48, y: metaY, size: 8, font: helvetica, color: rgb(16 / 255, 23 / 255, 34 / 255) });

  metaY -= 15;
  const colorStr = report.initialSnapshot.documentSummary.hasCmyk
    ? (report.initialSnapshot.documentSummary.hasRgb ? 'CMYK + RGB (Alerta)' : 'CMYK Puro')
    : (report.initialSnapshot.documentSummary.hasRgb ? 'RGB Detectado' : 'Escala de Cinza');
  
  currentPage.drawText('Cores:', { x: col1X, y: metaY, size: 8, font: helveticaBold, color: rgb(74 / 255, 85 / 255, 104 / 255) });
  currentPage.drawText(colorStr, { x: col1X + 45, y: metaY, size: 8, font: helvetica, color: rgb(16 / 255, 23 / 255, 34 / 255) });

  currentPage.drawText('PDF/X:', { x: col2X, y: metaY, size: 8, font: helveticaBold, color: rgb(74 / 255, 85 / 255, 104 / 255) });
  currentPage.drawText(report.initialSnapshot.documentSummary.isDeclaredPdfX ? 'Em conformidade' : 'Não declarado', { x: col2X + 48, y: metaY, size: 8, font: helvetica, color: rgb(16 / 255, 23 / 255, 34 / 255) });

  cursorY -= (metaBoxHeight + 15);

  // 2. Resumo de Score e Auditoria Antes/Depois
  const scoreBoxHeight = report.hasFixApplied ? 80 : 60;
  currentPage.drawRectangle({
    x: MARGIN,
    y: cursorY - scoreBoxHeight,
    width: CONTENT_WIDTH,
    height: scoreBoxHeight,
    color: rgb(255 / 255, 255 / 255, 255 / 255),
    borderColor: rgb(200 / 255, 210 / 255, 225 / 255),
    borderWidth: 1,
  });

  // Título da seção de pontuação
  currentPage.drawText('AVALIAÇÃO DE CONFORMIDADE TÉCNICA (MOTOR 1 DETERMINÍSTICO)', {
    x: MARGIN + 12,
    y: cursorY - 16,
    size: 9,
    font: helveticaBold,
    color: rgb(16 / 255, 23 / 255, 34 / 255),
  });

  if (report.hasFixApplied) {
    // Compara Antes vs Depois
    currentPage.drawText(`Score Original: ${report.initialScore}/100 (${report.initialClassification.toUpperCase()})`, {
      x: MARGIN + 12,
      y: cursorY - 34,
      size: 9,
      font: helvetica,
      color: rgb(107 / 255, 119 / 255, 140 / 255),
    });

    const scoreColor = report.finalScore >= 90
      ? rgb(0 / 255, 180 / 255, 120 / 255)
      : report.finalScore >= 70
      ? rgb(217 / 255, 119 / 255, 6 / 255)
      : rgb(220 / 255, 38 / 255, 38 / 255);

    const deltaSign = report.scoreDelta >= 0 ? `+${report.scoreDelta}` : `${report.scoreDelta}`;
    currentPage.drawText(`Score Pós-Correção: ${report.finalScore}/100 (${report.finalClassification.toUpperCase()}) [Delta: ${deltaSign}]`, {
      x: MARGIN + 12,
      y: cursorY - 48,
      size: 10,
      font: helveticaBold,
      color: scoreColor,
    });

    currentPage.drawText(`Reanálise obrigatória: Validado pelo Motor 1 (${report.fixDescription || 'Correção aplicada'})`, {
      x: MARGIN + 12,
      y: cursorY - 64,
      size: 8,
      font: helvetica,
      color: rgb(0 / 255, 123 / 255, 255 / 255),
    });
  } else {
    // Análise única
    const scoreColor = report.finalScore >= 90
      ? rgb(0 / 255, 180 / 255, 120 / 255)
      : report.finalScore >= 70
      ? rgb(217 / 255, 119 / 255, 6 / 255)
      : rgb(220 / 255, 38 / 255, 38 / 255);

    currentPage.drawText(`Pontuação de Qualidade: ${report.finalScore}/100 — Status: ${report.finalClassification.toUpperCase()}`, {
      x: MARGIN + 12,
      y: cursorY - 36,
      size: 11,
      font: helveticaBold,
      color: scoreColor,
    });

    currentPage.drawText(`Bloqueantes: ${report.initialSnapshot.errorCount} | Alertas: ${report.initialSnapshot.warningCount} | Aprovados: ${report.initialSnapshot.approvedCount}`, {
      x: MARGIN + 12,
      y: cursorY - 50,
      size: 8,
      font: helvetica,
      color: rgb(107 / 255, 119 / 255, 140 / 255),
    });
  }

  cursorY -= (scoreBoxHeight + 18);

  // 3. Tabela Comparativa de Regras
  checkPageBreak(120);

  currentPage.drawText('DETALHAMENTO DE REGRAS E EVIDÊNCIAS DE PRÉ-IMPRESSÃO', {
    x: MARGIN,
    y: cursorY,
    size: 10,
    font: helveticaBold,
    color: rgb(16 / 255, 23 / 255, 34 / 255),
  });
  cursorY -= 15;

  // Cabeçalho da Tabela
  const tableHeaderHeight = 18;
  currentPage.drawRectangle({
    x: MARGIN,
    y: cursorY - tableHeaderHeight,
    width: CONTENT_WIDTH,
    height: tableHeaderHeight,
    color: rgb(16 / 255, 23 / 255, 34 / 255),
  });

  currentPage.drawText('REGRA / ITEM', { x: MARGIN + 8, y: cursorY - 12, size: 7, font: helveticaBold, color: rgb(1, 1, 1) });
  if (report.hasFixApplied) {
    currentPage.drawText('ANTES', { x: MARGIN + 190, y: cursorY - 12, size: 7, font: helveticaBold, color: rgb(1, 1, 1) });
    currentPage.drawText('DEPOIS', { x: MARGIN + 250, y: cursorY - 12, size: 7, font: helveticaBold, color: rgb(1, 1, 1) });
    currentPage.drawText('STATUS', { x: MARGIN + 310, y: cursorY - 12, size: 7, font: helveticaBold, color: rgb(1, 1, 1) });
    currentPage.drawText('EVIDÊNCIA / MEDIÇÃO', { x: MARGIN + 380, y: cursorY - 12, size: 7, font: helveticaBold, color: rgb(1, 1, 1) });
  } else {
    currentPage.drawText('CATEGORIA', { x: MARGIN + 210, y: cursorY - 12, size: 7, font: helveticaBold, color: rgb(1, 1, 1) });
    currentPage.drawText('RESULTADO', { x: MARGIN + 290, y: cursorY - 12, size: 7, font: helveticaBold, color: rgb(1, 1, 1) });
    currentPage.drawText('EVIDÊNCIA TÉCNICA', { x: MARGIN + 360, y: cursorY - 12, size: 7, font: helveticaBold, color: rgb(1, 1, 1) });
  }
  cursorY -= (tableHeaderHeight + 2);

  // Linhas da tabela
  const itemsToRender = report.hasFixApplied && report.comparisonResults
    ? report.comparisonResults
    : report.initialSnapshot.rules.map((r) => ({
        ruleId: r.ruleId,
        title: r.title,
        category: r.category,
        statusBefore: r.status,
        statusAfter: r.status,
        comparison: 'unchanged' as const,
        evidenceBefore: r.evidence,
        evidenceAfter: r.evidence,
        explanation: r.explanation,
      }));

  for (let i = 0; i < itemsToRender.length; i++) {
    const item = itemsToRender[i];
    const evidenceLines = wrapText(item.evidenceAfter || item.evidenceBefore, helvetica, 7, report.hasFixApplied ? 130 : 150);
    const rowHeight = Math.max(22, evidenceLines.length * 10 + 10);

    checkPageBreak(rowHeight + 10);

    const isEven = i % 2 === 0;
    if (isEven) {
      currentPage.drawRectangle({
        x: MARGIN,
        y: cursorY - rowHeight,
        width: CONTENT_WIDTH,
        height: rowHeight,
        color: rgb(248 / 255, 250 / 255, 252 / 255),
      });
    }

    // Nome da regra
    const titleLines = wrapText(item.title, helveticaBold, 7, 180);
    let lineY = cursorY - 11;
    for (const tl of titleLines) {
      currentPage.drawText(tl, { x: MARGIN + 8, y: lineY, size: 7, font: helveticaBold, color: rgb(16 / 255, 23 / 255, 34 / 255) });
      lineY -= 9;
    }

    if (report.hasFixApplied) {
      // Antes
      const colorBefore = item.statusBefore === 'approved'
        ? rgb(0 / 255, 150 / 255, 100 / 255)
        : item.statusBefore === 'warning'
        ? rgb(200 / 255, 110 / 255, 0 / 255)
        : rgb(200 / 255, 30 / 255, 30 / 255);
      currentPage.drawText(item.statusBefore.toUpperCase(), { x: MARGIN + 190, y: cursorY - 11, size: 7, font: helveticaBold, color: colorBefore });

      // Depois
      const colorAfter = item.statusAfter === 'approved'
        ? rgb(0 / 255, 150 / 255, 100 / 255)
        : item.statusAfter === 'warning'
        ? rgb(200 / 255, 110 / 255, 0 / 255)
        : rgb(200 / 255, 30 / 255, 30 / 255);
      currentPage.drawText(item.statusAfter.toUpperCase(), { x: MARGIN + 250, y: cursorY - 11, size: 7, font: helveticaBold, color: colorAfter });

      // Comparação
      const compLabel = item.comparison === 'corrected'
        ? 'CORRIGIDO'
        : item.comparison === 'improved'
        ? 'MELHOROU'
        : item.comparison === 'worsened'
        ? 'PIOROU'
        : item.comparison === 'new_issue'
        ? 'NOVO ERRO'
        : 'INALTERADO';
      
      const compColor = item.comparison === 'corrected'
        ? rgb(0 / 255, 150 / 255, 100 / 255)
        : item.comparison === 'worsened' || item.comparison === 'new_issue'
        ? rgb(200 / 255, 30 / 255, 30 / 255)
        : rgb(107 / 255, 119 / 255, 140 / 255);

      currentPage.drawText(compLabel, { x: MARGIN + 310, y: cursorY - 11, size: 7, font: helveticaBold, color: compColor });

      // Evidência
      let evY = cursorY - 11;
      for (const el of evidenceLines) {
        currentPage.drawText(el, { x: MARGIN + 380, y: evY, size: 6.5, font: helvetica, color: rgb(74 / 255, 85 / 255, 104 / 255) });
        evY -= 8.5;
      }
    } else {
      // Categoria
      currentPage.drawText(item.category === 'profile_conditioned' ? 'Perfil' : 'Universal', {
        x: MARGIN + 210,
        y: cursorY - 11,
        size: 7,
        font: helvetica,
        color: rgb(107 / 255, 119 / 255, 140 / 255),
      });

      // Resultado
      const colorStatus = item.statusBefore === 'approved'
        ? rgb(0 / 255, 150 / 255, 100 / 255)
        : item.statusBefore === 'warning'
        ? rgb(200 / 255, 110 / 255, 0 / 255)
        : rgb(200 / 255, 30 / 255, 30 / 255);

      currentPage.drawText(item.statusBefore.toUpperCase(), {
        x: MARGIN + 290,
        y: cursorY - 11,
        size: 7,
        font: helveticaBold,
        color: colorStatus,
      });

      // Evidência
      let evY = cursorY - 11;
      for (const el of evidenceLines) {
        currentPage.drawText(el, { x: MARGIN + 360, y: evY, size: 6.5, font: helvetica, color: rgb(74 / 255, 85 / 255, 104 / 255) });
        evY -= 8.5;
      }
    }

    cursorY -= rowHeight;
  }

  cursorY -= 15;

  // 4. Intervenções Manuais Recomendadas
  if (report.manualInterventions.length > 0) {
    checkPageBreak(80);

    currentPage.drawText('INTERVENÇÕES MANUAIS NECESSÁRIAS NO ARQUIVO DE ORIGEM', {
      x: MARGIN,
      y: cursorY,
      size: 10,
      font: helveticaBold,
      color: rgb(217 / 255, 119 / 255, 6 / 255),
    });
    cursorY -= 15;

    for (const intervention of report.manualInterventions) {
      const instLines = wrapText(intervention.instruction, helvetica, 7.5, CONTENT_WIDTH - 20);
      const cardHeight = 28 + instLines.length * 10;
      checkPageBreak(cardHeight + 10);

      currentPage.drawRectangle({
        x: MARGIN,
        y: cursorY - cardHeight,
        width: CONTENT_WIDTH,
        height: cardHeight,
        color: rgb(255 / 255, 251 / 255, 235 / 255),
        borderColor: rgb(253 / 255, 230 / 255, 138 / 255),
        borderWidth: 1,
      });

      currentPage.drawText(`• ${sanitizeText(intervention.title)} [${intervention.severity.toUpperCase()}]:`, {
        x: MARGIN + 10,
        y: cursorY - 13,
        size: 8,
        font: helveticaBold,
        color: rgb(146 / 255, 64 / 255, 14 / 255),
      });

      let iY = cursorY - 25;
      for (const l of instLines) {
        currentPage.drawText(l, { x: MARGIN + 18, y: iY, size: 7.5, font: helvetica, color: rgb(120 / 255, 53 / 255, 15 / 255) });
        iY -= 9.5;
      }

      cursorY -= (cardHeight + 8);
    }
  }

  // 5. Rodapé em todas as páginas com numeração
  const pages = pdfDoc.getPages();
  const totalPages = pages.length;

  for (let idx = 0; idx < totalPages; idx++) {
    const page = pages[idx];
    page.drawLine({
      start: { x: MARGIN, y: 35 },
      end: { x: PAGE_WIDTH - MARGIN, y: 35 },
      thickness: 0.5,
      color: rgb(220 / 255, 226 / 255, 235 / 255),
    });

    page.drawText('ArteCheck Engine — Verificação Determinística de Pré-Impressão em Memória Volátil', {
      x: MARGIN,
      y: 24,
      size: 7,
      font: helvetica,
      color: rgb(142 / 255, 152 / 255, 167 / 255),
    });

    const pageNumText = `Página ${idx + 1} de ${totalPages}`;
    page.drawText(pageNumText, {
      x: PAGE_WIDTH - MARGIN - 60,
      y: 24,
      size: 7,
      font: helveticaBold,
      color: rgb(107 / 255, 119 / 255, 140 / 255),
    });
  }

  return await pdfDoc.save();
}

/**
 * Dispara o download do PDF do relatório diretamente no navegador do usuário.
 */
export function downloadTechnicalReportPdf(pdfBytes: Uint8Array, fileName: string): void {
  const blob = new Blob([pdfBytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
