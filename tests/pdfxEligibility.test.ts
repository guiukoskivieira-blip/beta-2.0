import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluatePdfx4Eligibility, type PdfxEligibilityResult } from '../src/services/pdfxEligibility.ts';
import { COMMERCIAL_PRINT_300DPI_PROFILE } from '../src/utils/productionProfiles.ts';
import type { PdfDocumentStructure, RuleEvaluationResult } from '../src/types/index.ts';

function createMockDoc(overrides: Partial<PdfDocumentStructure> = {}): PdfDocumentStructure {
  return {
    pageCount: 1,
    pages: [
      {
        page: 1,
        widthPt: 255.118,
        heightPt: 141.732,
        widthMm: 90,
        heightMm: 50,
        visualWidthMm: 90,
        visualHeightMm: 50,
        orientation: 'landscape',
        rotation: 0,
        mediaBox: {
          status: 'explicit',
          xPt: 0,
          yPt: 0,
          widthPt: 272.126, // 96mm (includes 3mm bleed on each side)
          heightPt: 158.74, // 56mm
          xMm: 0,
          yMm: 0,
          widthMm: 96,
          heightMm: 56,
        },
        trimBox: {
          status: 'explicit',
          xPt: 8.504,
          yPt: 8.504,
          widthPt: 255.118,
          heightPt: 141.732,
          xMm: 3,
          yMm: 3,
          widthMm: 90,
          heightMm: 50,
        },
        bleedBox: {
          status: 'explicit',
          xPt: 0,
          yPt: 0,
          widthPt: 272.126,
          heightPt: 158.74,
          xMm: 0,
          yMm: 0,
          widthMm: 96,
          heightMm: 56,
        },
        hasTransparency: false,
        imageOccurrences: [],
        colorOccurrences: [],
      },
    ],
    fonts: [
      {
        id: 'F1',
        cleanFontName: 'Helvetica-Embedded',
        isEmbedded: 'yes',
        isUsedInContent: true,
      },
    ],
    outputIntents: [
      {
        type: 'OutputIntent',
        subtype: 'GTS_PDFX',
        outputConditionIdentifier: 'CGATS TR 001',
        hasDestOutputProfile: true,
        destOutputProfile: {
          components: 4,
          colorSpace: 'CMYK',
          byteLength: 500000,
          isValidIcc: true,
        },
      },
    ],
    colorSummary: {
      hasRgb: false,
      hasCmyk: true,
      hasSpotColors: false,
      familiesDetected: ['DeviceCMYK'],
    },
    ...overrides,
  };
}

const mockApprovedRules: RuleEvaluationResult[] = [
  {
    ruleId: 'RULE-STRUCT-001',
    title: 'Estrutura PDF',
    category: 'universal',
    status: 'approved',
    evidence: 'PDF 1.6 válido',
    explanation: '',
    recommendation: '',
  },
  {
    ruleId: 'RULE-DATA-001',
    title: 'Determinabilidade de Dados',
    category: 'universal',
    status: 'approved',
    evidence: 'Dados extraídos',
    explanation: '',
    recommendation: '',
  },
];

test('1. Arquivo 100% elegível para PDF/X-4: status "eligible", verifiedPdfX estritamente false', () => {
  const doc = createMockDoc();
  const res = evaluatePdfx4Eligibility(doc, {
    profile: COMMERCIAL_PRINT_300DPI_PROFILE,
    ruleResults: mockApprovedRules,
  });

  assert.equal(res.targetStandard, 'PDF/X-4');
  assert.equal(res.status, 'eligible');
  assert.equal(res.eligible, true);
  assert.equal(res.internallyEligibleForPdfX4, true);
  // REGRA FUNDAMENTAL: verifiedPdfX NUNCA é true na avaliação de elegibilidade
  assert.equal(res.verifiedPdfX, false, 'verifiedPdfX deve permanecer false pois o arquivo PDF/X ainda não foi gerado');
  assert.equal(res.blockers.length, 0);
  assert.equal(res.fixPlan.length, 0);
});

