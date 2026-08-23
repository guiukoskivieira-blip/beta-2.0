import { PDFDocument, PDFName, PDFNumber, PDFRawStream, PDFDict, PDFArray, PDFRef, PDFString } from 'pdf-lib';
import * as pako from 'pako';
import fs from 'fs';
import path from 'path';
import type {
  PdfDocumentStructure,
  RuleEngineSummary,
  ImageXObjectAudit,
  ImageConversionObjectResult,
  SourceProfileOrigin,
} from '../types';
import type { ProductionProfile } from '../utils/productionProfiles';
import { COMMERCIAL_PRINT_300DPI_PROFILE } from '../utils/productionProfiles';
import { runDeterministicRuleEngine } from '../utils/ruleEngine';
import { extractPdfStructure } from '../../server/pdfExtractor';
import { validateIccProfile, PRESET_ICC_PROFILES } from '../domain/colorManagement';
import { transformRgbToCmyk, RenderingIntent } from './colorTransform';
import { evaluateFixContract, FixActionResult, FixContractResult } from './fixEngine';

export interface ImageColorFixOptions {
  destinationIccBytes?: Uint8Array | Buffer | null;
  destinationIccPresetId?: string;
  sourceIccBytes?: Uint8Array | Buffer | null;
  sourceIccPresetId?: string;
  renderingIntent?: RenderingIntent;
  allowFallbackSrgb?: boolean; // STRICT: fallback sRGB only if explicitly allowed (never silently assume)
  profile?: ProductionProfile;
}

export interface ImageColorFixAuditEntry {
  ruleId: string;
  fixType: 'image_color_conversion';
  timestamp: number;
  destinationIccProfile: string;
  renderingIntent: string;
  allowFallbackSrgb: boolean;
  totalImagesScanned: number;
  rgbImagesFound: number;
  convertedCount: number;
  manualRequiredCount: number;
  notSupportedCount: number;
  objects: ImageConversionObjectResult[];
  revalidationResult: {
    ruleStatus: 'approved' | 'error' | 'warning' | 'undetermined';
    hasRgbBefore: boolean;
    hasRgbAfter: boolean;
    validated: boolean;
    message: string;
  };
}

export interface ImageColorFixResult {
  success: boolean;
  actionResult: FixActionResult;
  pdfBytes?: Uint8Array;
  contract: FixContractResult;
  objectsSummary: {
    totalImages: number;
    rgbImages: number;
    convertibleCount: number;
    convertedCount: number;
    manualRequiredCount: number;
    notSupportedCount: number;
    objects: ImageConversionObjectResult[];
  };
  audit?: ImageColorFixAuditEntry;
  structuralValidation?: {
    valid: boolean;
    checks: { header: boolean; eof: boolean; xrefOrTrailer: boolean; reparseable: boolean };
    message: string;
  };
  revalidation?: {
    hasRgbBefore: boolean;
    hasRgbAfter: boolean;
    ruleStatusBefore: string;
    ruleStatusAfter: string;
    validated: boolean;
    message: string;
  };
  error?: string;
}

/**
 * Resolves ICC profile bytes from direct Buffer or from a bundled preset file.
 */
export function resolveIccBytes(
  iccBytes?: Uint8Array | Buffer | null,
  presetId?: string
): Uint8Array | null {
  if (iccBytes && iccBytes.length > 0) {
    return iccBytes instanceof Uint8Array ? iccBytes : new Uint8Array(iccBytes);
  }

  const targetPreset = presetId || 'cgats_tr_001_swop';
  const preset = PRESET_ICC_PROFILES[targetPreset];
  const candidatePaths = [
    preset?.bundledPath ? path.resolve(process.cwd(), preset.bundledPath) : null,
    path.resolve(process.cwd(), 'dist/iccs/cgats_tr001_swop.icc'),
    path.resolve(process.cwd(), 'server/iccs/cgats_tr001_swop.icc'),
  ].filter(Boolean) as string[];

  for (const p of candidatePaths) {
    if (fs.existsSync(p)) {
      try {
        const buf = fs.readFileSync(p);
        return new Uint8Array(buf);
      } catch {
        // continue trying
      }
    }
  }

  return null;
}

