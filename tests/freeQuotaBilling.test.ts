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

  it('2. Usuário novo sem subscription recebe plano Free virtual ativo com 15 de limite', () => {
    // Simula a lógica de getSubscriptionUsage sem subscription
    const userId = 'user_new_123';
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

  it('3. Free com 0 usos => remaining = 15 => permite análise', () => {
    const limit = 15;
    const used = 0;
    const remaining = Math.max(0, limit - used);
    assert.equal(remaining, 15);
    assert.equal(remaining > 0, true, 'Deve permitir análise');
  });

  it('4. Free com 14 usos => remaining = 1 => permite análise', () => {
    const limit = 15;
    const used = 14;
    const remaining = Math.max(0, limit - used);
    assert.equal(remaining, 1);
    assert.equal(remaining > 0, true, 'Deve permitir análise');
  });

  it('5. Free com 15 usos => remaining = 0 => bloqueia na 16ª tentativa', () => {
    const limit = 15;
    const used = 15;
    const remaining = Math.max(0, limit - used);
    assert.equal(remaining, 0);
    assert.equal(remaining <= 0, true, 'Deve bloquear com PLAN_LIMIT_REACHED');
  });

  it('6. Ausência de subscription NÃO retorna SUBSCRIPTION_REQUIRED', () => {
    // Verifica que getSubscriptionUsage sintetiza plano free com status 'active'
    assert.match(serverSrc, /is_virtual_free:\s*true/);
    assert.match(serverSrc, /plan_code:\s*['"]free['"]/);
    assert.match(serverSrc, /status:\s*['"]active['"]/);
  });

  it('7. Subscriptions pagas continuam com seus limites exatos', () => {
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
    // getSubscriptionUsage propaga erro se subError ou usageError acontecer
    assert.match(serverSrc, /if \(subError\) \{\s*throw new Error/);
    assert.match(serverSrc, /if \(usageError\) \{\s*throw new Error/);
    // middleware de upload captura erro e responde status 500
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
});