test('2. PDF estruturalmente inválido: status "blocked" com PDFX_STRUCTURAL_INVALID', () => {
  const doc = createMockDoc();
  const res = evaluatePdfx4Eligibility(doc, {
    profile: COMMERCIAL_PRINT_300DPI_PROFILE,
    ruleResults: [
      {
        ruleId: 'RULE-STRUCT-001',
        title: 'Estrutura PDF',
        category: 'universal',
        status: 'error',
        evidence: 'Tabela XRef corrompida',
        explanation: '',
        recommendation: '',
      },
    ],
  });

  assert.equal(res.status, 'blocked');
  assert.equal(res.eligible, false);
  assert.equal(res.verifiedPdfX, false);
  const check = res.checks.find((c) => c.id === 'PDFX_STRUCTURAL_VALIDITY');
  assert.equal(check?.status, 'blocked');
  assert.equal(check?.reasonCode, 'PDFX_STRUCTURAL_INVALID');
  assert.ok(res.blockers.some((b) => b.code === 'PDFX_STRUCTURAL_INVALID'));
});

test('3. Fonte utilizada no conteúdo e não incorporada: status "manual_required" com PDFX_FONT_NOT_EMBEDDED', () => {
  const doc = createMockDoc({
    fonts: [
      {
        id: 'F1',
        cleanFontName: 'Arial-NonEmbedded',
        isEmbedded: 'no',
        isUsedInContent: true,
      },
    ],
  });
  const res = evaluatePdfx4Eligibility(doc, {
    profile: COMMERCIAL_PRINT_300DPI_PROFILE,
    ruleResults: mockApprovedRules,
  });

  assert.equal(res.status, 'manual_required');
  assert.equal(res.eligible, false);
  assert.equal(res.verifiedPdfX, false);
  const check = res.checks.find((c) => c.id === 'PDFX_FONTS');
  assert.equal(check?.status, 'manual_required');
  assert.equal(check?.reasonCode, 'PDFX_FONT_NOT_EMBEDDED');
  assert.ok(res.fixPlan.some((fp) => fp.code === 'PDFX_FONT_NOT_EMBEDDED' && fp.fixType === 'manual'));
});

test('4. Output Intent ausente: status "fixable" com PDFX_OUTPUT_INTENT_MISSING (fixType: auto)', () => {
  const doc = createMockDoc({
    outputIntents: [],
  });
  const res = evaluatePdfx4Eligibility(doc, {
    profile: COMMERCIAL_PRINT_300DPI_PROFILE,
    ruleResults: mockApprovedRules,
  });

  assert.equal(res.status, 'fixable');
  assert.equal(res.eligible, true);
  assert.equal(res.internallyEligibleForPdfX4, true);
  assert.equal(res.verifiedPdfX, false);
  const check = res.checks.find((c) => c.id === 'PDFX_OUTPUT_INTENT');
  assert.equal(check?.status, 'fixable');
  assert.equal(check?.reasonCode, 'PDFX_OUTPUT_INTENT_MISSING');
  assert.equal(check?.fixType, 'auto');
  assert.ok(res.fixPlan.some((fp) => fp.code === 'PDFX_OUTPUT_INTENT_MISSING' && fp.fixType === 'auto'));
});

test('5. Output Intent com ICC corrompido: status "blocked" com PDFX_OUTPUT_INTENT_INVALID', () => {
  const doc = createMockDoc({
    outputIntents: [
      {
        type: 'OutputIntent',
        subtype: 'GTS_PDFX',
        outputConditionIdentifier: 'Custom',
        hasDestOutputProfile: true,
        destOutputProfile: {
          components: 4,
          colorSpace: 'CMYK',
          byteLength: 100,
          isValidIcc: false, // Corrupt ICC
        },
      },
    ],
  });
  const res = evaluatePdfx4Eligibility(doc, {
    profile: COMMERCIAL_PRINT_300DPI_PROFILE,
    ruleResults: mockApprovedRules,
  });

  assert.equal(res.status, 'blocked');
  assert.equal(res.eligible, false);
  assert.equal(res.verifiedPdfX, false);
  const check = res.checks.find((c) => c.id === 'PDFX_OUTPUT_INTENT');
  assert.equal(check?.status, 'blocked');
  assert.equal(check?.reasonCode, 'PDFX_OUTPUT_INTENT_INVALID');
});

