import "dotenv/config";
import express, { Request, Response, NextFunction } from "express";
import path from "path";
import fs from "fs";
import multer from "multer";
import { createServer as createViteServer } from "vite";
import { randomUUID } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { extractPdfStructure, inspectPayload, DiagnosticTracker, formatBytes, PdfEncryptedError } from "./server/pdfExtractor";
import { applyTrimBleedFix, checkTrimBleedEligibility } from "./src/services/trimBleedFix";
import { applyOutputIntentFix } from "./src/services/outputIntentFix";
import { applyImageColorFix } from "./src/services/imageColorFix";
import { preparePdfForPdfx4 } from "./src/services/pdfxPreparation";
import { finalizePdfx4Document } from "./src/services/pdfxFinalize";
import { applyDimensionFix } from "./src/services/dimensionFix";
import { isGhostscriptAvailable, flattenPdfTransparency } from "./server/transparencyService";
import { COMMERCIAL_PRINT_300DPI_PROFILE, A4_COMMERCIAL_FLYER_PROFILE, LARGE_FORMAT_BANNER_PROFILE, STANDARD_PROFILES } from "./src/utils/productionProfiles";
import type { ProductionProfile } from "./src/utils/productionProfiles";
import { GoogleGenAI } from "@google/genai";
import { LIMITS } from "./src/config/limits";
import { getSupabaseClient, isSupabaseConfigured } from "./src/lib/supabaseClient";
import { parseCorsAllowedOrigins, isOriginAllowed } from "./server/cors";

// Configure Multer for in-memory storage (no permanent disk writes)
// Max file size: 50 MB
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
const MAX_STRING_LENGTH = 20_000;
const MAX_ARRAY_ITEMS = 2_000;

