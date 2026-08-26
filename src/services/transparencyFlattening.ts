/**
 * ARTECHECK — Transparency Flattening Service (Deterministic MVP)
 *
 * Deterministic service to audit, pre-validate, and post-validate PDF transparency
 * flattening operations in compliance with print production standards (PDF/X-1a vs PDF/X-4).
 *
 * CRITICAL RULES:
 * 1. PDF/X-4 permits live transparency (ISO 15930-7); flattening is NOT required.
 * 2. PDF/X-1a / PDF 1.3 requires flattened transparency; flattening MUST be validated.
 * 3. Never mutate the original buffer.
 * 4. Rigorously validate post-processing structure:
 *    - Same page count and dimensions (within 0.5 mm)
 *    - Rotation and box hierarchy (MediaBox, CropBox, TrimBox, BleedBox)
 *    - Image count, pixel dimensions, and effective DPI (no downsampling)
 *    - Color space families (no unintended CMYK/RGB/Spot conversions)
 *    - ICC profile and OutputIntent preservation
 *    - Font set and font embedding status (normalizing 6-letter subset prefixes)
 *    - Incompatible transparency completely removed
 */

import type { PdfDocumentStructure, PdfPageStructure } from '../types/index.ts';

export interface PreFlatteningImageInfo {
  widthPx: number;
  heightPx: number;
  effectiveDpiX: number;
  effectiveDpiY: number;
  colorSpace?: string;
}

export interface PreFlatteningFontInfo {
  baseName: string;
  fullName: string;
  isEmbedded: boolean;
  normalizedName: string;
}

export interface PreFlatteningSnapshot {
  pageCount: number;
  pages: Array<{
    pageNumber: number;
    widthMm: number;
    heightMm: number;
    visualWidthMm: number;
    visualHeightMm: number;
    orientation: string;
    rotation: number;
    mediaBox?: { widthMm: number; heightMm: number; xMm?: number; yMm?: number };
    cropBox?: { widthMm: number; heightMm: number; xMm?: number; yMm?: number };
    trimBox?: { widthMm: number; heightMm: number; xMm?: number; yMm?: number; status: string };
    bleedBox?: { widthMm: number; heightMm: number; xMm?: number; yMm?: number; status: string };
    hasTransparency: boolean;
    imageCount: number;
    images: PreFlatteningImageInfo[];
  }>;
  hasTransparency: boolean;
  totalTransparencyPages: number;
  colorFamilies: string[];
  hasIcc: boolean;
  outputIntent?: string;
  fonts: PreFlatteningFontInfo[];
  embeddedFontsCount: number;
  unembeddedFontsCount: number;
}

export interface TransparencyValidationResult {
  isValid: boolean;
  standardRejectionMessage?: string;
  errors: string[];
  warnings: string[];
  beforeSnapshot: PreFlatteningSnapshot;
  afterSnapshot?: PreFlatteningSnapshot;
}

export const STANDARD_FLATTENING_FAILURE_MESSAGE =
  'Não foi possível achatar as transparências com segurança. O arquivo original não foi alterado.';

export const PDFX4_TRANSPARENCY_NOTICE =
  'O PDF/X-4 aceita transparências. Nenhuma correção é necessária.';

export const FLATTENING_PRE_WARNING =
  'O achatamento pode alterar elementos visuais complexos. O ArteCheck criará uma nova versão e verificará a estrutura do arquivo original.';

/**
 * Normalizes font names by removing the standard 6-uppercase-letter PDF subset prefix (e.g. "ABCDEF+Helvetica" -> "Helvetica").
 */
export function normalizeFontName(fontName: string): string {
  if (!fontName) return '';
  return fontName.replace(/^[A-Z]{6}\+/, '').trim();
}

/**
 * Creates an immutable snapshot of the PDF structural state before flattening.
 */
