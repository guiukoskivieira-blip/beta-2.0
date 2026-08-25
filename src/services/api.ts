import { UploadResponse, HealthResponse, AiAssistantResponse, AiGroundingContext } from '../types';
import type { ProductionProfile } from '../utils/productionProfiles';
import { auth } from '../auth';
import { apiUrl } from '../config/api';

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

async function getAuthHeader(): Promise<Record<string, string>> {
  try {
    const session = await auth.getSession();
    if (session?.accessToken) {
      return { Authorization: `Bearer ${session.accessToken}` };
    }
  } catch {
    // Silently ignore auth header retrieval errors
  }
  return {};
}

export async function checkBackendHealth(): Promise<HealthResponse> {
  const res = await fetch(apiUrl('/api/health'));
  if (!res.ok) {
    throw new Error(`Health check failed with status: ${res.status}`);
  }
  return res.json();
}

export const checkHealth = checkBackendHealth;

export async function uploadPdfFile(file: File, signal?: AbortSignal): Promise<UploadResponse> {
  const uploadUrl = apiUrl('/api/upload');
  const requestId = `upload-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const startedAt = performance.now();

  console.log(`[UPLOAD:${requestId}] URL: ${uploadUrl}`);
  console.log(`[UPLOAD:${requestId}] request started`);
  console.log(`[UPLOAD:${requestId}] file name: ${file.name}`);
  console.log(`[UPLOAD:${requestId}] file size: ${file.size} bytes`);
  console.log(`[UPLOAD:${requestId}] file type: ${file.type || 'unknown'}`);

  const formData = new FormData();
  formData.append('file', file);

  const authHeader = await getAuthHeader();

  let res: Response;
  try {
    res = await fetch(uploadUrl, {
      method: 'POST',
      body: formData,
      signal,
      headers: {
        'X-Request-ID': requestId,
        ...authHeader,
      },
      cache: 'no-store',
    });
  } catch (err: any) {
    const elapsedMs = Number((performance.now() - startedAt).toFixed(2));
    console.log(`[UPLOAD:${requestId}] fetch error after ${elapsedMs}ms`);
    console.log(`[UPLOAD:${requestId}] fetch error name: ${err?.name || 'Error'}`);
    console.log(`[UPLOAD:${requestId}] fetch error message: ${err?.message || String(err)}`);
    if (err?.name === 'AbortError') {
      return {
        success: false,
        error: 'O envio do arquivo foi cancelado antes da resposta do servidor.',
      };
    }
    return {
      success: false,
      error: `Falha de conexão com o servidor de pré-impressão (${err?.message || 'servidor indisponível'}).`,
    };
  }

  const elapsedToHeadersMs = Number((performance.now() - startedAt).toFixed(2));
  console.log(`[UPLOAD:${requestId}] DIAGNOSTIC - response.url: ${res.url}`);
  console.log(`[UPLOAD:${requestId}] DIAGNOSTIC - response.redirected: ${res.redirected}`);
  console.log(`[UPLOAD:${requestId}] DIAGNOSTIC - status: ${res.status}`);
  console.log(`[UPLOAD:${requestId}] DIAGNOSTIC - content-type: ${res.headers.get('content-type') || 'unknown'}`);
  console.log(`[UPLOAD:${requestId}] server request id: ${res.headers.get('x-request-id') || 'not-provided'}`);

  let data: any;
  let rawText: string;
  try {
    rawText = await res.text();
  } catch (err: any) {
    return {
      success: false,
      error: `A resposta do servidor foi iniciada, mas não pôde ser lida (${err?.message || 'erro de transporte'}).`,
    };
  }

  console.log(`[UPLOAD:${requestId}] DIAGNOSTIC - body preview (first 300 chars): ${rawText.slice(0, 300)}`);
  console.log(`[UPLOAD:${requestId}] response text length: ${rawText.length}`);
  try {
    data = JSON.parse(rawText);
  } catch {
    const errorSummary = rawText.slice(0, 200);
    console.log(`[UPLOAD:${requestId}] non-JSON response preview: ${errorSummary}`);
    return {
      success: false,
      error: `Erro HTTP ${res.status}: Resposta não interpretável do servidor.`,
    };
  }

  if (!res.ok) {
    const errorSummary = JSON.stringify(data).slice(0, 200);
    console.log(`[UPLOAD:${requestId}] error response preview: ${errorSummary}`);
    return {
      success: false,
      error: data?.error || `Erro HTTP ${res.status}: Falha no processamento do arquivo.`,
    };
  }

  console.log(`[UPLOAD:${requestId}] completed in ${Number((performance.now() - startedAt).toFixed(2))}ms`);
  return data;
}

export const uploadPdfForAnalysis = uploadPdfFile;
export const uploadPdfForExtraction = uploadPdfFile;

export async function diagnosePdf(file: File): Promise<any> {
  const formData = new FormData();
  formData.append('file', file);
  const authHeader = await getAuthHeader();

  const res = await fetch(apiUrl('/api/diagnose'), {
    method: 'POST',
    body: formData,
    headers: {
      ...authHeader,
    },
  });

  return res.json();
}

export async function askPreflightAssistant(
  question: string,
  context: AiGroundingContext
): Promise<AiAssistantResponse> {
  const authHeader = await getAuthHeader();
  const res = await fetch(apiUrl('/api/assistant'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
    body: JSON.stringify({ question, context }),
  });

  const data = await res.json();
  if (!res.ok && !data.error) {
    return {
      success: false,
      error: `Erro HTTP ${res.status} ao consultar assistente.`,
    };
  }
  return data;
}

export const askAiAssistant = askPreflightAssistant;

export interface TrimBleedFixApiResponse {
  success: boolean;
  eligible?: boolean;
  eligibility?: any;
  fixedPdfBase64?: string;
  fixedPdfSize?: number;
  audit?: any;
  structuralValidation?: {
    valid: boolean;
    checks: { header: boolean; eof: boolean; xrefOrTrailer: boolean; reparseable: boolean };
    message: string;
  };
  revalidation?: {
    ruleStatus: 'approved' | 'error' | 'warning' | 'undetermined';
    validated: boolean;
    message: string;
  };
  backendVersion?: string;
  serializationMode?: string;
  error?: string;
}

export async function applyTrimBleedFixViaApi(
  file: File,
  profileId: string
): Promise<TrimBleedFixApiResponse> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('profileId', profileId);

  const authHeader = await getAuthHeader();

  const res = await fetch(apiUrl('/api/fix-trim-bleed'), {
    method: 'POST',
    body: formData,
    headers: {
      ...authHeader,
    },
  });

  const data = await res.json();
  return data as TrimBleedFixApiResponse;
}

export interface ImageColorFixApiResponse {
  success: boolean;
  actionResult?: 'corrected' | 'partially_corrected' | 'manual_required' | 'not_supported' | 'failed' | string;
  reasonCode?: string;
  reason?: string;
  fixedPdfBase64?: string;
  fixedPdfSize?: number;
  imageResults?: Array<{
    objectId: string;
    page: number;
    status: string;
    sourceColorSpace?: string;
    destinationColorSpace?: string;
    sourceProfile?: string;
    destinationProfile?: string;
    renderingIntent?: string;
    verified?: boolean;
    widthPx?: number;
    heightPx?: number;
    effectiveDpi?: number;
    reasonCode?: string;
    reason?: string;
  }>;
  objectsSummary?: {
    totalImages: number;
    rgbImages: number;
    convertibleCount: number;
    convertedCount: number;
    manualRequiredCount: number;
    notSupportedCount: number;
    objects: Array<{
      objectId: string;
      page: number;
      status: string;
      sourceColorSpace?: string;
      destinationColorSpace?: string;
      sourceProfile?: string;
      destinationProfile?: string;
      renderingIntent?: string;
      verified?: boolean;
      widthPx?: number;
      heightPx?: number;
      effectiveDpi?: number;
      reasonCode?: string;
      reason?: string;
    }>;
  };
  audit?: any;
  structuralValidation?: {
    valid: boolean;
    checks: { header: boolean; eof: boolean; xrefOrTrailer: boolean; reparseable: boolean };
    message: string;
  };
  revalidation?: {
    hasRgbBefore: boolean;
    hasRgbAfter: boolean;
    ruleStatusBefore: string;
    ruleStatusAfter: string;
    validated: boolean;
    message: string;
  };
  backendVersion?: string;
  serializationMode?: string;
  error?: string;
}

export async function applyImageColorFixViaApi(
  file: File,
  options: {
    profileId?: string;
    destinationIccPresetId?: string;
    renderingIntent?: string;
    allowFallbackSrgb?: boolean;
    destIccFile?: File | null;
    sourceIccFile?: File | null;
  } = {}
): Promise<ImageColorFixApiResponse> {
  let targetUrl = '';
  try {
    targetUrl = apiUrl('/api/fix-image-color');
  } catch (urlErr: any) {
    return {
      success: false,
      error: `REQUEST_BUILD_FAILED: Falha ao resolver URL da API (${urlErr?.message || 'configuração inválida'}).`,
    };
  }

  const requestId = `rgb-fix-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  console.info(`[RGB-FIX-API:${requestId}] URL: ${targetUrl}`);

  let formData: FormData;
  try {
    formData = new FormData();
    formData.append('file', file);
    if (options.profileId) formData.append('profileId', options.profileId);
    if (options.destinationIccPresetId) formData.append('destinationIccPresetId', options.destinationIccPresetId);
    if (options.renderingIntent) formData.append('renderingIntent', options.renderingIntent);
    if (options.allowFallbackSrgb !== undefined) formData.append('allowFallbackSrgb', String(options.allowFallbackSrgb));
    if (options.destIccFile) formData.append('destIccFile', options.destIccFile);
    if (options.sourceIccFile) formData.append('sourceIccFile', options.sourceIccFile);
  } catch (formErr: any) {
    return {
      success: false,
      error: `REQUEST_BUILD_FAILED: Falha ao preparar os dados da requisição (${formErr?.message || 'erro de FormData'}).`,
    };
  }

  let authHeader = {};
  try {
    authHeader = await getAuthHeader();
  } catch (authErr: any) {
    console.warn(`[RGB-FIX-API:${requestId}] getAuthHeader aviso:`, authErr?.message);
  }

  let res: Response;
  try {
    res = await fetch(targetUrl, {
      method: 'POST',
      body: formData,
      headers: {
        'X-Request-ID': requestId,
        ...authHeader,
      },
      cache: 'no-store',
    });
  } catch (err: any) {
    console.error(`[RGB-FIX-API:${requestId}] fetch network error:`, err?.message || err);
    return {
      success: false,
      error: `API_REQUEST_FAILED: Falha de conexão com o servidor ao converter imagens (${err?.message || 'servidor inacessível ou erro de rede'}).`,
    };
  }

  let rawText = '';
  try {
    rawText = await res.text();
  } catch (err: any) {
    console.error(`[RGB-FIX-API:${requestId}] read response body error:`, err?.message || err);
    return {
      success: false,
      error: `API_RESPONSE_ERROR: Falha ao ler a resposta do servidor (${err?.message || 'erro de I/O'}).`,
    };
  }

  let data: any;
  try {
    data = JSON.parse(rawText);
  } catch {
    console.error(`[RGB-FIX-API:${requestId}] non-JSON response status ${res.status}:`, rawText.slice(0, 200));
    return {
      success: false,
      error: `API_RESPONSE_ERROR: Erro HTTP ${res.status}: Resposta não interpretável do servidor.`,
    };
  }

  if (!res.ok) {
    console.error(`[RGB-FIX-API:${requestId}] HTTP ${res.status} response:`, data?.error);
    return {
      success: false,
      error: data?.error || `API_RESPONSE_ERROR: Erro HTTP ${res.status} retornado pelo servidor.`,
      actionResult: data?.actionResult,
      objectsSummary: data?.objectsSummary,
      audit: data?.audit,
      structuralValidation: data?.structuralValidation,
      revalidation: data?.revalidation,
    };
  }

  return data as ImageColorFixApiResponse;
}

