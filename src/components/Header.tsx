import React from 'react';
import { ShieldCheck } from 'lucide-react';

export const Header: React.FC = () => (
  <header className="sticky top-0 z-40 flex min-h-[72px] w-full items-center bg-[#03132e] px-4 text-white shadow-lg shadow-slate-950/10 sm:px-7">
    <div className="flex min-w-0 items-center gap-3">
      <div className="flex shrink-0 items-center gap-2.5 pr-3 sm:border-r sm:border-white/20 sm:pr-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 shadow-lg shadow-blue-500/20"><span className="text-lg font-black">P</span></div>
        <span className="hidden text-xl font-black tracking-tight sm:inline">pre<span className="text-cyan-400">x</span>yon</span>
      </div>
      <div className="flex min-h-11 items-center gap-3 rounded-xl border border-white/20 bg-white/[0.03] px-3 text-sm font-semibold sm:px-4">
        <ShieldCheck className="h-5 w-5 text-violet-400" /><span>ArteCheck</span>
      </div>
      <span className="hidden rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 text-[11px] font-bold text-amber-100 md:inline">Integração Prexyon pendente</span>
    </div>
  </header>
);
