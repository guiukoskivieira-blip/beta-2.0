import React from 'react';
import { Plus, Sliders, RefreshCw } from 'lucide-react';
import { LogoWordmark } from './BrandLogos';
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

export const Header: React.FC<HeaderProps> = ({ 
  onReset, 
  canReset,
  viewMode = 'operational',
  onToggleViewMode,
  selectedProfile,
  onOpenChangeProfile,
  hasActiveAnalysis = false,
}) => {
  const isGeneric = Boolean(
    selectedProfile?.isGeneric ||
    (!selectedProfile?.expectedWidthMm && !selectedProfile?.expectedHeightMm)
  );

  const profileDisplayName = selectedProfile
    ? selectedProfile.name.split('—')[0].trim()
    : 'Impressão Comercial';

  const profileDimensions = selectedProfile
    ? isGeneric
      ? 'Formato Livre'
      : `${selectedProfile.expectedWidthMm} × ${selectedProfile.expectedHeightMm} mm`
    : '';

  return (
    <header className="sticky top-0 z-20 w-full bg-white/95 backdrop-blur-xs border-b border-slate-200/80 px-4 sm:px-8 py-2.5 sm:py-3 flex items-center justify-between shadow-2xs select-none">
      {/* Left: Brand & Contract Indicator */}
      <div className="flex items-center gap-3 sm:gap-5 min-w-0">
        <LogoWordmark height={26} />

        {/* Profile Contract Badge with Explicit "Alterar Perfil" Action */}
        {selectedProfile && onOpenChangeProfile && hasActiveAnalysis && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-slate-50 border border-slate-200/90 shadow-2xs">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider hidden md:inline">
                Contrato:
              </span>
              <span className="text-xs font-black text-[#0F172A] truncate max-w-[120px] sm:max-w-[180px] md:max-w-[220px]">
                {profileDisplayName}
              </span>
              {profileDimensions && (
                <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded-md border border-indigo-100 hidden sm:inline shrink-0">
                  {profileDimensions}
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={onOpenChangeProfile}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white hover:bg-indigo-50 border border-slate-200 hover:border-indigo-200 text-[11px] font-bold text-indigo-700 transition-all cursor-pointer shadow-2xs shrink-0"
              title="Reavaliar este documento com outro perfil de produção"
            >
              <Sliders className="w-3 h-3 text-indigo-600" />
              <span>Alterar</span>
            </button>
          </div>
        )}
      </div>

      {/* Center: Operational vs Technical View Switch */}
      {onToggleViewMode && hasActiveAnalysis && (
        <div className="hidden md:flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200/80">
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
          className="inline-flex items-center gap-1.5 px-3.5 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-bold text-white bg-gradient-to-r from-[#0066FF] via-[#5B21B6] to-[#7C3AED] hover:opacity-95 shadow-md shadow-indigo-500/20 active:scale-[0.98] transition-all cursor-pointer select-none shrink-0"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          <span>Novo Arquivo</span>
        </button>
      </div>
    </header>
  );
};
