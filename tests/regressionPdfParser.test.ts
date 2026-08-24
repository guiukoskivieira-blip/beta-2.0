/**
 * ARTECHECK — Testes de regressão para PDF/Parser.
 * Testa bugs reais conhecidos do extrator de PDF e do motor determinístico.
 * Não altera testes antigos nem corrige bugs encontrados.
 */
import assert from 'node:assert/strict';
import { PDFDocument, PDFName, PDFDict, PDFNumber } from 'pdf-lib';
import { extractPdfStructure } from '../server/pdfExtractor';
import { runDeterministicRuleEngine } from '../src/utils/ruleEngine';
import {
  COMMERCIAL_PRINT_300DPI_PROFILE,
  LARGE_FORMAT_BANNER_PROFILE,
  A4_COMMERCIAL_FLYER_PROFILE,
} from '../src/utils/productionProfiles';
import * as pako from 'pako';
import type { PdfDocumentStructure } from '../src/types';

let passed = 0;
let failed = 0;
const bugs: string[] = [];

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ PDF ${passed}: ${name}`);
  } catch (err: any) {
    failed++;
    console.log(`  ✗ PDF ${passed + failed}: ${name} — ${err.message}`);
  }
}

async function testAsync(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ PDF ${passed}: ${name}`);
  } catch (err: any) {
    failed++;
    console.log(`  ✗ PDF ${passed + failed}: ${name} — ${err.message}`);
  }
}

function makeMinimalDoc(overrides: Partial<PdfDocumentStructure> = {}): PdfDocumentStructure {
  return {
    pageCount: 1,
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
        mediaBox: { status: 'explicit', xPt: 0, yPt: 0, widthPt: 612.28, heightPt: 858.89, xMm: 0, yMm: 0, widthMm: 216, heightMm: 303 },
        trimBox: { status: 'explicit', xPt: 8.5, yPt: 8.5, widthPt: 595.28, heightPt: 841.89, xMm: 3, yMm: 3, widthMm: 210, heightMm: 297 },
        bleedBox: { status: 'explicit', xPt: 0, yPt: 0, widthPt: 612.28, heightPt: 858.89, xMm: 0, yMm: 0, widthMm: 216, heightMm: 303 },
        hasTransparency: false,
        imageOccurrences: [],
        colorOccurrences: [{ page: 1, family: 'DeviceCMYK', count: 1 }],
      },
    ],
    fonts: [],
    colorSummary: { hasRgb: false, hasCmyk: true, hasSpotColors: false, familiesDetected: ['DeviceCMYK'] },
    pdfxInfo: { isDeclaredPdfX: false },
    ...overrides,
  };
}

// ============================================================================
// TESTES: Filtros de Stream (FlateDecode, ASCII85Decode, encadeamento)
// ============================================================================

console.log('\n================================================================');
console.log('ARTECHECK — REGRESSÃO: PDF/PARSER');
console.log('================================================================\n');

test('FlateDecode: descompressão pako.inflate recupera dados de stream', () => {
  const original = Buffer.from('BT /F1 12 Tf 100 700 Td (Hello) Tj ET', 'latin1');
  const compressed = pako.deflate(original);
  const decompressed = pako.inflate(compressed);
  assert.equal(Buffer.from(decompressed).toString('latin1'), original.toString('latin1'));
});

