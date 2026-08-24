import * as lcmsModule from 'lcms-wasm';
import {
  TYPE_RGB_8,
  TYPE_CMYK_8,
  INTENT_PERCEPTUAL,
  INTENT_RELATIVE_COLORIMETRIC,
  INTENT_SATURATION,
  INTENT_ABSOLUTE_COLORIMETRIC,
} from 'lcms-wasm';
import { RenderingIntent, validateIccProfile } from '../domain/colorManagement';
export type { RenderingIntent };

export interface ProfileMetadataSummary {
  colorSpace: string;
  components: number;
  sha256?: string;
}

export interface ColorTransformRequest {
  rgbPixels: Uint8Array;
  sourceIcc?: Uint8Array | 'built-in-srgb';
  destinationIcc: Uint8Array;
  renderingIntent?: RenderingIntent;
}

export interface ColorTransformResult {
  success: boolean;
  outputPixels?: Uint8Array;
  inputComponents: 3;
  outputComponents: 4;
  pixelCount: number;
  sourceProfile?: ProfileMetadataSummary;
  destinationProfile?: ProfileMetadataSummary;
  renderingIntent: RenderingIntent;
  error?: string;
}

let cachedLcmsInstance: any = null;

function resolveCreateLcmsFn(): ((opts?: any) => Promise<any>) | null {
  const mod = lcmsModule as any;
  if (typeof mod.default === 'function') return mod.default;
  if (typeof mod === 'function') return mod;
  if (typeof mod.instantiate === 'function') return mod.instantiate;
  if (typeof mod.default?.default === 'function') return mod.default.default;
  return null;
}

/**
 * Initializes and retrieves the LittleCMS WebAssembly CMM instance.
 */
export async function getLcmsEngine(): Promise<any> {
  if (cachedLcmsInstance) {
    return cachedLcmsInstance;
  }

  const createFn = resolveCreateLcmsFn();
  if (!createFn) {
    throw new Error('Função construtora do módulo LittleCMS WebAssembly não encontrada.');
  }

  // 1. Try standard Emscripten auto-initialization
  try {
    cachedLcmsInstance = await createFn();
    if (cachedLcmsInstance && typeof cachedLcmsInstance.cmsCreateTransform === 'function') {
      return cachedLcmsInstance;
    }
  } catch {
    // Continue to explicit buffer loading
  }

  // 2. Explicit buffer loading across production container / dist locations
  if (typeof process !== 'undefined' && process.versions?.node) {
    try {
      const fs = await import('fs');
      const path = await import('path');
      const candidatePaths = [
        path.resolve(process.cwd(), 'dist/lcms.wasm'),
        path.resolve(process.cwd(), 'node_modules/lcms-wasm/dist/lcms.wasm'),
        path.resolve(__dirname, 'lcms.wasm'),
        path.resolve(__dirname, 'dist/lcms.wasm'),
        path.resolve(__dirname, '../node_modules/lcms-wasm/dist/lcms.wasm'),
        path.resolve(__dirname, '../../node_modules/lcms-wasm/dist/lcms.wasm'),
      ];
      for (const p of candidatePaths) {
        if (fs.existsSync(p)) {
          const wasmBinary = fs.readFileSync(p);
          cachedLcmsInstance = await createFn({ wasmBinary });
          if (cachedLcmsInstance && typeof cachedLcmsInstance.cmsCreateTransform === 'function') {
            return cachedLcmsInstance;
          }
        }
      }
    } catch (err: any) {
      throw new Error(`Falha ao carregar binário LittleCMS WebAssembly: ${err?.message || String(err)}`);
    }
  }

  throw new Error('Não foi possível localizar ou inicializar o módulo LittleCMS WebAssembly (lcms.wasm).');
}

/**
 * Maps standard RenderingIntent string to LittleCMS intent integer.
 */
export function mapRenderingIntentToLcms(intent: RenderingIntent): number {
  switch (intent) {
    case 'Perceptual':
      return INTENT_PERCEPTUAL; // 0
    case 'RelativeColorimetric':
      return INTENT_RELATIVE_COLORIMETRIC; // 1
    case 'Saturation':
      return INTENT_SATURATION; // 2
    case 'AbsoluteColorimetric':
      return INTENT_ABSOLUTE_COLORIMETRIC; // 3
    default:
      return INTENT_RELATIVE_COLORIMETRIC;
  }
}

/**
 * Transforms an array of 8-bit RGB pixels (3 bytes/pixel) to 8-bit CMYK pixels (4 bytes/pixel)
 * strictly using the LittleCMS WebAssembly Color Management Module (CMM).
 *
 * Mathematical fallbacks are strictly prohibited.
 */
