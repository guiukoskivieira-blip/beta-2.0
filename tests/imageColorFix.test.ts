import { PDFDocument, PDFName, PDFNumber, PDFRawStream } from 'pdf-lib';
import * as pako from 'pako';
import fs from 'fs';
import path from 'path';
import { auditImageXObjects, applyImageColorFix, resolveIccBytes } from '../src/services/imageColorFix';
import { COMMERCIAL_PRINT_300DPI_PROFILE } from '../src/utils/productionProfiles';
import { extractPdfStructure } from '../server/pdfExtractor';
import { runDeterministicRuleEngine } from '../src/utils/ruleEngine';

let passed = 0;
let total = 0;

function assert(condition: boolean, msg: string) {
  total++;
  if (!condition) {
    console.error(`  ✗ FAIL: ${msg}`);
    throw new Error(`Test failed: ${msg}`);
  }
  passed++;
  console.log(`  ✓ ${msg}`);
}

async function createRgbTestPdf(options: {
  width?: number;
  height?: number;
  bitsPerComponent?: number;
  filter?: string;
  addSMask?: boolean;
  colorSpace?: string;
} = {}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([300, 300]);

  const width = options.width ?? 4;
  const height = options.height ?? 4;
  const bpc = options.bitsPerComponent ?? 8;
  const pixelCount = width * height;

  // Generate RGB pixels: red, green, blue, white pattern
  const rgbBytes = new Uint8Array(pixelCount * 3);
  for (let i = 0; i < pixelCount; i++) {
    if (i % 4 === 0) {
      rgbBytes[i * 3] = 255; rgbBytes[i * 3 + 1] = 0; rgbBytes[i * 3 + 2] = 0; // Red
    } else if (i % 4 === 1) {
      rgbBytes[i * 3] = 0; rgbBytes[i * 3 + 1] = 255; rgbBytes[i * 3 + 2] = 0; // Green
    } else if (i % 4 === 2) {
      rgbBytes[i * 3] = 0; rgbBytes[i * 3 + 1] = 0; rgbBytes[i * 3 + 2] = 255; // Blue
    } else {
      rgbBytes[i * 3] = 255; rgbBytes[i * 3 + 1] = 255; rgbBytes[i * 3 + 2] = 255; // White
    }
  }

  const compressed = options.filter === 'None' ? rgbBytes : pako.deflate(rgbBytes);

  const imgDict = doc.context.obj({
    Type: 'XObject',
    Subtype: 'Image',
    Width: width,
    Height: height,
    BitsPerComponent: bpc,
    ColorSpace: options.colorSpace || 'DeviceRGB',
    Filter: options.filter || 'FlateDecode',
  });

  if (options.addSMask) {
    // Add a simple 4x4 alpha mask
    const maskBytes = new Uint8Array(pixelCount).fill(255);
    const maskDict = doc.context.obj({
      Type: 'XObject',
      Subtype: 'Image',
      Width: width,
      Height: height,
      BitsPerComponent: 8,
      ColorSpace: 'DeviceGray',
      Filter: 'FlateDecode',
    });
    const maskStream = PDFRawStream.of(maskDict as any, pako.deflate(maskBytes));
    const maskRef = doc.context.register(maskStream);
    (imgDict as any).set(PDFName.of('SMask'), maskRef);
  }

  const imgStream = PDFRawStream.of(imgDict as any, compressed);
  const imgRef = doc.context.register(imgStream);

  page.node.set(
    PDFName.of('Resources'),
    doc.context.obj({
      XObject: {
        Im1: imgRef,
      },
    })
  );

  return await doc.save({ useObjectStreams: false });
}