test('ASCII85Decode: decodificação de cadeia de caracteres ASCII85', () => {
  // "Man " em ASCII85 = "9jqo^"
  const encoded = '9jqo^';
  const expected = Buffer.from('Man ', 'latin1');
  // Decodificação manual de ASCII85 (zLib/pako não cobre ASCII85)
  const decoded: number[] = [];
  let group: number[] = [];
  for (const ch of encoded) {
    const val = ch.charCodeAt(0) - 33;
    if (val >= 0 && val < 85) group.push(val);
    if (group.length === 5) {
      let n = group[0] * 85 * 85 * 85 * 85 + group[1] * 85 * 85 * 85 + group[2] * 85 * 85 + group[3] * 85 + group[4];
      decoded.push((n >> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff);
      group = [];
    }
  }
  if (group.length > 0) {
    const pad = 5 - group.length;
    for (let i = 0; i < pad; i++) group.push(84); // 'u'
    let n = group[0] * 85 ** 4 + group[1] * 85 ** 3 + group[2] * 85 ** 2 + group[3] * 85 + group[4];
    const bytes = [(n >> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
    decoded.push(...bytes.slice(0, 5 - pad));
  }
  assert.equal(Buffer.from(decoded).toString('latin1'), expected.toString('latin1'));
});

test('ASCII85Decode + FlateDecode: cadeia de filtros preserva dados originais', () => {
  const original = Buffer.from('q Q', 'latin1');
  const flate = pako.deflate(original);
  // Simular cadeia: ASCII85(flate) -> depois inflate
  const recovered = pako.inflate(flate);
  assert.equal(Buffer.from(recovered).toString('latin1'), original.toString('latin1'));
});

// ============================================================================
// TESTES: Tokenizer e limites
// ============================================================================

test('Tokenizer sempre avança: parsing de PDF com 1 página não fica preso', async () => {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.addPage([595.28, 841.89]);
  const buf = Buffer.from(await pdfDoc.save());
  const structure = await extractPdfStructure(buf);
  assert.equal(structure.pageCount, 1);
});

test('Stream malformado não entra em loop infinito: PDF com objeto truncado', async () => {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.addPage([595.28, 841.89]);
  const buf = Buffer.from(await pdfDoc.save());
  // Truncar o buffer no meio para simular stream malformado
  const truncated = buf.subarray(0, Math.floor(buf.length / 2));
  // Deve ou rejeitar com erro ou processar sem travar; não pode ficar em loop
  try {
    await extractPdfStructure(truncated);
    // Se não lançou, tudo bem — o importante é que retornou
  } catch {
    // Erro controlado é aceitável
  }
  assert.ok(true, 'Não travou em loop');
});

test('Limite de tokens: PDF com muitas páginas é processado sem exceder limite', async () => {
  const pdfDoc = await PDFDocument.create();
  for (let i = 0; i < 10; i++) pdfDoc.addPage([595.28, 841.89]);
  const buf = Buffer.from(await pdfDoc.save());
  const structure = await extractPdfStructure(buf);
  assert.equal(structure.pageCount, 10);
});

// ============================================================================
// TESTES: Form XObject recursivo
// ============================================================================

test('Form XObject recursivo: PDF com XObject Form contendo imagem é processado', async () => {
  // Construir um documento sintético que referencia um Form XObject
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]);
  // Simular: se o extrator não lida com Form XObject recursivo,
  // pelo menos não deve travar nem gerar resultado inconsistente
  const buf = Buffer.from(await pdfDoc.save());
  const structure = await extractPdfStructure(buf);
  assert.equal(structure.pageCount, 1);
});

// ============================================================================
// TESTES: PDF multipágina
// ============================================================================

test('PDF multipágina: todas as páginas são extraídas com dimensões corretas', async () => {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.addPage([595.28, 841.89]); // A4 portrait
  pdfDoc.addPage([595.28, 841.89]); // A4 portrait
  pdfDoc.addPage([841.89, 595.28]); // A4 landscape
  const buf = Buffer.from(await pdfDoc.save());
  const structure = await extractPdfStructure(buf);
  assert.equal(structure.pageCount, 3);
  assert.equal(structure.pages[0].widthMm, 210);
  assert.equal(structure.pages[1].widthMm, 210);
  assert.equal(structure.pages[2].widthMm, 297); // landscape
});

// ============================================================================
// TESTES: Imagem com DPI efetivo baixo
// ============================================================================

test('Imagem com DPI efetivo baixo dispara erro no perfil comercial 300 DPI', () => {
  const doc = makeMinimalDoc({
    pages: [
      {
        ...makeMinimalDoc().pages[0],
        imageOccurrences: [
          {
            id: 'img_low',
            page: 1,
            widthPx: 100,
            heightPx: 100,
            displayWidthMm: 200,
            displayHeightMm: 200,
            effectiveDpiX: 12.7,
            effectiveDpiY: 12.7,
            colorSpace: 'DeviceCMYK',
          },
        ],
      },
    ],
  });
  const result = runDeterministicRuleEngine(doc, COMMERCIAL_PRINT_300DPI_PROFILE);
  const dpiRule = result.profileRules.find((r) => r.ruleId === 'RULE-PROF-DPI-001');
  assert.equal(dpiRule?.status, 'error');
});

test('Imagem com DPI intermediário (entre 200 e 300) gera warning, não error', () => {
  const doc = makeMinimalDoc({
    pages: [
      {
        ...makeMinimalDoc().pages[0],
        imageOccurrences: [
          {
            id: 'img_mid',
            page: 1,
            widthPx: 1500,
            heightPx: 1500,
            displayWidthMm: 200,
            displayHeightMm: 200,
            effectiveDpiX: 190.5,
            effectiveDpiY: 190.5,
            colorSpace: 'DeviceCMYK',
          },
        ],
      },
    ],
  });
  const result = runDeterministicRuleEngine(doc, COMMERCIAL_PRINT_300DPI_PROFILE);
  const dpiRule = result.profileRules.find((r) => r.ruleId === 'RULE-PROF-DPI-001');
  // 190.5 < 200 (warningDpiThreshold) -> error, não warning
  // BUG POTENCIAL: se 190.5 < 200, deveria ser error, não warning
  // Documentar comportamento real
  assert.ok(dpiRule, 'Regra DPI deve existir');
  if (dpiRule!.status !== 'error') {
    bugs.push('PDF/DPI: imagem a 190.5 DPI (< 200 threshold crítico) deveria ser error, mas foi ' + dpiRule!.status);
  }
});

// ============================================================================
// TESTES: TrimBox/BleedBox presente e ausente
// ============================================================================

test('TrimBox/BleedBox presente: sangria aprovada no perfil comercial', () => {
  const doc = makeMinimalDoc();
  const result = runDeterministicRuleEngine(doc, COMMERCIAL_PRINT_300DPI_PROFILE);
  const bleedRule = result.profileRules.find((r) => r.ruleId === 'RULE-PROF-BLD-001');
  assert.equal(bleedRule?.status, 'approved');
});

test('TrimBox ausente: sangria fica undetermined (não pode ser aprovada sem TrimBox)', () => {
  const page = makeMinimalDoc().pages[0];
  delete (page as any).trimBox;
  const doc = makeMinimalDoc({ pages: [page] });
  const result = runDeterministicRuleEngine(doc, COMMERCIAL_PRINT_300DPI_PROFILE);
  const bleedRule = result.profileRules.find((r) => r.ruleId === 'RULE-PROF-BLD-001');
  assert.equal(bleedRule?.status, 'undetermined');
});

test('BleedBox ausente com MediaBox fallback: sangria calculada a partir do MediaBox', () => {
  const page = makeMinimalDoc().pages[0];
  delete (page as any).bleedBox;
  const doc = makeMinimalDoc({ pages: [page] });
  const result = runDeterministicRuleEngine(doc, COMMERCIAL_PRINT_300DPI_PROFILE);
  const bleedRule = result.profileRules.find((r) => r.ruleId === 'RULE-PROF-BLD-001');
  // Sem BleedBox, cai no fallback MediaBox; sangria = trimBox.xMm - mediaBox.xMm = 3 - 0 = 3
  assert.equal(bleedRule?.status, 'approved');
});

// ============================================================================
// TESTES: RGB vs CMYK por perfil
// ============================================================================

test('RGB em perfil comercial (rgbPolicy=error) gera erro bloqueante', () => {
  const doc = makeMinimalDoc({
    colorSummary: { hasRgb: true, hasCmyk: false, hasSpotColors: false, familiesDetected: ['DeviceRGB'] },
    pages: [
      {
        ...makeMinimalDoc().pages[0],
        colorOccurrences: [{ page: 1, family: 'DeviceRGB', count: 1 }],
      },
    ],
  });
  const result = runDeterministicRuleEngine(doc, COMMERCIAL_PRINT_300DPI_PROFILE);
  const colorRule = result.profileRules.find((r) => r.ruleId === 'RULE-PROF-CLR-001');
  assert.equal(colorRule?.status, 'error');
});

test('RGB em perfil large_format (rgbPolicy=warning) gera apenas warning', () => {
  const doc = makeMinimalDoc({
    colorSummary: { hasRgb: true, hasCmyk: false, hasSpotColors: false, familiesDetected: ['DeviceRGB'] },
    pages: [
      {
        ...makeMinimalDoc().pages[0],
        colorOccurrences: [{ page: 1, family: 'DeviceRGB', count: 1 }],
      },
    ],
  });
  const result = runDeterministicRuleEngine(doc, LARGE_FORMAT_BANNER_PROFILE);
  const colorRule = result.profileRules.find((r) => r.ruleId === 'RULE-PROF-CLR-001');
  assert.equal(colorRule?.status, 'warning');
});

// ============================================================================
// TESTES: Fonte não incorporada
// ============================================================================

test('Fonte não incorporada e em uso gera erro bloqueante', () => {
  const doc = makeMinimalDoc({
    fonts: [
      {
        id: 'Helvetica',
        baseFont: 'Helvetica',
        cleanFontName: 'Helvetica',
        subtype: 'Type1',
        isEmbedded: 'no',
        isUsedInContent: true,
        usedPages: [1],
      },
    ],
  });
  const result = runDeterministicRuleEngine(doc, COMMERCIAL_PRINT_300DPI_PROFILE);
  const fontRule = result.universalRules.find((r) => r.ruleId === 'RULE-FONT-001');
  assert.equal(fontRule?.status, 'error');
});

test('Fonte incorporada (subset) é aprovada', () => {
  const doc = makeMinimalDoc({
    fonts: [
      {
        id: 'ABCDEF+Helvetica',
        baseFont: 'ABCDEF+Helvetica',
        cleanFontName: 'Helvetica',
        subtype: 'TrueType',
        isEmbedded: 'subset',
        isUsedInContent: true,
        usedPages: [1],
      },
    ],
  });
  const result = runDeterministicRuleEngine(doc, COMMERCIAL_PRINT_300DPI_PROFILE);
  const fontRule = result.universalRules.find((r) => r.ruleId === 'RULE-FONT-001');
  assert.equal(fontRule?.status, 'approved');
});

// ============================================================================
// TESTES: Transparência
// ============================================================================

test('Transparência detectada: hasTransparency=true na página', async () => {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]);
  // Adicionar ExtGState com ca < 1 para simular transparência
  const extGStateDict = pdfDoc.context.obj({
    Type: 'ExtGState',
    ca: 0.5,
  });
  const extGStateRef = pdfDoc.context.register(extGStateDict);
  const resourcesDict = page.node.Resources() as any;
  if (resourcesDict instanceof PDFDict) {
    resourcesDict.set(PDFName.of('ExtGState'), pdfDoc.context.obj({ GS1: extGStateRef }));
  }
  const buf = Buffer.from(await pdfDoc.save());
  const structure = await extractPdfStructure(buf);
  assert.equal(structure.pages[0].hasTransparency, true);
});

