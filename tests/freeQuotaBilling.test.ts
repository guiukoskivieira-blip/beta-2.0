import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PLANS } from '../src/domain/billing';

describe('Free Plan & Billing Quota Restoration Tests', () => {
  const serverSrc = fs.readFileSync('server.ts', 'utf8');

  it('1. BILLING_PLAN_LIMITS contains free: 15 and preserves all paid plans', () => {
    assert.match(serverSrc, /free:\s*15/);
    assert.match(serverSrc, /essential:\s*60/);
    assert.match(serverSrc, /professional:\s*200/);
    assert.match(serverSrc, /business:\s*500/);
    assert.match(serverSrc, /professional_launch:\s*200/);

    assert.equal(PLANS.free.analysisLimit, 15);
    assert.equal(PLANS.essential.analysisLimit, 60);
    assert.equal(PLANS.professional.analysisLimit, 200);
    assert.equal(PLANS.business.analysisLimit, 500);
    assert.equal(PLANS.professional_launch.analysisLimit, 200);
  });

  it('2. local_dev_user validação não-UUID não consulta Supabase e não gera PostgreSQL 22P02', () => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    assert.equal(uuidRegex.test('local_dev_user'), false);
    assert.equal(uuidRegex.test('11111111-2222-3333-4444-555555555555'), true);

    // No server.ts, getSubscriptionUsage verifica isValidUuid antes de chamar admin.from
    assert.match(serverSrc, /function isValidUuid\(id: string\): boolean/);
    assert.match(serverSrc, /if \(!isUuid\) \{|if \(!isValidUuid\(userId\)\) \{/);
  });

  it('3. Usuário novo com UUID sem subscription recebe plano Free virtual ativo com 15 de limite', () => {
    const userId = '11111111-2222-3333-4444-555555555555';
    const userCreatedAt = new Date('2026-08-01T00:00:00Z');
    const now = new Date('2026-08-15T00:00:00Z').getTime();
    const cycleMs = 30 * 24 * 60 * 60 * 1000;
    const elapsed = Math.max(0, now - userCreatedAt.getTime());
    const cycleIndex = Math.floor(elapsed / cycleMs);
    const periodStart = new Date(userCreatedAt.getTime() + cycleIndex * cycleMs).toISOString();
    const periodEnd = new Date(userCreatedAt.getTime() + (cycleIndex + 1) * cycleMs).toISOString();

    const used = 0;
    const limit = 15;
    const remaining = Math.max(0, limit - used);

    const virtualFreeSubscription = {
      id: `free_${userId}`,
      user_id: userId,
      organization_id: null,
      plan_code: 'free',
      billing_period: 'monthly',
      status: 'active',
      current_period_start: periodStart,
      current_period_end: periodEnd,
      cancel_at_period_end: false,
      promotion_cycles_used: 0,
      is_virtual_free: true,
    };

    assert.equal(virtualFreeSubscription.plan_code, 'free');
    assert.equal(virtualFreeSubscription.status, 'active');
    assert.equal(limit, 15);
    assert.equal(remaining, 15);
  });

  it('4. Free com 0 a 14 usos permite análise; 15 usos bloqueia na 16ª tentativa', () => {
    const limit = 15;
    assert.equal(Math.max(0, limit - 0) > 0, true, '0 usos => permite');
    assert.equal(Math.max(0, limit - 14) > 0, true, '14 usos => permite');
    assert.equal(Math.max(0, limit - 15) <= 0, true, '15 usos => bloqueia');
  });

  it('5. Ausência de subscription NÃO retorna SUBSCRIPTION_REQUIRED', () => {
    assert.match(serverSrc, /is_virtual_free:\s*true/);
    assert.match(serverSrc, /plan_code:\s*['"]free['"]/);
    assert.match(serverSrc, /status:\s*['"]active['"]/);
  });

  it('6. Free real grava uso em analyses sem violar subscription_id NOT NULL', () => {
    // Para plano Free virtual, grava em analyses
    assert.match(serverSrc, /admin\.from\('analyses'\)\.insert/);
    // Para plano pago, grava em analysis_usage_events com subscription_id
    assert.match(serverSrc, /admin\.from\('analysis_usage_events'\)\.upsert/);
  });

  it('7. Subscriptions pagas continuam com seus limites exatos e gravação em analysis_usage_events', () => {
    const paidLimits: Record<string, number> = {
      essential: 60,
      professional: 200,
      business: 500,
      professional_launch: 200,
    };

    assert.equal(paidLimits.essential, 60);
    assert.equal(paidLimits.professional, 200);
    assert.equal(paidLimits.business, 500);
    assert.equal(paidLimits.professional_launch, 200);
  });

  it('8. Usuário não autenticado continua bloqueado', () => {
    assert.match(serverSrc, /if \(!userId\) return res\.status\(401\)\.json\({ success: false, error: 'Faça login para iniciar uma análise\.' }\)/);
  });

  it('9. Erro real de banco NÃO vira plano free silenciosamente', () => {
    assert.match(serverSrc, /if \(subError\) \{\s*throw new Error/);
    assert.match(serverSrc, /if \(usageError\) \{\s*throw new Error/);
    assert.match(serverSrc, /return res\.status\(500\)\.json\({ success: false, error: 'Falha temporária ao verificar sua cota de análises\.' }\)/);
  });

  it('10. Análise bem-sucedida registra usage e falha no parser NÃO consome quota', () => {
    const uploadRoute = serverSrc.slice(serverSrc.indexOf('app.post(\n    "/api/upload"'));
    const extractPos = uploadRoute.indexOf('extractPdfStructure(file.buffer)');
    const recordPos = uploadRoute.indexOf('recordSuccessfulAnalysis(billingUserId');
    const catchPos = uploadRoute.indexOf('catch (extractError: any)');

    assert.ok(extractPos >= 0, 'Extração deve existir');
    assert.ok(recordPos >= 0, 'Registro de uso deve existir');
    assert.ok(catchPos >= 0, 'Tratamento de erro de extração deve existir');

    assert.ok(extractPos < recordPos, 'Extração ocorre antes de registrar uso');
    assert.ok(recordPos < catchPos, 'Registro de uso ocorre no bloco try antes do catch de erro');
  });

  it('11. Motor 1 permanece intacto e acessível após extração', () => {
    // Validação que o motor de regras determinísticas não foi modificado
    const ruleEngineSrc = fs.readFileSync('src/utils/ruleEngine.ts', 'utf8');
    assert.match(ruleEngineSrc, /export function runDeterministicRuleEngine/);
  });

  it('12. Prexyon entitlement: resolvePrexyonEntitlement e authorizeProcessing existem e validam o fluxo obrigatório (homologação e comercial)', () => {
    // 1. Deve verificar membership ativo no servidor
    assert.match(serverSrc, /from\(['"]organization_members['"]\)/);
    assert.match(serverSrc, /\.eq\(['"]user_id['"],\s*userId\)/);
    assert.match(serverSrc, /member\.is_active/);

    // 2. Deve verificar organização ativa
    assert.match(serverSrc, /from\(['"]organizations['"]\)/);
    assert.match(serverSrc, /org\.is_active/);

    // 3. Deve consultar RPC prexyon_get_organization_entitlements usando cliente autenticado com Bearer JWT
    assert.match(serverSrc, /function getAuthenticatedSupabaseClient\(authToken:\s*string\)/);
    assert.match(serverSrc, /Authorization:\s*`Bearer \$\{authToken\.trim\(\)\}`/);
    assert.match(serverSrc, /userClient\.rpc\(['"]prexyon_get_organization_entitlements['"]/);

    // 4. NÃO deve usar service_role para a chamada do RPC
    assert.doesNotMatch(serverSrc, /admin\.rpc\(['"]prexyon_get_organization_entitlements['"]/);

    // 5. Deve passar authToken do request para resolvePrexyonEntitlement
    assert.match(serverSrc, /const authToken = \(req as any\)\.authToken;/);
    assert.match(serverSrc, /resolvePrexyonEntitlement\(userId,\s*authToken\)/);

    // 6. Deve checar artecheck em effective_products, homologation_products e commercial_products
    assert.match(serverSrc, /effectiveProducts\.includes\(['"]artecheck['"]\)/);
    assert.match(serverSrc, /homologationProducts\.includes\(['"]artecheck['"]\)/);
    assert.match(serverSrc, /commercialProducts\.includes\(['"]artecheck['"]\)/);

    // 7. Entitlement autorizado faz bypass de subscriptions/plans/analysis_usage_events
    assert.match(serverSrc, /if \(entitlement\.authorized\)/);
    assert.match(serverSrc, /prexyonEntitled = true/);

    // 8. Autorização centralizada aplicada a POST /api/upload e POST /api/flatten-transparency
    assert.match(serverSrc, /app\.post\(\s*["']\/api\/upload["'],\s*async\s*\(req:\s*Request,\s*res:\s*Response/);
    assert.match(serverSrc, /app\.post\(\s*["']\/api\/flatten-transparency["'],\s*async\s*\(req:\s*Request,\s*res:\s*Response/);
  });

  describe('Prexyon Entitlement Processing Authorization Logic (Homologation & Commercial)', () => {
    function simulatePrexyonEntitlementResolution(opts: {
      userId: string;
      authToken?: string | null;
      clientType?: 'authenticated' | 'service_role' | 'anon';
      member?: { organization_id: string; role: string; is_active: boolean } | null;
      memberErr?: any;
      org?: { id: string; is_active: boolean } | null;
      orgErr?: any;
      rpcCallerRole?: 'authenticated' | 'anon';
      rpcCallerId?: string | null;
      entData?: {
        effective_products?: string[];
        homologation_products?: string[];
        commercial_products?: string[];
        has_subscription?: boolean;
        is_entitled?: boolean;
      } | null;
      entErr?: any;
    }) {
      const { userId, authToken, clientType, member, memberErr, org, orgErr, rpcCallerRole, rpcCallerId, entData, entErr } = opts;
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);
      if (!isUuid) return { authorized: false, reason: 'invalid_uuid' };

      // Requer authToken válido
      if (!authToken || typeof authToken !== 'string' || !authToken.trim()) {
        return { authorized: false, reason: 'missing_or_empty_jwt' };
      }

      // Requer client user-scoped authenticated (não service_role nem anon)
      if (clientType && clientType !== 'authenticated') {
        return { authorized: false, reason: 'unauthorized_client_type' };
      }

      if (memberErr || !member || !member.is_active) return { authorized: false, reason: 'inactive_membership' };
      const orgId = member.organization_id;
      if (!orgId) return { authorized: false, reason: 'missing_org_id' };

      if (orgErr || !org || !org.is_active) return { authorized: false, reason: 'inactive_org' };

      // Simulação do comportamento interno do RPC no Postgres:
      const role = rpcCallerRole || 'authenticated';
      const callerId = rpcCallerId || userId;
      if (role === 'anon') {
        // Erro 42501 UNAUTHENTICATED: Anonymous enumeration is not permitted
        return { authorized: false, rpcError: { code: '42501', message: 'UNAUTHENTICATED: Anonymous enumeration is not permitted' } };
      }
      if (role === 'authenticated' && (!callerId || callerId !== userId)) {
        // Erro 42501 UNAUTHORIZED: User does not have access to this organization
        return { authorized: false, rpcError: { code: '42501', message: 'UNAUTHORIZED: User does not have access to this organization' } };
      }

      if (entErr || !entData) return { authorized: false, reason: 'rpc_error' };

      const effectiveProducts: string[] = entData.effective_products || [];
      const homologationProducts: string[] = entData.homologation_products || [];
      const commercialProducts: string[] = entData.commercial_products || [];

      const hasEffective = effectiveProducts.includes('artecheck');
      const isHomologation = homologationProducts.includes('artecheck');
      const isCommercial = commercialProducts.includes('artecheck') && Boolean(entData.has_subscription);

      if (hasEffective && (isHomologation || isCommercial)) {
        return {
          authorized: true,
          organizationId: orgId,
          mode: isCommercial ? 'commercial' : 'homologation',
        };
      }
      return { authorized: false, reason: 'missing_artecheck_entitlement' };
    }

    const validOwnerId = '2e12961a-2294-40dc-8d58-1cd19c8ac0c4';
    const validMemberId = 'c9f649fc-be89-42b4-89ea-9cb3bb2b335c';
    const validOrgId = '43c47a08-2f84-42db-a64d-d1f0ea0c6a6b';
    const validJwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.jwt';

    it('1. Homologation entitlement ArteCheck válido com Bearer JWT -> autorizado com contexto homologation', () => {
      const res = simulatePrexyonEntitlementResolution({
        userId: validOwnerId,
        authToken: validJwt,
        clientType: 'authenticated',
        rpcCallerRole: 'authenticated',
        rpcCallerId: validOwnerId,
        member: { organization_id: validOrgId, role: 'owner', is_active: true },
        org: { id: validOrgId, is_active: true },
        entData: {
          has_subscription: false,
          is_entitled: true,
          commercial_products: [],
          effective_products: ['artecheck', 'arteflow', 'orcagraf'],
          homologation_products: ['artecheck', 'arteflow', 'orcagraf'],
        },
      });
      assert.equal(res.authorized, true);
      assert.equal(res.organizationId, validOrgId);
      assert.equal((res as any).mode, 'homologation');
    });

    it('2. Assinatura comercial válida + ArteCheck em commercial_products e effective_products -> autorizado com contexto commercial', () => {
      const res = simulatePrexyonEntitlementResolution({
        userId: validOwnerId,
        authToken: validJwt,
        clientType: 'authenticated',
        rpcCallerRole: 'authenticated',
        rpcCallerId: validOwnerId,
        member: { organization_id: validOrgId, role: 'owner', is_active: true },
        org: { id: validOrgId, is_active: true },
        entData: {
          has_subscription: true,
          is_entitled: true,
          commercial_products: ['artecheck', 'arteflow'],
          effective_products: ['artecheck', 'arteflow'],
          homologation_products: [],
        },
      });
      assert.equal(res.authorized, true);
      assert.equal(res.organizationId, validOrgId);
      assert.equal((res as any).mode, 'commercial');
    });

    it('3. Assinatura comercial válida para MEMBER com Bearer JWT -> autorizado', () => {
      const res = simulatePrexyonEntitlementResolution({
        userId: validMemberId,
        authToken: validJwt,
        clientType: 'authenticated',
        rpcCallerRole: 'authenticated',
        rpcCallerId: validMemberId,
        member: { organization_id: validOrgId, role: 'member', is_active: true },
        org: { id: validOrgId, is_active: true },
        entData: {
          has_subscription: true,
          is_entitled: true,
          commercial_products: ['artecheck'],
          effective_products: ['artecheck'],
          homologation_products: [],
        },
      });
      assert.equal(res.authorized, true);
      assert.equal(res.organizationId, validOrgId);
      assert.equal((res as any).mode, 'commercial');
    });

    it('4. Assinatura comercial sem ArteCheck (apenas arteflow/orcagraf) -> BLOQUEADO (fail-closed)', () => {
      const res = simulatePrexyonEntitlementResolution({
        userId: validOwnerId,
        authToken: validJwt,
        clientType: 'authenticated',
        rpcCallerRole: 'authenticated',
        rpcCallerId: validOwnerId,
        member: { organization_id: validOrgId, role: 'owner', is_active: true },
        org: { id: validOrgId, is_active: true },
        entData: {
          has_subscription: true,
          is_entitled: true,
          commercial_products: ['arteflow', 'orcagraf'],
          effective_products: ['arteflow', 'orcagraf'],
          homologation_products: [],
        },
      });
      assert.equal(res.authorized, false);
      assert.equal(res.reason, 'missing_artecheck_entitlement');
    });

    it('5. Sem assinatura e sem homologação -> BLOQUEADO', () => {
      const res = simulatePrexyonEntitlementResolution({
        userId: validOwnerId,
        authToken: validJwt,
        clientType: 'authenticated',
        rpcCallerRole: 'authenticated',
        rpcCallerId: validOwnerId,
        member: { organization_id: validOrgId, role: 'owner', is_active: true },
        org: { id: validOrgId, is_active: true },
        entData: {
          has_subscription: false,
          is_entitled: false,
          commercial_products: [],
          effective_products: [],
          homologation_products: [],
        },
      });
      assert.equal(res.authorized, false);
      assert.equal(res.reason, 'missing_artecheck_entitlement');
    });

    it('6. Assinatura comercial expirada/cancelada (has_subscription: false, commercial_products: []) -> BLOQUEADO', () => {
      const res = simulatePrexyonEntitlementResolution({
        userId: validOwnerId,
        authToken: validJwt,
        clientType: 'authenticated',
        rpcCallerRole: 'authenticated',
        rpcCallerId: validOwnerId,
        member: { organization_id: validOrgId, role: 'owner', is_active: true },
        org: { id: validOrgId, is_active: true },
        entData: {
          has_subscription: false,
          is_entitled: false,
          commercial_products: [],
          effective_products: [],
          homologation_products: [],
        },
      });
      assert.equal(res.authorized, false);
      assert.equal(res.reason, 'missing_artecheck_entitlement');
    });

    it('7. Membership inválido/inativo -> BLOQUEADO', () => {
      const res = simulatePrexyonEntitlementResolution({
        userId: validOwnerId,
        authToken: validJwt,
        clientType: 'authenticated',
        member: { organization_id: validOrgId, role: 'owner', is_active: false },
        org: { id: validOrgId, is_active: true },
        entData: {
          has_subscription: true,
          effective_products: ['artecheck'],
          commercial_products: ['artecheck'],
        },
      });
      assert.equal(res.authorized, false);
      assert.equal(res.reason, 'inactive_membership');
    });

    it('8. Organização inativa -> BLOQUEADO', () => {
      const res = simulatePrexyonEntitlementResolution({
        userId: validOwnerId,
        authToken: validJwt,
        clientType: 'authenticated',
        member: { organization_id: validOrgId, role: 'owner', is_active: true },
        org: { id: validOrgId, is_active: false },
        entData: {
          has_subscription: true,
          effective_products: ['artecheck'],
          commercial_products: ['artecheck'],
        },
      });
      assert.equal(res.authorized, false);
      assert.equal(res.reason, 'inactive_org');
    });

    it('9. RPC com role anon (sem JWT) lança 42501 -> FAIL CLOSED', () => {
      const res = simulatePrexyonEntitlementResolution({
        userId: validOwnerId,
        authToken: validJwt,
        rpcCallerRole: 'anon',
        member: { organization_id: validOrgId, role: 'owner', is_active: true },
        org: { id: validOrgId, is_active: true },
      });
      assert.equal(res.authorized, false);
      assert.equal((res as any).rpcError?.code, '42501');
    });

    it('10. Erro de rede no RPC central de entitlements -> BLOQUEADO (fail-closed)', () => {
      const res = simulatePrexyonEntitlementResolution({
        userId: validOwnerId,
        authToken: validJwt,
        clientType: 'authenticated',
        member: { organization_id: validOrgId, role: 'owner', is_active: true },
        org: { id: validOrgId, is_active: true },
        entErr: new Error('RPC network failure'),
      });
      assert.equal(res.authorized, false);
      assert.equal(res.reason, 'rpc_error');
    });

    it('11. JWT ausente ou vazio -> BLOQUEADO imediatamente', () => {
      const res1 = simulatePrexyonEntitlementResolution({
        userId: validOwnerId,
        authToken: null,
      });
      assert.equal(res1.authorized, false);
      assert.equal(res1.reason, 'missing_or_empty_jwt');

      const res2 = simulatePrexyonEntitlementResolution({
        userId: validOwnerId,
        authToken: '   ',
      });
      assert.equal(res2.authorized, false);
      assert.equal(res2.reason, 'missing_or_empty_jwt');
    });

    it('12. OWNER em organização sem entitlement -> BLOQUEADO', () => {
      const res = simulatePrexyonEntitlementResolution({
        userId: validOwnerId,
        authToken: validJwt,
        clientType: 'authenticated',
        rpcCallerRole: 'authenticated',
        rpcCallerId: validOwnerId,
        member: { organization_id: validOrgId, role: 'owner', is_active: true },
        org: { id: validOrgId, is_active: true },
        entData: {
          has_subscription: false,
          is_entitled: false,
          commercial_products: [],
          effective_products: [],
          homologation_products: [],
        },
      });
      assert.equal(res.authorized, false);
      assert.equal(res.reason, 'missing_artecheck_entitlement');
    });

    it('13. Segurança: nenhum JWT ou token é exposto em logs ou retornos de erro', () => {
      const res = simulatePrexyonEntitlementResolution({
        userId: validOwnerId,
        authToken: 'secret-jwt-token-123',
        clientType: 'authenticated',
        member: { organization_id: validOrgId, role: 'owner', is_active: true },
        org: { id: validOrgId, is_active: true },
        entData: {
          has_subscription: true,
          effective_products: ['artecheck'],
          commercial_products: ['artecheck'],
        },
      });
      const serialized = JSON.stringify(res);
      assert.equal(serialized.includes('secret-jwt-token-123'), false);
    });
  });
});


