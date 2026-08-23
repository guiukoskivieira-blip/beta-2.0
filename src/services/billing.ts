import { auth } from '../auth';
import { apiUrl } from '../config/api';
import type { BillingStatus, BillingPeriod, PlanCode } from '../domain/billing';

export function normalizeBillingStatus(data: any): BillingStatus {
  if (!data) {
    return {
      success: false,
      plan: 'free',
      period: 'monthly',
      status: 'active',
      usedAnalyses: 0,
      limitAnalyses: 15,
    };
  }

  const sub = data.subscription;
  const usage = data.usage;

  const plan = (data.plan || sub?.planCode || sub?.plan_code || 'free') as PlanCode;
  const period = (data.period || sub?.billingPeriod || sub?.billing_period || 'monthly') as BillingPeriod;
  const status = (data.status || sub?.status || 'active');

  const rawUsed = data.usedAnalyses ?? usage?.used;
  const rawLimit = data.limitAnalyses ?? usage?.limit;

  const usedAnalyses = typeof rawUsed === 'number' && !isNaN(rawUsed) ? rawUsed : 0;
  const limitAnalyses = typeof rawLimit === 'number' && !isNaN(rawLimit) ? rawLimit : (plan === 'free' ? 15 : 0);

  const renewsAt = data.renewsAt || sub?.currentPeriodEnd || sub?.current_period_end || undefined;
  const isPromotion = Boolean(data.isPromotion ?? (sub?.promotionCyclesUsed != null && sub?.promotionCyclesUsed > 0));
  const promotionCyclesRemaining = data.promotionCyclesRemaining;

  return {
    success: true,
    plan,
    period,
    status,
    usedAnalyses,
    limitAnalyses,
    renewsAt,
    isPromotion,
    promotionCyclesRemaining,
  };
}

async function headers() {
  const session = await auth.getSession();
  return session?.accessToken ? { Authorization: `Bearer ${session.accessToken}` } : {};
}

export async function getBillingStatus(): Promise<BillingStatus> {
  const res = await fetch(apiUrl('/api/billing/status'), { headers: await headers(), cache: 'no-store' });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || 'Não foi possível consultar sua assinatura.');
  return normalizeBillingStatus(data);
}

export async function createCheckout(plan: PlanCode, period: BillingPeriod): Promise<{ success: boolean; checkoutUrl?: string; url?: string; subscriptionId?: string; status?: string }> {
  const res = await fetch(apiUrl('/api/billing/checkout'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await headers()) },
    body: JSON.stringify({ plan_code: plan, billing_period: period, plan, period })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || 'Checkout indisponível.');
  return data;
}

