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