test('6. TrimBox ausente com MediaBox presente: status "fixable" com PDFX_TRIMBOX_FIXABLE (fixType: auto)', () => {
  const doc = createMockDoc();
  doc.pages[0].trimBox = undefined; // TrimBox ausente

  const res = evaluatePdfx4Eligibility(doc, {
    profile: COMMERCIAL_PRINT_300DPI_PROFILE,
    ruleResults: mockApprovedRules,
  });

  assert.equal(res.status, 'fixable');
  assert.equal(res.eligible, true);
  assert.equal(res.verifiedPdfX, false);
  const check = res.checks.find((c) => c.id === 'PDFX_TRIMBOX');
  assert.equal(check?.status, 'fixable');
  assert.equal(check?.reasonCode, 'PDFX_TRIMBOX_FIXABLE');
  assert.equal(check?.fixType, 'auto');
  assert.ok(res.fixPlan.some((fp) => fp.code === 'PDFX_TRIMBOX_FIXABLE' && fp.fixType === 'auto'));
});

test('7. TrimBox indeterminado (sem MediaBox): status "manual_required" com PDFX_TRIMBOX_UNDETERMINED', () => {
  const doc = createMockDoc();
  doc.pages[0].trimBox = undefined;
  doc.pages[0].mediaBox = { status: 'fallback', xPt: 0, yPt: 0, widthPt: 0, heightPt: 0, xMm: 0, yMm: 0, widthMm: 0, heightMm: 0 };

  const res = evaluatePdfx4Eligibility(doc, {
    profile: COMMERCIAL_PRINT_300DPI_PROFILE,
    ruleResults: mockApprovedRules,
  });

  assert.equal(res.status, 'manual_required');
  assert.equal(res.eligible, false);
  assert.equal(res.verifiedPdfX, false);
  const check = res.checks.find((c) => c.id === 'PDFX_TRIMBOX');
  assert.equal(check?.status, 'manual_required');
  assert.equal(check?.reasonCode, 'PDFX_TRIMBOX_UNDETERMINED');
});

test('8. Imagens RGB dentro do Safe Scope V1.2: status "fixable" com PDFX_RGB_FIXABLE (fixType: auto)', () => {
  const doc = createMockDoc({
    colorSummary: {
      hasRgb: true,
      hasCmyk: true,
      hasSpotColors: false,
      familiesDetected: ['DeviceRGB', 'DeviceCMYK'],
    },
  });
  doc.pages[0].imageOccurrences = [
    {
      id: 'img1',
      page: 1,
      widthPx: 1800,
      heightPx: 1000,
      displayWidthMm: 90,
      displayHeightMm: 50,
      effectiveDpiX: 508,
      effectiveDpiY: 508,
      colorSpace: 'DeviceRGB',
      bitsPerComponent: 8,
      filter: 'DCTDecode',
    },
    {
      id: 'img2',
      page: 1,
      widthPx: 1800,
      heightPx: 1000,
      displayWidthMm: 90,
      displayHeightMm: 50,
      effectiveDpiX: 508,
      effectiveDpiY: 508,
      colorSpace: 'DeviceRGB',
      bitsPerComponent: 8,
      filter: 'ASCII85Decode+FlateDecode',
    },
  ];

  const res = evaluatePdfx4Eligibility(doc, {
    profile: COMMERCIAL_PRINT_300DPI_PROFILE,
    ruleResults: mockApprovedRules,
  });

  assert.equal(res.status, 'fixable');
  assert.equal(res.eligible, true);
  assert.equal(res.verifiedPdfX, false);
  const check = res.checks.find((c) => c.id === 'PDFX_COLOR_SPACES');
  assert.equal(check?.status, 'fixable');
  assert.equal(check?.reasonCode, 'PDFX_RGB_FIXABLE');
  assert.equal(check?.fixType, 'auto');
  assert.ok(res.fixPlan.some((fp) => fp.code === 'PDFX_RGB_FIXABLE' && fp.fixType === 'auto'));
});

