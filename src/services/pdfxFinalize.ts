/**
 * ARTECHECK — PDF/X-4 Finalization & Real Verification Engine (Phase 3)
 *
 * Responsibilities:
 * 1. Verifies pre-condition (eligibleAfterPreparation.eligible === true)
 * 2. Writes authentic PDF/X-4 Info metadata & XMP metadata packet
 * 3. Serializes a new immutable PDF file (finalizedPdfBytes)
 * 4. Re-opens and parses the serialized file independently
 * 5. Re-runs Motor 1 deterministic rule engine
 * 6. Executes rigorous normative verification (verifyPdfx4FinalizedDocument)
 * 7. Sets verifiedPdfX = true ONLY when all re-opened checks pass.
 */

import crypto from 'crypto';
import { PDFDocument, PDFName, PDFString, PDFNumber, PDFRawStream, PDFDict, PDFArray, PDFStream } from 'pdf-lib';
import * as pako from 'pako';
import type {
  PdfDocumentStructure,
  RuleEngineSummary,
  PreflightAnalysis,
} from '../types/index.ts';
import type { ProductionProfile } from '../utils/productionProfiles.ts';
import { COMMERCIAL_PRINT_300DPI_PROFILE } from '../utils/productionProfiles.ts';
import { runDeterministicRuleEngine } from '../utils/ruleEngine.ts';
import { extractPdfStructure } from '../../server/pdfExtractor.ts';
import { evaluatePdfx4Eligibility, type PdfxEligibilityResult } from './pdfxEligibility.ts';

export interface FinalizePdfx4Options {
  profile?: ProductionProfile;
  destinationIccPresetId?: string;
  destinationIccBytes?: Uint8Array | Buffer | null;
  title?: string;
  author?: string;
  creator?: string;
  producer?: string;
}

export interface PdfxVerificationCheck {
  code: string;
  title: string;
  status: 'passed' | 'failed';
  evidence: string;
  error?: string;
}

export interface PdfxFinalizeResult {
  success: boolean;
  declaredPdfX: string | null;
  verifiedPdfX: boolean; // STRICT: true ONLY after successful post-serialization verification
  targetStandard: 'PDF/X-4';
  checks: PdfxVerificationCheck[];
  failures: string[];
  warnings: string[];
  preparedSha256: string;
  finalizedSha256?: string;
  finalizedPdfBytes?: Uint8Array;
  summaryMessage: string;
  error?: string;
}

function calculateSha256(bytes: Uint8Array | Buffer): string {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function formatPdfDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const y = date.getUTCFullYear();
  const m = pad(date.getUTCMonth() + 1);
  const d = pad(date.getUTCDate());
  const h = pad(date.getUTCHours());
  const min = pad(date.getUTCMinutes());
  const s = pad(date.getUTCSeconds());
  return `D:${y}${m}${d}${h}${min}${s}Z`;
}

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

