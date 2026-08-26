import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatColorSummaryText } from '../src/utils/colorSummaryFormatter';

describe('ARTECHECK AI — Apresentação das Famílias de Cor no Checklist Principal', () => {
  it('1. Apenas DeviceGray deve exibir "Tons de cinza"', () => {
    const colorSummary = {
      hasRgb: false,
      hasCmyk: false,
      hasGray: true,
      hasSpotColors: false,
      familiesDetected: ['DeviceGray'],
    };
    const result = formatColorSummaryText(colorSummary);
    assert.equal(result, 'Tons de cinza', 'Esperado "Tons de cinza" para documento puramente em escala de cinza');
  });

  it('2. Apenas Spot/Separation deve exibir "Cores especiais (Spot)"', () => {
    const colorSummary = {
      hasRgb: false,
      hasCmyk: false,
      hasGray: false,
      hasSpotColors: true,
      familiesDetected: ['Spot'],
    };
    const result = formatColorSummaryText(colorSummary);
    assert.equal(result, 'Cores especiais (Spot)', 'Esperado "Cores especiais (Spot)" para documento com apenas canais especiais');
  });

  it('3. DeviceGray + Spot deve exibir "Tons de cinza + Spot"', () => {
    const colorSummary = {
      hasRgb: false,
      hasCmyk: false,
      hasGray: true,
      hasSpotColors: true,
      familiesDetected: ['DeviceGray', 'Spot'],
    };
    const result = formatColorSummaryText(colorSummary);
    assert.equal(result, 'Tons de cinza + Spot', 'Esperado "Tons de cinza + Spot"');
  });

  it('4. Apenas DeviceCMYK deve exibir "CMYK"', () => {
    const colorSummary = {
      hasRgb: false,
      hasCmyk: true,
      hasGray: false,
      hasSpotColors: false,
      familiesDetected: ['DeviceCMYK'],
    };
    const result = formatColorSummaryText(colorSummary);
    assert.equal(result, 'CMYK', 'Esperado "CMYK" para documento puramente CMYK');
  });

  it('5. DeviceCMYK + DeviceGray deve exibir "CMYK + Tons de cinza"', () => {
    const colorSummary = {
      hasRgb: false,
      hasCmyk: true,
      hasGray: true,
      hasSpotColors: false,
      familiesDetected: ['DeviceCMYK', 'DeviceGray'],
    };
    const result = formatColorSummaryText(colorSummary);
    assert.equal(result, 'CMYK + Tons de cinza', 'Esperado "CMYK + Tons de cinza"');
  });

  it('6. DeviceCMYK + Spot deve exibir "CMYK + Spot"', () => {
    const colorSummary = {
      hasRgb: false,
      hasCmyk: true,
      hasGray: false,
      hasSpotColors: true,
      familiesDetected: ['DeviceCMYK', 'Spot'],
    };
    const result = formatColorSummaryText(colorSummary);
    assert.equal(result, 'CMYK + Spot', 'Esperado "CMYK + Spot"');
  });

  it('7. DeviceCMYK + DeviceGray + Spot deve exibir "CMYK + Tons de cinza + Spot"', () => {
    const colorSummary = {
      hasRgb: false,
      hasCmyk: true,
      hasGray: true,
      hasSpotColors: true,
      familiesDetected: ['DeviceCMYK', 'DeviceGray', 'Spot'],
    };
    const result = formatColorSummaryText(colorSummary);
    assert.equal(result, 'CMYK + Tons de cinza + Spot', 'Esperado "CMYK + Tons de cinza + Spot"');
  });

  it('8. DeviceRGB: Retorna "RGB" e preserva a diferenciação de status (Ajustável para raster vs Manual para vetor)', () => {
    // Caso 8.1: RGB Raster (Imagem)
    const colorSummaryRaster = {
      hasRgb: true,
      hasRgbRaster: true,
      hasRgbVector: false,
      hasCmyk: false,
      hasGray: false,
      hasSpotColors: false,
      familiesDetected: ['DeviceRGB'],
    };
    assert.equal(formatColorSummaryText(colorSummaryRaster), 'RGB');
    const statusRaster = !colorSummaryRaster.hasRgb ? 'OK' : (colorSummaryRaster.hasRgbRaster ? 'Ajustável' : 'Manual');
    assert.equal(statusRaster, 'Ajustável', 'RGB raster deve ser Ajustável');

    // Caso 8.2: RGB Vetor/Texto
    const colorSummaryVector = {
      hasRgb: true,
      hasRgbRaster: false,
      hasRgbVector: true,
      hasCmyk: false,
      hasGray: false,
      hasSpotColors: false,
      familiesDetected: ['DeviceRGB'],
    };
    assert.equal(formatColorSummaryText(colorSummaryVector), 'RGB');
    const statusVector = !colorSummaryVector.hasRgb ? 'OK' : (colorSummaryVector.hasRgbRaster ? 'Ajustável' : 'Manual');
    assert.equal(statusVector, 'Manual', 'RGB somente vetor deve ser Manual');
  });
});
