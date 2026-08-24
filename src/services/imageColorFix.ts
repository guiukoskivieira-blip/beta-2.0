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
import { decodeJpegToRgb } from './jpegDecoder';
import { decodeAscii85, Ascii85DecodeError } from './ascii85';
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
  reasonCode?: string;
  reason?: string;
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
  imageResults?: ImageConversionObjectResult[];
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

export interface RgbConversionSupportResult {
  isSupported: boolean;
  classification: 'CONVERTIBLE' | 'MANUAL_REQUIRED' | 'NOT_SUPPORTED';
  reasonCode: string;
  reason: string;
}

/**
 * Canonical evaluator for RGB -> CMYK Safe Scope V1.2 conversion support.
 * Consumed by Fix Engine, PDF/X Eligibility and Technical Reports.
 */
export function analyzeRgbConversionSupport(img: {
  colorSpace?: string;
  bitsPerComponent?: number;
  widthPx?: number;
  heightPx?: number;
  filter?: string;
  hasDecode?: boolean;
  hasUnsupportedPredictor?: boolean;
  hasMask?: boolean;
  hasSMask?: boolean;
}): RgbConversionSupportResult {
  const colorSpace = img.colorSpace || '';
  const isRgb = colorSpace.includes('RGB');
  if (!isRgb) {
    return {
      isSupported: false,
      classification: 'NOT_SUPPORTED',
      reasonCode: 'NON_RGB_COLORSPACE',
      reason: `Espaço de cores não é RGB (${colorSpace}).`,
    };
  }

  const bpc = img.bitsPerComponent ?? 8;
  if (bpc !== 8) {
    return {
      isSupported: false,
      classification: 'MANUAL_REQUIRED',
      reasonCode: 'UNSUPPORTED_BITS_PER_COMPONENT',
      reason: `Profundidade de cor de ${bpc} bits/canal não suportada na Fase 1 (Safe Scope V1.2 exige 8 bits/canal).`,
    };
  }

  const width = img.widthPx ?? 0;
  const height = img.heightPx ?? 0;
  if (width <= 0 || height <= 0) {
    return {
      isSupported: false,
      classification: 'NOT_SUPPORTED',
      reasonCode: 'INVALID_DIMENSIONS',
      reason: `Dimensões de imagem inválidas ou zero (${width}x${height}).`,
    };
  }

  if (img.hasDecode) {
    return {
      isSupported: false,
      classification: 'MANUAL_REQUIRED',
      reasonCode: 'CUSTOM_DECODE_MATRIX',
      reason: 'Matriz de decodificação (/Decode) personalizada exige calibração manual no software de origem.',
    };
  }

  if (img.hasUnsupportedPredictor) {
    return {
      isSupported: false,
      classification: 'MANUAL_REQUIRED',
      reasonCode: 'UNSUPPORTED_DECODE_PARMS',
      reason: 'Parâmetro de predição em DecodeParms exige decodificação diferencial no software de origem.',
    };
  }

  // Filter normalization
  const rawFilter = img.filter || 'FlateDecode';
  const normalizedFilter = rawFilter
    .replace(/^\[|\]$/g, '')
    .replace(/\//g, '')
    .trim()
    .replace(/\s*,\s*/g, '+')
    .replace(/\s+/g, '+');

  const isSafeFilter =
    normalizedFilter === 'FlateDecode' ||
    normalizedFilter === 'DCTDecode' ||
    normalizedFilter === 'ASCII85Decode+FlateDecode' ||
    normalizedFilter === 'ASCII85Decode' ||
    normalizedFilter === 'None' ||
    normalizedFilter === '';

  if (!isSafeFilter) {
    return {
      isSupported: false,
      classification: 'MANUAL_REQUIRED',
      reasonCode: 'UNSUPPORTED_FILTER',
      reason: `Filtro de compressão /${rawFilter} não suportado no Safe Scope V1.2.`,
    };
  }

  return {
    isSupported: true,
    classification: 'CONVERTIBLE',
    reasonCode: 'CONVERTIBLE',
    reason: 'Imagem raster RGB 8-bit compatível para conversão CMM segura (Safe Scope V1.2).',
  };
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

    const processXObjects = (xObjectsDict: PDFDict, formPrefix = '') => {
      const entries = xObjectsDict.entries();
      for (const [nameKey, ref] of entries) {
        if (!(ref instanceof PDFRef)) continue;
        const xobj = pdfDoc.context.lookup(ref);
        if (!xobj) continue;

        const dict: PDFDict = (xobj as any).dict || (xobj instanceof PDFDict ? xobj : null);
        if (!dict) continue;

        const subtype = dict.get(PDFName.of('Subtype'));
        if (subtype?.toString() === '/Form') {
          const formResources = dict.get(PDFName.of('Resources'));
          if (formResources instanceof PDFDict) {
            const innerXObj = formResources.get(PDFName.of('XObject'));
            if (innerXObj instanceof PDFDict) {
              const rawName = typeof nameKey.asString === 'function' ? nameKey.asString() : (nameKey.value || String(nameKey));
              processXObjects(innerXObj, `${formPrefix}${rawName}/`);
            }
          }
          continue;
        }

        if (subtype?.toString() !== '/Image') continue;

        const rawName = typeof nameKey.asString === 'function' ? nameKey.asString() : (nameKey.value || String(nameKey));
        const imgName = `${formPrefix}${typeof rawName === 'string' ? rawName : String(rawName)}`;
        const uniqueKey = `p${pageNum}_${imgName}_${ref.tag}`;

        const widthPx = (dict.get(PDFName.of('Width')) as any)?.asNumber?.() || 0;
        const heightPx = (dict.get(PDFName.of('Height')) as any)?.asNumber?.() || 0;
        const bitsPerComponent = (dict.get(PDFName.of('BitsPerComponent')) as any)?.asNumber?.() || 8;
        // Filter & DecodeParms extraction
        const filterObj = dict.get(PDFName.of('Filter'));
        const filterList: string[] = [];
        if (filterObj instanceof PDFName) {
          const name = filterObj.toString().replace(/^\//, '');
          if (name) filterList.push(name);
        } else if (filterObj instanceof PDFArray) {
          for (let i = 0; i < filterObj.size(); i++) {
            const item = filterObj.get(i);
            const name = item?.toString()?.replace(/^\//, '');
            if (name) filterList.push(name);
          }
        } else if (filterObj) {
          const str = filterObj.toString().replace(/^\[|\]$/g, '').trim();
          if (str) {
            str.split(/\s+/).forEach((s: string) => {
              const name = s.replace(/^\//, '').replace(/,$/, '');
              if (name) filterList.push(name);
            });
          }
        }
        const filterVal = filterList.length === 0 ? 'None' : filterList.join('+');

        // DecodeParms extraction & validation
        const decodeParmsObj = dict.get(PDFName.of('DecodeParms'));
        let hasUnsupportedPredictor = false;
        let predictorReason = '';
        if (decodeParmsObj) {
          const checkParmsDict = (pDict: any) => {
            if (pDict instanceof PDFDict) {
              const predictor = (pDict.get(PDFName.of('Predictor')) as any)?.asNumber?.();
              if (predictor !== undefined && predictor > 1) {
                hasUnsupportedPredictor = true;
                predictorReason = `Parâmetro de predição /Predictor ${predictor} em DecodeParms exige decodificação diferencial no software de origem.`;
              }
            }
          };
          if (decodeParmsObj instanceof PDFDict) {
            checkParmsDict(decodeParmsObj);
          } else if (decodeParmsObj instanceof PDFArray) {
            for (let i = 0; i < decodeParmsObj.size(); i++) {
              checkParmsDict(decodeParmsObj.get(i));
            }
          }
        }

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

        // Safe Scope V1.2 Classification
        let classification: 'CONVERTIBLE' | 'MANUAL_REQUIRED' | 'NOT_SUPPORTED' = 'NOT_SUPPORTED';
        let reasonCode = 'CONVERTIBLE';
        let reason = '';

        const isAscii85Flate = filterList.length === 2 && filterList[0] === 'ASCII85Decode' && filterList[1] === 'FlateDecode';
        const isDct = filterList.length === 1 && filterList[0] === 'DCTDecode';
        const isFlate = filterList.length === 1 && filterList[0] === 'FlateDecode';
        const isNone = filterList.length === 0 || (filterList.length === 1 && (filterList[0] === 'None' || filterList[0] === ''));

        if (!isRgb) {
          classification = 'NOT_SUPPORTED';
          reasonCode = 'NON_RGB_COLORSPACE';
          reason = `Espaço de cores não é RGB (${colorSpaceStr}).`;
        } else if (bitsPerComponent !== 8) {
          classification = 'MANUAL_REQUIRED';
          reasonCode = 'UNSUPPORTED_BITS_PER_COMPONENT';
          reason = `Profundidade de cor de ${bitsPerComponent} bits/canal não suportada na Fase 1 (Safe Scope V1.2 exige 8 bits/canal).`;
        } else if (widthPx <= 0 || heightPx <= 0) {
          classification = 'NOT_SUPPORTED';
          reasonCode = 'INVALID_DIMENSIONS';
          reason = `Dimensões de imagem inválidas ou zero (${widthPx}x${heightPx}).`;
        } else if (hasDecode) {
          classification = 'MANUAL_REQUIRED';
          reasonCode = 'CUSTOM_DECODE_MATRIX';
          reason = 'Matriz de decodificação (/Decode) personalizada exige calibração manual no software de origem.';
        } else if (hasUnsupportedPredictor) {
          classification = 'MANUAL_REQUIRED';
          reasonCode = 'UNSUPPORTED_DECODE_PARMS';
          reason = predictorReason;
        } else if (isDct) {
          // Safe Scope V1.1: Support DCTDecode (JPEG) RGB images
          try {
            const decoded = decodeJpegToRgb(rawStreamBytes);
            if (decoded.width !== widthPx || decoded.height !== heightPx) {
              classification = 'MANUAL_REQUIRED';
              reasonCode = 'DIMENSION_MISMATCH';
              reason = `Dimensões no cabeçalho JPEG (${decoded.width}x${decoded.height}) divergem do dicionário PDF (${widthPx}x${heightPx}).`;
            } else if (decoded.components !== 3) {
              classification = 'MANUAL_REQUIRED';
              reasonCode = 'NON_RGB_JPEG';
              reason = `Imagem JPEG possui ${decoded.components} canal(is) (esperado 3 canais RGB).`;
            } else {
              classification = 'CONVERTIBLE';
              reasonCode = 'CONVERTIBLE';
              reason = 'Imagem raster RGB 8-bit comprimida em DCTDecode/JPEG compatível para conversão CMM segura (Safe Scope V1.2).';
            }
          } catch (jpegErr: any) {
            classification = 'MANUAL_REQUIRED';
            reasonCode = 'CORRUPTED_JPEG';
            reason = `Falha na decodificação do stream JPEG: ${jpegErr?.message || String(jpegErr)}`;
          }
        } else if (isAscii85Flate) {
          // Safe Scope V1.2: Support [/ASCII85Decode /FlateDecode] filter chain
          try {
            let asciiDecoded: Uint8Array;
            try {
              asciiDecoded = decodeAscii85(rawStreamBytes);
            } catch (a85Err: any) {
              classification = 'MANUAL_REQUIRED';
              reasonCode = 'ASCII85_DECODE_FAILED';
              reason = `Falha na decodificação ASCII85: ${a85Err?.message || String(a85Err)}`;
            }

            if (classification !== 'MANUAL_REQUIRED') {
              let inflated: Uint8Array;
              try {
                inflated = pako.inflate(asciiDecoded!);
              } catch (infErr: any) {
                classification = 'MANUAL_REQUIRED';
                reasonCode = 'DECOMPRESS_FAILED';
                reason = `Falha na descompressão FlateDecode: ${infErr?.message || String(infErr)}`;
              }

              if (classification !== 'MANUAL_REQUIRED') {
                const expectedBytes = widthPx * heightPx * 3;
                if (inflated!.length !== expectedBytes) {
                  classification = 'MANUAL_REQUIRED';
                  reasonCode = 'STREAM_LENGTH_MISMATCH';
                  reason = `Comprimento descompactado (${inflated!.length} bytes) difere do esperado (${expectedBytes} bytes para ${widthPx}x${heightPx} RGB).`;
                } else {
                  classification = 'CONVERTIBLE';
                  reasonCode = 'CONVERTIBLE';
                  reason = 'Imagem raster RGB 8-bit com cadeia [/ASCII85Decode /FlateDecode] compatível para conversão CMM segura (Safe Scope V1.2).';
                }
              }
            }
          } catch (chainErr: any) {
            classification = 'MANUAL_REQUIRED';
            reasonCode = 'DECODE_CHAIN_FAILED';
            reason = `Falha no processamento da cadeia de filtros: ${chainErr?.message || String(chainErr)}`;
          }
        } else if (isFlate || isNone) {
          // Safe Scope V1.0: FlateDecode or uncompressed raster
          try {
            const inflated = isFlate ? pako.inflate(rawStreamBytes) : rawStreamBytes;
            const expectedBytes = widthPx * heightPx * 3;
            if (inflated.length !== expectedBytes) {
              classification = 'MANUAL_REQUIRED';
              reasonCode = 'STREAM_LENGTH_MISMATCH';
              reason = `Comprimento descompactado (${inflated.length} bytes) difere do esperado (${expectedBytes} bytes para ${widthPx}x${heightPx} RGB).`;
            } else {
              classification = 'CONVERTIBLE';
              reasonCode = 'CONVERTIBLE';
              reason = 'Imagem raster RGB 8-bit compatível para conversão CMM segura (Safe Scope V1.2).';
            }
          } catch (infErr: any) {
            classification = 'MANUAL_REQUIRED';
            reasonCode = 'DECOMPRESS_FAILED';
            reason = `Falha na descompressão FlateDecode do stream: ${infErr?.message || String(infErr)}`;
          }
        } else {
          classification = 'MANUAL_REQUIRED';
          reasonCode = 'UNSUPPORTED_FILTER';
          reason = `Filtro de compressão /${filterVal} não suportado no Safe Scope V1.2.`;
        }

        const auditEntry: ImageXObjectAudit = {
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
          reasonCode,
          reason,
        };

        audits.push(auditEntry);
        imageMap.set(uniqueKey, {
          ref,
          page: pageNum,
          dict,
          rawBytes: rawStreamBytes,
          audit: auditEntry,
          embeddedIcc,
        });
      }
    };

    const xObjects = resources.get(PDFName.of('XObject'));
    if (xObjects instanceof PDFDict) {
      processXObjects(xObjects);
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
        reasonCode: audit.reasonCode || 'MANUAL_REQUIRED',
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
          reasonCode: 'SOURCE_PROFILE_MISSING',
          reason: 'Perfil RGB de origem não incorporado. Conversão bloqueada para evitar suposições silenciosas sem autorização explícita.',
        });
        continue;
      }
    }

    // Decode RGB pixels according to filter (ASCII85+Flate / DCTDecode / FlateDecode / raw)
    let rawRgbPixels: Uint8Array;
    try {
      if (audit.filter === 'ASCII85Decode+FlateDecode') {
        let asciiDecoded: Uint8Array;
        try {
          asciiDecoded = decodeAscii85(item.rawBytes);
        } catch (a85Err: any) {
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
            reasonCode: 'ASCII85_DECODE_FAILED',
            reason: `Falha na decodificação ASCII85: ${a85Err?.message || String(a85Err)}`,
          });
          continue;
        }
        try {
          rawRgbPixels = pako.inflate(asciiDecoded);
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
            reasonCode: 'DECOMPRESS_FAILED',
            reason: `Falha na descompressão FlateDecode: ${infErr?.message || String(infErr)}`,
          });
          continue;
        }
      } else if (audit.filter === 'DCTDecode') {
        const decoded = decodeJpegToRgb(item.rawBytes);
        rawRgbPixels = decoded.data;
      } else if (audit.filter === 'FlateDecode') {
        rawRgbPixels = pako.inflate(item.rawBytes);
      } else {
        rawRgbPixels = item.rawBytes;
      }

      const expectedBytes = audit.widthPx * audit.heightPx * 3;
      if (rawRgbPixels.length !== expectedBytes) {
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
          reasonCode: 'PIXEL_LENGTH_MISMATCH',
          reason: `Contagem de bytes RGB (${rawRgbPixels.length}) difere do esperado (${expectedBytes}).`,
        });
        continue;
      }
    } catch (decodeErr: any) {
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
        reasonCode: audit.filter === 'DCTDecode' ? 'CORRUPTED_JPEG' : 'DECOMPRESS_STREAM_FAILED',
        reason: `Falha ao decodificar stream da imagem: ${decodeErr?.message || String(decodeErr)}`,
      });
      continue;
    }

    // Transform via LittleCMS WebAssembly CMM
    const transformResult = await transformRgbToCmyk({
      rgbPixels: rawRgbPixels,
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
        reasonCode: 'CMM_TRANSFORM_FAILED',
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
        reasonCode: 'PIXEL_LENGTH_MISMATCH',
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

  // 6. Preserve existing OutputIntent if present (do not invent PDF/X compliance)

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
  let reasonCode: string | undefined = undefined;
  let reason: string | undefined = undefined;

  if (convertedCount === rgbImages && !hasRgbAfter && ruleStatusAfter === 'approved') {
    actionResult = 'corrected';
    reasonCode = 'ALL_IMAGES_CONVERTED';
    reason = `Todas as ${convertedCount} imagem(ns) RGB foram convertidas para CMYK com sucesso via LittleCMS. Documento validado pelo Motor 1.`;
  } else if (convertedCount > 0 && (hasRgbAfter || manualRequiredCount > 0)) {
    actionResult = 'partially_corrected';
    const firstManual = objectResults.find((o) => o.status === 'manual_required' || o.status === 'failed');
    reasonCode = firstManual?.reasonCode || 'PARTIAL_CONVERSION';
    reason = `${convertedCount} imagem(ns) RGB convertida(s) com sucesso. ${manualRequiredCount} objeto(s) RGB restante(s) exigem intervenção manual (${firstManual?.reason || 'veja detalhes'}).`;
  } else if (manualRequiredCount > 0 && convertedCount === 0) {
    actionResult = 'manual_required';
    const firstManual = objectResults.find((o) => o.status === 'manual_required' || o.status === 'failed');
    reasonCode = firstManual?.reasonCode || 'MANUAL_REQUIRED';
    reason = firstManual?.reason || `${manualRequiredCount} imagem(ns) RGB identificadas requerem conversão manual no software gráfico.`;
  } else if (convertedCount > 0) {
    actionResult = 'corrected';
    reasonCode = 'ALL_IMAGES_CONVERTED';
    reason = `Todas as ${convertedCount} imagem(ns) RGB convertidas com sucesso.`;
  } else {
    actionResult = 'failed';
    reasonCode = 'CONVERSION_FAILED';
    reason = 'Não foi possível converter as imagens RGB.';
  }

  const isVerified = actionResult === 'corrected' && ruleStatusAfter === 'approved' && structuralValid;
  const message = reason;

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
    reasonCode,
    reason,
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
    imageResults: objectResults,
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
