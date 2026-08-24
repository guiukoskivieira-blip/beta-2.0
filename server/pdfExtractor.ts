import { PDFDocument, PDFName, PDFDict, PDFArray, PDFNumber, PDFStream, PDFRawStream, PDFRef } from 'pdf-lib';
import * as pako from 'pako';
import type {
  PdfDocumentStructure,
  PdfPageStructure,
  PdfFontItem,
  PdfImageOccurrence,
  PdfColorOccurrence,
  PdfBoxInfo,
  PdfOutputIntent,
  PdfIccProfileInfo,
} from '../src/types';
import { validateIccProfile } from '../src/domain/colorManagement';

export class DiagnosticTracker {
  private stages: Record<string, { start: number; end?: number; durationMs: number; metadata?: any }> = {};
  public label: string;

  constructor(label = 'Tracker') {
    this.label = label;
  }

  startStage(name: string, metadata?: any): number {
    const now = performance.now();
    this.stages[name] = { start: now, durationMs: 0, metadata };
    return now;
  }

  endStage(name: string, metadata?: any) {
    if (this.stages[name]) {
      this.stages[name].end = performance.now();
      this.stages[name].durationMs = Number(
        (this.stages[name].end! - this.stages[name].start).toFixed(2)
      );
      if (metadata) {
        this.stages[name].metadata = { ...(this.stages[name].metadata || {}), ...metadata };
      }
    }
  }

  markInstant(name: string, metadata?: any) {
    this.stages[name] = { start: performance.now(), durationMs: 0, metadata };
  }

  getStagesSummary() {
    const summary: Record<string, any> = {};
    for (const [key, val] of Object.entries(this.stages)) {
      summary[key] = { durationMs: val.durationMs, ...val.metadata };
    }
    return summary;
  }