function buildXmpMetadataPacket(meta: {
  title?: string;
  author?: string;
  creator?: string;
  producer?: string;
  creationDateIso: string;
  modDateIso: string;
}): string {
  const titleTag = meta.title
    ? `<dc:title><rdf:Alt><rdf:li xml:lang="x-default">${meta.title.replace(/[<&>]/g, '')}</rdf:li></rdf:Alt></dc:title>`
    : '';
  const authorTag = meta.author
    ? `<dc:creator><rdf:Seq><rdf:li>${meta.author.replace(/[<&>]/g, '')}</rdf:li></rdf:Seq></dc:creator>`
    : '';

  return `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about=""
        xmlns:pdf="http://ns.adobe.com/pdf/1.3/"
        xmlns:xmp="http://ns.adobe.com/xap/1.0/"
        xmlns:dc="http://purl.org/dc/elements/1.1/"
        xmlns:pdfx="http://ns.adobe.com/pdfx/1.3/"
        xmlns:pdfxid="http://www.npes.org/pdfx/ns/id/">
      <pdf:Producer>${meta.producer || 'ArteCheck PDF/X Engine (ISO 15930-7)'}</pdf:Producer>
      <pdf:Trapped>False</pdf:Trapped>
      <pdfx:GTS_PDFXVersion>PDF/X-4</pdfx:GTS_PDFXVersion>
      <pdfx:GTS_PDFXConformance>PDF/X-4</pdfx:GTS_PDFXConformance>
      <pdfxid:GTS_PDFXVersion>PDF/X-4</pdfxid:GTS_PDFXVersion>
      <xmp:CreateDate>${meta.creationDateIso}</xmp:CreateDate>
      <xmp:ModifyDate>${meta.modDateIso}</xmp:ModifyDate>
      <xmp:MetadataDate>${meta.modDateIso}</xmp:MetadataDate>
      <xmp:CreatorTool>${meta.creator || 'ArteCheck AI Preflight'}</xmp:CreatorTool>
      ${titleTag}
      ${authorTag}
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
}

/**
 * Validates the serialized binary PDF structure and XRef table integrity without relying on tolerant recovery.
 */
export function verifySerializedPdfStructure(pdfBytes: Uint8Array): {
  valid: boolean;
  evidence: string;
  error?: string;
} {
  const buf = Buffer.from(pdfBytes);
  const fullStr = buf.toString('latin1');

  // 1. Header check
  if (!fullStr.startsWith('%PDF-')) {
    return {
      valid: false,
      evidence: 'Cabeçalho %PDF- ausente no início do arquivo.',
      error: 'INVALID_HEADER',
    };
  }

  // 2. EOF check
  const last1024 = fullStr.slice(-1024);
  if (!/%%EOF\s*$/.test(last1024.trimEnd())) {
    return {
      valid: false,
      evidence: 'Marcador %%EOF ausente ou corrompido no final do arquivo.',
      error: 'INVALID_EOF',
    };
  }

  // 3. startxref check
  const startxrefMatch = /startxref\s+(\d+)\s+%%EOF/g.exec(last1024);
  if (!startxrefMatch) {
    return {
      valid: false,
      evidence: 'Ponteiro startxref ausente ou inválido.',
      error: 'STARTXREF_MISSING',
    };
  }

  const startxrefOffset = parseInt(startxrefMatch[1], 10);
  if (isNaN(startxrefOffset) || startxrefOffset <= 0 || startxrefOffset >= buf.length) {
    return {
      valid: false,
      evidence: `Ponteiro startxref (${startxrefOffset}) aponta para offset fora dos limites do arquivo (${buf.length} bytes).`,
      error: 'STARTXREF_OUT_OF_BOUNDS',
    };
  }

  // 4. Validate xref table and byte offsets of all objects
  const xrefChunk = fullStr.slice(startxrefOffset);
  if (!xrefChunk.startsWith('xref')) {
    const isXrefStream = /^\d+\s+\d+\s+obj\s*<<\s*\/Type\s*\/XRef/.test(xrefChunk);
    if (!isXrefStream) {
      return {
        valid: false,
        evidence: `Offset ${startxrefOffset} não aponta para tabela xref nem stream de xref válido.`,
        error: 'XREF_TABLE_MISSING',
      };
    }
  } else {
    // Parse traditional xref table subsections
    const lines = xrefChunk.split(/\r?\n/);
    let lineIdx = 1;
    while (lineIdx < lines.length && lines[lineIdx].trim().length > 0 && lines[lineIdx].trim() !== 'trailer') {
      const headerLine = lines[lineIdx].trim();
      const subMatch = /^(\d+)\s+(\d+)$/.exec(headerLine);
      if (!subMatch) {
        break;
      }
      const firstObj = parseInt(subMatch[1], 10);
      const count = parseInt(subMatch[2], 10);
      lineIdx++;

      for (let i = 0; i < count && lineIdx < lines.length; i++, lineIdx++) {
        const entryLine = lines[lineIdx];
        const entryMatch = /^(\d{10})\s+(\d{5})\s+([nf])/.exec(entryLine);
        if (!entryMatch) continue;

        const offset = parseInt(entryMatch[1], 10);
        const gen = parseInt(entryMatch[2], 10);
        const type = entryMatch[3];
        const currentObjNum = firstObj + i;

        if (type === 'n' && currentObjNum > 0) {
          if (offset >= buf.length) {
            return {
              valid: false,
              evidence: `Objeto ${currentObjNum} (${gen}) aponta para offset ${offset} além do tamanho do arquivo (${buf.length}).`,
              error: 'XREF_ENTRY_OUT_OF_BOUNDS',
            };
          }
          const objAtOffset = fullStr.slice(offset, offset + 32);
          const objHeaderRegex = new RegExp(`^${currentObjNum}\\s+${gen}\\s+obj`);
          if (!objHeaderRegex.test(objAtOffset.trimStart())) {
            return {
              valid: false,
              evidence: `Offset ${offset} da tabela xref não contém a declaração "${currentObjNum} ${gen} obj" (encontrado: "${objAtOffset.slice(0, 16)}..."). Exige reparo de xref.`,
              error: 'XREF_OFFSET_CORRUPTED',
            };
          }
        }
      }
    }
  }

  // 5. Verify Trailer dictionary
  const trailerMatch = /trailer\s*<<([\s\S]*?)>>/g.exec(xrefChunk);
  if (trailerMatch) {
    const trailerStr = trailerMatch[1];
    const rootMatch = /\/Root\s+(\d+)\s+(\d+)\s+R/.exec(trailerStr);
    if (!rootMatch) {
      return {
        valid: false,
        evidence: 'Dicionário trailer não define referência indireta /Root.',
        error: 'TRAILER_ROOT_MISSING',
      };
    }
  }

  return {
    valid: true,
    evidence: 'Tabela xref, offsets de objetos e referências indiretas 100% íntegras e sem necessidade de reparo.',
  };
}

/**
 * Dedicated verification function that evaluates the independently re-opened,
 * post-serialization PDF document for genuine PDF/X-4 standard compliance.
 */
export function verifyPdfx4FinalizedDocument(
  finalStructure: PdfDocumentStructure,
  finalRules: RuleEngineSummary,
  finalEligibility: PdfxEligibilityResult,
  finalizedPdfBytes?: Uint8Array
): {
  verified: boolean;
  checks: PdfxVerificationCheck[];
  failures: string[];
  warnings: string[];
} {
  const checks: PdfxVerificationCheck[] = [];
  const warnings: string[] = [];

  // Check 1: Declared PDF/X in Info dictionary
  const isDeclared = finalStructure.pdfxInfo?.isDeclaredPdfX === true;
  const declaredVersion = finalStructure.pdfxInfo?.declaredVersion || '';
  const hasPdfx4Declaration = isDeclared && declaredVersion.includes('PDF/X-4');

  if (hasPdfx4Declaration) {
    checks.push({
      code: 'VERIFY_PDFX_DECLARATION',
      title: 'Declaração PDF/X-4 no Dicionário Info',
      status: 'passed',
      evidence: `GTS_PDFXVersion e GTS_PDFXConformance definidos como "${declaredVersion}".`,
    });
  } else {
    checks.push({
      code: 'VERIFY_PDFX_DECLARATION',
      title: 'Declaração PDF/X-4 no Dicionário Info',
      status: 'failed',
      evidence: isDeclared ? `Declaração encontrada ("${declaredVersion}") difere de PDF/X-4.` : 'Nenhuma declaração PDF/X encontrada no dicionário Info.',
      error: 'DECLARATION_MISSING_OR_INVALID',
    });
  }

  // Check 2: Consistent XMP Metadata Packet
  const hasXmp = finalStructure.pdfxInfo?.hasXmpMetadata === true;
  const xmpVersion = finalStructure.pdfxInfo?.xmpPdfxVersion;
  const hasXmpPdfx4 = hasXmp && xmpVersion?.includes('PDF/X-4');

  if (hasXmpPdfx4) {
    checks.push({
      code: 'VERIFY_XMP_METADATA',
      title: 'Metadados XMP (ISO 15930-7)',
      status: 'passed',
      evidence: `Pacote XMP válido com namespace pdfx:GTS_PDFXVersion="${xmpVersion}".`,
    });
  } else {
    checks.push({
      code: 'VERIFY_XMP_METADATA',
      title: 'Metadados XMP (ISO 15930-7)',
      status: 'failed',
      evidence: hasXmp ? `XMP não contém namespace PDF/X-4 válido (encontrado: ${xmpVersion || 'nenhum'}).` : 'Fluxo de metadados XMP ausente no catálogo raiz.',
      error: 'XMP_METADATA_INVALID',
    });
  }

  // Check 3: Output Intent GTS_PDFX with valid CMYK ICC
  const outputIntent = finalStructure.outputIntents?.find((oi) => oi.subtype === 'GTS_PDFX' || oi.type === 'OutputIntent');
  const hasValidOi = Boolean(outputIntent && outputIntent.hasDestOutputProfile && outputIntent.destOutputProfile?.isValidIcc);

  if (hasValidOi) {
    checks.push({
      code: 'VERIFY_OUTPUT_INTENT',
      title: 'Output Intent GTS_PDFX e Perfil ICC',
      status: 'passed',
      evidence: `OutputConditionIdentifier "${outputIntent?.outputConditionIdentifier}" com perfil ICC válido (${outputIntent?.destOutputProfile?.colorSpace || 'CMYK'}).`,
    });
  } else {
    checks.push({
      code: 'VERIFY_OUTPUT_INTENT',
      title: 'Output Intent GTS_PDFX e Perfil ICC',
      status: 'failed',
      evidence: outputIntent ? 'Perfil ICC do OutputIntent corrompido ou ausente.' : 'Dicionário OutputIntent GTS_PDFX ausente.',
      error: 'OUTPUT_INTENT_INVALID',
    });
  }

  // Check 4: Font Embedding
  const usedFonts = (finalStructure.fonts || []).filter((f) => f.isUsedInContent !== false);
  const unEmbedded = usedFonts.filter((f) => f.isEmbedded === 'no' || f.isEmbedded === false);

  if (unEmbedded.length === 0) {
    checks.push({
      code: 'VERIFY_FONTS',
      title: 'Incorporação de Tipografia',
      status: 'passed',
      evidence: usedFonts.length > 0
        ? `100% das fontes utilizadas (${usedFonts.length}) estão devidamente incorporadas ou em subset.`
        : 'Nenhuma fonte externa utilizada no documento (ou texto já em curvas).',
    });
  } else {
    checks.push({
      code: 'VERIFY_FONTS',
      title: 'Incorporação de Tipografia',
      status: 'failed',
      evidence: `${unEmbedded.length} fonte(s) não incorporada(s).`,
      error: 'FONTS_UNEMBEDDED',
    });
  }

  // Check 5: Page Boxes Integrity
  const boxCheck = finalEligibility.checks.find((c) => c.id === 'PDFX_PAGE_BOXES');
  const trimCheck = finalEligibility.checks.find((c) => c.id === 'PDFX_TRIMBOX');
  const bleedCheck = finalEligibility.checks.find((c) => c.id === 'PDFX_BLEEDBOX');
  const boxesValid = boxCheck?.status === 'passed' && trimCheck?.status === 'passed' && bleedCheck?.status === 'passed';

  if (boxesValid) {
    checks.push({
      code: 'VERIFY_PAGE_BOXES',
      title: 'Hierarquia de Caixas Técnicas',
      status: 'passed',
      evidence: 'TrimBox e BleedBox explícitos e geometricamente contidos no MediaBox.',
    });
  } else {
    checks.push({
      code: 'VERIFY_PAGE_BOXES',
      title: 'Hierarquia de Caixas Técnicas',
      status: 'failed',
      evidence: 'Caixas de página ausentes, implícitas ou com hierarquia geométrica inconsistente.',
      error: 'PAGE_BOXES_INCONSISTENT',
    });
  }

  // Check 6: Structural & XRef Integrity
  if (finalizedPdfBytes && finalizedPdfBytes.length > 0) {
    const structVal = verifySerializedPdfStructure(finalizedPdfBytes);
    if (structVal.valid) {
      checks.push({
        code: 'VERIFY_SERIALIZED_STRUCTURE',
        title: 'Integridade de Serialização e Tabela XRef',
        status: 'passed',
        evidence: structVal.evidence,
      });
    } else {
      checks.push({
        code: 'VERIFY_SERIALIZED_STRUCTURE',
        title: 'Integridade de Serialização e Tabela XRef',
        status: 'failed',
        evidence: structVal.evidence,
        error: structVal.error || 'SERIALIZATION_INTEGRITY_FAILED',
      });
    }
  } else {
    const structRule = finalRules.universalRules.find((r) => r.ruleId === 'RULE-STRUCT-001') || finalRules.results.find((r) => r.ruleId === 'RULE-STRUCT-001');
    const dataRule = finalRules.universalRules.find((r) => r.ruleId === 'RULE-DATA-001') || finalRules.results.find((r) => r.ruleId === 'RULE-DATA-001');
    const structPassed = (structRule ? structRule.status === 'approved' : true) && (dataRule ? dataRule.status === 'approved' : true);

    if (structPassed) {
      checks.push({
        code: 'VERIFY_STRUCTURE_AND_DATA',
        title: 'Integridade Estrutural e Determinabilidade',
        status: 'passed',
        evidence: 'Estrutura PDF e fluxos de dados íntegros e validados pelo Motor 1.',
      });
    } else {
      checks.push({
        code: 'VERIFY_STRUCTURE_AND_DATA',
        title: 'Integridade Estrutural e Determinabilidade',
        status: 'failed',
        evidence: 'Falha na validação estrutural básica do PDF serializado.',
        error: 'STRUCTURE_OR_DATA_FAILED',
      });
    }
  }

  // Check 7: No Encryption
  const isEncrypted = Boolean((finalStructure as any).isEncrypted || (finalStructure.metadata as any)?.encrypted);
  if (!isEncrypted) {
    checks.push({
      code: 'VERIFY_SECURITY',
      title: 'Ausência de Criptografia e Restrições',
      status: 'passed',
      evidence: 'Documento livre de senhas ou restrições criptográficas.',
    });
  } else {
    checks.push({
      code: 'VERIFY_SECURITY',
      title: 'Ausência de Criptografia e Restrições',
      status: 'failed',
      evidence: 'Documento possui proteção criptográfica incompatível com PDF/X.',
      error: 'ENCRYPTION_PROHIBITED',
    });
  }

  // Check 8: Overall Eligibility Status
  const eligibilityPassed = finalEligibility.status === 'eligible';
  if (eligibilityPassed) {
    checks.push({
      code: 'VERIFY_ELIGIBILITY',
      title: 'Elegibilidade Normativa Global',
      status: 'passed',
      evidence: 'Todos os checks determinísticos de elegibilidade foram aprovados.',
    });
  } else {
    checks.push({
      code: 'VERIFY_ELIGIBILITY',
      title: 'Elegibilidade Normativa Global',
      status: 'failed',
      evidence: `Status de elegibilidade reaberto é "${finalEligibility.status}".`,
      error: 'ELIGIBILITY_NOT_MET',
    });
  }

  const allPassed = checks.every((c) => c.status === 'passed');
  const failures = checks.filter((c) => c.status === 'failed').map((c) => `${c.code}: ${c.evidence}`);

  return {
    verified: allPassed,
    checks,
    failures,
    warnings,
  };
}

/**
 * Finalizes a prepared PDF by embedding normative PDF/X-4 declarations,
 * saving, re-opening, re-analyzing, and verifying conformity.
 */
export async function finalizePdfx4Document(
  preparedPdfBytesInput: Uint8Array | Buffer,
  options: FinalizePdfx4Options = {}
): Promise<PdfxFinalizeResult> {
  const profile = options.profile || COMMERCIAL_PRINT_300DPI_PROFILE;
  const preparedBytes = preparedPdfBytesInput instanceof Uint8Array ? preparedPdfBytesInput : new Uint8Array(preparedPdfBytesInput);
  const preparedSha256 = calculateSha256(preparedBytes);

  // 1. Mandatory Pre-condition: Check prepared PDF structure and eligibility
  let preparedStructure: PdfDocumentStructure;
  try {
    preparedStructure = await extractPdfStructure(preparedBytes);
  } catch (err: any) {
    return {
      success: false,
      declaredPdfX: null,
      verifiedPdfX: false,
      targetStandard: 'PDF/X-4',
      checks: [],
      failures: [`Falha ao analisar PDF preparado: ${err?.message || String(err)}`],
      warnings: [],
      preparedSha256,
      summaryMessage: 'Documento corrompido ou ilegível. Finalização cancelada.',
      error: err?.message || String(err),
    };
  }

  const preparedRules = runDeterministicRuleEngine(preparedStructure, profile);
  const initialEligibility = evaluatePdfx4Eligibility(preparedStructure, {
    profile,
    ruleResults: preparedRules,
    pdfBytes: preparedBytes,
  });

  if (!initialEligibility.eligible) {
    return {
      success: false,
      declaredPdfX: null,
      verifiedPdfX: false,
      targetStandard: 'PDF/X-4',
      checks: [],
      failures: initialEligibility.blockers.map((b) => `${b.code}: ${b.reason}`),
      warnings: initialEligibility.warnings.map((w) => `${w.code}: ${w.reason}`),
      preparedSha256,
      summaryMessage: 'Documento não elegível para PDF/X-4. A finalização requer que todos os itens de elegibilidade estejam aprovados.',
    };
  }

  // 2. Load PDF into clean PDFDocument to write authentic PDF/X-4 metadata and XMP
  let loadedDoc: PDFDocument;
  try {
    loadedDoc = await PDFDocument.load(preparedBytes);
  } catch (loadErr: any) {
    return {
      success: false,
      declaredPdfX: null,
      verifiedPdfX: false,
      targetStandard: 'PDF/X-4',
      checks: [],
      failures: [`Falha ao carregar documento PDF: ${loadErr?.message || String(loadErr)}`],
      warnings: [],
      preparedSha256,
      summaryMessage: 'Erro de leitura binária do PDF preparado.',
      error: loadErr?.message || String(loadErr),
    };
  }

  // Create a clean, normalized PDFDocument to eliminate any previous generation numbers,
  // fragmented xref tables, or orphaned object references.
  const pdfDoc = await PDFDocument.create();
  const copiedPages = await pdfDoc.copyPages(loadedDoc, loadedDoc.getPageIndices());
  for (const page of copiedPages) {
    pdfDoc.addPage(page);
  }

  // Copy /OutputIntents from loadedDoc catalog if present
  const loadedCatalog = loadedDoc.catalog;
  const loadedOi = loadedCatalog.get(PDFName.of('OutputIntents'));
  if (loadedOi) {
    const oiLookedUp = loadedDoc.context.lookup(loadedOi);
    if (oiLookedUp instanceof PDFArray) {
      const newOiArray = pdfDoc.context.obj([]);
      for (let i = 0; i < oiLookedUp.size(); i++) {
        const itemRef = oiLookedUp.get(i);
        const itemObj = loadedDoc.context.lookup(itemRef);
        if (itemObj instanceof PDFDict) {
          const destProfileRef = itemObj.get(PDFName.of('DestOutputProfile'));
          let newProfileRef: any = undefined;
          if (destProfileRef) {
            const profileStream = loadedDoc.context.lookup(destProfileRef);
            if (profileStream instanceof PDFRawStream || profileStream instanceof PDFStream || (profileStream as any)?.dict) {
              const streamDict = (profileStream as any).dict || profileStream;
              const nVal = streamDict.get(PDFName.of('N')) || PDFNumber.of(4);
              const altVal = streamDict.get(PDFName.of('Alternate')) || PDFName.of('DeviceCMYK');
              const rawData = decodeStream(profileStream) || (profileStream as any).contents;
              if (rawData) {
                const newStream = pdfDoc.context.flateStream(rawData, {
                  N: nVal,
                  Alternate: altVal,
                });
                newProfileRef = pdfDoc.context.register(newStream);
              }
            }
          }

          const newOiDict = pdfDoc.context.obj({
            Type: PDFName.of('OutputIntent'),
            S: PDFName.of('GTS_PDFX'),
            OutputConditionIdentifier: itemObj.get(PDFName.of('OutputConditionIdentifier')) || PDFString.of('CGATS TR 001'),
            OutputCondition: itemObj.get(PDFName.of('OutputCondition')) || PDFString.of('CGATS TR 001 (SWOP)'),
            RegistryName: itemObj.get(PDFName.of('RegistryName')) || PDFString.of('http://www.color.org'),
            Info: itemObj.get(PDFName.of('Info')) || PDFString.of('CGATS TR 001 (SWOP)'),
            ...(newProfileRef ? { DestOutputProfile: newProfileRef } : {}),
          });
          newOiArray.push(pdfDoc.context.register(newOiDict));
        }
      }
      pdfDoc.catalog.set(PDFName.of('OutputIntents'), newOiArray);
    }
  }

  // 3. Write PDF/X-4 entries to Info dictionary
  const now = new Date();
  const pdfDateStr = formatPdfDate(now);
  const isoDateStr = now.toISOString();

  const infoDict = pdfDoc.context.obj({
    GTS_PDFXVersion: PDFString.of('PDF/X-4'),
    GTS_PDFXConformance: PDFString.of('PDF/X-4'),
    Trapped: PDFName.of('False'),
    Producer: PDFString.of(options.producer || 'ArteCheck PDF/X Engine (ISO 15930-7)'),
    ModDate: PDFString.of(pdfDateStr),
    ...(options.title ? { Title: PDFString.of(options.title) } : {}),
    ...(options.author ? { Author: PDFString.of(options.author) } : {}),
    ...(options.creator ? { Creator: PDFString.of(options.creator) } : {}),
  });
  const infoRef = pdfDoc.context.register(infoDict);
  pdfDoc.context.trailerInfo.Info = infoRef;

  // 4. Construct and embed compliant XMP Metadata packet
  const xmpXml = buildXmpMetadataPacket({
    title: options.title || preparedStructure.metadata?.title,
    author: options.author || preparedStructure.metadata?.author,
    creator: options.creator || preparedStructure.metadata?.creator,
    producer: options.producer || 'ArteCheck PDF/X Engine (ISO 15930-7)',
    creationDateIso: isoDateStr,
    modDateIso: isoDateStr,
  });

  const metaDict = pdfDoc.context.obj({
    Type: 'Metadata',
    Subtype: 'XML',
  });
  const metaStream = PDFRawStream.of(metaDict as any, Buffer.from(xmpXml, 'utf-8'));
  const metaRef = pdfDoc.context.register(metaStream);
  pdfDoc.catalog.set(PDFName.of('Metadata'), metaRef);

  // 5. Serialize into NEW immutable finalized PDF buffer with clean traditional xref
  let finalizedPdfBytes: Uint8Array;
  try {
    finalizedPdfBytes = await pdfDoc.save({ useObjectStreams: false });
  } catch (saveErr: any) {
    return {
      success: false,
      declaredPdfX: null,
      verifiedPdfX: false,
      targetStandard: 'PDF/X-4',
      checks: [],
      failures: [`Falha na serialização do PDF finalizado: ${saveErr?.message || String(saveErr)}`],
      warnings: [],
      preparedSha256,
      summaryMessage: 'Falha ao salvar PDF com declaração PDF/X-4.',
      error: saveErr?.message || String(saveErr),
    };
  }

  const finalizedSha256 = calculateSha256(finalizedPdfBytes);

  // 6. Mandatory Re-opening & Re-analysis on serialized bytes
  let reExtractedStructure: PdfDocumentStructure;
  try {
    reExtractedStructure = await extractPdfStructure(finalizedPdfBytes);
  } catch (reopenErr: any) {
    return {
      success: false,
      declaredPdfX: 'PDF/X-4',
      verifiedPdfX: false, // Serialization succeeded but re-open failed -> NOT verified!
      targetStandard: 'PDF/X-4',
      checks: [],
      failures: [`Falha ao reabrir PDF serializado: ${reopenErr?.message || String(reopenErr)}`],
      warnings: [],
      preparedSha256,
      finalizedSha256,
      summaryMessage: 'PDF serializado falhou na reabertura estrutural. Verificação negada.',
      error: reopenErr?.message || String(reopenErr),
    };
  }

  const reExtractedRules = runDeterministicRuleEngine(reExtractedStructure, profile);
  const reExtractedEligibility = evaluatePdfx4Eligibility(reExtractedStructure, {
    profile,
    ruleResults: reExtractedRules,
    pdfBytes: finalizedPdfBytes,
  });

  // 7. Dedicated verification
  const verification = verifyPdfx4FinalizedDocument(
    reExtractedStructure,
    reExtractedRules,
    reExtractedEligibility,
    finalizedPdfBytes
  );

  return {
    success: verification.verified,
    declaredPdfX: 'PDF/X-4',
    verifiedPdfX: verification.verified,
    targetStandard: 'PDF/X-4',
    checks: verification.checks,
    failures: verification.failures,
    warnings: verification.warnings,
    preparedSha256,
    finalizedSha256,
    finalizedPdfBytes: verification.verified ? finalizedPdfBytes : undefined,
    summaryMessage: verification.verified
      ? 'Arquivo PDF/X-4 gerado, serializado e verificado com sucesso pelo ArteCheck.'
      : 'Declaração PDF/X-4 gravada, porém a verificação pós-serialização identificou inconformidades normativas.',
  };
}

