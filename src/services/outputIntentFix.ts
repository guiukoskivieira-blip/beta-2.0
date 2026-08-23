import { PDFDocument, PDFName, PDFString, PDFNumber, PDFArray } from 'pdf-lib';
import fs from 'fs';
import path from 'path';
import type { PdfDocumentStructure, RuleEngineSummary } from '../types';
import type { ProductionProfile } from '../utils/productionProfiles';
import { COMMERCIAL_PRINT_300DPI_PROFILE } from '../utils/productionProfiles';
import { runDeterministicRuleEngine } from '../utils/ruleEngine';
import { extractPdfStructure } from '../../server/pdfExtractor';
import {
  ColorManagementContract,
  validateIccProfile,
  PRESET_ICC_PROFILES,
} from '../domain/colorManagement';
import { evaluateFixContract, FixActionResult, FixContractResult } from './fixEngine';

export interface OutputIntentFixAuditEntry {
  ruleId: string;
  fixType: 'output_intent';
  timestamp: number;
  iccProfileId: string;
  iccProfileName: string;
  outputConditionIdentifier: string;
  components: number;
  colorSpace: string;
  iccByteLength: number;
  iccSha256?: string;
  revalidationResult: {
    ruleStatus: 'approved' | 'error' | 'warning' | 'undetermined';
    outputIntentDetected: boolean;
    iccStreamDetected: boolean;
    validated: boolean;
    message: string;
  };
}

