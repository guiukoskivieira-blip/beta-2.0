import { PDFDocument, degrees } from 'pdf-lib';
import type { PdfDocumentStructure } from '../types';
import type { ProductionProfile } from '../utils/productionProfiles';

export type DimensionFixStatus = 'eligible' | 'confirmation_required' | 'manual_required' | 'not_needed';
export type DimensionFixAction = 'scale_uniform' | 'rotate_90' | 'none';

export interface DimensionFixEligibilityResult {
  status: DimensionFixStatus;
  reasonCode: string;
  message: string;
  sourceWidthMm: number;
  sourceHeightMm: number;
  targetWidthMm: number;
  targetHeightMm: number;
  scaleX: number;
  scaleY: number;
  uniformScale: number;
  action: DimensionFixAction;
  futureAiCandidate?: boolean;
}

const TOLERANCE_MM = 0.5;
const ASPECT_RATIO_TOLERANCE = 0.02; // 2% ratio deviation allowed for uniform scaling

const mmToPt = (mm: number): number => (mm * 72) / 25.4;
const ptToMm = (pt: number): number => (pt * 25.4) / 72;

/**
 * Evaluates whether a PDF document is eligible for deterministic vector dimension fixing.
 */
export function checkDimensionFixEligibility(
  document: PdfDocumentStructure | null | undefined,
  profile: ProductionProfile | null | undefined
): DimensionFixEligibilityResult {
  const fallbackResult: DimensionFixEligibilityResult = {
    status: 'not_needed',
    reasonCode: 'PROFILE_NO_DIMENSIONS',
    message: 'O perfil selecionado não define dimensões nominais (expectedWidthMm/HeightMm).',
    sourceWidthMm: 0,
    sourceHeightMm: 0,
    targetWidthMm: 0,
    targetHeightMm: 0,
    scaleX: 1,
    scaleY: 1,
    uniformScale: 1,
    action: 'none',
  };

  if (!document || !document.pages || document.pages.length === 0) {
    return {
      ...fallbackResult,
      status: 'manual_required',
      reasonCode: 'EMPTY_DOCUMENT',
      message: 'Documento vazio ou sem páginas válidas.',
    };
  }

  if (!profile || !profile.expectedWidthMm || !profile.expectedHeightMm) {
    return fallbackResult;
  }

  const targetWidthMm = profile.expectedWidthMm;
  const targetHeightMm = profile.expectedHeightMm;
  const page1 = document.pages[0];

  // Check multi-page homogeneity
  if (document.pages.length > 1) {
    const p1W = page1.visualWidthMm || page1.widthMm;
    const p1H = page1.visualHeightMm || page1.heightMm;

    for (let i = 1; i < document.pages.length; i++) {
      const p = document.pages[i];
      const pW = p.visualWidthMm || p.widthMm;
      const pH = p.visualHeightMm || p.heightMm;

      if (Math.abs(pW - p1W) > TOLERANCE_MM || Math.abs(pH - p1H) > TOLERANCE_MM) {
        return {
          status: 'manual_required',
          reasonCode: 'PAGE_SIZE_HETEROGENEOUS',
          message: 'O documento possui páginas com formatos heterogêneos. Ajuste automático uniforme não permitido.',
          sourceWidthMm: p1W,
          sourceHeightMm: p1H,
          targetWidthMm,
          targetHeightMm,
          scaleX: 1,
          scaleY: 1,
          uniformScale: 1,
          action: 'none',
        };
      }
    }
  }

  // Determine source dimensions (use TrimBox if explicit and smaller than MediaBox containing bleed)
  let sourceWidthMm = page1.visualWidthMm || page1.widthMm;
  let sourceHeightMm = page1.visualHeightMm || page1.heightMm;

  if (page1.trimBox?.status === 'explicit' && page1.trimBox.widthMm > 0 && page1.trimBox.heightMm > 0) {
    sourceWidthMm = page1.trimBox.widthMm;
    sourceHeightMm = page1.trimBox.heightMm;
  }

  const scaleX = targetWidthMm / sourceWidthMm;
  const scaleY = targetHeightMm / sourceHeightMm;
  const uniformScale = (scaleX + scaleY) / 2;

  // 1. Check if already compliant within tolerance
  const isWidthCompliant = Math.abs(sourceWidthMm - targetWidthMm) <= TOLERANCE_MM;
  const isHeightCompliant = Math.abs(sourceHeightMm - targetHeightMm) <= TOLERANCE_MM;

  if (isWidthCompliant && isHeightCompliant) {
    return {
      status: 'not_needed',
      reasonCode: 'DIMENSIONS_COMPLIANT',
      message: `Dimensões nominais (${sourceWidthMm.toFixed(1)} × ${sourceHeightMm.toFixed(1)} mm) já estão em conformidade com o perfil (${targetWidthMm} × ${targetHeightMm} mm).`,
      sourceWidthMm,
      sourceHeightMm,
      targetWidthMm,
      targetHeightMm,
      scaleX: 1,
      scaleY: 1,
      uniformScale: 1,
      action: 'none',
    };
  }

  // 2. Check orientation mismatch (90° inverted orientation)
  const isRotatedWidthMatch = Math.abs(sourceWidthMm - targetHeightMm) <= TOLERANCE_MM;
  const isRotatedHeightMatch = Math.abs(sourceHeightMm - targetWidthMm) <= TOLERANCE_MM;

  if (isRotatedWidthMatch && isRotatedHeightMatch) {
    return {
      status: 'confirmation_required',
      reasonCode: 'ORIENTATION_MISMATCH',
      message: `Orientação invertida (${sourceWidthMm.toFixed(1)} × ${sourceHeightMm.toFixed(1)} mm). Requer confirmação para girar 90° para o formato ${targetWidthMm} × ${targetHeightMm} mm.`,
      sourceWidthMm,
      sourceHeightMm,
      targetWidthMm,
      targetHeightMm,
      scaleX: 1,
      scaleY: 1,
      uniformScale: 1,
      action: 'rotate_90',
    };
  }

  // 3. Check aspect ratio compatibility
  const sourceRatio = sourceWidthMm / sourceHeightMm;
  const targetRatio = targetWidthMm / targetHeightMm;
  const ratioDifference = Math.abs(sourceRatio - targetRatio) / targetRatio;

  if (ratioDifference > ASPECT_RATIO_TOLERANCE) {
    return {
      status: 'manual_required',
      reasonCode: 'ASPECT_RATIO_MISMATCH',
      message: `Proporção incompatível (${sourceWidthMm.toFixed(1)} × ${sourceHeightMm.toFixed(1)} mm → ${targetWidthMm} × ${targetHeightMm} mm). Não é seguro redimensionar sem distorcer o conteúdo gráfico.`,
      sourceWidthMm,
      sourceHeightMm,
      targetWidthMm,
      targetHeightMm,
      scaleX,
      scaleY,
      uniformScale,
      action: 'none',
      futureAiCandidate: true,
    };
  }

  // 4. Safe uniform proportional scaling
  return {
    status: 'eligible',
    reasonCode: 'SCALE_UNIFORM_ELIGIBLE',
    message: `Escala proporcional uniforme matematicamente segura (${sourceWidthMm.toFixed(1)} × ${sourceHeightMm.toFixed(1)} mm → ${targetWidthMm} × ${targetHeightMm} mm • fator ${uniformScale.toFixed(2)}×).`,
    sourceWidthMm,
    sourceHeightMm,
    targetWidthMm,
    targetHeightMm,
    scaleX,
    scaleY,
    uniformScale,
    action: 'scale_uniform',
  };
}

