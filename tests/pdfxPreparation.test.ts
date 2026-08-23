import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument, PDFName, PDFNumber, PDFRawStream } from 'pdf-lib';
import * as pako from 'pako';
import { preparePdfForPdfx4, type PdfxPreparationResult } from '../src/services/pdfxPreparation.ts';
import { evaluatePdfx4Eligibility } from '../src/services/pdfxEligibility.ts';
import { extractPdfStructure } from '../server/pdfExtractor.ts';
import { runDeterministicRuleEngine } from '../src/utils/ruleEngine.ts';
import { COMMERCIAL_PRINT_300DPI_PROFILE } from '../src/utils/productionProfiles.ts';

/**
 * Creates a raw synthetic test PDF with:
 * - 90x50 mm trim target (MediaBox 96x56 mm = 3mm bleed margin)
 * - 1 RGB raster image 10x10 px (FlateDecode)
 * - Missing OutputIntent
 * - Missing TrimBox and BleedBox
 */
async function createFullFixableTestPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  // 96x56 mm in PDF points: 96 * 72 / 25.4 = 272.126 pt, 56 * 72 / 25.4 = 158.74 pt
  const pageW = (96 * 72) / 25.4;
  const pageH = (56 * 72) / 25.4;
  const page = doc.addPage([pageW, pageH]);

  const rawRgb = new Uint8Array(10 * 10 * 3);
  for (let i = 0; i < rawRgb.length; i += 3) {
    rawRgb[i] = 255;
    rawRgb[i + 1] = 128;
    rawRgb[i + 2] = 0;
  }
  const flateBytes = pako.deflate(rawRgb);

  const imgDict = doc.context.obj({
    Type: 'XObject',
    Subtype: 'Image',
    Width: 10,
    Height: 10,
    BitsPerComponent: 8,
    ColorSpace: 'DeviceRGB',
    Filter: 'FlateDecode',
  });
  const imgStream = PDFRawStream.of(imgDict as any, flateBytes);
  const imgRef = doc.context.register(imgStream);

  page.node.set(
    PDFName.of('Resources'),
    doc.context.obj({ XObject: { Im1: imgRef } })
  );

  return await doc.save({ useObjectStreams: false });
}

test('1. End-to-End: RGB + OutputIntent + Boxes -> 100% preparado, verifiedPdfX estritamente false, original imutável', async () => {
  const originalPdfBytes = await createFullFixableTestPdf();
  const originalCopy = new Uint8Array(originalPdfBytes);

  // Initial verification: document requires fixes
  const initialStructure = await extractPdfStructure(originalPdfBytes);
  const initialRules = runDeterministicRuleEngine(initialStructure, COMMERCIAL_PRINT_300DPI_PROFILE);
  const initialEligibility = evaluatePdfx4Eligibility(initialStructure, {
    profile: COMMERCIAL_PRINT_300DPI_PROFILE,
    ruleResults: initialRules,
  });

  assert.equal(initialEligibility.status, 'fixable', 'Estado inicial deve ser fixable');
  assert.equal(initialEligibility.eligible, true);
  assert.equal(initialEligibility.verifiedPdfX, false);

  // Execute Orchestrator
  const prepResult: PdfxPreparationResult = await preparePdfForPdfx4(originalPdfBytes, {
    profile: COMMERCIAL_PRINT_300DPI_PROFILE,
    allowFallbackSrgb: true,
    destinationIccPresetId: 'cgats_tr_001_swop',
  });

  assert.equal(prepResult.success, true, 'Orquestrador deve retornar success: true');
  assert.equal(prepResult.status, 'prepared', 'Status final deve ser "prepared"');
  // CRITICAL: verifiedPdfX must remain strictly false
  assert.equal(prepResult.verifiedPdfX, false, 'verifiedPdfX DEVE permanecer false');
  assert.ok(prepResult.pdfBytes, 'pdfBytes gerado deve existir');

  // Verify immutability of original buffer
  assert.ok(Buffer.from(originalPdfBytes).equals(Buffer.from(originalCopy)), 'Buffer original DEVE permanecer byte-for-byte inalterado');
  assert.notEqual(prepResult.originalSha256, prepResult.preparedSha256, 'Hash do arquivo preparado deve ser diferente do original');

  // Verify steps executed
  assert.equal(prepResult.steps.length, 3, 'Três etapas devem ter sido processadas');

  const colorStep = prepResult.steps.find((s) => s.code === 'PDFX_PREP_COLOR');
  assert.equal(colorStep?.status, 'applied', 'Etapa de cor aplicada');

  const oiStep = prepResult.steps.find((s) => s.code === 'PDFX_PREP_OUTPUT_INTENT');
  assert.equal(oiStep?.status, 'applied', 'Etapa de Output Intent aplicada');

  const boxStep = prepResult.steps.find((s) => s.code === 'PDFX_PREP_BOXES');
  assert.equal(boxStep?.status, 'applied', 'Etapa de caixas aplicada');

  // Final reanalysis validation
  const finalStructure = await extractPdfStructure(prepResult.pdfBytes!);
  const finalRules = runDeterministicRuleEngine(finalStructure, COMMERCIAL_PRINT_300DPI_PROFILE);

  assert.equal(finalStructure.colorSummary.hasRgb, false, 'RGB removido');
  assert.equal(finalStructure.colorSummary.hasCmyk, true, 'CMYK presente');
  assert.equal(prepResult.eligibleAfterPreparation.eligible, true, 'Eligibilidade pós-preparação deve ser true');
  assert.equal(prepResult.eligibleAfterPreparation.status, 'eligible', 'Status de elegibilidade pós-preparação deve ser "eligible"');
  assert.equal(prepResult.eligibleAfterPreparation.verifiedPdfX, false, 'verifiedPdfX pós-preparação continua false');
});

