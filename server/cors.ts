/**
 * CORS Helper for ArteCheck Express Server
 * Normalizes origins and provides deterministic CORS checks without generic wildcard leaks.
 */

export function parseCorsAllowedOrigins(rawEnv?: string): string[] {
  if (!rawEnv) return [];
  return rawEnv
    .split(',')
    .map(origin => origin.trim())
    .filter(origin => origin.length > 0);
}

export function isOriginAllowed(origin: string, configuredOrigins: string[] = []): boolean {
  if (!origin || typeof origin !== 'string') return false;

  const trimmedOrigin = origin.trim();

  // 1. Exact match against configured origins (from CORS_ALLOWED_ORIGINS and default allowlist)
  if (configuredOrigins.includes(trimmedOrigin)) {
    return true;
  }

  // 2. Localhost development support (http/https with optional port)
  if (/^https?:\/\/localhost(:\d+)?$/.test(trimmedOrigin)) {
    return true;
  }

  // 3. Legacy bolt.host preview origins support
  if (/^https:\/\/.*\.bolt\.host$/.test(trimmedOrigin)) {
    return true;
  }

  // Explicitly disallow generic matching for other domains unless explicitly listed
  return false;
}
