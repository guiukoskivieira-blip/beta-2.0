import React from 'react';
import { Plus, ShieldCheck, Sliders } from 'lucide-react';
import type { ProductionProfile } from '../utils/productionProfiles';

interface HeaderProps {
  onReset: () => void;
  canReset: boolean;
  viewMode?: 'operational' | 'technical';
  onToggleViewMode?: (mode: 'operational' | 'technical') => void;
  selectedProfile?: ProductionProfile;
  onOpenChangeProfile?: () => void;
  hasActiveAnalysis?: boolean;
}

export const Header: React.FC<HeaderProps> = ({ onReset, selectedProfile, onOpenChangeProfile, hasActiveAnalysis = false }) => (
  <header className="sticky top-0 z-40 flex min-h-[72px] w-full items-center justify-between bg-[#03132e] px-4 text-white shadow-lg shadow-slate-950/10 sm:px-7">
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
    <div className="flex items-center gap-2">
      {hasActiveAnalysis && selectedProfile && onOpenChangeProfile && <button type="button" onClick={onOpenChangeProfile} className="hidden min-h-10 items-center gap-2 rounded-xl px-3 text-xs font-semibold text-slate-200 transition hover:bg-white/10 lg:flex"><Sliders className="h-4 w-4 text-violet-400" />{selectedProfile.name.split('—')[0].trim()}</button>}
      <button type="button" onClick={onReset} aria-label="Nova análise" className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-xl bg-violet-600 px-3 text-xs font-bold shadow-lg shadow-violet-900/30 transition hover:bg-violet-500 sm:px-4"><Plus className="h-4 w-4" /><span className="hidden sm:inline">Nova análise</span></button>
    </div>
  </header>
);
