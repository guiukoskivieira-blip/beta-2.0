// tests/auth/prexyonSsoProvider.test.ts
import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { PrexyonSSOProvider } from '../../src/auth/PrexyonSSOProvider';

// Mock Supabase client and its methods
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
  },
  from: () => ({
    select: () => ({
      eq: () => ({ single: async () => ({ data: null, error: null }) }),
    }),
  }),
  rpc: async () => ({ data: { effective_products: ['artecheck'] }, error: null }),
};

let signOutCalled = false;

// Apply native node:test mocks for module functions
import * as supabaseClientMod from '../../src/lib/supabaseClient';
import * as prexyonServiceMod from '../../src/services/prexyonSsoService';
import * as bootstrapMod from '../../src/auth/bootstrapUserContext';

mock.method(supabaseClientMod, 'getSupabaseClient', () => mockClient);
mock.method(prexyonServiceMod, 'exchangePrexyonCode', async (_c: any, code: string, _aud: string) => {
  if (code === 'fail-exchange') throw new Error('exchange error');
  return { access_token: 'sess-token', user: { id: 'user-1' } } as any;
});
mock.method(prexyonServiceMod, 'readPrexyonCode', (sp: URLSearchParams) => sp.get('code') || sp.get('sso_code') || '');
mock.method(bootstrapMod, 'bootstrapUserContext', async (_c: any, _s: any) => {
  if (process.env.TEST_BOOTSTRAP_FAIL) throw new Error('bootstrap error');
});

describe('PrexyonSSOProvider fail‑closed behavior', () => {
  it('successful flow does not sign out', async () => {
    const provider = new PrexyonSSOProvider();
    await provider.handleSSOCallback('validcode');
    assert.equal(signOutCalled, false, 'signOut should not be called on success');
  });

  it('exchange failure triggers signOut', async () => {
    const provider = new PrexyonSSOProvider();
    await assert.rejects(() => provider.handleSSOCallback('fail-exchange'));
    assert.equal(signOutCalled, true, 'signOut should be called on exchange error');
    signOutCalled = false; // reset
  });

  it('bootstrap failure triggers signOut', async () => {
    process.env.TEST_BOOTSTRAP_FAIL = '1';
    const provider = new PrexyonSSOProvider();
    await assert.rejects(() => provider.handleSSOCallback('validcode'));
    assert.equal(signOutCalled, true, 'signOut should be called on bootstrap error');
    delete process.env.TEST_BOOTSTRAP_FAIL;
    signOutCalled = false;
  });
});
