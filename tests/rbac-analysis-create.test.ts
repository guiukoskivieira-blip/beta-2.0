// tests/rbac-analysis-create.test.ts
// Directed RBAC tests for artecheck.analysis.create permission
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  setArteCheckSessionPermissions,
  clearArteCheckSessionPermissions,
  hasPermission,
  getArteCheckSessionPermissions,
} from '../src/auth/arteCheckPermissions';
import { resolveArteCheckPermissions } from '../src/services/resolveArteCheckPermissions';

// ---------------------------------------------------------------------------
// Unit tests: in-memory permission store
// ---------------------------------------------------------------------------
describe('arteCheckPermissions — in-memory store', () => {
  beforeEach(() => {
    clearArteCheckSessionPermissions();
  });

  it('A) MEMBER view=true create=false: visualização permitida, criação bloqueada', () => {
    setArteCheckSessionPermissions({
      resolved: {
        'artecheck.analysis.view': 'allow',
        // artecheck.analysis.create intentionally absent (no grant)
      },
      isOwner: false,
      bootstrapped: true,
    });

    assert.equal(hasPermission('artecheck.analysis.view'), true, 'view should be allowed');
    assert.equal(hasPermission('artecheck.analysis.create'), false, 'create should be blocked (absent = fail-closed)');
    assert.equal(hasPermission('artecheck.analysis.override_warnings'), false, 'override_warnings absent = blocked');
    assert.equal(hasPermission('artecheck.reports.download'), false, 'reports.download absent = blocked');
  });

  it('A) MEMBER create=false: deny override wins over absence', () => {
    setArteCheckSessionPermissions({
      resolved: {
        'artecheck.analysis.view': 'allow',
        'artecheck.analysis.create': 'deny',
      },
      isOwner: false,
      bootstrapped: true,
    });

    assert.equal(hasPermission('artecheck.analysis.create'), false, 'explicit deny should block create');
  });

  it('B) Usuário com create=true: nova análise permitida', () => {
    setArteCheckSessionPermissions({
      resolved: {
        'artecheck.analysis.view': 'allow',
        'artecheck.analysis.create': 'allow',
      },
      isOwner: false,
      bootstrapped: true,
    });

    assert.equal(hasPermission('artecheck.analysis.create'), true, 'explicit allow should permit create');
    assert.equal(hasPermission('artecheck.analysis.view'), true, 'view should also be allowed');
  });

  it('C) OWNER válido: bypass all permissions unless denied', () => {
    setArteCheckSessionPermissions({
      resolved: {
        'artecheck.analysis.view': 'allow',
        // create NOT explicitly granted, but owner bypass applies
      },
      isOwner: true,
      bootstrapped: true,
    });

    assert.equal(hasPermission('artecheck.analysis.create'), true, 'owner bypass allows create even without explicit grant');
    assert.equal(hasPermission('artecheck.analysis.view'), true, 'owner bypass allows view');
    assert.equal(hasPermission('artecheck.analysis.override_warnings'), true, 'owner bypass allows override_warnings');
    assert.equal(hasPermission('artecheck.reports.download'), true, 'owner bypass allows reports.download');
  });

  it('C) OWNER com deny explícito: deny ainda vence sobre bypass de owner', () => {
    setArteCheckSessionPermissions({
      resolved: {
        'artecheck.analysis.create': 'deny', // explicit deny
      },
      isOwner: true,
      bootstrapped: true,
    });

    assert.equal(hasPermission('artecheck.analysis.create'), false, 'explicit deny wins even for owner');
  });

  it('D) Ausência de bootstrap: fail-closed', () => {
    // No setArteCheckSessionPermissions called
    assert.equal(hasPermission('artecheck.analysis.create'), false, 'no bootstrap = fail-closed');
    assert.equal(hasPermission('artecheck.analysis.view'), false, 'no bootstrap = fail-closed for view too');
    assert.equal(getArteCheckSessionPermissions(), null, 'store should be null before bootstrap');
  });

  it('D) clearArteCheckSessionPermissions: after clear, fail-closed', () => {
    setArteCheckSessionPermissions({
      resolved: { 'artecheck.analysis.create': 'allow' },
      isOwner: false,
      bootstrapped: true,
    });
    assert.equal(hasPermission('artecheck.analysis.create'), true, 'should be allowed before clear');
    clearArteCheckSessionPermissions();
    assert.equal(hasPermission('artecheck.analysis.create'), false, 'should be fail-closed after clear');
  });
});

