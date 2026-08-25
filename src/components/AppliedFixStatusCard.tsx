import React from 'react';
import { CheckCircle2, ShieldCheck } from 'lucide-react';

export interface AppliedFixStatusCardProps {
  title: string;
  category?: string;
  details?: string;
  icon?: React.ReactNode;
  validationText?: string;
  badgeText?: string;
}

export const AppliedFixStatusCard: React.FC<AppliedFixStatusCardProps> = ({
  title,
  category,
  details,
  icon,
  validationText = 'Revalidado pelo Motor 1',
  badgeText = '✓ Aplicada nesta sessão',
}) => {
  return (
    <div className="p-3.5 sm:p-4 rounded-2xl bg-slate-50/90 border border-slate-200/90 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs transition-all animate-in fade-in duration-200">
      <div className="flex items-start sm:items-center gap-3">
        <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600 shrink-0 mt-0.5 sm:mt-0">
          <CheckCircle2 className="w-4 h-4" />
        </div>
        <div className="space-y-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-[#0F172A]">{title}</span>
            {category && (
              <span className="px-2 py-0.5 rounded-md bg-slate-200/70 text-slate-700 text-[10px] font-bold">
                {category}
              </span>
            )}
          </div>
          {details && (
            <p className="text-[11px] text-[#64748B] font-medium leading-normal">
              {details}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
        {validationText && (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50/80 px-2 py-0.5 rounded-md border border-emerald-200/60">
            <ShieldCheck className="w-3 h-3 text-emerald-600" />
            {validationText}
          </span>
        )}
        <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[10px] font-bold">
          {badgeText}
        </span>
      </div>
    </div>
  );
};