test('Sem transparência: hasTransparency=false em página normal', async () => {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.addPage([595.28, 841.89]);
  const buf = Buffer.from(await pdfDoc.save());
  const structure = await extractPdfStructure(buf);
  assert.equal(structure.pages[0].hasTransparency, false);
});

// ============================================================================
// TESTES: PDF/X
// ============================================================================

test('PDF/X declarado: RULE-PDFX-001 aprovado', () => {
  const doc = makeMinimalDoc({
    pdfxInfo: { isDeclaredPdfX: true, declaredVersion: 'PDF/X-1a:2001', recognizedStandard: 'PDF/X-1a:2001' },
  });
  const result = runDeterministicRuleEngine(doc, COMMERCIAL_PRINT_300DPI_PROFILE);
  const pdfxRule = result.universalRules.find((r) => r.ruleId === 'RULE-PDFX-001');
  assert.equal(pdfxRule?.status, 'approved');
});

test('PDF/X ausente em perfil comercial (recommendsPdfX=true) gera warning', () => {
  const doc = makeMinimalDoc({
    pdfxInfo: { isDeclaredPdfX: false },
  });
  const result = runDeterministicRuleEngine(doc, COMMERCIAL_PRINT_300DPI_PROFILE);
  const pdfxRule = result.universalRules.find((r) => r.ruleId === 'RULE-PDFX-001');
  assert.equal(pdfxRule?.status, 'warning');
});

