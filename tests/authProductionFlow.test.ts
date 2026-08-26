import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createAuthProvider } from '../src/auth/index.ts';
import { SupabaseAuthProvider } from '../src/auth/SupabaseAuthProvider.ts';
import { IncompleteConfigAuthProvider } from '../src/auth/IncompleteConfigAuthProvider.ts';
import { LocalDevAuthProvider } from '../src/auth/LocalDevAuthProvider.ts';

describe('ARTECHECK AI — Production Authentication & Session Flow Tests', () => {
  test('1. Carregamento inicial / Fallback local NÃO é utilizado em produção sem configuração', () => {
    const originalNodeEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';

      const mockResolver = () => ({
        url: '',
        anonKey: '',
        hasPartialConfig: false,
        isConfigured: false,
      });

      const provider = createAuthProvider(mockResolver);
      // Em produção sem env, NUNCA deve instanciar LocalDevAuthProvider com mock de usuário logado
      assert.ok(provider instanceof IncompleteConfigAuthProvider, 'Deveria ser IncompleteConfigAuthProvider');
      assert.ok(!(provider instanceof LocalDevAuthProvider), 'NÃO deve ser LocalDevAuthProvider');
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });

  test('2. Em ambiente de desenvolvimento local sem Supabase, instancia LocalDevAuthProvider', () => {
    const originalNodeEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'development';
      const mockResolver = () => ({
        url: '',
        anonKey: '',
        hasPartialConfig: false,
        isConfigured: false,
      });

      const provider = createAuthProvider(mockResolver);
      assert.ok(provider instanceof LocalDevAuthProvider, 'Deveria ser LocalDevAuthProvider');
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });

  test('3. Com Supabase configurado em produção, instancia SupabaseAuthProvider', () => {
    const originalNodeEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';
      const mockResolver = () => ({
        url: 'https://xyzcompany.supabase.co',
        anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy_anon_key',
        hasPartialConfig: false,
        isConfigured: true,
      });

      const provider = createAuthProvider(mockResolver);
      assert.ok(provider instanceof SupabaseAuthProvider, 'Deveria ser SupabaseAuthProvider');
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });

  test('4. Usuário Anônimo: getCurrentUser e getSession retornam null quando não há sessão no Supabase', async () => {
    const mockClient = {
      auth: {
        getUser: async () => ({ data: { user: null }, error: null }),
        getSession: async () => ({ data: { session: null }, error: null }),
      },
    };

    const provider = new SupabaseAuthProvider(mockClient as any);
    const user = await provider.getCurrentUser();
    const session = await provider.getSession();

    assert.equal(user, null);
    assert.equal(session, null);
  });

  test('5. Sessão Válida: propaga token de acesso e dados do usuário real sem hardcode', async () => {
    const mockUser = {
      id: 'usr_real_12345',
      email: 'gestor@grafica-alfa.com.br',
      user_metadata: {
        display_name: 'Gestor Alfa',
        company_name: 'Gráfica Alfa',
      },
    };

    const mockClient = {
      auth: {
        getUser: async () => ({ data: { user: mockUser }, error: null }),
        getSession: async () => ({
          data: {
            session: {
              access_token: 'jwt_valid_supabase_token_real',
              user: mockUser,
            },
          },
          error: null,
        }),
      },
    };

    const provider = new SupabaseAuthProvider(mockClient as any);
    const user = await provider.getCurrentUser();
    const session = await provider.getSession();

    assert.equal(user?.id, 'usr_real_12345');
    assert.equal(user?.email, 'gestor@grafica-alfa.com.br');
    assert.equal(user?.displayName, 'Gestor Alfa');
    assert.equal(session?.accessToken, 'jwt_valid_supabase_token_real');
  });

  test('6. Sessão Expirada / Token Inválido: getSession retorna null para forçar renovação/login', async () => {
    const mockClient = {
      auth: {
        getUser: async () => ({ data: { user: null }, error: { message: 'JWT expired' } }),
        getSession: async () => ({ data: { session: null }, error: { message: 'JWT expired' } }),
      },
    };

    const provider = new SupabaseAuthProvider(mockClient as any);
    const user = await provider.getCurrentUser();
    const session = await provider.getSession();

    assert.equal(user, null);
    assert.equal(session, null);
  });

  test('7. Logout: chama signOut do Supabase e limpa a sessão ativa', async () => {
    let signOutCalled = false;
    const mockClient = {
      auth: {
        signOut: async () => {
          signOutCalled = true;
          return { error: null };
        },
        getUser: async () => ({ data: { user: null }, error: null }),
        getSession: async () => ({ data: { session: null }, error: null }),
      },
    };

    const provider = new SupabaseAuthProvider(mockClient as any);
    await provider.signOut();
    assert.equal(signOutCalled, true);

    const user = await provider.getCurrentUser();
    assert.equal(user, null);
  });
});
