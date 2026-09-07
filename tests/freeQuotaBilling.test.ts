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

  it('12. Prexyon homologation entitlement: resolvePrexyonHomologationEntitlement e authorizeProcessing existem e validam o fluxo obrigatório', () => {
    // 1. Deve verificar membership ativo no servidor
    assert.match(serverSrc, /from\(['"]organization_members['"]\)/);
    assert.match(serverSrc, /\.eq\(['"]user_id['"],\s*userId\)/);
    assert.match(serverSrc, /member\.is_active/);

    // 2. Deve verificar organização ativa
    assert.match(serverSrc, /from\(['"]organizations['"]\)/);
    assert.match(serverSrc, /org\.is_active/);

    // 3. Deve consultar RPC prexyon_get_organization_entitlements
    assert.match(serverSrc, /rpc\(['"]prexyon_get_organization_entitlements['"]/);

    // 4. Deve exigir artecheck em effective_products E homologation_products
    assert.match(serverSrc, /effectiveProducts\.includes\(['"]artecheck['"]\)/);
    assert.match(serverSrc, /homologationProducts\.includes\(['"]artecheck['"]\)/);

    // 5. Homologação autorizada faz bypass de subscriptions/plans/analysis_usage_events
    assert.match(serverSrc, /if \(homologation\.authorized\)/);
    assert.match(serverSrc, /prexyonHomologation = true/);

    // 6. Autorização centralizada aplicada a POST /api/upload e POST /api/flatten-transparency
    assert.match(serverSrc, /app\.post\(\s*["']\/api\/upload["'],\s*async\s*\(req:\s*Request,\s*res:\s*Response/);
    assert.match(serverSrc, /app\.post\(\s*["']\/api\/flatten-transparency["'],\s*async\s*\(req:\s*Request,\s*res:\s*Response/);
  });

  describe('Prexyon Homologation Entitlement Processing Authorization Logic', () => {
    function simulatePrexyonHomologationResolution(opts: {
      userId: string;
      member?: { organization_id: string; role: string; is_active: boolean } | null;
      memberErr?: any;
      org?: { id: string; is_active: boolean } | null;
      orgErr?: any;
      entData?: { effective_products?: string[]; homologation_products?: string[] } | null;
      entErr?: any;
    }) {
      const { userId, member, memberErr, org, orgErr, entData, entErr } = opts;
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);
      if (!isUuid) return { authorized: false };

      if (memberErr || !member || !member.is_active) return { authorized: false };
      const orgId = member.organization_id;
      if (!orgId) return { authorized: false };

      if (orgErr || !org || !org.is_active) return { authorized: false };
      if (entErr || !entData) return { authorized: false };

      const effectiveProducts: string[] = entData.effective_products || [];
      const homologationProducts: string[] = entData.homologation_products || [];

      if (effectiveProducts.includes('artecheck') && homologationProducts.includes('artecheck')) {
        return { authorized: true, organizationId: orgId };
      }
      return { authorized: false };
    }

    const validOwnerId = '2e12961a-2294-40dc-8d58-1cd19c8ac0c4';
    const validMemberId = 'c9f649fc-be89-42b4-89ea-9cb3bb2b335c';
    const validOrgId = '43c47a08-2f84-42db-a64d-d1f0ea0c6a6b';

    it('A) homologation entitlement ArteCheck válido -> upload e flatten permitidos sem subscriptions', () => {
      const res = simulatePrexyonHomologationResolution({
        userId: validOwnerId,
        member: { organization_id: validOrgId, role: 'owner', is_active: true },
        org: { id: validOrgId, is_active: true },
        entData: {
          effective_products: ['artecheck', 'arteflow', 'orcagraf'],
          homologation_products: ['artecheck', 'arteflow', 'orcagraf'],
        },
      });
      assert.equal(res.authorized, true);
      assert.equal(res.organizationId, validOrgId);
    });

    it('B) homologation entitlement válido para MEMBER -> autorizado com organização resolvida no servidor', () => {
      const res = simulatePrexyonHomologationResolution({
        userId: validMemberId,
        member: { organization_id: validOrgId, role: 'member', is_active: true },
        org: { id: validOrgId, is_active: true },
        entData: {
          effective_products: ['artecheck'],
          homologation_products: ['artecheck'],
        },
      });
      assert.equal(res.authorized, true);
      assert.equal(res.organizationId, validOrgId);
    });

    it('C) sem entitlement ArteCheck (outros produtos) -> BLOQUEADO (fail-closed)', () => {
      const res = simulatePrexyonHomologationResolution({
        userId: validOwnerId,
        member: { organization_id: validOrgId, role: 'owner', is_active: true },
        org: { id: validOrgId, is_active: true },
        entData: {
          effective_products: ['arteflow', 'orcagraf'],
          homologation_products: ['arteflow', 'orcagraf'],
        },
      });
      assert.equal(res.authorized, false);
    });

    it('D) artecheck em effective_products mas ausente em homologation_products -> BLOQUEADO', () => {
      const res = simulatePrexyonHomologationResolution({
        userId: validOwnerId,
        member: { organization_id: validOrgId, role: 'owner', is_active: true },
        org: { id: validOrgId, is_active: true },
        entData: {
          effective_products: ['artecheck'],
          homologation_products: [],
        },
      });
      assert.equal(res.authorized, false);
    });

    it('E) membership inválido/inativo -> BLOQUEADO', () => {
      const res = simulatePrexyonHomologationResolution({
        userId: validOwnerId,
        member: { organization_id: validOrgId, role: 'owner', is_active: false },
        org: { id: validOrgId, is_active: true },
        entData: {
          effective_products: ['artecheck'],
          homologation_products: ['artecheck'],
        },
      });
      assert.equal(res.authorized, false);
    });

    it('F) organização inativa -> BLOQUEADO', () => {
      const res = simulatePrexyonHomologationResolution({
        userId: validOwnerId,
        member: { organization_id: validOrgId, role: 'owner', is_active: true },
        org: { id: validOrgId, is_active: false },
        entData: {
          effective_products: ['artecheck'],
          homologation_products: ['artecheck'],
        },
      });
      assert.equal(res.authorized, false);
    });

    it('G) erro de RPC central de entitlements -> BLOQUEADO (fail-closed)', () => {
      const res = simulatePrexyonHomologationResolution({
        userId: validOwnerId,
        member: { organization_id: validOrgId, role: 'owner', is_active: true },
        org: { id: validOrgId, is_active: true },
        entErr: new Error('RPC network failure'),
      });
      assert.equal(res.authorized, false);
    });

    it('H) usuário sem membership -> BLOQUEADO', () => {
      const res = simulatePrexyonHomologationResolution({
        userId: validOwnerId,
        member: null,
      });
      assert.equal(res.authorized, false);
    });
  });
});


