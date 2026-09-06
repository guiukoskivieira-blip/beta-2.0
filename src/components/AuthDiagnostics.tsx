import React, { useEffect, useState } from 'react';
import { getAuthDiagnostics } from '../auth/authDiagnostics';
import { getAuthInitStage } from '../auth/initAuthSession';
import { getSupabaseClient } from '../lib/supabaseClient';

declare const __AUTH_DIAGNOSTIC_BUILD__: string;

// Temporary display only: no auth/RBAC writes, requests, storage or logging.
export function AuthDiagnostics({ bootstrapped, isOwner, hasCreate }: {
  bootstrapped: boolean;
  isOwner: boolean;
  hasCreate: boolean;
}) {
  const [session, setSession] = useState(false);
  const [, refresh] = useState(0);
  useEffect(() => {
    const client = getSupabaseClient();
    const subscription = client?.auth.onAuthStateChange((_event, current) => {
      setSession(Boolean(current));
    }).data.subscription;
    const timer = window.setInterval(() => refresh(value => value + 1), 500);
    return () => {
      window.clearInterval(timer);
      subscription?.unsubscribe();
    };
  }, []);

  const fields = {
    build: typeof __AUTH_DIAGNOSTIC_BUILD__ === 'string' ? __AUTH_DIAGNOSTIC_BUILD__ : 'auth-diag-1/test',
    initStage: getAuthInitStage(),
    session,
    bootstrapped: Boolean(bootstrapped),
    isOwner: Boolean(isOwner),
    hasCreate: Boolean(hasCreate),
    ...getAuthDiagnostics(),
  };
  return <pre aria-label="Diagnóstico temporário ArteCheck" className="m-4 whitespace-pre-wrap rounded border border-amber-400 bg-amber-50 p-3 text-xs text-slate-900">
    {Object.entries(fields).map(([key, value]) => `${key}: ${value}`).join('\n')}
  </pre>;
}
