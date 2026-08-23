import type { AuthProvider } from './AuthProvider';
import { LocalDevAuthProvider } from './LocalDevAuthProvider';
import { SupabaseAuthProvider } from './SupabaseAuthProvider';
import { IncompleteConfigAuthProvider } from './IncompleteConfigAuthProvider';
import { resolveSupabaseEnv } from '../lib/supabaseClient';

export * from './AuthProvider';
export * from './LocalDevAuthProvider';
export * from './SupabaseAuthProvider';
export * from './IncompleteConfigAuthProvider';

export function createAuthProvider(resolver: typeof resolveSupabaseEnv = resolveSupabaseEnv): AuthProvider {
  const envState = resolver();
  if (envState.isConfigured) {
    return new SupabaseAuthProvider();
  }
  if (envState.hasPartialConfig) {
    return new IncompleteConfigAuthProvider();
  }
  return new LocalDevAuthProvider();
}

export const auth: AuthProvider = createAuthProvider();