  getMetrics() {
    return this.stages;
  }
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

export function inspectPayload(obj: any): {
  totalSizeBytes: number;
  formattedSize: string;
  largeFields: Array<{ path: string; length: number }>;
  hasRawBuffers: boolean;
} {
  try {
    const json = JSON.stringify(obj);
    const totalSizeBytes = Buffer.byteLength(json, 'utf8');
    const largeFields: Array<{ path: string; length: number }> = [];

    const checkLarge = (val: any, currentPath = '') => {
      if (!val) return;
      if (typeof val === 'string' && val.length > 10000) {
        largeFields.push({ path: currentPath, length: val.length });
      } else if (typeof val === 'object' && !Array.isArray(val)) {
        for (const [k, v] of Object.entries(val)) {
          checkLarge(v, currentPath ? `${currentPath}.${k}` : k);
        }
      }
    };

    checkLarge(obj);

    return {
      totalSizeBytes,
      formattedSize: formatBytes(totalSizeBytes),
      largeFields,
      hasRawBuffers: false,
    };
  } catch {
    return {
      totalSizeBytes: 0,
      formattedSize: '0 B',
      largeFields: [],
      hasRawBuffers: false,
    };
  }
}

const PT_TO_MM = 25.4 / 72.0;

function decodeStream(stream: any): Uint8Array | null {
  if (stream instanceof PDFRawStream) {
    const dict = stream.dict;
    const filter = dict.get(PDFName.of('Filter'));
    const filterStr = filter?.toString() || '';
    const rawBytes = stream.contents;
    if (!rawBytes || rawBytes.length === 0) return null;
    if (filterStr.includes('FlateDecode') || filterStr === '/FlateDecode') {
      try { return pako.inflate(rawBytes); } catch { return null; }
    }
    return rawBytes;
  }
  if (stream instanceof PDFStream) {
    const filter = stream.dict.get(PDFName.of('Filter'));
    const filterStr = filter?.toString() || '';
    const rawBytes = stream.getContents();
    if (!rawBytes || rawBytes.length === 0) return null;
    if (filterStr.includes('FlateDecode') || filterStr === '/FlateDecode') {
      try { return pako.inflate(rawBytes); } catch { return null; }
    }
    return rawBytes;
  }
  return null;
}

interface ImagePlacement {
  name: string;
  xPt: number;
  yPt: number;
  appliedWidthPt: number;
  appliedHeightPt: number;
  ctm: number[];
}

/** Multiplies two 2D affine transformation matrices [a, b, c, d, e, f]. */
export function multiplyAffine(m: number[], c: number[]): [number, number, number, number, number, number] {
  return [
    m[0] * c[0] + m[1] * c[2],
    m[0] * c[1] + m[1] * c[3],
    m[2] * c[0] + m[3] * c[2],
    m[2] * c[1] + m[3] * c[3],
    m[4] * c[0] + m[5] * c[2] + c[4],
    m[4] * c[1] + m[5] * c[3] + c[5],
  ];
}

function parseImagePlacements(contentBytes: Uint8Array): Map<string, ImagePlacement> {
  const placements = new Map<string, ImagePlacement>();
  const text = Buffer.from(contentBytes).toString('latin1');
  const tokens: string[] = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '/' || ch === '(') {
      if (ch === '/') {
        let name = '/';
        i++;
        while (i < text.length && /[A-Za-z0-9_+\-.]/.test(text[i])) { name += text[i]; i++; }
        tokens.push(name);
      } else {
        let str = '(';
        i++;
        let depth = 1;
        while (i < text.length && depth > 0) {
          if (text[i] === '\\') { str += text[i] + (text[i+1] || ''); i += 2; }
          else { if (text[i] === '(') depth++; if (text[i] === ')') depth--; str += text[i]; i++; }
        }
        tokens.push(str);
      }
    } else if (ch === '[') {
      let arr = '[';
      i++;
      while (i < text.length && text[i] !== ']') { arr += text[i]; i++; }
      arr += ']';
      tokens.push(arr); i++;
    } else if (/\s/.test(ch)) {
      i++;
    } else if (/[\d.\-+]/.test(ch)) {
      let num = '';
      while (i < text.length && /[\d.\-+eE]/.test(text[i])) { num += text[i]; i++; }
      if (num && !/[a-zA-Z]/.test(num)) tokens.push(num);
    } else if (/[A-Za-z'"<>{}]/.test(ch)) {
      let op = '';
      while (i < text.length && /[A-Za-z'"<>{}]/.test(text[i])) { op += text[i]; i++; }
      tokens.push(op);
    } else {
      i++;
    }
  }

  let stack: number[] = [];
  let matrixStack: number[][] = [];
  const identity = [1, 0, 0, 1, 0, 0];
  let currentMatrix = [...identity];

  for (let t = 0; t < tokens.length; t++) {
    const tok = tokens[t];
    if (/^-?\d+(\.\d+)?$/.test(tok)) {
      stack.push(parseFloat(tok));
      continue;
    }
    if (tok === 'cm') {
      if (stack.length >= 6) {
        const m = stack.splice(-6);
        currentMatrix = multiplyAffine(m, currentMatrix);
      }
      continue;
    }
    if (tok === 'q') { matrixStack.push([...currentMatrix]); continue; }
    if (tok === 'Q') { currentMatrix = matrixStack.pop() || [...identity]; continue; }
    if (tok === 'Do') {
      if (stack.length === 0 && t > 0) {
        const prev = tokens[t - 1];
        if (prev && prev.startsWith('/')) {
          const name = prev.slice(1);
          const m = currentMatrix;
          if (!placements.has(name)) {
            placements.set(name, {
              name,
              xPt: m[4],
              yPt: m[5],
              appliedWidthPt: Math.hypot(m[0], m[1]),
              appliedHeightPt: Math.hypot(m[2], m[3]),
              ctm: [...m],
            });
          }
        }
      }
      stack = [];
      continue;
    }
    if (tok.length > 0 && /[A-Za-z]/.test(tok[0]) && tok !== 'cm' && tok !== 'q' && tok !== 'Q' && tok !== 'Do') {
      stack = [];
    }
  }

  return placements;
}

function parseActuallyUsedFontNames(contentBytes?: Uint8Array | null): Set<string> {
  const usedFonts = new Set<string>();
  if (!contentBytes || contentBytes.length === 0) return usedFonts;

  const text = Buffer.from(contentBytes).toString('latin1');
  const btEtRegex = /\bBT\b([\s\S]*?)\bET\b/g;
  let blockMatch;

  while ((blockMatch = btEtRegex.exec(text)) !== null) {
    const blockContent = blockMatch[1];
    let currentFont: string | null = null;

    // Tokenize inside BT...ET to track active font at text drawing operations
    const tokenRegex = /(\/([^\s\/\(\)\[\]<>{}%]+)\s+[\d\.\-+]+\s+Tf)|(\bTj\b|\bTJ\b|'|")/g;
    let tokenMatch;

    while ((tokenMatch = tokenRegex.exec(blockContent)) !== null) {
      if (tokenMatch[2]) {
        currentFont = tokenMatch[2];
      } else if (tokenMatch[3]) {
        if (currentFont) {
          usedFonts.add(currentFont);
        }
      }
    }
  }

  return usedFonts;
}

interface GraphicColorState {
  fillColorSpace: string;
  strokeColorSpace: string;
}

export interface VectorColorAnalysis {
  hasRgbVector: boolean;
  hasCmykVector: boolean;
  hasGrayVector: boolean;
  hasSpotVector: boolean;
  operators: string[];
}

export function parseContentStreamVectorColors(
  contentBytes?: Uint8Array | null,
  colorSpaceResources?: any,
  context?: any
): VectorColorAnalysis {
  const result: VectorColorAnalysis = {
    hasRgbVector: false,
    hasCmykVector: false,
    hasGrayVector: false,
    hasSpotVector: false,
    operators: [],
  };

  if (!contentBytes || contentBytes.length === 0) {
    return result;
  }

  const str = Buffer.from(contentBytes).toString('latin1');
  const tokens: string[] = [];
  let i = 0;
  const len = str.length;

  while (i < len) {
    const ch = str[i];
    if (ch === '%') {
      while (i < len && str[i] !== '\r' && str[i] !== '\n') i++;
      continue;
    }
    if (ch === '(') {
      let depth = 1;
      i++;
      while (i < len && depth > 0) {
        if (str[i] === '\\') {
          i += 2;
          continue;
        }
        if (str[i] === '(') depth++;
        else if (str[i] === ')') depth--;
        i++;
      }
      continue;
    }
    if (ch === '<') {
      if (i + 1 < len && str[i + 1] === '<') {
        tokens.push('<<');
        i += 2;
        continue;
      }
      i++;
      while (i < len && str[i] !== '>') i++;
      if (i < len && str[i] === '>') i++;
      continue;
    }
    if (ch === '>') {
      if (i + 1 < len && str[i + 1] === '>') {
        tokens.push('>>');
        i += 2;
        continue;
      }
      i++;
      continue;
    }
    if (/\s/.test(ch) || ch === '[' || ch === ']') {
      if (ch === '[' || ch === ']') tokens.push(ch);
      i++;
      continue;
    }

    let start = i;
    while (
      i < len &&
      !/\s/.test(str[i]) &&
      str[i] !== '(' &&
      str[i] !== '<' &&
      str[i] !== '[' &&
      str[i] !== ']' &&
      str[i] !== '%' &&
      str[i] !== '/'
    ) {
      i++;
    }
    if (start === i && str[i] === '/') {
      i++;
      while (
        i < len &&
        !/\s/.test(str[i]) &&
        str[i] !== '(' &&
        str[i] !== '<' &&
        str[i] !== '[' &&
        str[i] !== ']' &&
        str[i] !== '%' &&
        str[i] !== '/'
      ) {
        i++;
      }
    }
    if (start < i) {
      tokens.push(str.slice(start, i));
    }
  }

  let currentState: GraphicColorState = {
    fillColorSpace: 'DeviceGray',
    strokeColorSpace: 'DeviceGray',
  };
  const stateStack: GraphicColorState[] = [];

  const resolveColorSpace = (name: string): string => {
    const clean = name.replace(/^\//, '');
    if (clean === 'DeviceRGB') return 'DeviceRGB';
    if (clean === 'DeviceCMYK') return 'DeviceCMYK';
    if (clean === 'DeviceGray') return 'DeviceGray';
    if (clean.includes('RGB')) return 'DeviceRGB';
    if (clean.includes('CMYK')) return 'DeviceCMYK';
    if (clean.includes('Gray')) return 'DeviceGray';

    if (colorSpaceResources && typeof colorSpaceResources.get === 'function') {
      const resObj = colorSpaceResources.get(PDFName.of(clean));
      const resolved = context ? context.lookup(resObj) : resObj;
      if (resolved instanceof PDFName) {
        const val = resolved.toString().replace(/^\//, '');
        if (val.includes('RGB')) return 'DeviceRGB';
        if (val.includes('CMYK')) return 'DeviceCMYK';
        if (val.includes('Gray')) return 'DeviceGray';
      } else if (resolved instanceof PDFArray) {
        const first = resolved.get(0)?.toString()?.replace(/^\//, '');
        if (first?.includes('RGB') || first?.includes('CalRGB')) return 'DeviceRGB';
        if (first?.includes('CMYK')) return 'DeviceCMYK';
        if (first?.includes('Gray') || first?.includes('CalGray')) return 'DeviceGray';
        if (first?.includes('Separation') || first?.includes('DeviceN')) return 'Spot';
        if (first?.includes('ICCBased')) {
          const iccRef = resolved.get(1);
          const iccStream = context ? context.lookup(iccRef) : null;
          const streamDict = (iccStream as any)?.dict || iccStream;
          const n = streamDict?.get?.(PDFName.of('N'))?.asNumber?.() || 3;
          if (n === 4) return 'DeviceCMYK';
          if (n === 1) return 'DeviceGray';
          return 'DeviceRGB';
        }
      }
    }
    return clean;
  };

  for (let t = 0; t < tokens.length; t++) {
    const token = tokens[t];

    if (token === 'q') {
      stateStack.push({ ...currentState });
    } else if (token === 'Q') {
      if (stateStack.length > 0) {
        currentState = stateStack.pop()!;
      }
    } else if (token === 'rg') {
      currentState.fillColorSpace = 'DeviceRGB';
      result.hasRgbVector = true;
      result.operators.push('rg');
    } else if (token === 'RG') {
      currentState.strokeColorSpace = 'DeviceRGB';
      result.hasRgbVector = true;
      result.operators.push('RG');
    } else if (token === 'k') {
      currentState.fillColorSpace = 'DeviceCMYK';
      result.hasCmykVector = true;
      result.operators.push('k');
    } else if (token === 'K') {
      currentState.strokeColorSpace = 'DeviceCMYK';
      result.hasCmykVector = true;
      result.operators.push('K');
    } else if (token === 'g') {
      currentState.fillColorSpace = 'DeviceGray';
      result.hasGrayVector = true;
      result.operators.push('g');
    } else if (token === 'G') {
      currentState.strokeColorSpace = 'DeviceGray';
      result.hasGrayVector = true;
      result.operators.push('G');
    } else if (token === 'cs') {
      const prev = tokens[t - 1] || '';
      currentState.fillColorSpace = resolveColorSpace(prev);
    } else if (token === 'CS') {
      const prev = tokens[t - 1] || '';
      currentState.strokeColorSpace = resolveColorSpace(prev);
    } else if (token === 'sc' || token === 'scn') {
      if (currentState.fillColorSpace === 'DeviceRGB') {
        result.hasRgbVector = true;
        result.operators.push(token);
      } else if (currentState.fillColorSpace === 'DeviceCMYK') {
        result.hasCmykVector = true;
        result.operators.push(token);
      } else if (currentState.fillColorSpace === 'DeviceGray') {
        result.hasGrayVector = true;
      } else if (currentState.fillColorSpace === 'Spot') {
        result.hasSpotVector = true;
      }
    } else if (token === 'SC' || token === 'SCN') {
      if (currentState.strokeColorSpace === 'DeviceRGB') {
        result.hasRgbVector = true;
        result.operators.push(token);
      } else if (currentState.strokeColorSpace === 'DeviceCMYK') {
        result.hasCmykVector = true;
        result.operators.push(token);
      } else if (currentState.strokeColorSpace === 'DeviceGray') {
        result.hasGrayVector = true;
      } else if (currentState.strokeColorSpace === 'Spot') {
        result.hasSpotVector = true;
      }
    }
  }

  return result;
}

function parseBox(boxArray: any): PdfBoxInfo | undefined {
  if (!boxArray || !Array.isArray(boxArray) || boxArray.length < 4) return undefined;
  const toNum = (v: any): number => {
    if (typeof v?.asNumber === 'function') return v.asNumber();
    if (typeof v === 'number') return v;
    const n = Number(v);
    return isNaN(n) ? 0 : n;
  };
  const x1 = toNum(boxArray[0]);
  const y1 = toNum(boxArray[1]);
  const x2 = toNum(boxArray[2]);
  const y2 = toNum(boxArray[3]);

  const xPt = Math.min(x1, x2);
  const yPt = Math.min(y1, y2);
  const widthPt = Math.abs(x2 - x1);
  const heightPt = Math.abs(y2 - y1);

  if (widthPt === 0 && heightPt === 0) return undefined;

  return {
    status: 'explicit',
    xPt,
    yPt,
    widthPt,
    heightPt,
    xMm: Number((xPt * PT_TO_MM).toFixed(2)),
    yMm: Number((yPt * PT_TO_MM).toFixed(2)),
    widthMm: Number((widthPt * PT_TO_MM).toFixed(2)),
    heightMm: Number((heightPt * PT_TO_MM).toFixed(2)),
  };
}

function formatPdfBox(box?: PdfBoxInfo): string {
  if (!box) return 'ausente';
  return `[${box.xPt.toFixed(3)}, ${box.yPt.toFixed(3)}, ${(box.xPt + box.widthPt).toFixed(3)}, ${(box.yPt + box.heightPt).toFixed(3)}] pt (${box.widthMm.toFixed(2)} x ${box.heightMm.toFixed(2)} mm)`;
}

export class PdfEncryptedError extends Error {
  readonly code = 'PDF_ENCRYPTED';
  readonly status = 'manual_required';
  constructor(message = 'Este PDF está protegido por senha ou criptografia. Remova a proteção no software de origem e envie novamente.') {
    super(message);
    this.name = 'PdfEncryptedError';
  }
}

export async function extractPdfStructure(pdfBuffer: Uint8Array | Buffer): Promise<PdfDocumentStructure> {
  const started = Date.now();

  let pdfDoc: PDFDocument;
  try {
    pdfDoc = await PDFDocument.load(pdfBuffer);
  } catch (err: any) {
    const msg = err?.message || String(err);
    if (
      msg.includes('is encrypted') ||
      msg.includes('EncryptedPDFError') ||
      err?.name === 'EncryptedPDFError'
    ) {
      throw new PdfEncryptedError();
    }
    throw err;
  }

  // Also verify trailer encryption dictionary
  if (pdfDoc.context.trailerInfo?.Encrypt || (pdfDoc as any).isEncrypted) {
    throw new PdfEncryptedError();
  }

  const rawPages = pdfDoc.getPages();
  const pageCount = rawPages.length;

  let hasGlobalRgb = false;
  let hasGlobalCmyk = false;
  let hasGlobalSpot = false;
  const detectedFamilies = new Set<string>();

  const pages: PdfPageStructure[] = [];
  const fontsMap = new Map<string, PdfFontInfo>();

  for (let pageIdx = 0; pageIdx < pageCount; pageIdx++) {
    const page = rawPages[pageIdx];
    const pageNum = pageIdx + 1;
    const { width: widthPt, height: heightPt } = page.getSize();
    const widthMm = Number((widthPt * PT_TO_MM).toFixed(2));
    const heightMm = Number((heightPt * PT_TO_MM).toFixed(2));
    const rotation = page.getRotation().angle;

    // Visual dimensions after orientation
    const isRotated = rotation === 90 || rotation === 270;
    const visualWidthMm = isRotated ? heightMm : widthMm;
    const visualHeightMm = isRotated ? widthMm : heightMm;
    const orientation = visualWidthMm >= visualHeightMm ? 'landscape' : 'portrait';

    // Page boxes
    const mediaBox = parseBox(page.node.MediaBox()?.asArray()) || {
      status: 'explicit',
      xPt: 0,
      yPt: 0,
      widthPt,
      heightPt,
      xMm: 0,
      yMm: 0,
      widthMm,
      heightMm,
    };

    const trimBox = parseBox(page.node.TrimBox()?.asArray());
    const bleedBox = parseBox(page.node.BleedBox()?.asArray());
    const cropBox = parseBox(page.node.CropBox()?.asArray());

    const colorOccurrences: PdfColorOccurrence[] = [];
    const imageOccurrences: PdfImageOccurrence[] = [];

    // Parse content streams for image coordinates (CTM tracking) and font usage
    let contentBytes: Uint8Array | null = null;
    let imagePlacements = new Map<string, ImagePlacement>();
    try {
      const contents = page.node.Contents();
      if (contents) {
        const contentStreamRefs = contents instanceof PDFArray ? contents.asArray() : [contents];
        if (contentStreamRefs.length > 1) {
          const parts: Uint8Array[] = [];
          for (const ref of contentStreamRefs) {
            const stream = pdfDoc.context.lookup(ref);
            const bytes = decodeStream(stream);
            if (bytes) parts.push(bytes);
          }
          if (parts.length > 0) {
            const total = parts.reduce((acc, p) => acc + p.length, 0);
            const combined = new Uint8Array(total);
            let off = 0;
            for (const p of parts) { combined.set(p, off); off += p.length; }
            contentBytes = combined;
          }
        } else {
          const stream = pdfDoc.context.lookup(contentStreamRefs[0]);
          contentBytes = decodeStream(stream);
        }
        if (contentBytes) {
          imagePlacements = parseImagePlacements(contentBytes);
        }
      }
    } catch {}

    // Extract resources (resolving PDFRef and inheriting from Parent if needed)
    let rawRes = page.node.get(PDFName.of('Resources'));
    let resources = rawRes ? pdfDoc.context.lookup(rawRes) : undefined;
    if (!(resources instanceof PDFDict)) {
      let parent = page.node.Parent ? page.node.Parent() : undefined;
      while (parent && !(resources instanceof PDFDict)) {
        const parentRes = parent.get(PDFName.of('Resources'));
        if (parentRes) {
          resources = pdfDoc.context.lookup(parentRes);
        }
        parent = parent.Parent ? parent.Parent() : undefined;
      }
    }

    let hasTransparency = false;

    // Track vector color operators on this page (rg, RG, k, K, g, G, cs, CS, sc, SC, scn, SCN)
    const pageVectorAnalysis = parseContentStreamVectorColors(
      contentBytes,
      resources?.get?.(PDFName.of('ColorSpace')),
      pdfDoc.context
    );
    let pageHasRgbVector = pageVectorAnalysis.hasRgbVector;
    let pageHasCmykVector = pageVectorAnalysis.hasCmykVector;
    let pageHasGrayVector = pageVectorAnalysis.hasGrayVector;
    let pageHasSpotVector = pageVectorAnalysis.hasSpotVector;

    // Track font resource names actually used by text rendering operators on this page
    const usedFontNamesOnPage = parseActuallyUsedFontNames(contentBytes);

    const processFontsDict = (fontsDictRefOrObj: any, formContentBytes?: Uint8Array) => {
      const fontsDict = pdfDoc.context.lookup(fontsDictRefOrObj);
      if (fontsDict instanceof PDFDict) {
        const formUsedFontNames = parseActuallyUsedFontNames(formContentBytes);

        const fEntries = fontsDict.entries();
        for (const [fName, fRef] of fEntries) {
          const fontObj = pdfDoc.context.lookup(fRef);
          if (fontObj instanceof PDFDict) {
            const rawFName = (typeof fName.asString === 'function' ? fName.asString() : (fName.value || String(fName))).replace(/^\//, '');
            const fontBaseVal = fontObj.get(PDFName.of('BaseFont'));
            const baseFontStr = (fontBaseVal ? String(fontBaseVal) : String(rawFName)).replace(/^\//, '');
            const baseFont: string = baseFontStr;
            const subtype = fontObj.get(PDFName.of('Subtype'))?.toString()?.replace(/^\//, '') || 'Type1';

            let fontDescriptor = fontObj.get(PDFName.of('FontDescriptor'));
            if (!fontDescriptor && (subtype === 'Type0' || subtype === 'CIDFontType0' || subtype === 'CIDFontType2')) {
              const descendant = fontObj.get(PDFName.of('DescendantFonts'));
              if (descendant) {
                const descObj = pdfDoc.context.lookup(descendant);
                if (descObj instanceof PDFArray && descObj.size() > 0) {
                  const cidRef = descObj.get(0);
                  const cidFont = pdfDoc.context.lookup(cidRef);
                  if (cidFont instanceof PDFDict) {
                    fontDescriptor = cidFont.get(PDFName.of('FontDescriptor'));
                  }
                }
              }
            }

            let isEmbedded: 'yes' | 'no' | 'subset' | 'undetermined' = 'no';
            if (fontDescriptor) {
              const fd = pdfDoc.context.lookup(fontDescriptor);
              if (fd instanceof PDFDict) {
                const hasFontFile = fd.get(PDFName.of('FontFile')) || fd.get(PDFName.of('FontFile2')) || fd.get(PDFName.of('FontFile3'));
                if (hasFontFile) {
                  isEmbedded = baseFont.includes('+') ? 'subset' : 'yes';
                } else {
                  isEmbedded = 'no';
                }
              }
            } else if (subtype === 'Type3') {
              isEmbedded = 'yes';
            } else {
              // Base14 standard Type1 font (Helvetica, Times-Roman, Courier, etc.) without FontDescriptor -> NOT embedded
              isEmbedded = 'no';
            }

            const isUsed = usedFontNamesOnPage.has(rawFName) ||
                           usedFontNamesOnPage.has(baseFont) ||
                           formUsedFontNames.has(rawFName) ||
                           formUsedFontNames.has(baseFont);

            if (!fontsMap.has(baseFont)) {
              fontsMap.set(baseFont, {
                id: baseFont,
                baseFont,
                cleanFontName: baseFont.replace(/^[A-Z]{6}\+/, ''),
                subtype,
                isEmbedded,
                isUsedInContent: isUsed,
                usedPages: isUsed ? [pageNum] : [],
                declaredPages: [pageNum],
              });
            } else {
              const existing = fontsMap.get(baseFont)!;
              if (isUsed) {
                existing.isUsedInContent = true;
                if (!existing.usedPages?.includes(pageNum)) {
                  existing.usedPages?.push(pageNum);
                }
              }
              if (!existing.declaredPages?.includes(pageNum)) {
                existing.declaredPages?.push(pageNum);
              }
            }
          }
        }
      }
    };

    if (resources instanceof PDFDict) {
      // Check XObjects (Images and Forms recursively)
      const rawXObjects = resources.get(PDFName.of('XObject'));
      const xObjects = rawXObjects ? pdfDoc.context.lookup(rawXObjects) : undefined;

      const processXObjectsTree = (
        xObjectsRefOrDict: any,
        parentCtm: [number, number, number, number, number, number] | undefined,
        pathPrefix = '',
        visitedRefs = new Set<string>(),
        depth = 0,
        parentPlacements?: Map<string, ImagePlacement>
      ) => {
        if (depth > 20) return;
        const xObjectsDict = pdfDoc.context.lookup(xObjectsRefOrDict);
        if (!(xObjectsDict instanceof PDFDict)) return;

        const entries = xObjectsDict.entries();
        for (const [nameKey, ref] of entries) {
          const refTag = ref instanceof PDFRef ? ref.tag : undefined;
          if (refTag && visitedRefs.has(refTag)) continue;
          const currentVisited = new Set(visitedRefs);
          if (refTag) currentVisited.add(refTag);

          const xobj = pdfDoc.context.lookup(ref);
          if (!xobj) continue;
          const dict: PDFDict = (xobj as any).dict || (xobj instanceof PDFDict ? xobj : null);
          if (!dict) continue;

          const rawName = (typeof nameKey.asString === 'function' ? nameKey.asString() : (nameKey.value || String(nameKey))).replace(/^\//, '');
          const currentPath = pathPrefix ? `${pathPrefix}/${rawName}` : rawName;
          const subtype = dict.get(PDFName.of('Subtype'))?.toString();

          if (subtype === '/Image') {
            const widthPx = dict.get(PDFName.of('Width'))?.asNumber?.() || 100;
            const heightPx = dict.get(PDFName.of('Height'))?.asNumber?.() || 100;
            const bitsPerComponent = dict.get(PDFName.of('BitsPerComponent'))?.asNumber?.() || 8;

            let filterVal = 'None';
            const filterObj = dict.get(PDFName.of('Filter'));
            if (filterObj instanceof PDFName) {
              filterVal = filterObj.toString().replace(/^\//, '');
            } else if (filterObj instanceof PDFArray) {
              const fList: string[] = [];
              for (let fi = 0; fi < filterObj.size(); fi++) {
                const fn = filterObj.get(fi)?.toString()?.replace(/^\//, '');
                if (fn) fList.push(fn);
              }
              filterVal = fList.join('+') || 'None';
            } else if (filterObj) {
              filterVal = filterObj.toString().replace(/^\[|\]$/g, '').replace(/\//g, '').trim().replace(/\s+/g, '+');
            }

            let colorSpace = 'DeviceRGB';
            const csObj = dict.get(PDFName.of('ColorSpace'));
            if (csObj instanceof PDFName) {
              colorSpace = csObj.toString().replace(/^\//, '');
            } else if (csObj instanceof PDFArray) {
              const first = csObj.get(0)?.toString();
              if (first?.includes('ICCBased')) {
                const iccRef = csObj.get(1);
                const iccStream = iccRef ? pdfDoc.context.lookup(iccRef) : null;
                const streamDict: any = (iccStream as any)?.dict || iccStream;
                const n = streamDict?.get?.(PDFName.of('N'))?.asNumber?.() || 3;
                const alt = streamDict?.get?.(PDFName.of('Alternate'))?.toString()?.replace(/^\//, '');
                if (n === 4 || alt?.includes('CMYK')) {
                  colorSpace = 'ICCBased CMYK';
                } else if (n === 1 || alt?.includes('Gray')) {
                  colorSpace = 'ICCBased Gray';
                } else {
                  colorSpace = 'ICCBased RGB';
                }
              } else if (first?.includes('DeviceCMYK')) {
                colorSpace = 'DeviceCMYK';
              } else if (first?.includes('DeviceGray')) {
                colorSpace = 'DeviceGray';
              } else if (first?.includes('Separation') || first?.includes('DeviceN')) {
                colorSpace = 'Spot';
              }
            }

            // Placement resolution
            const placement = parentPlacements?.get(rawName) || (depth === 0 ? imagePlacements.get(rawName) : undefined);
            let imgCtm: [number, number, number, number, number, number] = [1, 0, 0, 1, 0, 0];
            let appliedWidthPt = 0;
            let appliedHeightPt = 0;

            if (parentCtm) {
              if (placement) {
                imgCtm = multiplyAffine(parentCtm, placement.ctm);
                appliedWidthPt = Math.sqrt(imgCtm[0] * imgCtm[0] + imgCtm[1] * imgCtm[1]);
                appliedHeightPt = Math.sqrt(imgCtm[2] * imgCtm[2] + imgCtm[3] * imgCtm[3]);
              } else {
                imgCtm = parentCtm;
                appliedWidthPt = Math.sqrt(imgCtm[0] * imgCtm[0] + imgCtm[1] * imgCtm[1]);
                appliedHeightPt = Math.sqrt(imgCtm[2] * imgCtm[2] + imgCtm[3] * imgCtm[3]);
              }
            } else if (placement) {
              imgCtm = placement.ctm;
              appliedWidthPt = placement.appliedWidthPt;
              appliedHeightPt = placement.appliedHeightPt;
            }

            const dispWidthPt = appliedWidthPt && appliedWidthPt > 0 ? appliedWidthPt : widthPt;
            const dispHeightPt = appliedHeightPt && appliedHeightPt > 0 ? appliedHeightPt : heightPt;
            const displayWidthMm = Number((dispWidthPt * PT_TO_MM).toFixed(2));
            const displayHeightMm = Number((dispHeightPt * PT_TO_MM).toFixed(2));
            const effectiveDpiX = Number(((widthPx / (dispWidthPt / 72.0))).toFixed(1));
            const effectiveDpiY = Number(((heightPx / (dispHeightPt / 72.0))).toFixed(1));

            imageOccurrences.push({
              id: currentPath || `img_${pageNum}_${imageOccurrences.length + 1}`,
              page: pageNum,
              name: currentPath,
              widthPx,
              heightPx,
              bitsPerComponent,
              filter: filterVal,
              displayWidthMm,
              displayHeightMm,
              effectiveDpiX: effectiveDpiX > 0 ? effectiveDpiX : 300,
              effectiveDpiY: effectiveDpiY > 0 ? effectiveDpiY : 300,
              colorSpace,
              appliedWidthPt,
              appliedHeightPt,
              xPt: imgCtm[4],
              yPt: imgCtm[5],
              ctm: imgCtm,
            });

            if (colorSpace.includes('RGB')) {
              hasGlobalRgb = true;
              detectedFamilies.add('DeviceRGB');
            } else if (colorSpace.includes('CMYK')) {
              hasGlobalCmyk = true;
              detectedFamilies.add('DeviceCMYK');
            } else if (colorSpace.includes('Spot')) {
              hasGlobalSpot = true;
              detectedFamilies.add('Spot');
            }
          } else if (subtype === '/Form') {
            const placement = parentPlacements?.get(rawName) || (depth === 0 ? imagePlacements.get(rawName) : undefined);
            const formMatrixObj = dict.get(PDFName.of('Matrix'));
            let formMatrix: [number, number, number, number, number, number] = [1, 0, 0, 1, 0, 0];
            if (formMatrixObj instanceof PDFArray && formMatrixObj.size() >= 6) {
              formMatrix = [
                formMatrixObj.get(0)?.asNumber?.() ?? 1,
                formMatrixObj.get(1)?.asNumber?.() ?? 0,
                formMatrixObj.get(2)?.asNumber?.() ?? 0,
                formMatrixObj.get(3)?.asNumber?.() ?? 1,
                formMatrixObj.get(4)?.asNumber?.() ?? 0,
                formMatrixObj.get(5)?.asNumber?.() ?? 0,
              ];
            }

            let formBytes: Uint8Array | undefined;
            try {
              formBytes = decodeStream(xobj);
            } catch {}

            if (formBytes) {
              const formVectorAnalysis = parseContentStreamVectorColors(
                formBytes,
                dict.get(PDFName.of('Resources')),
                pdfDoc.context
              );
              if (formVectorAnalysis.hasRgbVector) pageHasRgbVector = true;
              if (formVectorAnalysis.hasCmykVector) pageHasCmykVector = true;
              if (formVectorAnalysis.hasSpotVector) pageHasSpotVector = true;
              if (formVectorAnalysis.hasGrayVector) pageHasGrayVector = true;
            }

            let formInnerPlacements = new Map<string, ImagePlacement>();
            if (formBytes) {
              formInnerPlacements = parseImagePlacements(formBytes);
            }

            const baseCtm = parentCtm || [1, 0, 0, 1, 0, 0];
            const placedCtm = placement ? multiplyAffine(baseCtm, placement.ctm) : baseCtm;
            const effectiveFormCtm = multiplyAffine(placedCtm, formMatrix);

            const rawFormRes = dict.get(PDFName.of('Resources'));
            const formResDict = rawFormRes ? pdfDoc.context.lookup(rawFormRes) : undefined;
            if (formResDict instanceof PDFDict) {
              const formFonts = formResDict.get(PDFName.of('Font'));
              if (formFonts) {
                processFontsDict(formFonts, formBytes);
              }

              const rawInnerXObjs = formResDict.get(PDFName.of('XObject'));
              if (rawInnerXObjs) {
                processXObjectsTree(rawInnerXObjs, effectiveFormCtm, currentPath, currentVisited, depth + 1, formInnerPlacements);
              }
            }
          }
        }
      };

      if (xObjects) {
        processXObjectsTree(xObjects, undefined, '', new Set<string>(), 0, imagePlacements);
      }

      // Check Fonts
      const rawFonts = resources.get(PDFName.of('Font'));
      const fontsDict = rawFonts ? pdfDoc.context.lookup(rawFonts) : undefined;
      if (fontsDict) {
        processFontsDict(fontsDict);
      }
    }

    // Page color occurrence resolution
    const pageHasRgbRaster = imageOccurrences.some((i) => i.colorSpace?.includes('RGB'));
    const pageHasRgb = pageHasRgbRaster || pageHasRgbVector;

    if (pageHasRgb) {
      colorOccurrences.push({ page: pageNum, family: 'DeviceRGB', count: 1 });
      hasGlobalRgb = true;
      detectedFamilies.add('DeviceRGB');
    }
    if (pageHasCmykVector || imageOccurrences.some((i) => i.colorSpace?.includes('CMYK'))) {
      colorOccurrences.push({ page: pageNum, family: 'DeviceCMYK', count: 1 });
      hasGlobalCmyk = true;
      detectedFamilies.add('DeviceCMYK');
    }
    if (pageHasSpotVector || imageOccurrences.some((i) => i.colorSpace?.includes('Spot'))) {
      colorOccurrences.push({ page: pageNum, family: 'Spot', count: 1 });
      hasGlobalSpot = true;
      detectedFamilies.add('Spot');
    }
    if (!pageHasRgb && !pageHasCmykVector && !pageHasSpotVector && imageOccurrences.length === 0) {
      colorOccurrences.push({ page: pageNum, family: 'DeviceCMYK', count: 1 });
      hasGlobalCmyk = true;
      detectedFamilies.add('DeviceCMYK');
    }

    pages.push({
      page: pageNum,
      widthPt,
      heightPt,
      widthMm,
      heightMm,
      visualWidthMm,
      visualHeightMm,
      orientation,
      rotation,
      mediaBox,
      trimBox,
      bleedBox,
      cropBox,
      hasTransparency,
      hasRgbRaster: pageHasRgbRaster,
      hasRgbVector: pageHasRgbVector,
      imageOccurrences,
      colorOccurrences,
    });
  }

  // Parse Metadata & PDF/X safely
  let title = '';
  let author = '';
  let creator = '';
  let producer = '';
  let creationDate: string | undefined = undefined;
  let modDate: string | undefined = undefined;

  try { title = pdfDoc.getTitle() || ''; } catch {}
  try { author = pdfDoc.getAuthor() || ''; } catch {}
  try { creator = pdfDoc.getCreator() || ''; } catch {}
  try { producer = pdfDoc.getProducer() || ''; } catch {}
  try { creationDate = pdfDoc.getCreationDate()?.toISOString(); } catch {}
  try { modDate = pdfDoc.getModificationDate()?.toISOString(); } catch {}

  // Parse OutputIntents from Catalog
  const outputIntents: PdfOutputIntent[] = [];
  const iccProfiles: PdfIccProfileInfo[] = [];

  const catalog = pdfDoc.catalog;
  const catalogOutputIntentsRef = catalog.get(PDFName.of('OutputIntents'));
  const catalogOutputIntents = catalogOutputIntentsRef ? pdfDoc.context.lookup(catalogOutputIntentsRef) : undefined;

  if (catalogOutputIntents instanceof PDFArray) {
    for (let oIdx = 0; oIdx < catalogOutputIntents.size(); oIdx++) {
      const intentItemRef = catalogOutputIntents.get(oIdx);
      const intentDict = pdfDoc.context.lookup(intentItemRef);
      if (intentDict instanceof PDFDict) {
        const typeStr = intentDict.get(PDFName.of('Type'))?.toString()?.replace(/^\//, '') || 'OutputIntent';
        const subtypeStr = intentDict.get(PDFName.of('S'))?.toString()?.replace(/^\//, '') || '';

        const rawIdent = intentDict.get(PDFName.of('OutputConditionIdentifier'));
        const outputConditionIdentifier = rawIdent
          ? (typeof (rawIdent as any).value === 'string'
              ? (rawIdent as any).value
              : (rawIdent as any).asString?.() || rawIdent.toString().replace(/^[\/()]/, '').replace(/\)$/, ''))
          : '';

        const rawCond = intentDict.get(PDFName.of('OutputCondition'));
        const outputCondition = rawCond
          ? (typeof (rawCond as any).value === 'string'
              ? (rawCond as any).value
              : (rawCond as any).asString?.() || rawCond.toString().replace(/^[\/()]/, '').replace(/\)$/, ''))
          : undefined;

        const rawReg = intentDict.get(PDFName.of('RegistryName'));
        const registryName = rawReg
          ? (typeof (rawReg as any).value === 'string'
              ? (rawReg as any).value
              : (rawReg as any).asString?.() || rawReg.toString().replace(/^[\/()]/, '').replace(/\)$/, ''))
          : undefined;

        const rawInfo = intentDict.get(PDFName.of('Info'));
        const info = rawInfo
          ? (typeof (rawInfo as any).value === 'string'
              ? (rawInfo as any).value
              : (rawInfo as any).asString?.() || rawInfo.toString().replace(/^[\/()]/, '').replace(/\)$/, ''))
          : undefined;

        let destProfileInfo: PdfIccProfileInfo | undefined = undefined;
        const destProfileRef = intentDict.get(PDFName.of('DestOutputProfile'));
        if (destProfileRef) {
          const profileStream = pdfDoc.context.lookup(destProfileRef);
          if (profileStream) {
            const streamDict = (profileStream as any).dict || profileStream;
            const nVal = streamDict.get(PDFName.of('N'))?.asNumber?.() || 4;
            const alternateVal = streamDict.get(PDFName.of('Alternate'))?.toString()?.replace(/^\//, '');
            const decodedBytes = decodeStream(profileStream);

            if (decodedBytes && decodedBytes.length > 0) {
              const validation = validateIccProfile(decodedBytes);
              destProfileInfo = {
                id: `icc_output_${oIdx + 1}`,
                name: outputConditionIdentifier || validation.header?.colorSpace || 'ICC Profile',
                components: validation.valid ? validation.components : nVal,
                colorSpace: validation.valid ? validation.colorSpace : (alternateVal?.replace('Device', '') || 'CMYK'),
                byteLength: decodedBytes.length,
                sha256: validation.sha256,
                shortSha256: validation.shortSha256,
                isValidIcc: validation.valid,
                version: validation.header?.version,
                deviceClass: validation.header?.deviceClass,
                magicSignature: validation.header?.magicSignature,
                alternate: alternateVal,
              };
              iccProfiles.push(destProfileInfo);
            } else {
              destProfileInfo = {
                id: `icc_output_${oIdx + 1}`,
                name: outputConditionIdentifier || 'ICC Profile',
                components: nVal,
                colorSpace: alternateVal?.replace('Device', '') || 'CMYK',
                byteLength: 0,
                isValidIcc: false,
                alternate: alternateVal,
              };
              iccProfiles.push(destProfileInfo);
            }
          }
        }

        outputIntents.push({
          type: typeStr,
          subtype: subtypeStr,
          outputConditionIdentifier,
          outputCondition,
          registryName,
          info,
          destOutputProfile: destProfileInfo,
          hasDestOutputProfile: Boolean(destProfileInfo && destProfileInfo.byteLength > 0 && destProfileInfo.isValidIcc),
        });
      }
    }
  }

  // Check PDF/X in root catalog / info dict and XMP Metadata
  let isDeclaredPdfX = false;
  let declaredVersion: string | undefined;
  let hasXmpMetadata = false;
  let xmpPdfxVersion: string | undefined;

  const infoDict = pdfDoc.context.lookup(pdfDoc.context.trailerInfo.Info);
  if (infoDict instanceof PDFDict) {
    const gtsVersionObj = infoDict.get(PDFName.of('GTS_PDFXVersion'));
    const gtsConformanceObj = infoDict.get(PDFName.of('GTS_PDFXConformance'));
    if (gtsVersionObj || gtsConformanceObj) {
      isDeclaredPdfX = true;
      const parsePdfValue = (valObj: any): string => {
        if (!valObj) return '';
        if (typeof valObj.asString === 'function') return valObj.asString();
        const raw = String(valObj);
        // Remove enclosing parentheses from PDF string literals: (PDF/X-4) -> PDF/X-4
        if (raw.startsWith('(') && raw.endsWith(')')) {
          return raw.slice(1, -1);
        }
        // Remove leading slash from PDF name objects: /PDF/X-4 -> PDF/X-4
        if (raw.startsWith('/')) {
          return raw.slice(1);
        }
        return raw;
      };
      declaredVersion = parsePdfValue(gtsVersionObj) || parsePdfValue(gtsConformanceObj);
    }
  }

  const catalogMeta = pdfDoc.catalog.get(PDFName.of('Metadata'));
  if (catalogMeta) {
    const metaStream = pdfDoc.context.lookup(catalogMeta);
    if (metaStream) {
      const rawBytes = (metaStream as any).contents || (metaStream as any).getContents?.();
      if (rawBytes && rawBytes.length > 0) {
        hasXmpMetadata = true;
        const xmpStr = Buffer.from(rawBytes).toString('utf-8');
        const match = xmpStr.match(/GTS_PDFXVersion[>="]+([^<"&\s]+)/i);
        if (match && match[1]) {
          xmpPdfxVersion = match[1];
          if (!declaredVersion) {
            isDeclaredPdfX = true;
            declaredVersion = xmpPdfxVersion;
          }
        }
      }
    }
  }

  const gtsIntent = outputIntents.find((oi) => oi.subtype === 'GTS_PDFX' || oi.type === 'OutputIntent');

  return {
    pageCount,
    pages,
    fonts: Array.from(fontsMap.values()),
    outputIntents,
    iccProfiles,
    colorSummary: {
      hasRgb: hasGlobalRgb,
      hasRgbRaster: pages.some((p) => Boolean(p.hasRgbRaster)),
      hasRgbVector: pages.some((p) => Boolean(p.hasRgbVector)),
      hasCmyk: hasGlobalCmyk || (!hasGlobalRgb && !hasGlobalSpot),
      hasSpotColors: hasGlobalSpot,
      familiesDetected: Array.from(detectedFamilies),
    },
    pdfxInfo: {
      isDeclaredPdfX,
      declaredVersion,
      recognizedStandard: declaredVersion || (isDeclaredPdfX ? 'PDF/X' : undefined),
      outputIntentSubtype: gtsIntent?.subtype,
      outputConditionIdentifier: gtsIntent?.outputConditionIdentifier,
      hasDestOutputProfile: gtsIntent?.hasDestOutputProfile,
      hasXmpMetadata,
      xmpPdfxVersion,
    },
    metadata: {
      title,
      author,
      creator,
      producer,
      creationDate,
      modDate,
    },
  };
}