export interface DimensionFixApiResponse {
  success: boolean;
  fixedPdfBase64?: string;
  transformedDimensions?: { widthMm: number; heightMm: number };
  error?: string;
}

export async function applyDimensionFixViaApi(
  file: File | Blob,
  profile: ProductionProfile | string,
  action: 'scale_uniform' | 'rotate_90' = 'scale_uniform'
): Promise<DimensionFixApiResponse> {
  const targetUrl = apiUrl('/api/fix-dimensions');

  try {
    const formData = new FormData();
    formData.append('file', file);
    if (typeof profile === 'string') {
      formData.append('profileId', profile);
    } else {
      formData.append('profileId', profile.id);
      formData.append('profileName', profile.name);
      if (profile.expectedWidthMm) formData.append('expectedWidthMm', String(profile.expectedWidthMm));
      if (profile.expectedHeightMm) formData.append('expectedHeightMm', String(profile.expectedHeightMm));
      if (profile.expectedBleedMm !== undefined) formData.append('expectedBleedMm', String(profile.expectedBleedMm));
    }
    formData.append('action', action);

    let authHeader = {};
    try {
      authHeader = await getAuthHeader();
    } catch {}

    const res = await fetch(targetUrl, {
      method: 'POST',
      body: formData,
      headers: {
        ...authHeader,
      },
      cache: 'no-store',
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        success: false,
        error: data?.error || `Erro HTTP ${res.status} ao ajustar dimensões.`,
      };
    }

    return data as DimensionFixApiResponse;
  } catch (err: any) {
    console.error('applyDimensionFixViaApi error:', err);
    return {
      success: false,
      error: err?.message || 'Falha de comunicação com o servidor ao ajustar dimensões.',
    };
  }
}

