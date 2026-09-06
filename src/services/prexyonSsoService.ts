// src/services/prexyonSsoService.ts
import type { SupabaseClient, Session } from '@supabase/supabase-js';
import { observeExchange, observeExchangeResponse, observeOtpSession, observeSsoError, observeSsoStage } from '../auth/ssoDiagnostics';

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
  observeExchange(audience);
  let stage: 'exchange_failed' | 'exchange_response_invalid' | 'otp_failed' | 'otp_session_missing' = 'exchange_failed';
  try {
  // Invoke Edge Function
  const { data: fnData, error: fnError } = await client.functions.invoke('prexyon-sso-exchange', {
    body: JSON.stringify({ code, audience }),
  });
  if (fnError) {
    throw fnError;
  }
  stage = 'exchange_response_invalid';
  observeExchangeResponse(fnData);
  const { token_hash, verification_type } = fnData as any;
  if (!token_hash || !verification_type) {
    throw new Error('Invalid response from prexyon-sso-exchange');
  }
  // Verify OTP to obtain session
  stage = 'otp_failed';
  observeSsoStage('otp_pending');
  const { data: otpData, error: otpError } = await client.auth.verifyOtp({
    token_hash,
    type: verification_type,
  });
  if (otpError) {
    throw otpError;
  }
  stage = 'otp_session_missing';
  observeOtpSession(Boolean(otpData?.session));
  if (!otpData?.session) {
    throw new Error('OTP verification did not return a session');
  }
  return otpData.session;
  } catch (error) {
    await observeSsoError(stage, error);
    // Never propagate remote error text that could contain sensitive values.
    throw new Error(`Prexyon SSO failed: ${stage}`);
  }
}