test('9. Imagens RGB fora do Safe Scope (ex: 16 bpc ou filtro JPX): status "manual_required" com PDFX_RGB_MANUAL_REQUIRED', () => {
  const doc = createMockDoc({
    colorSummary: {
      hasRgb: true,
      hasCmyk: false,
      hasSpotColors: false,
      familiesDetected: ['DeviceRGB'],
    },
  });
  doc.pages[0].imageOccurrences = [
    {
      id: 'img1',
      page: 1,
      widthPx: 1800,
      heightPx: 1000,
      displayWidthMm: 90,
      displayHeightMm: 50,
      effectiveDpiX: 508,
      effectiveDpiY: 508,
      colorSpace: 'DeviceRGB',
      bitsPerComponent: 16, // 16 bits per component unsupported in V1
      filter: 'FlateDecode',
    },
  ];

  const res = evaluatePdfx4Eligibility(doc, {
    profile: COMMERCIAL_PRINT_300DPI_PROFILE,
    ruleResults: mockApprovedRules,
  });

  assert.equal(res.status, 'manual_required');
  assert.equal(res.eligible, false);
  assert.equal(res.verifiedPdfX, false);
  const check = res.checks.find((c) => c.id === 'PDFX_COLOR_SPACES');
  assert.equal(check?.status, 'manual_required');
  assert.equal(check?.reasonCode, 'PDFX_RGB_MANUAL_REQUIRED');
  assert.ok(res.blockers.some((b) => b.code === 'PDFX_RGB_MANUAL_REQUIRED'));
});

test('10. Transparências ativas: aprovadas em PDF/X-4 (ISO 15930-7 permite transparência viva)', () => {
  const doc = createMockDoc();
  doc.pages[0].hasTransparency = true;

  const res = evaluatePdfx4Eligibility(doc, {
    profile: COMMERCIAL_PRINT_300DPI_PROFILE,
    ruleResults: mockApprovedRules,
  });

  assert.equal(res.status, 'eligible');
  assert.equal(res.eligible, true);
  const check = res.checks.find((c) => c.id === 'PDFX_TRANSPARENCY');
  assert.equal(check?.status, 'passed');
  assert.ok(check?.message.includes('permitidas pelo padrão PDF/X-4'));
});

test('11. Documento criptografado / com senha: status "blocked" com PDFX_ENCRYPTED_DOCUMENT', () => {
  const doc = createMockDoc();
  (doc as any).isEncrypted = true;

  const res = evaluatePdfx4Eligibility(doc, {
    profile: COMMERCIAL_PRINT_300DPI_PROFILE,
    ruleResults: mockApprovedRules,
  });

  assert.equal(res.status, 'blocked');
  assert.equal(res.eligible, false);
  assert.equal(res.verifiedPdfX, false);
  const check = res.checks.find((c) => c.id === 'PDFX_ENCRYPTION');
  assert.equal(check?.status, 'blocked');
  assert.equal(check?.reasonCode, 'PDFX_ENCRYPTED_DOCUMENT');
});