function isValidUuid(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

function getBillingAdmin() {
  const rawUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
  const rawKey = (process.env.SUPABASE_SECRET_KEY || '').trim();
  if (!rawUrl || !rawKey || !rawUrl.startsWith('http')) return null;
  return createClient(rawUrl, rawKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

/**
 * Creates a user-scoped authenticated Supabase client for RPC calls using the user's Bearer JWT.
 * NEVER uses service_role key to bypass internal PostgreSQL / RPC authorization checks.
 * Sets Authorization: Bearer <authToken> so PostgreSQL runs with auth.role() = 'authenticated'
 * and auth.uid() = user.id.
 */
function getAuthenticatedSupabaseClient(authToken: string) {
  if (!authToken || typeof authToken !== 'string' || !authToken.trim()) return null;
  const rawUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
  const publishableKey = (
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    ''
  ).trim();
  if (!rawUrl || !publishableKey || !rawUrl.startsWith('http')) return null;

  return createClient(rawUrl, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: {
        Authorization: `Bearer ${authToken.trim()}`,
      },
    },
  });
}

/**
 * Resolves Prexyon organization context and verifies entitlement for ArteCheck (commercial or homologation).
 * Flow:
 * 1. Resolves organization membership for the authenticated user (server-authoritative).
 * 2. Ensures membership is active (is_active: true).
 * 3. Verifies organization is active (is_active: true).
 * 4. Calls RPC `prexyon_get_organization_entitlements` using the user's Bearer JWT client (authenticated role).
 *    NEVER uses service_role key to bypass internal PostgreSQL / RPC authorization checks.
 * 5. Verifies entitlement:
 *    - effective_products must include "artecheck"
 *    - AND at least one of:
 *      a) homologation_products includes "artecheck" (Homologation mode)
 *      b) commercial_products includes "artecheck" AND has_subscription is true (Commercial mode)
 * Returns { authorized: true, organizationId, mode: 'commercial' | 'homologation' } if conditions met; otherwise { authorized: false }.
 * Fail-closed on any error, missing token, or missing requirement.
 */
async function resolvePrexyonEntitlement(
  userId: string,
  authToken?: string | null
): Promise<{ authorized: boolean; organizationId?: string; mode?: 'commercial' | 'homologation' }> {
  if (!isValidUuid(userId)) return { authorized: false };
  if (!authToken || typeof authToken !== 'string' || !authToken.trim()) return { authorized: false };

  const admin = getBillingAdmin();
  if (!admin) return { authorized: false };

  const userClient = getAuthenticatedSupabaseClient(authToken);
  if (!userClient) return { authorized: false };

  try {
    // 1. Membership lookup (server-authoritative: resolve org from user membership)
    const { data: member, error: memberErr } = await admin
      .from('organization_members')
      .select('organization_id, role, is_active')
      .eq('user_id', userId)
      .maybeSingle();

    if (memberErr || !member || !member.is_active) {
      return { authorized: false };
    }

    const orgId = member.organization_id;
    if (!orgId) return { authorized: false };

    // 2. Organization active check
    const { data: org, error: orgErr } = await admin
      .from('organizations')
      .select('id, is_active')
      .eq('id', orgId)
      .maybeSingle();

    if (orgErr || !org || !org.is_active) {
      return { authorized: false };
    }

    // 3. Entitlement check via Prexyon central RPC using user-scoped authenticated client
    // Executes with auth.role() = 'authenticated' and auth.uid() = user.id.
    const { data: entData, error: entErr } = await userClient.rpc('prexyon_get_organization_entitlements', {
      p_org_id: orgId,
    });

    if (entErr || !entData) {
      return { authorized: false };
    }

    const effectiveProducts: string[] = (entData as any).effective_products || [];
    const homologationProducts: string[] = (entData as any).homologation_products || [];
    const commercialProducts: string[] = (entData as any).commercial_products || [];

    const hasEffective = effectiveProducts.includes('artecheck');
    const isHomologation = homologationProducts.includes('artecheck');
    const isCommercial = commercialProducts.includes('artecheck') && Boolean((entData as any).has_subscription);

    if (hasEffective && (isHomologation || isCommercial)) {
      return {
        authorized: true,
        organizationId: orgId,
        mode: isCommercial ? 'commercial' : 'homologation',
      };
    }

    return { authorized: false };
  } catch (err: any) {
    console.error('[Prexyon-Entitlement] Erro ao resolver entitlement:', err?.message || err);
    return { authorized: false };
  }
}

// Backward compatibility alias
const resolvePrexyonHomologationEntitlement = resolvePrexyonEntitlement;

/**
 * Centralized authorization for file processing (used in /api/upload and /api/flatten-transparency).
 * Relies STRICTLY on Prexyon central entitlement via resolvePrexyonEntitlement(userId, authToken).
 * If authorized: true -> allows processing.
 * If authorized: false -> blocks fail-closed.
 * No legacy billing fallback.
 */
async function authorizeProcessing(req: Request, res: Response): Promise<{ allowed: boolean }> {
  const userId = (req as any).authUser?.id;
  const authToken = (req as any).authToken;
  if (!userId) {
    res.status(401).json({ success: false, error: 'Faça login para iniciar uma análise.' });
    return { allowed: false };
  }

  // Check explicit Prexyon entitlement (commercial or homologation) using the user's Bearer JWT
  const entitlement = await resolvePrexyonEntitlement(userId, authToken);
  if (entitlement.authorized) {
    (req as any).prexyonEntitled = true;
    (req as any).prexyonHomologation = entitlement.mode === 'homologation';
    (req as any).prexyonMode = entitlement.mode;
    (req as any).organizationId = entitlement.organizationId;
    return { allowed: true };
  }

  // Fail-closed: No entitlement for ArteCheck in Prexyon
  res.status(403).json({
    success: false,
    code: 'ENTITLEMENT_REQUIRED',
    error: 'Sua organização não possui acesso ao ArteCheck. Contrate ou ative seu plano no Portal Prexyon para continuar.',
  });
  return { allowed: false };
}

/**
 * Records successful analysis telemetry and metadata in public.analyses.
 * Preserves user_id and organization_id for history and operational metrics.
 */
async function recordSuccessfulAnalysis(opts: {
  userId?: string | null;
  organizationId?: string | null;
  analysisId: string;
  fileName: string;
  fileSizeBytes: number;
  score?: number;
  errorCount?: number;
  warningCount?: number;
  approvedCount?: number;
  status?: string;
  requestId?: string;
}) {
  const admin = getBillingAdmin();
  if (!admin) return;

  const {
    userId,
    organizationId,
    analysisId,
    fileName,
    fileSizeBytes,
    score = 100,
    errorCount = 0,
    warningCount = 0,
    approvedCount = 0,
    status = 'completed',
    requestId,
  } = opts;

  const nowIso = new Date().toISOString();
  const validUserUuid = userId && isValidUuid(userId) ? userId : null;
  const validOrgUuid = organizationId && isValidUuid(organizationId) ? organizationId : null;
  const validAnalysisUuid = isValidUuid(analysisId) ? analysisId : undefined;

  try {
    const { error: insertErr } = await admin.from('analyses').insert({
      id: validAnalysisUuid,
      user_id: validUserUuid,
      organization_id: validOrgUuid,
      file_name: fileName || 'analysis.pdf',
      file_size_bytes: Math.max(0, Number(fileSizeBytes) || 0),
      score,
      status,
      error_count: errorCount,
      warning_count: warningCount,
      approved_count: approvedCount,
      created_at: nowIso,
    });

    if (insertErr) {
      console.warn(`[Analyses:${requestId || analysisId}] Registro operacional em analyses:`, insertErr.message);
    }
  } catch (err: any) {
    console.warn(`[Analyses:${requestId || analysisId}] Falha ao registrar telemetria em analyses:`, err?.message || err);
  }
}

/** Creates a JSON-safe client payload without retaining binary PDF objects. */
function sanitizeForClient(value: any, seen = new WeakSet<object>(), depth = 0): any {
  if (value == null || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") {
    return value.length > MAX_STRING_LENGTH ? `${value.slice(0, MAX_STRING_LENGTH)}…[truncated]` : value;
  }
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "function" || typeof value === "symbol") return undefined;
  if (Buffer.isBuffer(value) || value instanceof Uint8Array || value instanceof ArrayBuffer) {
    const byteLength = Buffer.isBuffer(value) ? value.length : value.byteLength;
    return { omittedBinary: true, byteLength };
  }
  if (depth > 20) return "[max-depth]";
  if (typeof value === "object") {
    if (seen.has(value)) return "[circular]";
    seen.add(value);
    if (Array.isArray(value)) {
      return value.slice(0, MAX_ARRAY_ITEMS).map(v => sanitizeForClient(v, seen, depth + 1));
    }
    const out: Record<string, any> = {};
    for (const [key, child] of Object.entries(value)) {
      if (/^(buffer|bytes|contents?|decoded|stream|pdfBytes|rawBytes)$/i.test(key)) {
        const len = Buffer.isBuffer(child) || child instanceof Uint8Array ? child.length : undefined;
        out[key] = { omitted: true, ...(len !== undefined ? { byteLength: len } : {}) };
        continue;
      }
      const clean = sanitizeForClient(child, seen, depth + 1);
      if (clean !== undefined) out[key] = clean;
    }
    return out;
  }
  return String(value);
}

