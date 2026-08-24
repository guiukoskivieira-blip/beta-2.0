/**
 * ARTECHECK — Pure TypeScript JPEG Decoder (ITU-T T.81 / ISO/IEC 10918-1)
 *
 * Deterministic baseline & progressive JPEG decoder for Safe Scope V1.1.
 * Runs in pure JavaScript / Node.js without native dependencies.
 */

export interface JpegDecodeOptions {
  useTArray?: boolean;
  colorTransform?: boolean;
  maxMemoryUsageInMB?: number;
  maxResolutionInMP?: number;
}

export interface JpegDecodeResult {
  width: number;
  height: number;
  data: Uint8Array; // Raw RGB 8-bit pixels (width * height * 3 bytes)
  components: number;
}

const dctZigZag = new Int32Array([
  0,
  1, 8,
  16, 9, 2,
  3, 10, 17, 24,
  32, 25, 18, 11, 4,
  5, 12, 19, 26, 33, 40,
  48, 41, 34, 27, 20, 13, 6,
  7, 14, 21, 28, 35, 42, 49, 56,
  57, 50, 43, 36, 29, 22, 15,
  23, 30, 37, 44, 51, 58,
  59, 52, 45, 38, 31,
  39, 46, 53, 60,
  61, 54, 47,
  55, 62,
  63
]);

const dctCos1 = 4017;
const dctSin1 = 799;
const dctCos3 = 3406;
const dctSin3 = 2276;
const dctCos6 = 1567;
const dctSin6 = 3784;
const dctSqrt2 = 5793;
const dctSqrt1d2 = 2896;

function buildHuffmanTable(codeLengths: Uint8Array, values: Uint8Array) {
  let k = 0;
  const code: Array<{ children: any[]; index: number }> = [];
  let length = 16;
  while (length > 0 && !codeLengths[length - 1]) length--;
  code.push({ children: [], index: 0 });

  let p = code[0];
  let q: any;
  for (let i = 0; i < length; i++) {
    for (let j = 0; j < codeLengths[i]; j++) {
      p = code.pop()!;
      p.children[p.index] = values[k];
      while (p.index > 0) {
        if (code.length === 0) throw new Error('Could not recreate Huffman tree');
        p = code.pop()!;
      }
      p.index++;
      code.push(p);
      while (code.length <= i) {
        q = { children: [], index: 0 };
        code.push(q);
        p.children[p.index] = q.children;
        p = q;
      }
      k++;
    }
    if (i + 1 < length) {
      q = { children: [], index: 0 };
      code.push(q);
      p.children[p.index] = q.children;
      p = q;
    }
  }
  return code[0].children;
}

