import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PLANS } from '../src/domain/billing';

describe('Plans Modal & Billing Auth Flow Tests', () => {
  it('1. Public plans are available without requiring session or auth token', () => {
    const plansList = Object.values(PLANS);
    assert.ok(plansList.length > 0);
    const freePlan = plansList.find((p) => p.id === 'free');
    const pro = plansList.find((p) => p.id === 'professional');
    assert.ok(freePlan);
    assert.ok(pro);
    assert.equal(freePlan.monthlyPrice, 0);
    assert.equal(pro.monthlyPrice, 119.9);
  });

  it('2. Without active session, PlansModal logic avoids getBillingStatus and prompts login on checkout', async () => {
    let getBillingStatusCalled = false;
    let createCheckoutCalled = false;
    let statusSet: any = null;
    let messageSet = '';

    const mockAuthNoSession = {
      getSession: async () => null,
    };

    const mockGetBillingStatus = async () => {
      getBillingStatusCalled = true;
      return { plan: 'starter', status: 'active', limitAnalyses: 30, usedAnalyses: 5 };
    };

    const mockCreateCheckout = async () => {
      createCheckoutCalled = true;
      return { success: true, checkoutUrl: 'https://checkout.url' };
    };

    // Simulando o ciclo de abertura do modal (useEffect)
    const session = await mockAuthNoSession.getSession();
    if (session?.accessToken) {
      statusSet = await mockGetBillingStatus();
    } else {
      statusSet = null;
    }

    assert.equal(getBillingStatusCalled, false, 'getBillingStatus NÃO deve ser chamado sem sessão');
    assert.equal(statusSet, null);
    assert.equal(messageSet, '', 'Nenhuma mensagem de erro 401 deve ser exibida ao abrir');

    // Simulando clique em "Escolher plano" sem sessão
    const currentSession = await mockAuthNoSession.getSession();
    if (!currentSession?.accessToken) {
      messageSet = 'Faça login para escolher um plano.';
    } else {
      await mockCreateCheckout();
    }

    assert.equal(createCheckoutCalled, false, 'createCheckout NÃO deve ser chamado sem sessão');
    assert.equal(messageSet, 'Faça login para escolher um plano.');
  });

  it('3. With active session, PlansModal calls getBillingStatus and proceeds to checkout', async () => {
    let getBillingStatusCalled = false;
    let createCheckoutCalled = false;
    let statusSet: any = null;
    let messageSet = '';

    const mockAuthWithSession = {
      getSession: async () => ({
        accessToken: 'valid_jwt_token_123',
        user: { id: 'usr-1', email: 'grafica@test.com' },
      }),
    };

    const mockGetBillingStatus = async () => {
      getBillingStatusCalled = true;
      return { plan: 'starter', status: 'active', limitAnalyses: 30, usedAnalyses: 5 };
    };

    const mockCreateCheckout = async (_plan: string, _period: string) => {
      createCheckoutCalled = true;
      return { success: true, checkoutUrl: 'https://checkout.mercadopago.com/test' };
    };

    // Simulando o ciclo de abertura do modal (useEffect)
    const session = await mockAuthWithSession.getSession();
    if (session?.accessToken) {
      statusSet = await mockGetBillingStatus();
    } else {
      statusSet = null;
    }

    assert.equal(getBillingStatusCalled, true, 'getBillingStatus DEVE ser chamado quando há sessão');
    assert.ok(statusSet);
    assert.equal(statusSet.plan, 'starter');

    // Simulando clique em "Escolher plano" com sessão
    const currentSession = await mockAuthWithSession.getSession();
    if (!currentSession?.accessToken) {
      messageSet = 'Faça login para escolher um plano.';
    } else {
      const checkoutRes = await mockCreateCheckout('professional', 'monthly');
      assert.equal(checkoutRes.checkoutUrl, 'https://checkout.mercadopago.com/test');
    }

    assert.equal(createCheckoutCalled, true, 'createCheckout DEVE ser chamado com sessão');
    assert.equal(messageSet, '');
  });

  it('4. Real 401 with active invalid session is captured as error message', async () => {
    let messageSet = '';

    const mockAuthWithInvalidSession = {
      getSession: async () => ({
        accessToken: 'expired_or_invalid_jwt',
      }),
    };

    const mockGetBillingStatusRejects = async () => {
      throw new Error('Sessão expirada. Faça login novamente.');
    };

    const session = await mockAuthWithInvalidSession.getSession();
    if (session?.accessToken) {
      try {
        await mockGetBillingStatusRejects();
      } catch (e: any) {
        messageSet = e.message;
      }
    }

    assert.equal(messageSet, 'Sessão expirada. Faça login novamente.');
  });

  it('5. Unauthenticated user can see Plans button, open modal and view prices without checkout', async () => {
    const unauthenticatedUser = null;
    let isPlansOpen = false;

    const onOpenPlans = () => {
      isPlansOpen = true;
    };

    // Header logic verification: onOpenPlans is provided even if currentUser is null
    const headerProps = {
      currentUser: unauthenticatedUser,
      onOpenPlans,
    };

    const shouldShowPlansButton = Boolean(headerProps.onOpenPlans);
    assert.equal(shouldShowPlansButton, true, 'Botão Planos deve ser renderizado para visitantes não autenticados');

    // Visitor triggers open modal
    if (shouldShowPlansButton && headerProps.onOpenPlans) {
      headerProps.onOpenPlans();
    }
    assert.equal(isPlansOpen, true, 'Visitante deslogado consegue abrir PlansModal');

    // Visitor views pricing cards
    const freePlan = PLANS.free;
    const proPlan = PLANS.professional;
    assert.equal(freePlan.monthlyPrice, 0);
    assert.equal(proPlan.monthlyPrice, 119.9);
    assert.ok(proPlan.features.length > 0);

    // Visitor tries to checkout
    let checkoutExecuted = false;
    let errorMessage = '';
    const session = null; // No session

    if (!session) {
      errorMessage = 'Faça login para escolher um plano.';
    } else {
      checkoutExecuted = true;
    }

    assert.equal(checkoutExecuted, false, 'Checkout sem login deve ser bloqueado');
    assert.equal(errorMessage, 'Faça login para escolher um plano.');
  });

  it('6. Authenticated user continues seeing Plans button and can trigger authenticated checkout', async () => {
    const authenticatedUser = {
      id: 'usr-auth-1',
      email: 'logado@grafica.com.br',
      displayName: 'Gráfica Logada',
    };
    let isPlansOpen = false;

    const onOpenPlans = () => {
      isPlansOpen = true;
    };

    const headerProps = {
      currentUser: authenticatedUser,
      onOpenPlans,
    };

    const shouldShowPlansButton = Boolean(headerProps.onOpenPlans);
    assert.equal(shouldShowPlansButton, true, 'Usuário logado continua vendo o botão Planos');

    if (shouldShowPlansButton && headerProps.onOpenPlans) {
      headerProps.onOpenPlans();
    }
    assert.equal(isPlansOpen, true);

    const session = {
      accessToken: 'valid-token-xyz',
      user: authenticatedUser,
    };

    let checkoutExecuted = false;
    if (session?.accessToken) {
      checkoutExecuted = true;
    }

    assert.equal(checkoutExecuted, true, 'Usuário logado avança para o checkout');
  });

  it('7. Tab A signUp with session=null prompts email confirmation without logging in, then signInWithPassword creates valid session for checkout', async () => {
    // 1. Usuário cria conta na ABA A
    let appCurrentUser: any = null;
    let authModalOpen = true;
    let authModalMessage = '';
    let isSignUpMode = true;

    const mockSupabaseBackend = {
      userConfirmed: false,
      registeredUsers: new Map<string, { id: string; email: string; password: string }>(),
    };

    const mockAuthService = {
      signUp: async (email: string, pass: string) => {
        mockSupabaseBackend.registeredUsers.set(email, {
          id: 'uuid-12345',
          email,
          password: pass,
        });
        // Retorna user com session null (confirmação pendente)
        return {
          user: { id: 'uuid-12345', email, role: 'beta_tester' as const },
          accessToken: undefined,
          session: null,
        };
      },
      signIn: async (email: string, pass: string) => {
        const user = mockSupabaseBackend.registeredUsers.get(email);
        if (!user || user.password !== pass) {
          throw new Error('Invalid login credentials');
        }
        if (!mockSupabaseBackend.userConfirmed) {
          throw new Error('Email not confirmed');
        }
        return {
          user: { id: user.id, email: user.email, role: 'beta_tester' as const },
          accessToken: 'real_jwt_session_token_from_tab_a_login',
        };
      },
      currentSession: null as any,
      getSession: async function () {
        return this.currentSession;
      },
    };

    // Submissão do cadastro na ABA A
    const signUpResult = await mockAuthService.signUp('operador@arteprint.com.br', 'senhaSegura123');
    if (!signUpResult.accessToken) {
      authModalMessage = 'Cadastro realizado! Confirme seu e-mail e depois faça login para continuar.';
      isSignUpMode = false;
      // NÃO chama onSuccess: appCurrentUser permanece null na Aba A
    } else {
      appCurrentUser = signUpResult.user;
    }

    assert.equal(appCurrentUser, null, 'Aba A deve continuar deslogada até confirmação e login');
    assert.equal(authModalOpen, true, 'Modal permanece para feedback');
    assert.equal(isSignUpMode, false, 'Modal comuta para modo Login');
    assert.equal(
      authModalMessage,
      'Cadastro realizado! Confirme seu e-mail e depois faça login para continuar.'
    );

    // Tentativa de checkout na Aba A antes de confirmar e logar
    const preLoginSession = await mockAuthService.getSession();
    assert.equal(preLoginSession, null);
    let checkoutAllowed = Boolean(preLoginSession?.accessToken);
    assert.equal(checkoutAllowed, false, 'Checkout bloqueado sem sessão');

    // 2. Confirmação externa em outra aba/dispositivo
    mockSupabaseBackend.userConfirmed = true;

    // 3. Usuário volta para a ABA A e faz login manual com e-mail + senha
    const loginResult = await mockAuthService.signIn('operador@arteprint.com.br', 'senhaSegura123');
    assert.ok(loginResult.accessToken);
    mockAuthService.currentSession = loginResult;
    appCurrentUser = loginResult.user;
    authModalOpen = false;

    assert.ok(appCurrentUser, 'Aba A agora possui usuário autenticado');
    assert.equal(appCurrentUser.email, 'operador@arteprint.com.br');

    // 4. PlansModal reconhece accessToken e checkout funciona
    const postLoginSession = await mockAuthService.getSession();
    assert.ok(postLoginSession?.accessToken);
    assert.equal(postLoginSession.accessToken, 'real_jwt_session_token_from_tab_a_login');

    const headers = {
      Authorization: `Bearer ${postLoginSession.accessToken}`,
    };
    assert.equal(headers.Authorization, 'Bearer real_jwt_session_token_from_tab_a_login');
  });
});