/**
 * Applies deterministic vector dimension scaling or rotation on the PDF buffer.
 * Preserves text, vectors, images, transparency, and fonts without rasterization.
 */
export async function applyDimensionFix(
  pdfBuffer: ArrayBuffer | Uint8Array | Buffer,
  profile: ProductionProfile,
  options?: { action?: DimensionFixAction }
): Promise<{
  success: boolean;
  fixedPdfBase64?: string;
  pdfBytes?: Uint8Array;
  error?: string;
  transformedDimensions?: { widthMm: number; heightMm: number };
}> {
  try {
    const uint8 = pdfBuffer instanceof Uint8Array ? pdfBuffer : new Uint8Array(pdfBuffer);
    const pdfDoc = await PDFDocument.load(uint8, { ignoreEncryption: true });
    const pages = pdfDoc.getPages();

    if (pages.length === 0) {
      return { success: false, error: 'Documento PDF sem páginas.' };
    }

    const action = options?.action || 'scale_uniform';

    if (action === 'rotate_90') {
      for (const page of pages) {
        const currentRot = page.getRotation().angle;
        page.setRotation(degrees((currentRot + 90) % 360));
      }
    } else if (action === 'scale_uniform') {
      if (!profile.expectedWidthMm || !profile.expectedHeightMm) {
        return { success: false, error: 'Perfil de produção não define dimensões esperadas.' };
      }

      const targetWidthPt = mmToPt(profile.expectedWidthMm);
      const targetHeightPt = mmToPt(profile.expectedHeightMm);

      for (const page of pages) {
        const { width: currentWidthPt, height: currentHeightPt } = page.getSize();
        const scaleX = targetWidthPt / currentWidthPt;
        const scaleY = targetHeightPt / currentHeightPt;

        page.scaleContent(scaleX, scaleY);
        page.setSize(targetWidthPt, targetHeightPt);

        // Adjust MediaBox
        page.setMediaBox(0, 0, targetWidthPt, targetHeightPt);
      }
    }

    const savedBytes = await pdfDoc.save({ useObjectStreams: false });
    const fixedPdfBase64 = Buffer.from(savedBytes).toString('base64');

    return {
      success: true,
      pdfBytes: savedBytes,
      fixedPdfBase64,
      transformedDimensions: {
        widthMm: profile.expectedWidthMm || 0,
        heightMm: profile.expectedHeightMm || 0,
      },
    };
  } catch (err: any) {
    console.error('Erro na aplicação de DimensionFix:', err);
    return {
      success: false,
      error: err?.message || 'Falha na aplicação do ajuste de dimensões.',
    };
  }
}