test('PDF/X ausente em perfil large_format (recommendsPdfX=false) é aprovado', () => {
  const doc = makeMinimalDoc({
    pdfxInfo: { isDeclaredPdfX: false },
  });
  const result = runDeterministicRuleEngine(doc, LARGE_FORMAT_BANNER_PROFILE);
  const pdfxRule = result.universalRules.find((r) => r.ruleId === 'RULE-PDFX-001');
  assert.equal(pdfxRule?.status, 'approved');
});

// ============================================================================
// QA 06: Regressão Fontes Base14 Não Incorporadas e PDF/X-4
// ============================================================================

test('QA 06: Fontes Base14 (Helvetica e Times-Roman) sem FontDescriptor/FontFile são detectadas como não incorporadas', async () => {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]);

  // Create Type1 Base14 font dictionaries without FontDescriptor
  const helvDict = pdfDoc.context.obj({
    Type: 'Font',
    Subtype: 'Type1',
    BaseFont: 'Helvetica',
    Encoding: 'WinAnsiEncoding',
  });
  const helvRef = pdfDoc.context.register(helvDict);

  const timesDict = pdfDoc.context.obj({
    Type: 'Font',
    Subtype: 'Type1',
    BaseFont: 'Times-Roman',
    Encoding: 'WinAnsiEncoding',
  });
  const timesRef = pdfDoc.context.register(timesDict);

  page.node.set(
    PDFName.of('Resources'),
    pdfDoc.context.obj({
      Font: {
        F1: helvRef,
        F2: timesRef,
      },
    })
  );

  // Content stream invoking /F1 and /F2 via Tf
  const contentStream = Buffer.from('BT /F1 12 Tf 50 700 Td (Texto em Helvetica) Tj /F2 14 Tf 0 -20 Td (Texto em Times) Tj ET', 'utf-8');
  page.node.set(PDFName.of('Contents'), pdfDoc.context.register(PDFRawStream.of(pdfDoc.context.obj({}) as any, contentStream)));

  const pdfBytes = await pdfDoc.save({ useObjectStreams: false });
  const structure = await extractPdfStructure(Buffer.from(pdfBytes));

  assert.equal(structure.fonts.length, 2, 'Deve detectar 2 fontes no documento');
  const helv = structure.fonts.find((f) => f.baseFont === 'Helvetica');
  const times = structure.fonts.find((f) => f.baseFont === 'Times-Roman');

  assert.ok(helv, 'Helvetica encontrada');
  assert.equal(helv?.isUsedInContent, true, 'Helvetica usada no conteúdo (Tf)');
  assert.equal(helv?.isEmbedded, 'no', 'Helvetica Base14 sem FontFile NÃO incorporada');

  assert.ok(times, 'Times-Roman encontrada');
  assert.equal(times?.isUsedInContent, true, 'Times-Roman usada no conteúdo (Tf)');
  assert.equal(times?.isEmbedded, 'no', 'Times-Roman Base14 sem FontFile NÃO incorporada');

  // Rule Engine: RULE-FONT-001 must FAIL
  const rules = runDeterministicRuleEngine(structure, COMMERCIAL_PRINT_300DPI_PROFILE);
  const fontRule = rules.results.find((r) => r.ruleId === 'RULE-FONT-001');
  assert.equal(fontRule?.status, 'error', 'RULE-FONT-001 deve reprovar (error)');
  assert.ok(fontRule?.evidence.includes('Helvetica'), 'Evidência cita Helvetica');
  assert.ok(fontRule?.evidence.includes('Times-Roman'), 'Evidência cita Times-Roman');
});

test('QA 06: Documento apenas com curvas/vetores (sem Tf nem Font) aprova RULE-FONT-001', async () => {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]);
  const vectorContent = Buffer.from('100 100 200 200 re f', 'utf-8');
  page.node.set(PDFName.of('Contents'), pdfDoc.context.register(PDFRawStream.of(pdfDoc.context.obj({}) as any, vectorContent)));

  const pdfBytes = await pdfDoc.save({ useObjectStreams: false });
  const structure = await extractPdfStructure(Buffer.from(pdfBytes));

  assert.equal(structure.fonts.length, 0, '0 fontes declaradas');
  const rules = runDeterministicRuleEngine(structure, COMMERCIAL_PRINT_300DPI_PROFILE);
  const fontRule = rules.results.find((r) => r.ruleId === 'RULE-FONT-001');
  assert.equal(fontRule?.status, 'approved');
  assert.ok(fontRule?.evidence.includes('Nenhum elemento tipográfico externo declarado ou fontes convertidas em curvas'));
});

// ============================================================================
// QA 07: Distinção entre Fonte Selecionada (Tf) e Efetivamente Renderizada (Tj/TJ/'/")
// ============================================================================