// ---------------------------------------------------------------------------
// Unit tests: resolveArteCheckPermissions (with mock Supabase client)
// ---------------------------------------------------------------------------
describe('resolveArteCheckPermissions — integration unit', () => {
  beforeEach(() => {
    clearArteCheckSessionPermissions();
  });

  function makeMockClient(opts: {
    permDefs?: Array<{ id: string; permission_key: string }>;
    memberRole?: string;
    userProductRole?: { role_id: string } | null;
    rolePermissions?: Array<{ permission_definition_id: string }>;
    overrides?: Array<{ permission_definition_id: string; effect: string }>;
  }) {
    const {
      permDefs = [],
      memberRole = 'member',
      userProductRole = null,
      rolePermissions = [],
      overrides = [],
    } = opts;

    return {
      from: (table: string) => {
        const createQueryBuilder = () => {
          const builder: any = {
            select: () => builder,
            eq: (_col: string, _val: any) => builder,
            in: (_col: string, _vals: any[]) => builder,
            maybeSingle: () => {
              if (table === 'organization_members') return Promise.resolve({ data: { role: memberRole }, error: null });
              if (table === 'prexyon_user_product_roles') return Promise.resolve({ data: userProductRole, error: null });
              return Promise.resolve({ data: null, error: null });
            },
            single: () => {
              if (table === 'organization_members') return Promise.resolve({ data: { role: memberRole }, error: null });
              return Promise.resolve({ data: null, error: null });
            },
            then: (onfulfilled: any, onrejected: any) => {
              let resultData: any = null;
              if (table === 'prexyon_permission_definitions') resultData = permDefs;
              else if (table === 'prexyon_role_permissions') resultData = rolePermissions;
              else if (table === 'prexyon_user_permission_overrides') resultData = overrides;
              return Promise.resolve({ data: resultData, error: null }).then(onfulfilled, onrejected);
            },
          };
          return builder;
        };

        return createQueryBuilder();
      },
    } as any;
  }

  it('No permission definitions → empty resolved, bootstrapped=true', async () => {
    const client = makeMockClient({ permDefs: [] });
    const result = await resolveArteCheckPermissions(client, 'user-1', 'org-1');
    assert.deepEqual(result.resolved, {});
    assert.equal(result.bootstrapped, true);
    assert.equal(result.isOwner, false);
  });

  it('Member with view override allow → view=allow, create absent', async () => {
    const viewDefId = 'def-view';
    const createDefId = 'def-create';
    const client = makeMockClient({
      permDefs: [
        { id: viewDefId, permission_key: 'artecheck.analysis.view' },
        { id: createDefId, permission_key: 'artecheck.analysis.create' },
      ],
      memberRole: 'member',
      userProductRole: null,
      overrides: [{ permission_definition_id: viewDefId, effect: 'allow' }],
    });
    const result = await resolveArteCheckPermissions(client, 'user-1', 'org-1');
    assert.equal(result.resolved['artecheck.analysis.view'], 'allow');
    assert.equal(result.resolved['artecheck.analysis.create'], undefined);
    assert.equal(result.isOwner, false);
  });

  it('Owner role: isOwner=true', async () => {
    const client = makeMockClient({
      permDefs: [{ id: 'def-view', permission_key: 'artecheck.analysis.view' }],
      memberRole: 'owner',
      overrides: [],
    });
    const result = await resolveArteCheckPermissions(client, 'owner-1', 'org-1');
    assert.equal(result.isOwner, true);
  });

  it('Deny override wins over role grant', async () => {
    const createDefId = 'def-create';
    const roleId = 'role-1';
    const client = makeMockClient({
      permDefs: [{ id: createDefId, permission_key: 'artecheck.analysis.create' }],
      memberRole: 'member',
      userProductRole: { role_id: roleId },
      rolePermissions: [{ permission_definition_id: createDefId }],
      overrides: [{ permission_definition_id: createDefId, effect: 'deny' }],
    });
    const result = await resolveArteCheckPermissions(client, 'user-1', 'org-1');
    assert.equal(result.resolved['artecheck.analysis.create'], 'deny', 'deny override must win over role grant');
  });
});
