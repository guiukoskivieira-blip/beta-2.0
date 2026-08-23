import { PDFDocument, PDFName, PDFDict, PDFArray, PDFNumber, PDFString } from 'pdf-lib';
import fs from 'fs';
import path from 'path';
import {
  validateIccProfile,
  PRESET_ICC_PROFILES,
} from '../src/domain/colorManagement';
import {
  applyOutputIntentFix,
  resolveIccBytes,
} from '../src/services/outputIntentFix';
import { extractPdfStructure } from '../server/pdfExtractor';
import { runDeterministicRuleEngine } from '../src/utils/ruleEngine';
import {
  COMMERCIAL_PRINT_300DPI_PROFILE,
  A4_COMMERCIAL_FLYER_PROFILE,
} from '../src/utils/productionProfiles';
import { applyTrimBleedFix } from '../src/services/trimBleedFix';

let passedCount = 0;
let totalCount = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  totalCount++;
  if (condition) {
    passedCount++;
    console.log(`  ✓ ${testName}`);
  } else {
    console.error(`  ✗ FAIL: ${testName}`);
    if (detail) console.error(`    Detail: ${detail}`);
  }
}

async function runOutputIntentTests() {
  console.log('\n================================================================');
  console.log('ARTECHECK — OUTPUT INTENT / ICC REAL TEST SUITE');
  console.log('================================================================\n');

  // Load real ICC profile from bundled path
  const realIccPath = path.resolve(process.cwd(), 'server/iccs/cgats_tr001_swop.icc');
  const realIccBytes = fs.readFileSync(realIccPath);

  // 1. ICC válido é aceito
  const validValidation = validateIccProfile(realIccBytes);
  assert(
    validValidation.valid === true && validValidation.header?.magicSignature === 'acsp',
    'TEST 1: ICC válido é aceito com assinatura "acsp" e dados íntegros'
  );

  // 2. ICC inválido é rejeitado
  const fakeIccBytes = Buffer.from('FAKE_ICC_HEADER_WITHOUT_MAGIC_BYTES_AND_INVALID_STRUCTURE_1234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890');
  const invalidValidation = validateIccProfile(fakeIccBytes);
  assert(
    invalidValidation.valid === false && Boolean(invalidValidation.error),
    'TEST 2: ICC inválido (sem assinatura mágica acsp) é estritamente rejeitado'
  );

  // 3. ICC vazio é rejeitado
  const emptyValidation = validateIccProfile(new Uint8Array(0));
  const nullValidation = validateIccProfile(null);
  assert(
    emptyValidation.valid === false && nullValidation.valid === false,
    'TEST 3: ICC vazio ou nulo é estritamente rejeitado'
  );

  // 4. Número de componentes do ICC é validado
  assert(
    validValidation.components === 4 && validValidation.colorSpace === 'CMYK',
    'TEST 4: Número de componentes (4) e espaço de cores (CMYK) do ICC validados pelo conteúdo'
  );

  // Helper to create a clean minimal PDF
  async function createSamplePdf(widthPt = 595.28, heightPt = 841.89) {
    const doc = await PDFDocument.create();
    doc.addPage([widthPt, heightPt]);
    return await doc.save({ useObjectStreams: false });
  }

  const samplePdfBytes = await createSamplePdf();
  const originalSnapshot = Buffer.from(samplePdfBytes);

  // 5. OutputIntent é realmente escrito
  const fixResult = await applyOutputIntentFix(
    samplePdfBytes,
    {
      iccProfileId: 'cgats_tr_001_swop',
      outputConditionIdentifier: 'CGATS TR 001',
      targetColorSpace: 'CMYK',
    },
    realIccBytes
  );

  assert(
    fixResult.success === true && Boolean(fixResult.pdfBytes),
    'TEST 5: OutputIntent e stream ICC são realmente escritos no PDF'
  );

  // 6. Parser detecta OutputIntent após geração
  const reloadedDoc = await extractPdfStructure(Buffer.from(fixResult.pdfBytes!));
  assert(
    Boolean(reloadedDoc.outputIntents && reloadedDoc.outputIntents.length > 0) &&
    reloadedDoc.outputIntents![0].outputConditionIdentifier === 'CGATS TR 001',
    'TEST 6: Parser detecta OutputIntent no catálogo após a geração'
  );

  // 7. Parser detecta ICC incorporado
  assert(
    Boolean(reloadedDoc.outputIntents![0].hasDestOutputProfile) &&
    reloadedDoc.outputIntents![0].destOutputProfile?.isValidIcc === true &&
    reloadedDoc.outputIntents![0].destOutputProfile?.components === 4 &&
    reloadedDoc.outputIntents![0].destOutputProfile?.byteLength === realIccBytes.length,
    'TEST 7: Parser detecta e valida o stream ICC incorporado com tamanho e componentes corretos'
  );

  // 8. Original permanece byte-a-byte intacto
  assert(
    Buffer.compare(Buffer.from(samplePdfBytes), originalSnapshot) === 0,
    'TEST 8: Arquivo original permanece 100% byte-a-byte intacto e imutável'
  );

  // 9. Operação falha sem ICC
  const noIccResult = await applyOutputIntentFix(
    samplePdfBytes,
    {
      iccProfileId: 'non_existent_icc_id',
      outputConditionIdentifier: 'CUSTOM',
    },
    null
  );
  assert(
    noIccResult.success === false &&
    noIccResult.actionResult === 'user_input_required' &&
    noIccResult.contract.verified === false,
    'TEST 9: Operação falha de forma segura sem ICC, exigindo entrada do usuário'
  );

  // 10. Operação não declara PDF/X falsamente
  assert(
    reloadedDoc.pdfxInfo?.isDeclaredPdfX === false,
    'TEST 10: Inclusão de OutputIntent NÃO declara falsamente conformidade normativa PDF/X'
  );

  // 11. Verified só ocorre após reanálise
  assert(
    fixResult.contract.verified === true &&
    fixResult.revalidation?.validated === true &&
    fixResult.revalidation?.outputIntentDetected === true,
    'TEST 11: Contrato verified=true ocorre APENAS após reanálise confirmar presença do OutputIntent e ICC'
  );

  // 12. PDF gerado permanece parseável
  const reparsedDoc = await PDFDocument.load(fixResult.pdfBytes!);
  assert(
    reparsedDoc.getPageCount() === 1,
    'TEST 12: PDF gerado com OutputIntent é 100% íntegro e legível pelo PDFDocument'
  );

  // 13. TrimBox/BleedBox continua funcionando após OutputIntent
  // Create a PDF with 216x303 mm (sufficient for A4 + 3mm bleed)
  const a4BleedDoc = await PDFDocument.create();
  const p = a4BleedDoc.addPage([216 * (72 / 25.4), 303 * (72 / 25.4)]);
  const a4BleedPdfBytes = await a4BleedDoc.save({ useObjectStreams: false });

  // Apply OutputIntent first
  const withIntentResult = await applyOutputIntentFix(
    a4BleedPdfBytes,
    { iccProfileId: 'cgats_tr_001_swop' },
    realIccBytes
  );
  const withIntentStructure = await extractPdfStructure(Buffer.from(withIntentResult.pdfBytes!));

  // Now apply Trim/Bleed fix to the PDF containing OutputIntent
  const trimFixResult = await applyTrimBleedFix(
    withIntentResult.pdfBytes!,
    withIntentStructure,
    A4_COMMERCIAL_FLYER_PROFILE
  );

  assert(
    trimFixResult.success === true &&
    trimFixResult.revalidation.ruleStatus === 'approved',
    'TEST 13: Correção de TrimBox/BleedBox continua funcionando perfeitamente em PDFs com OutputIntent'
  );

  // 14. DPI e regras existentes continuam funcionando
  const rulesSummary = runDeterministicRuleEngine(reloadedDoc, COMMERCIAL_PRINT_300DPI_PROFILE);
  const structRule = rulesSummary.results.find((r) => r.ruleId === 'RULE-STRUCT-001');
  const geomRule = rulesSummary.results.find((r) => r.ruleId === 'RULE-GEOM-001');
  const dataRule = rulesSummary.results.find((r) => r.ruleId === 'RULE-DATA-001');
  const fontRule = rulesSummary.results.find((r) => r.ruleId === 'RULE-FONT-001');
  const dpiRule = rulesSummary.results.find((r) => r.ruleId === 'RULE-PROF-DPI-001');

  assert(
    structRule?.status === 'approved' &&
    geomRule?.status === 'approved' &&
    dataRule?.status === 'approved' &&
    fontRule?.status === 'approved' &&
    dpiRule?.status === 'approved',
    'TEST 14: Regras determinísticas existentes (Estrutura, Geometria, Tipografia, DPI) continuam íntegras'
  );

  console.log(`\nOutput Intent / ICC: ${passedCount}/${totalCount} aprovados\n`);
  if (passedCount !== totalCount) {
    process.exit(1);
  }
}

runOutputIntentTests().catch((e) => {
  console.error('Fatal error in tests:', e);
  process.exit(1);
});