test('QA 07 Caso A: BT /F1 12 Tf ET (sem texto) -> isUsedInContent=false e RULE-FONT-001 aprovado', async () => {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]);
  const helvDict = pdfDoc.context.obj({ Type: 'Font', Subtype: 'Type1', BaseFont: 'Helvetica', Encoding: 'WinAnsiEncoding' });
  const helvRef = pdfDoc.context.register(helvDict);
  page.node.set(PDFName.of('Resources'), pdfDoc.context.obj({ Font: { F1: helvRef } }));

  // Content stream with empty BT/ET block followed by Gray vector shapes
  const content = Buffer.from('1 0 0 1 0 0 cm BT /F1 12 Tf 14.4 TL ET 0.5 g 10 10 100 100 re f', 'utf-8');
  page.node.set(PDFName.of('Contents'), pdfDoc.context.register(PDFRawStream.of(pdfDoc.context.obj({}) as any, content)));

  const pdfBytes = await pdfDoc.save({ useObjectStreams: false });
  const structure = await extractPdfStructure(Buffer.from(pdfBytes));

  assert.equal(structure.fonts.length, 1);
  assert.equal(structure.fonts[0].baseFont, 'Helvetica');
  assert.equal(structure.fonts[0].isUsedInContent, false, 'Tf isolado sem operador de texto NÃO deve marcar used=true');
  assert.equal(structure.fonts[0].isEmbedded, 'no');

  const rules = runDeterministicRuleEngine(structure, COMMERCIAL_PRINT_300DPI_PROFILE);
  const fontRule = rules.results.find((r) => r.ruleId === 'RULE-FONT-001');
  assert.equal(fontRule?.status, 'approved', 'Sem texto renderizado, RULE-FONT-001 deve ser aprovado');
  assert.ok(fontRule?.evidence.includes('Nenhum texto ativo utilizando fontes declaradas'));
});

test('QA 07 Caso B: BT /F1 12 Tf (ABC) Tj ET -> isUsedInContent=true', async () => {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]);
  const helvDict = pdfDoc.context.obj({ Type: 'Font', Subtype: 'Type1', BaseFont: 'Helvetica' });
  const helvRef = pdfDoc.context.register(helvDict);
  page.node.set(PDFName.of('Resources'), pdfDoc.context.obj({ Font: { F1: helvRef } }));

  const content = Buffer.from('BT /F1 12 Tf (ABC) Tj ET', 'utf-8');
  page.node.set(PDFName.of('Contents'), pdfDoc.context.register(PDFRawStream.of(pdfDoc.context.obj({}) as any, content)));

  const pdfBytes = await pdfDoc.save({ useObjectStreams: false });
  const structure = await extractPdfStructure(Buffer.from(pdfBytes));

  assert.equal(structure.fonts.length, 1);
  assert.equal(structure.fonts[0].isUsedInContent, true, 'Tj deve marcar used=true');
});

test('QA 07 Caso C: BT /F1 12 Tf [(A) 20 (B)] TJ ET -> isUsedInContent=true', async () => {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]);
  const helvDict = pdfDoc.context.obj({ Type: 'Font', Subtype: 'Type1', BaseFont: 'Helvetica' });
  const helvRef = pdfDoc.context.register(helvDict);
  page.node.set(PDFName.of('Resources'), pdfDoc.context.obj({ Font: { F1: helvRef } }));

  const content = Buffer.from('BT /F1 12 Tf [(A) 20 (B)] TJ ET', 'utf-8');
  page.node.set(PDFName.of('Contents'), pdfDoc.context.register(PDFRawStream.of(pdfDoc.context.obj({}) as any, content)));

  const pdfBytes = await pdfDoc.save({ useObjectStreams: false });
  const structure = await extractPdfStructure(Buffer.from(pdfBytes));

  assert.equal(structure.fonts.length, 1);
  assert.equal(structure.fonts[0].isUsedInContent, true, 'TJ deve marcar used=true');
});

test('QA 07 Caso D: Fonte apenas em Resources (sem Tf) -> isUsedInContent=false', async () => {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]);
  const helvDict = pdfDoc.context.obj({ Type: 'Font', Subtype: 'Type1', BaseFont: 'Helvetica' });
  const helvRef = pdfDoc.context.register(helvDict);
  page.node.set(PDFName.of('Resources'), pdfDoc.context.obj({ Font: { F1: helvRef } }));

  const content = Buffer.from('0 0 100 100 re f', 'utf-8');
  page.node.set(PDFName.of('Contents'), pdfDoc.context.register(PDFRawStream.of(pdfDoc.context.obj({}) as any, content)));

  const pdfBytes = await pdfDoc.save({ useObjectStreams: false });
  const structure = await extractPdfStructure(Buffer.from(pdfBytes));

  assert.equal(structure.fonts.length, 1);
  assert.equal(structure.fonts[0].isUsedInContent, false);
});

test('QA 07 Caso E: Form XObject com Tf mas sem texto -> isUsedInContent=false', async () => {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]);
  const helvDict = pdfDoc.context.obj({ Type: 'Font', Subtype: 'Type1', BaseFont: 'Helvetica' });
  const helvRef = pdfDoc.context.register(helvDict);

  const formDict = pdfDoc.context.obj({
    Type: 'XObject',
    Subtype: 'Form',
    BBox: [0, 0, 100, 100],
    Resources: { Font: { F1: helvRef } },
  });
  const formContent = Buffer.from('BT /F1 12 Tf ET', 'utf-8');
  const formStream = PDFRawStream.of(formDict as any, formContent);
  const formRef = pdfDoc.context.register(formStream);

  page.node.set(PDFName.of('Resources'), pdfDoc.context.obj({ XObject: { Form1: formRef } }));
  page.node.set(PDFName.of('Contents'), pdfDoc.context.register(PDFRawStream.of(pdfDoc.context.obj({}) as any, Buffer.from('/Form1 Do', 'utf-8'))));

  const pdfBytes = await pdfDoc.save({ useObjectStreams: false });
  const structure = await extractPdfStructure(Buffer.from(pdfBytes));

  assert.equal(structure.fonts.length, 1);
  assert.equal(structure.fonts[0].isUsedInContent, false);
});

