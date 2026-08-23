import type { AuthProvider } from './AuthProvider';
import { LocalDevAuthProvider } from './LocalDevAuthProvider';
import { SupabaseAuthProvider } from './SupabaseAuthProvider';
import { isSupabaseConfigured } from '../lib/supabaseClient';

export * from './AuthProvider';
export * from './LocalDevAuthProvider';
export * from './SupabaseAuthProvider';

function createAuthProvider(): AuthProvider {
  if (isSupabaseConfigured()) {
    return new SupabaseAuthProvider();
  }
  return new LocalDevAuthProvider();
}

export const auth: AuthProvider = createAuthProvider();
