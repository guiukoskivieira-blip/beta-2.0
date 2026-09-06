// src/auth/initAuthSession.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { PrexyonSSOProvider } from './PrexyonSSOProvider';
import { bootstrapUserContext } from './bootstrapUserContext';
import { clearArteCheckSessionPermissions } from './arteCheckPermissions';

export type AuthInitStatus = 'loading' | 'authenticated' | 'unauthenticated' | 'error';

let _inFlightInit: Promise<AuthInitStatus> | null = null;

/**
 * Resets the in-flight lock (used primarily in test suites).
 */
export function resetAuthInitFlight(): void {
  _inFlightInit = null;
}

async function executeAuthInit(
  client: SupabaseClient | null,
  customSearch?: string,
): Promise<AuthInitStatus> {
  if (!client) {
    clearArteCheckSessionPermissions();
    return 'unauthenticated';
  }

  // 1. Check if SSO callback code is present in URL
  let code: string | null = null;
  if (customSearch !== undefined) {
    const sp = new URLSearchParams(customSearch);
    code = sp.get('code') || sp.get('sso_code');
  } else if (typeof window !== 'undefined' && window.location) {
    const sp = new URLSearchParams(window.location.search);
    code = sp.get('code') || sp.get('sso_code');
  }

  if (code && code.trim()) {
    try {
      const ssoProvider = new PrexyonSSOProvider(client);
      await ssoProvider.handleSSOCallback(code.trim());

      // Clean URL parameters safely
      if (typeof window !== 'undefined' && window.history && window.location) {
        const cleanPath = window.location.pathname || '/';
        window.history.replaceState({}, document.title, cleanPath);
      }

      return 'authenticated';
    } catch (err) {
      console.error('[ArteCheck SSO] Callback initialization failed');
      clearArteCheckSessionPermissions();
      return 'error';
    }
  }

  // 2. Check for existing active session in Supabase Auth
  try {
    const { data, error } = await client.auth.getSession();
    if (error || !data?.session) {
      clearArteCheckSessionPermissions();
      return 'unauthenticated';
    }

    // Re-bootstrap user context & restore permissions in memory
    await bootstrapUserContext(client, data.session);
    return 'authenticated';
  } catch (err) {
    console.error('[ArteCheck SSO] Active session bootstrap failed');
    clearArteCheckSessionPermissions();
    return 'error';
  }
}

/**
 * Initializes the authentication session and resolves in-memory ArteCheck permissions.
 *
 * Implements a Single-Flight / In-Flight lock in memory:
 * Concurrent calls (such as React StrictMode double-mounting) share the same
 * running Promise, preventing duplicate exchange of one-time SSO codes and
 * spurious sign-out race conditions.
 */
export async function initializeAuthSession(
  client: SupabaseClient | null,
  customSearch?: string,
): Promise<AuthInitStatus> {
  if (_inFlightInit) {
    return _inFlightInit;
  }

  _inFlightInit = (async () => {
    try {
      return await executeAuthInit(client, customSearch);
    } finally {
      _inFlightInit = null;
    }
  })();

  return _inFlightInit;
}
