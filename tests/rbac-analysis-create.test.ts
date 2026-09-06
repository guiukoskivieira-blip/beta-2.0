// tests/rbac-analysis-create.test.ts
// Comprehensive RBAC & Auth Initialization Integration Tests
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  setArteCheckSessionPermissions,
  clearArteCheckSessionPermissions,
  hasPermission,
  getArteCheckSessionPermissions,
  subscribeArteCheckPermissions,
} from '../src/auth/arteCheckPermissions';
import { resolveArteCheckPermissions } from '../src/services/resolveArteCheckPermissions';
import { initializeAuthSession } from '../src/auth/initAuthSession';

// ---------------------------------------------------------------------------
// 1. In-Memory Store & hasPermission (Unit Tests)
// ---------------------------------------------------------------------------
describe('1. arteCheckPermissions — In-Memory Store & Reactivity', () => {
  beforeEach(() => {
    clearArteCheckSessionPermissions();
  });

  it('A) store inicialmente null: fail-closed, canCreate FALSE, nunca TRUE por fallback', () => {
    assert.equal(getArteCheckSessionPermissions(), null, 'store deve iniciar null');
    assert.equal(hasPermission('artecheck.analysis.create'), false, 'ausência de store resulta estritamente false');
    assert.equal(hasPermission('artecheck.analysis.view'), false, 'todas as permissões são false');
  });

  it('B) MEMBER com apenas view=allow e create ausente: canCreate FALSE', () => {
    setArteCheckSessionPermissions({
      resolved: {
        'artecheck.analysis.view': 'allow',
      },
      isOwner: false,
      bootstrapped: true,
    });

    assert.equal(hasPermission('artecheck.analysis.view'), true, 'view deve ser permitida');
    assert.equal(hasPermission('artecheck.analysis.create'), false, 'create ausente deve ser estritamente bloqueada');
    assert.equal(hasPermission('artecheck.analysis.override_warnings'), false, 'override_warnings bloqueada');
    assert.equal(hasPermission('artecheck.reports.download'), false, 'reports.download bloqueada');
  });

  it('C) Usuário com create=allow explícito: canCreate TRUE', () => {
    setArteCheckSessionPermissions({
      resolved: {
        'artecheck.analysis.view': 'allow',
        'artecheck.analysis.create': 'allow',
      },
      isOwner: false,
      bootstrapped: true,
    });

    assert.equal(hasPermission('artecheck.analysis.create'), true, 'create=allow permite criação');
    assert.equal(hasPermission('artecheck.analysis.view'), true, 'view=allow permite visualização');
  });

  it('D) OWNER válido: canCreate TRUE via bypass arquitetural', () => {
    setArteCheckSessionPermissions({
      resolved: {
        'artecheck.analysis.view': 'allow',
      },
      isOwner: true,
      bootstrapped: true,
    });

    assert.equal(hasPermission('artecheck.analysis.create'), true, 'owner bypass permite create sem grant explícito');
    assert.equal(hasPermission('artecheck.analysis.view'), true, 'owner bypass permite view');
  });

  it('D) OWNER com deny explícito: deny vence sobre bypass', () => {
    setArteCheckSessionPermissions({
      resolved: {
        'artecheck.analysis.create': 'deny',
      },
      isOwner: true,
      bootstrapped: true,
    });

    assert.equal(hasPermission('artecheck.analysis.create'), false, 'deny explícito bloqueia mesmo para owner');
  });

  it('I) signOut / clearArteCheckSessionPermissions: limpa store e notifica subscribers', () => {
    let notifiedPerms: any = undefined;
    const unsub = subscribeArteCheckPermissions((p) => {
      notifiedPerms = p;
    });

    setArteCheckSessionPermissions({
      resolved: { 'artecheck.analysis.create': 'allow' },
      isOwner: false,
      bootstrapped: true,
    });
    assert.equal(hasPermission('artecheck.analysis.create'), true);
    assert.notEqual(notifiedPerms, null);

    clearArteCheckSessionPermissions();
    assert.equal(hasPermission('artecheck.analysis.create'), false, 'após signOut deve ser false');
    assert.equal(getArteCheckSessionPermissions(), null, 'store deve ser null');
    assert.equal(notifiedPerms, null, 'subscribers devem ser notificados com null');

    unsub();
  });
});