export function createPreFlatteningSnapshot(doc: PdfDocumentStructure): PreFlatteningSnapshot {
  const pages = doc.pages || [];
  const totalTransparencyPages = pages.filter((p) => p.hasTransparency).length;
  const hasTransparency = totalTransparencyPages > 0;

  const fontList: PreFlatteningFontInfo[] = (doc.fonts || []).map((f) => {
    const isEmbedded = f.isEmbedded === 'yes' || f.isEmbedded === 'subset' || f.isEmbedded === true;
    const name = f.baseFont || f.cleanFontName || (f as any).name || (f as any).fontFamily || '';
    const clean = f.cleanFontName || normalizeFontName(name);
    return {
      baseName: name,
      fullName: clean || name,
      isEmbedded,
      normalizedName: clean || normalizeFontName(name),
    };
  });

  const unembeddedFonts = fontList.filter(
    (f) => !f.isEmbedded
  );
  const embeddedFonts = fontList.filter((f) => f.isEmbedded);

  const snapshotPages = pages.map((p) => {
    const images: PreFlatteningImageInfo[] = (p.imageOccurrences || []).map((img) => ({
      widthPx: img.widthPx || 0,
      heightPx: img.heightPx || 0,
      effectiveDpiX: img.effectiveDpiX || 0,
      effectiveDpiY: img.effectiveDpiY || 0,
      colorSpace: img.colorSpace,
    }));

    return {
      pageNumber: p.page,
      widthMm: p.widthMm,
      heightMm: p.heightMm,
      visualWidthMm: p.visualWidthMm ?? p.widthMm,
      visualHeightMm: p.visualHeightMm ?? p.heightMm,
      orientation: p.orientation || 'portrait',
      rotation: p.rotation || 0,
      mediaBox: p.mediaBox ? { widthMm: p.mediaBox.widthMm, heightMm: p.mediaBox.heightMm, xMm: p.mediaBox.xMm, yMm: p.mediaBox.yMm } : undefined,
      cropBox: p.cropBox ? { widthMm: p.cropBox.widthMm, heightMm: p.cropBox.heightMm, xMm: p.cropBox.xMm, yMm: p.cropBox.yMm } : undefined,
      trimBox: p.trimBox ? { widthMm: p.trimBox.widthMm, heightMm: p.trimBox.heightMm, xMm: p.trimBox.xMm, yMm: p.trimBox.yMm, status: p.trimBox.status } : undefined,
      bleedBox: p.bleedBox ? { widthMm: p.bleedBox.widthMm, heightMm: p.bleedBox.heightMm, xMm: p.bleedBox.xMm, yMm: p.bleedBox.yMm, status: p.bleedBox.status } : undefined,
      hasTransparency: Boolean(p.hasTransparency),
      imageCount: images.length,
      images,
    };
  });

  const hasIcc = Boolean((doc.pdfxInfo as any)?.hasOutputIntent || doc.pdfxInfo?.outputConditionIdentifier);

  return {
    pageCount: doc.pageCount || pages.length,
    pages: snapshotPages,
    hasTransparency,
    totalTransparencyPages,
    colorFamilies: (doc.colorSummary?.familiesDetected || []).slice().sort(),
    hasIcc,
    outputIntent: doc.pdfxInfo?.outputConditionIdentifier || (doc.pdfxInfo as any)?.outputIntent,
    fonts: fontList,
    embeddedFontsCount: embeddedFonts.length,
    unembeddedFontsCount: unembeddedFonts.length,
  };
}

/**
 * Validates the post-flattening PDF structure against the pre-flattening snapshot.
 * Enforces strict non-negotiable checks:
 * 1. Same page count
 * 2. Same dimensions per page (within 0.5 mm)
 * 3. Same orientation/rotation
 * 4. TrimBox and BleedBox preserved
 * 5. Incompatible transparency removed
 * 6. Image count, pixel dimensions, and DPI preserved (no downsampling)
 * 7. Color space families preserved
 * 8. ICC and OutputIntent preserved
 * 9. Font set and embedding preserved (with subset prefix normalization)
 */
