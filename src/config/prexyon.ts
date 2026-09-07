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
export const DEFAULT_PREXYON_ORCAGRAF_URL = 'https://or-agraf-bete-20-production.up.railway.app';
export const DEFAULT_PREXYON_ARTEFLOW_URL = 'https://arteflow-10-production.up.railway.app';

function resolveEnvVar(primaryKey: string, secondaryKey?: string): string {
  let val = '';
  try {
    if (typeof import.meta !== 'undefined' && (import.meta as any).env) {
      val = (import.meta as any).env[primaryKey] || (secondaryKey ? (import.meta as any).env[secondaryKey] : '') || '';
    }
  } catch {
    // Ignore meta resolution error
  }

  if (!val && typeof process !== 'undefined' && process.env) {
    val = process.env[primaryKey] || (secondaryKey ? process.env[secondaryKey] : '') || '';
  }

  return val.trim().replace(/\/+$/, '');
}

/**
 * Safely resolves the normalized Prexyon Portal URL without trailing slashes.
 */
export function getPrexyonPortalUrl(): string {
  const url = resolveEnvVar('VITE_PREXYON_PORTAL_URL', 'PREXYON_PORTAL_URL');
  return url || DEFAULT_PREXYON_PORTAL_URL;
}

/**
 * Safely resolves the normalized OrçaGraf application URL.
 */
export function getPrexyonOrcagrafUrl(): string {
  const url = resolveEnvVar('VITE_PREXYON_ORCAGRAF_URL', 'VITE_ORCAGRAF_APP_URL');
  return url || DEFAULT_PREXYON_ORCAGRAF_URL;
}

/**
 * Safely resolves the normalized ArteFlow application URL.
 */
export function getPrexyonArteflowUrl(): string {
  const url = resolveEnvVar('VITE_PREXYON_ARTEFLOW_URL', 'VITE_ARTEFLOW_APP_URL');
  return url || DEFAULT_PREXYON_ARTEFLOW_URL;
}

/**
 * Safely resolves the normalized ArteCheck application URL.
 */
export function getPrexyonArtecheckUrl(): string {
  const url = resolveEnvVar('VITE_PREXYON_ARTECHECK_URL', 'VITE_ARTECHECK_APP_URL');
  if (url) return url;
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return '';
}

export interface PrexyonProductItem {
  id: 'orcagraf' | 'arteflow' | 'artecheck';
  name: string;
  tag: string;
  description: string;
  url: string;
  active: boolean;
}

/**
 * Returns the standard list of 3 Prexyon ecosystem products with resolved URLs.
 */
export function getPrexyonProducts(): PrexyonProductItem[] {
  return [
    {
      id: 'orcagraf',
      name: 'OrçaGraf',
      tag: 'OG',
      description: 'Orçamentos e Gestão Gráfica',
      url: getPrexyonOrcagrafUrl(),
      active: false,
    },
    {
      id: 'arteflow',
      name: 'ArteFlow',
      tag: 'AF',
      description: 'Fluxo e Gestão de Produção',
      url: getPrexyonArteflowUrl(),
      active: false,
    },
    {
      id: 'artecheck',
      name: 'ArteCheck',
      tag: 'AC',
      description: 'Validação e Pré-voo de PDF',
      url: getPrexyonArtecheckUrl(),
      active: true,
    },
  ];
}

export const PREXYON_PORTAL_URL = getPrexyonPortalUrl();

