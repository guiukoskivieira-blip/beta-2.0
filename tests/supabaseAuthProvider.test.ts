import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SupabaseAuthProvider } from '../src/auth/SupabaseAuthProvider';
import { LocalDevAuthProvider } from '../src/auth/LocalDevAuthProvider';

describe('ArteCheck Auth Provider Tests', () => {
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

  it('5. SupabaseAuthProvider passes user metadata to supabase.auth.signUp and propagates errors', async () => {
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

  it('6. SupabaseAuthProvider signIn calls signInWithPassword and signOut calls signOut', async () => {
    let signInCalledWith: any = null;
    let signOutCalled = false;

    const mockClient: any = {
      auth: {
        signInWithPassword: async (params: any) => {
          signInCalledWith = params;
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
          signOutCalled = true;
          return { error: null };
        },
      },
    };

    const provider = new SupabaseAuthProvider(mockClient);
    const res = await provider.signIn('login@grafica.com', 'mypassword');
    assert.ok(signInCalledWith);
    assert.equal(signInCalledWith.email, 'login@grafica.com');
    assert.equal(signInCalledWith.password, 'mypassword');
    assert.equal(res.accessToken, 'auth-session-token');

    await provider.signOut();
    assert.equal(signOutCalled, true);
  });
});