export interface FinalizePdfx4ApiResponse {
  success: boolean;
  declaredPdfX?: string | null;
  verifiedPdfX?: boolean;
  targetStandard?: string;
  checks?: any[];
  failures?: any[];
  warnings?: any[];
  preparedSha256?: string;
  finalizedSha256?: string;
  finalizedPdfBase64?: string;
  finalizedPdfSize?: number;
  summaryMessage?: string;
  error?: string;
}

export async function finalizePdfx4ViaApi(
  file: File | Blob,
  profile: ProductionProfile | string,
  options?: {
    destinationIccPresetId?: string;
    destIccFile?: File | Blob;
    title?: string;
    author?: string;
    creator?: string;
  }
): Promise<FinalizePdfx4ApiResponse> {
  const targetUrl = apiUrl('/api/finalize-pdfx4');

  try {
    const formData = new FormData();
    formData.append('file', file);
    if (typeof profile === 'string') {
      formData.append('profileId', profile);
    } else {
      formData.append('profileId', profile.id);
      formData.append('profileName', profile.name);
      if (profile.expectedWidthMm) formData.append('expectedWidthMm', String(profile.expectedWidthMm));
      if (profile.expectedHeightMm) formData.append('expectedHeightMm', String(profile.expectedHeightMm));
      if (profile.expectedBleedMm !== undefined) formData.append('expectedBleedMm', String(profile.expectedBleedMm));
    }

    if (options?.destinationIccPresetId) {
      formData.append('destinationIccPresetId', options.destinationIccPresetId);
    }
    if (options?.destIccFile) {
      formData.append('destIccFile', options.destIccFile);
    }
    if (options?.title) formData.append('title', options.title);
    if (options?.author) formData.append('author', options.author);
    if (options?.creator) formData.append('creator', options.creator);

    let authHeader = {};
    try {
      authHeader = await getAuthHeader();
    } catch {}

    const res = await fetch(targetUrl, {
      method: 'POST',
      body: formData,
      headers: {
        ...authHeader,
      },
      cache: 'no-store',
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        success: false,
        error: data?.error || `Erro HTTP ${res.status} na finalização PDF/X-4.`,
      };
    }

    return data as FinalizePdfx4ApiResponse;
  } catch (err: any) {
    console.error('finalizePdfx4ViaApi error:', err);
    return {
      success: false,
      error: err?.message || 'Falha de comunicação ao finalizar PDF/X-4.',
    };
  }
}