export interface OutputIntentFixResult {
  success: boolean;
  actionResult: FixActionResult;
  pdfBytes?: Uint8Array;
  contract: FixContractResult;
  audit?: OutputIntentFixAuditEntry;
  structuralValidation?: {
    valid: boolean;
    checks: { header: boolean; eof: boolean; xrefOrTrailer: boolean; reparseable: boolean };
    message: string;
  };
  revalidation?: {
    outputIntentDetected: boolean;
    iccStreamDetected: boolean;
    outputConditionIdentifier?: string;
    iccByteLength?: number;
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
  const candidates = [
    preset?.bundledPath ? path.resolve(process.cwd(), preset.bundledPath) : null,
    path.resolve(process.cwd(), 'dist/iccs/cgats_tr001_swop.icc'),
    path.resolve(process.cwd(), 'server/iccs/cgats_tr001_swop.icc'),
  ].filter(Boolean) as string[];

  for (const p of candidates) {
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
 * Applies a verified OutputIntent and authentic ICC profile to a new copy of the PDF.
 * Original PDF buffer is NEVER mutated.
 *
 * Requirements:
 * 1. Validate real ICC profile bytes (min 128 bytes, 'acsp' magic, valid color space).
 * 2. Reject empty, corrupted, or non-conforming ICC data.
 * 3. Embed ICC stream in PDF context with /N and /Alternate.
 * 4. Create OutputIntent dictionary and attach to Catalog /OutputIntents.
 * 5. Save with traditional xref (useObjectStreams: false).
 * 6. Reopen generated PDF, run extractor and Motor 1 rule engine.
 * 7. verified = true ONLY IF OutputIntent and ICC stream are physically confirmed in the reloaded PDF.
 */
export async function applyOutputIntentFix(
  originalPdfBuffer: Uint8Array | Buffer,
  contract: Partial<ColorManagementContract>,
  iccBytesInput?: Uint8Array | Buffer | null,
  profile: ProductionProfile = COMMERCIAL_PRINT_300DPI_PROFILE
): Promise<OutputIntentFixResult> {
  const timestamp = Date.now();
  const ruleId = 'RULE-PDFX-001';

  // 1. Guard against empty original PDF
  if (!originalPdfBuffer || originalPdfBuffer.length < 5) {
    const fixContract = evaluateFixContract(
      ruleId,
      'fix_output_intent',
      'warning',
      'Configurar perfil de saída / Output Intent',
      'failed',
      'error',
      'Arquivo PDF original inválido ou vazio.'
    );
    return {
      success: false,
      actionResult: 'failed',
      contract: fixContract,
      error: 'Arquivo PDF original inválido ou vazio.',
    };
  }

  // 2. Resolve ICC Profile bytes
  const iccBytes = resolveIccBytes(iccBytesInput, contract.iccProfileId);

  if (!iccBytes || iccBytes.length === 0) {
    const fixContract = evaluateFixContract(
      ruleId,
      'fix_output_intent',
      'warning',
      'Configurar perfil de saída / Output Intent',
      'user_input_required',
      'warning',
      'Nenhum perfil ICC real fornecido. A configuração de Output Intent é assistida e requer um arquivo ICC calibrado.'
    );
    return {
      success: false,
      actionResult: 'user_input_required',
      contract: fixContract,
      error: 'Perfil ICC ausente. Forneça um arquivo .icc/.icm real ou selecione um preset calibrado.',
    };
  }

  // 3. Strict Content Validation of the ICC Profile
  const iccValidation = validateIccProfile(iccBytes);
  if (!iccValidation.valid) {
    const fixContract = evaluateFixContract(
      ruleId,
      'fix_output_intent',
      'warning',
      'Configurar perfil de saída / Output Intent',
      'failed',
      'warning',
      `Perfil ICC rejeitado: ${iccValidation.error}`
    );
    return {
      success: false,
      actionResult: 'failed',
      contract: fixContract,
      error: `Perfil ICC inválido ou corrompido: ${iccValidation.error}`,
    };
  }

  // 4. Resolve metadata values
  const targetColorSpace = contract.targetColorSpace || iccValidation.colorSpace || 'CMYK';
  const components = iccValidation.components || (targetColorSpace === 'CMYK' ? 4 : targetColorSpace === 'RGB' ? 3 : 1);
  const outputConditionIdentifier = contract.outputConditionIdentifier || 'CGATS TR 001';
  const outputCondition = contract.info || outputConditionIdentifier;
  const registryName = contract.registryName || 'http://www.color.org';
  const info = contract.info || outputConditionIdentifier;
  const iccProfileName = contract.iccProfileName || outputConditionIdentifier;
  const iccProfileId = contract.iccProfileId || 'custom_icc';

  try {
    // 5. Load a clean copy of the original PDF in pdf-lib (original remains untouched)
    const pdfDoc = await PDFDocument.load(originalPdfBuffer, {
      ignoreEncryption: true,
      updateMetadata: false,
    });

    // 6. Embed ICC Stream with /N and /Alternate
    const alternateName = `Device${targetColorSpace === 'CMYK' ? 'CMYK' : targetColorSpace === 'RGB' ? 'RGB' : 'Gray'}`;
    const iccStream = pdfDoc.context.flateStream(iccBytes, {
      N: PDFNumber.of(components),
      Alternate: PDFName.of(alternateName),
    });
    const iccStreamRef = pdfDoc.context.register(iccStream);

    // 7. Create OutputIntent dictionary
    const outputIntentDict = pdfDoc.context.obj({
      Type: PDFName.of('OutputIntent'),
      S: PDFName.of('GTS_PDFX'),
      OutputConditionIdentifier: PDFString.of(outputConditionIdentifier),
      OutputCondition: PDFString.of(outputCondition),
      RegistryName: PDFString.of(registryName),
      Info: PDFString.of(info),
      DestOutputProfile: iccStreamRef,
    });
    const outputIntentRef = pdfDoc.context.register(outputIntentDict);

    // 8. Attach to Catalog /OutputIntents
    let catalogOutputIntents = pdfDoc.catalog.get(PDFName.of('OutputIntents'));
    if (!catalogOutputIntents || !(catalogOutputIntents instanceof PDFArray)) {
      catalogOutputIntents = pdfDoc.context.obj([outputIntentRef]);
      pdfDoc.catalog.set(PDFName.of('OutputIntents'), catalogOutputIntents);
    } else {
      catalogOutputIntents.push(outputIntentRef);
    }

    // 9. Serialize with traditional xref (useObjectStreams: false)
    const outputBytes = await pdfDoc.save({
      useObjectStreams: false,
      addDefaultPage: false,
    });

    // 10. Perform Structural Verification on Output PDF
    const outBuf = Buffer.from(outputBytes);
    const hasHeader = outBuf.subarray(0, 1024).includes(Buffer.from('%PDF-'));
    const tailChunk = outBuf.subarray(Math.max(0, outBuf.length - 1024));
    const hasEof = tailChunk.includes(Buffer.from('%%EOF'));
    const hasXref = tailChunk.includes(Buffer.from('startxref')) || tailChunk.includes(Buffer.from('xref'));

    if (!hasHeader || !hasEof || !hasXref) {
      const fixContract = evaluateFixContract(
        ruleId,
        'fix_output_intent',
        'warning',
        'Configurar perfil de saída / Output Intent',
        'failed',
        'error',
        'Falha na integridade estrutural do PDF gerado com OutputIntent.'
      );
      return {
        success: false,
        actionResult: 'failed',
        contract: fixContract,
        structuralValidation: {
          valid: false,
          checks: { header: hasHeader, eof: hasEof, xrefOrTrailer: hasXref, reparseable: false },
          message: 'PDF gerado com falha estrutural de serialização.',
        },
        error: 'PDF gerado corrompido durante serialização.',
      };
    }

    // 11. Reopen, run Extractor and Motor 1 for true verified confirmation
    const reloadedDoc = await extractPdfStructure(Buffer.from(outputBytes));
    const reloadedRules = runDeterministicRuleEngine(reloadedDoc, profile);

    const reloadedIntents = reloadedDoc.outputIntents || [];
    const matchedIntent = reloadedIntents.find(
      (oi) =>
        oi.outputConditionIdentifier === outputConditionIdentifier ||
        oi.subtype === 'GTS_PDFX' ||
        oi.type === 'OutputIntent'
    );

    const outputIntentDetected = Boolean(matchedIntent);
    const iccStreamDetected = Boolean(matchedIntent?.hasDestOutputProfile && (matchedIntent?.destOutputProfile?.byteLength || 0) > 0);

    // Motor 1 rule status
    const targetRuleResult = reloadedRules.results.find((r) => r.ruleId === ruleId);
    const ruleStatus = targetRuleResult?.status || 'approved';

    const isValidated = outputIntentDetected && iccStreamDetected;

    const audit: OutputIntentFixAuditEntry = {
      ruleId,
      fixType: 'output_intent',
      timestamp,
      iccProfileId,
      iccProfileName,
      outputConditionIdentifier,
      components,
      colorSpace: targetColorSpace,
      iccByteLength: iccBytes.length,
      iccSha256: iccValidation.sha256,
      revalidationResult: {
        ruleStatus,
        outputIntentDetected,
        iccStreamDetected,
        validated: isValidated,
        message: isValidated
          ? `Output Intent (${outputConditionIdentifier}) e perfil ICC (${iccBytes.length} bytes, SHA-256: ${iccValidation.shortSha256}) incorporados e verificados com sucesso.`
          : 'Output Intent ou stream ICC não confirmados na reanálise do documento.',
      },
    };

    const actionResult: FixActionResult = isValidated ? 'corrected' : 'failed';
    const fixContract = evaluateFixContract(
      ruleId,
      'fix_output_intent',
      'warning',
      'Configurar perfil de saída / Output Intent',
      actionResult,
      isValidated ? 'approved' : ruleStatus,
      audit.revalidationResult.message
    );

    return {
      success: isValidated,
      actionResult,
      pdfBytes: outputBytes,
      contract: fixContract,
      audit,
      structuralValidation: {
        valid: true,
        checks: { header: true, eof: true, xrefOrTrailer: true, reparseable: true },
        message: 'Estrutura do PDF 100% válida e parseável após inclusão do OutputIntent.',
      },
      revalidation: {
        outputIntentDetected,
        iccStreamDetected,
        outputConditionIdentifier: matchedIntent?.outputConditionIdentifier,
        iccByteLength: matchedIntent?.destOutputProfile?.byteLength,
        validated: isValidated,
        message: audit.revalidationResult.message,
      },
    };
  } catch (err: any) {
    const fixContract = evaluateFixContract(
      ruleId,
      'fix_output_intent',
      'warning',
      'Configurar perfil de saída / Output Intent',
      'failed',
      'error',
      err.message || 'Erro inesperado ao incorporar Output Intent no PDF.'
    );
    return {
      success: false,
      actionResult: 'failed',
      contract: fixContract,
      error: err.message || 'Erro ao incorporar Output Intent no PDF.',
    };
  }
}
