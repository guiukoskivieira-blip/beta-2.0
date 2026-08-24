import React from 'react';
import { Plus, Sliders, ChevronDown } from 'lucide-react';
import { LogoWordmark } from './BrandLogos';
import type { ProductionProfile } from '../utils/productionProfiles';

interface HeaderProps {
  onReset: () => void;
  canReset: boolean;
  viewMode?: 'operational' | 'technical';
  onToggleViewMode?: (mode: 'operational' | 'technical') => void;
  selectedProfile?: ProductionProfile;
  onOpenProfiles?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ 
  onReset, 
  canReset,
  viewMode = 'operational',
  onToggleViewMode,
  selectedProfile,
  onOpenProfiles,
}) => {
  // Format clean profile display string
  const isGeneric = Boolean(selectedProfile?.isGeneric || (!selectedProfile?.expectedWidthMm && !selectedProfile?.expectedHeightMm));
  const profileLabel = selectedProfile
    ? isGeneric
      ? `GENÉRICO (Formato não definido)`
      : selectedProfile.expectedWidthMm && selectedProfile.expectedHeightMm
      ? `${selectedProfile.name.split('—')[0].trim()} (${selectedProfile.expectedWidthMm} × ${selectedProfile.expectedHeightMm} mm)`
      : selectedProfile.name
    : 'Impressão Comercial';

  return (
    <header className="sticky top-0 z-20 w-full bg-white/95 backdrop-blur-xs border-b border-slate-200/80 px-4 sm:px-8 py-3 flex items-center justify-between shadow-2xs select-none">
      {/* Left: Brand & Prominent Profile Selector */}
      <div className="flex items-center gap-4 min-w-0">
        <LogoWordmark height={28} />

        {/* Prominent Production Profile Selector */}
        {selectedProfile && onOpenProfiles && (
          <button
            type="button"
            onClick={onOpenProfiles}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-slate-50 hover:bg-indigo-50/70 border border-slate-200 hover:border-indigo-200 text-xs font-semibold text-[#0F172A] transition-all cursor-pointer shadow-2xs group"
            title={`Perfil Ativo: ${selectedProfile.name}. Clique para abrir a biblioteca de produtos e perfis.`}
          >
            <Sliders className="w-3.5 h-3.5 text-[#4F46E5] group-hover:scale-110 transition-transform" />
            <span className="text-[#64748B] font-medium hidden sm:inline">Perfil:</span>
            <span className="truncate max-w-[150px] sm:max-w-[240px] font-bold text-[#0F172A]">
              {profileLabel}
            </span>
            <ChevronDown className="w-3 h-3 text-[#64748B] group-hover:text-[#4F46E5] transition-colors" />
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

      {/* Right Actions: Primary "+ Novo Arquivo" */}
      <div className="flex items-center gap-3">
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
