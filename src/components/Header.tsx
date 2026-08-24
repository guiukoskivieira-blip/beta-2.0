import React from 'react';
import { Bell, Plus, Sliders, ToggleLeft, ToggleRight, Sparkles } from 'lucide-react';
import { LogoWordmark } from './BrandLogos';
import type { ProductionProfile } from '../utils/productionProfiles';
import type { BetaUser } from '../domain/beta';

interface HeaderProps {
  onReset: () => void;
  canReset: boolean;
  viewMode?: 'operational' | 'technical';
  onToggleViewMode?: (mode: 'operational' | 'technical') => void;
  selectedProfile?: ProductionProfile;
  onOpenProfiles?: () => void;
  notificationCount?: number;
}

export const Header: React.FC<HeaderProps> = ({ 
  onReset, 
  canReset,
  viewMode = 'operational',
  onToggleViewMode,
  selectedProfile,
  onOpenProfiles,
  notificationCount = 0,
}) => {
  return (
    <header className="sticky top-0 z-20 w-full bg-white/95 backdrop-blur-xs border-b border-slate-200/80 px-4 sm:px-8 py-3 flex items-center justify-between shadow-2xs select-none">
      {/* Left: Brand & Compact Profile Badge */}
      <div className="flex items-center gap-4 min-w-0">
        <LogoWordmark height={30} />

        {/* Compact Production Profile Selector */}
        {selectedProfile && onOpenProfiles && (
          <button
            type="button"
            onClick={onOpenProfiles}
            className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100/90 hover:bg-slate-200/80 border border-slate-200/80 text-xs font-semibold text-[#334155] transition-colors cursor-pointer"
            title="Clique para alterar o perfil de produção calibrado"
          >
            <Sliders className="w-3.5 h-3.5 text-[#6366F1]" />
            <span className="text-[#64748B] font-normal">Perfil:</span>
            <span className="truncate max-w-[150px] lg:max-w-[200px] text-[#0F172A]">{selectedProfile.name}</span>
            <span className="text-[10px] text-[#2563EB] font-bold underline ml-0.5">Alterar</span>
          </button>
        )}
      </div>

      {/* Center: Operational vs Technical View Switch */}
      {onToggleViewMode && (
        <div className="hidden sm:flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200/80">
          <button
            type="button"
            onClick={() => onToggleViewMode('operational')}
            className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
              viewMode === 'operational'
                ? 'bg-white text-[#2563EB] shadow-2xs'
                : 'text-[#64748B] hover:text-[#0F172A]'
            }`}
          >
            Operacional
          </button>
          <button
            type="button"
            onClick={() => onToggleViewMode('technical')}
            className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
              viewMode === 'technical'
                ? 'bg-white text-[#7C3AED] shadow-2xs'
                : 'text-[#64748B] hover:text-[#0F172A]'
            }`}
          >
            Técnico
          </button>
        </div>
      )}

      {/* Right Actions: Notifications & "+ Novo Arquivo" */}
      <div className="flex items-center gap-2.5">
        {/* Notification Bell with Badge */}
        <button
          type="button"
          className="relative p-2 rounded-xl text-[#64748B] hover:text-[#0F172A] hover:bg-slate-100 transition-colors cursor-pointer"
          title="Notificações e alertas"
        >
          <Bell className="w-5 h-5" />
          {notificationCount > 0 && (
            <span className="absolute top-1 right-1 min-w-[17px] h-[17px] flex items-center justify-center bg-[#8B5CF6] text-white text-[10px] font-bold rounded-full px-1 shadow-xs ring-2 ring-white">
              {notificationCount}
            </span>
          )}
        </button>

        {/* Primary "+ Novo Arquivo" Gradient Button */}
        <button
          type="button"
          onClick={onReset}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold text-white bg-gradient-to-r from-[#0066FF] via-[#5B21B6] to-[#7C3AED] hover:opacity-95 shadow-md shadow-indigo-500/20 active:scale-[0.98] transition-all cursor-pointer select-none"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          <span>Novo Arquivo</span>
        </button>
      </div>
    </header>
  );
};
