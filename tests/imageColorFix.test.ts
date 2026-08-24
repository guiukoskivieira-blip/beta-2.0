import { PDFDocument, PDFName, PDFNumber, PDFRawStream } from 'pdf-lib';
import * as pako from 'pako';
import fs from 'fs';
import path from 'path';
import { auditImageXObjects, applyImageColorFix, resolveIccBytes } from '../src/services/imageColorFix';
import { COMMERCIAL_PRINT_300DPI_PROFILE } from '../src/utils/productionProfiles';
import { extractPdfStructure } from '../server/pdfExtractor';
import { runDeterministicRuleEngine } from '../src/utils/ruleEngine';
import { encodeAscii85, decodeAscii85 } from '../src/services/ascii85';

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

function generateTestJpeg(width = 8, height = 8, components = 3): Uint8Array {
  const dqtY = [
    16, 11, 10, 16, 24, 40, 51, 61,
    12, 12, 14, 19, 26, 58, 60, 55,
    14, 13, 16, 24, 40, 57, 69, 56,
    14, 17, 22, 29, 51, 87, 80, 62,
    18, 22, 37, 56, 68, 109, 103, 77,
    24, 35, 55, 64, 81, 104, 113, 92,
    49, 64, 78, 87, 103, 121, 120, 101,
    72, 92, 95, 98, 112, 100, 103, 99,
  ];
  const dqtC = [
    17, 18, 24, 47, 99, 99, 99, 99,
    18, 21, 26, 66, 99, 99, 99, 99,
    24, 26, 56, 99, 99, 99, 99, 99,
    47, 66, 99, 99, 99, 99, 99, 99,
    99, 99, 99, 99, 99, 99, 99, 99,
    99, 99, 99, 99, 99, 99, 99, 99,
    99, 99, 99, 99, 99, 99, 99, 99,
    99, 99, 99, 99, 99, 99, 99, 99,
  ];

  const mcusX = Math.ceil(width / 8);
  const mcusY = Math.ceil(height / 8);
  const totalMcus = mcusX * mcusY;

  const bytes: number[] = [];
  bytes.push(0xFF, 0xD8); // SOI
  bytes.push(
    0xFF, 0xE0, 0x00, 0x10,
    0x4A, 0x46, 0x49, 0x46, 0x00,
    0x01, 0x01, 0x01,
    0x00, 0x48, 0x00, 0x48,
    0x00, 0x00
  ); // APP0

  bytes.push(0xFF, 0xDB, 0x00, 0x43, 0x00, ...dqtY);
  if (components === 3) {
    bytes.push(0xFF, 0xDB, 0x00, 0x43, 0x01, ...dqtC);
  }

  if (components === 3) {
    bytes.push(
      0xFF, 0xC0, 0x00, 0x11,
      0x08,
      (height >> 8) & 0xFF, height & 0xFF,
      (width >> 8) & 0xFF, width & 0xFF,
      0x03,
      0x01, 0x11, 0x00,
      0x02, 0x11, 0x01,
      0x03, 0x11, 0x01
    );
  } else {
    bytes.push(
      0xFF, 0xC0, 0x00, 0x0B,
      0x08,
      (height >> 8) & 0xFF, height & 0xFF,
      (width >> 8) & 0xFF, width & 0xFF,
      0x01,
      0x01, 0x11, 0x00
    );
  }

  bytes.push(
    0xFF, 0xC4, 0x00, 0x1F, 0x00,
    0x00, 0x01, 0x05, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0A, 0x0B
  );
  bytes.push(
    0xFF, 0xC4, 0x00, 0xB5, 0x10,
    0x00, 0x02, 0x01, 0x03, 0x03, 0x02, 0x04, 0x03, 0x05, 0x05, 0x04, 0x04, 0x00, 0x00, 0x01, 0x7D,
    0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06, 0x13, 0x51, 0x61, 0x07,
    0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xA1, 0x08, 0x23, 0x42, 0xB1, 0xC1, 0x15, 0x52, 0xD1, 0xF0,
    0x24, 0x33, 0x62, 0x72, 0x82, 0x09, 0x0A, 0x16, 0x17, 0x18, 0x19, 0x1A, 0x25, 0x26, 0x27, 0x28,
    0x29, 0x2A, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3A, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49,
    0x4A, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59, 0x5A, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69,
    0x6A, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7A, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89,
    0x8A, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9A, 0xA2, 0xA3, 0xA4, 0xA5, 0xA6, 0xA7,
    0xA8, 0xA9, 0xAA, 0xB2, 0xB3, 0xB4, 0xB5, 0xB6, 0xB7, 0xB8, 0xB9, 0xBA, 0xC2, 0xC3, 0xC4, 0xC5,
    0xC6, 0xC7, 0xC8, 0xC9, 0xCA, 0xD2, 0xD3, 0xD4, 0xD5, 0xD6, 0xD7, 0xD8, 0xD9, 0xDA, 0xE1, 0xE2,
    0xE3, 0xE4, 0xE5, 0xE6, 0xE7, 0xE8, 0xE9, 0xEA, 0xF1, 0xF2, 0xF3, 0xF4, 0xF5, 0xF6, 0xF7, 0xF8,
    0xF9, 0xFA
  );

  if (components === 3) {
    bytes.push(
      0xFF, 0xC4, 0x00, 0x1F, 0x01,
      0x00, 0x03, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0A, 0x0B
    );
    bytes.push(
      0xFF, 0xC4, 0x00, 0xB5, 0x11,
      0x00, 0x02, 0x01, 0x02, 0x04, 0x04, 0x03, 0x04, 0x07, 0x05, 0x04, 0x04, 0x00, 0x01, 0x02, 0x77,
      0x00, 0x01, 0x02, 0x03, 0x11, 0x04, 0x05, 0x21, 0x31, 0x06, 0x12, 0x41, 0x51, 0x07, 0x61, 0x71,
      0x13, 0x22, 0x32, 0x81, 0x08, 0x14, 0x42, 0x91, 0xA1, 0xB1, 0xC1, 0x09, 0x23, 0x33, 0x52, 0xF0,
      0x15, 0x62, 0x72, 0xD1, 0x0A, 0x16, 0x24, 0x34, 0xE1, 0x25, 0xF1, 0x17, 0x18, 0x19, 0x1A, 0x26,
      0x27, 0x28, 0x29, 0x2A, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3A, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48,
      0x49, 0x4A, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59, 0x5A, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68,
      0x69, 0x6A, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7A, 0x82, 0x83, 0x84, 0x85, 0x86, 0x87,
      0x88, 0x89, 0x8A, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9A, 0xA2, 0xA3, 0xA4, 0xA5,
      0xA6, 0xA7, 0xA8, 0xA9, 0xAA, 0xB2, 0xB3, 0xB4, 0xB5, 0xB6, 0xB7, 0xB8, 0xB9, 0xBA, 0xC2, 0xC3,
      0xC4, 0xC5, 0xC6, 0xC7, 0xC8, 0xC9, 0xCA, 0xD2, 0xD3, 0xD4, 0xD5, 0xD6, 0xD7, 0xD8, 0xD9, 0xDA,
      0xE2, 0xE3, 0xE4, 0xE5, 0xE6, 0xE7, 0xE8, 0xE9, 0xEA, 0xF2, 0xF3, 0xF4, 0xF5, 0xF6, 0xF7, 0xF8,
      0xF9, 0xFA
    );
  }

  if (components === 3) {
    bytes.push(
      0xFF, 0xDA, 0x00, 0x0C,
      0x03,
      0x01, 0x00,
      0x02, 0x11,
      0x03, 0x11,
      0x00, 0x3F, 0x00
    );
  } else {
    bytes.push(
      0xFF, 0xDA, 0x00, 0x08,
      0x01,
      0x01, 0x00,
      0x00, 0x3F, 0x00
    );
  }

  let currentByte = 0;
  let bitCount = 0;

  function putBits(val: number, len: number) {
    for (let i = len - 1; i >= 0; i--) {
      const bit = (val >> i) & 1;
      currentByte = (currentByte << 1) | bit;
      bitCount++;
      if (bitCount === 8) {
        bytes.push(currentByte);
        if (currentByte === 0xFF) {
          bytes.push(0x00);
        }
        currentByte = 0;
        bitCount = 0;
      }
    }
  }

  for (let m = 0; m < totalMcus; m++) {
    putBits(0, 2);
    putBits(0x0A, 4);
    if (components === 3) {
      putBits(0, 2);
      putBits(0, 2);
      putBits(0, 2);
      putBits(0, 2);
    }
  }

  if (bitCount > 0) {
    currentByte = (currentByte << (8 - bitCount)) | ((1 << (8 - bitCount)) - 1);
    bytes.push(currentByte);
    if (currentByte === 0xFF) {
      bytes.push(0x00);
    }
  }

  bytes.push(0xFF, 0xD9); // EOI
  return new Uint8Array(bytes);
}