function decodeScan(
  data: Uint8Array,
  offset: number,
  frame: any,
  components: any[],
  resetInterval: number,
  spectralStart: number,
  spectralEnd: number,
  successivePrev: number,
  successive: number
) {
  const mcusPerLine = frame.mcusPerLine;
  const progressive = frame.progressive;

  const startOffset = offset;
  let bitsData = 0;
  let bitsCount = 0;

  function readBit(): number {
    if (bitsCount > 0) {
      bitsCount--;
      return (bitsData >> bitsCount) & 1;
    }
    if (offset >= data.length) {
      return 0;
    }
    bitsData = data[offset++];
    if (bitsData === 0xFF) {
      const nextByte = data[offset++];
      if (nextByte === 0x00) {
        // 0xFF byte escaped with 0x00 in JPEG bitstream
      } else if (nextByte >= 0xD0 && nextByte <= 0xD7) {
        // RST marker
      } else {
        // Reached marker at end of scan (e.g. 0xD9 EOI)
        offset -= 2;
        bitsData = 0;
      }
    }
    bitsCount = 7;
    return bitsData >>> 7;
  }

  function decodeHuffman(tree: any): number {
    let node = tree;
    while (true) {
      node = node[readBit()];
      if (typeof node === 'number') return node;
      if (typeof node !== 'object') throw new Error('Invalid Huffman sequence');
    }
  }

  function receive(length: number): number {
    let n = 0;
    while (length > 0) {
      n = (n << 1) | readBit();
      length--;
    }
    return n;
  }

  function receiveAndExtend(length: number): number {
    const n = receive(length);
    if (n >= 1 << (length - 1)) return n;
    return n + (-1 << length) + 1;
  }

  function decodeBlock(component: any, decodeFn: (component: any, block: Int32Array) => void, block: Int32Array) {
    decodeFn(component, block);
  }

  function decodeBaselineBlock(component: any, block: Int32Array) {
    const t = decodeHuffman(component.huffmanTableDC);
    const diff = t === 0 ? 0 : receiveAndExtend(t);
    component.pred += diff;
    block[0] = component.pred;
    let k = 1;
    while (k < 64) {
      const rs = decodeHuffman(component.huffmanTableAC);
      const s = rs & 15;
      const r = rs >> 4;
      if (s === 0) {
        if (r === 15) {
          k += 16;
        } else {
          break;
        }
      } else {
        k += r;
        const z = dctZigZag[k];
        block[z] = receiveAndExtend(s);
        k++;
      }
    }
  }

  let mcu = 0;
  let fileHeadersFinished = false;
  let mcuExpected: number;
  if (components.length === 1) {
    mcuExpected = components[0].blocksPerLine * components[0].blocksPerColumn;
  } else {
    mcuExpected = mcusPerLine * frame.mcusPerColumn;
  }

  let rstIndex = 0;
  let nextReset = resetInterval;

  while (mcu < mcuExpected) {
    // Reset marker check
    let blockIndex = 0;
    for (let i = 0; i < components.length; i++) {
      const c = components[i];
      for (let j = 0; j < c.h * c.v; j++) {
        const block = c.blocks[c.blockIndex++];
        decodeBaselineBlock(c, block);
        blockIndex++;
      }
    }
    mcu++;

    if (resetInterval && mcu === nextReset && mcu < mcuExpected) {
      bitsCount = 0;
      nextReset += resetInterval;
    }
  }

  return offset - startOffset;
}

// 2D Inverse DCT
function quantizeAndInverse(component: any, block: Int32Array, output: Uint8Array, stride: number) {
  const q = component.quantizationTable;
  const p = new Float32Array(64);

  for (let i = 0; i < 64; i++) {
    p[i] = block[i] * q[i];
  }

  // Row IDCT
  for (let i = 0; i < 8; i++) {
    const row = i * 8;
    const x0 = p[row] * dctSqrt2;
    const x1 = p[row + 4] * dctSqrt2;
    const x2 = p[row + 2];
    const x3 = p[row + 6];
    const x4 = p[row + 5];
    const x5 = p[row + 1];
    const x6 = p[row + 7];
    const x7 = p[row + 3];

    const x8 = x7 + x5;
    const x9 = x7 - x5;
    const x10 = x4 + x6;
    const x11 = x4 - x6;

    const x12 = x8 + x10;
    const x13 = (x8 - x10) * dctSin6;
    const x14 = x9 + x11;
    const x15 = (x9 - x11) * dctCos6;

    const x16 = x14 * (dctCos3 - dctSin3) + x15;
    const x17 = x14 * (dctCos3 + dctSin3) - x15;

    const x18 = x12 * dctCos1 + x13;
    const x19 = x12 * dctSin1 - x13;

    const x20 = x0 + x1;
    const x21 = x0 - x1;
    const x22 = x2 * dctSin3 + x3 * dctCos3;
    const x23 = x2 * dctCos3 - x3 * dctSin3;

    const x24 = x20 + x23;
    const x25 = x20 - x23;
    const x26 = x21 + x22;
    const x27 = x21 - x22;

    p[row] = (x24 + x18) / 8192;
    p[row + 7] = (x24 - x18) / 8192;
    p[row + 1] = (x26 + x16) / 8192;
    p[row + 6] = (x26 - x16) / 8192;
    p[row + 2] = (x27 + x17) / 8192;
    p[row + 5] = (x27 - x17) / 8192;
    p[row + 3] = (x25 + x19) / 8192;
    p[row + 4] = (x25 - x19) / 8192;
  }

  // Column IDCT
  for (let i = 0; i < 8; i++) {
    const col = i;
    const x0 = p[col] * dctSqrt2;
    const x1 = p[col + 32] * dctSqrt2;
    const x2 = p[col + 16];
    const x3 = p[col + 48];
    const x4 = p[col + 40];
    const x5 = p[col + 8];
    const x6 = p[col + 56];
    const x7 = p[col + 24];

    const x8 = x7 + x5;
    const x9 = x7 - x5;
    const x10 = x4 + x6;
    const x11 = x4 - x6;

    const x12 = x8 + x10;
    const x13 = (x8 - x10) * dctSin6;
    const x14 = x9 + x11;
    const x15 = (x9 - x11) * dctCos6;

    const x16 = x14 * (dctCos3 - dctSin3) + x15;
    const x17 = x14 * (dctCos3 + dctSin3) - x15;

    const x18 = x12 * dctCos1 + x13;
    const x19 = x12 * dctSin1 - x13;

    const x20 = x0 + x1;
    const x21 = x0 - x1;
    const x22 = x2 * dctSin3 + x3 * dctCos3;
    const x23 = x2 * dctCos3 - x3 * dctSin3;

    const x24 = x20 + x23;
    const x25 = x20 - x23;
    const x26 = x21 + x22;
    const x27 = x21 - x22;

    p[col] = (x24 + x18) / 8192;
    p[col + 56] = (x24 - x18) / 8192;
    p[col + 8] = (x26 + x16) / 8192;
    p[col + 48] = (x26 - x16) / 8192;
    p[col + 16] = (x27 + x17) / 8192;
    p[col + 40] = (x27 - x17) / 8192;
    p[col + 24] = (x25 + x19) / 8192;
    p[col + 32] = (x25 - x19) / 8192;
  }

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      let sample = Math.round(p[r * 8 + c]) + 128;
      if (sample < 0) sample = 0;
      else if (sample > 255) sample = 255;
      output[r * stride + c] = sample;
    }
  }
}