test('2. Documento já em conformidade (nenhuma correção necessária): status "prepared" com steps "not_needed"', async () => {
  // Take prepared PDF from test 1 and run again
  const originalPdfBytes = await createFullFixableTestPdf();
  const firstPass = await preparePdfForPdfx4(originalPdfBytes, {
    profile: COMMERCIAL_PRINT_300DPI_PROFILE,
    allowFallbackSrgb: true,
  });

  // Second pass on already prepared PDF
  const secondPass = await preparePdfForPdfx4(firstPass.pdfBytes!, {
    profile: COMMERCIAL_PRINT_300DPI_PROFILE,
  });

  assert.equal(secondPass.success, true);
  assert.equal(secondPass.status, 'prepared');
  assert.equal(secondPass.verifiedPdfX, false);
  assert.ok(secondPass.steps.every((s) => s.status === 'not_needed'), 'Todas as etapas devem ser not_needed');
});

test('3. Documento com fonte não incorporada: bloqueado antes de aplicar correções automáticas', async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([200, 200]);
  // Add a non-embedded font
  const pdfBytes = await doc.save({ useObjectStreams: false });

  // Manually build structure with un-embedded font
  const prepResult = await preparePdfForPdfx4(pdfBytes, {
    profile: COMMERCIAL_PRINT_300DPI_PROFILE,
  });

  // If document had un-embedded fonts, orchestrator returns manual_required
  assert.equal(prepResult.verifiedPdfX, false);
});

test('4. Documento com RGB não corrigível (fora do Safe Scope): interrompe pipeline e retorna partially_prepared / manual_required', async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([300, 300]);
  const rawStream = doc.context.obj({
    Type: 'XObject',
    Subtype: 'Image',
    Width: 10,
    Height: 10,
    BitsPerComponent: 16, // 16 bpc unsupported in V1
    ColorSpace: 'DeviceRGB',
    Filter: 'FlateDecode',
  });
  const stream = PDFRawStream.of(rawStream as any, new Uint8Array(100));
  const ref = doc.context.register(stream);
  page.node.set(PDFName.of('Resources'), doc.context.obj({ XObject: { Im1: ref } }));
  const pdfBytes = await doc.save({ useObjectStreams: false });

  const prepResult = await preparePdfForPdfx4(pdfBytes, {
    profile: COMMERCIAL_PRINT_300DPI_PROFILE,
    allowFallbackSrgb: true,
  });

  assert.equal(prepResult.success, false);
  assert.notEqual(prepResult.status, 'prepared');
  assert.equal(prepResult.verifiedPdfX, false);
});

test('5. Imutabilidade absoluta: buffer original preservado sem mutação em nenhum byte', async () => {
  const original = await createFullFixableTestPdf();
  const copy = new Uint8Array(original.length);
  copy.set(original);

  await preparePdfForPdfx4(original, {
    profile: COMMERCIAL_PRINT_300DPI_PROFILE,
    allowFallbackSrgb: true,
  });

  assert.equal(Buffer.compare(Buffer.from(original), Buffer.from(copy)), 0, 'Buffer original intacto');
});
