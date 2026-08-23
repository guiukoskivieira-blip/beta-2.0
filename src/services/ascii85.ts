/**
 * ARTECHECK — Deterministic Adobe ASCII85 (Base85) Decoder / Encoder
 *
 * Implements standard PDF/PostScript ASCII85 decoding conforming to ISO 32000-1 (Section 7.4.3).
 */

export class Ascii85DecodeError extends Error {
  public readonly reasonCode = 'ASCII85_DECODE_FAILED';
  constructor(message: string) {
    super(message);
    this.name = 'Ascii85DecodeError';
  }
}

const POW85 = [
  85 * 85 * 85 * 85, // 52200625
  85 * 85 * 85,      // 614125
  85 * 85,           // 7225
  85,                // 85
  1                  // 1
];

/**
 * Decodes ASCII85 / Base85 input buffer or string to binary Uint8Array.
 * Throws Ascii85DecodeError if data is corrupted or invalid.
 */
export function decodeAscii85(input: Uint8Array | Buffer | string): Uint8Array {
  const bytes = typeof input === 'string'
    ? Buffer.from(input, 'binary')
    : (input instanceof Uint8Array ? input : new Uint8Array(input));

  const out: number[] = [];
  const tuple = new Uint8Array(5);
  let tupleIndex = 0;
  let inEod = false;

  let start = 0;
  while (start < bytes.length && (bytes[start] === 0 || bytes[start] === 9 || bytes[start] === 10 || bytes[start] === 12 || bytes[start] === 13 || bytes[start] === 32)) {
    start++;
  }
  if (start + 1 < bytes.length && bytes[start] === 0x3C /* < */ && bytes[start + 1] === 0x7E /* ~ */) {
    start += 2;
  }

  for (let i = start; i < bytes.length; i++) {
    const b = bytes[i];

    // Whitespace characters per PDF spec: NUL (0), TAB (9), LF (10), FF (12), CR (13), SPACE (32)
    if (b === 0 || b === 9 || b === 10 || b === 12 || b === 13 || b === 32) {
      continue;
    }

    // Check for EOD delimiter '~>'
    if (b === 0x7E /* ~ */) {
      if (i + 1 < bytes.length && bytes[i + 1] === 0x3E /* > */) {
        inEod = true;
        break;
      }
      // Single '~' not followed by '>' is an invalid character
      throw new Ascii85DecodeError(`Caractere '~' isolado sem '>' na posição ${i}.`);
    }

    if (b === 0x7A /* z */) {
      // 'z' is only valid as an entire 5-char tuple representing 4 zero bytes
      if (tupleIndex !== 0) {
        throw new Ascii85DecodeError(`Caractere 'z' encontrado no meio de uma tupla na posição ${i}.`);
      }
      out.push(0, 0, 0, 0);
      continue;
    }

    if (b < 33 || b > 117) {
      throw new Ascii85DecodeError(`Caractere ASCII inválido 0x${b.toString(16).toUpperCase()} na posição ${i} (esperado entre '!' [33] e 'u' [117]).`);
    }

    tuple[tupleIndex++] = b - 33;

    if (tupleIndex === 5) {
      let value = 0;
      for (let j = 0; j < 5; j++) {
        value += tuple[j] * POW85[j];
      }

      if (value > 0xFFFFFFFF) {
        throw new Ascii85DecodeError(`Tupla ASCII85 excede 32 bits (overflow) na posição ${i}.`);
      }

      out.push(
        (value >>> 24) & 0xFF,
        (value >>> 16) & 0xFF,
        (value >>> 8) & 0xFF,
        value & 0xFF
      );

      tupleIndex = 0;
    }
  }

  // Handle final partial tuple
  if (tupleIndex > 0) {
    if (tupleIndex === 1) {
      throw new Ascii85DecodeError('Tupla final incompleta com apenas 1 caractere (inválida na especificação ASCII85).');
    }

    // Pad remaining digits with 84 (value of 'u')
    for (let j = tupleIndex; j < 5; j++) {
      tuple[j] = 84;
    }

    let value = 0;
    for (let j = 0; j < 5; j++) {
      value += tuple[j] * POW85[j];
    }

    if (value > 0xFFFFFFFF) {
      throw new Ascii85DecodeError('Tupla final ASCII85 excede 32 bits (overflow).');
    }

    // Output only tupleIndex - 1 bytes
    const bytesToEmit = tupleIndex - 1;
    if (bytesToEmit >= 1) out.push((value >>> 24) & 0xFF);
    if (bytesToEmit >= 2) out.push((value >>> 16) & 0xFF);
    if (bytesToEmit >= 3) out.push((value >>> 8) & 0xFF);
  }

  return new Uint8Array(out);
}

/**
 * Encodes a binary Uint8Array into standard ASCII85 string with ~> terminator.
 */
export function encodeAscii85(data: Uint8Array | Buffer): string {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let result = '<~';
  let i = 0;

  while (i < bytes.length) {
    const remaining = bytes.length - i;
    if (remaining >= 4) {
      const b0 = bytes[i++];
      const b1 = bytes[i++];
      const b2 = bytes[i++];
      const b3 = bytes[i++];
      let value = ((b0 << 24) >>> 0) + (b1 << 16) + (b2 << 8) + b3;

      if (value === 0) {
        result += 'z';
      } else {
        const c4 = value % 85; value = Math.floor(value / 85);
        const c3 = value % 85; value = Math.floor(value / 85);
        const c2 = value % 85; value = Math.floor(value / 85);
        const c1 = value % 85; value = Math.floor(value / 85);
        const c0 = value % 85;
        result += String.fromCharCode(c0 + 33, c1 + 33, c2 + 33, c3 + 33, c4 + 33);
      }
    } else {
      // 1, 2, or 3 remaining bytes
      let value = 0;
      for (let j = 0; j < 4; j++) {
        value = (value << 8) >>> 0;
        if (j < remaining) {
          value += bytes[i++];
        }
      }

      const chars: number[] = [];
      for (let j = 0; j < 5; j++) {
        chars.unshift((value % 85) + 33);
        value = Math.floor(value / 85);
      }

      // Output remaining + 1 characters
      result += String.fromCharCode(...chars.slice(0, remaining + 1));
    }
  }

  result += '~>';
  return result;
}
