import React, { useEffect, useState, useRef } from 'react';
import { X, Check, Crown, Loader2 } from 'lucide-react';
import { PLANS, type BillingPeriod, type BillingStatus, type PlanCode } from '../domain/billing';
import { createCheckout, getBillingStatus } from '../services/billing';
import { auth } from '../auth';

export interface PlansModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function PlansModal({ isOpen, onClose }: PlansModalProps) {
  const [period, setPeriod] = useState<BillingPeriod>('monthly');
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState<boolean>(true);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [loadingPlanCode, setLoadingPlanCode] = useState<PlanCode | null>(null);
  const [message, setMessage] = useState('');

  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      triggerRef.current = document.activeElement as HTMLElement | null;
      setMessage('');
      setStatusError(null);
      setLoadingPlanCode(null);
      setIsLoadingStatus(true);

      // Lock body scroll
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';

      // Initial focus on close button
      const focusTimer = setTimeout(() => {
        closeButtonRef.current?.focus();
      }, 50);

      // Keyboard Esc listener
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          onClose();
        }
      };
      window.addEventListener('keydown', handleKeyDown);

      // Fetch authoritative billing status
      auth
        .getSession()
        .then((session) => {
          if (session?.accessToken) {
            getBillingStatus()
              .then((s) => {
                setStatus(s);
                setIsLoadingStatus(false);
              })
              .catch((e) => {
                setStatusError(e?.message || 'Não foi possível consultar seu uso atual.');
                setIsLoadingStatus(false);
              });
          } else {
            setStatus(null);
            setIsLoadingStatus(false);
          }
        })
        .catch(() => {
          setIsLoadingStatus(false);
        });

      return () => {
        clearTimeout(focusTimer);
        window.removeEventListener('keydown', handleKeyDown);
        document.body.style.overflow = originalOverflow;
        if (triggerRef.current && typeof triggerRef.current.focus === 'function') {
          triggerRef.current.focus();
        }
      };
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const currentPlan = status?.plan;
  const plans = Object.values(PLANS);
  const money = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const checkout = async (code: PlanCode) => {
    if (loadingPlanCode !== null) return;

    try {
      setMessage('');
      setLoadingPlanCode(code);

      const session = await auth.getSession();
      if (!session?.accessToken) {
        setMessage('Faça login para escolher um plano.');
        setLoadingPlanCode(null);
        return;
      }

      const r = await createCheckout(code, period);
      const targetUrl = r?.checkoutUrl || r?.url;
      if (targetUrl) {
        location.href = targetUrl;
      } else {
        throw new Error('URL de pagamento não foi retornada pelo servidor.');
      }
    } catch (e: any) {
      setMessage(e?.message || 'Falha ao processar checkout.');
      setLoadingPlanCode(null);
    }
  };

  const used = typeof status?.usedAnalyses === 'number' && !isNaN(status.usedAnalyses) ? status.usedAnalyses : 0;
  const limit = typeof status?.limitAnalyses === 'number' && !isNaN(status.limitAnalyses) ? status.limitAnalyses : (status?.plan === 'free' ? 15 : 0);
  const remaining = Math.max(0, limit - used);
  const usagePercent = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;

  return (
    <div
      className="fixed inset-0 z-[80] bg-slate-900/60 backdrop-blur-xs p-3 sm:p-4 flex items-center justify-center select-none"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="plans-modal-title"
    >
      <div
        className="w-full max-w-5xl my-auto rounded-3xl border border-slate-200 bg-white shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sticky Header with Always-Visible Close Button */}
        <div className="p-4 sm:p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/90 sticky top-0 z-10 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 sm:p-2.5 rounded-2xl bg-indigo-50 text-[#4F46E5] border border-indigo-100 shrink-0">
              <Crown className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div className="min-w-0">
              <h2 id="plans-modal-title" className="text-lg sm:text-xl font-black text-[#0F172A] tracking-tight truncate">
                Planos e Assinaturas
              </h2>
              <p className="text-xs text-[#64748B] font-medium hidden sm:block">
                Escolha o volume e a capacidade de processamento ideal para sua gráfica.
              </p>
            </div>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-200/70 transition-colors cursor-pointer shrink-0"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content Body */}
        <div className="p-4 sm:p-6 space-y-6 bg-[#F8FAFC] overflow-y-auto flex-1">
          {/* Usage Status Card */}
          <div className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200/80 shadow-2xs">
            {isLoadingStatus ? (
              <div className="flex items-center gap-3 py-1">
                <Loader2 className="w-5 h-5 animate-spin text-indigo-600 shrink-0" />
                <div>
                  <span className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider block">
                    Uso da Assinatura Atual
                  </span>
                  <span className="text-xs sm:text-sm font-bold text-slate-600">
                    Carregando uso da assinatura...
                  </span>
                </div>
              </div>
            ) : statusError ? (
              <div className="space-y-1">
                <span className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider block">
                  Uso da Assinatura Atual
                </span>
                <span className="text-xs text-rose-600 font-semibold block">
                  {statusError}
                </span>
              </div>
            ) : status ? (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <span className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider block">
                    Uso da Assinatura Atual ({status.plan === 'free' ? 'Plano Grátis' : 'Plano Ativo'})
                  </span>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-xl sm:text-2xl font-black text-[#0F172A]">
                      {used} / {limit} análises
                    </span>
                    <span className="text-xs text-slate-500 font-medium">
                      ({remaining} restantes)
                    </span>
                  </div>
                </div>

                <div className="sm:w-64 space-y-1.5">
                  <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden border border-slate-200/60">
                    <div
                      className="h-full bg-gradient-to-r from-[#0066FF] to-[#7C3AED] rounded-full transition-all duration-300"
                      style={{ width: `${usagePercent}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-slate-500 font-semibold block text-right">
                    {usagePercent}% utilizado
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider block">
                    Uso da Assinatura
                  </span>
                  <span className="text-xs sm:text-sm font-bold text-slate-700 mt-1 block">
                    Faça login para acompanhar o consumo da sua cota.
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Period Toggle */}
          <div className="flex items-center justify-center">
            <div className="bg-slate-200/70 p-1 rounded-2xl border border-slate-200 flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPeriod('monthly')}
                className={`px-4 sm:px-5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  period === 'monthly'
                    ? 'bg-white text-[#0F172A] shadow-2xs'
                    : 'text-[#64748B] hover:text-[#0F172A]'
                }`}
              >
                Mensal
              </button>
              <button
                type="button"
                onClick={() => setPeriod('yearly')}
                className={`px-4 sm:px-5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  period === 'yearly'
                    ? 'bg-white text-[#2563EB] shadow-2xs'
                    : 'text-[#64748B] hover:text-[#0F172A]'
                }`}
              >
                Anual <span className="ml-1 px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-700 text-[10px] font-extrabold">20% OFF</span>
              </button>
            </div>
          </div>

          {message && (
            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold text-center animate-in fade-in">
              {message}
            </div>
          )}

          {/* Plans Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {plans.map((p) => {
              const price = period === 'monthly' ? p.monthlyPrice : p.yearlyPrice;
              const isCurrent = currentPlan === p.id;
              const isPro = p.id === 'professional' || p.id === 'professional_launch';

              return (
                <div
                  key={p.id}
                  className={`rounded-2xl p-5 border transition-all flex flex-col justify-between ${
                    isPro
                      ? 'bg-gradient-to-b from-indigo-50/40 via-white to-white border-indigo-200 shadow-md shadow-indigo-100/50 ring-1 ring-indigo-200'
                      : 'bg-white border-slate-200/90 shadow-2xs'
                  }`}
                >
                  <div className="space-y-4">
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black uppercase tracking-wider text-[#0F172A]">{p.name}</span>
                        {p.badge && (
                          <span className="px-2 py-0.5 rounded-full bg-gradient-to-r from-[#2563EB] to-[#7C3AED] text-white text-[9px] font-extrabold uppercase">
                            {p.badge}
                          </span>
                        )}
                      </div>
                      <div className="mt-3 flex items-baseline gap-1">
                        <span className="text-2xl font-black text-[#0F172A]">{money(price)}</span>
                        <span className="text-xs text-[#64748B] font-medium">/{period === 'monthly' ? 'mês' : 'ano'}</span>
                      </div>
                    </div>

                    <ul className="space-y-2 pt-2 border-t border-slate-100 text-xs font-medium text-[#334155]">
                      {p.features.map((f, fIdx) => (
                        <li key={fIdx} className="flex items-center gap-2">
                          <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <button
                    type="button"
                    onClick={() => checkout(p.id)}
                    disabled={isCurrent || loadingPlanCode !== null}
                    className={`w-full mt-6 py-2.5 px-4 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      isCurrent
                        ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                        : isPro
                        ? 'bg-gradient-to-r from-[#0066FF] to-[#7C3AED] hover:opacity-95 text-white shadow-sm shadow-blue-500/20'
                        : 'bg-slate-900 hover:bg-slate-800 text-white'
                    }`}
                  >
                    {loadingPlanCode === p.id ? (
                      <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                    ) : isCurrent ? (
                      'Plano Ativo'
                    ) : (
                      'Assinar Plano'
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