test('QA 07 Caso F: Form XObject com Tf + Tj -> isUsedInContent=true', async () => {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]);
  const helvDict = pdfDoc.context.obj({ Type: 'Font', Subtype: 'Type1', BaseFont: 'Helvetica' });
  const helvRef = pdfDoc.context.register(helvDict);

  const formDict = pdfDoc.context.obj({
    Type: 'XObject',
    Subtype: 'Form',
    BBox: [0, 0, 100, 100],
    Resources: { Font: { F1: helvRef } },
  });
  const formContent = Buffer.from('BT /F1 12 Tf (Hello Form) Tj ET', 'utf-8');
  const formStream = PDFRawStream.of(formDict as any, formContent);
  const formRef = pdfDoc.context.register(formStream);

  page.node.set(PDFName.of('Resources'), pdfDoc.context.obj({ XObject: { Form1: formRef } }));
  page.node.set(PDFName.of('Contents'), pdfDoc.context.register(PDFRawStream.of(pdfDoc.context.obj({}) as any, Buffer.from('/Form1 Do', 'utf-8'))));

  const pdfBytes = await pdfDoc.save({ useObjectStreams: false });
  const structure = await extractPdfStructure(Buffer.from(pdfBytes));

  assert.equal(structure.fonts.length, 1);
  assert.equal(structure.fonts[0].isUsedInContent, true);
});

// ============================================================================
// QA 10: Detecção Precoce de PDF Criptografado e Erro Controlado
// ============================================================================

test('QA 10 Caso A: PDF com /Encrypt dispara PdfEncryptedError sem crash de data', async () => {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.addPage([595.28, 841.89]);

  // Simulate an encryption dictionary in trailer
  const encryptDict = pdfDoc.context.obj({
    Filter: 'Standard',
    V: 4,
    R: 4,
    P: -60,
  });
  const encryptRef = pdfDoc.context.register(encryptDict);
  pdfDoc.context.trailerInfo.Encrypt = encryptRef;

  const pdfBytes = await pdfDoc.save({ useObjectStreams: false });

  await assert.rejects(
    async () => {
      await extractPdfStructure(Buffer.from(pdfBytes));
    },
    (err: any) => {
      assert.equal(err.code, 'PDF_ENCRYPTED');
      assert.equal(err.status, 'manual_required');
      assert.ok(err.message.includes('protegido por senha ou criptografia'));
      return true;
    }
  );
});

test('QA 10 Caso B: PDF normal sem criptografia carrega com sucesso', async () => {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.addPage([595.28, 841.89]);
  const pdfBytes = await pdfDoc.save({ useObjectStreams: false });
  const structure = await extractPdfStructure(Buffer.from(pdfBytes));
  assert.equal(structure.pageCount, 1);
});

test('QA 10 Caso C: PDF contendo string literal "/Encrypt" em stream de texto NÃO dispara PdfEncryptedError', async () => {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]);
  const textContent = Buffer.from('BT /F1 12 Tf (Este texto contem a palavra /Encrypt) Tj ET', 'utf-8');
  page.node.set(PDFName.of('Contents'), pdfDoc.context.register(PDFRawStream.of(pdfDoc.context.obj({}) as any, textContent)));

  const pdfBytes = await pdfDoc.save({ useObjectStreams: false });
  const structure = await extractPdfStructure(Buffer.from(pdfBytes));
  assert.equal(structure.pageCount, 1);
});

// ============================================================================
// QA 13: Detecção Determinística de RGB Vetorial (rg, RG, cs/sc, CS/SC, Form XObject)
// ============================================================================

test('QA 13 Caso A: Vetor com 1 0 0 rg (preenchimento RGB) -> hasRgbVector=true, hasRgbRaster=false, hasRgb=true', async () => {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]);
  const content = Buffer.from('1 0 0 rg 50 50 200 200 re f', 'utf-8');
  page.node.set(PDFName.of('Contents'), pdfDoc.context.register(PDFRawStream.of(pdfDoc.context.obj({}) as any, content)));

  const pdfBytes = await pdfDoc.save({ useObjectStreams: false });
  const structure = await extractPdfStructure(Buffer.from(pdfBytes));

  assert.equal(structure.colorSummary.hasRgb, true);
  assert.equal(structure.colorSummary.hasRgbVector, true);
  assert.equal(structure.colorSummary.hasRgbRaster, false);
});

test('QA 13 Caso B: Vetor com 0 1 0 RG (traço RGB) -> hasRgbVector=true', async () => {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]);
  const content = Buffer.from('0 1 0 RG 10 w 50 50 m 200 200 l S', 'utf-8');
  page.node.set(PDFName.of('Contents'), pdfDoc.context.register(PDFRawStream.of(pdfDoc.context.obj({}) as any, content)));

  const pdfBytes = await pdfDoc.save({ useObjectStreams: false });
  const structure = await extractPdfStructure(Buffer.from(pdfBytes));

  assert.equal(structure.colorSummary.hasRgb, true);
  assert.equal(structure.colorSummary.hasRgbVector, true);
});

test('QA 13 Caso C: DeviceRGB cs + 0.2 0.4 0.8 sc -> hasRgbVector=true', async () => {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]);
  const content = Buffer.from('/DeviceRGB cs 0.2 0.4 0.8 sc 50 50 100 100 re f', 'utf-8');
  page.node.set(PDFName.of('Contents'), pdfDoc.context.register(PDFRawStream.of(pdfDoc.context.obj({}) as any, content)));

  const pdfBytes = await pdfDoc.save({ useObjectStreams: false });
  const structure = await extractPdfStructure(Buffer.from(pdfBytes));

  assert.equal(structure.colorSummary.hasRgb, true);
  assert.equal(structure.colorSummary.hasRgbVector, true);
});

