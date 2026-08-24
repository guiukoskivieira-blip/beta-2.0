import React from "react";
import { Sparkles, ArrowRight, Sliders, CheckCircle2, Plus, X, Info, AlertTriangle, RotateCcw } from "lucide-react";
import type { ProductionProfile } from "../utils/productionProfiles";

interface RecommendedProfileBannerProps {
  detectedWidthMm: number;
  detectedHeightMm: number;
  pageOrientation?: "portrait" | "landscape";
  exactOrientationMatches?: ProductionProfile[];
  inverseOrientationMatches?: ProductionProfile[];
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
  pageOrientation,
  exactOrientationMatches = [],
  inverseOrientationMatches = [],
  matchingProfiles,
  currentProfile,
  onSelectProfile,
  onOpenProfilesModal,
  onCreateCustomWithDimensions,
  onDismiss,
}) => {
  const roundedW = Math.round(detectedWidthMm * 10) / 10;
  const roundedH = Math.round(detectedHeightMm * 10) / 10;
  const isDocPortrait = pageOrientation ? pageOrientation === "portrait" : detectedWidthMm <= detectedHeightMm;

  const hasDefinedDimensions = Boolean(currentProfile.expectedWidthMm && currentProfile.expectedHeightMm);

  const exactMatch = hasDefinedDimensions
    ? Math.abs(detectedWidthMm - currentProfile.expectedWidthMm!) <= 0.5 &&
      Math.abs(detectedHeightMm - currentProfile.expectedHeightMm!) <= 0.5
    : false;

  const rotatedMatch = hasDefinedDimensions
    ? Math.abs(detectedWidthMm - currentProfile.expectedHeightMm!) <= 0.5 &&
      Math.abs(detectedHeightMm - currentProfile.expectedWidthMm!) <= 0.5
    : false;

  const isOrientationIncompatible = hasDefinedDimensions && !exactMatch && rotatedMatch;
  const isDimensionallyIncompatible = hasDefinedDimensions && !exactMatch && !rotatedMatch;
  const isGeneric = currentProfile.isGeneric || !hasDefinedDimensions;

  const filteredExact = (exactOrientationMatches.length > 0 ? exactOrientationMatches : matchingProfiles.filter(p => {
    return Math.abs(detectedWidthMm - (p.expectedWidthMm || 0)) <= 0.5 && Math.abs(detectedHeightMm - (p.expectedHeightMm || 0)) <= 0.5;
  })).filter(p => p.id !== currentProfile.id);

  const filteredRotated = (inverseOrientationMatches.length > 0 ? inverseOrientationMatches : matchingProfiles.filter(p => {
    return Math.abs(detectedWidthMm - (p.expectedHeightMm || 0)) <= 0.5 && Math.abs(detectedHeightMm - (p.expectedWidthMm || 0)) <= 0.5;
  })).filter(p => p.id !== currentProfile.id);

  if (isOrientationIncompatible) {
    const profileOrientationLabel = currentProfile.expectedWidthMm! > currentProfile.expectedHeightMm! ? "horizontal" : "vertical";
    const fileOrientationLabel = isDocPortrait ? "vertical" : "horizontal";

    return (
      <div className="p-4 sm:p-5 rounded-3xl bg-gradient-to-r from-amber-50 via-orange-50/70 to-amber-50/50 border border-amber-300/80 shadow-2xs mb-6 select-none animate-in fade-in slide-in-from-top-2 duration-200">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="p-2.5 rounded-2xl bg-amber-600 text-white shadow-xs shrink-0 mt-0.5">
              <RotateCcw className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-black uppercase tracking-wider text-amber-900">
                  Orientação do Perfil Incompatível
                </span>
                <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 text-xs font-bold border border-amber-300">
                  Arquivo: {roundedW} × {roundedH} mm ({fileOrientationLabel})
                </span>
              </div>
              <p className="text-xs text-[#451A03] leading-relaxed">
                Este perfil ("<strong>{currentProfile.name}</strong>") usa orientação <strong>{profileOrientationLabel}</strong> ({currentProfile.expectedWidthMm} × {currentProfile.expectedHeightMm} mm). Seu arquivo está em orientação <strong>{fileOrientationLabel}</strong>.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap justify-end shrink-0">
            {filteredExact.map((profile) => (
              <button
                key={profile.id}
                type="button"
                onClick={() => onSelectProfile(profile)}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 active:scale-[0.98] text-white text-xs font-bold shadow-xs transition-all cursor-pointer group"
                title={`Usar perfil ${profile.name} (${profile.expectedWidthMm} × ${profile.expectedHeightMm} mm)`}
              >
                <span>Usar {profile.name.split("—")[0].trim()}</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
              </button>
            ))}

            {onDismiss && (
              <button
                type="button"
                onClick={onDismiss}
                className="px-3 py-2 rounded-xl bg-white/80 hover:bg-white text-slate-700 hover:text-slate-900 text-xs font-semibold border border-amber-200 transition-colors cursor-pointer"
                title="Manter perfil atual"
              >
                Manter {currentProfile.name.split("—")[0].trim()}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

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
            {filteredExact.map((profile) => (
              <button
                key={profile.id}
                type="button"
                onClick={() => onSelectProfile(profile)}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 active:scale-[0.98] text-white text-xs font-bold shadow-xs transition-all cursor-pointer group"
                title={`Usar perfil ${profile.name} (${profile.expectedWidthMm} × ${profile.expectedHeightMm} mm)`}
              >
                <span>Usar {profile.name.split("—")[0].trim()}</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
              </button>
            ))}

            {onDismiss && (
              <button
                type="button"
                onClick={onDismiss}
                className="px-3 py-2 rounded-xl bg-white/80 hover:bg-white text-slate-700 hover:text-slate-900 text-xs font-semibold border border-amber-200 transition-colors cursor-pointer"
              >
                Manter perfil atual
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (isGeneric && (filteredExact.length > 0 || filteredRotated.length > 0)) {
    return (
      <div className="p-4 sm:p-5 rounded-3xl bg-gradient-to-r from-blue-50/90 via-indigo-50/70 to-purple-50/50 border border-blue-200/90 shadow-2xs mb-6 select-none animate-in fade-in slide-in-from-top-2 duration-200 space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="p-2.5 rounded-2xl bg-blue-600 text-white shadow-xs shrink-0 mt-0.5">
              <Sparkles className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-black uppercase tracking-wider text-blue-900">
                  {filteredExact.length > 0 ? "Perfis Recomendados para esta Orientação" : "Perfis Compatíveis"}
                </span>
                <span className="px-2.5 py-0.5 rounded-full bg-blue-100 text-[#1D4ED8] text-xs font-bold border border-blue-200">
                  Formato: {roundedW} × {roundedH} mm ({isDocPortrait ? "Vertical" : "Horizontal"})
                </span>
              </div>
              <p className="text-xs text-[#334155] leading-relaxed">
                {filteredExact.length > 0 ? (
                  <>
                    Encontramos produtos gráficos com <strong>orientação compatível</strong> ({isDocPortrait ? "Vertical" : "Horizontal"}). Selecionar o perfil calibra o Motor 1 e o corte:
                  </>
                ) : (
                  <>
                    Encontramos produtos com o formato rotacionado. Selecione o perfil desejado:
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap justify-end shrink-0">
            {filteredExact.map((profile) => (
              <button
                key={profile.id}
                type="button"
                onClick={() => onSelectProfile(profile)}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white text-xs font-bold shadow-xs transition-all cursor-pointer group"
                title={`Usar perfil ${profile.name} (${profile.expectedWidthMm} × ${profile.expectedHeightMm} mm)`}
              >
                <span>Usar {profile.name.split("—")[0].trim()}</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
              </button>
            ))}

            {onDismiss && (
              <button
                type="button"
                onClick={onDismiss}
                className="px-3 py-2 rounded-xl bg-white/80 hover:bg-white text-slate-600 hover:text-slate-900 text-xs font-semibold border border-slate-200 transition-colors cursor-pointer"
              >
                Manter {currentProfile.name.split("—")[0].trim()}
              </button>
            )}
          </div>
        </div>

        {filteredRotated.length > 0 && (
          <div className="pt-2.5 border-t border-blue-200/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
            <div className="text-[#64748B] font-medium flex items-center gap-1.5">
              <span>Outros perfis com o mesmo formato girado:</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {filteredRotated.map((profile) => {
                const isProfLandscape = profile.expectedWidthMm! > profile.expectedHeightMm!;
                return (
                  <button
                    key={profile.id}
                    type="button"
                    onClick={() => onSelectProfile(profile)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 text-xs font-semibold shadow-2xs transition-all cursor-pointer"
                  >
                    <span>{profile.name.split("—")[0].trim()}</span>
                    <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-bold">
                      {isProfLandscape ? "HORIZONTAL" : "VERTICAL"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (isGeneric) {
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