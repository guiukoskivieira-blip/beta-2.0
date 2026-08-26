/**
 * ARTECHECK — Backend Ghostscript Transparency Flattening Service
 *
 * Executes deterministic PDF transparency flattening via isolated Ghostscript processes.
 * NEVER concatenates user strings into command lines.
 * Uses isolated OS temporary directories and enforces strict execution timeouts and concurrency limits.
 */

import { spawn, spawnSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { randomUUID } from 'crypto';
import { extractPdfStructure } from './pdfExtractor.ts';
import {
  createPreFlatteningSnapshot,
  validateFlattenedStructure,
  STANDARD_FLATTENING_FAILURE_MESSAGE,
  type TransparencyValidationResult,
} from '../src/services/transparencyFlattening.ts';

export interface FlatteningServiceResult {
  flattenedPdfBytes: Buffer;
  outputFileName: string;
  validation: TransparencyValidationResult;
  processingDurationMs: number;
}

let cachedGsExecutable: string | null | undefined = undefined;

// Concurrency Limiter: Max 2 simultaneous Ghostscript flattening processes
let activeFlatteningJobs = 0;
export const MAX_CONCURRENT_FLATTENING_JOBS = 2;

export function getActiveFlatteningJobsCount(): number {
  return activeFlatteningJobs;
}

export function setActiveFlatteningJobsCountForTesting(count: number): void {
  activeFlatteningJobs = count;
}

/**
 * Deterministically verifies if a Ghostscript binary is present in the system environment.
 */
export function getGhostscriptExecutable(): string | null {
  if (cachedGsExecutable !== undefined) {
    return cachedGsExecutable;
  }

  const customPath = process.env.GHOSTSCRIPT_PATH;
  if (customPath && fs.existsSync(customPath)) {
    cachedGsExecutable = customPath;
    return cachedGsExecutable;
  }

  const candidates = process.platform === 'win32'
    ? ['gswin64c', 'gswin32c', 'gs']
    : ['gs'];

  for (const cmd of candidates) {
    try {
      const res = spawnSync(cmd, ['--version'], {
        encoding: 'utf8',
        timeout: 2000,
        windowsHide: true,
      });
      if (res.status === 0 && res.stdout) {
        cachedGsExecutable = cmd;
        return cachedGsExecutable;
      }
    } catch {
      // Continue searching
    }
  }

  cachedGsExecutable = null;
  return null;
}

export function isGhostscriptAvailable(): boolean {
  return getGhostscriptExecutable() !== null;
}

/**
 * Flattens PDF transparency deterministically using Ghostscript in an isolated temporary directory.
 */
export async function flattenPdfTransparency(
  pdfBuffer: Buffer,
  originalFileName: string = 'documento.pdf'
): Promise<FlatteningServiceResult> {
  const startTime = Date.now();

  // 1. Audit & Snapshot before processing
  const preDoc = await extractPdfStructure(pdfBuffer);
  const preSnapshot = createPreFlatteningSnapshot(preDoc);

  // 2. Concurrency limit check
  if (activeFlatteningJobs >= MAX_CONCURRENT_FLATTENING_JOBS) {
    const error: any = new Error(
      'O servidor atingiu o limite de conversões de transparência simultâneas (máximo 2). Aguarde a conclusão dos processos ativos e tente novamente.'
    );
    error.code = 'CONCURRENCY_LIMIT_REACHED';
    throw error;
  }

  // 3. Verify Ghostscript availability
  const gsExec = getGhostscriptExecutable();
  if (!gsExec) {
    const error: any = new Error('Ghostscript não está instalado ou configurado no ambiente do servidor.');
    error.code = 'GHOSTSCRIPT_UNAVAILABLE';
    throw error;
  }

  activeFlatteningJobs++;

  // 4. Create isolated temp directory
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `artecheck-flatten-${randomUUID()}`));
  const inputPath = path.join(tempDir, `input-${randomUUID()}.pdf`);
  const outputPath = path.join(tempDir, `output-${randomUUID()}.pdf`);

  try {
    fs.writeFileSync(inputPath, pdfBuffer);

    // 5. Execute Ghostscript with explicit safe parameters (NO prepress downsampling)
    const gsArgs = [
      '-dCompatibilityLevel=1.3',
      '-dNOPAUSE',
      '-dBATCH',
      '-dSAFER',
      '-sDEVICE=pdfwrite',
      '-dDownsampleColorImages=false',
      '-dDownsampleGrayImages=false',
      '-dDownsampleMonoImages=false',
      '-sColorConversionStrategy=LeaveColorUnchanged',
      '-dPreserveAnnots=true',
      `-sOutputFile=${outputPath}`,
      inputPath,
    ];

    await new Promise<void>((resolve, reject) => {
      const child = spawn(gsExec, gsArgs, {
        timeout: 25000,
        windowsHide: true,
      });

      let stderr = '';
      child.stderr.on('data', (d) => {
        stderr += d.toString();
      });

      child.on('error', (err) => {
        reject(new Error(`Falha ao invocar Ghostscript: ${err.message}`));
      });

      child.on('close', (code) => {
        if (code === 0 && fs.existsSync(outputPath)) {
          resolve();
        } else {
          reject(new Error(`Ghostscript encerrou com código ${code}: ${stderr}`));
        }
      });
    });

    const flattenedBytes = fs.readFileSync(outputPath);

    // 6. Strict post-validation against pre-snapshot
    const postDoc = await extractPdfStructure(flattenedBytes);
    const validation = validateFlattenedStructure(preSnapshot, postDoc);

    if (!validation.isValid) {
      const err: any = new Error(STANDARD_FLATTENING_FAILURE_MESSAGE);
      err.code = 'FLATTENING_VALIDATION_FAILED';
      err.validation = validation;
      throw err;
    }

    // 7. Generate clean output filename
    const cleanBase = path.basename(originalFileName, path.extname(originalFileName)).replace(/[^a-zA-Z0-9_-]/g, '_');
    const outputFileName = `${cleanBase}_transparencias_achatadas.pdf`;

    return {
      flattenedPdfBytes: flattenedBytes,
      outputFileName,
      validation,
      processingDurationMs: Date.now() - startTime,
    };
  } finally {
    activeFlatteningJobs = Math.max(0, activeFlatteningJobs - 1);
    // 8. Guaranteed temp file cleanup
    try {
      if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
      if (fs.existsSync(tempDir)) fs.rmdirSync(tempDir);
    } catch {
      // Ignore cleanup error
    }
  }
}
