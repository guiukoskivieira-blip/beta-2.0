// src/auth/initAuthSession.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { PrexyonSSOProvider } from './PrexyonSSOProvider';
import { bootstrapUserContext } from './bootstrapUserContext';
import {
  clearArteCheckSessionPermissions,
  denyArteCheckAuthorizationPreservingTenant,
  getArteCheckSessionPermissions,
} from './arteCheckPermissions';

export type AuthInitStatus = 'loading' | 'authenticated' | 'unauthenticated' | 'error';
export type AuthInitStage = 'idle' | 'pending' | 'success' | 'failed';

let _inFlightInit: Promise<AuthInitStatus> | null = null;
let _initStage: AuthInitStage = 'idle';
let _resolvedStatus: AuthInitStatus | null = null;

export function getAuthInitStage(): AuthInitStage {
  return _initStage;
}

export function isAuthInitPending(): boolean {
  return _initStage === 'pending' || _inFlightInit !== null;
}

export function setAuthInitStage(stage: AuthInitStage): void {
  _initStage = stage;
}

export function hasSSOCallbackCode(customSearch?: string): boolean {
  let search = customSearch;
  if (search === undefined && typeof window !== 'undefined' && window.location) {
    search = window.location.search;
  }
  if (!search) return false;
  const sp = new URLSearchParams(search);
  const code = sp.get('code') || sp.get('sso_code');
  return !!(code && code.trim());
}

/**
 * Resets the in-flight lock, stage, and resolved status (used in test suites and logouts).
 */
export function resetAuthInitFlight(): void {
  _inFlightInit = null;
  _initStage = 'idle';
  _resolvedStatus = null;
}

async function executeAuthInit(
  client: SupabaseClient | null,
  customSearch?: string,
): Promise<AuthInitStatus> {
  _initStage = 'pending';
  if (!client) {
    _initStage = 'failed';
    _resolvedStatus = 'unauthenticated';
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
    } catch (err) {
      // Do not log raw remote errors or session details.
      _initStage = 'failed';
      _resolvedStatus = 'error';
      clearArteCheckSessionPermissions();
      return 'error';
    }

    // URL cleanup is navigation hygiene, not authentication. A History API
    // failure must never revoke an already bootstrapped session/RBAC state.
    if (typeof window !== 'undefined' && window.history && window.location) {
      try {
        const cleanUrl = new URL(window.location.href);
        cleanUrl.searchParams.delete('code');
        cleanUrl.searchParams.delete('sso_code');
        const relativeUrl = `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}` || '/';
        window.history.replaceState(window.history.state, '', relativeUrl);
      } catch {
        // Keep the authenticated session fail-safe; a later navigation/reload
        // can clean the address without changing authorization.
      }
    }

    _initStage = 'success';
    _resolvedStatus = 'authenticated';
    return 'authenticated';
  }

  // 2. Check for existing active session in Supabase Auth
  try {
    const { data, error } = await client.auth.getSession();
    if (error || !data?.session) {
      _initStage = 'failed';
      _resolvedStatus = 'unauthenticated';
      clearArteCheckSessionPermissions();
      return 'unauthenticated';
    }

    // Re-bootstrap user context & restore permissions in memory
    await bootstrapUserContext(client, data.session);
    _initStage = 'success';
    _resolvedStatus = 'authenticated';
    return 'authenticated';
  } catch (err) {
    // Do not log raw remote errors or session details.
    _initStage = 'failed';
    _resolvedStatus = 'error';
    // A valid membership may already have established the tenant identity.
    // Preserve it for tenant-scoped storage, but keep every permission denied.
    denyArteCheckAuthorizationPreservingTenant();
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
 *
 * If initialization has already succeeded in the current SPA lifecycle and no new SSO code is present,
 * it returns the existing authenticated status without repeating destructive getSession checks.
 */
export async function initializeAuthSession(
  client: SupabaseClient | null,
  customSearch?: string,
): Promise<AuthInitStatus> {
  const hasNewCode = hasSSOCallbackCode(customSearch);

  if (!hasNewCode && _initStage === 'success' && _resolvedStatus === 'authenticated') {
    const currentPerms = getArteCheckSessionPermissions();
    if (currentPerms && currentPerms.bootstrapped) {
      return 'authenticated';
    }
  }

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