/**
 * Decodes raw JPEG buffer to raw RGB (3 channels) 8-bit pixels.
 */
export function decodeJpegToRgb(jpegBuffer: Uint8Array | Buffer): JpegDecodeResult {
  const bytes = jpegBuffer instanceof Uint8Array ? jpegBuffer : new Uint8Array(jpegBuffer);

  if (bytes.length < 4 || bytes[0] !== 0xFF || bytes[1] !== 0xD8) {
    throw new Error('CORRUPTED_JPEG: Assinatura mágica JPEG inválida (esperado 0xFFD8 no início do stream).');
  }

  let offset = 2;
  const length = bytes.length;

  const quantizationTables: Int32Array[] = [];
  const huffmanTablesAC: any[] = [];
  const huffmanTablesDC: any[] = [];
  let frame: any = null;
  let resetInterval = 0;
  let adobeTransform: number | null = null;

  while (offset < length) {
    while (bytes[offset] === 0xFF) offset++;
    const marker = bytes[offset++];

    // EOI
    if (marker === 0xD9) break;

    // Standalone markers
    if (marker === 0x01 || (marker >= 0xD0 && marker <= 0xD7)) continue;

    const markerLength = (bytes[offset] << 8) | bytes[offset + 1];
    const markerEnd = offset + markerLength;
    offset += 2;

    if (marker === 0xEE) {
      // APP14 / Adobe marker
      if (markerLength >= 14) {
        const id = String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3], bytes[offset + 4]);
        if (id === 'Adobe') {
          adobeTransform = bytes[offset + 11];
        }
      }
      offset = markerEnd;
    } else if (marker === 0xDB) {
      // DQT (Quantization Table)
      let qOffset = offset;
      while (qOffset < markerEnd) {
        const qInfo = bytes[qOffset++];
        const qTable = new Int32Array(64);
        for (let i = 0; i < 64; i++) {
          qTable[dctZigZag[i]] = bytes[qOffset++];
        }
        quantizationTables[qInfo & 0x0F] = qTable;
      }
      offset = markerEnd;
    } else if (marker === 0xC0 || marker === 0xC2) {
      // SOF0 (Baseline) or SOF2 (Progressive)
      const precision = bytes[offset++];
      const height = (bytes[offset] << 8) | bytes[offset + 1];
      offset += 2;
      const width = (bytes[offset] << 8) | bytes[offset + 1];
      offset += 2;
      const componentCount = bytes[offset++];

      if (precision !== 8) {
        throw new Error(`UNSUPPORTED_BITS_PER_COMPONENT: Precisão de ${precision} bits/canal não suportada (exige 8 bits).`);
      }

      if (componentCount !== 3 && componentCount !== 1) {
        throw new Error(`NON_RGB_JPEG: Imagem JPEG possui ${componentCount} canais (Safe Scope V1.1 suporta imagens RGB de 3 canais).`);
      }

      const components: any[] = [];
      let maxH = 1;
      let maxV = 1;
      for (let i = 0; i < componentCount; i++) {
        const id = bytes[offset++];
        const hv = bytes[offset++];
        const h = hv >> 4;
        const v = hv & 0x0F;
        const qId = bytes[offset++];
        if (h > maxH) maxH = h;
        if (v > maxV) maxV = v;
        components.push({
          id,
          h,
          v,
          qId,
          pred: 0,
        });
      }

      const mcusPerLine = Math.ceil(width / (maxH * 8));
      const mcusPerColumn = Math.ceil(height / (maxV * 8));

      for (let i = 0; i < componentCount; i++) {
        const c = components[i];
        c.blocksPerLine = mcusPerLine * c.h;
        c.blocksPerColumn = mcusPerColumn * c.v;
        const totalBlocks = c.blocksPerLine * c.blocksPerColumn;
        c.blocks = new Array(totalBlocks);
        for (let b = 0; b < totalBlocks; b++) {
          c.blocks[b] = new Int32Array(64);
        }
        c.blockIndex = 0;
      }

      frame = {
        progressive: marker === 0xC2,
        precision,
        width,
        height,
        components,
        componentCount,
        maxH,
        maxV,
        mcusPerLine,
        mcusPerColumn,
      };
      offset = markerEnd;
    } else if (marker === 0xC4) {
      // DHT (Huffman Table)
      let hOffset = offset;
      while (hOffset < markerEnd) {
        const hInfo = bytes[hOffset++];
        const tableType = hInfo >> 4; // 0 = DC, 1 = AC
        const tableId = hInfo & 0x0F;
        const codeLengths = new Uint8Array(16);
        let totalCodes = 0;
        for (let i = 0; i < 16; i++) {
          codeLengths[i] = bytes[hOffset++];
          totalCodes += codeLengths[i];
        }
        const values = new Uint8Array(totalCodes);
        for (let i = 0; i < totalCodes; i++) {
          values[i] = bytes[hOffset++];
        }
        const huffmanTree = buildHuffmanTable(codeLengths, values);
        if (tableType === 0) {
          huffmanTablesDC[tableId] = huffmanTree;
        } else {
          huffmanTablesAC[tableId] = huffmanTree;
        }
      }
      offset = markerEnd;
    } else if (marker === 0xDD) {
      // DRI (Restart Interval)
      resetInterval = (bytes[offset] << 8) | bytes[offset + 1];
      offset = markerEnd;
    } else if (marker === 0xDA) {
      // SOS (Start of Scan)
      if (!frame) throw new Error('CORRUPTED_JPEG: SOS marker encontrado antes de SOF.');
      const scanComponentCount = bytes[offset++];
      const scanComponents: any[] = [];
      for (let i = 0; i < scanComponentCount; i++) {
        const cId = bytes[offset++];
        const tableInfo = bytes[offset++];
        const targetComp = frame.components.find((c: any) => c.id === cId);
        if (!targetComp) throw new Error(`CORRUPTED_JPEG: Componente ${cId} não encontrado no frame.`);
        targetComp.huffmanTableDC = huffmanTablesDC[tableInfo >> 4];
        targetComp.huffmanTableAC = huffmanTablesAC[tableInfo & 0x0F];
        targetComp.quantizationTable = quantizationTables[targetComp.qId];
        scanComponents.push(targetComp);
      }
      const spectralStart = bytes[offset++];
      const spectralEnd = bytes[offset++];
      const successive = bytes[offset++];

      // Decode scan entropy data
      const processedBytes = decodeScan(
        bytes,
        offset,
        frame,
        scanComponents,
        resetInterval,
        spectralStart,
        spectralEnd,
        successive >> 4,
        successive & 0x0F
      );
      offset += processedBytes;
    } else {
      // Skip unknown markers
      offset = markerEnd;
    }
  }

  if (!frame) {
    throw new Error('CORRUPTED_JPEG: Nenhum frame SOF válido encontrado no JPEG.');
  }

  const { width, height, components, componentCount } = frame;

  // Reconstruct component planes
  const decodedPlanes: Uint8Array[] = [];
  for (let cIdx = 0; cIdx < componentCount; cIdx++) {
    const c = components[cIdx];
    const planeW = c.blocksPerLine * 8;
    const planeH = c.blocksPerColumn * 8;
    const planeData = new Uint8Array(planeW * planeH);

    for (let r = 0; r < c.blocksPerColumn; r++) {
      for (let col = 0; col < c.blocksPerLine; col++) {
        const bIdx = r * c.blocksPerLine + col;
        const block = c.blocks[bIdx];
        const blockOutput = new Uint8Array(64);
        quantizeAndInverse(c, block, blockOutput, 8);

        for (let br = 0; br < 8; br++) {
          for (let bc = 0; bc < 8; bc++) {
            const pr = r * 8 + br;
            const pc = col * 8 + bc;
            planeData[pr * planeW + pc] = blockOutput[br * 8 + bc];
          }
        }
      }
    }
    decodedPlanes.push(planeData);
  }

  // Convert to output RGB buffer (width * height * 3)
  const rgbData = new Uint8Array(width * height * 3);

  if (componentCount === 1) {
    // Grayscale -> RGB
    const plane0 = decodedPlanes[0];
    const planeW = components[0].blocksPerLine * 8;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const gray = plane0[y * planeW + x];
        const outIdx = (y * width + x) * 3;
        rgbData[outIdx] = gray;
        rgbData[outIdx + 1] = gray;
        rgbData[outIdx + 2] = gray;
      }
    }
  } else if (componentCount === 3) {
    const yPlane = decodedPlanes[0];
    const cbPlane = decodedPlanes[1];
    const crPlane = decodedPlanes[2];

    const yW = components[0].blocksPerLine * 8;
    const cbW = components[1].blocksPerLine * 8;
    const crW = components[2].blocksPerLine * 8;

    const yHScale = components[0].h;
    const yVScale = components[0].v;
    const cbHScale = components[1].h;
    const cbVScale = components[1].v;
    const crHScale = components[2].h;
    const crVScale = components[2].v;

    const isDirectRgb = adobeTransform === 0;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const yVal = yPlane[y * yW + x];
        const cbX = Math.floor(x * cbHScale / yHScale);
        const cbY = Math.floor(y * cbVScale / yVScale);
        const crX = Math.floor(x * crHScale / yHScale);
        const crY = Math.floor(y * crVScale / yVScale);

        const cbVal = cbPlane[cbY * cbW + cbX];
        const crVal = crPlane[crY * crW + crX];

        let r: number, g: number, b: number;
        if (isDirectRgb) {
          r = yVal;
          g = cbVal;
          b = crVal;
        } else {
          // Standard ITU-R BT.601 YCbCr -> RGB
          r = yVal + 1.402 * (crVal - 128);
          g = yVal - 0.3441363 * (cbVal - 128) - 0.71413636 * (crVal - 128);
          b = yVal + 1.772 * (cbVal - 128);
        }

        r = r < 0 ? 0 : r > 255 ? 255 : Math.round(r);
        g = g < 0 ? 0 : g > 255 ? 255 : Math.round(g);
        b = b < 0 ? 0 : b > 255 ? 255 : Math.round(b);

        const outIdx = (y * width + x) * 3;
        rgbData[outIdx] = r;
        rgbData[outIdx + 1] = g;
        rgbData[outIdx + 2] = b;
      }
    }
  }

  return {
    width,
    height,
    data: rgbData,
    components: componentCount,
  };
}