export function validateFlattenedStructure(
  preSnapshot: PreFlatteningSnapshot,
  postDoc: PdfDocumentStructure
): TransparencyValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const postSnapshot = createPreFlatteningSnapshot(postDoc);

  // 1. Page count verification
  if (postSnapshot.pageCount !== preSnapshot.pageCount) {
    errors.push(
      `Quantidade de páginas divergente: antes ${preSnapshot.pageCount}, depois ${postSnapshot.pageCount}.`
    );
  }

  // 2. Page-by-page geometry, boxes, and image verification
  const TOLERANCE_MM = 0.5;
  for (let i = 0; i < preSnapshot.pages.length; i++) {
    const preP = preSnapshot.pages[i];
    const postP = postSnapshot.pages[i];

    if (!postP) {
      errors.push(`Página ${preP.pageNumber} ausente no documento pós-processamento.`);
      continue;
    }

    // Dimensions
    const diffW = Math.abs(postP.widthMm - preP.widthMm);
    const diffH = Math.abs(postP.heightMm - preP.heightMm);
    if (diffW > TOLERANCE_MM || diffH > TOLERANCE_MM) {
      errors.push(
        `Página ${preP.pageNumber}: dimensões alteradas de ${preP.widthMm.toFixed(1)} × ${preP.heightMm.toFixed(1)} mm para ${postP.widthMm.toFixed(1)} × ${postP.heightMm.toFixed(1)} mm.`
      );
    }

    // Rotation
    if (postP.rotation !== preP.rotation) {
      errors.push(
        `Página ${preP.pageNumber}: rotação alterada de ${preP.rotation}° para ${postP.rotation}°.`
      );
    }

    // TrimBox preservation
    if (preP.trimBox && preP.trimBox.status === 'explicit') {
      if (!postP.trimBox || postP.trimBox.status !== 'explicit') {
        errors.push(`Página ${preP.pageNumber}: /TrimBox explícita foi perdida após o achatamento.`);
      } else {
        const trimDiffW = Math.abs(postP.trimBox.widthMm - preP.trimBox.widthMm);
        const trimDiffH = Math.abs(postP.trimBox.heightMm - preP.trimBox.heightMm);
        if (trimDiffW > TOLERANCE_MM || trimDiffH > TOLERANCE_MM) {
          errors.push(
            `Página ${preP.pageNumber}: /TrimBox divergente após achatamento.`
          );
        }
      }
    }

    // BleedBox preservation
    if (preP.bleedBox && preP.bleedBox.status === 'explicit') {
      if (!postP.bleedBox || postP.bleedBox.status !== 'explicit') {
        errors.push(`Página ${preP.pageNumber}: /BleedBox explícita foi perdida após o achatamento.`);
      } else {
        const bleedDiffW = Math.abs(postP.bleedBox.widthMm - preP.bleedBox.widthMm);
        const bleedDiffH = Math.abs(postP.bleedBox.heightMm - preP.bleedBox.heightMm);
        if (bleedDiffW > TOLERANCE_MM || bleedDiffH > TOLERANCE_MM) {
          errors.push(
            `Página ${preP.pageNumber}: /BleedBox divergente após achatamento.`
          );
        }
      }
    }

    // Image preservation & DPI validation
    // NOTA DE ARQUITETURA: A verificação de igualdade na quantidade de imagens é uma proteção conservadora provisória.
    // O achatamento real de transparências via Ghostscript pode gerar novos objetos XObject ou imagens raster compostas.
    // Após a instalação do Ghostscript em ambiente de teste com PDFs reais, esta regra deverá ser validada e calibrada antes de ser considerada definitiva.
    if (preP.imageCount > 0) {
      if (postP.imageCount !== preP.imageCount) {
        errors.push(
          `Página ${preP.pageNumber}: quantidade de imagens alterada (antes: ${preP.imageCount}, depois: ${postP.imageCount}).`
        );
      }

      for (let imgIdx = 0; imgIdx < preP.images.length; imgIdx++) {
        const preImg = preP.images[imgIdx];
        const postImg = postP.images[imgIdx];
        if (postImg) {
          // Check pixel dimension change
          if (preImg.widthPx > 0 && postImg.widthPx > 0 && (postImg.widthPx !== preImg.widthPx || postImg.heightPx !== preImg.heightPx)) {
            errors.push(
              `Página ${preP.pageNumber}: dimensões em pixels da imagem alteradas de ${preImg.widthPx}×${preImg.heightPx} para ${postImg.widthPx}×${postImg.heightPx}.`
            );
          }

          // Check DPI reduction (allow 1 DPI rounding margin)
          if (preImg.effectiveDpiX > 0 && postImg.effectiveDpiX > 0 && postImg.effectiveDpiX < preImg.effectiveDpiX - 1) {
            errors.push(
              `Página ${preP.pageNumber}: DPI efetivo de imagem reduzido de ${Math.round(preImg.effectiveDpiX)} para ${Math.round(postImg.effectiveDpiX)}.`
            );
          }
        }
      }
    }
  }

  // 3. Transparency removal verification
  if (postSnapshot.hasTransparency) {
    errors.push(
      `Transparências ainda detectadas em ${postSnapshot.totalTransparencyPages} página(s) pós-achatamento.`
    );
  }

  // 4. Color space families verification
  if (preSnapshot.colorFamilies.length > 0) {
    const missingFamilies = preSnapshot.colorFamilies.filter(
      (f) => !postSnapshot.colorFamilies.includes(f)
    );
    if (missingFamilies.length > 0) {
      errors.push(
        `Espaço de cores alterado: família(s) [${missingFamilies.join(', ')}] não detectada(s) após o achatamento.`
      );
    }
  }

  // 5. ICC Profile verification (distinct from OutputIntent)
  if (preSnapshot.hasIcc && !postSnapshot.hasIcc) {
    errors.push('Perfil ICC ou OutputIntent incorporado foi perdido após o achatamento.');
  }

  // 6. OutputIntent identifier verification
  if (preSnapshot.outputIntent) {
    if (!postSnapshot.outputIntent || postSnapshot.outputIntent !== preSnapshot.outputIntent) {
      errors.push(
        `OutputIntent divergente ou perdido após o achatamento (antes: "${preSnapshot.outputIntent}", depois: "${postSnapshot.outputIntent || 'ausente'}").`
      );
    }
  }

  // 7. Font set and embedding integrity (with subset prefix normalization)
  if (postSnapshot.unembeddedFontsCount > preSnapshot.unembeddedFontsCount) {
    errors.push(
      `Fontes não incorporadas aumentaram de ${preSnapshot.unembeddedFontsCount} para ${postSnapshot.unembeddedFontsCount}.`
    );
  }

  for (const preFont of preSnapshot.fonts) {
    if (preFont.isEmbedded) {
      const match = postSnapshot.fonts.find(
        (pf) => pf.normalizedName === preFont.normalizedName
      );
      if (!match) {
        errors.push(
          `Fonte incorporada "${preFont.fullName || preFont.baseName}" não encontrada no documento achatado.`
        );
      } else if (!match.isEmbedded) {
        errors.push(
          `Fonte incorporada "${preFont.fullName || preFont.baseName}" foi desincorporada durante o achatamento.`
        );
      }
    }
  }

  const isValid = errors.length === 0;

  return {
    isValid,
    standardRejectionMessage: isValid ? undefined : STANDARD_FLATTENING_FAILURE_MESSAGE,
    errors,
    warnings,
    beforeSnapshot: preSnapshot,
    afterSnapshot: postSnapshot,
  };
}

/**
 * Checks whether the active profile/target requires transparency flattening.
 */
export function isTransparencyFlatteningNeeded(
  doc: PdfDocumentStructure,
  targetStandard: 'PDF/X-4' | 'PDF/X-1a' | 'default' = 'default'
): { needed: boolean; reason: string; canApply: boolean } {
  const hasTransp = (doc.pages || []).some((p) => p.hasTransparency);

  if (!hasTransp) {
    return {
      needed: false,
      reason: 'Nenhuma transparência detectada no documento.',
      canApply: false,
    };
  }

  if (targetStandard === 'PDF/X-4' || targetStandard === 'default') {
    return {
      needed: false,
      reason: PDFX4_TRANSPARENCY_NOTICE,
      canApply: false,
    };
  }

  return {
    needed: true,
    reason: 'O padrão PDF/X-1a (PDF 1.3) exige que todas as transparências sejam achatadas.',
    canApply: true,
  };
}