export async function transformRgbToCmyk(
  request: ColorTransformRequest
): Promise<ColorTransformResult> {
  const renderingIntent: RenderingIntent = request.renderingIntent || 'RelativeColorimetric';
  const rgbPixels = request.rgbPixels;

  // 1. Validate Input Pixels
  if (!rgbPixels || !(rgbPixels instanceof Uint8Array)) {
    return {
      success: false,
      inputComponents: 3,
      outputComponents: 4,
      pixelCount: 0,
      renderingIntent,
      error: 'Pixels de entrada RGB inválidos ou vazios.',
    };
  }

  if (rgbPixels.length === 0) {
    return {
      success: false,
      inputComponents: 3,
      outputComponents: 4,
      pixelCount: 0,
      renderingIntent,
      error: 'Buffer de pixels RGB com comprimento zero.',
    };
  }

  if (rgbPixels.length % 3 !== 0) {
    return {
      success: false,
      inputComponents: 3,
      outputComponents: 4,
      pixelCount: Math.floor(rgbPixels.length / 3),
      renderingIntent,
      error: `Comprimento de pixels RGB inválido (${rgbPixels.length} bytes). Deve ser múltiplo exato de 3 componentes por pixel.`,
    };
  }

  const pixelCount = rgbPixels.length / 3;

  // 2. Validate Destination CMYK ICC Profile
  const destValidation = validateIccProfile(request.destinationIcc);
  if (!destValidation.valid) {
    return {
      success: false,
      inputComponents: 3,
      outputComponents: 4,
      pixelCount,
      renderingIntent,
      error: `Perfil ICC de destino inválido: ${destValidation.error || 'estrutura ICC não reconhecida'}.`,
    };
  }

  if (destValidation.colorSpace !== 'CMYK' || destValidation.components !== 4) {
    return {
      success: false,
      inputComponents: 3,
      outputComponents: 4,
      pixelCount,
      destinationProfile: {
        colorSpace: destValidation.colorSpace,
        components: destValidation.components,
        sha256: destValidation.sha256,
      },
      renderingIntent,
      error: `Perfil ICC de destino deve ser CMYK de 4 canais. Detectado: ${destValidation.colorSpace} (${destValidation.components} canais).`,
    };
  }

  const destinationProfileSummary: ProfileMetadataSummary = {
    colorSpace: 'CMYK',
    components: 4,
    sha256: destValidation.sha256,
  };

  // 3. Validate Source RGB ICC Profile
  let sourceProfileSummary: ProfileMetadataSummary;
  const isBuiltInSrgb = !request.sourceIcc || request.sourceIcc === 'built-in-srgb';

  if (!isBuiltInSrgb) {
    const srcValidation = validateIccProfile(request.sourceIcc as Uint8Array);
    if (!srcValidation.valid) {
      return {
        success: false,
        inputComponents: 3,
        outputComponents: 4,
        pixelCount,
        destinationProfile: destinationProfileSummary,
        renderingIntent,
        error: `Perfil ICC de origem inválido: ${srcValidation.error || 'estrutura ICC não reconhecida'}.`,
      };
    }

    if (srcValidation.colorSpace !== 'RGB' || srcValidation.components !== 3) {
      return {
        success: false,
        inputComponents: 3,
        outputComponents: 4,
        pixelCount,
        sourceProfile: {
          colorSpace: srcValidation.colorSpace,
          components: srcValidation.components,
          sha256: srcValidation.sha256,
        },
        destinationProfile: destinationProfileSummary,
        renderingIntent,
        error: `Perfil ICC de origem deve ser RGB de 3 canais. Detectado: ${srcValidation.colorSpace} (${srcValidation.components} canais).`,
      };
    }

    sourceProfileSummary = {
      colorSpace: 'RGB',
      components: 3,
      sha256: srcValidation.sha256,
    };
  } else {
    sourceProfileSummary = {
      colorSpace: 'RGB',
      components: 3,
      sha256: 'lcms-builtin-srgb',
    };
  }

  // 4. Initialize LittleCMS CMM
  let lcms: any;
  try {
    lcms = await getLcmsEngine();
  } catch (err: any) {
    return {
      success: false,
      inputComponents: 3,
      outputComponents: 4,
      pixelCount,
      sourceProfile: sourceProfileSummary,
      destinationProfile: destinationProfileSummary,
      renderingIntent,
      error: `Falha ao inicializar o motor LittleCMS WebAssembly: ${err?.message || String(err)}`,
    };
  }

  let sourceHandle = 0;
  let destHandle = 0;
  let transformHandle = 0;

  try {
    // 5. Open Source Profile
    if (isBuiltInSrgb) {
      sourceHandle = lcms.cmsCreate_sRGBProfile();
    } else {
      const srcBytes = request.sourceIcc as Uint8Array;
      sourceHandle = lcms.cmsOpenProfileFromMem(srcBytes, srcBytes.length);
    }

    if (!sourceHandle) {
      return {
        success: false,
        inputComponents: 3,
        outputComponents: 4,
        pixelCount,
        sourceProfile: sourceProfileSummary,
        destinationProfile: destinationProfileSummary,
        renderingIntent,
        error: 'LittleCMS não conseguiu carregar o perfil ICC de origem.',
      };
    }

    // 6. Open Destination Profile
    const destBytes = request.destinationIcc;
    destHandle = lcms.cmsOpenProfileFromMem(destBytes, destBytes.length);
    if (!destHandle) {
      return {
        success: false,
        inputComponents: 3,
        outputComponents: 4,
        pixelCount,
        sourceProfile: sourceProfileSummary,
        destinationProfile: destinationProfileSummary,
        renderingIntent,
        error: 'LittleCMS não conseguiu carregar o perfil ICC de destino.',
      };
    }

    // 7. Create Transform with specified Rendering Intent
    const lcmsIntent = mapRenderingIntentToLcms(renderingIntent);
    transformHandle = lcms.cmsCreateTransform(
      sourceHandle,
      TYPE_RGB_8,
      destHandle,
      TYPE_CMYK_8,
      lcmsIntent,
      0
    );

    if (!transformHandle) {
      return {
        success: false,
        inputComponents: 3,
        outputComponents: 4,
        pixelCount,
        sourceProfile: sourceProfileSummary,
        destinationProfile: destinationProfileSummary,
        renderingIntent,
        error: `LittleCMS não conseguiu criar a transformação de cores RGB -> CMYK (Intent: ${renderingIntent}).`,
      };
    }

    // 8. Execute CMM Transformation in bounded chunks to prevent WASM heap exhaustion and memory spikes
    const CHUNK_PIXELS = 250_000; // ~750 KB RGB -> ~1 MB CMYK per chunk (well within WASM memory limits)
    const outputPixels = new Uint8Array(pixelCount * 4);

    for (let offset = 0; offset < pixelCount; offset += CHUNK_PIXELS) {
      const count = Math.min(CHUNK_PIXELS, pixelCount - offset);
      const rgbChunk = rgbPixels.subarray(offset * 3, (offset + count) * 3);
      const cmykChunk = lcms.cmsDoTransform(transformHandle, rgbChunk, count);

      if (!cmykChunk || cmykChunk.length !== count * 4) {
        return {
          success: false,
          inputComponents: 3,
          outputComponents: 4,
          pixelCount,
          sourceProfile: sourceProfileSummary,
          destinationProfile: destinationProfileSummary,
          renderingIntent,
          error: `Falha na transformação do bloco de pixels (${cmykChunk?.length || 0} bytes retornados para ${count * 4} esperados).`,
        };
      }

      outputPixels.set(cmykChunk, offset * 4);
    }

    return {
      success: true,
      outputPixels,
      inputComponents: 3,
      outputComponents: 4,
      pixelCount,
      sourceProfile: sourceProfileSummary,
      destinationProfile: destinationProfileSummary,
      renderingIntent,
    };
  } catch (err: any) {
    return {
      success: false,
      inputComponents: 3,
      outputComponents: 4,
      pixelCount,
      sourceProfile: sourceProfileSummary,
      destinationProfile: destinationProfileSummary,
      renderingIntent,
      error: `Erro de execução no CMM LittleCMS: ${err?.message || String(err)}`,
    };
  } finally {
    // 9. Clean up all handles in reverse order
    if (transformHandle && lcms?.cmsDeleteTransform) {
      try {
        lcms.cmsDeleteTransform(transformHandle);
      } catch {
        // ignore cleanup error
      }
    }
    if (sourceHandle && lcms?.cmsCloseProfile) {
      try {
        lcms.cmsCloseProfile(sourceHandle);
      } catch {
        // ignore cleanup error
      }
    }
    if (destHandle && lcms?.cmsCloseProfile) {
      try {
        lcms.cmsCloseProfile(destHandle);
      } catch {
        // ignore cleanup error
      }
    }
  }
}
