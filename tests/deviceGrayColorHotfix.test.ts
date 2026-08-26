import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument, PDFName, PDFRawStream } from 'pdf-lib';
import { extractPdfStructure } from '../server/pdfExtractor';
import { runDeterministicRuleEngine } from '../src/utils/ruleEngine';
import { COMMERCIAL_PRINT_300DPI_PROFILE } from '../src/utils/productionProfiles';

describe('ARTECHECK AI — Hotfix P0 de Classificação de DeviceGray', () => {
  it('Fixture 1: Vetor puro DeviceGray usando operador "g" (fill)', async () => {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([200, 200]);
    // Desenha retângulo preenchido com 50% de cinza via operador g
    const contentStream = Buffer.from('0.5 g 10 10 100 100 re f', 'utf-8');
    page.node.set(
      PDFName.of('Contents'),
      pdfDoc.context.register(PDFRawStream.of(pdfDoc.context.obj({}) as any, contentStream))
    );

    const pdfBytes = await pdfDoc.save({ useObjectStreams: false });
    const structure = await extractPdfStructure(Buffer.from(pdfBytes));

    assert.equal(structure.colorSummary.hasGray, true, 'Deve identificar hasGray = true');
    assert.equal(structure.colorSummary.hasGrayVector, true, 'Deve identificar hasGrayVector = true');
    assert.equal(structure.colorSummary.hasGrayRaster, false, 'hasGrayRaster deve ser false');
    assert.equal(structure.colorSummary.hasRgb, false, 'DeviceGray puro NÃO pode ativar hasRgb');
    assert.equal(structure.colorSummary.hasRgbRaster, false, 'hasRgbRaster deve ser false');
    assert.equal(structure.colorSummary.hasRgbVector, false, 'hasRgbVector deve ser false');
    assert.equal(structure.colorSummary.hasCmyk, false, 'DeviceGray puro NÃO pode ativar hasCmyk');
    assert.ok(structure.colorSummary.familiesDetected.includes('DeviceGray'), 'familiesDetected deve conter DeviceGray');
    assert.ok(!structure.colorSummary.familiesDetected.includes('DeviceCMYK'), 'familiesDetected NÃO pode conter DeviceCMYK');
    assert.ok(!structure.colorSummary.familiesDetected.includes('DeviceRGB'), 'familiesDetected NÃO pode conter DeviceRGB');

    assert.equal(structure.pages[0].colorOccurrences.some(c => c.family === 'DeviceGray'), true);
    assert.equal(structure.pages[0].colorOccurrences.some(c => c.family === 'DeviceCMYK'), false);

    const rules = runDeterministicRuleEngine(structure, COMMERCIAL_PRINT_300DPI_PROFILE);
    const colorRule = rules.results.find(r => r.ruleId === 'RULE-PROF-CLR-001');
    assert.equal(colorRule?.status, 'approved', 'DeviceGray puro deve ser aprovado no perfil comercial');
  });

  it('Fixture 2: Traço puro DeviceGray usando operador "G" (stroke)', async () => {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([200, 200]);
    const contentStream = Buffer.from('0.2 G 10 10 m 150 150 l S', 'utf-8');
    page.node.set(
      PDFName.of('Contents'),
      pdfDoc.context.register(PDFRawStream.of(pdfDoc.context.obj({}) as any, contentStream))
    );

    const pdfBytes = await pdfDoc.save({ useObjectStreams: false });
    const structure = await extractPdfStructure(Buffer.from(pdfBytes));

    assert.equal(structure.colorSummary.hasGray, true);
    assert.equal(structure.colorSummary.hasGrayVector, true);
    assert.equal(structure.colorSummary.hasRgb, false);
    assert.equal(structure.colorSummary.hasCmyk, false);
    assert.deepEqual(structure.colorSummary.familiesDetected, ['DeviceGray']);
  });

  it('Fixture 3: Espaço explícito via operador "cs /DeviceGray" e "sc"', async () => {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([200, 200]);
    const contentStream = Buffer.from('/DeviceGray cs 0.75 sc 20 20 80 80 re f', 'utf-8');
    page.node.set(
      PDFName.of('Contents'),
      pdfDoc.context.register(PDFRawStream.of(pdfDoc.context.obj({}) as any, contentStream))
    );

    const pdfBytes = await pdfDoc.save({ useObjectStreams: false });
    const structure = await extractPdfStructure(Buffer.from(pdfBytes));

    assert.equal(structure.colorSummary.hasGray, true);
    assert.equal(structure.colorSummary.hasGrayVector, true);
    assert.equal(structure.colorSummary.hasRgb, false);
    assert.equal(structure.colorSummary.hasCmyk, false);
    assert.deepEqual(structure.colorSummary.familiesDetected, ['DeviceGray']);
  });

  it('Fixture 4: Imagem raster DeviceGray (XObject com ColorSpace /DeviceGray)', async () => {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([200, 200]);

    // Cria stream de imagem em tons de cinza (8x8 pixels, 1 byte por pixel = 64 bytes)
    const grayPixels = new Uint8Array(64);
    for (let i = 0; i < 64; i++) {
      grayPixels[i] = (i * 4) % 256;
    }

    const imageDict = pdfDoc.context.obj({
      Type: 'XObject',
      Subtype: 'Image',
      Width: 8,
      Height: 8,
      BitsPerComponent: 8,
      ColorSpace: 'DeviceGray',
    });

    const imageStream = PDFRawStream.of(imageDict, grayPixels);
    const imageRef = pdfDoc.context.register(imageStream);

    page.node.set(
      PDFName.of('Resources'),
      pdfDoc.context.obj({
        XObject: {
          ImgGray: imageRef,
        },
      })
    );

    const contentStream = Buffer.from('q 100 0 0 100 20 20 cm /ImgGray Do Q', 'utf-8');
    page.node.set(
      PDFName.of('Contents'),
      pdfDoc.context.register(PDFRawStream.of(pdfDoc.context.obj({}) as any, contentStream))
    );

    const pdfBytes = await pdfDoc.save({ useObjectStreams: false });
    const structure = await extractPdfStructure(Buffer.from(pdfBytes));

    assert.equal(structure.colorSummary.hasGray, true);
    assert.equal(structure.colorSummary.hasGrayRaster, true);
    assert.equal(structure.colorSummary.hasRgb, false);
    assert.equal(structure.colorSummary.hasRgbRaster, false);
    assert.equal(structure.colorSummary.hasCmyk, false);
    assert.deepEqual(structure.colorSummary.familiesDetected, ['DeviceGray']);
    assert.equal(structure.pages[0].imageOccurrences.length, 1);
    assert.equal(structure.pages[0].imageOccurrences[0].colorSpace, 'DeviceGray');
  });

  it('Fixture 5: Página mista DeviceGray + DeviceCMYK', async () => {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([200, 200]);
    // Vetor Gray + Vetor CMYK
    const contentStream = Buffer.from('0.3 g 10 10 50 50 re f 0.1 0.2 0.3 0.4 k 70 70 50 50 re f', 'utf-8');
    page.node.set(
      PDFName.of('Contents'),
      pdfDoc.context.register(PDFRawStream.of(pdfDoc.context.obj({}) as any, contentStream))
    );

    const pdfBytes = await pdfDoc.save({ useObjectStreams: false });
    const structure = await extractPdfStructure(Buffer.from(pdfBytes));

    assert.equal(structure.colorSummary.hasGray, true);
    assert.equal(structure.colorSummary.hasCmyk, true);
    assert.equal(structure.colorSummary.hasRgb, false);
    assert.ok(structure.colorSummary.familiesDetected.includes('DeviceGray'));
    assert.ok(structure.colorSummary.familiesDetected.includes('DeviceCMYK'));
    assert.ok(!structure.colorSummary.familiesDetected.includes('DeviceRGB'));

    const rules = runDeterministicRuleEngine(structure, COMMERCIAL_PRINT_300DPI_PROFILE);
    const colorRule = rules.results.find(r => r.ruleId === 'RULE-PROF-CLR-001');
    assert.equal(colorRule?.status, 'approved', 'Mistura CMYK + Gray deve ser aprovada no perfil comercial');
  });

  it('Fixture 6: Página mista DeviceGray + DeviceRGB (detecta RGB sem suprimir Gray)', async () => {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([200, 200]);
    // Vetor Gray + Vetor RGB
    const contentStream = Buffer.from('0.8 g 10 10 50 50 re f 1 0 0 rg 70 70 50 50 re f', 'utf-8');
    page.node.set(
      PDFName.of('Contents'),
      pdfDoc.context.register(PDFRawStream.of(pdfDoc.context.obj({}) as any, contentStream))
    );

    const pdfBytes = await pdfDoc.save({ useObjectStreams: false });
    const structure = await extractPdfStructure(Buffer.from(pdfBytes));

    assert.equal(structure.colorSummary.hasGray, true);
    assert.equal(structure.colorSummary.hasRgb, true);
    assert.equal(structure.colorSummary.hasRgbVector, true);
    assert.ok(structure.colorSummary.familiesDetected.includes('DeviceGray'));
    assert.ok(structure.colorSummary.familiesDetected.includes('DeviceRGB'));

    const rules = runDeterministicRuleEngine(structure, COMMERCIAL_PRINT_300DPI_PROFILE);
    const colorRule = rules.results.find(r => r.ruleId === 'RULE-PROF-CLR-001');
    assert.equal(colorRule?.status, 'error', 'Presença de RGB em perfil comercial deve gerar erro');
  });

  it('Fixture 7: Fallback para DeviceCMYK quando não há cor identificável', async () => {
    const pdfDoc = await PDFDocument.create();
    pdfDoc.addPage([200, 200]); // Página em branco sem conteúdo

    const pdfBytes = await pdfDoc.save({ useObjectStreams: false });
    const structure = await extractPdfStructure(Buffer.from(pdfBytes));

    assert.equal(structure.colorSummary.hasGray, false);
    assert.equal(structure.colorSummary.hasRgb, false);
    assert.equal(structure.colorSummary.hasCmyk, true, 'Página sem nenhuma cor cai no fallback de DeviceCMYK');
    assert.deepEqual(structure.colorSummary.familiesDetected, ['DeviceCMYK']);
  });
});
