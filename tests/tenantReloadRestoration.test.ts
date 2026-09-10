import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import {
  clearArteCheckSessionPermissions,
  getArteCheckSessionPermissions,
  hasPermission,
} from '../src/auth/arteCheckPermissions';
import { initializeAuthSession, resetAuthInitFlight } from '../src/auth/initAuthSession';
import { LocalStorageProvider } from '../src/storage/LocalStorageProvider';

type Failure = 'organization' | 'entitlement' | 'product_access' | 'permissions' | 'membership' | null;

function clientFor(failure: Failure = null): any {
  const chain = (table: string) => {
    const builder: any = {
      select: () => builder,
      eq: () => builder,
      in: () => builder,
      maybeSingle: async () => {
        if (table === 'organization_members') return { data: { role: 'member' }, error: null };
        if (table === 'prexyon_user_product_roles') return { data: { role_id: 'role-artecheck' }, error: null };
        return { data: null, error: null };
      },
      single: async () => {
        if (table === 'organization_members') {
          if (failure === 'membership') return { data: null, error: { message: 'not found' } };
          return { data: { organization_id: 'org-restored', role: 'member', is_active: true }, error: null };
        }
        if (table === 'organizations') {
          if (failure === 'organization') return { data: null, error: { message: 'auxiliary query failed' } };
          return { data: { id: 'org-restored', is_active: true }, error: null };
        }
        if (table === 'organization_member_product_access') {
          if (failure === 'product_access') return { data: null, error: { message: 'unavailable' } };
          return { data: { product_key: 'artecheck', is_enabled: true }, error: null };
        }
        return { data: null, error: null };
      },
      then: (resolve: (value: any) => unknown) => {
        if (failure === 'permissions' && table === 'prexyon_permission_definitions') {
          return Promise.resolve({ data: null, error: { message: 'unavailable' } }).then(resolve);
        }
        const data = table === 'prexyon_permission_definitions'
          ? [{ id: 'perm-create', permission_key: 'artecheck.analysis.create' }]
          : table === 'prexyon_role_permissions'
            ? [{ permission_definition_id: 'perm-create', effect: 'allow' }]
            : [];
        return Promise.resolve({ data, error: null }).then(resolve);
      },
    };
    return builder;
  };

  return {
    auth: {
      getSession: async () => ({
        data: { session: { access_token: 'token', user: { id: 'user-restored', email: 'user@example.com', user_metadata: {} } } },
        error: null,
      }),
    },
    from: (table: string) => chain(table),
    rpc: async () => failure === 'entitlement'
      ? { data: null, error: { message: 'unavailable' } }
      : { data: { effective_products: ['artecheck'] }, error: null },
  };
}

beforeEach(() => {
  clearArteCheckSessionPermissions();
  resetAuthInitFlight();
});

test('reload normal restaura tenant, namespace e autorização', async () => {
  assert.equal(await initializeAuthSession(clientFor(), ''), 'authenticated');
  assert.equal(getArteCheckSessionPermissions()?.organizationId, 'org-restored');
  assert.equal(getArteCheckSessionPermissions()?.bootstrapped, true);
  assert.equal(new LocalStorageProvider().getAnalysesKey(), 'artecheck_analyses_history:org-restored:user-restored');
  assert.equal(hasPermission('artecheck.analysis.create'), true);
});

test('falha de organizations preserva tenant e mantém autorização fechada', async () => {
  assert.equal(await initializeAuthSession(clientFor('organization'), ''), 'error');
  assert.equal(getArteCheckSessionPermissions()?.organizationId, 'org-restored');
  assert.equal(new LocalStorageProvider().getTenantNamespace().orgId, 'org-restored');
  assert.equal(hasPermission('artecheck.analysis.create'), false);
});

for (const failure of ['entitlement', 'product_access', 'permissions'] as const) {
  test(`falha de ${failure} preserva tenant sem inventar permissões`, async () => {
    assert.equal(await initializeAuthSession(clientFor(failure), ''), 'error');
    const context = getArteCheckSessionPermissions();
    assert.equal(context?.organizationId, 'org-restored');
    assert.equal(context?.bootstrapped, false);
    assert.deepEqual(context?.resolved, {});
    assert.equal(hasPermission('artecheck.analysis.create'), false);
  });
}

test('sem membership não inventa tenant e nega acesso', async () => {
  assert.equal(await initializeAuthSession(clientFor('membership'), ''), 'error');
  assert.equal(getArteCheckSessionPermissions(), null);
  assert.equal(hasPermission('artecheck.analysis.create'), false);
});