// ---------------------------------------------------------------------------
// 2. Integration: initializeAuthSession & Auth Lifecycle Wiring
// ---------------------------------------------------------------------------
describe('2. initializeAuthSession — Ciclo Real de Inicialização & Fail-Closed', () => {
  beforeEach(() => {
    clearArteCheckSessionPermissions();
  });

  function makeMockSupabaseClient(opts: {
    hasSession?: boolean;
    sessionUser?: { id: string; email?: string } | null;
    memberRole?: string;
    isMemberActive?: boolean;
    isOrgActive?: boolean;
    effectiveProducts?: string[];
    productAccessEnabled?: boolean;
    permDefs?: Array<{ id: string; permission_key: string }>;
    userRole?: { role_id: string } | null;
    rolePerms?: Array<{ permission_definition_id: string }>;
    overrides?: Array<{ permission_definition_id: string; effect: string }>;
    exchangeFail?: boolean;
    bootstrapFail?: boolean;
  }) {
    const {
      hasSession = true,
      sessionUser = { id: 'user-member-1', email: 'member@empresa.com' },
      memberRole = 'member',
      isMemberActive = true,
      isOrgActive = true,
      effectiveProducts = ['artecheck'],
      productAccessEnabled = true,
      permDefs = [
        { id: 'def-view', permission_key: 'artecheck.analysis.view' },
        { id: 'def-create', permission_key: 'artecheck.analysis.create' },
      ],
      userRole = null,
      rolePerms = [],
      overrides = [{ permission_definition_id: 'def-view', effect: 'allow' }],
      exchangeFail = false,
      bootstrapFail = false,
    } = opts;

    let signedOut = false;

    return {
      get signedOut() {
        return signedOut;
      },
      functions: {
        invoke: async (_fn: string, _opts: any) => {
          if (exchangeFail) return { data: null, error: new Error('Exchange failed') };
          return { data: { token_hash: 'hash-abc', verification_type: 'email' }, error: null };
        },
      },
      auth: {
        verifyOtp: async () => {
          if (exchangeFail) return { data: null, error: new Error('OTP failed') };
          return {
            data: { session: { access_token: 'valid-token', user: sessionUser } },
            error: null,
          };
        },
        getSession: async () => {
          if (!hasSession) return { data: { session: null }, error: null };
          return {
            data: { session: { access_token: 'valid-token', user: sessionUser } },
            error: null,
          };
        },
        getUser: async () => ({ data: { user: sessionUser }, error: null }),
        signOut: async () => {
          signedOut = true;
          return { error: null };
        },
      },
      rpc: async (fn: string, _args: any) => {
        if (fn === 'prexyon_get_organization_entitlements') {
          if (bootstrapFail) return { data: null, error: new Error('RPC error') };
          return { data: { effective_products: effectiveProducts }, error: null };
        }
        return { data: null, error: null };
      },
      from: (table: string) => {
        const createBuilder = () => {
          const builder: any = {
            select: () => builder,
            eq: () => builder,
            in: () => builder,
            maybeSingle: async () => {
              if (table === 'organization_members') {
                if (bootstrapFail) return { data: null, error: new Error('DB error') };
                return { data: { organization_id: 'org-1', role: memberRole, is_active: isMemberActive }, error: null };
              }
              if (table === 'prexyon_user_product_roles') {
                return { data: userRole, error: null };
              }
              return { data: null, error: null };
            },
            single: async () => {
              if (table === 'organization_members') {
                if (bootstrapFail) return { data: null, error: new Error('DB error') };
                return { data: { organization_id: 'org-1', role: memberRole, is_active: isMemberActive }, error: null };
              }
              if (table === 'organizations') {
                return { data: { id: 'org-1', is_active: isOrgActive }, error: null };
              }
              if (table === 'organization_member_product_access') {
                return { data: { product_key: 'artecheck', is_enabled: productAccessEnabled }, error: null };
              }
              return { data: null, error: null };
            },
            then: (onfulfilled: any, onrejected: any) => {
              let resultData: any = null;
              if (table === 'prexyon_permission_definitions') resultData = permDefs;
              else if (table === 'prexyon_role_permissions') resultData = rolePerms;
              else if (table === 'prexyon_user_permission_overrides') resultData = overrides;
              return Promise.resolve({ data: resultData, error: null }).then(onfulfilled, onrejected);
            },
          };
          return builder;
        };
        return createBuilder();
      },
    } as any;
  }

  it('E) Bootstrap pendente / client null: canCreate estritamente FALSE', async () => {
    const status = await initializeAuthSession(null);
    assert.equal(status, 'unauthenticated');
    assert.equal(hasPermission('artecheck.analysis.create'), false, 'sem bootstrap, canCreate é FALSE');
  });

  it('F) Bootstrap falha: status error, store limpa e canCreate estritamente FALSE', async () => {
    const client = makeMockSupabaseClient({ bootstrapFail: true });
    const status = await initializeAuthSession(client);
    assert.equal(status, 'error');
    assert.equal(hasPermission('artecheck.analysis.create'), false, 'em falha de bootstrap, canCreate é FALSE');
  });

  it('G) /auth/prexyon?code=...: callback executa e popula permissões antes de liberar autorização', async () => {
    const client = makeMockSupabaseClient({
      memberRole: 'member',
      overrides: [{ permission_definition_id: 'def-view', effect: 'allow' }],
    });

    const status = await initializeAuthSession(client, '?code=valid-sso-code');
    assert.equal(status, 'authenticated');

    const perms = getArteCheckSessionPermissions();
    assert.notEqual(perms, null, 'store deve estar populada após callback');
    assert.equal(perms?.bootstrapped, true);
    assert.equal(perms?.isOwner, false);
    assert.equal(hasPermission('artecheck.analysis.view'), true, 'MEMBER tem view=allow');
    assert.equal(hasPermission('artecheck.analysis.create'), false, 'MEMBER NÃO tem create');
  });

  it('H) Reload com sessão Supabase existente: bootstrap re-executado e permissões restauradas em memória', async () => {
    const client = makeMockSupabaseClient({
      hasSession: true,
      memberRole: 'member',
      overrides: [{ permission_definition_id: 'def-view', effect: 'allow' }],
    });

    // Simulando reload (sem query params no search)
    const status = await initializeAuthSession(client, '');
    assert.equal(status, 'authenticated');

    const perms = getArteCheckSessionPermissions();
    assert.notEqual(perms, null);
    assert.equal(hasPermission('artecheck.analysis.view'), true);
    assert.equal(hasPermission('artecheck.analysis.create'), false, 'após reload, MEMBER continua sem create');
  });

  it('B) MEMBER no ciclo completo: canCreate é FALSE', async () => {
    const client = makeMockSupabaseClient({
      hasSession: true,
      memberRole: 'member',
      overrides: [{ permission_definition_id: 'def-view', effect: 'allow' }],
    });

    await initializeAuthSession(client, '');
    assert.equal(hasPermission('artecheck.analysis.create'), false);
  });

  it('C) Usuário com create=allow no ciclo completo: canCreate é TRUE', async () => {
    const client = makeMockSupabaseClient({
      hasSession: true,
      memberRole: 'member',
      overrides: [
        { permission_definition_id: 'def-view', effect: 'allow' },
        { permission_definition_id: 'def-create', effect: 'allow' },
      ],
    });

    await initializeAuthSession(client, '');
    assert.equal(hasPermission('artecheck.analysis.create'), true);
  });

  it('D) OWNER no ciclo completo: canCreate é TRUE via bypass', async () => {
    const client = makeMockSupabaseClient({
      hasSession: true,
      memberRole: 'owner',
      overrides: [],
    });

    await initializeAuthSession(client, '');
    assert.equal(hasPermission('artecheck.analysis.create'), true);
  });
});