export async function runImageColorFixTests() {
  console.log('\n================================================================');
  console.log('ARTECHECK — IMAGE COLOR FIX (LITTLECMS CMM PHASE 1) SUITE');
  console.log('================================================================\n');

  // Test 1: Resolve ICC profile bytes
  const cmykBytes = resolveIccBytes(null, 'cgats_tr_001_swop');
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
  assert(audit16.audits[0].reasonCode === 'UNSUPPORTED_BITS_PER_COMPONENT', 'reasonCode é UNSUPPORTED_BITS_PER_COMPONENT');
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
  assert(rejectFallbackResult.reasonCode === 'SOURCE_PROFILE_MISSING', 'reasonCode é SOURCE_PROFILE_MISSING');
  assert(Boolean(rejectFallbackResult.reason), 'reason está preenchido');
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

  // Test 8: Safe Scope V1.1 — DCTDecode (JPEG) RGB 1800x1000 px, 508 DPI, 90x50 mm
  const jpegBytes1800 = generateTestJpeg(1800, 1000);
  const dctDoc = await PDFDocument.create();
  // 90x50 mm in PDF points: 90 * 72 / 25.4 = 255.118 pt, 50 * 72 / 25.4 = 141.732 pt
  const pageW = (90 * 72) / 25.4;
  const pageH = (50 * 72) / 25.4;
  const dctPage = dctDoc.addPage([pageW, pageH]);

  const dctImgDict = dctDoc.context.obj({
    Type: 'XObject',
    Subtype: 'Image',
    Width: 1800,
    Height: 1000,
    BitsPerComponent: 8,
    ColorSpace: 'DeviceRGB',
    Filter: 'DCTDecode',
  });
  const dctImgStream = PDFRawStream.of(dctImgDict as any, jpegBytes1800);
  const dctImgRef = dctDoc.context.register(dctImgStream);

  dctPage.node.set(
    PDFName.of('Resources'),
    dctDoc.context.obj({
      XObject: {
        Im1: dctImgRef,
      },
    })
  );
  const dctPdfBytes = await dctDoc.save({ useObjectStreams: false });
  const dctPdfCopy = new Uint8Array(dctPdfBytes);

  // Initial audit and analysis
  const dctLoadedDoc = await PDFDocument.load(dctPdfBytes);
  const dctAudit = auditImageXObjects(dctLoadedDoc);
  assert(dctAudit.audits.length === 1, 'DCTDecode: Auditoria detectou 1 Image XObject');
  assert(dctAudit.audits[0].filter === 'DCTDecode', 'DCTDecode: Filtro identificado como /DCTDecode');
  assert(dctAudit.audits[0].classification === 'CONVERTIBLE', 'DCTDecode: Imagem 1800x1000 8-bit classificada como CONVERTIBLE no Safe Scope V1.1');

  const initialDctStructure = await extractPdfStructure(dctPdfBytes);
  const initialDctRules = runDeterministicRuleEngine(initialDctStructure, COMMERCIAL_PRINT_300DPI_PROFILE);
  const initialDctColorRule = initialDctRules.profileRules.find((r) => r.ruleId === 'RULE-PROF-CLR-001');
  assert(initialDctColorRule?.status === 'error', 'DCTDecode: Motor 1 detecta RULE-PROF-CLR-001 em erro no PDF inicial');

  // Apply LittleCMS Fix on DCTDecode image
  const dctFixResult = await applyImageColorFix(dctPdfBytes, {
    allowFallbackSrgb: true,
    destinationIccPresetId: 'cgats_tr_001_swop',
    profile: COMMERCIAL_PRINT_300DPI_PROFILE,
  });

  assert(dctFixResult.success === true, 'DCTDecode: applyImageColorFix executou com sucesso');
  assert(dctFixResult.actionResult === 'corrected', 'DCTDecode: actionResult é "corrected"');
  assert(dctFixResult.objectsSummary.convertedCount === 1, 'DCTDecode: 1 imagem convertida');
  assert(dctFixResult.structuralValidation?.valid === true, 'DCTDecode: Validação estrutural do PDF gerado');
  assert(Buffer.from(dctPdfBytes).equals(Buffer.from(dctPdfCopy)), 'DCTDecode: Buffer original permanece 100% inalterado (imutabilidade)');

  // Reanalysis via Motor 1
  const fixedDctStructure = await extractPdfStructure(dctFixResult.pdfBytes!);
  const fixedDctRules = runDeterministicRuleEngine(fixedDctStructure, COMMERCIAL_PRINT_300DPI_PROFILE);
  const fixedDctColorRule = fixedDctRules.profileRules.find((r) => r.ruleId === 'RULE-PROF-CLR-001');

  assert(fixedDctStructure.colorSummary.hasRgb === false, 'DCTDecode Reanálise: RGB removido completamente');
  assert(fixedDctStructure.colorSummary.hasCmyk === true, 'DCTDecode Reanálise: CMYK detectado');
  assert(fixedDctColorRule?.status === 'approved', 'DCTDecode Reanálise: RULE-PROF-CLR-001 aprovado');
  assert(dctFixResult.revalidation?.validated === true, 'DCTDecode Reanálise: revalidation.validated === true');

  // Verify rebuilt XObject properties
  const fixedDctDoc = await PDFDocument.load(dctFixResult.pdfBytes!);
  const fixedDctXObject = (fixedDctDoc.getPage(0).node.Resources() as any).get(PDFName.of('XObject')).get(PDFName.of('Im1'));
  const fixedDctStream = fixedDctDoc.context.lookup(fixedDctXObject);
  const fixedDctDict = (fixedDctStream as any).dict;

  assert(fixedDctDict.get(PDFName.of('Width')).asNumber() === 1800, 'DCTDecode: Width 1800 px preservado');
  assert(fixedDctDict.get(PDFName.of('Height')).asNumber() === 1000, 'DCTDecode: Height 1000 px preservado');
  assert(fixedDctDict.get(PDFName.of('ColorSpace')).toString() === '/DeviceCMYK', 'DCTDecode: ColorSpace é /DeviceCMYK');
  assert(fixedDctDict.get(PDFName.of('Filter')).toString() === '/FlateDecode', 'DCTDecode: Stream convertido para /FlateDecode');

  // Test 9: Corrupted JPEG stream -> MANUAL_REQUIRED com CORRUPTED_JPEG
  const corruptedJpegBytes = new Uint8Array([0xFF, 0xD8, 0x00, 0x00, 0xDE, 0xAD, 0xBE, 0xEF]);
  const corruptDoc = await PDFDocument.create();
  const corruptPage = corruptDoc.addPage([300, 300]);
  const corruptImgDict = corruptDoc.context.obj({
    Type: 'XObject',
    Subtype: 'Image',
    Width: 100,
    Height: 100,
    BitsPerComponent: 8,
    ColorSpace: 'DeviceRGB',
    Filter: 'DCTDecode',
  });
  const corruptImgStream = PDFRawStream.of(corruptImgDict as any, corruptedJpegBytes);
  const corruptImgRef = corruptDoc.context.register(corruptImgStream);
  corruptPage.node.set(
    PDFName.of('Resources'),
    corruptDoc.context.obj({ XObject: { Im1: corruptImgRef } })
  );
  const corruptPdfBytes = await corruptDoc.save({ useObjectStreams: false });

  const corruptAudit = auditImageXObjects(await PDFDocument.load(corruptPdfBytes));
  assert(corruptAudit.audits[0].classification === 'MANUAL_REQUIRED', 'JPEG corrompido: classificado como MANUAL_REQUIRED');
  assert(corruptAudit.audits[0].reasonCode === 'CORRUPTED_JPEG', 'JPEG corrompido: reasonCode CORRUPTED_JPEG');

  const corruptFixResult = await applyImageColorFix(corruptPdfBytes, {
    allowFallbackSrgb: true,
    profile: COMMERCIAL_PRINT_300DPI_PROFILE,
  });
  assert(corruptFixResult.actionResult === 'manual_required', 'JPEG corrompido: fix retorna manual_required');
  assert(corruptFixResult.reasonCode === 'CORRUPTED_JPEG', 'JPEG corrompido: reasonCode do fix é CORRUPTED_JPEG');

  // Test 10: Non-RGB JPEG (Grayscale 1 component) in DCTDecode -> MANUAL_REQUIRED com NON_RGB_JPEG
  const grayJpegBytes = generateTestJpeg(8, 8, 1);
  const grayDoc = await PDFDocument.create();
  const grayPage = grayDoc.addPage([300, 300]);
  const grayImgDict = grayDoc.context.obj({
    Type: 'XObject',
    Subtype: 'Image',
    Width: 8,
    Height: 8,
    BitsPerComponent: 8,
    ColorSpace: 'DeviceRGB', // Declared as RGB but contains 1 channel
    Filter: 'DCTDecode',
  });
  const grayImgStream = PDFRawStream.of(grayImgDict as any, grayJpegBytes);
  const grayImgRef = grayDoc.context.register(grayImgStream);
  grayPage.node.set(
    PDFName.of('Resources'),
    grayDoc.context.obj({ XObject: { Im1: grayImgRef } })
  );
  const grayPdfBytes = await grayDoc.save({ useObjectStreams: false });
  const grayAudit = auditImageXObjects(await PDFDocument.load(grayPdfBytes));
  assert(grayAudit.audits[0].classification === 'MANUAL_REQUIRED', 'JPEG 1 canal em RGB: classificado como MANUAL_REQUIRED');
  assert(grayAudit.audits[0].reasonCode === 'NON_RGB_JPEG', 'JPEG 1 canal: reasonCode NON_RGB_JPEG');

  // Test 11: JPXDecode (JPEG 2000) -> MANUAL_REQUIRED com UNSUPPORTED_FILTER
  const jpxDoc = await PDFDocument.create();
  const jpxPage = jpxDoc.addPage([300, 300]);
  const jpxImgDict = jpxDoc.context.obj({
    Type: 'XObject',
    Subtype: 'Image',
    Width: 8,
    Height: 8,
    BitsPerComponent: 8,
    ColorSpace: 'DeviceRGB',
    Filter: 'JPXDecode',
  });
  const jpxImgStream = PDFRawStream.of(jpxImgDict as any, new Uint8Array(64));
  const jpxImgRef = jpxDoc.context.register(jpxImgStream);
  jpxPage.node.set(
    PDFName.of('Resources'),
    jpxDoc.context.obj({ XObject: { Im1: jpxImgRef } })
  );
  const jpxPdfBytes = await jpxDoc.save({ useObjectStreams: false });
  const jpxAudit = auditImageXObjects(await PDFDocument.load(jpxPdfBytes));
  assert(jpxAudit.audits[0].classification === 'MANUAL_REQUIRED', 'JPXDecode: classificado como MANUAL_REQUIRED');
  assert(jpxAudit.audits[0].reasonCode === 'UNSUPPORTED_FILTER', 'JPXDecode: reasonCode UNSUPPORTED_FILTER');

  // Test 12: DCTDecode com allowFallbackSrgb = false -> SOURCE_PROFILE_MISSING
  const dctNoFallbackResult = await applyImageColorFix(dctPdfBytes, {
    allowFallbackSrgb: false, // Strict: do not assume sRGB
    profile: COMMERCIAL_PRINT_300DPI_PROFILE,
  });
  assert(dctNoFallbackResult.actionResult === 'manual_required', 'DCTDecode sem fallback sRGB: manual_required');
  assert(dctNoFallbackResult.reasonCode === 'SOURCE_PROFILE_MISSING', 'DCTDecode sem fallback sRGB: reasonCode SOURCE_PROFILE_MISSING');

  // Test 13: Safe Scope V1.2 — [/ASCII85Decode /FlateDecode] RGB 1800x1000 px, 508 DPI, 90x50 mm
  const rawRgb1800 = new Uint8Array(1800 * 1000 * 3);
  for (let i = 0; i < rawRgb1800.length; i += 3) {
    rawRgb1800[i] = 255;     // R
    rawRgb1800[i + 1] = 128; // G
    rawRgb1800[i + 2] = 64;  // B
  }
  const flateCompressed1800 = pako.deflate(rawRgb1800);
  const ascii85Encoded1800 = encodeAscii85(flateCompressed1800);
  const ascii85Bytes1800 = Buffer.from(ascii85Encoded1800, 'binary');

  const a85Doc = await PDFDocument.create();
  const a85Page = a85Doc.addPage([pageW, pageH]);
  const a85ImgDict = a85Doc.context.obj({
    Type: 'XObject',
    Subtype: 'Image',
    Width: 1800,
    Height: 1000,
    BitsPerComponent: 8,
    ColorSpace: 'DeviceRGB',
    Filter: a85Doc.context.obj([PDFName.of('ASCII85Decode'), PDFName.of('FlateDecode')]),
  });
  const a85ImgStream = PDFRawStream.of(a85ImgDict as any, ascii85Bytes1800);
  const a85ImgRef = a85Doc.context.register(a85ImgStream);
  a85Page.node.set(
    PDFName.of('Resources'),
    a85Doc.context.obj({ XObject: { Im1: a85ImgRef } })
  );
  const a85PdfBytes = await a85Doc.save({ useObjectStreams: false });
  const a85PdfCopy = new Uint8Array(a85PdfBytes);

  // Initial audit and analysis
  const a85LoadedDoc = await PDFDocument.load(a85PdfBytes);
  const a85Audit = auditImageXObjects(a85LoadedDoc);
  assert(a85Audit.audits.length === 1, 'ASCII85+Flate: Auditoria detectou 1 Image XObject');
  assert(a85Audit.audits[0].filter === 'ASCII85Decode+FlateDecode', 'ASCII85+Flate: Filtro identificado como ASCII85Decode+FlateDecode');
  assert(a85Audit.audits[0].classification === 'CONVERTIBLE', 'ASCII85+Flate: Imagem classificada como CONVERTIBLE no Safe Scope V1.2');

  const initialA85Structure = await extractPdfStructure(a85PdfBytes);
  const initialA85Rules = runDeterministicRuleEngine(initialA85Structure, COMMERCIAL_PRINT_300DPI_PROFILE);
  const initialA85ColorRule = initialA85Rules.profileRules.find((r) => r.ruleId === 'RULE-PROF-CLR-001');
  assert(initialA85ColorRule?.status === 'error', 'ASCII85+Flate: Motor 1 detecta RULE-PROF-CLR-001 em erro no PDF inicial');

  // Apply LittleCMS Fix on ASCII85+Flate image
  const a85FixResult = await applyImageColorFix(a85PdfBytes, {
    allowFallbackSrgb: true,
    destinationIccPresetId: 'cgats_tr_001_swop',
    profile: COMMERCIAL_PRINT_300DPI_PROFILE,
  });

  assert(a85FixResult.success === true, 'ASCII85+Flate: applyImageColorFix executou com sucesso');
  assert(a85FixResult.actionResult === 'corrected', 'ASCII85+Flate: actionResult é "corrected"');
  assert(a85FixResult.objectsSummary.convertedCount === 1, 'ASCII85+Flate: 1 imagem convertida');
  assert(a85FixResult.structuralValidation?.valid === true, 'ASCII85+Flate: Validação estrutural do PDF gerado');
  assert(Buffer.from(a85PdfBytes).equals(Buffer.from(a85PdfCopy)), 'ASCII85+Flate: Buffer original permanece 100% inalterado (imutabilidade)');

  // Reanalysis via Motor 1
  const fixedA85Structure = await extractPdfStructure(a85FixResult.pdfBytes!);
  const fixedA85Rules = runDeterministicRuleEngine(fixedA85Structure, COMMERCIAL_PRINT_300DPI_PROFILE);
  const fixedA85ColorRule = fixedA85Rules.profileRules.find((r) => r.ruleId === 'RULE-PROF-CLR-001');

  assert(fixedA85Structure.colorSummary.hasRgb === false, 'ASCII85+Flate Reanálise: RGB removido completamente');
  assert(fixedA85Structure.colorSummary.hasCmyk === true, 'ASCII85+Flate Reanálise: CMYK detectado');
  assert(fixedA85ColorRule?.status === 'approved', 'ASCII85+Flate Reanálise: RULE-PROF-CLR-001 aprovado');
  assert(a85FixResult.revalidation?.validated === true, 'ASCII85+Flate Reanálise: revalidation.validated === true');

  // Verify rebuilt XObject properties
  const fixedA85Doc = await PDFDocument.load(a85FixResult.pdfBytes!);
  const fixedA85XObject = (fixedA85Doc.getPage(0).node.Resources() as any).get(PDFName.of('XObject')).get(PDFName.of('Im1'));
  const fixedA85Stream = fixedA85Doc.context.lookup(fixedA85XObject);
  const fixedA85Dict = (fixedA85Stream as any).dict;

  assert(fixedA85Dict.get(PDFName.of('Width')).asNumber() === 1800, 'ASCII85+Flate: Width 1800 px preservado');
  assert(fixedA85Dict.get(PDFName.of('Height')).asNumber() === 1000, 'ASCII85+Flate: Height 1000 px preservado');
  assert(fixedA85Dict.get(PDFName.of('ColorSpace')).toString() === '/DeviceCMYK', 'ASCII85+Flate: ColorSpace é /DeviceCMYK');
  assert(fixedA85Dict.get(PDFName.of('Filter')).toString() === '/FlateDecode', 'ASCII85+Flate: Stream reconstruído em /FlateDecode puro');

  // Test 14: Invalid ASCII85 -> MANUAL_REQUIRED com ASCII85_DECODE_FAILED
  const invalidA85Doc = await PDFDocument.create();
  const invalidA85Page = invalidA85Doc.addPage([300, 300]);
  const invalidA85Dict = invalidA85Doc.context.obj({
    Type: 'XObject',
    Subtype: 'Image',
    Width: 10,
    Height: 10,
    BitsPerComponent: 8,
    ColorSpace: 'DeviceRGB',
    Filter: invalidA85Doc.context.obj([PDFName.of('ASCII85Decode'), PDFName.of('FlateDecode')]),
  });
  const invalidA85Stream = PDFRawStream.of(invalidA85Dict as any, Buffer.from('invalid ASCII85 stream \x01\x02~>'));
  const invalidA85Ref = invalidA85Doc.context.register(invalidA85Stream);
  invalidA85Page.node.set(
    PDFName.of('Resources'),
    invalidA85Doc.context.obj({ XObject: { Im1: invalidA85Ref } })
  );
  const invalidA85PdfBytes = await invalidA85Doc.save({ useObjectStreams: false });
  const invalidA85Audit = auditImageXObjects(await PDFDocument.load(invalidA85PdfBytes));
  assert(invalidA85Audit.audits[0].classification === 'MANUAL_REQUIRED', 'ASCII85 inválido: classificado como MANUAL_REQUIRED');
  assert(invalidA85Audit.audits[0].reasonCode === 'ASCII85_DECODE_FAILED', 'ASCII85 inválido: reasonCode ASCII85_DECODE_FAILED');

  const invalidA85Fix = await applyImageColorFix(invalidA85PdfBytes, { allowFallbackSrgb: true });
  assert(invalidA85Fix.actionResult === 'manual_required', 'ASCII85 inválido: fix retorna manual_required');
  assert(invalidA85Fix.reasonCode === 'ASCII85_DECODE_FAILED', 'ASCII85 inválido: fix reasonCode é ASCII85_DECODE_FAILED');

  // Test 15: Invalid Flate after ASCII85 -> MANUAL_REQUIRED com DECOMPRESS_FAILED
  const badFlateInA85Doc = await PDFDocument.create();
  const badFlateInA85Page = badFlateInA85Doc.addPage([300, 300]);
  const badFlateInA85Dict = badFlateInA85Doc.context.obj({
    Type: 'XObject',
    Subtype: 'Image',
    Width: 10,
    Height: 10,
    BitsPerComponent: 8,
    ColorSpace: 'DeviceRGB',
    Filter: badFlateInA85Doc.context.obj([PDFName.of('ASCII85Decode'), PDFName.of('FlateDecode')]),
  });
  const badFlateA85Encoded = encodeAscii85(new Uint8Array([0xDE, 0xAD, 0xBE, 0xEF, 0x01, 0x02]));
  const badFlateA85Stream = PDFRawStream.of(badFlateInA85Dict as any, Buffer.from(badFlateA85Encoded, 'binary'));
  const badFlateA85Ref = badFlateInA85Doc.context.register(badFlateA85Stream);
  badFlateInA85Page.node.set(
    PDFName.of('Resources'),
    badFlateInA85Doc.context.obj({ XObject: { Im1: badFlateA85Ref } })
  );
  const badFlatePdfBytes = await badFlateInA85Doc.save({ useObjectStreams: false });
  const badFlateAudit = auditImageXObjects(await PDFDocument.load(badFlatePdfBytes));
  assert(badFlateAudit.audits[0].classification === 'MANUAL_REQUIRED', 'Flate corrompido pós-ASCII85: classificado como MANUAL_REQUIRED');
  assert(badFlateAudit.audits[0].reasonCode === 'DECOMPRESS_FAILED', 'Flate corrompido pós-ASCII85: reasonCode DECOMPRESS_FAILED');

  // Test 16: Inverted filter order [/FlateDecode /ASCII85Decode] -> MANUAL_REQUIRED com UNSUPPORTED_FILTER
  const invertedDoc = await PDFDocument.create();
  const invertedPage = invertedDoc.addPage([300, 300]);
  const invertedDict = invertedDoc.context.obj({
    Type: 'XObject',
    Subtype: 'Image',
    Width: 10,
    Height: 10,
    BitsPerComponent: 8,
    ColorSpace: 'DeviceRGB',
    Filter: invertedDoc.context.obj([PDFName.of('FlateDecode'), PDFName.of('ASCII85Decode')]),
  });
  const invertedStream = PDFRawStream.of(invertedDict as any, new Uint8Array(64));
  const invertedRef = invertedDoc.context.register(invertedStream);
  invertedPage.node.set(
    PDFName.of('Resources'),
    invertedDoc.context.obj({ XObject: { Im1: invertedRef } })
  );
  const invertedPdfBytes = await invertedDoc.save({ useObjectStreams: false });
  const invertedAudit = auditImageXObjects(await PDFDocument.load(invertedPdfBytes));
  assert(invertedAudit.audits[0].classification === 'MANUAL_REQUIRED', 'Ordem invertida: classificada como MANUAL_REQUIRED');
  assert(invertedAudit.audits[0].reasonCode === 'UNSUPPORTED_FILTER', 'Ordem invertida: reasonCode UNSUPPORTED_FILTER');

  // Test 17: Unknown filter in array [/ASCII85Decode /LZWDecode] -> MANUAL_REQUIRED com UNSUPPORTED_FILTER
  const lzwDoc = await PDFDocument.create();
  const lzwPage = lzwDoc.addPage([300, 300]);
  const lzwDict = lzwDoc.context.obj({
    Type: 'XObject',
    Subtype: 'Image',
    Width: 10,
    Height: 10,
    BitsPerComponent: 8,
    ColorSpace: 'DeviceRGB',
    Filter: lzwDoc.context.obj([PDFName.of('ASCII85Decode'), PDFName.of('LZWDecode')]),
  });
  const lzwStream = PDFRawStream.of(lzwDict as any, new Uint8Array(64));
  const lzwRef = lzwDoc.context.register(lzwStream);
  lzwPage.node.set(
    PDFName.of('Resources'),
    lzwDoc.context.obj({ XObject: { Im1: lzwRef } })
  );
  const lzwPdfBytes = await lzwDoc.save({ useObjectStreams: false });
  const lzwAudit = auditImageXObjects(await PDFDocument.load(lzwPdfBytes));
  assert(lzwAudit.audits[0].classification === 'MANUAL_REQUIRED', 'Filtro LZW: classificado como MANUAL_REQUIRED');
  assert(lzwAudit.audits[0].reasonCode === 'UNSUPPORTED_FILTER', 'Filtro LZW: reasonCode UNSUPPORTED_FILTER');

  // Test 18: Pixel length mismatch in ASCII85+Flate -> MANUAL_REQUIRED com STREAM_LENGTH_MISMATCH
  const mismatchDoc = await PDFDocument.create();
  const mismatchPage = mismatchDoc.addPage([300, 300]);
  const mismatchRgb = new Uint8Array(10 * 10 * 3 - 5); // 5 bytes less than expected 300 bytes
  const mismatchEncoded = encodeAscii85(pako.deflate(mismatchRgb));
  const mismatchDict = mismatchDoc.context.obj({
    Type: 'XObject',
    Subtype: 'Image',
    Width: 10,
    Height: 10,
    BitsPerComponent: 8,
    ColorSpace: 'DeviceRGB',
    Filter: mismatchDoc.context.obj([PDFName.of('ASCII85Decode'), PDFName.of('FlateDecode')]),
  });
  const mismatchStream = PDFRawStream.of(mismatchDict as any, Buffer.from(mismatchEncoded, 'binary'));
  const mismatchRef = mismatchDoc.context.register(mismatchStream);
  mismatchPage.node.set(
    PDFName.of('Resources'),
    mismatchDoc.context.obj({ XObject: { Im1: mismatchRef } })
  );
  const mismatchPdfBytes = await mismatchDoc.save({ useObjectStreams: false });
  const mismatchAudit = auditImageXObjects(await PDFDocument.load(mismatchPdfBytes));
  assert(mismatchAudit.audits[0].classification === 'MANUAL_REQUIRED', 'Tamanho divergente: classificado como MANUAL_REQUIRED');
  assert(mismatchAudit.audits[0].reasonCode === 'STREAM_LENGTH_MISMATCH', 'Tamanho divergente: reasonCode STREAM_LENGTH_MISMATCH');

  // Test 19: Real JPEG DCT RGB 1800x1000 px em Form XObject (432x240 pt, A4) -> extractPdfStructure encontra objeto com 300 DPI
  const formDoc = await PDFDocument.create();
  const formPage = formDoc.addPage([595.28, 841.89]); // A4
  const jpegBytes1800Real = generateTestJpeg(1800, 1000, 3);
  const jpegDict = formDoc.context.obj({
    Type: 'XObject',
    Subtype: 'Image',
    Width: 1800,
    Height: 1000,
    BitsPerComponent: 8,
    ColorSpace: 'DeviceRGB',
    Filter: 'DCTDecode',
  });
  const jpegStream = PDFRawStream.of(jpegDict as any, jpegBytes1800Real);
  const jpegRef = formDoc.context.register(jpegStream);

  const formDict = formDoc.context.obj({
    Type: 'XObject',
    Subtype: 'Form',
    BBox: [0, 0, 432, 240],
    Resources: {
      XObject: {
        Im0: jpegRef,
      },
    },
  });
  const formContent = Buffer.from('q 432 0 0 240 0 0 cm /Im0 Do Q', 'utf-8');
  const formStream = PDFRawStream.of(formDict as any, formContent);
  const formRef = formDoc.context.register(formStream);

  formPage.node.set(
    PDFName.of('Resources'),
    formDoc.context.obj({
      XObject: {
        'FormXob.1': formRef,
      },
    })
  );
  // Page content stream invoking FormXob.1
  const pageStreamContent = Buffer.from('q 1 0 0 1 50 100 cm /FormXob.1 Do Q', 'utf-8');
  formPage.node.set(PDFName.of('Contents'), formDoc.context.register(PDFRawStream.of(formDoc.context.obj({}) as any, pageStreamContent)));

  const formPdfBytes = await formDoc.save({ useObjectStreams: false });
  const formStruct = await extractPdfStructure(formPdfBytes);

  assert(formStruct.pages[0].imageOccurrences.length >= 1, 'Parser: Encontrou imagem aninhada em Form XObject');
  const imgOcc = formStruct.pages[0].imageOccurrences[0];
  assert(imgOcc.name === 'FormXob.1/Im0', 'Parser: Nome composto FormXob.1/Im0 correto');
  assert(imgOcc.filter === 'DCTDecode', 'Parser: Filtro DCTDecode identificado');
  assert(imgOcc.colorSpace === 'DeviceRGB', 'Parser: ColorSpace DeviceRGB identificado');
  assert(imgOcc.widthPx === 1800, 'Parser: Width 1800 px');
  assert(imgOcc.heightPx === 1000, 'Parser: Height 1000 px');
  assert(imgOcc.appliedWidthPt === 432, 'Parser: appliedWidthPt 432 pt');
  assert(imgOcc.appliedHeightPt === 240, 'Parser: appliedHeightPt 240 pt');
  assert(imgOcc.effectiveDpiX === 300, 'Parser: effectiveDpiX 300 DPI');
  assert(imgOcc.effectiveDpiY === 300, 'Parser: effectiveDpiY 300 DPI');

  // Test 20: Safe Scope Canônico e Auditoria
  const formAudit = auditImageXObjects(await PDFDocument.load(formPdfBytes));
  assert(formAudit.audits.length === 1, 'auditImageXObjects: 1 imagem detectada');
  assert(formAudit.audits[0].classification === 'CONVERTIBLE', 'auditImageXObjects: classificado como CONVERTIBLE');
  assert(formAudit.audits[0].reasonCode === 'CONVERTIBLE', 'auditImageXObjects: reasonCode CONVERTIBLE');

  // Test 21: Conversão LittleCMS do JPEG Real no Form XObject e Revalidação Completa
  const formFixResult = await applyImageColorFix(formPdfBytes, {
    profile: COMMERCIAL_PRINT_300DPI_PROFILE,
    allowFallbackSrgb: true,
  });
  assert(formFixResult.success === true, 'applyImageColorFix em JPEG Real Form XObject: sucesso');
  assert(formFixResult.objectsSummary.convertedCount === 1, 'applyImageColorFix: 1 imagem convertida');
  assert(formFixResult.structuralValidation?.valid === true, 'applyImageColorFix: PDF convertido estruturalmente válido');

  const reloadedDoc = await extractPdfStructure(formFixResult.pdfBytes!);
  assert(reloadedDoc.colorSummary.hasRgb === false, 'Reanálise: RGB removido');
  assert(reloadedDoc.colorSummary.hasCmyk === true, 'Reanálise: CMYK presente');
  const fixedImgOcc = reloadedDoc.pages[0].imageOccurrences[0];
  assert(fixedImgOcc.widthPx === 1800, 'Reanálise: Width 1800 px preservado');
  assert(fixedImgOcc.heightPx === 1000, 'Reanálise: Height 1000 px preservado');
  assert(fixedImgOcc.appliedWidthPt === 432, 'Reanálise: CTM appliedWidthPt 432 pt preservado');
  assert(fixedImgOcc.appliedHeightPt === 240, 'Reanálise: CTM appliedHeightPt 240 pt preservado');
  assert(fixedImgOcc.effectiveDpiX === 300, 'Reanálise: DPI X 300 preservado');
  assert(fixedImgOcc.effectiveDpiY === 300, 'Reanálise: DPI Y 300 preservado');

  // Test 22: QA 03 Case — 03_A4_RGB_BAIXO_DPI_72.pdf: 432x240 px, 21 DPI em Form XObject
  const lowDpiDoc = await PDFDocument.create();
  const lowDpiPage = lowDpiDoc.addPage([595.28, 841.89]); // A4
  const jpegBytes432 = generateTestJpeg(432, 240, 3);
  const lowDpiImgDict = lowDpiDoc.context.obj({
    Type: 'XObject',
    Subtype: 'Image',
    Width: 432,
    Height: 240,
    BitsPerComponent: 8,
    ColorSpace: 'DeviceRGB',
    Filter: 'DCTDecode',
  });
  const lowDpiImgStream = PDFRawStream.of(lowDpiImgDict as any, jpegBytes432);
  const lowDpiImgRef = lowDpiDoc.context.register(lowDpiImgStream);

  const lowDpiFormDict = lowDpiDoc.context.obj({
    Type: 'XObject',
    Subtype: 'Form',
    BBox: [0, 0, 1440, 800],
    Resources: {
      XObject: {
        Im0: lowDpiImgRef,
      },
    },
  });
  const lowDpiFormContent = Buffer.from('q 1440 0 0 800 0 0 cm /Im0 Do Q', 'utf-8');
  const lowDpiFormStream = PDFRawStream.of(lowDpiFormDict as any, lowDpiFormContent);
  const lowDpiFormRef = lowDpiDoc.context.register(lowDpiFormStream);

  lowDpiPage.node.set(
    PDFName.of('Resources'),
    lowDpiDoc.context.obj({
      XObject: {
        'FormXob.1': lowDpiFormRef,
      },
    })
  );
  const lowDpiPageStream = Buffer.from('q 1 0 0 1 0 0 cm /FormXob.1 Do Q', 'utf-8');
  lowDpiPage.node.set(PDFName.of('Contents'), lowDpiDoc.context.register(PDFRawStream.of(lowDpiDoc.context.obj({}) as any, lowDpiPageStream)));

  const lowDpiPdfBytes = await lowDpiDoc.save({ useObjectStreams: false });
  const lowDpiStruct = await extractPdfStructure(lowDpiPdfBytes);

  assert(lowDpiStruct.pages[0].imageOccurrences.length >= 1, 'QA 03: Parser detecta imagem no Form XObject');
  const lowDpiOcc = lowDpiStruct.pages[0].imageOccurrences[0];
  assert(lowDpiOcc.widthPx === 432, 'QA 03: Width 432 px');
  assert(lowDpiOcc.heightPx === 240, 'QA 03: Height 240 px');
  assert(lowDpiOcc.effectiveDpiX === 21.6, 'QA 03: effectiveDpiX 21.6 DPI');
  assert(lowDpiOcc.effectiveDpiY === 21.6, 'QA 03: effectiveDpiY 21.6 DPI');

  // Convert via LittleCMS
  const lowDpiFixResult = await applyImageColorFix(lowDpiPdfBytes, {
    profile: COMMERCIAL_PRINT_300DPI_PROFILE,
    allowFallbackSrgb: true,
  });
  assert(lowDpiFixResult.success === true, 'QA 03: applyImageColorFix sucesso');
  assert(lowDpiFixResult.objectsSummary.convertedCount === 1, 'QA 03: 1 imagem convertida');

  // Reanalysis and Motor 1 DPI Rule Check
  const reanalyzedLowDpi = await extractPdfStructure(lowDpiFixResult.pdfBytes!);
  assert(reanalyzedLowDpi.colorSummary.hasRgb === false, 'QA 03: RGB removido');
  assert(reanalyzedLowDpi.colorSummary.hasCmyk === true, 'QA 03: CMYK presente');
  const lowDpiRuleResult = runDeterministicRuleEngine(reanalyzedLowDpi, COMMERCIAL_PRINT_300DPI_PROFILE);
  const dpiRule = lowDpiRuleResult.results.find((r) => r.ruleId === 'RULE-PROF-RES-001');
  assert(dpiRule?.status === 'error', 'QA 03: RULE-PROF-RES-001 continua REPROVADO por baixo DPI (21.6 DPI < 300 DPI)');

  console.log(`\n================================================================`);
  console.log(`ARTECHECK IMAGE COLOR FIX TESTS: ${passed}/${total} APROVADOS`);
  console.log(`================================================================\n`);
}

// Auto-run if executed directly via tsx
runImageColorFixTests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});

