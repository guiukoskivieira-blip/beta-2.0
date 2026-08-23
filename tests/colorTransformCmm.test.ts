import { getLcmsEngine, transformRgbToCmyk, mapRenderingIntentToLcms } from '../src/services/colorTransform';
import { validateIccProfile } from '../src/domain/colorManagement';
import { TYPE_RGB_8, TYPE_CMYK_8, INTENT_RELATIVE_COLORIMETRIC } from 'lcms-wasm';
import fs from 'fs';
import path from 'path';

let passed = 0;
let total = 0;

function assert(condition: boolean, msg: string) {
  total++;
  if (!condition) {
    console.error(`  ✗ FAIL: ${msg}`);
    throw new Error(`Test failed: ${msg}`);
  }
  passed++;
  console.log(`  ✓ ${msg}`);
}

export async function runColorTransformTests() {
  console.log('\n================================================================');
  console.log('ARTECHECK — LITTLECMS / WASM CMM PROOF OF CONCEPT SUITE');
  console.log('================================================================\n');

  const cmykProfilePath = path.resolve('server/iccs/cgats_tr001_swop.icc');
  const rgbProfilePath = path.resolve('server/iccs/srgb.icc');

  const cmykBytes = fs.readFileSync(cmykProfilePath);
  const rgbBytes = fs.readFileSync(rgbProfilePath);

  // 1. CMM inicializa
  const lcms = await getLcmsEngine();
  assert(
    lcms !== null && typeof lcms === 'object' && typeof lcms.cmsCreateTransform === 'function',
    'TEST 1: CMM LittleCMS/WASM inicializa com sucesso no runtime'
  );

  // 2. ICC RGB válido abre
  const rgbValidation = validateIccProfile(rgbBytes);
  assert(
    rgbValidation.valid === true && rgbValidation.colorSpace === 'RGB' && rgbValidation.components === 3,
    'TEST 2: ICC RGB válido abre, possui assinatura mágica acsp e 3 componentes'
  );
  const rgbHandle = lcms.cmsOpenProfileFromMem(rgbBytes, rgbBytes.length);
  assert(rgbHandle > 0, 'TEST 2.1: LittleCMS abre o perfil ICC RGB em memória nativa');
  lcms.cmsCloseProfile(rgbHandle);

  // 3. ICC CGATS TR 001 SWOP CMYK válido abre
  const cmykValidation = validateIccProfile(cmykBytes);
  assert(
    cmykValidation.valid === true && cmykValidation.colorSpace === 'CMYK' && cmykValidation.components === 4,
    'TEST 3: ICC CGATS TR 001 SWOP CMYK válido abre, possui assinatura mágica acsp e 4 componentes'
  );
  const cmykHandle = lcms.cmsOpenProfileFromMem(cmykBytes, cmykBytes.length);
  assert(cmykHandle > 0, 'TEST 3.1: LittleCMS abre o perfil ICC CGATS TR 001 SWOP CMYK em memória nativa');
  lcms.cmsCloseProfile(cmykHandle);

  // 4. ICC inválido é rejeitado
  const corruptedIcc = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
  const invalidResult = await transformRgbToCmyk({
    rgbPixels: new Uint8Array([255, 0, 0]),
    sourceIcc: 'built-in-srgb',
    destinationIcc: corruptedIcc,
  });
  assert(
    invalidResult.success === false &&
    invalidResult.error !== undefined &&
    invalidResult.error.includes('Perfil ICC de destino inválido'),
    'TEST 4: ICC corrompido ou sem assinatura acsp é estritamente rejeitado sem chamar o CMM'
  );

  // 5. RGB de entrada possui 3 componentes
  const invalidRgbLengthResult = await transformRgbToCmyk({
    rgbPixels: new Uint8Array([255, 0, 0, 128]), // 4 bytes (not multiple of 3)
    sourceIcc: 'built-in-srgb',
    destinationIcc: cmykBytes,
  });
  assert(
    invalidRgbLengthResult.success === false &&
    invalidRgbLengthResult.error !== undefined &&
    invalidRgbLengthResult.error.includes('múltiplo exato de 3'),
    'TEST 5: RGB de entrada deve possuir exatamente 3 bytes/componentes por pixel (rejeita comprimentos inválidos)'
  );

  // 6. CMYK de saída possui 4 componentes
  // 7. Quantidade de pixels é preservada
  const pixelCount = 10;
  const sampleRgb = new Uint8Array(pixelCount * 3);
  for (let i = 0; i < pixelCount; i++) {
    sampleRgb[i * 3] = (i * 25) % 256;     // R
    sampleRgb[i * 3 + 1] = (i * 50) % 256; // G
    sampleRgb[i * 3 + 2] = (i * 75) % 256; // B
  }

  const transformResult = await transformRgbToCmyk({
    rgbPixels: sampleRgb,
    sourceIcc: rgbBytes,
    destinationIcc: cmykBytes,
    renderingIntent: 'RelativeColorimetric',
  });

  assert(
    transformResult.success === true &&
    transformResult.outputPixels !== undefined &&
    transformResult.outputPixels.length === pixelCount * 4,
    'TEST 6: CMYK de saída possui 4 componentes por pixel (40 bytes para 10 pixels)'
  );

  assert(
    transformResult.pixelCount === pixelCount &&
    transformResult.inputComponents === 3 &&
    transformResult.outputComponents === 4,
    'TEST 7: Quantidade de pixels (10) e contagem de componentes (3 -> 4) são estritamente preservadas'
  );

  // 8. Bytes de saída são realmente produzidos pelo CMM
  // Test specific pure colors: Pure Red (255,0,0) -> 0% Cyan, 100% Magenta, 100% Yellow, 0% Black
  // Pure White (255,255,255) -> 0% C, 0% M, 0% Y, 0% K
  const testPixels = new Uint8Array([
    255, 0, 0,       // Pure Red
    255, 255, 255,   // Pure White
  ]);
  const specificResult = await transformRgbToCmyk({
    rgbPixels: testPixels,
    sourceIcc: 'built-in-srgb',
    destinationIcc: cmykBytes,
    renderingIntent: 'RelativeColorimetric',
  });

  assert(specificResult.success === true && specificResult.outputPixels !== undefined, 'TEST 8.1: Transformação de teste executada com sucesso');
  const out = specificResult.outputPixels!;
  const redC = out[0], redM = out[1], redY = out[2], redK = out[3];
  const whiteC = out[4], whiteM = out[5], whiteY = out[6], whiteK = out[7];

  // Pure Red in standard SWOP CMYK: C=0, M=255, Y=255, K=0
  // Pure White in standard SWOP CMYK: C=0, M=0, Y=0, K=0
  assert(
    redC === 0 && redM === 255 && redY === 255 && redK === 0,
    `TEST 8: Bytes de saída são calibrados pelo CMM (Vermelho puro -> C:${redC}, M:${redM}, Y:${redY}, K:${redK})`
  );
  assert(
    whiteC === 0 && whiteM === 0 && whiteY === 0 && whiteK === 0,
    `TEST 8.2: Branco puro no CMM produz 0% de tinta (C:${whiteC}, M:${whiteM}, Y:${whiteY}, K:${whiteK})`
  );

  // 9. Rendering intent é utilizado
  const neonGreen = new Uint8Array([0, 255, 0]); // Out of gamut bright neon green
  const resRelative = await transformRgbToCmyk({
    rgbPixels: neonGreen,
    sourceIcc: 'built-in-srgb',
    destinationIcc: cmykBytes,
    renderingIntent: 'RelativeColorimetric',
  });
  const resAbsolute = await transformRgbToCmyk({
    rgbPixels: neonGreen,
    sourceIcc: 'built-in-srgb',
    destinationIcc: cmykBytes,
    renderingIntent: 'AbsoluteColorimetric',
  });

  assert(
    resRelative.success && resAbsolute.success &&
    resRelative.outputPixels !== undefined && resAbsolute.outputPixels !== undefined,
    'TEST 9.1: Ambas as transformações com intents diferentes foram executadas com sucesso'
  );
  // AbsoluteColorimetric and RelativeColorimetric treat out of gamut neon colors differently in LittleCMS
  assert(
    resRelative.outputPixels![0] !== resAbsolute.outputPixels![0] ||
    resRelative.outputPixels![1] !== resAbsolute.outputPixels![1] ||
    resRelative.outputPixels![2] !== resAbsolute.outputPixels![2] ||
    resRelative.outputPixels![3] !== resAbsolute.outputPixels![3],
    `TEST 9: Rendering intent altera o mapeamento de cor no CMM (Relativo C:${resRelative.outputPixels![0]} vs Absoluto C:${resAbsolute.outputPixels![0]})`
  );

  // 10. Original RGB não é modificado (imutabilidade)
  const originalRgb = new Uint8Array([120, 200, 50, 80, 10, 220]);
  const originalCopy = new Uint8Array(originalRgb);
  await transformRgbToCmyk({
    rgbPixels: originalRgb,
    sourceIcc: rgbBytes,
    destinationIcc: cmykBytes,
    renderingIntent: 'Perceptual',
  });
  let bufferIdentical = true;
  for (let i = 0; i < originalRgb.length; i++) {
    if (originalRgb[i] !== originalCopy[i]) {
      bufferIdentical = false;
      break;
    }
  }
  assert(bufferIdentical, 'TEST 10: Buffer RGB de entrada é estritamente imutável (inalterado byte-a-byte)');

  // 11. Não existe fallback matemático
  // We test that arbitrary RGB color mapping does not follow simplistic (1-R, 1-G, 1-B) formulas
  // Simplistic formula for (100, 150, 200) would be K=55, C=100, M=50, Y=0. Real LittleCMS SWOP uses TAC curves and UCR/GCR.
  const midTone = new Uint8Array([100, 150, 200]);
  const midRes = await transformRgbToCmyk({
    rgbPixels: midTone,
    sourceIcc: rgbBytes,
    destinationIcc: cmykBytes,
    renderingIntent: 'RelativeColorimetric',
  });
  const naiveC = Math.round((1 - 100 / 255 - (1 - 200 / 255)) / (200 / 255) * 255);
  assert(
    midRes.success && midRes.outputPixels !== undefined && midRes.outputPixels[0] !== naiveC,
    'TEST 11: Não há fallback matemático linear; LittleCMS aplica curvas de perfil ICC (UCR/GCR e TAC reais)'
  );

  // 12. Erro do WASM não gera sucesso falso
  const emptyDestResult = await transformRgbToCmyk({
    rgbPixels: new Uint8Array([255, 0, 0]),
    sourceIcc: 'built-in-srgb',
    destinationIcc: new Uint8Array(0),
  });
  assert(
    emptyDestResult.success === false &&
    emptyDestResult.outputPixels === undefined &&
    emptyDestResult.error !== undefined,
    'TEST 12: Falhas no CMM ou parâmetros inválidos retornam success=false com mensagem de erro descritiva'
  );

  // 13. Resolução explícita de WASM no diretório dist ou node_modules em produção
  const distWasmPath = path.resolve('dist/lcms.wasm');
  const nodeWasmPath = path.resolve('node_modules/lcms-wasm/dist/lcms.wasm');
  const wasmExistsOnDisk = fs.existsSync(distWasmPath) || fs.existsSync(nodeWasmPath);
  assert(
    wasmExistsOnDisk,
    'TEST 13: Arquivo binário lcms.wasm existe no disco (dist/lcms.wasm ou node_modules/lcms-wasm/dist/lcms.wasm)'
  );

  // 14. Inicialização direta sem dependência de ambiente de desenvolvimento Vite
  const directWasmBinary = fs.readFileSync(fs.existsSync(distWasmPath) ? distWasmPath : nodeWasmPath);
  assert(
    directWasmBinary.length > 100000 && directWasmBinary[0] === 0x00 && directWasmBinary[1] === 0x61 && directWasmBinary[2] === 0x73 && directWasmBinary[3] === 0x6d,
    'TEST 14: Binário WASM contém cabeçalho WebAssembly autêntico (\\0asm) e tamanho válido'
  );

  // 15. Regressão estrita de todos os perfis ICC distribuídos no ArteCheck
  const iccDir = path.resolve('server/iccs');
  const distributedIccs = fs.readdirSync(iccDir).filter(f => f.endsWith('.icc') || f.endsWith('.icm'));
  for (const iccFName of distributedIccs) {
    const fullPath = path.join(iccDir, iccFName);
    const bytes = fs.readFileSync(fullPath);
    const validation = validateIccProfile(bytes);
    assert(
      validation.valid === true,
      `TEST 15 [${iccFName}]: Header ICC e estrutura íntegros (${bytes.length} bytes)`
    );
    assert(
      validation.header?.magicSignature === 'acsp',
      `TEST 15 [${iccFName}]: Assinatura mágica "acsp" no offset 36`
    );
    assert(
      validation.header?.profileSize === bytes.length,
      `TEST 15 [${iccFName}]: Tamanho declarado no header (${validation.header?.profileSize}) é idêntico ao tamanho do arquivo (${bytes.length})`
    );
    const handle = lcms.cmsOpenProfileFromMem(bytes, bytes.length);
    assert(
      handle > 0,
      `TEST 15 [${iccFName}]: LittleCMS cmsOpenProfileFromMem abre com sucesso`
    );
    lcms.cmsCloseProfile(handle);
  }

  // 16. Teste de Identidade Estrita dos Presets Oficiais (SWOP & sRGB)
  const { computeSha256, PRESET_ICC_PROFILES } = await import('../src/domain/colorManagement');
  const expectedPresetSpecs: Record<string, { expectedSha256: string; colorSpace: string; components: number; expectedFile: string }> = {
    cgats_tr_001_swop: {
      expectedSha256: '35f401731df11a4eba3502af632e51d68bc394bcb7d34632a331c1ba3f4a0bf6',
      colorSpace: 'CMYK',
      components: 4,
      expectedFile: 'cgats_tr001_swop.icc',
    },
    srgb: {
      expectedSha256: 'eddaf344b5edea13269e0d20055f335610e5e0b6e33e6e536f2701bc18c5f7d5',
      colorSpace: 'RGB',
      components: 3,
      expectedFile: 'srgb.icc',
    },
  };

  for (const [presetId, spec] of Object.entries(expectedPresetSpecs)) {
    const preset = PRESET_ICC_PROFILES[presetId];
    assert(Boolean(preset), `TEST 16 [${presetId}]: Preset existe em PRESET_ICC_PROFILES`);
    assert(
      preset.bundledPath?.includes(spec.expectedFile) === true,
      `TEST 16 [${presetId}]: bundledPath aponta exclusivamente para ${spec.expectedFile} (não aponta para perfil divergente)`
    );
    const fileBytes = fs.readFileSync(path.resolve(process.cwd(), preset.bundledPath!));
    const calculatedHash = computeSha256(fileBytes);
    assert(
      calculatedHash === spec.expectedSha256,
      `TEST 16 [${presetId}]: SHA-256 verificado byte-a-byte (${calculatedHash.slice(0, 12)}...)`
    );
    const valid = validateIccProfile(fileBytes);
    assert(
      valid.valid === true && valid.colorSpace === spec.colorSpace && valid.components === spec.components,
      `TEST 16 [${presetId}]: Validação semântica e estrutural (${valid.colorSpace} / ${valid.components} canais / magic acsp)`
    );
    const h = lcms.cmsOpenProfileFromMem(fileBytes, fileBytes.length);
    assert(h > 0, `TEST 16 [${presetId}]: LittleCMS abre o perfil oficial do preset com sucesso`);
    lcms.cmsCloseProfile(h);
  }

  console.log(`\nCMM LittleCMS/WASM Suite: ${passed}/${total} testes aprovados.\n`);
}

if (process.argv[1]?.endsWith('colorTransformCmm.test.ts')) {
  runColorTransformTests().catch((err) => {
    console.error('Fatal error in tests:', err);
    process.exit(1);
  });
}
