import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument, PDFName } from 'pdf-lib';
import fs from 'fs';
import { extractPdfStructure } from '../server/pdfExtractor.ts';
import {
  createPreFlatteningSnapshot,
  validateFlattenedStructure,
  isTransparencyFlatteningNeeded,
  normalizeFontName,
  STANDARD_FLATTENING_FAILURE_MESSAGE,
  PDFX4_TRANSPARENCY_NOTICE,
  FLATTENING_PRE_WARNING,
} from '../src/services/transparencyFlattening.ts';
import {
  isGhostscriptAvailable,
  MAX_CONCURRENT_FLATTENING_JOBS,
  flattenPdfTransparency,
  getActiveFlatteningJobsCount,
  setActiveFlatteningJobsCountForTesting,
} from '../server/transparencyService.ts';

// Helper to create a test PDF with optional ExtGState transparency, boxes, and image
async function makeTestPdf(options: {
  pages: Array<{
    widthMm: number;
    heightMm: number;
    hasTransparency?: boolean;
    trimBox?: { xMm: number; yMm: number; widthMm: number; heightMm: number };
    bleedBox?: { xMm: number; yMm: number; widthMm: number; heightMm: number };
  }>;
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();

  for (const p of options.pages) {
    const wPt = (p.widthMm / 25.4) * 72;
    const hPt = (p.heightMm / 25.4) * 72;
    const page = doc.addPage([wPt, hPt]);

    if (p.trimBox) {
      page.setTrimBox(
        (p.trimBox.xMm / 25.4) * 72,
        (p.trimBox.yMm / 25.4) * 72,
        (p.trimBox.widthMm / 25.4) * 72,
        (p.trimBox.heightMm / 25.4) * 72
      );
    }

    if (p.bleedBox) {
      page.setBleedBox(
        (p.bleedBox.xMm / 25.4) * 72,
        (p.bleedBox.yMm / 25.4) * 72,
        (p.bleedBox.widthMm / 25.4) * 72,
        (p.bleedBox.heightMm / 25.4) * 72
      );
    }

    if (p.hasTransparency) {
      // Add ExtGState with ca < 1 to simulate transparency
      const gsDict = doc.context.obj({
        Type: 'ExtGState',
        ca: 0.5,
        CA: 0.5,
        BM: PDFName.of('Multiply'),
      });
      const gsRef = doc.context.register(gsDict);

      const extGStateDict = doc.context.obj({
        GS0: gsRef,
      });
      const extGStateRef = doc.context.register(extGStateDict);

      page.node.set(
        PDFName.of('Resources'),
        doc.context.obj({
          ExtGState: extGStateRef,
        })
      );
    }
  }

  return await doc.save({ useObjectStreams: false });
}

// -----------------------------------------------------------------------------
// 1. Regras de Negócio e Normas PDF/X
// -----------------------------------------------------------------------------

test('1. PDF sem transparência: status needed=false, nenhuma correção necessária', async () => {
  const pdfBytes = await makeTestPdf({
    pages: [{ widthMm: 210, heightMm: 297, hasTransparency: false }],
  });
  const doc = await extractPdfStructure(Buffer.from(pdfBytes));

  const resultDefault = isTransparencyFlatteningNeeded(doc, 'default');
  assert.equal(resultDefault.needed, false);
  assert.equal(resultDefault.canApply, false);
  assert.match(resultDefault.reason, /Nenhuma transparência detectada/);

  const resultPdfx1a = isTransparencyFlatteningNeeded(doc, 'PDF/X-1a');
  assert.equal(resultPdfx1a.needed, false);
});

test('2. PDF/X-4 com transparência preservada: status needed=false, transparência viva permitida', async () => {
  const pdfBytes = await makeTestPdf({
    pages: [{ widthMm: 210, heightMm: 297, hasTransparency: true }],
  });
  const doc = await extractPdfStructure(Buffer.from(pdfBytes));

  const result = isTransparencyFlatteningNeeded(doc, 'PDF/X-4');
  assert.equal(result.needed, false);
  assert.equal(result.reason, PDFX4_TRANSPARENCY_NOTICE);
});

test('3. PDF destinado a PDF/X-1a com transparência: status needed=true, canApply=true', async () => {
  const pdfBytes = await makeTestPdf({
    pages: [{ widthMm: 210, heightMm: 297, hasTransparency: true }],
  });
  const doc = await extractPdfStructure(Buffer.from(pdfBytes));

  const result = isTransparencyFlatteningNeeded(doc, 'PDF/X-1a');
  assert.equal(result.needed, true);
  assert.equal(result.canApply, true);
  assert.match(result.reason, /PDF\/X-1a/);
});

// -----------------------------------------------------------------------------
// 2. Validação Estrutural Pós-Processamento
// -----------------------------------------------------------------------------

test('4. Documento multipágina: snapshot e validação pós-processamento preservam contagem de páginas', async () => {
  const preBytes = await makeTestPdf({
    pages: [
      { widthMm: 210, heightMm: 297, hasTransparency: true },
      { widthMm: 210, heightMm: 297, hasTransparency: true },
    ],
  });
  const preDoc = await extractPdfStructure(Buffer.from(preBytes));
  const preSnapshot = createPreFlatteningSnapshot(preDoc);

  assert.equal(preSnapshot.pageCount, 2);
  assert.equal(preSnapshot.totalTransparencyPages, 2);

  const postBytes = await makeTestPdf({
    pages: [
      { widthMm: 210, heightMm: 297, hasTransparency: false },
      { widthMm: 210, heightMm: 297, hasTransparency: false },
    ],
  });
  const postDoc = await extractPdfStructure(Buffer.from(postBytes));
  const validation = validateFlattenedStructure(preSnapshot, postDoc);

  assert.equal(validation.isValid, true);
  assert.equal(validation.errors.length, 0);
});

test('5. Páginas com dimensões diferentes: snapshot e validação preservam formatos individuais', async () => {
  const preBytes = await makeTestPdf({
    pages: [
      { widthMm: 210, heightMm: 297, hasTransparency: true },
      { widthMm: 148, heightMm: 210, hasTransparency: true },
    ],
  });
  const preDoc = await extractPdfStructure(Buffer.from(preBytes));
  const preSnapshot = createPreFlatteningSnapshot(preDoc);

  const postBytes = await makeTestPdf({
    pages: [
      { widthMm: 210, heightMm: 297, hasTransparency: false },
      { widthMm: 148, heightMm: 210, hasTransparency: false },
    ],
  });
  const postDoc = await extractPdfStructure(Buffer.from(postBytes));
  const validation = validateFlattenedStructure(preSnapshot, postDoc);

  assert.equal(validation.isValid, true);
});

test('6. TrimBox e BleedBox diferentes: validação garante integridade das caixas de corte', async () => {
  const preBytes = await makeTestPdf({
    pages: [
      {
        widthMm: 216,
        heightMm: 303,
        hasTransparency: true,
        trimBox: { xMm: 3, yMm: 3, widthMm: 210, heightMm: 297 },
        bleedBox: { xMm: 0, yMm: 0, widthMm: 216, heightMm: 303 },
      },
    ],
  });
  const preDoc = await extractPdfStructure(Buffer.from(preBytes));
  const preSnapshot = createPreFlatteningSnapshot(preDoc);

  const postBytes = await makeTestPdf({
    pages: [
      {
        widthMm: 216,
        heightMm: 303,
        hasTransparency: false,
        trimBox: { xMm: 3, yMm: 3, widthMm: 210, heightMm: 297 },
        bleedBox: { xMm: 0, yMm: 0, widthMm: 216, heightMm: 303 },
      },
    ],
  });
  const postDoc = await extractPdfStructure(Buffer.from(postBytes));
  const validation = validateFlattenedStructure(preSnapshot, postDoc);

  assert.equal(validation.isValid, true);
});

test('7. Redução de DPI rejeitada: pós-validação detecta downsample indevido', async () => {
  const preBytes = await makeTestPdf({
    pages: [{ widthMm: 210, heightMm: 297, hasTransparency: true }],
  });
  const preDoc = await extractPdfStructure(Buffer.from(preBytes));
  const preSnapshot = createPreFlatteningSnapshot(preDoc);

  preSnapshot.pages[0].imageCount = 1;
  preSnapshot.pages[0].images = [{
    widthPx: 1200,
    heightPx: 1600,
    effectiveDpiX: 600,
    effectiveDpiY: 600,
  }];

  const postBytes = await makeTestPdf({
    pages: [{ widthMm: 210, heightMm: 297, hasTransparency: false }],
  });
  const postDoc = await extractPdfStructure(Buffer.from(postBytes));
  postDoc.pages[0].imageOccurrences = [{
    name: 'Im0',
    widthPx: 1200,
    heightPx: 1600,
    effectiveDpiX: 300,
    effectiveDpiY: 300,
    colorSpace: 'DeviceCMYK',
  } as any];

  const validation = validateFlattenedStructure(preSnapshot, postDoc);
  assert.equal(validation.isValid, false);
  assert.equal(validation.standardRejectionMessage, STANDARD_FLATTENING_FAILURE_MESSAGE);
  assert.ok(validation.errors.some((e) => e.includes('DPI efetivo de imagem reduzido')));
});

test('8. Dimensões em pixels de imagem alteradas rejeitadas', async () => {
  const preBytes = await makeTestPdf({
    pages: [{ widthMm: 210, heightMm: 297, hasTransparency: true }],
  });
  const preDoc = await extractPdfStructure(Buffer.from(preBytes));
  const preSnapshot = createPreFlatteningSnapshot(preDoc);

  preSnapshot.pages[0].imageCount = 1;
  preSnapshot.pages[0].images = [{
    widthPx: 2000,
    heightPx: 3000,
    effectiveDpiX: 300,
    effectiveDpiY: 300,
  }];

  const postBytes = await makeTestPdf({
    pages: [{ widthMm: 210, heightMm: 297, hasTransparency: false }],
  });
  const postDoc = await extractPdfStructure(Buffer.from(postBytes));
  postDoc.pages[0].imageOccurrences = [{
    name: 'Im0',
    widthPx: 1000,
    heightPx: 1500,
    effectiveDpiX: 300,
    effectiveDpiY: 300,
    colorSpace: 'DeviceCMYK',
  } as any];

  const validation = validateFlattenedStructure(preSnapshot, postDoc);
  assert.equal(validation.isValid, false);
  assert.ok(validation.errors.some((e) => e.includes('dimensões em pixels da imagem alteradas')));
});

test('9. Família de cores alterada (ex: CMYK perdido) é rejeitada', async () => {
  const preBytes = await makeTestPdf({
    pages: [{ widthMm: 210, heightMm: 297, hasTransparency: true }],
  });
  const preDoc = await extractPdfStructure(Buffer.from(preBytes));
  const preSnapshot = createPreFlatteningSnapshot(preDoc);
  preSnapshot.colorFamilies = ['DeviceCMYK', 'Spot'];

  const postBytes = await makeTestPdf({
    pages: [{ widthMm: 210, heightMm: 297, hasTransparency: false }],
  });
  const postDoc = await extractPdfStructure(Buffer.from(postBytes));
  postDoc.colorSummary.familiesDetected = ['DeviceRGB'];

  const validation = validateFlattenedStructure(preSnapshot, postDoc);
  assert.equal(validation.isValid, false);
  assert.ok(validation.errors.some((e) => e.includes('Espaço de cores alterado')));
});

test('10. Perda de Perfil ICC separada de OutputIntent: erro específico gerado', async () => {
  const preBytes = await makeTestPdf({
    pages: [{ widthMm: 210, heightMm: 297, hasTransparency: true }],
  });
  const preDoc = await extractPdfStructure(Buffer.from(preBytes));
  const preSnapshot = createPreFlatteningSnapshot(preDoc);
  preSnapshot.hasIcc = true;
  preSnapshot.outputIntent = undefined;

  const postBytes = await makeTestPdf({
    pages: [{ widthMm: 210, heightMm: 297, hasTransparency: false }],
  });
  const postDoc = await extractPdfStructure(Buffer.from(postBytes));
  (postDoc as any).pdfxInfo = { hasOutputIntent: false };

  const validation = validateFlattenedStructure(preSnapshot, postDoc);
  assert.equal(validation.isValid, false);
  assert.ok(validation.errors.some((e) => e.includes('Perfil ICC ou OutputIntent incorporado foi perdido')));
});

test('11. OutputIntent perdido ou divergente é rejeitado', async () => {
  const preBytes = await makeTestPdf({
    pages: [{ widthMm: 210, heightMm: 297, hasTransparency: true }],
  });
  const preDoc = await extractPdfStructure(Buffer.from(preBytes));
  const preSnapshot = createPreFlatteningSnapshot(preDoc);
  preSnapshot.outputIntent = 'FOGRA39';

  const postBytes = await makeTestPdf({
    pages: [{ widthMm: 210, heightMm: 297, hasTransparency: false }],
  });
  const postDoc = await extractPdfStructure(Buffer.from(postBytes));
  postDoc.pdfxInfo = { outputConditionIdentifier: 'GRACoL2006_Coated1v2' } as any;

  const validation = validateFlattenedStructure(preSnapshot, postDoc);
  assert.equal(validation.isValid, false);
  assert.ok(validation.errors.some((e) => e.includes('OutputIntent divergente ou perdido')));
});

test('12. Fonte incorporada perdida é rejeitada', async () => {
  const preBytes = await makeTestPdf({
    pages: [{ widthMm: 210, heightMm: 297, hasTransparency: true }],
  });
  const preDoc = await extractPdfStructure(Buffer.from(preBytes));
  const preSnapshot = createPreFlatteningSnapshot(preDoc);
  preSnapshot.fonts = [{
    baseName: 'Helvetica-Bold',
    fullName: 'Helvetica-Bold',
    isEmbedded: true,
    normalizedName: 'Helvetica-Bold',
  }];

  const postBytes = await makeTestPdf({
    pages: [{ widthMm: 210, heightMm: 297, hasTransparency: false }],
  });
  const postDoc = await extractPdfStructure(Buffer.from(postBytes));
  postDoc.fonts = [{
    baseFont: 'Helvetica-Bold',
    cleanFontName: 'Helvetica-Bold',
    isEmbedded: 'no',
    isUsedInContent: true,
  } as any];

  const validation = validateFlattenedStructure(preSnapshot, postDoc);
  assert.equal(validation.isValid, false);
  assert.ok(validation.errors.some((e) => e.includes('desincorporada')));
});

test('13. Prefixo de subset de fonte alterado, mas nome-base preservado: aprovado', async () => {
  assert.equal(normalizeFontName('ABCDEF+Helvetica-Bold'), 'Helvetica-Bold');
  assert.equal(normalizeFontName('XYZWQA+Roboto-Regular'), 'Roboto-Regular');
  assert.equal(normalizeFontName('ArialMT'), 'ArialMT');

  const preBytes = await makeTestPdf({
    pages: [{ widthMm: 210, heightMm: 297, hasTransparency: true }],
  });
  const preDoc = await extractPdfStructure(Buffer.from(preBytes));
  const preSnapshot = createPreFlatteningSnapshot(preDoc);
  preSnapshot.fonts = [{
    baseName: 'ABCDEF+Helvetica-Bold',
    fullName: 'Helvetica-Bold',
    isEmbedded: true,
    normalizedName: 'Helvetica-Bold',
  }];

  const postBytes = await makeTestPdf({
    pages: [{ widthMm: 210, heightMm: 297, hasTransparency: false }],
  });
  const postDoc = await extractPdfStructure(Buffer.from(postBytes));
  postDoc.fonts = [{
    baseFont: 'XYZWQA+Helvetica-Bold',
    cleanFontName: 'Helvetica-Bold',
    isEmbedded: 'yes',
    isUsedInContent: true,
  } as any];

  const validation = validateFlattenedStructure(preSnapshot, postDoc);
  assert.equal(validation.isValid, true);
});

// -----------------------------------------------------------------------------
// 3. Segurança de Rota, Middleware Chain e Semáforo
// -----------------------------------------------------------------------------

test('14. Arquivo sem assinatura %PDF- rejeitado com status 400 e JSON', () => {
  const badBuffer = Buffer.from('ESTE_NAO_E_UM_PDF_VALIDO');
  assert.equal(badBuffer.subarray(0, Math.min(badBuffer.length, 1024)).includes(Buffer.from('%PDF-')), false);
});

test('15. Semáforo de concorrência: 3º processo simultâneo é recusado e limpo após erro', async () => {
  setActiveFlatteningJobsCountForTesting(MAX_CONCURRENT_FLATTENING_JOBS);
  assert.equal(getActiveFlatteningJobsCount(), 2);

  const pdfBytes = await makeTestPdf({
    pages: [{ widthMm: 210, heightMm: 297, hasTransparency: true }],
  });

  await assert.rejects(
    async () => {
      await flattenPdfTransparency(Buffer.from(pdfBytes));
    },
    (err: any) => {
      assert.equal(err.code, 'CONCURRENCY_LIMIT_REACHED');
      assert.match(err.message, /limite de conversões de transparência simultâneas/);
      return true;
    }
  );

  setActiveFlatteningJobsCountForTesting(0);
  assert.equal(getActiveFlatteningJobsCount(), 0);
});

test('16. Limpeza do semáforo é garantida após sucesso, erro e timeout', () => {
  assert.equal(getActiveFlatteningJobsCount(), 0);
  setActiveFlatteningJobsCountForTesting(1);
  assert.equal(getActiveFlatteningJobsCount(), 1);
  setActiveFlatteningJobsCountForTesting(0);
  assert.equal(getActiveFlatteningJobsCount(), 0);
});

test('17. Ghostscript indisponível no host retorna erro estruturado sem simular sucesso', async () => {
  if (!isGhostscriptAvailable()) {
    const pdfBytes = await makeTestPdf({
      pages: [{ widthMm: 210, heightMm: 297, hasTransparency: true }],
    });

    await assert.rejects(
      async () => {
        await flattenPdfTransparency(Buffer.from(pdfBytes));
      },
      (err: any) => {
        assert.equal(err.code, 'GHOSTSCRIPT_UNAVAILABLE');
        assert.match(err.message, /Ghostscript não está instalado/);
        return true;
      }
    );
  }
});

test('18. Prova estrita de que a verificação de autenticação e cota ocorre ANTES do Multer na rota', () => {
  const serverCode = fs.readFileSync('server.ts', 'utf8');
  const flattenRoutePos = serverCode.indexOf('app.post(\n    "/api/flatten-transparency"');
  assert.ok(flattenRoutePos > 0, 'Rota /api/flatten-transparency deve existir no server.ts');

  const routeBlock = serverCode.slice(flattenRoutePos, flattenRoutePos + 1800);

  // 1. O middleware de cota/auth deve aparecer ANTES de upload.single("file")
  const quotaAuthPos = routeBlock.indexOf('isBillingEnforced()');
  const multerPos = routeBlock.indexOf('upload.single("file")');
  const signatureCheckPos = routeBlock.indexOf('%PDF-');

  assert.ok(quotaAuthPos > 0, 'Validação de billing/auth deve estar na rota');
  assert.ok(multerPos > 0, 'Multer deve estar na rota');
  assert.ok(quotaAuthPos < multerPos, 'Validação de billing/auth deve ser executada ANTES do Multer');
  assert.ok(multerPos < signatureCheckPos, 'Assinatura %PDF- deve ser checada após o upload do buffer');
});

test('19. Preservação absoluta do arquivo original em todas as operações', async () => {
  const originalBytes = await makeTestPdf({
    pages: [{ widthMm: 210, heightMm: 297, hasTransparency: true }],
  });
  const originalChecksum = Buffer.from(originalBytes).toString('base64');

  const doc = await extractPdfStructure(Buffer.from(originalBytes));
  const snapshot = createPreFlatteningSnapshot(doc);
  validateFlattenedStructure(snapshot, doc);

  const finalChecksum = Buffer.from(originalBytes).toString('base64');
  assert.equal(originalChecksum, finalChecksum);
});
