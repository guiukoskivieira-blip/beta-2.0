import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * ARTECHECK AI — Camada Isolada de Cliente Supabase
 * 
 * Responsabilidades:
 * - Inicializar o cliente com as credenciais públicas (Anon Key / Publishable Key);
 * - Validar a disponibilidade e integridade da configuração;
 * - Prevenir fallback silencioso para mock quando houver configuração parcial ou inválida;
 * - Manter total isolamento do Core Preflight.
 */

export function resolveSupabaseEnv(): { url: string; anonKey: string; hasPartialConfig: boolean; isConfigured: boolean } {
  let url = '';
  let anonKey = '';

  try {
    // 1. Acesso direto a import.meta.env (permite estática substituição pelo Vite)
    if (typeof import.meta !== 'undefined' && (import.meta as any).env) {
      const meta = (import.meta as any).env;
      url = meta.VITE_SUPABASE_URL || meta.NEXT_PUBLIC_SUPABASE_URL || meta.SUPABASE_URL || '';
      anonKey = meta.VITE_SUPABASE_ANON_KEY || meta.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || meta.NEXT_PUBLIC_SUPABASE_ANON_KEY || meta.SUPABASE_ANON_KEY || '';
    }
  } catch {
    // Ignore meta resolution error
  }

  // 2. Fallback para process.env em runtime Node / Testes
  if (!url || !anonKey) {
    try {
      if (typeof process !== 'undefined' && process.env) {
        if (!url) {
          url = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
        }
        if (!anonKey) {
          anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';
        }
      }
    } catch {
      // Ignore process resolution error
    }
  }

  // Sanitize
  url = url.replace(/^[=\s]+/, '').trim().replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
  anonKey = anonKey.replace(/^[=\s]+/, '').trim();

  const hasUrl = Boolean(url && url.length > 0);
  const hasKey = Boolean(anonKey && anonKey.length > 0);
  const isValidUrl = hasUrl && /^https?:\/\/.+/i.test(url);

  const isConfigured = Boolean(isValidUrl && hasKey);
  const hasPartialConfig = Boolean((hasUrl || hasKey) && !isConfigured);

  return {
    url,
    anonKey,
    hasPartialConfig,
    isConfigured,
  };
}

export const isSupabaseConfigured = (): boolean => {
  return resolveSupabaseEnv().isConfigured;
};

export const hasIncompleteSupabaseConfig = (): boolean => {
  return resolveSupabaseEnv().hasPartialConfig;
};

let clientInstance: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  const env = resolveSupabaseEnv();
  if (!env.isConfigured) {
    return null;
  }

  if (!clientInstance) {
    clientInstance = createClient(env.url, env.anonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    });
  }

  return clientInstance;
}

export function resetSupabaseClientInstance(): void {
  clientInstance = null;
}

export const supabase = getSupabaseClient();