export async function runImageColorFixTests() {
  console.log('\n================================================================');
  console.log('ARTECHECK — IMAGE COLOR FIX (LITTLECMS CMM PHASE 1) SUITE');
  console.log('================================================================\n');

  // Test 1: Resolve ICC profile bytes
  const cmykBytes = resolveIccBytes(null, 'default_cmyk');
  assert(Boolean(cmykBytes && cmykBytes.length > 1000), 'Resolve perfil ICC CMYK padrão embutido');

  // Test 2: Audit Image XObjects
  const pdfBytes = await createRgbTestPdf({ width: 4, height: 4 });
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const { audits } = auditImageXObjects(pdfDoc);
  assert(audits.length === 1, 'Auditoria detectou 1 Image XObject no PDF');
  assert(audits[0].name === '/Im1', 'Nome do objeto preservado (/Im1)');
  assert(audits[0].isRgb === true, 'Espaço de cor identificado como RGB');
  assert(audits[0].bitsPerComponent === 8, 'Bits por componente identificado (8 bpc)');
  assert(audits[0].widthPx === 4 && audits[0].heightPx === 4, 'Dimensões em pixels auditadas (4x4)');
  assert(audits[0].classification === 'CONVERTIBLE', 'Classificação CONVERTIBLE para imagem raster RGB 8-bit Flate');

  // Test 3: Classify non-8-bit as MANUAL_REQUIRED
  const pdfBytes16 = await createRgbTestPdf({ width: 4, height: 4, bitsPerComponent: 16 });
  const pdfDoc16 = await PDFDocument.load(pdfBytes16);
  const audit16 = auditImageXObjects(pdfDoc16);
  assert(audit16.audits[0].classification === 'MANUAL_REQUIRED', 'Imagem 16 bpc classificada como MANUAL_REQUIRED');
  assert(audit16.audits[0].reason.includes('16 bits/canal'), 'Motivo detalhado para não-8-bit');

  // Test 4: End-to-end LittleCMS RGB->CMYK image fix
  const originalPdfBytes = await createRgbTestPdf({ width: 4, height: 4 });
  const originalCopy = new Uint8Array(originalPdfBytes);

  const initialStructure = await extractPdfStructure(originalPdfBytes);
  const initialRules = runDeterministicRuleEngine(initialStructure, COMMERCIAL_PRINT_300DPI_PROFILE);
  const initialColorRule = initialRules.profileRules.find((r) => r.ruleId === 'RULE-PROF-CLR-001');
  assert(initialColorRule?.status === 'error', 'Motor 1 detecta RULE-PROF-CLR-001 em status error no PDF inicial');

  const fixResult = await applyImageColorFix(originalPdfBytes, {
    allowFallbackSrgb: true,
    profile: COMMERCIAL_PRINT_300DPI_PROFILE,
  });

  assert(fixResult.success === true, 'applyImageColorFix executou com sucesso');
  assert(fixResult.actionResult === 'corrected', 'Status da ação é "corrected"');
  assert(Boolean(fixResult.pdfBytes && fixResult.pdfBytes.length > 0), 'Novo PDF gerado');
  assert(fixResult.structuralValidation?.valid === true, 'Validação estrutural do PDF gerado (header, eof, xref)');
  assert(Buffer.from(originalPdfBytes).equals(Buffer.from(originalCopy)), 'Buffer original permanece 100% inalterado (imutabilidade)');

  // Test 5: Reanalysis via Motor 1
  const fixedStructure = await extractPdfStructure(fixResult.pdfBytes!);
  const fixedRules = runDeterministicRuleEngine(fixedStructure, COMMERCIAL_PRINT_300DPI_PROFILE);
  const fixedColorRule = fixedRules.profileRules.find((r) => r.ruleId === 'RULE-PROF-CLR-001');

  assert(fixedStructure.colorSummary.hasRgb === false, 'Reanálise: documento não contém mais RGB');
  assert(fixedStructure.colorSummary.hasCmyk === true, 'Reanálise: documento contém CMYK');
  assert(fixedColorRule?.status === 'approved', 'Reanálise: RULE-PROF-CLR-001 aprovado pelo Motor 1');
  assert(fixResult.revalidation?.validated === true, 'Contrato: revalidation.validated === true');
  assert(fixResult.objectsSummary.convertedCount === 1, 'objectsSummary: 1 imagem convertida');
  assert(fixResult.objectsSummary.objects[0].status === 'converted', 'Objeto individual marcado como converted');
  assert(fixResult.objectsSummary.objects[0].destinationColorSpace === 'DeviceCMYK', 'Espaço de cor final DeviceCMYK');

  // Test 6: Fallback sRGB security rule (No silent sRGB assumption)
  const rejectFallbackResult = await applyImageColorFix(originalPdfBytes, {
    allowFallbackSrgb: false, // Disallowed: no silent sRGB fallback
    profile: COMMERCIAL_PRINT_300DPI_PROFILE,
  });

  assert(rejectFallbackResult.actionResult === 'manual_required', 'Fallback sRGB desativado sem ICC de origem -> actionResult manual_required');
  assert(rejectFallbackResult.objectsSummary.manualRequiredCount === 1, 'manualRequiredCount === 1');
  assert(rejectFallbackResult.objectsSummary.objects[0].reason?.includes('Perfil RGB de origem não incorporado') === true, 'Motivo de bloqueio informativo');

  // Test 7: SMask transparency preservation
  const pdfWithSMask = await createRgbTestPdf({ width: 4, height: 4, addSMask: true });
  const fixSMaskResult = await applyImageColorFix(pdfWithSMask, {
    allowFallbackSrgb: true,
    profile: COMMERCIAL_PRINT_300DPI_PROFILE,
  });

  assert(fixSMaskResult.success === true, 'Conversão com SMask executada com sucesso');
  const fixedDoc = await PDFDocument.load(fixSMaskResult.pdfBytes!);
  const fixedPage = fixedDoc.getPage(0);
  const res = fixedPage.node.Resources();
  const xobjs = (res as any).get(PDFName.of('XObject'));
  const imgRef = xobjs.get(PDFName.of('Im1'));
  const imgStream = fixedDoc.context.lookup(imgRef);
  const dict = (imgStream as any).dict;

  assert(dict.get(PDFName.of('ColorSpace')).toString() === '/DeviceCMYK', 'ColorSpace atualizado para /DeviceCMYK');
  assert(Boolean(dict.get(PDFName.of('SMask'))), 'Dicionário /SMask preservado no novo Image XObject CMYK');

  console.log(`\n================================================================`);
  console.log(`ARTECHECK IMAGE COLOR FIX TESTS: ${passed}/${total} APROVADOS`);
  console.log(`================================================================\n`);
}

// Auto-run if executed directly via tsx
runImageColorFixTests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
