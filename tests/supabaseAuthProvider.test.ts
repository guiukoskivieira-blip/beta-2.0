import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SupabaseAuthProvider } from '../src/auth/SupabaseAuthProvider';
import { LocalDevAuthProvider } from '../src/auth/LocalDevAuthProvider';
import { IncompleteConfigAuthProvider } from '../src/auth/IncompleteConfigAuthProvider';
import { createAuthProvider, auth } from '../src/auth/index';

describe('ArteCheck Auth Provider & Factory Tests', () => {
  it('1. LocalDevAuthProvider provides default local developer user', async () => {
    const local = new LocalDevAuthProvider();
    const user = await local.getCurrentUser();
    assert.ok(user);
    assert.equal(user.email, 'dev@artecheck.local');
    assert.equal(user.role, 'developer');

    const session = await local.getSession();
    assert.ok(session);
    assert.equal(session.accessToken, 'local_dev_token');
  });

  it('2. LocalDevAuthProvider signs in and signs up in memory', async () => {
    const local = new LocalDevAuthProvider();
    const up = await local.signUp('user@grafica.com', '123456', 'Operador Alfa', 'Grafica Alfa');
    assert.ok(up.user);
    assert.equal(up.user.email, 'user@grafica.com');
    assert.equal(up.user.displayName, 'Operador Alfa');
    assert.equal(up.user.companyName, 'Grafica Alfa');

    const inSess = await local.signIn('outro@grafica.com', '123456');
    assert.ok(inSess.user);
    assert.equal(inSess.user.email, 'outro@grafica.com');
  });

  it('3. SupabaseAuthProvider properly maps Supabase User and Session metadata', () => {
    const provider = new SupabaseAuthProvider();
    const formatUser = (provider as any).formatUser.bind(provider);
    const formatSession = (provider as any).formatSession.bind(provider);

    const mockSupabaseUser = {
      id: 'usr-12345',
      email: 'operador@grafica-real.com.br',
      user_metadata: {
        display_name: 'Carlos Impressor',
        company_name: 'Gráfica Express Ltda',
      },
      app_metadata: {
        role: 'authenticated',
      },
    };

    const formatted = formatUser(mockSupabaseUser);
    assert.ok(formatted);
    assert.equal(formatted.id, 'usr-12345');
    assert.equal(formatted.email, 'operador@grafica-real.com.br');
    assert.equal(formatted.displayName, 'Carlos Impressor');
    assert.equal(formatted.companyName, 'Gráfica Express Ltda');
    assert.equal(formatted.role, 'authenticated');

    const mockSession = {
      access_token: 'jwt-supabase-token-abc',
      user: mockSupabaseUser,
    };

    const formattedSession = formatSession(mockSession);
    assert.ok(formattedSession.user);
    assert.equal(formattedSession.accessToken, 'jwt-supabase-token-abc');
  });

  it('4. SupabaseAuthProvider requires password on signUp and signIn', async () => {
    const mockClient: any = {
      auth: {},
    };
    const provider = new SupabaseAuthProvider(mockClient);

    await assert.rejects(
      async () => {
        await provider.signIn('test@test.com', '');
      },
      /Senha é obrigatória para autenticação/
    );

    await assert.rejects(
      async () => {
        await provider.signUp('test@test.com', '', 'Name');
      },
      /Senha é obrigatória para cadastro/
    );
  });

  it('5. SupabaseAuthProvider passes user metadata and handles emailRedirectTo in non-window env and propagates errors', async () => {
    let signUpCalledWith: any = null;
    const mockClient: any = {
      auth: {
        signUp: async (params: any) => {
          signUpCalledWith = params;
          if (params.email === 'error@test.com') {
            return { data: {}, error: new Error('User already registered') };
          }
          return {
            data: {
              user: {
                id: 'supabase-user-uuid',
                email: params.email,
                user_metadata: params.options?.data,
              },
              session: {
                access_token: 'valid-jwt-token',
                user: {
                  id: 'supabase-user-uuid',
                  email: params.email,
                  user_metadata: params.options?.data,
                },
              },
            },
            error: null,
          };
        },
      },
    };

    const provider = new SupabaseAuthProvider(mockClient);

    const res = await provider.signUp('novo@grafica.com', 'secret123', 'João Pré-Press', 'Arte Print');
    assert.ok(signUpCalledWith);
    assert.equal(signUpCalledWith.email, 'novo@grafica.com');
    assert.equal(signUpCalledWith.password, 'secret123');
    assert.equal(signUpCalledWith.options.data.display_name, 'João Pré-Press');
    assert.equal(signUpCalledWith.options.data.company_name, 'Arte Print');
    assert.equal(signUpCalledWith.options.emailRedirectTo, undefined); // In Node environment without window
    assert.equal(res.user?.displayName, 'João Pré-Press');
    assert.equal(res.accessToken, 'valid-jwt-token');

    // Teste de propagação de erro do Supabase (NÃO cai em mock local silenciosamente)
    await assert.rejects(
      async () => {
        await provider.signUp('error@test.com', 'secret123');
      },
      /User already registered/
    );
  });

  it('5b. SupabaseAuthProvider sends window.location.origin as emailRedirectTo in browser environment', async () => {
    let signUpCalledWith: any = null;
    const mockClient: any = {
      auth: {
        signUp: async (params: any) => {
          signUpCalledWith = params;
          return {
            data: {
              user: {
                id: 'browser-user-uuid',
                email: params.email,
                user_metadata: params.options?.data,
              },
              session: null,
            },
            error: null,
          };
        },
      },
    };

    // Simula ambiente de browser com window.location.origin
    const originalWindow = (globalThis as any).window;
    (globalThis as any).window = {
      location: {
        origin: 'https://ais-dev-7xenthspykzlanofjyqnhw-188016399707.us-east1.run.app',
      },
    };

    try {
      const provider = new SupabaseAuthProvider(mockClient);
      const res = await provider.signUp('browser@grafica.com', 'secret123', 'Browser User', 'Grafica Web');
      assert.ok(signUpCalledWith);
      assert.equal(signUpCalledWith.options.emailRedirectTo, 'https://ais-dev-7xenthspykzlanofjyqnhw-188016399707.us-east1.run.app');
      assert.equal(signUpCalledWith.options.data.displayName, 'Browser User');
      assert.equal(signUpCalledWith.options.data.companyName, 'Grafica Web');
      assert.ok(res.user);
      assert.equal(res.user.email, 'browser@grafica.com');
    } finally {
      (globalThis as any).window = originalWindow;
    }
  });

  it('6. SupabaseAuthProvider signIn fails on wrong password or user not found (no mock fallback)', async () => {
    let signInCalledWith: any = null;

    const mockClient: any = {
      auth: {
        signInWithPassword: async (params: any) => {
          signInCalledWith = params;
          if (params.password === 'wrong_password') {
            return { data: {}, error: new Error('Invalid login credentials') };
          }
          if (params.email === 'inexistente@grafica.com') {
            return { data: {}, error: new Error('User not found') };
          }
          return {
            data: {
              session: {
                access_token: 'auth-session-token',
                user: {
                  id: 'uid-999',
                  email: params.email,
                  user_metadata: { display_name: 'Operador Logado' },
                },
              },
            },
            error: null,
          };
        },
        signOut: async () => {
          return { error: null };
        },
      },
    };

    const provider = new SupabaseAuthProvider(mockClient);

    // Tentativa com senha incorreta
    await assert.rejects(
      async () => {
        await provider.signIn('login@grafica.com', 'wrong_password');
      },
      /Invalid login credentials/
    );

    // Tentativa com usuário inexistente
    await assert.rejects(
      async () => {
        await provider.signIn('inexistente@grafica.com', 'any_pass');
      },
      /User not found/
    );

    // Login com sucesso
    const res = await provider.signIn('login@grafica.com', 'correct_password');
    assert.ok(signInCalledWith);
    assert.equal(res.accessToken, 'auth-session-token');
  });

  it('7. Factory: env Supabase válida => seleciona SupabaseAuthProvider', () => {
    const mockResolver = () => ({
      url: 'https://qaluqgjfvtlskuchwmih.supabase.co',
      anonKey: 'valid_key_123',
      hasPartialConfig: false,
      isConfigured: true,
    });

    const selected = createAuthProvider(mockResolver);
    assert.ok(selected instanceof SupabaseAuthProvider);
  });

  it('8. Factory: env ausente => seleciona LocalDevAuthProvider', () => {
    const mockResolver = () => ({
      url: '',
      anonKey: '',
      hasPartialConfig: false,
      isConfigured: false,
    });

    const selected = createAuthProvider(mockResolver);
    assert.ok(selected instanceof LocalDevAuthProvider);
  });

  it('9. Factory: env incompleta => seleciona IncompleteConfigAuthProvider e recusa mock silencioso', async () => {
    const mockResolver = () => ({
      url: 'https://qaluqgjfvtlskuchwmih.supabase.co',
      anonKey: '',
      hasPartialConfig: true,
      isConfigured: false,
    });

    const selected = createAuthProvider(mockResolver);
    assert.ok(selected instanceof IncompleteConfigAuthProvider);
    assert.equal(selected instanceof LocalDevAuthProvider, false);

    // Deve falhar explicitamente se o usuário tentar autenticar
    await assert.rejects(
      async () => {
        await selected.signIn('qualquer@email.com', '123456');
      },
      /Configuração do Supabase incompleta/
    );
  });

  it('10. Singleton instance exported by src/auth/index is valid AuthProvider', () => {
    assert.ok(auth);
    assert.equal(typeof auth.signIn, 'function');
    assert.equal(typeof auth.signUp, 'function');
    assert.equal(typeof auth.signOut, 'function');
    assert.equal(typeof auth.getSession, 'function');
    assert.equal(typeof auth.getCurrentUser, 'function');
  });
});
