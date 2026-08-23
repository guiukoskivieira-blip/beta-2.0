export type TargetColorSpace = 'CMYK' | 'RGB' | 'GRAY' | 'LAB';
export type RenderingIntent = 'RelativeColorimetric' | 'AbsoluteColorimetric' | 'Perceptual' | 'Saturation';

export interface ColorManagementContract {
  targetColorSpace: TargetColorSpace;
  iccProfileId: string;
  iccProfileName: string;
  iccByteLength: number;
  iccComponents: number;
  outputConditionIdentifier: string;
  registryName?: string;
  info?: string;
  renderingIntent?: RenderingIntent;
}

export interface IccProfileHeader {
  profileSize: number;
  cmmSignature: string;
  version: string;
  deviceClass: string;
  colorSpace: string;
  connectionSpace: string;
  magicSignature: string;
  tagCount: number;
}

export interface IccProfileValidationResult {
  valid: boolean;
  header?: IccProfileHeader;
  components: number;
  colorSpace: TargetColorSpace;
  sha256?: string;
  shortSha256?: string;
  error?: string;
}

/**
 * Universal pure-TypeScript SHA-256 implementation (works in browser & Node).
 */
export function computeSha256(input: Uint8Array | Buffer): string {
  try {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    function rightRotate(value: number, amount: number) {
      return (value >>> amount) | (value << (32 - amount));
    }
    let i = 0;
    let j = 0;
    let result = '';
    const words: number[] = [];
    const bitLength = bytes.length * 8;
    const hash = [
      0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
      0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
    ];
    const k = [
      0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
      0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
      0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
      0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
      0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
      0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
      0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
      0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
    ];

    for (i = 0; i < bytes.length; i++) {
      words[i >> 2] |= (bytes[i] & 0xff) << (24 - (i % 4) * 8);
    }
    words[bitLength >> 5] |= 0x80 << (24 - (bitLength % 32));
    words[(((bitLength + 64) >> 9) << 4) + 15] = bitLength;

    for (i = 0; i < words.length; i += 16) {
      const w = words.slice(i, i + 16);
      while (w.length < 16) w.push(0);
      const oldHash = hash.slice(0);

      for (j = 0; j < 64; j++) {
        if (j >= 16) {
          const s0 = rightRotate(w[j - 15], 7) ^ rightRotate(w[j - 15], 18) ^ (w[j - 15] >>> 3);
          const s1 = rightRotate(w[j - 2], 17) ^ rightRotate(w[j - 2], 19) ^ (w[j - 2] >>> 10);
          w[j] = (w[j - 16] + s0 + w[j - 7] + s1) | 0;
        }
        const ch = (hash[4] & hash[5]) ^ (~hash[4] & hash[6]);
        const maj = (hash[0] & hash[1]) ^ (hash[0] & hash[2]) ^ (hash[1] & hash[2]);
        const s0 = rightRotate(hash[0], 2) ^ rightRotate(hash[0], 13) ^ rightRotate(hash[0], 22);
        const s1 = rightRotate(hash[4], 6) ^ rightRotate(hash[4], 11) ^ rightRotate(hash[4], 25);
        const t1 = hash[7] + s1 + ch + k[j] + (w[j] || 0);
        const t2 = s0 + maj;

        hash[7] = hash[6];
        hash[6] = hash[5];
        hash[5] = hash[4];
        hash[4] = (hash[3] + t1) | 0;
        hash[3] = hash[2];
        hash[2] = hash[1];
        hash[1] = hash[0];
        hash[0] = (t1 + t2) | 0;
      }

      for (j = 0; j < 8; j++) {
        hash[j] = (hash[j] + oldHash[j]) | 0;
      }
    }

    for (i = 0; i < 8; i++) {
      const hex = (hash[i] >>> 0).toString(16).padStart(8, '0');
      result += hex;
    }
    return result;
  } catch {
    return '';
  }
}

/**
 * Validates the binary structure of an ICC Profile per ICC.1:2010 specification.
 * Rejects empty, corrupted, truncated or non-conforming ICC data.
 */
