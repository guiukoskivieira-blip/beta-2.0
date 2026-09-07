/**
 * Prexyon Portal Configuration & Destination Resolution
 *
 * Centralizes the Prexyon Portal URL configuration across ArteCheck.
 * In production: reads VITE_PREXYON_PORTAL_URL from environment with fallback to
 * the current active production portal ('https://prexyon-production.up.railway.app').
 * When the official domain ('https://portal.prexyon.com') is activated, changing
 * VITE_PREXYON_PORTAL_URL is sufficient without altering any UI components.
 */

export const DEFAULT_PREXYON_PORTAL_URL = 'https://prexyon-production.up.railway.app';

/**
 * Safely resolves the normalized Prexyon Portal URL without trailing slashes.
 */
export function getPrexyonPortalUrl(): string {
  let envUrl = '';

  try {
    if (typeof import.meta !== 'undefined' && (import.meta as any).env) {
      envUrl = (import.meta as any).env.VITE_PREXYON_PORTAL_URL || '';
    }
  } catch {
    // Ignore meta resolution error
  }

  if (!envUrl && typeof process !== 'undefined' && process.env) {
    envUrl = process.env.VITE_PREXYON_PORTAL_URL || process.env.PREXYON_PORTAL_URL || '';
  }

  const trimmed = envUrl.trim().replace(/\/+$/, '');
  return trimmed || DEFAULT_PREXYON_PORTAL_URL;
}

export const PREXYON_PORTAL_URL = getPrexyonPortalUrl();