function getSlowestStage(stages: Record<string, { durationMs: number }>) {
  return Object.entries(stages).sort((a, b) => b[1].durationMs - a[1].durationMs)[0]?.[0] || "not_determined";
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: LIMITS.MAX_UPLOAD_BYTES,
    files: 1,
  },
});

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // CORS — allowlist of known frontend origins (Bolt hosting, local dev, preview).
  // Additional origins can be added via CORS_ALLOWED_ORIGINS env var (comma-separated).
  const corsAllowlist = parseCorsAllowedOrigins(process.env.CORS_ALLOWED_ORIGINS);
  const defaultOrigins = [
    "https://guiukoskivieira-blip-e2zm.bolt.host",
  ];
  const allowedOrigins = [...defaultOrigins, ...corsAllowlist];

  app.use((req: Request, res: Response, next: NextFunction) => {
    const origin = req.header("origin");
    // Access-Control-Allow-Origin is set to the requesting origin when allowed
    if (origin && isOriginAllowed(origin, allowedOrigins)) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header("Vary", "Origin");
    }
    res.header("Cache-Control", "no-store");
    res.header("X-Content-Type-Options", "nosniff");
    res.header("Referrer-Policy", "no-referrer");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, Accept, X-Request-ID");
    if (req.method === "OPTIONS") {
      return res.sendStatus(204);
    }
    next();
  });

  // Session & Identity token extraction middleware (Etapa 10)
  // Real JWT validation via Supabase Auth when configured, with clean local dev fallback.
  // Never trusts user_id / organization_id sent in body/query for authorization.
  app.use(async (req: Request, _res: Response, next: NextFunction) => {
    const authHeader = req.header("authorization");
    let authToken: string | null = null;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      authToken = authHeader.substring(7).trim();
    }

    (req as any).authToken = authToken;

    if (!authToken) {
      (req as any).authUser = null;
      (req as any).user = {
        tokenProvided: false,
        authenticated: false,
        role: "guest_or_local_dev",
      };
      return next();
    }

    if (isSupabaseConfigured()) {
      const supabase = getSupabaseClient();
      if (supabase) {
        try {
          const { data: { user }, error } = await supabase.auth.getUser(authToken);
          if (!error && user && user.id) {
            const authUser = {
              id: user.id,
              email: user.email || null,
              role: user.role || 'authenticated',
            };
            (req as any).authUser = authUser;
            (req as any).user = {
              ...authUser,
              tokenProvided: true,
              authenticated: true,
            };
            return next();
          }
        } catch {
          // Token validation failed
        }
      }
      // Invalid/Expired Supabase token
      (req as any).authUser = null;
      (req as any).user = {
        tokenProvided: true,
        authenticated: false,
        role: "unauthenticated",
      };
      return next();
    }

    // Local dev mode without remote Supabase
    if (authToken === "local_dev_token" || authToken.length > 0) {
      const devUser = {
        id: "local_dev_user",
        email: "dev@artecheck.local",
        role: "developer",
      };
      (req as any).authUser = devUser;
      (req as any).user = {
        ...devUser,
        tokenProvided: true,
        authenticated: true,
      };
    } else {
      (req as any).authUser = null;
      (req as any).user = {
        tokenProvided: false,
        authenticated: false,
        role: "guest_or_local_dev",
      };
    }

    next();
  });

  app.use(express.json({ limit: "1mb" }));

  // API Health Endpoint (Stage 1 validation)
  app.get("/api/health", (_req: Request, res: Response) => {
    res.json({
      ok: true,
      status: "ok",
      service: "artecheck-backend",
    });
  });

  // Deployment/beta capability discovery. Contains configuration only; no secrets.
  app.get("/api/capabilities", (_req: Request, res: Response) => {
    const isSupabase = Boolean(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL);
    res.json({
      ok: true,
      service: "artecheck-backend",
      releaseChannel: "closed_beta",
      deterministicPreflight: true,
      aiAssistantOptional: true,
      maxUploadMb: LIMITS.MAX_UPLOAD_MB,
      endpoints: ["/api/health", "/api/upload", "/api/diagnose", "/api/assistant"],
      persistence: isSupabase ? "supabase_postgres" : "local_client_only",
      authentication: isSupabase ? "supabase_jwt" : "local_dev",
      entitlement: "prexyon_central",
    });
  });

  // POST /api/upload - Stage 3 Real PDF Upload & Deterministic Structure Extraction
  app.post(
    "/api/upload",
    async (req: Request, res: Response, next: NextFunction) => {
      const auth = await authorizeProcessing(req, res);
      if (!auth.allowed) return;
      next();
    },
    (req: Request, res: Response, next: NextFunction) => {
      const requestId = String(req.header("x-request-id") || `server-${Date.now().toString(36)}`);
      res.setHeader("X-Request-ID", requestId);
      (req as any).artecheckRequestId = requestId;
      const requestStartedAt = performance.now();
      req.on("aborted", () => console.warn(`[SERVER:${requestId}] request aborted by client`));
      res.on("finish", () => console.log(`[SERVER:${requestId}] RESPONSE SENT status=${res.statusCode} elapsed=${Number((performance.now() - requestStartedAt).toFixed(2))}ms`));
      res.on("close", () => {
        if (!res.writableEnded) console.warn(`[SERVER:${requestId}] response closed before completion`);
      });
      // Execute upload handler with custom error handling for multer
      upload.single("file")(req, res, (err: any) => {
        if (err) {
          if (err instanceof multer.MulterError) {
            if (err.code === "LIMIT_FILE_SIZE") {
              return res.status(400).json({
                success: false,
                error: `O arquivo excede o limite máximo permitido de ${LIMITS.MAX_UPLOAD_MB} MB.`,
              });
            }
            return res.status(400).json({
              success: false,
              error: `Erro no upload: ${err.message}`,
            });
          }
          return res.status(400).json({
            success: false,
            error: err.message || "Erro durante o envio do arquivo.",
          });
        }
        next();
      });
    },
    async (req: Request, res: Response) => {
      const serverTracker = new DiagnosticTracker('Server-Upload');
      const reqStart = serverTracker.startStage('request_received');
      const file = req.file;

      // 1. Validate that a file was sent
      if (!file) {
        return res.status(400).json({
          success: false,
          error: "Nenhum arquivo foi enviado. Por favor, selecione um arquivo PDF.",
        });
      }

      const originalName = (file.originalname || "").replace(/[\r\n\0]/g, "").slice(0, 255);
      const requestId = (req as any).artecheckRequestId || "unknown";

      // 2. Validate file name extension and declared MIME (magic bytes remain authoritative below).
      if (!originalName.toLowerCase().endsWith(".pdf")) {
        return res.status(400).json({
          success: false,
          error: "Formato inválido. O arquivo deve possuir a extensão .pdf.",
        });
      }

      // 3. Validate file buffer content and magic bytes signature (%PDF-)
      serverTracker.startStage('file_header_validation', { sizeBytes: file.size, fileName: originalName });
      if (!file.buffer || file.buffer.length < 5) {
        return res.status(400).json({
          success: false,
          error: "Arquivo vazio ou corrompido.",
        });
      }

      // Check for %PDF- in the first 1024 bytes (standard PDF header per ISO 32000-1)
      const headerChunk = file.buffer.subarray(0, Math.min(file.buffer.length, 1024));
      const hasPdfHeader = headerChunk.includes(Buffer.from("%PDF-"));

      if (!hasPdfHeader) {
        return res.status(400).json({
          success: false,
          error:
            "Arquivo inválido. O conteúdo não possui a assinatura/cabeçalho de documento PDF (%PDF-).",
        });
      }
      serverTracker.endStage('file_header_validation');

      // 4. Stage 3 Deterministic Structural Extraction (in-memory, zero permanent storage)
      try {
        serverTracker.startStage('pdf_extractor_execution');
        const documentStructure = await extractPdfStructure(file.buffer);
        serverTracker.endStage('pdf_extractor_execution');

        // 5. Payload Inspection & Diagnostic Audit
        serverTracker.startStage('payload_inspection_and_audit');
        const clientDocument = sanitizeForClient(documentStructure);
        const payloadAudit = inspectPayload(clientDocument);
        serverTracker.endStage('payload_inspection_and_audit', {
          totalSizeBytes: payloadAudit.totalSizeBytes,
          formattedSize: payloadAudit.formattedSize,
          largeFieldsCount: payloadAudit.largeFields.length,
          hasRawBuffers: payloadAudit.hasRawBuffers,
        });

        if (payloadAudit.largeFields.length > 0) {
          console.warn(`⚠️ [Server-Upload] Detected ${payloadAudit.largeFields.length} field(s) exceeding 10k chars:`, 
            payloadAudit.largeFields.map(f => `${f.path} (${f.length} chars)`)
          );
        }

        if (payloadAudit.totalSizeBytes > MAX_RESPONSE_BYTES) {
          console.error(`[Server-Upload] Payload bloqueado: ${payloadAudit.formattedSize}`);
          return res.status(413).json({
            success: false,
            error: "A análise foi concluída, mas o relatório técnico ficou grande demais para ser exibido com segurança. Use o modo diagnóstico ou um perfil mais específico.",
            diagnosticInfo: { payloadSizeBytes: payloadAudit.totalSizeBytes, formattedPayloadSize: payloadAudit.formattedSize },
          });
        }

        const totalServerDuration = Number((performance.now() - reqStart).toFixed(2));
        serverTracker.markInstant('response_sending', {
          totalDurationMs: totalServerDuration,
          payloadSize: payloadAudit.formattedSize,
        });

        const analysisId = randomUUID();
        const authUserId = (req as any).authUser?.id as string | undefined;
        const orgId = (req as any).organizationId as string | undefined;

        // Telemetry & analysis record in public.analyses
        await recordSuccessfulAnalysis({
          userId: authUserId,
          organizationId: orgId,
          analysisId,
          fileName: originalName,
          fileSizeBytes: file.size,
          score: 100,
          requestId,
        });

        console.log(`[SERVER:${requestId}] response started`);
        return res.status(200).json({
          success: true,
          analysisId,
          file: {
            name: originalName,
            size: file.size,
            mimeType: "application/pdf",
          },
          document: clientDocument,
          diagnosticInfo: {
            stages: serverTracker.getStagesSummary(),
            totalDurationMs: totalServerDuration,
            payloadSizeBytes: payloadAudit.totalSizeBytes,
            formattedPayloadSize: payloadAudit.formattedSize,
            largeFieldsCount: payloadAudit.largeFields.length,
          },
        });
      } catch (extractError: any) {
        if (
          extractError instanceof PdfEncryptedError ||
          extractError?.code === 'PDF_ENCRYPTED' ||
          extractError?.message?.includes('is encrypted') ||
          extractError?.name === 'EncryptedPDFError' ||
          extractError?.name === 'PdfEncryptedError'
        ) {
          return res.status(400).json({
            success: false,
            code: 'PDF_ENCRYPTED',
            status: 'manual_required',
            error: 'Este PDF está protegido por senha ou criptografia. Remova a proteção no software de origem e envie novamente.',
            message: 'Este PDF está protegido por senha ou criptografia. Remova a proteção no software de origem e envie novamente.',
          });
        }
        console.error(`[SERVER:${requestId}] PDF Structure Extraction Error:`, extractError.message || extractError);
        return res.status(400).json({
          success: false,
          error: "Não foi possível interpretar a estrutura do arquivo PDF. O arquivo pode estar corrompido.",
        });
      }
    }
  );

  // POST /api/diagnose - lightweight server-only diagnostic; never returns the full PDF graph.
  app.post("/api/diagnose", upload.single("file"), async (req: Request, res: Response) => {
    const file = req.file;
    if (!file) return res.status(400).json({ success: false, error: "Nenhum PDF enviado." });
    const started = performance.now();
    try {
      if (!file.buffer.subarray(0, Math.min(file.buffer.length, 1024)).includes(Buffer.from("%PDF-"))) {
        return res.status(400).json({ success: false, error: "Arquivo sem assinatura PDF válida." });
      }
      const document = await extractPdfStructure(file.buffer);
      const clean = sanitizeForClient(document);
      const audit = inspectPayload(clean);
      const stages = (document as any).extractionDiagnostics?.stages || {};
      const totalTimeMs = Number((performance.now() - started).toFixed(2));
      const memory = process.memoryUsage();
      return res.json({
        success: true,
        fileSize: file.size,
        totalTimeMs,
        lastCompletedStage: "payload_audit",
        stages,
        counts: (audit as any).counts || { pages: document.pageCount, fonts: document.fonts.length },
        responseSize: audit.totalSizeBytes,
        responseSizeFormatted: audit.formattedSize,
        suspectedBottleneck: getSlowestStage(stages),
        memory: { heapUsed: memory.heapUsed, rss: memory.rss },
        hasRawBuffers: audit.hasRawBuffers,
        largeFields: audit.largeFields.slice(0, 10),
      });
    } catch (error: any) {
      if (
        error instanceof PdfEncryptedError ||
        error?.code === 'PDF_ENCRYPTED' ||
        error?.message?.includes('is encrypted') ||
        error?.name === 'EncryptedPDFError' ||
        error?.name === 'PdfEncryptedError'
      ) {
        return res.status(400).json({
          success: false,
          code: 'PDF_ENCRYPTED',
          status: 'manual_required',
          error: 'Este PDF está protegido por senha ou criptografia. Remova a proteção no software de origem e envie novamente.',
          message: 'Este PDF está protegido por senha ou criptografia. Remova a proteção no software de origem e envie novamente.',
        });
      }
      return res.status(400).json({
        success: false,
        fileSize: file.size,
        totalTimeMs: Number((performance.now() - started).toFixed(2)),
        lastCompletedStage: "extractor_failed",
        error: error?.message || "Falha no diagnóstico.",
      });
    }
  });

  // Helper to resolve ProductionProfile from request body supporting standard & custom profiles
  function resolveProfileFromBody(req: Request): ProductionProfile {
    const profileId = typeof req.body?.profileId === "string" ? req.body.profileId : "";
    const profileMap: Record<string, ProductionProfile> = {};
    for (const p of STANDARD_PROFILES) {
      profileMap[p.id] = p;
    }
    profileMap['commercial_print_300dpi'] = COMMERCIAL_PRINT_300DPI_PROFILE;
    profileMap['commercial_flyer_a4'] = A4_COMMERCIAL_FLYER_PROFILE;
    profileMap['large_format_banner'] = LARGE_FORMAT_BANNER_PROFILE;

    let profile: ProductionProfile = profileMap[profileId] || {
      id: profileId || 'custom_profile',
      name: typeof req.body?.profileName === 'string' ? req.body.profileName : 'Perfil Personalizado',
      category: 'custom' as const,
      description: 'Perfil personalizado',
      minEffectiveDpi: 300,
      warningDpiThreshold: 200,
      rgbPolicy: 'error' as const,
    };

    if (req.body?.expectedWidthMm && req.body?.expectedHeightMm) {
      profile = {
        ...profile,
        expectedWidthMm: Number(req.body.expectedWidthMm),
        expectedHeightMm: Number(req.body.expectedHeightMm),
      };
    }
    if (req.body?.expectedBleedMm !== undefined) {
      profile.expectedBleedMm = Number(req.body.expectedBleedMm);
    }
    return profile;
  }

  // POST /api/fix-trim-bleed - Apply TrimBox/BleedBox correction to a copy of the PDF
  app.post("/api/fix-trim-bleed", upload.single("file"), async (req: Request, res: Response) => {
    const file = req.file;
    if (!file) return res.status(400).json({ success: false, error: "Nenhum PDF enviado." });

    const profile = resolveProfileFromBody(req);

    try {
      if (!file.buffer.subarray(0, Math.min(file.buffer.length, 1024)).includes(Buffer.from("%PDF-"))) {
        return res.status(400).json({ success: false, error: "Arquivo sem assinatura PDF válida." });
      }

      const doc = await extractPdfStructure(file.buffer);
      const eligibility = checkTrimBleedEligibility(doc, profile);

      res.setHeader("X-ArteCheck-Backend-Version", "trim-fix-xref-v2");

      if (!eligibility.eligible) {
        return res.json({
          success: false,
          eligible: false,
          eligibility,
          backendVersion: "trim-fix-xref-v2",
          serializationMode: "traditional-xref",
          error: eligibility.globalReason,
        });
      }

      const result = await applyTrimBleedFix(file.buffer, doc, profile);

      if (!result.success || !result.pdfBytes) {
        return res.json({
          success: false,
          eligible: true,
          eligibility,
          audit: result.audit,
          structuralValidation: result.structuralValidation,
          revalidation: result.revalidation,
          backendVersion: "trim-fix-xref-v2",
          serializationMode: "traditional-xref",
          error: result.error,
        });
      }

      const fixedBuffer = Buffer.from(result.pdfBytes);
      const base64 = fixedBuffer.toString("base64");

      return res.json({
        success: true,
        eligible: true,
        eligibility,
        fixedPdfBase64: base64,
        fixedPdfSize: fixedBuffer.length,
        audit: result.audit,
        structuralValidation: result.structuralValidation,
        revalidation: result.revalidation,
        backendVersion: "trim-fix-xref-v2",
        serializationMode: "traditional-xref",
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        backendVersion: "trim-fix-xref-v2",
        serializationMode: "traditional-xref",
        error: error?.message || "Falha ao aplicar correção TrimBox/BleedBox.",
      });
    }
  });

  // POST /api/fix-dimensions - Deterministic vector dimension scaling or rotation
  app.post("/api/fix-dimensions", upload.single("file"), async (req: Request, res: Response) => {
    const file = (req as any).file;
    if (!file) return res.status(400).json({ success: false, error: "Nenhum PDF enviado." });

    const action = typeof req.body?.action === "string" ? req.body.action : "scale_uniform";
    const profile = resolveProfileFromBody(req);

    try {
      if (!file.buffer.subarray(0, Math.min(file.buffer.length, 1024)).includes(Buffer.from("%PDF-"))) {
        return res.status(400).json({ success: false, error: "Arquivo sem assinatura PDF válida." });
      }

      res.setHeader("X-ArteCheck-Backend-Version", "dimension-fix-v1");

      const result = await applyDimensionFix(file.buffer, profile, { action: action as any });

      if (!result.success || !result.fixedPdfBase64) {
        return res.json({
          success: false,
          error: result.error || "Falha ao ajustar dimensões do PDF.",
        });
      }

      return res.json({
        success: true,
        fixedPdfBase64: result.fixedPdfBase64,
        transformedDimensions: result.transformedDimensions,
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        error: error?.message || "Falha na aplicação do ajuste de dimensões.",
      });
    }
  });

  // POST /api/fix-output-intent - Configure OutputIntent and real ICC profile on a copy of the PDF
  app.post("/api/fix-output-intent", upload.fields([{ name: 'file', maxCount: 1 }, { name: 'iccFile', maxCount: 1 }]), async (req: Request, res: Response) => {
    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
    const file = files?.file?.[0] || (req as any).file;
    const iccFile = files?.iccFile?.[0];

    if (!file) return res.status(400).json({ success: false, error: "Nenhum PDF enviado." });

    const profile = resolveProfileFromBody(req);
    const iccProfileId = typeof req.body?.iccProfileId === "string" ? req.body.iccProfileId : "cgats_tr_001_swop";
    const outputConditionIdentifier = typeof req.body?.outputConditionIdentifier === "string" ? req.body.outputConditionIdentifier : "CGATS TR 001";
    const targetColorSpace = (typeof req.body?.targetColorSpace === "string" ? req.body.targetColorSpace : "CMYK") as any;
    const registryName = typeof req.body?.registryName === "string" ? req.body.registryName : undefined;
    const info = typeof req.body?.info === "string" ? req.body.info : undefined;

    try {
      if (!file.buffer.subarray(0, Math.min(file.buffer.length, 1024)).includes(Buffer.from("%PDF-"))) {
        return res.status(400).json({ success: false, error: "Arquivo sem assinatura PDF válida." });
      }

      res.setHeader("X-ArteCheck-Backend-Version", "output-intent-icc-v1");

      const contract = {
        iccProfileId,
        outputConditionIdentifier,
        targetColorSpace,
        registryName,
        info,
      };

      const iccBytes = iccFile?.buffer || null;
      const result = await applyOutputIntentFix(file.buffer, contract, iccBytes, profile);

      if (!result.success || !result.pdfBytes) {
        return res.json({
          success: false,
          actionResult: result.actionResult,
          contract: result.contract,
          audit: result.audit,
          structuralValidation: result.structuralValidation,
          revalidation: result.revalidation,
          backendVersion: "output-intent-icc-v1",
          serializationMode: "traditional-xref",
          error: result.error,
        });
      }

      const fixedBuffer = Buffer.from(result.pdfBytes);
      const base64 = fixedBuffer.toString("base64");

      return res.json({
        success: true,
        actionResult: result.actionResult,
        contract: result.contract,
        fixedPdfBase64: base64,
        fixedPdfSize: fixedBuffer.length,
        audit: result.audit,
        structuralValidation: result.structuralValidation,
        revalidation: result.revalidation,
        backendVersion: "output-intent-icc-v1",
        serializationMode: "traditional-xref",
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        backendVersion: "output-intent-icc-v1",
        serializationMode: "traditional-xref",
        error: error?.message || "Falha ao configurar Output Intent.",
      });
    }
  });

  // GET /api/transparency-capability - Verifies if Ghostscript is available for flattening
  app.get("/api/transparency-capability", (req: Request, res: Response) => {
    return res.json({
      success: true,
      ghostscriptAvailable: isGhostscriptAvailable(),
    });
  });

  // POST /api/flatten-transparency - Deterministic PDF transparency flattening via Ghostscript
  app.post(
    "/api/flatten-transparency",
    async (req: Request, res: Response, next: NextFunction) => {
      const auth = await authorizeProcessing(req, res);
      if (!auth.allowed) return;
      next();
    },
    upload.single("file"),
    async (req: Request, res: Response) => {
      if (!req.file) {
        return res.status(400).json({ success: false, error: "Nenhum PDF enviado." });
      }

      if (!req.file.buffer.subarray(0, Math.min(req.file.buffer.length, 1024)).includes(Buffer.from("%PDF-"))) {
        return res.status(400).json({
          success: false,
          error: "INVALID_PDF",
          message: "Arquivo sem assinatura PDF válida.",
        });
      }

      if (!isGhostscriptAvailable()) {
        return res.status(501).json({
          success: false,
          error: "GHOSTSCRIPT_UNAVAILABLE",
          message: "Ghostscript não está instalado ou disponível no ambiente do servidor para executar o achatamento de transparências.",
        });
      }

      try {
        const result = await flattenPdfTransparency(req.file.buffer, req.file.originalname || "documento.pdf");
        return res.json({
          success: true,
          fileName: result.outputFileName,
          base64: result.flattenedPdfBytes.toString("base64"),
          validation: result.validation,
          durationMs: result.processingDurationMs,
        });
      } catch (error: any) {
        let statusCode = 422;
        if (error.code === "GHOSTSCRIPT_UNAVAILABLE") statusCode = 501;
        else if (error.code === "CONCURRENCY_LIMIT_REACHED") statusCode = 429;

        return res.status(statusCode).json({
          success: false,
          error: error.code || "FLATTENING_FAILED",
          message: error.message || "Falha ao achatar transparências.",
          validation: error.validation,
        });
      }
    }
  );

  // POST /api/assistant - Grounded Gemini explanation layer strictly subordinate to preflight engine
  app.post("/api/assistant", async (req: Request, res: Response) => {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      return res.status(503).json({
        success: false,
        error: "Assistente de IA não configurado. Defina GEMINI_API_KEY no servidor para habilitar esta função.",
      });
    }

    const question = typeof req.body?.question === "string" ? req.body.question.trim() : "";
    const context = req.body?.context;

    if (!question || question.length > 1000) {
      return res.status(400).json({ success: false, error: "Pergunta inválida ou maior que 1000 caracteres." });
    }
    if (!context || (context.schemaVersion !== "1.0" && !context.fileName) || typeof context.score !== "number") {
      return res.status(400).json({ success: false, error: "Contexto técnico da análise ausente ou inválido." });
    }

    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });
      const model = process.env.GEMINI_MODEL || "gemini-3.7-flash";

      const blockingList = Array.isArray(context.blockingErrors) && context.blockingErrors.length > 0
        ? context.blockingErrors.map((b: any) => `• [BLOQUEANTE] ${b.title || b.id}: ${b.evidence || ''}`).join('\n')
        : '• Nenhum erro bloqueante.';

      const warningList = Array.isArray(context.warnings) && context.warnings.length > 0
        ? context.warnings.map((w: any) => `• [ALERTA] ${w.title || w.id}: ${w.evidence || ''}`).join('\n')
        : '• Nenhum alerta.';

      const approvedList = Array.isArray(context.approvedRules) && context.approvedRules.length > 0
        ? context.approvedRules.map((a: any) => `• [APROVADO] ${a.title || a.id} (${a.evidence || 'Conforme'})`).join('\n')
        : '• Nenhuma.';

      const systemInstruction = [
        "Você é o assistente técnico de pré-impressão do ArteCheck AI.",
        "SUBORDINAÇÃO TOTAL AO MOTOR DETERMINÍSTICO:",
        "1. O motor determinístico é a ÚNICA fonte de verdade para status, medidas, dimensões e cores.",
        "2. NUNCA contradiga ou questione qualquer regra APROVADA. Se a sangria, cores, DPI ou caixas de corte foram aprovadas pelo motor, NUNCA sugira alterá-las, corrigi-las ou verificá-las.",
        "3. NUNCA invente novos erros ou suposições que não estejam nos erros bloqueantes ou alertas listados.",
        "4. ORDEM ESTRITA DE RESPOSTA: Foque primeiro nas regras BLOQUEANTES (BLOCKING), depois nos ALERTAS (WARNING).",
        "5. Para itens APROVADOS (APPROVED): NÃO gere nenhuma recomendação automática ou desnecessária.",
        "6. Explique de forma prática como resolver no Illustrator, InDesign, CorelDraw ou Photoshop apenas os problemas realmente detectados.",
        "7. Responda em português do Brasil de maneira concisa, clara e estritamente profissional.",
      ].join("\n");

      const promptPayload = [
        "--- DIAGNÓSTICO TÉCNICO OFICIAL DO ARTECHECK MOTOR ---",
        `Arquivo: ${context.fileName || 'documento.pdf'}`,
        `Score Oficial: ${context.score}/100 | Status: ${context.status}`,
        `Erros Bloqueantes (${context.errorCount ?? 0}):\n${blockingList}`,
        `Alertas (${context.warningCount ?? 0}):\n${warningList}`,
        `Regras Aprovadas (${context.approvedCount ?? (context.approvedRules?.length || 0)}):\n${approvedList}`,
        `Medições Feitas: ${JSON.stringify(context.measuredEvidence || {})}`,
        "",
        `PERGUNTA DO USUÁRIO:\n${question}`,
      ].join("\n");

      const response = await ai.models.generateContent({
        model,
        contents: promptPayload,
        config: {
          systemInstruction,
          temperature: 0.1,
          maxOutputTokens: 800,
        },
      });

      const answer = response.text?.trim();
      if (!answer) {
        return res.status(502).json({ success: false, error: "O modelo não retornou uma resposta utilizável." });
      }

      return res.json({ success: true, answer, reply: answer, model });
    } catch (error: any) {
      console.error("ArteCheck assistant error:", error?.message || error);
      return res.status(502).json({
        success: false,
        error: "Não foi possível consultar o assistente de IA neste momento.",
      });
    }
  });

  // Healthcheck endpoint for production uptime monitoring and container probes
  app.get("/api/health", (_req: Request, res: Response) => {
    res.status(200).json({
      status: "ok",
      service: "ArteCheck AI Engine",
      timestamp: new Date().toISOString(),
      uptimeSeconds: Number(process.uptime().toFixed(1)),
    });
  });

  // POST /api/fix-image-color & /api/fix/image-color - Real LittleCMS RGB->CMYK image fix on PDF clone
  const handleImageColorFix = async (req: Request, res: Response) => {
    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
    const file = files?.file?.[0] || (req as any).file;
    const destIccFile = files?.destIccFile?.[0] || files?.iccFile?.[0];
    const sourceIccFile = files?.sourceIccFile?.[0];

    if (!file) return res.status(400).json({ success: false, error: "Nenhum PDF enviado." });

    const destinationIccPresetId = typeof req.body?.destinationIccPresetId === "string" ? req.body.destinationIccPresetId : "cgats_tr_001_swop";
    const renderingIntent = typeof req.body?.renderingIntent === "string" ? req.body.renderingIntent : "RelativeColorimetric";
    const allowFallbackSrgb = req.body?.allowFallbackSrgb === "true" || req.body?.allowFallbackSrgb === true;

    const profile = resolveProfileFromBody(req);

    try {
      if (!file.buffer.subarray(0, Math.min(file.buffer.length, 1024)).includes(Buffer.from("%PDF-"))) {
        return res.status(400).json({ success: false, error: "Arquivo sem assinatura PDF válida." });
      }

      res.setHeader("X-ArteCheck-Backend-Version", "image-color-cmm-v1");

      const result = await applyImageColorFix(file.buffer, {
        destinationIccBytes: destIccFile?.buffer || null,
        destinationIccPresetId,
        sourceIccBytes: sourceIccFile?.buffer || null,
        renderingIntent: renderingIntent as any,
        allowFallbackSrgb,
        profile,
      });

      if (!result.success || !result.pdfBytes) {
        return res.json({
          success: false,
          actionResult: result.actionResult,
          reasonCode: result.reasonCode,
          reason: result.reason || result.error || result.contract?.message,
          imageResults: result.imageResults || result.objectsSummary?.objects || [],
          contract: result.contract,
          objectsSummary: result.objectsSummary,
          audit: result.audit,
          structuralValidation: result.structuralValidation,
          revalidation: result.revalidation,
          backendVersion: "image-color-cmm-v1",
          serializationMode: "traditional-xref",
          error: result.error || result.reason,
        });
      }

      const fixedBuffer = Buffer.from(result.pdfBytes);
      const base64 = fixedBuffer.toString("base64");

      return res.json({
        success: true,
        actionResult: result.actionResult,
        reasonCode: result.reasonCode,
        reason: result.reason || result.contract?.message,
        imageResults: result.imageResults || result.objectsSummary?.objects || [],
        contract: result.contract,
        fixedPdfBase64: base64,
        fixedPdfSize: fixedBuffer.length,
        objectsSummary: result.objectsSummary,
        audit: result.audit,
        structuralValidation: result.structuralValidation,
        revalidation: result.revalidation,
        backendVersion: "image-color-cmm-v1",
        serializationMode: "traditional-xref",
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        backendVersion: "image-color-cmm-v1",
        serializationMode: "traditional-xref",
        error: error?.message || "Falha na conversão de cores de imagens.",
      });
    }
  };

  app.post(
    "/api/fix-image-color",
    upload.fields([
      { name: "file", maxCount: 1 },
      { name: "destIccFile", maxCount: 1 },
      { name: "iccFile", maxCount: 1 },
      { name: "sourceIccFile", maxCount: 1 },
    ]),
    handleImageColorFix
  );

  app.post(
    "/api/fix/image-color",
    upload.fields([
      { name: "file", maxCount: 1 },
      { name: "destIccFile", maxCount: 1 },
      { name: "iccFile", maxCount: 1 },
      { name: "sourceIccFile", maxCount: 1 },
    ]),
    handleImageColorFix
  );

  // POST /api/prepare-pdfx4 & /api/prepare/pdfx4 - Deterministic PDF/X-4 Preparation Orchestrator
  const handlePdfx4Preparation = async (req: Request, res: Response) => {
    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
    const file = files?.file?.[0] || (req as any).file;
    const destIccFile = files?.destIccFile?.[0] || files?.iccFile?.[0];
    const sourceIccFile = files?.sourceIccFile?.[0];

    if (!file) return res.status(400).json({ success: false, error: "Nenhum PDF enviado." });

    const destinationIccPresetId = typeof req.body?.destinationIccPresetId === "string" ? req.body.destinationIccPresetId : "cgats_tr_001_swop";
    const allowFallbackSrgb = req.body?.allowFallbackSrgb === "true" || req.body?.allowFallbackSrgb === true;

    const profile = resolveProfileFromBody(req);

    try {
      if (!file.buffer.subarray(0, Math.min(file.buffer.length, 1024)).includes(Buffer.from("%PDF-"))) {
        return res.status(400).json({ success: false, error: "Arquivo sem assinatura PDF válida." });
      }

      res.setHeader("X-ArteCheck-Backend-Version", "pdfx4-preparation-v1");

      const result = await preparePdfForPdfx4(file.buffer, {
        profile,
        destinationIccPresetId,
        destinationIccBytes: destIccFile?.buffer || null,
        sourceIccPresetId: typeof req.body?.sourceIccPresetId === "string" ? req.body.sourceIccPresetId : undefined,
        sourceIccBytes: sourceIccFile?.buffer || null,
        allowFallbackSrgb,
      });

      const preparedBuffer = result.pdfBytes ? Buffer.from(result.pdfBytes) : null;
      const base64 = preparedBuffer ? preparedBuffer.toString("base64") : undefined;

      return res.json({
        success: result.success,
        status: result.status,
        steps: result.steps,
        eligibleAfterPreparation: result.eligibleAfterPreparation,
        preparedPdfBase64: base64,
        preparedPdfSize: preparedBuffer?.length,
        originalSha256: result.originalSha256,
        preparedSha256: result.preparedSha256,
        verifiedPdfX: false, // STRICT: always false during Phase 2 preparation
        summaryMessage: result.summaryMessage,
        error: result.error,
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        status: "blocked",
        steps: [],
        verifiedPdfX: false,
        error: error?.message || "Falha na preparação para PDF/X-4.",
      });
    }
  };

  app.post(
    "/api/prepare-pdfx4",
    upload.fields([
      { name: "file", maxCount: 1 },
      { name: "destIccFile", maxCount: 1 },
      { name: "iccFile", maxCount: 1 },
      { name: "sourceIccFile", maxCount: 1 },
    ]),
    handlePdfx4Preparation
  );

  app.post(
    "/api/prepare/pdfx4",
    upload.fields([
      { name: "file", maxCount: 1 },
      { name: "destIccFile", maxCount: 1 },
      { name: "iccFile", maxCount: 1 },
      { name: "sourceIccFile", maxCount: 1 },
    ]),
    handlePdfx4Preparation
  );

  // POST /api/finalize-pdfx4 & /api/finalize/pdfx4 - Final PDF/X-4 Declaration & Normative Verification
  const handlePdfx4Finalize = async (req: Request, res: Response) => {
    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
    const file = files?.file?.[0] || (req as any).file;
    const destIccFile = files?.destIccFile?.[0] || files?.iccFile?.[0];

    if (!file) return res.status(400).json({ success: false, error: "Nenhum PDF enviado para finalização." });

    const destinationIccPresetId = typeof req.body?.destinationIccPresetId === "string" ? req.body.destinationIccPresetId : "cgats_tr_001_swop";
    const title = typeof req.body?.title === "string" ? req.body.title : undefined;
    const author = typeof req.body?.author === "string" ? req.body.author : undefined;
    const creator = typeof req.body?.creator === "string" ? req.body.creator : undefined;

    const profile = resolveProfileFromBody(req);

    try {
      if (!file.buffer.subarray(0, Math.min(file.buffer.length, 1024)).includes(Buffer.from("%PDF-"))) {
        return res.status(400).json({ success: false, error: "Arquivo sem assinatura PDF válida." });
      }

      res.setHeader("X-ArteCheck-Backend-Version", "pdfx4-finalize-v1");

      const result = await finalizePdfx4Document(file.buffer, {
        profile,
        destinationIccPresetId,
        destinationIccBytes: destIccFile?.buffer || null,
        title,
        author,
        creator,
      });

      const finalizedBuffer = result.finalizedPdfBytes ? Buffer.from(result.finalizedPdfBytes) : null;
      const base64 = finalizedBuffer ? finalizedBuffer.toString("base64") : undefined;

      return res.json({
        success: result.success,
        declaredPdfX: result.declaredPdfX,
        verifiedPdfX: result.verifiedPdfX,
        targetStandard: result.targetStandard,
        checks: result.checks,
        failures: result.failures,
        warnings: result.warnings,
        preparedSha256: result.preparedSha256,
        finalizedSha256: result.finalizedSha256,
        finalizedPdfBase64: base64,
        finalizedPdfSize: finalizedBuffer?.length,
        summaryMessage: result.summaryMessage,
        error: result.error,
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        declaredPdfX: null,
        verifiedPdfX: false,
        failures: [error?.message || "Falha na finalização PDF/X-4."],
        error: error?.message || "Falha na finalização PDF/X-4.",
      });
    }
  };

  app.post(
    "/api/finalize-pdfx4",
    upload.fields([
      { name: "file", maxCount: 1 },
      { name: "destIccFile", maxCount: 1 },
      { name: "iccFile", maxCount: 1 },
    ]),
    handlePdfx4Finalize
  );

  app.post(
    "/api/finalize/pdfx4",
    upload.fields([
      { name: "file", maxCount: 1 },
      { name: "destIccFile", maxCount: 1 },
      { name: "iccFile", maxCount: 1 },
    ]),
    handlePdfx4Finalize
  );

  // Future analysis routes structure placeholder
  app.get("/api/info", (_req: Request, res: Response) => {
    res.json({
      name: "ArteCheck AI Engine",
      stage: "3 - Deterministic PDF Structure",
      supportedFormats: ["application/pdf"],
      maxFileSizeMB: 50,
    });
  });

  // Dedicated JSON 404 handler for unmatched /api routes to prevent returning HTML index
  app.all("/api/*", (_req: Request, res: Response) => {
    res.status(404).json({
      success: false,
      error: "Endpoint de API não encontrado.",
    });
  });

  // Global JSON error handler for API routes
  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith("/api/")) {
      console.error("API Unhandled Error:", err?.message || err);
      return res.status(err.status || 500).json({
        success: false,
        error: err?.message || "Erro interno do servidor.",
      });
    }
    next(err);
  });

  // Vite middleware for development vs static serve for production
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        ws: false,
        watch: null,
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  let server: import("net").Server;

  const tryListen = (port: number) => {
    server = app.listen(port, "0.0.0.0", () => {
      console.log(`ArteCheck AI Server running on http://0.0.0.0:${port}`);
    });
    server.on("error", (err: any) => {
      if (err?.code === "EADDRINUSE" && port - PORT < 50) {
        console.warn(`[SERVER] Port ${port} in use, trying ${port + 1}...`);
        try { server.close(); } catch {}
        tryListen(port + 1);
      } else if (err?.code === "EADDRINUSE") {
        console.error("[SERVER] No available port found after 50 attempts.");
        process.exit(1);
      } else {
        console.error("[SERVER] Fatal Server Error:", err);
      }
    });
  };

  tryListen(PORT);

  const shutdown = () => {
    try {
      server.close(() => {
        process.exit(0);
      });
    } catch {
      process.exit(0);
    }
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}



startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