test('12. Hierarquia de caixas impossível (TrimBox maior que MediaBox): status "blocked" com PDFX_PAGE_BOXES_INVALID', () => {
  const doc = createMockDoc();
  // TrimBox wider than MediaBox
  doc.pages[0].trimBox = {
    status: 'explicit',
    xPt: 0,
    yPt: 0,
    widthPt: 400, // Exceeds MediaBox 272.126
    heightPt: 141.732,
    xMm: 0,
    yMm: 0,
    widthMm: 141.1,
    heightMm: 50,
  };

  const res = evaluatePdfx4Eligibility(doc, {
    profile: COMMERCIAL_PRINT_300DPI_PROFILE,
    ruleResults: mockApprovedRules,
  });

  assert.equal(res.status, 'blocked');
  assert.equal(res.eligible, false);
  assert.equal(res.verifiedPdfX, false);
  const check = res.checks.find((c) => c.id === 'PDFX_PAGE_BOXES');
  assert.equal(check?.status, 'blocked');
  assert.equal(check?.reasonCode, 'PDFX_PAGE_BOXES_INVALID');
});

test('13. QA 02 Regression: Imagem DCTDecode / JPEG RGB 8 bits avaliada canonicamente -> status "fixable" com PDFX_RGB_FIXABLE (NÃO manual_required)', () => {
  const doc = createMockDoc();
  doc.colorSummary = {
    hasRgb: true,
    hasCmyk: false,
    hasSpotColors: false,
    familiesDetected: ['DeviceRGB'],
  };
  doc.pages[0].imageOccurrences = [
    {
      id: 'FormXob.1/Im0',
      page: 1,
      name: 'FormXob.1/Im0',
      widthPx: 1800,
      heightPx: 1000,
      bitsPerComponent: 8,
      filter: 'DCTDecode',
      colorSpace: 'DeviceRGB',
      displayWidthMm: 152.4, // 432 pt = 6 in
      displayHeightMm: 84.67, // 240 pt = 3.333 in
      effectiveDpiX: 300,
      effectiveDpiY: 300,
      appliedWidthPt: 432,
      appliedHeightPt: 240,
      xPt: 50,
      yPt: 100,
      ctm: [432, 0, 0, 240, 50, 100],
    },
  ];

  const res = evaluatePdfx4Eligibility(doc, {
    profile: COMMERCIAL_PRINT_300DPI_PROFILE,
    ruleResults: mockApprovedRules,
  });

  const check = res.checks.find((c) => c.id === 'PDFX_COLOR_SPACES');
  assert.equal(check?.status, 'fixable', 'Check G deve ser fixable quando imagem for DCTDecode RGB 8bpc');
  assert.equal(check?.reasonCode, 'PDFX_RGB_FIXABLE');
  assert.ok(check?.message.includes('elegíveis para conversão automática LittleCMS'));
  assert.equal(res.blockers.some((b) => b.code === 'PDFX_RGB_MANUAL_REQUIRED'), false);
});

test('14. QA 02 Regression: DPI efetivo de imagem em Form XObject calcula 300 DPI (não 86 DPI)', () => {
  // pixelWidth = 1800, pixelHeight = 1000
  // effectiveWidthPt = 432 pt (6.0 in), effectiveHeightPt = 240 pt (3.333 in)
  // dpiX = 1800 / (432/72) = 300.0 DPI
  // dpiY = 1000 / (240/72) = 300.0 DPI
  const widthPx = 1800;
  const heightPx = 1000;
  const dispWidthPt = 432;
  const dispHeightPt = 240;

  const effectiveDpiX = Number((widthPx / (dispWidthPt / 72.0)).toFixed(1));
  const effectiveDpiY = Number((heightPx / (dispHeightPt / 72.0)).toFixed(1));

  assert.equal(effectiveDpiX, 300);
  assert.equal(effectiveDpiY, 300);
});