export function validateIccProfile(bytes: Uint8Array | Buffer | null | undefined): IccProfileValidationResult {
  if (!bytes || bytes.length === 0) {
    return {
      valid: false,
      components: 0,
      colorSpace: 'CMYK',
      error: 'Perfil ICC vazio ou nulo.',
    };
  }

  const rawBytes = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);

  // 1. Minimum valid ICC header is 128 bytes
  if (rawBytes.length < 128) {
    return {
      valid: false,
      components: 0,
      colorSpace: 'CMYK',
      error: `Tamanho de arquivo insuficiente (${rawBytes.length} bytes). O cabeçalho ICC exige no mínimo 128 bytes.`,
    };
  }

  const view = new DataView(rawBytes.buffer, rawBytes.byteOffset, rawBytes.byteLength);

  // 2. Read declared size (uint32 BE at offset 0)
  const declaredSize = view.getUint32(0, false);
  if (declaredSize < 128 || declaredSize > rawBytes.length) {
    return {
      valid: false,
      components: 0,
      colorSpace: 'CMYK',
      error: `Tamanho declarado no cabeçalho (${declaredSize} bytes) é incompatível com o arquivo real (${rawBytes.length} bytes).`,
    };
  }

  // 3. Read and verify Magic Signature at offset 36..39 ('acsp' => 0x61637370)
  const magic0 = rawBytes[36];
  const magic1 = rawBytes[37];
  const magic2 = rawBytes[38];
  const magic3 = rawBytes[39];
  const magicStr = String.fromCharCode(magic0, magic1, magic2, magic3);

  if (magicStr !== 'acsp') {
    return {
      valid: false,
      components: 0,
      colorSpace: 'CMYK',
      error: `Assinatura mágica ICC inválida: "${magicStr}". Esperado "acsp" no offset 36.`,
    };
  }

  // 4. CMM Signature at offset 4..7
  const cmmStr = String.fromCharCode(rawBytes[4], rawBytes[5], rawBytes[6], rawBytes[7]).trim();

  // 5. Version at offset 8..11
  const major = rawBytes[8];
  const minor = rawBytes[9] >> 4;
  const versionStr = `${major}.${minor}`;

  // 6. Device Class at offset 12..15
  const devClassStr = String.fromCharCode(rawBytes[12], rawBytes[13], rawBytes[14], rawBytes[15]).trim();

  // 7. Color Space at offset 16..19
  const csRaw = String.fromCharCode(rawBytes[16], rawBytes[17], rawBytes[18], rawBytes[19]);
  const csTrim = csRaw.trim();

  let components = 4;
  let targetColorSpace: TargetColorSpace = 'CMYK';

  if (csTrim === 'CMYK') {
    components = 4;
    targetColorSpace = 'CMYK';
  } else if (csTrim === 'RGB') {
    components = 3;
    targetColorSpace = 'RGB';
  } else if (csTrim === 'GRAY') {
    components = 1;
    targetColorSpace = 'GRAY';
  } else if (csTrim === 'Lab' || csTrim === 'LAB') {
    components = 3;
    targetColorSpace = 'LAB';
  } else {
    return {
      valid: false,
      components: 0,
      colorSpace: 'CMYK',
      error: `Espaço de cores não suportado ou inválido no perfil ICC: "${csTrim}".`,
    };
  }

  // 8. Connection Space at offset 20..23
  const connSpaceStr = String.fromCharCode(rawBytes[20], rawBytes[21], rawBytes[22], rawBytes[23]).trim();

  // 9. Tag count at offset 128..131 (if file is large enough)
  let tagCount = 0;
  if (rawBytes.length >= 132) {
    tagCount = view.getUint32(128, false);
    if (tagCount === 0) {
      return {
        valid: false,
        components,
        colorSpace: targetColorSpace,
        error: 'Tabela de tags do perfil ICC está vazia (0 tags).',
      };
    }
  }

  const sha256 = computeSha256(rawBytes);
  const shortSha256 = sha256 ? sha256.slice(0, 8) : '';

  return {
    valid: true,
    components,
    colorSpace: targetColorSpace,
    sha256,
    shortSha256,
    header: {
      profileSize: declaredSize,
      cmmSignature: cmmStr,
      version: versionStr,
      deviceClass: devClassStr,
      colorSpace: csTrim,
      connectionSpace: connSpaceStr,
      magicSignature: magicStr,
      tagCount,
    },
  };
}

export interface PresetIccProfile {
  id: string;
  name: string;
  description: string;
  colorSpace: TargetColorSpace;
  components: number;
  outputConditionIdentifier: string;
  registryName: string;
  info: string;
  defaultRenderingIntent: RenderingIntent;
  bundledPath?: string;
}

export const PRESET_ICC_PROFILES: Record<string, PresetIccProfile> = {
  cgats_tr_001_swop: {
    id: 'cgats_tr_001_swop',
    name: 'CGATS TR 001 / U.S. Web Coated (SWOP)',
    description: 'Padrão norte-americano e comercial para impressão offset e rotativa (SWOP).',
    colorSpace: 'CMYK',
    components: 4,
    outputConditionIdentifier: 'CGATS TR 001',
    registryName: 'http://www.color.org',
    info: 'U.S. Web Coated (SWOP) v2 / CGATS TR 001',
    defaultRenderingIntent: 'RelativeColorimetric',
    bundledPath: 'server/iccs/cgats_tr001_swop.icc',
  },
  fogra39: {
    id: 'fogra39',
    name: 'Coated FOGRA39 (ISO 12647-2:2004)',
    description: 'Padrão europeu e internacional para impressão plana em papel couchê.',
    colorSpace: 'CMYK',
    components: 4,
    outputConditionIdentifier: 'FOGRA39',
    registryName: 'http://www.color.org',
    info: 'Coated FOGRA39 (ISO 12647-2:2004)',
    defaultRenderingIntent: 'RelativeColorimetric',
  },
  iso_coated_v2: {
    id: 'iso_coated_v2',
    name: 'ISO Coated v2 300% (ECI)',
    description: 'Padrão ECI de referência com limite de carga de tinta a 300%.',
    colorSpace: 'CMYK',
    components: 4,
    outputConditionIdentifier: 'ISO Coated v2 300% (ECI)',
    registryName: 'http://www.color.org',
    info: 'ISO Coated v2 300% (ECI)',
    defaultRenderingIntent: 'RelativeColorimetric',
  },
  srgb: {
    id: 'srgb',
    name: 'sRGB IEC61966-2.1',
    description: 'Espaço de cor RGB padrão para monitores e imagens web.',
    colorSpace: 'RGB',
    components: 3,
    outputConditionIdentifier: 'sRGB',
    registryName: 'http://www.color.org',
    info: 'sRGB IEC61966-2.1',
    defaultRenderingIntent: 'RelativeColorimetric',
    bundledPath: 'server/iccs/srgb.icc',
  },
};