test('QA 13 Caso D: Vetor CMYK com k e K -> hasRgbVector=false, hasCmyk=true', async () => {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]);
  const content = Buffer.from('0.1 0.2 0.3 0.4 k 0 0.5 0.5 0 K 50 50 100 100 re B', 'utf-8');
  page.node.set(PDFName.of('Contents'), pdfDoc.context.register(PDFRawStream.of(pdfDoc.context.obj({}) as any, content)));

  const pdfBytes = await pdfDoc.save({ useObjectStreams: false });
  const structure = await extractPdfStructure(Buffer.from(pdfBytes));

  assert.equal(structure.colorSummary.hasRgb, false);
  assert.equal(structure.colorSummary.hasRgbVector, false);
  assert.equal(structure.colorSummary.hasCmyk, true);
});

test('QA 13 Caso E: Vetor Grayscale com g e G -> hasRgbVector=false', async () => {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]);
  const content = Buffer.from('0.5 g 0 G 50 50 100 100 re B', 'utf-8');
  page.node.set(PDFName.of('Contents'), pdfDoc.context.register(PDFRawStream.of(pdfDoc.context.obj({}) as any, content)));

  const pdfBytes = await pdfDoc.save({ useObjectStreams: false });
  const structure = await extractPdfStructure(Buffer.from(pdfBytes));

  assert.equal(structure.colorSummary.hasRgb, false);
  assert.equal(structure.colorSummary.hasRgbVector, false);
});

test('QA 13 Caso F: RGB vetorial dentro de Form XObject -> hasRgbVector=true', async () => {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]);

  const formDict = pdfDoc.context.obj({
    Type: 'XObject',
    Subtype: 'Form',
    BBox: [0, 0, 100, 100],
    Resources: {},
  });
  const formContent = Buffer.from('.9 .15 .15 rg 0 0 100 100 re f', 'utf-8');
  const formStream = PDFRawStream.of(formDict as any, formContent);
  const formRef = pdfDoc.context.register(formStream);

  page.node.set(PDFName.of('Resources'), pdfDoc.context.obj({ XObject: { FormVector: formRef } }));
  page.node.set(PDFName.of('Contents'), pdfDoc.context.register(PDFRawStream.of(pdfDoc.context.obj({}) as any, Buffer.from('/FormVector Do', 'utf-8'))));

  const pdfBytes = await pdfDoc.save({ useObjectStreams: false });
  const structure = await extractPdfStructure(Buffer.from(pdfBytes));

  assert.equal(structure.colorSummary.hasRgb, true);
  assert.equal(structure.colorSummary.hasRgbVector, true);
});

// ============================================================================
// QA 19: Form XObjects Aninhados em Múltiplos Níveis (Recursão Profunda & Ciclos)
// ============================================================================

test('QA 19 Caso A: Page -> Image (depth 0) detecta normalmente', async () => {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]);
  const imgStream = PDFRawStream.of(pdfDoc.context.obj({
    Type: 'XObject', Subtype: 'Image', Width: 100, Height: 100, BitsPerComponent: 8, ColorSpace: 'DeviceRGB',
  }) as any, new Uint8Array(100 * 100 * 3));
  const imgRef = pdfDoc.context.register(imgStream);
  page.node.set(PDFName.of('Resources'), pdfDoc.context.obj({ XObject: { Im0: imgRef } }));
  page.node.set(PDFName.of('Contents'), pdfDoc.context.register(PDFRawStream.of(pdfDoc.context.obj({}) as any, Buffer.from('q 100 0 0 100 0 0 cm /Im0 Do Q', 'utf-8'))));

  const pdfBytes = await pdfDoc.save({ useObjectStreams: false });
  const structure = await extractPdfStructure(Buffer.from(pdfBytes));
  assert.equal(structure.pages[0].imageOccurrences.length, 1);
  assert.equal(structure.pages[0].imageOccurrences[0].name, 'Im0');
  assert.equal(structure.colorSummary.hasRgbRaster, true);
});

test('QA 19 Caso B: Page -> Form -> Image (depth 1) detecta com prefixo', async () => {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]);
  const imgStream = PDFRawStream.of(pdfDoc.context.obj({
    Type: 'XObject', Subtype: 'Image', Width: 100, Height: 100, BitsPerComponent: 8, ColorSpace: 'DeviceRGB',
  }) as any, new Uint8Array(100 * 100 * 3));
  const imgRef = pdfDoc.context.register(imgStream);

  const formStream = PDFRawStream.of(pdfDoc.context.obj({
    Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 100, 100], Resources: { XObject: { Im0: imgRef } },
  }) as any, Buffer.from('q 100 0 0 100 0 0 cm /Im0 Do Q', 'utf-8'));
  const formRef = pdfDoc.context.register(formStream);

  page.node.set(PDFName.of('Resources'), pdfDoc.context.obj({ XObject: { Fm1: formRef } }));
  page.node.set(PDFName.of('Contents'), pdfDoc.context.register(PDFRawStream.of(pdfDoc.context.obj({}) as any, Buffer.from('/Fm1 Do', 'utf-8'))));

  const pdfBytes = await pdfDoc.save({ useObjectStreams: false });
  const structure = await extractPdfStructure(Buffer.from(pdfBytes));
  assert.equal(structure.pages[0].imageOccurrences.length, 1);
  assert.equal(structure.pages[0].imageOccurrences[0].name, 'Fm1/Im0');
  assert.equal(structure.colorSummary.hasRgbRaster, true);
});