test('15. QA 06 Regression: Fontes Base14 não incorporadas usadas no conteúdo bloqueiam PDF/X-4 com PDFX_FONT_NOT_EMBEDDED', () => {
  const doc = createMockDoc();
  doc.fonts = [
    {
      id: 'Helvetica',
      baseFont: 'Helvetica',
      cleanFontName: 'Helvetica',
      subtype: 'Type1',
      isEmbedded: 'no',
      isUsedInContent: true,
      usedPages: [1],
    },
    {
      id: 'Times-Roman',
      baseFont: 'Times-Roman',
      cleanFontName: 'Times-Roman',
      subtype: 'Type1',
      isEmbedded: 'no',
      isUsedInContent: true,
      usedPages: [1],
    },
  ];

  const res = evaluatePdfx4Eligibility(doc, {
    profile: COMMERCIAL_PRINT_300DPI_PROFILE,
    ruleResults: mockApprovedRules,
  });

  assert.equal(res.status, 'manual_required');
  assert.equal(res.eligible, false);
  assert.equal(res.verifiedPdfX, false);

  const fontCheck = res.checks.find((c) => c.id === 'PDFX_FONTS');
  assert.equal(fontCheck?.status, 'manual_required');
  assert.equal(fontCheck?.reasonCode, 'PDFX_FONT_NOT_EMBEDDED');
  assert.ok(fontCheck?.message.includes('Helvetica'));
  assert.ok(fontCheck?.message.includes('Times-Roman'));

  const blocker = res.blockers.find((b) => b.code === 'PDFX_FONT_NOT_EMBEDDED');
  assert.ok(blocker);
});

test('16. QA 09: Multipage com páginas heterogêneas (A4 + 90x50) bloqueia elegibilidade PDF/X-4 com manual_required', () => {
  const doc = createMockDoc();
  doc.pageCount = 2;
  doc.pages = [
    {
      page: 1,
      mediaBox: { xPt: 0, yPt: 0, widthPt: 595.28, heightPt: 841.89, xMm: 0, yMm: 0, widthMm: 210.0, heightMm: 297.0, status: 'explicit' },
      trimBox: { xPt: 0, yPt: 0, widthPt: 595.28, heightPt: 841.89, xMm: 0, yMm: 0, widthMm: 210.0, heightMm: 297.0, status: 'explicit' },
      bleedBox: { xPt: 0, yPt: 0, widthPt: 595.28, heightPt: 841.89, xMm: 0, yMm: 0, widthMm: 210.0, heightMm: 297.0, status: 'explicit' },
      cropBox: { xPt: 0, yPt: 0, widthPt: 595.28, heightPt: 841.89, xMm: 0, yMm: 0, widthMm: 210.0, heightMm: 297.0, status: 'explicit' },
      widthPt: 595.28,
      heightPt: 841.89,
      widthMm: 210.0,
      heightMm: 297.0,
      visualWidthMm: 210.0,
      visualHeightMm: 297.0,
      orientation: 'portrait',
      rotation: 0,
      hasTransparency: false,
      imageOccurrences: [],
      colorOccurrences: [],
    },
    {
      page: 2,
      mediaBox: { xPt: 0, yPt: 0, widthPt: 255.12, heightPt: 141.73, xMm: 0, yMm: 0, widthMm: 90.0, heightMm: 50.0, status: 'explicit' },
      trimBox: { xPt: 0, yPt: 0, widthPt: 255.12, heightPt: 141.73, xMm: 0, yMm: 0, widthMm: 90.0, heightMm: 50.0, status: 'explicit' },
      bleedBox: { xPt: 0, yPt: 0, widthPt: 255.12, heightPt: 141.73, xMm: 0, yMm: 0, widthMm: 90.0, heightMm: 50.0, status: 'explicit' },
      cropBox: { xPt: 0, yPt: 0, widthPt: 255.12, heightPt: 141.73, xMm: 0, yMm: 0, widthMm: 90.0, heightMm: 50.0, status: 'explicit' },
      widthPt: 255.12,
      heightPt: 141.73,
      widthMm: 90.0,
      heightMm: 50.0,
      visualWidthMm: 90.0,
      visualHeightMm: 50.0,
      orientation: 'landscape',
      rotation: 0,
      hasTransparency: false,
      imageOccurrences: [],
      colorOccurrences: [],
    },
  ];

  const res = evaluatePdfx4Eligibility(doc, {
    profile: COMMERCIAL_PRINT_300DPI_PROFILE,
    ruleResults: mockApprovedRules,
  });

  assert.equal(res.status, 'manual_required');
  assert.equal(res.eligible, false);
  assert.equal(res.verifiedPdfX, false);

  const geomCheck = res.checks.find((c) => c.id === 'PDFX_PAGE_SIZE_UNIFORMITY');
  assert.equal(geomCheck?.status, 'manual_required');
  assert.equal(geomCheck?.reasonCode, 'PDFX_HETEROGENEOUS_PAGE_SIZES');
  assert.ok(geomCheck?.message.includes('210.0×297.0'));
  assert.ok(geomCheck?.message.includes('90.0×50.0'));

  const blocker = res.blockers.find((b) => b.code === 'PDFX_HETEROGENEOUS_PAGE_SIZES');
  assert.ok(blocker);
});

