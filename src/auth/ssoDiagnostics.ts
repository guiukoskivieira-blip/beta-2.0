// Temporary observations only. No codes, response bodies or session objects retained.
type Stage = 'idle' | 'client_missing' | 'callback_entered' | 'exchange_pending' |
  'exchange_failed' | 'exchange_response' | 'exchange_response_invalid' |
  'otp_pending' | 'otp_failed' | 'otp_session_missing' | 'session_received' |
  'bootstrap_pending' | 'bootstrap_failed' | 'bootstrap_complete';
const initial = {
  ssoStage: 'idle' as Stage,
  ssoError: 'none',
  audienceArtecheck: false,
  exchangeRepeated: false,
  tokenHashPresent: false,
  verificationTypePresent: false,
  verificationTypeSupported: false,
  otpSessionReceived: false,
};
let state = { ...initial };
let exchanges = 0;
export const getSsoDiagnostics = () => ({ ...state });
export function observeSsoStage(ssoStage: Stage) { state = { ...state, ssoStage }; }
export function observeExchange(audience: string) {
  exchanges += 1;
  state = { ...initial, ssoStage: 'exchange_pending', audienceArtecheck: audience === 'artecheck', exchangeRepeated: exchanges > 1 };
}
export function observeExchangeResponse(data: unknown) {
  const response = data as { token_hash?: unknown; verification_type?: unknown } | null;
  state = { ...state, ssoStage: 'exchange_response',
    tokenHashPresent: typeof response?.token_hash === 'string' && response.token_hash.length > 0,
    verificationTypePresent: typeof response?.verification_type === 'string' && response.verification_type.length > 0,
    verificationTypeSupported: ['signup', 'invite', 'magiclink', 'recovery', 'email_change', 'email'].includes(String(response?.verification_type)),
  };
}
export function observeOtpSession(present: boolean) {
  state = { ...state, otpSessionReceived: present, ssoStage: present ? 'session_received' : 'otp_session_missing' };
}

// Exact allowlist: unknown values/messages are NEVER displayed or logged.
const allowedCodes = new Set(['otp_expired', 'otp_disabled', 'invalid_credentials',
  'validation_failed', 'bad_json', 'bad_jwt', 'unexpected_failure', 'request_timeout',
  'over_request_rate_limit', 'over_email_send_rate_limit', 'user_not_found',
  'invalid_code', 'code_expired', 'code_used', 'code_already_used', 'invalid_audience',
  'audience_mismatch', 'sso_code_expired', 'sso_code_invalid', 'sso_code_used']);
export async function observeSsoError(stage: Stage, error: unknown) {
  observeSsoStage(stage);
  let safe = 'unclassified';
  try {
    const value = error as { code?: unknown; name?: unknown; status?: unknown; context?: unknown };
    let candidate = value?.code;
    const response = typeof Response !== 'undefined' && value?.context instanceof Response ? value.context : null;
    const status = response?.status ?? value?.status;
    if (response) {
      // Inspect the existing failed response only; never retry the one-time exchange.
      const body = await response.clone().json().catch(() => null);
      candidate = body?.code ?? body?.error_code ?? body?.error;
    }
    const normalized = typeof candidate === 'string' ? candidate.toLowerCase() : '';
    if (allowedCodes.has(normalized)) safe = normalized;
    else if (value?.name === 'FunctionsFetchError') safe = 'function_fetch_failed';
    else if (value?.name === 'FunctionsRelayError') safe = 'function_relay_failed';
    if (typeof status === 'number' && Number.isInteger(status) && status >= 100 && status <= 599) safe = `http_${status}/${safe}`;
  } catch { /* Diagnostic failure must not affect authentication. */ }
  state = { ...state, ssoError: safe };
}
