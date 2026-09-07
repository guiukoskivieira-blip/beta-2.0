// tests/rbac-analysis-create.test.ts
// Comprehensive RBAC & Auth Initialization Concurrency & Integration Tests
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import React, { useSyncExternalStore } from 'react';
import { renderToString } from 'react-dom/server';
import { Sidebar } from '../src/components/Sidebar';
import { DashboardOverview } from '../src/components/DashboardOverview';
import {
  setArteCheckSessionPermissions,
  clearArteCheckSessionPermissions,
  hasPermission,
  getArteCheckSessionPermissions,
  subscribeArteCheckPermissions,
} from '../src/auth/arteCheckPermissions';
import { resolveArteCheckPermissions } from '../src/services/resolveArteCheckPermissions';
import { initializeAuthSession, resetAuthInitFlight } from '../src/auth/initAuthSession';
import { PrexyonSSOProvider } from '../src/auth/PrexyonSSOProvider';

// ---------------------------------------------------------------------------
// 1. In-Memory Store & hasPermission (Unit Tests)
// ---------------------------------------------------------------------------
describe('1. arteCheckPermissions — In-Memory Store & Reactivity', () => {
  beforeEach(() => {
    clearArteCheckSessionPermissions();
    resetAuthInitFlight();
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
  let exchangeCallCount = 0;

  let authStateListener: ((event: string, session: any) => void) | null = null;

  return {
    get signedOut() {
      return signedOut;
    },
    get exchangeCallCount() {
      return exchangeCallCount;
    },
    triggerAuthEvent(event: string, session: any) {
      if (authStateListener) {
        authStateListener(event, session);
      }
    },
    functions: {
      invoke: async (fn: string, _opts: any) => {
        if (fn === 'prexyon-sso-exchange') {
          exchangeCallCount++;
          // Simulate slight network delay to test concurrency
          await new Promise((r) => setTimeout(r, 10));
        }
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
      onAuthStateChange: (callback: any) => {
        authStateListener = callback;
        return {
          data: {
            subscription: {
              unsubscribe: () => {
                authStateListener = null;
              },
            },
          },
        };
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

// ---------------------------------------------------------------------------
// 2. Integration: initializeAuthSession & Auth Lifecycle Wiring
// ---------------------------------------------------------------------------
describe('2. initializeAuthSession — Ciclo Real de Inicialização, Concorrência & Fail-Closed', () => {
  beforeEach(() => {
    clearArteCheckSessionPermissions();
    resetAuthInitFlight();
  });

  it('A) Concorrência / Single-Flight: duas chamadas simultâneas executam exchange UMA vez e preservam sessão', async () => {
    const client = makeMockSupabaseClient({
      memberRole: 'owner',
      overrides: [],
    });

    // Disparar duas chamadas simultâneas (simulando StrictMode / duplo mount)
    const [res1, res2] = await Promise.all([
      initializeAuthSession(client, '?code=single-use-code-123'),
      initializeAuthSession(client, '?code=single-use-code-123'),
    ]);

    assert.equal(res1, 'authenticated');
    assert.equal(res2, 'authenticated');
    assert.equal(client.exchangeCallCount, 1, 'prexyon-sso-exchange deve ser chamado estritamente 1 vez');
    assert.equal(client.signedOut, false, 'signOut NÃO deve ser chamado por execução concorrente');

    const perms = getArteCheckSessionPermissions();
    assert.notEqual(perms, null, 'store deve estar populada');
    assert.equal(perms?.isOwner, true, 'isOwner deve ser true');
    assert.equal(hasPermission('artecheck.analysis.create'), true, 'OWNER tem canCreate=true');
  });

  it('B) OWNER com single-flight: isOwner=true e canCreate=true', async () => {
    const client = makeMockSupabaseClient({
      memberRole: 'owner',
      overrides: [],
    });

    const status = await initializeAuthSession(client, '?code=owner-code');
    assert.equal(status, 'authenticated');
    assert.equal(hasPermission('artecheck.analysis.create'), true);
    assert.equal(hasPermission('artecheck.analysis.view'), true);
  });

  it('C) MEMBER view-only com single-flight: isOwner=false e canCreate=false', async () => {
    const client = makeMockSupabaseClient({
      memberRole: 'member',
      overrides: [{ permission_definition_id: 'def-view', effect: 'allow' }],
    });

    const status = await initializeAuthSession(client, '?code=member-code');
    assert.equal(status, 'authenticated');
    assert.equal(hasPermission('artecheck.analysis.view'), true);
    assert.equal(hasPermission('artecheck.analysis.create'), false);
  });

  it('D) Falha real no exchange: fail-closed, status error e canCreate FALSE', async () => {
    const client = makeMockSupabaseClient({ exchangeFail: true });
    const status = await initializeAuthSession(client, '?code=invalid-code');
    assert.equal(status, 'error');
    assert.equal(hasPermission('artecheck.analysis.create'), false);
    assert.equal(client.signedOut, true, 'falha real de auth dispara signOut fail-closed');
  });

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

  it('G) Reload com sessão Supabase existente: bootstrap re-executado e permissões restauradas em memória', async () => {
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
});

// ---------------------------------------------------------------------------
// 3. Supabase Auth Events & PrexyonSSOProvider Integration
// ---------------------------------------------------------------------------
describe('3. Auth Events Lifecycle & PrexyonSSOProvider Coordination', () => {
  beforeEach(() => {
    clearArteCheckSessionPermissions();
    resetAuthInitFlight();
  });

  it('A) INITIAL_SESSION com session=null durante SSO init pendente: NÃO limpa permissões', async () => {
    const client = makeMockSupabaseClient({
      memberRole: 'owner',
      overrides: [],
    });

    const ssoProvider = new PrexyonSSOProvider(client);
    ssoProvider.onAuthStateChange?.(() => {});

    // Iniciar auth init com code no search (init pendente)
    const initPromise = initializeAuthSession(client, '?code=owner-code');

    // Durante o init in-flight, Supabase dispara INITIAL_SESSION com session=null
    client.triggerAuthEvent('INITIAL_SESSION', null);

    const status = await initPromise;
    assert.equal(status, 'authenticated');

    // Store deve permanecer intacta com isOwner=true e canCreate=true
    const perms = getArteCheckSessionPermissions();
    assert.notEqual(perms, null);
    assert.equal(perms?.isOwner, true);
    assert.equal(hasPermission('artecheck.analysis.create'), true, 'OWNER mantém canCreate=true mesmo com INITIAL_SESSION null');
  });

  it('B) SSO conclui OWNER e evento inicial atrasado: não reverte canCreate para false', async () => {
    const client = makeMockSupabaseClient({
      memberRole: 'owner',
      overrides: [],
    });

    const ssoProvider = new PrexyonSSOProvider(client);
    ssoProvider.onAuthStateChange?.(() => {});

    const status = await initializeAuthSession(client, '?code=owner-code');
    assert.equal(status, 'authenticated');
    assert.equal(hasPermission('artecheck.analysis.create'), true);

    // Evento inicial atrasado após sucesso
    client.triggerAuthEvent('INITIAL_SESSION', null);

    // Store deve continuar preservada pois init foi success
    assert.equal(hasPermission('artecheck.analysis.create'), true);
    assert.equal(hasPermission('artecheck.analysis.view'), true);
  });

  it('C) MEMBER view-only: canCreate=false mesmo com ciclo reativo de permissões', async () => {
    const client = makeMockSupabaseClient({
      memberRole: 'member',
      overrides: [{ permission_definition_id: 'def-view', effect: 'allow' }],
    });

    const status = await initializeAuthSession(client, '?code=member-code');
    assert.equal(status, 'authenticated');

    assert.equal(hasPermission('artecheck.analysis.view'), true);
    assert.equal(hasPermission('artecheck.analysis.create'), false);
  });

  it('D) SIGNED_OUT real: store limpa e canCreate torna-se FALSE imediatamente', async () => {
    const client = makeMockSupabaseClient({
      memberRole: 'owner',
      overrides: [],
    });

    const ssoProvider = new PrexyonSSOProvider(client);
    ssoProvider.onAuthStateChange?.(() => {});

    await initializeAuthSession(client, '?code=owner-code');
    assert.equal(hasPermission('artecheck.analysis.create'), true);

    // Disparar SIGNED_OUT real
    client.triggerAuthEvent('SIGNED_OUT', null);

    assert.equal(getArteCheckSessionPermissions(), null);
    assert.equal(hasPermission('artecheck.analysis.create'), false, 'após SIGNED_OUT, create é false');
  });

  it('D2) signOut() explícito via PrexyonSSOProvider: limpa store e chama supabase signOut', async () => {
    const client = makeMockSupabaseClient({
      memberRole: 'owner',
      overrides: [],
    });

    const ssoProvider = new PrexyonSSOProvider(client);
    await initializeAuthSession(client, '?code=owner-code');
    assert.equal(hasPermission('artecheck.analysis.create'), true);

    await ssoProvider.signOut();

    assert.equal(getArteCheckSessionPermissions(), null);
    assert.equal(hasPermission('artecheck.analysis.create'), false);
    assert.equal(client.signedOut, true);
  });

  it('E) Falha real do callback SSO: fail-closed e store limpa', async () => {
    const client = makeMockSupabaseClient({ exchangeFail: true });
    const ssoProvider = new PrexyonSSOProvider(client);
    ssoProvider.onAuthStateChange?.(() => {});

    const status = await initializeAuthSession(client, '?code=bad-code');
    assert.equal(status, 'error');
    assert.equal(getArteCheckSessionPermissions(), null);
    assert.equal(hasPermission('artecheck.analysis.create'), false);
    assert.equal(client.signedOut, true);
  });

  it('F) Reload com sessão válida: bootstrap executa e autorização é correta', async () => {
    const client = makeMockSupabaseClient({
      hasSession: true,
      memberRole: 'owner',
      overrides: [],
    });

    const status = await initializeAuthSession(client, '');
    assert.equal(status, 'authenticated');
    assert.equal(hasPermission('artecheck.analysis.create'), true);
    assert.equal(hasPermission('artecheck.analysis.view'), true);
  });

  it('G) Dupla inicialização StrictMode: continua single-flight e exchange só uma vez', async () => {
    const client = makeMockSupabaseClient({
      memberRole: 'owner',
      overrides: [],
    });

    const [res1, res2] = await Promise.all([
      initializeAuthSession(client, '?code=strict-code'),
      initializeAuthSession(client, '?code=strict-code'),
    ]);

    assert.equal(res1, 'authenticated');
    assert.equal(res2, 'authenticated');
    assert.equal(client.exchangeCallCount, 1);
    assert.equal(hasPermission('artecheck.analysis.create'), true);
  });
});

// ---------------------------------------------------------------------------
// 4. React DOM Rendering & useSyncExternalStore Integration Tests
// ---------------------------------------------------------------------------
describe('4. React DOM Rendering & useSyncExternalStore Single Source of Truth', () => {
  beforeEach(() => {
    clearArteCheckSessionPermissions();
    resetAuthInitFlight();
  });

  function renderHarness(): string {
    const TestAppHarness: React.FC = () => {
      const permissionState = useSyncExternalStore(
        subscribeArteCheckPermissions,
        getArteCheckSessionPermissions,
        getArteCheckSessionPermissions,
      );
      const canCreate = Boolean(
        permissionState?.bootstrapped && hasPermission('artecheck.analysis.create'),
      );
      const disabledTabs = canCreate ? [] : ['files'];

      return React.createElement(
        'div',
        null,
        React.createElement(Sidebar, { activeTab: 'dashboard', disabledTabs }),
        React.createElement(DashboardOverview, {
          history: [],
          onFileSelected: () => {},
          onOpenHistory: () => {},
          canCreate,
        }),
      );
    };

    return renderToString(React.createElement(TestAppHarness));
  }

  it('A) OWNER + StrictMode double mount: botão Nova análise ENABLED no DOM final', async () => {
    const client = makeMockSupabaseClient({
      memberRole: 'owner',
      overrides: [],
    });

    // Simula Mount 1
    const s1 = await initializeAuthSession(client, '?code=owner-code');
    assert.equal(s1, 'authenticated');

    // Simula StrictMode Remount 2 (sem code na URL, reaproveitando status success)
    const s2 = await initializeAuthSession(client, '');
    assert.equal(s2, 'authenticated');
    assert.equal(client.exchangeCallCount, 1, 'não deve repetir exchange no remount');

    const html = renderHarness();
    assert.match(html, /for="dashboard-upload"/, 'botão Nova análise deve estar ativo com label para upload');
    assert.match(html, /id="dashboard-upload"/, 'input file deve estar presente');
    assert.doesNotMatch(html, /Sem permissão para criar análises/, 'não deve ter título de bloqueio');
    assert.doesNotMatch(html, /Você não tem permissão para criar novas análises/, 'não deve renderizar aviso de restrição');
    assert.doesNotMatch(html, /Sem permissão para esta ação/, 'sidebar não deve ter bloqueio');
  });

  it('B) MEMBER view-only: botão Nova análise DISABLED no DOM final', async () => {
    const client = makeMockSupabaseClient({
      memberRole: 'member',
      overrides: [{ permission_definition_id: 'def-view', effect: 'allow' }],
    });

    const status = await initializeAuthSession(client, '?code=member-code');
    assert.equal(status, 'authenticated');

    const html = renderHarness();
    assert.match(html, /Sem permissão para criar análises/, 'botão do dashboard deve ter título de bloqueio');
    assert.match(html, /Você não tem permissão para criar novas análises/, 'área de upload deve mostrar restrição');
    assert.match(html, /Sem permissão para esta ação/, 'sidebar deve indicar bloqueio');
    assert.doesNotMatch(html, /for="dashboard-upload"/, 'não deve renderizar label ativo');
  });

  it('C) Usuário com create explicit allow: botão ENABLED no DOM final', async () => {
    const client = makeMockSupabaseClient({
      memberRole: 'member',
      overrides: [
        { permission_definition_id: 'def-view', effect: 'allow' },
        { permission_definition_id: 'def-create', effect: 'allow' },
      ],
    });

    const status = await initializeAuthSession(client, '?code=allow-code');
    assert.equal(status, 'authenticated');

    const html = renderHarness();
    assert.match(html, /for="dashboard-upload"/);
    assert.doesNotMatch(html, /Você não tem permissão para criar novas análises/);
  });

  it('D) Fail-Closed / Bootstrap pendente: botão DISABLED no DOM inicial', () => {
    // Sem chamar initializeAuthSession (estado inicial/pendente)
    const html = renderHarness();
    assert.match(html, /Sem permissão para criar análises/);
    assert.match(html, /Sem permissão para esta ação/);
  });

  it('E) Falha de autenticação: botão DISABLED no DOM final', async () => {
    const client = makeMockSupabaseClient({ exchangeFail: true });
    const status = await initializeAuthSession(client, '?code=bad-code');
    assert.equal(status, 'error');

    const html = renderHarness();
    assert.match(html, /Sem permissão para criar análises/);
    assert.match(html, /Você não tem permissão para criar novas análises/);
  });

  it('F) SIGNED_OUT real: store limpa e botão torna-se DISABLED no DOM', async () => {
    const client = makeMockSupabaseClient({ memberRole: 'owner' });
    const ssoProvider = new PrexyonSSOProvider(client);
    ssoProvider.onAuthStateChange?.(() => {});

    await initializeAuthSession(client, '?code=owner-code');

    let html = renderHarness();
    assert.match(html, /for="dashboard-upload"/);

    // Disparar SIGNED_OUT
    client.triggerAuthEvent('SIGNED_OUT', null);

    html = renderHarness();
    assert.match(html, /Sem permissão para criar análises/);
    assert.match(html, /Você não tem permissão para criar novas análises/);
  });

  it('G) Logout: reseta init stage para idle e limpa store', async () => {
    const client = makeMockSupabaseClient({ memberRole: 'owner' });
    const ssoProvider = new PrexyonSSOProvider(client);
    await initializeAuthSession(client, '?code=owner-code');

    assert.equal(hasPermission('artecheck.analysis.create'), true);

    await ssoProvider.signOut();

    assert.equal(hasPermission('artecheck.analysis.create'), false);
    assert.equal(getArteCheckSessionPermissions(), null);

    const html = renderHarness();
    assert.match(html, /Sem permissão para criar análises/);
  });

  it('J) Novo SSO após logout: pode inicializar novamente com sucesso', async () => {
    const client = makeMockSupabaseClient({ memberRole: 'owner' });
    const ssoProvider = new PrexyonSSOProvider(client);

    // 1. Primeiro SSO
    await initializeAuthSession(client, '?code=code-1');
    assert.equal(hasPermission('artecheck.analysis.create'), true);

    // 2. Logout
    await ssoProvider.signOut();
    assert.equal(hasPermission('artecheck.analysis.create'), false);

    // 3. Segundo SSO com novo code
    const s2 = await initializeAuthSession(client, '?code=code-2');
    assert.equal(s2, 'authenticated');
    assert.equal(hasPermission('artecheck.analysis.create'), true);

    const html = renderHarness();
    assert.match(html, /for="dashboard-upload"/);
  });

  it('K) OWNER permanece ENABLED no DOM se a limpeza da URL falhar após o bootstrap', async () => {
    const client = makeMockSupabaseClient({ memberRole: 'owner' });
    const originalWindow = globalThis.window;

    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        location: {
          href: 'https://artecheck.example/auth/prexyon?code=redacted',
          pathname: '/auth/prexyon',
          search: '?code=redacted',
          hash: '',
        },
        history: {
          state: null,
          replaceState: () => {
            throw new Error('History API unavailable');
          },
        },
      },
    });

    try {
      const status = await initializeAuthSession(client);
      assert.equal(status, 'authenticated');
      assert.equal(hasPermission('artecheck.analysis.create'), true);

      const html = renderHarness();
      assert.match(html, /for="dashboard-upload"/);
      assert.doesNotMatch(html, /Você não tem permissão para criar novas análises/);
    } finally {
      Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: originalWindow,
      });
    }
  });

  it('L) callback SSO remove somente os parâmetros de código da URL', async () => {
    const client = makeMockSupabaseClient({ memberRole: 'member' });
    const originalWindow = globalThis.window;
    let replacedUrl = '';

    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        location: {
          href: 'https://artecheck.example/auth/prexyon?code=redacted&source=prexyon#ready',
          pathname: '/auth/prexyon',
          search: '?code=redacted&source=prexyon',
          hash: '#ready',
        },
        history: {
          state: { preserved: true },
          replaceState: (_state: unknown, _title: string, url: string) => {
            replacedUrl = url;
          },
        },
      },
    });

    try {
      const status = await initializeAuthSession(client);
      assert.equal(status, 'authenticated');
      assert.equal(replacedUrl, '/auth/prexyon?source=prexyon#ready');
      assert.doesNotMatch(replacedUrl, /code=/);
    } finally {
      Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: originalWindow,
      });
    }
  });
});

