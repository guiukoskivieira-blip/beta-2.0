// src/services/prexyonSsoService.ts
import type { SupabaseClient, Session } from '@supabase/supabase-js';

/** Reads the SSO code from the callback URL, accepting `code` or legacy `sso_code`. */
export function readPrexyonCode(searchParams: URLSearchParams): string {
  const code = searchParams.get('code') || searchParams.get('sso_code');
  if (!code) {
    throw new Error('Missing SSO code in callback URL');
  }
  return code.trim();
}

/** Exchanges the SSO code via the Edge Function `prexyon-sso-exchange` and verifies OTP.
 * Returns a valid Supabase Session.
 */
export async function exchangePrexyonCode(
  client: SupabaseClient,
  code: string,
  audience: string
): Promise<Session> {
  // Invoke Edge Function
  const { data: fnData, error: fnError } = await client.functions.invoke('prexyon-sso-exchange', {
    body: JSON.stringify({ code, audience }),
  });
  if (fnError) {
    throw new Error('Prexyon SSO exchange failed');
  }
  const { token_hash, verification_type } = fnData as any;
  if (!token_hash || !verification_type) {
    throw new Error('Invalid response from prexyon-sso-exchange');
  }
  // Verify OTP to obtain session
  const { data: otpData, error: otpError } = await client.auth.verifyOtp({
    token_hash,
    type: verification_type,
  });
  if (otpError) {
    throw new Error('OTP verification failed');
  }
  if (!otpData?.session) {
    throw new Error('OTP verification did not return a session');
  }
  return otpData.session;
}
