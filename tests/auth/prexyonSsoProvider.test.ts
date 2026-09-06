// tests/auth/prexyonSsoProvider.test.ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PrexyonSSOProvider } from '../../src/auth/PrexyonSSOProvider';
import { getSsoDiagnostics } from '../../src/auth/ssoDiagnostics';

let signOutCalled = false;

const mockClient = {
  functions: {
    invoke: async (_fn: string, _opts: any) => {
      return { data: { token_hash: 'hash123', verification_type: 'email' }, error: null };
    },
  },
  auth: {
    verifyOtp: async (_opts: any) => {
      return { data: { session: { access_token: 'sess-token', user: { id: 'user-1' } } }, error: null };
    },
    signOut: async () => {
      signOutCalled = true;
      return {};
    },
    getUser: async () => ({ data: { user: { id: 'user-1', email: 'u@test.com' } }, error: null }),
    getSession: async () => ({ data: { session: { access_token: 'sess-token', user: { id: 'user-1' } } }, error: null }),
  },
  from: () => ({
    select: () => ({
      eq: () => ({
        eq: () => ({
          single: async () => ({ data: { is_enabled: true, is_active: true, role: 'member' }, error: null }),
          maybeSingle: async () => ({ data: null, error: null }),
        }),
        single: async () => ({ data: { is_active: true, role: 'member' }, error: null }),
        maybeSingle: async () => ({ data: null, error: null }),
      }),
    }),
  }),
  rpc: async () => ({ data: { effective_products: ['artecheck'] }, error: null }),
};

describe('PrexyonSSOProvider fail‑closed behavior', () => {
  it('signOut clears permissions and calls auth.signOut', async () => {
    signOutCalled = false;
    const provider = new PrexyonSSOProvider(mockClient);
    await provider.signOut();
    assert.equal(signOutCalled, true, 'signOut should be called');
  });

  it('exchange failure triggers signOut and fail-closed', async () => {
    signOutCalled = false;
    const failingClient = {
      ...mockClient,
      functions: {
        invoke: async () => ({ data: null, error: new Error('Exchange failed') }),
      },
    };
    const provider = new PrexyonSSOProvider(failingClient);
    await assert.rejects(() => provider.handleSSOCallback('fail-exchange'));
    assert.equal(signOutCalled, true, 'signOut should be called on exchange error');
  });

  it('bootstrap failure triggers signOut and fail-closed', async () => {
    signOutCalled = false;
    const failingBootstrapClient = {
      ...mockClient,
      from: () => ({
        select: () => ({
          eq: () => ({
            single: async () => ({ data: null, error: new Error('No membership') }),
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
      }),
    };
    const provider = new PrexyonSSOProvider(failingBootstrapClient);
    await assert.rejects(() => provider.handleSSOCallback('validcode'));
    assert.equal(signOutCalled, true, 'signOut should be called on bootstrap error');
    assert.equal(getSsoDiagnostics().ssoStage, 'bootstrap_failed');
    assert.equal(getSsoDiagnostics().otpSessionReceived, true, 'session evidence survives fail-closed sign-out');
  });
});