// ---------------------------------------------------------------------------
// 5. Regression: bootstrapUserContext MUST NOT select 'name' from organizations
// ---------------------------------------------------------------------------
describe('5. Regressão — bootstrapUserContext não seleciona coluna name de organizations', () => {
  beforeEach(() => {
    clearArteCheckSessionPermissions();
    resetAuthInitFlight();
  });

  /**
   * Simulates production Supabase where GRANT on organizations does NOT include 'name'.
   * If bootstrapUserContext tries to select 'name', the mock returns a 42501 privilege error.
   * The test asserts that despite this constraint, OWNER bootstrap succeeds with canCreate=true.
   *
   * This is a regression guard against the regression introduced in commit e9d8c2c
   * (feat: align ArteCheck global Prexyon header) which added .select('id, name, is_active')
   * to the organizations query, causing a 42501 error in production for accounts where the
   * 'name' column is not in the GRANT for the authenticated role.
   */
  it('REGRESSÃO: OWNER bootstrap succeeded mesmo quando organizations.name NÃO está no GRANT', async () => {
    // Build a client that simulates production: organizations table raises 42501 when 'name' is selected.
    // The select builder tracks which columns were requested.
    let orgColumnsRequested: string = '';

    const clientWithNameRestriction = {
      functions: {
        invoke: async (fn: string, _opts: any) => {
          if (fn === 'prexyon-sso-exchange') {
            await new Promise((r) => setTimeout(r, 5));
            return { data: { token_hash: 'hash-ok', verification_type: 'email' }, error: null };
          }
          return { data: null, error: null };
        },
      },
      auth: {
        verifyOtp: async () => ({
          data: { session: { access_token: 'tok', user: { id: 'owner-1', email: 'owner@co.com', user_metadata: { company_name: 'Empresa S.A.' } } } },
          error: null,
        }),
        getSession: async () => ({ data: { session: null }, error: null }),
        getUser: async () => ({ data: { user: { id: 'owner-1', email: 'owner@co.com', user_metadata: {} } }, error: null }),
        signOut: async () => ({ error: null }),
        onAuthStateChange: (cb: any) => ({ data: { subscription: { unsubscribe: () => {} } } }),
      },
      rpc: async (fn: string, _args: any) => {
        if (fn === 'prexyon_get_organization_entitlements') {
          return { data: { effective_products: ['artecheck'] }, error: null };
        }
        return { data: null, error: null };
      },
      from: (table: string) => {
        const createBuilder = () => {
          const builder: any = {
            select: (cols: string) => {
              if (table === 'organizations') {
                orgColumnsRequested = cols;
                // Simulate production 42501 error if 'name' is in the column list
                if (cols.includes('name')) {
                  return {
                    ...builder,
                    eq: () => ({
                      ...builder,
                      single: async () => ({
                        data: null,
                        error: { message: 'permission denied for column name', code: '42501' },
                      }),
                    }),
                  };
                }
              }
              return builder;
            },
            eq: () => builder,
            in: () => builder,
            maybeSingle: async () => {
              if (table === 'organization_members') {
                return { data: { organization_id: 'org-owner', role: 'owner', is_active: true }, error: null };
              }
              if (table === 'prexyon_user_product_roles') {
                return { data: null, error: null };
              }
              return { data: null, error: null };
            },
            single: async () => {
              if (table === 'organization_members') {
                return { data: { organization_id: 'org-owner', role: 'owner', is_active: true }, error: null };
              }
              if (table === 'organizations') {
                return { data: { id: 'org-owner', is_active: true }, error: null };
              }
              if (table === 'organization_member_product_access') {
                return { data: { product_key: 'artecheck', is_enabled: true }, error: null };
              }
              return { data: null, error: null };
            },
            then: (onfulfilled: any, onrejected: any) => {
              let resultData: any = null;
              if (table === 'prexyon_permission_definitions') {
                resultData = [
                  { id: 'def-view', permission_key: 'artecheck.analysis.view' },
                  { id: 'def-create', permission_key: 'artecheck.analysis.create' },
                ];
              } else if (table === 'prexyon_role_permissions') {
                resultData = [];
              } else if (table === 'prexyon_user_permission_overrides') {
                resultData = [];
              }
              return Promise.resolve({ data: resultData, error: null }).then(onfulfilled, onrejected);
            },
          };
          return builder;
        };
        return createBuilder();
      },
    } as any;

    const status = await initializeAuthSession(clientWithNameRestriction, '?code=owner-sso-code');

    assert.equal(status, 'authenticated', 'bootstrap deve concluir com sucesso mesmo sem acesso à coluna name');
    assert.equal(hasPermission('artecheck.analysis.create'), true, 'OWNER deve ter canCreate=true');

    const perms = getArteCheckSessionPermissions();
    assert.notEqual(perms, null, 'store deve estar populada');
    assert.equal(perms?.isOwner, true, 'isOwner deve ser true para OWNER');
    assert.equal(perms?.bootstrapped, true, 'bootstrapped deve ser true');

    // Prove that the column 'name' was NOT requested from organizations table
    assert.ok(
      !orgColumnsRequested.includes('name'),
      `bootstrapUserContext NÃO deve selecionar 'name' de organizations. Colunas solicitadas: "${orgColumnsRequested}"`,
    );
  });

  it('REGRESSÃO: OWNER com reload (getSession) — bootstrap concluído sem name column', async () => {
    let orgColumnsRequested = '';

    const clientReload = {
      functions: { invoke: async () => ({ data: null, error: null }) },
      auth: {
        verifyOtp: async () => ({ data: null, error: null }),
        getSession: async () => ({
          data: {
            session: {
              access_token: 'tok',
              user: { id: 'owner-1', email: 'owner@co.com', user_metadata: { company_name: 'Empresa S.A.' } },
            },
          },
          error: null,
        }),
        getUser: async () => ({ data: { user: { id: 'owner-1', email: 'owner@co.com', user_metadata: {} } }, error: null }),
        signOut: async () => ({ error: null }),
        onAuthStateChange: (cb: any) => ({ data: { subscription: { unsubscribe: () => {} } } }),
      },
      rpc: async (fn: string, _args: any) => {
        if (fn === 'prexyon_get_organization_entitlements') {
          return { data: { effective_products: ['artecheck'] }, error: null };
        }
        return { data: null, error: null };
      },
      from: (table: string) => {
        const createBuilder = () => {
          const builder: any = {
            select: (cols: string) => {
              if (table === 'organizations') {
                orgColumnsRequested = cols;
                // Fail if name column is requested (simulates production privilege restriction)
                if (cols.includes('name')) {
                  return {
                    ...builder,
                    eq: () => ({
                      ...builder,
                      single: async () => ({
                        data: null,
                        error: { message: 'permission denied for column name', code: '42501' },
                      }),
                    }),
                  };
                }
              }
              return builder;
            },
            eq: () => builder,
            in: () => builder,
            maybeSingle: async () => {
              if (table === 'organization_members') {
                return { data: { organization_id: 'org-owner', role: 'owner', is_active: true }, error: null };
              }
              if (table === 'prexyon_user_product_roles') return { data: null, error: null };
              return { data: null, error: null };
            },
            single: async () => {
              if (table === 'organization_members') {
                return { data: { organization_id: 'org-owner', role: 'owner', is_active: true }, error: null };
              }
              if (table === 'organizations') {
                return { data: { id: 'org-owner', is_active: true }, error: null };
              }
              if (table === 'organization_member_product_access') {
                return { data: { product_key: 'artecheck', is_enabled: true }, error: null };
              }
              return { data: null, error: null };
            },
            then: (onfulfilled: any, onrejected: any) => {
              let resultData: any = null;
              if (table === 'prexyon_permission_definitions') {
                resultData = [
                  { id: 'def-view', permission_key: 'artecheck.analysis.view' },
                  { id: 'def-create', permission_key: 'artecheck.analysis.create' },
                ];
              } else if (table === 'prexyon_role_permissions') resultData = [];
              else if (table === 'prexyon_user_permission_overrides') resultData = [];
              return Promise.resolve({ data: resultData, error: null }).then(onfulfilled, onrejected);
            },
          };
          return builder;
        };
        return createBuilder();
      },
    } as any;

    // Reload path: no code in URL, falls through to getSession() → bootstrapUserContext
    const status = await initializeAuthSession(clientReload, '');

    assert.equal(status, 'authenticated', 'reload deve autenticar OWNER sem erros');
    assert.equal(hasPermission('artecheck.analysis.create'), true, 'OWNER reload: canCreate=true');
    assert.ok(
      !orgColumnsRequested.includes('name'),
      `bootstrap no reload NÃO deve selecionar 'name'. Colunas: "${orgColumnsRequested}"`,
    );
  });
});
