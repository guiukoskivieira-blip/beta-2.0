import assert from 'node:assert/strict';
import { test } from 'node:test';
import { exchangePrexyonCode } from '../src/services/prexyonSsoService';
import { getSsoDiagnostics, observeSsoError } from '../src/auth/ssoDiagnostics';

test('exchange and OTP failures retain only sanitized observations, without retry', async () => {
  let calls = 0;
  let otpCalls = 0;
  let exchangeResult: any = { data: null, error: {
    context: new Response(JSON.stringify({ code: 'code_already_used', message: 'sensitive-fixture' }), { status: 409 }),
  } };
  let otpResult: any = { data: null, error: { code: 'otp_expired', status: 403, message: 'sensitive-fixture' } };
  const client: any = {
    functions: { invoke: async (name: string, options: any) => {
      calls++;
      assert.equal(name, 'prexyon-sso-exchange');
      assert.equal(JSON.parse(options.body).audience, 'artecheck');
      return exchangeResult;
    } },
    auth: { verifyOtp: async (options: any) => {
      otpCalls++;
      assert.deepEqual(options, { token_hash: 'synthetic-hash', type: 'email' });
      return otpResult;
    } },
  };
  await assert.rejects(exchangePrexyonCode(client, 'synthetic-code', 'artecheck'), /exchange_failed/);
  assert.equal(calls, 1);
  assert.equal(otpCalls, 0);
  assert.equal(getSsoDiagnostics().exchangeRepeated, false);
  assert.equal(getSsoDiagnostics().ssoError, 'http_409/code_already_used');

  exchangeResult = { data: null, error: null };
  await assert.rejects(exchangePrexyonCode(client, 'synthetic-code', 'artecheck'), /exchange_response_invalid/);
  assert.equal(getSsoDiagnostics().tokenHashPresent, false);
  assert.equal(otpCalls, 0);
  assert.equal(getSsoDiagnostics().exchangeRepeated, true);

  exchangeResult = { data: { token_hash: 'synthetic-hash', verification_type: 'email' }, error: null };
  await assert.rejects(exchangePrexyonCode(client, 'synthetic-code', 'artecheck'), /otp_failed/);
  assert.equal(getSsoDiagnostics().ssoError, 'http_403/otp_expired');
  assert.equal(getSsoDiagnostics().verificationTypeSupported, true);
  assert.equal(getSsoDiagnostics().otpSessionReceived, false);

  otpResult = { data: { session: null }, error: null };
  await assert.rejects(exchangePrexyonCode(client, 'synthetic-code', 'artecheck'), /otp_session_missing/);
  otpResult = { data: { session: { access_token: 'sensitive-fixture' } }, error: null };
  await exchangePrexyonCode(client, 'synthetic-code', 'artecheck');
  assert.equal(getSsoDiagnostics().otpSessionReceived, true);
  assert.equal(getSsoDiagnostics().ssoStage, 'session_received');
  assert.equal(calls, 5);
  assert.equal(otpCalls, 3);
  assert.doesNotMatch(JSON.stringify(getSsoDiagnostics()), /synthetic|sensitive-fixture/);
});

test('unknown remote codes, messages and response fields are never exposed', async () => {
  await observeSsoError('exchange_failed', { code: 'sensitive-fixture', message: 'sensitive-fixture',
    context: new Response(JSON.stringify({ error: 'sensitive-fixture', token: 'sensitive-fixture' }), { status: 401 }),
  });
  assert.equal(getSsoDiagnostics().ssoError, 'http_401/unclassified');
  await observeSsoError('exchange_failed', { name: 'FunctionsFetchError', message: 'sensitive-fixture' });
  assert.equal(getSsoDiagnostics().ssoError, 'function_fetch_failed');
  assert.doesNotMatch(JSON.stringify(getSsoDiagnostics()), /sensitive-fixture/);
});