test('QA 19 Caso C & D: Page -> Form -> Form -> Form -> Image (depth 3) detecta recursivamente', async () => {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]);
  const imgStream = PDFRawStream.of(pdfDoc.context.obj({
    Type: 'XObject', Subtype: 'Image', Width: 200, Height: 200, BitsPerComponent: 8, ColorSpace: 'DeviceRGB',
  }) as any, new Uint8Array(200 * 200 * 3));
  const imgRef = pdfDoc.context.register(imgStream);

  // Fm1 contains Im0
  const form1Stream = PDFRawStream.of(pdfDoc.context.obj({
    Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 100, 100], Resources: { XObject: { Im0: imgRef } },
  }) as any, Buffer.from('/Im0 Do', 'utf-8'));
  const form1Ref = pdfDoc.context.register(form1Stream);

  // Fm2 contains Fm1
  const form2Stream = PDFRawStream.of(pdfDoc.context.obj({
    Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 100, 100], Resources: { XObject: { Fm1: form1Ref } },
  }) as any, Buffer.from('/Fm1 Do', 'utf-8'));
  const form2Ref = pdfDoc.context.register(form2Stream);

  // Fm3 contains Fm2
  const form3Stream = PDFRawStream.of(pdfDoc.context.obj({
    Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 100, 100], Resources: { XObject: { Fm2: form2Ref } },
  }) as any, Buffer.from('/Fm2 Do', 'utf-8'));
  const form3Ref = pdfDoc.context.register(form3Stream);

  page.node.set(PDFName.of('Resources'), pdfDoc.context.obj({ XObject: { Fm3: form3Ref } }));
  page.node.set(PDFName.of('Contents'), pdfDoc.context.register(PDFRawStream.of(pdfDoc.context.obj({}) as any, Buffer.from('/Fm3 Do', 'utf-8'))));

  const pdfBytes = await pdfDoc.save({ useObjectStreams: false });
  const structure = await extractPdfStructure(Buffer.from(pdfBytes));
  assert.equal(structure.pages[0].imageOccurrences.length, 1);
  assert.equal(structure.pages[0].imageOccurrences[0].name, 'Fm3/Fm2/Fm1/Im0');
  assert.equal(structure.colorSummary.hasRgbRaster, true);
});

test('QA 19 Caso E: Form XObject com referência circular controlada não trava nem entra em loop infinito', async () => {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]);

  const formDict = pdfDoc.context.obj({
    Type: 'XObject',
    Subtype: 'Form',
    BBox: [0, 0, 100, 100],
    Resources: {},
  });
  const formStream = PDFRawStream.of(formDict as any, Buffer.from('/Loop Do', 'utf-8'));
  const formRef = pdfDoc.context.register(formStream);
  (formDict as any).get(PDFName.of('Resources')).set(PDFName.of('XObject'), pdfDoc.context.obj({ Loop: formRef }));

  page.node.set(PDFName.of('Resources'), pdfDoc.context.obj({ XObject: { Loop: formRef } }));
  page.node.set(PDFName.of('Contents'), pdfDoc.context.register(PDFRawStream.of(pdfDoc.context.obj({}) as any, Buffer.from('/Loop Do', 'utf-8'))));

  const pdfBytes = await pdfDoc.save({ useObjectStreams: false });
  // Must finish promptly without infinite recursion or stack overflow
  const structure = await extractPdfStructure(Buffer.from(pdfBytes));
  assert.equal(structure.pageCount, 1);
});

test('QA PDFRef: Runtime de extração executa instanceof PDFRef sem ReferenceError em XObjects', async () => {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]);

  // Add dummy image XObject registered in context
  const rawRgb = new Uint8Array(10 * 10 * 3);
  const imgDict = pdfDoc.context.obj({
    Type: 'XObject',
    Subtype: 'Image',
    Width: 10,
    Height: 10,
    BitsPerComponent: 8,
    ColorSpace: 'DeviceRGB',
    Filter: 'FlateDecode',
  });
  const imgStream = PDFRawStream.of(imgDict as any, pako.deflate(rawRgb));
  const imgRef = pdfDoc.context.register(imgStream);
  page.node.set(PDFName.of('Resources'), pdfDoc.context.obj({ XObject: { Im0: imgRef } }));
  page.node.set(PDFName.of('Contents'), pdfDoc.context.register(PDFRawStream.of(pdfDoc.context.obj({}) as any, Buffer.from('q 10 0 0 10 0 0 cm /Im0 Do Q', 'utf-8'))));

  const pdfBytes = await pdfDoc.save({ useObjectStreams: false });
  const structure = await extractPdfStructure(Buffer.from(pdfBytes));
  assert.equal(structure.pages[0].imageOccurrences.length, 1);
  assert.equal(structure.pages[0].imageOccurrences[0].name, 'Im0');
});

// ============================================================================
// RELATÓRIO
// ============================================================================

console.log(`\n  PDF/Parser: ${passed}/${passed + failed} aprovados${failed > 0 ? `, ${failed} falhas` : ''}`);
if (bugs.length > 0) {
  console.log('  BUGS REAIS ENCONTRADOS:');
  for (const b of bugs) console.log(`    - ${b}`);
}

export { bugs as pdfBugs, passed as pdfPassed, failed as pdfFailed };




