/**
 * ARTECHECK AI — Formatador da Apresentação de Famílias de Cores no Checklist Principal
 */

export function formatColorSummaryText(colorSummary?: {
  hasRgb?: boolean;
  hasCmyk?: boolean;
  hasGray?: boolean;
  hasSpotColors?: boolean;
  familiesDetected?: string[];
}): string {
  if (!colorSummary) return 'CMYK';
  if (colorSummary.hasRgb) return 'RGB';

  const families = colorSummary.familiesDetected || [];
  const hasCmyk = Boolean(colorSummary.hasCmyk || families.includes('DeviceCMYK'));
  const hasGray = Boolean(colorSummary.hasGray || families.includes('DeviceGray'));
  const hasSpot = Boolean(
    colorSummary.hasSpotColors ||
      families.includes('Spot') ||
      families.includes('Separation') ||
      families.includes('DeviceN')
  );

  if (hasCmyk) {
    if (hasGray && hasSpot) return 'CMYK + Tons de cinza + Spot';
    if (hasGray) return 'CMYK + Tons de cinza';
    if (hasSpot) return 'CMYK + Spot';
    return 'CMYK';
  }

  if (hasGray && hasSpot) return 'Tons de cinza + Spot';
  if (hasGray) return 'Tons de cinza';
  if (hasSpot) return 'Cores especiais (Spot)';

  return 'CMYK';
}