export interface PreparePdfx4ApiResponse {
  success: boolean;
  status?: string;
  steps?: any[];
  eligibleAfterPreparation?: { eligible: boolean; reasons: string[] };
  preparedPdfBase64?: string;
  preparedPdfSize?: number;
  originalSha256?: string;
  preparedSha256?: string;
  verifiedPdfX?: boolean;
  summaryMessage?: string;
  error?: string;
}

export async function preparePdfx4ViaApi(
  file: File | Blob,
  profile: ProductionProfile | string,
  options?: {
    destinationIccPresetId?: string;
    destIccFile?: File | Blob;
    sourceIccPresetId?: string;
    sourceIccFile?: File | Blob;
    allowFallbackSrgb?: boolean;
  }
): Promise<PreparePdfx4ApiResponse> {
  const targetUrl = apiUrl('/api/prepare-pdfx4');

  try {
    const formData = new FormData();
    formData.append('file', file);
    if (typeof profile === 'string') {
      formData.append('profileId', profile);
    } else {
      formData.append('profileId', profile.id);
      formData.append('profileName', profile.name);
      if (profile.expectedWidthMm) formData.append('expectedWidthMm', String(profile.expectedWidthMm));
      if (profile.expectedHeightMm) formData.append('expectedHeightMm', String(profile.expectedHeightMm));
      if (profile.expectedBleedMm !== undefined) formData.append('expectedBleedMm', String(profile.expectedBleedMm));
    }

    if (options?.destinationIccPresetId) {
      formData.append('destinationIccPresetId', options.destinationIccPresetId);
    }
    if (options?.destIccFile) {
      formData.append('destIccFile', options.destIccFile);
    }
    if (options?.sourceIccPresetId) {
      formData.append('sourceIccPresetId', options.sourceIccPresetId);
    }
    if (options?.sourceIccFile) {
      formData.append('sourceIccFile', options.sourceIccFile);
    }
    if (options?.allowFallbackSrgb !== undefined) {
      formData.append('allowFallbackSrgb', String(options.allowFallbackSrgb));
    }

    let authHeader = {};
    try {
      authHeader = await getAuthHeader();
    } catch {}

    const res = await fetch(targetUrl, {
      method: 'POST',
      body: formData,
      headers: {
        ...authHeader,
      },
      cache: 'no-store',
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        success: false,
        error: data?.error || `Erro HTTP ${res.status} na preparação PDF/X-4.`,
      };
    }

    return data as PreparePdfx4ApiResponse;
  } catch (err: any) {
    console.error('preparePdfx4ViaApi error:', err);
    return {
      success: false,
      error: err?.message || 'Falha de comunicação ao preparar PDF/X-4.',
    };
  }
}


