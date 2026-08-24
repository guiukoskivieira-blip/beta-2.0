import React from 'react';
import { Sparkles, ArrowRight, Sliders, CheckCircle2, Plus, X, Info, AlertTriangle } from 'lucide-react';
import type { ProductionProfile } from '../utils/productionProfiles';

interface RecommendedProfileBannerProps {
  detectedWidthMm: number;
  detectedHeightMm: number;
  matchingProfiles: ProductionProfile[];
  currentProfile: ProductionProfile;
  onSelectProfile: (profile: ProductionProfile) => void;
  onOpenProfilesModal: () => void;
  onCreateCustomWithDimensions?: (w: number, h: number) => void;
  onDismiss?: () => void;
}

export const RecommendedProfileBanner: React.FC<RecommendedProfileBannerProps> = ({
  detectedWidthMm,
  detectedHeightMm,
  matchingProfiles,
  currentProfile,
  onSelectProfile,
  onOpenProfilesModal,
  onCreateCustomWithDimensions,
  onDismiss,
}) => {
  const roundedW = Math.round(detectedWidthMm * 10) / 10;
  const roundedH = Math.round(detectedHeightMm * 10) / 10;

  const hasDefinedDimensions = Boolean(currentProfile.expectedWidthMm && currentProfile.expectedHeightMm);
  const isCurrentProfileCompatible = hasDefinedDimensions
    ? (
        (Math.abs(detectedWidthMm - currentProfile.expectedWidthMm!) <= 0.5 && Math.abs(detectedHeightMm - currentProfile.expectedHeightMm!) <= 0.5) ||
        (Math.abs(detectedWidthMm - currentProfile.expectedHeightMm!) <= 0.5 && Math.abs(detectedHeightMm - currentProfile.expectedWidthMm!) <= 0.5)
      )
    : false;

  const isDimensionallyIncompatible = hasDefinedDimensions && !isCurrentProfileCompatible;
  const isGeneric = currentProfile.isGeneric || !hasDefinedDimensions;

  // Filter out the currently selected profile
  const filteredMatches = matchingProfiles.filter(p => p.id !== currentProfile.id);

  // Case 1: Incompatible defined profile (e.g. Cardapio A3 active for A4 file)
  if (isDimensionallyIncompatible) {
    return (
      <div className="p-4 sm:p-5 rounded-3xl bg-gradient-to-r from-amber-50 via-orange-50/70 to-amber-50/50 border border-amber-300/80 shadow-2xs mb-6 select-none animate-in fade-in slide-in-from-top-2 duration-200">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="p-2.5 rounded-2xl bg-amber-600 text-white shadow-xs shrink-0 mt-0.5">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-black uppercase tracking-wider text-amber-900">
                  Perfil atual incompatível com o formato
                </span>
                <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 text-xs font-bold border border-amber-300">
                  Arquivo detectado: {roundedW} × {roundedH} mm
                </span>
              </div>
              <p className="text-xs text-[#451A03] leading-relaxed">
                Perfil ativo: <strong>{currentProfile.name}</strong> ({currentProfile.expectedWidthMm} × {currentProfile.expectedHeightMm} mm). Escolha um perfil compatível para avaliar corretamente dimensões, sangria e correções geométricas.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap justify-end shrink-0">
            {filteredMatches.map((profile) => (
              <button
                key={profile.id}
                type="button"
                onClick={() => onSelectProfile(profile)}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 active:scale-[0.98] text-white text-xs font-bold shadow-xs transition-all cursor-pointer group"
                title={`Usar perfil ${profile.name} (${profile.expectedWidthMm} × ${profile.expectedHeightMm} mm • Sangria ${profile.expectedBleedMm} mm)`}
              >
                <span>Usar {profile.name.split('—')[0].trim()}</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
              </button>
            ))}

            {onDismiss && (
              <button
                type="button"
                onClick={onDismiss}
                className="px-3 py-2 rounded-xl bg-white/80 hover:bg-white text-slate-700 hover:text-slate-900 text-xs font-semibold border border-amber-200 transition-colors cursor-pointer"
                title="Manter o perfil atual mesmo com dimensões divergentes"
              >
                Manter perfil atual
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Case 2: Generic profile with matching presets
  if (isGeneric && filteredMatches.length > 0) {
    return (
      <div className="p-4 sm:p-5 rounded-3xl bg-gradient-to-r from-blue-50/90 via-indigo-50/70 to-purple-50/50 border border-blue-200/90 shadow-2xs mb-6 select-none animate-in fade-in slide-in-from-top-2 duration-200">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="p-2.5 rounded-2xl bg-blue-600 text-white shadow-xs shrink-0 mt-0.5">
              <Sparkles className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-black uppercase tracking-wider text-blue-900">
                  {filteredMatches.length === 1 ? 'Perfil Comercial Recomendado' : 'Perfis Compatíveis com o Formato'}
                </span>
                <span className="px-2.5 py-0.5 rounded-full bg-blue-100 text-[#1D4ED8] text-xs font-bold border border-blue-200">
                  Formato Detectado: {roundedW} × {roundedH} mm
                </span>
              </div>
              <p className="text-xs text-[#334155] leading-relaxed">
                {filteredMatches.length === 1 ? (
                  <>
                    Encontramos o preset <strong>{filteredMatches[0].name}</strong> com dimensões exatas. Selecionar o perfil correto calibra a sangria e regras do Motor 1.
                  </>
                ) : (
                  <>
                    Encontramos <strong>{filteredMatches.length} produtos gráficos</strong> compatíveis com <strong>{roundedW} × {roundedH} mm</strong>. Selecione o produto pretendido:
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap justify-end shrink-0">
            {filteredMatches.map((profile) => (
              <button
                key={profile.id}
                type="button"
                onClick={() => onSelectProfile(profile)}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white text-xs font-bold shadow-xs transition-all cursor-pointer group"
                title={`Usar perfil ${profile.name} (${profile.expectedWidthMm} × ${profile.expectedHeightMm} mm • Sangria ${profile.expectedBleedMm} mm)`}
              >
                <span>Usar {profile.name.split('—')[0].trim()}</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
              </button>
            ))}

            {onDismiss && (
              <button
                type="button"
                onClick={onDismiss}
                className="px-3 py-2 rounded-xl bg-white/80 hover:bg-white text-slate-600 hover:text-slate-900 text-xs font-semibold border border-slate-200 transition-colors cursor-pointer"
                title="Manter o perfil atual sem alterar"
              >
                Manter {currentProfile.name.split('—')[0].trim()}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Case 3: Generic profile with no exact matches
  if (isGeneric && filteredMatches.length === 0) {
    return (
      <div className="p-4 rounded-2xl bg-gradient-to-r from-slate-50 to-indigo-50/40 border border-slate-200/90 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs mb-6 select-none animate-in fade-in duration-200">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-xl bg-indigo-50 text-[#4F46E5] shrink-0 mt-0.5 border border-indigo-100">
            <Info className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-black uppercase tracking-wider text-[#0F172A]">
                Perfil Genérico Ativo
              </span>
              <span className="px-2 py-0.5 rounded-md bg-slate-200/80 text-slate-700 text-[10px] font-bold">
                {roundedW} × {roundedH} mm
              </span>
            </div>
            <p className="text-xs text-[#64748B] mt-0.5">
              Nenhum preset comercial exato cadastrado para <strong>{roundedW} × {roundedH} mm</strong>. Crie um perfil com estas dimensões para habilitar validação e ajustes de sangria.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
          {onCreateCustomWithDimensions && (
            <button
              type="button"
              onClick={() => onCreateCustomWithDimensions(roundedW, roundedH)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-white hover:bg-slate-50 border border-indigo-200 text-[#4F46E5] text-xs font-bold shadow-2xs transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Criar perfil com estas dimensões</span>
            </button>
          )}
          <button
            type="button"
            onClick={onOpenProfilesModal}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all cursor-pointer"
          >
            <span>Ver todos os perfis</span>
          </button>
        </div>
      </div>
    );
  }

  return null;
};