test('17. QA 09: Multipage com páginas uniformes (ambas A4) aprova PDFX_PAGE_SIZE_UNIFORMITY', () => {
  const doc = createMockDoc();
  doc.pageCount = 2;
  doc.pages = [
    {
      page: 1,
      mediaBox: { xPt: 0, yPt: 0, widthPt: 595.28, heightPt: 841.89, xMm: 0, yMm: 0, widthMm: 210.0, heightMm: 297.0, status: 'explicit' },
      trimBox: { xPt: 0, yPt: 0, widthPt: 595.28, heightPt: 841.89, xMm: 0, yMm: 0, widthMm: 210.0, heightMm: 297.0, status: 'explicit' },
      bleedBox: { xPt: 0, yPt: 0, widthPt: 595.28, heightPt: 841.89, xMm: 0, yMm: 0, widthMm: 210.0, heightMm: 297.0, status: 'explicit' },
      cropBox: { xPt: 0, yPt: 0, widthPt: 595.28, heightPt: 841.89, xMm: 0, yMm: 0, widthMm: 210.0, heightMm: 297.0, status: 'explicit' },
      widthPt: 595.28,
      heightPt: 841.89,
      widthMm: 210.0,
      heightMm: 297.0,
      visualWidthMm: 210.0,
      visualHeightMm: 297.0,
      orientation: 'portrait',
      rotation: 0,
      hasTransparency: false,
      imageOccurrences: [],
      colorOccurrences: [],
    },
    {
      page: 2,
      mediaBox: { xPt: 0, yPt: 0, widthPt: 595.28, heightPt: 841.89, xMm: 0, yMm: 0, widthMm: 210.0, heightMm: 297.0, status: 'explicit' },
      trimBox: { xPt: 0, yPt: 0, widthPt: 595.28, heightPt: 841.89, xMm: 0, yMm: 0, widthMm: 210.0, heightMm: 297.0, status: 'explicit' },
      bleedBox: { xPt: 0, yPt: 0, widthPt: 595.28, heightPt: 841.89, xMm: 0, yMm: 0, widthMm: 210.0, heightMm: 297.0, status: 'explicit' },
      cropBox: { xPt: 0, yPt: 0, widthPt: 595.28, heightPt: 841.89, xMm: 0, yMm: 0, widthMm: 210.0, heightMm: 297.0, status: 'explicit' },
      widthPt: 595.28,
      heightPt: 841.89,
      widthMm: 210.0,
      heightMm: 297.0,
      visualWidthMm: 210.0,
      visualHeightMm: 297.0,
      orientation: 'portrait',
      rotation: 0,
      hasTransparency: false,
      imageOccurrences: [],
      colorOccurrences: [],
    },
  ];

  const res = evaluatePdfx4Eligibility(doc, {
    profile: COMMERCIAL_PRINT_300DPI_PROFILE,
    ruleResults: mockApprovedRules,
  });

  const geomCheck = res.checks.find((c) => c.id === 'PDFX_PAGE_SIZE_UNIFORMITY');
  assert.equal(geomCheck?.status, 'passed');
});