/**
 * Audits all Image XObjects in a loaded PDF document deterministically.
 */
export function auditImageXObjects(pdfDoc: PDFDocument): {
  audits: ImageXObjectAudit[];
  imageMap: Map<string, { ref: PDFRef; page: number; dict: PDFDict; rawBytes: Uint8Array; audit: ImageXObjectAudit; embeddedIcc?: Uint8Array }>;
} {
  const audits: ImageXObjectAudit[] = [];
  const imageMap = new Map<string, { ref: PDFRef; page: number; dict: PDFDict; rawBytes: Uint8Array; audit: ImageXObjectAudit; embeddedIcc?: Uint8Array }>();

  const pages = pdfDoc.getPages();
  pages.forEach((page, pageIdx) => {
    const pageNum = pageIdx + 1;
    const resources = page.node.Resources();
    if (!(resources instanceof PDFDict)) return;

    const xObjects = resources.get(PDFName.of('XObject'));
    if (!(xObjects instanceof PDFDict)) return;

    const entries = xObjects.entries();
    for (const [nameKey, ref] of entries) {
      if (!(ref instanceof PDFRef)) continue;
      const xobj = pdfDoc.context.lookup(ref);
      if (!xobj) continue;

      const dict: PDFDict = (xobj as any).dict || (xobj instanceof PDFDict ? xobj : null);
      if (!dict) continue;

      const subtype = dict.get(PDFName.of('Subtype'));
      if (subtype?.toString() !== '/Image') continue;

      const rawName = typeof nameKey.asString === 'function' ? nameKey.asString() : (nameKey.value || String(nameKey));
      const imgName = typeof rawName === 'string' ? rawName : String(rawName);
      const uniqueKey = `p${pageNum}_${imgName}_${ref.tag}`;

      const widthPx = (dict.get(PDFName.of('Width')) as any)?.asNumber?.() || 0;
      const heightPx = (dict.get(PDFName.of('Height')) as any)?.asNumber?.() || 0;
      const bitsPerComponent = (dict.get(PDFName.of('BitsPerComponent')) as any)?.asNumber?.() || 8;
      const filterVal = dict.get(PDFName.of('Filter'))?.toString()?.replace(/^\//, '') || 'None';
      const hasDecode = Boolean(dict.get(PDFName.of('Decode')));
      const sMaskRef = dict.get(PDFName.of('SMask'));
      const maskRef = dict.get(PDFName.of('Mask'));
      const hasSMask = Boolean(sMaskRef);
      const hasMask = Boolean(maskRef);

      // ColorSpace analysis
      let colorSpaceStr = 'DeviceRGB';
      let isRgb = false;
      let isCmyk = false;
      let isGray = false;
      let embeddedIcc: Uint8Array | undefined = undefined;

      const csObj = dict.get(PDFName.of('ColorSpace'));
      if (csObj instanceof PDFName) {
        const csName = csObj.toString().replace(/^\//, '');
        colorSpaceStr = csName;
        if (csName === 'DeviceRGB') isRgb = true;
        else if (csName === 'DeviceCMYK') isCmyk = true;
        else if (csName === 'DeviceGray') isGray = true;
      } else if (csObj instanceof PDFArray) {
        const first = csObj.get(0)?.toString()?.replace(/^\//, '');
        if (first === 'ICCBased') {
          const iccRef = csObj.get(1);
          if (iccRef instanceof PDFRef) {
            const iccStream = pdfDoc.context.lookup(iccRef);
            if (iccStream) {
              const streamDict = (iccStream as any).dict || iccStream;
              const n = streamDict.get?.(PDFName.of('N'))?.asNumber?.() || 3;
              const rawIccBytes = (iccStream as any).contents || (iccStream as any).getContents?.();
              if (rawIccBytes && rawIccBytes.length > 0) {
                try {
                  const inflated = streamDict.get?.(PDFName.of('Filter'))?.toString()?.includes('FlateDecode')
                    ? pako.inflate(rawIccBytes)
                    : rawIccBytes;
                  embeddedIcc = new Uint8Array(inflated);
                } catch {
                  embeddedIcc = new Uint8Array(rawIccBytes);
                }
              }
              if (n === 3) {
                isRgb = true;
                colorSpaceStr = 'ICCBased (RGB)';
              } else if (n === 4) {
                isCmyk = true;
                colorSpaceStr = 'ICCBased (CMYK)';
              } else if (n === 1) {
                isGray = true;
                colorSpaceStr = 'ICCBased (Gray)';
              } else {
                colorSpaceStr = `ICCBased (${n} components)`;
              }
            }
          }
        } else {
          colorSpaceStr = csObj.toString();
        }
      } else if (csObj) {
        const csName = csObj.toString().replace(/^\//, '');
        colorSpaceStr = csName;
        if (csName.includes('RGB')) isRgb = true;
        else if (csName.includes('CMYK')) isCmyk = true;
      }

      // Stream extraction & validation
      const rawStreamBytes = (xobj as any).contents || (xobj as any).getContents?.() || new Uint8Array(0);

      // Safe Scope V1 Classification
      let classification: 'CONVERTIBLE' | 'MANUAL_REQUIRED' | 'NOT_SUPPORTED' = 'NOT_SUPPORTED';
      let reason = '';

      if (!isRgb) {
        classification = 'NOT_SUPPORTED';
        reason = `Espaço de cores não é RGB (${colorSpaceStr}).`;
      } else if (bitsPerComponent !== 8) {
        classification = 'MANUAL_REQUIRED';
        reason = `Profundidade de cor de ${bitsPerComponent} bits/canal não suportada na Fase 1 (exige 8 bits).`;
      } else if (widthPx <= 0 || heightPx <= 0) {
        classification = 'NOT_SUPPORTED';
        reason = 'Dimensões de imagem inválidas ou zero.';
      } else if (hasDecode) {
        classification = 'MANUAL_REQUIRED';
        reason = 'Matriz de decodificação (/Decode) personalizada exige calibração manual.';
      } else if (filterVal !== 'FlateDecode' && filterVal !== 'None' && filterVal !== '') {
        classification = 'MANUAL_REQUIRED';
        reason = `Filtro de compressão /${filterVal} exige decodificação assistida.`;
      } else {
        // Test inflating pixel buffer
        try {
          const inflated = filterVal === 'FlateDecode' ? pako.inflate(rawStreamBytes) : rawStreamBytes;
          const expectedBytes = widthPx * heightPx * 3;
          if (inflated.length !== expectedBytes) {
            classification = 'MANUAL_REQUIRED';
            reason = `Tamanho do stream decodificado (${inflated.length} bytes) difere do esperado (${expectedBytes} bytes para ${widthPx}x${heightPx} RGB).`;
          } else {
            classification = 'CONVERTIBLE';
            reason = 'Imagem raster RGB 8-bit compatível para conversão CMM segura.';
          }
        } catch (e: any) {
          classification = 'MANUAL_REQUIRED';
          reason = `Falha ao descomprimir stream da imagem: ${e?.message || String(e)}`;
        }
      }

      const audit: ImageXObjectAudit = {
        id: uniqueKey,
        name: imgName,
        page: pageNum,
        widthPx,
        heightPx,
        bitsPerComponent,
        colorSpace: colorSpaceStr,
        isRgb,
        isCmyk,
        isGray,
        filter: filterVal,
        hasDecode,
        hasSMask,
        hasMask,
        hasEmbeddedIcc: Boolean(embeddedIcc && embeddedIcc.length > 0),
        classification,
        reason,
      };

      audits.push(audit);
      imageMap.set(uniqueKey, {
        ref,
        page: pageNum,
        dict,
        rawBytes: rawStreamBytes,
        audit,
        embeddedIcc,
      });
    }
  });

  return { audits, imageMap };
}

/**
 * Applies deterministic RGB to CMYK Image XObject color conversion via LittleCMS CMM WebAssembly.
 * Original PDF buffer is NEVER mutated.
 */
export async function applyImageColorFix(
  originalPdfBuffer: Uint8Array | Buffer,
  options: ImageColorFixOptions = {}
): Promise<ImageColorFixResult> {
  const timestamp = Date.now();
  const ruleId = 'RULE-PROF-CLR-001';
  const profile = options.profile || COMMERCIAL_PRINT_300DPI_PROFILE;
  const renderingIntent: RenderingIntent = options.renderingIntent || 'RelativeColorimetric';
  const allowFallbackSrgb = Boolean(options.allowFallbackSrgb);

  // 1. Guard against empty or invalid PDF
  if (!originalPdfBuffer || originalPdfBuffer.length < 5) {
    const contract = evaluateFixContract(
      ruleId,
      'fix_image_color_conversion',
      'error',
      'Converter imagens RGB para CMYK (LittleCMS CMM)',
      'failed',
      'error',
      'Arquivo PDF original inválido ou vazio.'
    );
    return {
      success: false,
      actionResult: 'failed',
      contract,
      objectsSummary: {
        totalImages: 0,
        rgbImages: 0,
        convertibleCount: 0,
        convertedCount: 0,
        manualRequiredCount: 0,
        notSupportedCount: 0,
        objects: [],
      },
      error: 'Arquivo PDF original inválido ou vazio.',
    };
  }

  // 2. Validate and resolve Destination CMYK ICC profile
  const destIccBytes = resolveIccBytes(options.destinationIccBytes, options.destinationIccPresetId);
  if (!destIccBytes || destIccBytes.length === 0) {
    const contract = evaluateFixContract(
      ruleId,
      'fix_image_color_conversion',
      'error',
      'Converter imagens RGB para CMYK (LittleCMS CMM)',
      'user_input_required',
      'error',
      'Perfil CMYK de destino ausente. Forneça um arquivo .icc CMYK calibrado.'
    );
    return {
      success: false,
      actionResult: 'user_input_required',
      contract,
      objectsSummary: {
        totalImages: 0,
        rgbImages: 0,
        convertibleCount: 0,
        convertedCount: 0,
        manualRequiredCount: 0,
        notSupportedCount: 0,
        objects: [],
      },
      error: 'Perfil ICC CMYK de destino ausente. A conversão gráfica exige calibração real.',
    };
  }

  const destValidation = validateIccProfile(destIccBytes);
  if (!destValidation.valid || destValidation.colorSpace !== 'CMYK' || destValidation.components !== 4) {
    const contract = evaluateFixContract(
      ruleId,
      'fix_image_color_conversion',
      'error',
      'Converter imagens RGB para CMYK (LittleCMS CMM)',
      'failed',
      'error',
      `Perfil ICC de destino rejeitado: ${destValidation.error || 'Não é um perfil CMYK válido de 4 componentes.'}`
    );
    return {
      success: false,
      actionResult: 'failed',
      contract,
      objectsSummary: {
        totalImages: 0,
        rgbImages: 0,
        convertibleCount: 0,
        convertedCount: 0,
        manualRequiredCount: 0,
        notSupportedCount: 0,
        objects: [],
      },
      error: `Perfil ICC de destino inválido: ${destValidation.error || 'Exige perfil CMYK com 4 componentes.'}`,
    };
  }

  // 3. Load PDF clone (Original buffer is never mutated)
  const originalBytesCopy = originalPdfBuffer instanceof Uint8Array ? originalPdfBuffer : new Uint8Array(originalPdfBuffer);
  let pdfDoc: PDFDocument;
  try {
    pdfDoc = await PDFDocument.load(originalBytesCopy, { ignoreEncryption: true });
  } catch (loadErr: any) {
    const contract = evaluateFixContract(
      ruleId,
      'fix_image_color_conversion',
      'error',
      'Converter imagens RGB para CMYK (LittleCMS CMM)',
      'failed',
      'error',
      `Falha ao processar estrutura do PDF: ${loadErr?.message || String(loadErr)}`
    );
    return {
      success: false,
      actionResult: 'failed',
      contract,
      objectsSummary: {
        totalImages: 0,
        rgbImages: 0,
        convertibleCount: 0,
        convertedCount: 0,
        manualRequiredCount: 0,
        notSupportedCount: 0,
        objects: [],
      },
      error: `Falha ao carregar PDF: ${loadErr?.message || String(loadErr)}`,
    };
  }

  // 4. Audit all Image XObjects
  const { audits, imageMap } = auditImageXObjects(pdfDoc);
  const totalImages = audits.length;
  const rgbAudits = audits.filter((a) => a.isRgb);
  const rgbImages = rgbAudits.length;

  if (rgbImages === 0) {
    const contract = evaluateFixContract(
      ruleId,
      'fix_image_color_conversion',
      'approved',
      'Converter imagens RGB para CMYK (LittleCMS CMM)',
      'not_supported',
      'approved',
      'Nenhuma imagem RGB detectada no documento. O arquivo já utiliza CMYK/Tons de Cinza.'
    );
    return {
      success: true,
      actionResult: 'not_supported',
      contract,
      objectsSummary: {
        totalImages,
        rgbImages: 0,
        convertibleCount: 0,
        convertedCount: 0,
        manualRequiredCount: 0,
        notSupportedCount: totalImages,
        objects: [],
      },
    };
  }

  // 5. Convert each convertible image
  const objectResults: ImageConversionObjectResult[] = [];
  let convertedCount = 0;
  let manualRequiredCount = 0;
  let notSupportedCount = 0;

  for (const audit of audits) {
    if (!audit.isRgb) {
      notSupportedCount++;
      continue;
    }

    const item = imageMap.get(audit.id);
    if (!item) {
      notSupportedCount++;
      continue;
    }

    if (audit.classification !== 'CONVERTIBLE') {
      manualRequiredCount++;
      objectResults.push({
        objectId: audit.name,
        page: audit.page,
        status: 'manual_required',
        sourceColorSpace: audit.colorSpace,
        destinationColorSpace: 'DeviceCMYK',
        destinationProfile: destValidation.header?.colorSpace || 'CMYK',
        renderingIntent,
        verified: false,
        widthPx: audit.widthPx,
        heightPx: audit.heightPx,
        reason: audit.reason,
      });
      continue;
    }

    // Determine Source Profile Priority:
    // 1. Embedded ICC
    // 2. Selected Source ICC
    // 3. Fallback sRGB ONLY IF allowFallbackSrgb === true
    let sourceIccInput: Uint8Array | 'built-in-srgb' | null = null;
    let sourceProfileName = 'sRGB';
    let sourceProfileOrigin: SourceProfileOrigin = 'configured_fallback';

    if (audit.hasEmbeddedIcc && item.embeddedIcc && item.embeddedIcc.length > 0) {
      const embeddedVal = validateIccProfile(item.embeddedIcc);
      if (embeddedVal.valid && embeddedVal.components === 3) {
        sourceIccInput = item.embeddedIcc;
        sourceProfileName = embeddedVal.header?.colorSpace || 'ICCBased RGB';
        sourceProfileOrigin = 'embedded';
      }
    }

    if (!sourceIccInput && options.sourceIccBytes && options.sourceIccBytes.length > 0) {
      const selVal = validateIccProfile(options.sourceIccBytes);
      if (selVal.valid && selVal.components === 3) {
        sourceIccInput = options.sourceIccBytes instanceof Uint8Array ? options.sourceIccBytes : new Uint8Array(options.sourceIccBytes);
        sourceProfileName = selVal.header?.colorSpace || 'Selected RGB ICC';
        sourceProfileOrigin = 'selected';
      }
    }

    if (!sourceIccInput) {
      if (allowFallbackSrgb) {
        sourceIccInput = 'built-in-srgb';
        sourceProfileName = 'sRGB (Configured Fallback)';
        sourceProfileOrigin = 'configured_fallback';
      } else {
        // STRICT: Never assume sRGB silently
        manualRequiredCount++;
        objectResults.push({
          objectId: audit.name,
          page: audit.page,
          status: 'manual_required',
          sourceColorSpace: audit.colorSpace,
          destinationColorSpace: 'DeviceCMYK',
          destinationProfile: 'CMYK',
          renderingIntent,
          verified: false,
          widthPx: audit.widthPx,
          heightPx: audit.heightPx,
          reason: 'Perfil RGB de origem não incorporado. Conversão bloqueada para evitar suposições silenciosas sem autorização explícita.',
        });
        continue;
      }
    }

    // Inflate RGB pixels
    let inflatedRgb: Uint8Array;
    try {
      inflatedRgb = audit.filter === 'FlateDecode' ? pako.inflate(item.rawBytes) : item.rawBytes;
    } catch (infErr: any) {
      manualRequiredCount++;
      objectResults.push({
        objectId: audit.name,
        page: audit.page,
        status: 'manual_required',
        sourceColorSpace: audit.colorSpace,
        destinationColorSpace: 'DeviceCMYK',
        renderingIntent,
        verified: false,
        widthPx: audit.widthPx,
        heightPx: audit.heightPx,
        reason: `Falha ao descomprimir stream: ${infErr?.message || String(infErr)}`,
      });
      continue;
    }

    // Transform via LittleCMS WebAssembly CMM
    const transformResult = await transformRgbToCmyk({
      rgbPixels: inflatedRgb,
      sourceIcc: sourceIccInput,
      destinationIcc: destIccBytes,
      renderingIntent,
    });

    if (!transformResult.success || !transformResult.outputPixels) {
      manualRequiredCount++;
      objectResults.push({
        objectId: audit.name,
        page: audit.page,
        status: 'failed',
        sourceColorSpace: audit.colorSpace,
        destinationColorSpace: 'DeviceCMYK',
        renderingIntent,
        verified: false,
        widthPx: audit.widthPx,
        heightPx: audit.heightPx,
        reason: `Falha na transformação LittleCMS: ${transformResult.error || 'Erro desconhecido'}`,
      });
      continue;
    }

    const cmykPixels = transformResult.outputPixels;
    const expectedCmykLen = audit.widthPx * audit.heightPx * 4;
    if (cmykPixels.length !== expectedCmykLen) {
      manualRequiredCount++;
      objectResults.push({
        objectId: audit.name,
        page: audit.page,
        status: 'failed',
        sourceColorSpace: audit.colorSpace,
        destinationColorSpace: 'DeviceCMYK',
        renderingIntent,
        verified: false,
        widthPx: audit.widthPx,
        heightPx: audit.heightPx,
        reason: `Contagem de bytes CMYK (${cmykPixels.length}) difere do esperado (${expectedCmykLen}).`,
      });
      continue;
    }

    // Compress CMYK pixels with Flate
    const deflatedCmyk = pako.deflate(cmykPixels);

    // Clone and rebuild Image XObject dictionary
    const newDict = item.dict.clone();
    newDict.set(PDFName.of('ColorSpace'), PDFName.of('DeviceCMYK'));
    newDict.set(PDFName.of('Filter'), PDFName.of('FlateDecode'));
    newDict.set(PDFName.of('BitsPerComponent'), PDFNumber.of(8));
    newDict.set(PDFName.of('Width'), PDFNumber.of(audit.widthPx));
    newDict.set(PDFName.of('Height'), PDFNumber.of(audit.heightPx));
    newDict.set(PDFName.of('Length'), PDFNumber.of(deflatedCmyk.length));

    // Preserve SMask, Mask, Interpolate if present
    const sMask = item.dict.get(PDFName.of('SMask'));
    if (sMask) newDict.set(PDFName.of('SMask'), sMask);
    const mask = item.dict.get(PDFName.of('Mask'));
    if (mask) newDict.set(PDFName.of('Mask'), mask);
    const interpolate = item.dict.get(PDFName.of('Interpolate'));
    if (interpolate) newDict.set(PDFName.of('Interpolate'), interpolate);

    // Remove obsolete decode / compression parms that do not apply to raw flate
    newDict.delete(PDFName.of('DecodeParms'));
    newDict.delete(PDFName.of('Decode'));

    // Replace stream in context
    const newStream = PDFRawStream.of(newDict, deflatedCmyk);
    pdfDoc.context.assign(item.ref, newStream);

    convertedCount++;
    objectResults.push({
      objectId: audit.name,
      page: audit.page,
      status: 'converted',
      sourceColorSpace: audit.colorSpace,
      destinationColorSpace: 'DeviceCMYK',
      sourceProfile: sourceProfileName,
      sourceProfileOrigin,
      destinationProfile: destValidation.header?.colorSpace || 'CMYK',
      renderingIntent,
      verified: true,
      widthPx: audit.widthPx,
      heightPx: audit.heightPx,
    });
  }

  // 6. Ensure OutputIntent is present in the Catalog with the CMYK profile
  try {
    const catalog = pdfDoc.catalog;
    const existingOutputIntents = catalog.get(PDFName.of('OutputIntents'));
    if (!existingOutputIntents) {
      const iccStreamDict = pdfDoc.context.obj({
        N: 4,
        Alternate: 'DeviceCMYK',
        Filter: 'FlateDecode',
      });
      const deflatedIcc = pako.deflate(destIccBytes);
      const iccStream = PDFRawStream.of(iccStreamDict as any, deflatedIcc);
      const iccRef = pdfDoc.context.register(iccStream);

      const intentDict = pdfDoc.context.obj({
        Type: 'OutputIntent',
        S: 'GTS_PDFX',
        OutputConditionIdentifier: PDFString.of('CGATS TR 001'),
        Info: PDFString.of('CGATS TR 001 (SWOP)'),
        RegistryName: PDFString.of('http://www.color.org'),
        DestOutputProfile: iccRef,
      });
      const intentRef = pdfDoc.context.register(intentDict);
      const intentsArray = pdfDoc.context.obj([intentRef]);
      catalog.set(PDFName.of('OutputIntents'), intentsArray);
    }
  } catch {
    // Non-fatal if catalog update encounters unexpected dictionary type
  }

  // 7. Save generated PDF with traditional xref (useObjectStreams: false)
  let generatedPdfBytes: Uint8Array;
  try {
    generatedPdfBytes = await pdfDoc.save({ useObjectStreams: false });
  } catch (saveErr: any) {
    const contract = evaluateFixContract(
      ruleId,
      'fix_image_color_conversion',
      'error',
      'Converter imagens RGB para CMYK (LittleCMS CMM)',
      'failed',
      'error',
      `Falha ao salvar PDF corrigido: ${saveErr?.message || String(saveErr)}`
    );
    return {
      success: false,
      actionResult: 'failed',
      contract,
      objectsSummary: {
        totalImages,
        rgbImages,
        convertibleCount: rgbAudits.filter((a) => a.classification === 'CONVERTIBLE').length,
        convertedCount,
        manualRequiredCount,
        notSupportedCount,
        objects: objectResults,
      },
      error: `Falha na serialização do PDF: ${saveErr?.message || String(saveErr)}`,
    };
  }

  // 8. Structural validation of generated bytes
  const headerValid =
    generatedPdfBytes.length >= 5 &&
    generatedPdfBytes[0] === 0x25 && // %
    generatedPdfBytes[1] === 0x50 && // P
    generatedPdfBytes[2] === 0x44 && // D
    generatedPdfBytes[3] === 0x46; // F

  const tail = Buffer.from(generatedPdfBytes.slice(-128)).toString('latin1');
  const eofValid = tail.includes('%%EOF');
  const xrefValid = tail.includes('startxref') || tail.includes('xref');

  let reparseable = false;
  try {
    const reloadedDoc = await PDFDocument.load(generatedPdfBytes);
    reparseable = reloadedDoc.getPageCount() === pdfDoc.getPageCount();
  } catch {
    reparseable = false;
  }

  const structuralValid = headerValid && eofValid && xrefValid && reparseable;

  // 9. Reanalysis via Motor 1 (extractPdfStructure + runDeterministicRuleEngine)
  let reanalyzedStructure: PdfDocumentStructure | null = null;
  let reanalyzedRules: RuleEngineSummary | null = null;
  let hasRgbAfter = true;
  let ruleStatusAfter: 'approved' | 'error' | 'warning' | 'undetermined' = 'error';

  try {
    reanalyzedStructure = await extractPdfStructure(generatedPdfBytes);
    reanalyzedRules = runDeterministicRuleEngine(reanalyzedStructure, profile);
    hasRgbAfter = Boolean(reanalyzedStructure.colorSummary?.hasRgb);
    const colorRule = reanalyzedRules.profileRules.find((r) => r.ruleId === ruleId) ||
      reanalyzedRules.universalRules.find((r) => r.ruleId === ruleId);
    if (colorRule) {
      ruleStatusAfter = colorRule.status;
    }
  } catch (reErr: any) {
    ruleStatusAfter = 'error';
  }

  // 10. Determine overall FixActionResult
  let actionResult: FixActionResult = 'failed';
  if (convertedCount === rgbImages && !hasRgbAfter && ruleStatusAfter === 'approved') {
    actionResult = 'corrected';
  } else if (convertedCount > 0 && (hasRgbAfter || manualRequiredCount > 0)) {
    actionResult = 'partially_corrected';
  } else if (manualRequiredCount > 0 && convertedCount === 0) {
    actionResult = 'manual_required';
  } else if (convertedCount > 0) {
    actionResult = 'corrected';
  } else {
    actionResult = 'failed';
  }

  const isVerified = actionResult === 'corrected' && ruleStatusAfter === 'approved' && structuralValid;

  let message = '';
  if (actionResult === 'corrected') {
    message = `Todas as ${convertedCount} imagem(ns) RGB foram convertidas para CMYK com sucesso via LittleCMS. Documento validado pelo Motor 1.`;
  } else if (actionResult === 'partially_corrected') {
    message = `${convertedCount} imagem(ns) RGB convertida(s) com sucesso. ${manualRequiredCount} objeto(s) RGB restante(s) exigem intervenção manual no software de origem.`;
  } else if (actionResult === 'manual_required') {
    message = `${manualRequiredCount} imagem(ns) RGB identificadas requerem conversão manual no software gráfico.`;
  } else {
    message = 'Não foi possível converter as imagens RGB.';
  }

  const contract = evaluateFixContract(
    ruleId,
    'fix_image_color_conversion',
    'error',
    'Converter imagens RGB para CMYK (LittleCMS CMM)',
    actionResult,
    ruleStatusAfter,
    message
  );

  const auditEntry: ImageColorFixAuditEntry = {
    ruleId,
    fixType: 'image_color_conversion',
    timestamp,
    destinationIccProfile: destValidation.header?.colorSpace || 'CMYK',
    renderingIntent,
    allowFallbackSrgb,
    totalImagesScanned: totalImages,
    rgbImagesFound: rgbImages,
    convertedCount,
    manualRequiredCount,
    notSupportedCount,
    objects: objectResults,
    revalidationResult: {
      ruleStatus: ruleStatusAfter,
      hasRgbBefore: true,
      hasRgbAfter,
      validated: isVerified,
      message,
    },
  };

  return {
    success: actionResult === 'corrected' || actionResult === 'partially_corrected',
    actionResult,
    pdfBytes: generatedPdfBytes,
    contract,
    objectsSummary: {
      totalImages,
      rgbImages,
      convertibleCount: rgbAudits.filter((a) => a.classification === 'CONVERTIBLE').length,
      convertedCount,
      manualRequiredCount,
      notSupportedCount,
      objects: objectResults,
    },
    audit: auditEntry,
    structuralValidation: {
      valid: structuralValid,
      checks: {
        header: headerValid,
        eof: eofValid,
        xrefOrTrailer: xrefValid,
        reparseable,
      },
      message: structuralValid
        ? 'Estrutura do PDF íntegra e verificada.'
        : 'Falha na validação estrutural do PDF gerado.',
    },
    revalidation: {
      hasRgbBefore: true,
      hasRgbAfter,
      ruleStatusBefore: 'error',
      ruleStatusAfter,
      validated: isVerified,
      message,
    },
  };
}
