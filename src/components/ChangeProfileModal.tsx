import React, { useState, useEffect } from 'react';
import { X, Sliders, ArrowRight, ShieldCheck } from 'lucide-react';
import type { ProductionProfile } from '../utils/productionProfiles';
import { STANDARD_PROFILES, COMMERCIAL_PRINT_300DPI_PROFILE } from '../utils/productionProfiles';
import { getLocalCustomProfiles } from '../utils/customProfilesStorage';
import { useModalAccessibility } from '../hooks/useModalAccessibility';

interface ChangeProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentProfile: ProductionProfile;
  onConfirmChange: (newProfile: ProductionProfile) => void;
  onOpenFullLibrary: () => void;
}

export const ChangeProfileModal: React.FC<ChangeProfileModalProps> = ({
  isOpen,
  onClose,
  currentProfile,
  onConfirmChange,
  onOpenFullLibrary,
}) => {
  const [selectedNewProfile, setSelectedNewProfile] = useState<ProductionProfile>(currentProfile);

  const { closeButtonRef, handleBackdropClick, handleContentClick } = useModalAccessibility({
    isOpen,
    onClose,
  });

  useEffect(() => {
    if (isOpen) {
      setSelectedNewProfile(currentProfile);
    }
  }, [isOpen, currentProfile]);

  if (!isOpen) return null;

  // Combine standard and custom profiles for quick selector
  const customList = getLocalCustomProfiles().map((p) => ({
    id: p.id,
    name: p.name,
    category: 'custom' as const,
    description: 'Perfil personalizado',
    expectedWidthMm: p.rules.dimensions?.targetWidthMm !== undefined ? Number(p.rules.dimensions.targetWidthMm) : undefined,
    expectedHeightMm: p.rules.dimensions?.targetHeightMm !== undefined ? Number(p.rules.dimensions.targetHeightMm) : undefined,
    expectedBleedMm: p.rules.bleed?.requiredBleedMm !== undefined ? Number(p.rules.bleed.requiredBleedMm) : 3,
    minEffectiveDpi: Number(p.rules.dpi?.recommendedDpi) || 300,
    warningDpiThreshold: Number(p.rules.dpi?.criticalDpi) || 200,
    rgbPolicy: 'error' as const,
    recommendsPdfX: true,
  }));

  const allAvailableProfiles = [
    COMMERCIAL_PRINT_300DPI_PROFILE,
    ...STANDARD_PROFILES.filter((p) => p.id !== COMMERCIAL_PRINT_300DPI_PROFILE.id),
    ...customList,
  ];

  const handleConfirm = () => {
    onConfirmChange(selectedNewProfile);
    onClose();
  };

  const isSame = selectedNewProfile.id === currentProfile.id;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs select-none animate-in fade-in duration-200"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="change-profile-title"
    >
      <div
        className="bg-white rounded-3xl border border-slate-200/90 shadow-2xl max-w-lg w-full overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={handleContentClick}
      >
        {/* Header */}
        <div className="p-6 bg-gradient-to-br from-indigo-50/70 via-slate-50 to-white border-b border-slate-100 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-[#4F46E5] text-white shadow-md shadow-indigo-500/20 shrink-0">
              <Sliders className="w-6 h-6" />
            </div>
            <div>
              <h3 id="change-profile-title" className="text-lg font-black text-[#0F172A] tracking-tight">
                Alterar Perfil da Análise
              </h3>
              <p className="text-xs text-[#64748B] font-medium mt-0.5">
                Reavaliação do arquivo de trabalho contra um novo contrato
              </p>
            </div>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          {/* Current Profile Card */}
          <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
              Perfil Atual da Análise
            </span>
            <div className="flex items-center justify-between">
              <span className="text-sm font-black text-[#0F172A]">
                {currentProfile.name}
              </span>
              <span className="px-2 py-0.5 rounded-md bg-slate-200 text-slate-700 text-[10px] font-bold">
                {currentProfile.expectedWidthMm && currentProfile.expectedHeightMm
                  ? `${currentProfile.expectedWidthMm} × ${currentProfile.expectedHeightMm} mm`
                  : 'Formato Livre'}
              </span>
            </div>
          </div>

          {/* New Profile Selection */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="select-new-profile" className="text-xs font-bold text-[#0F172A]">
                Selecione o Novo Perfil de Produção:
              </label>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenFullLibrary();
                }}
                className="text-[11px] font-bold text-[#2563EB] hover:underline cursor-pointer"
              >
                Abrir biblioteca completa
              </button>
            </div>

            <select
              id="select-new-profile"
              value={selectedNewProfile.id}
              onChange={(e) => {
                const found = allAvailableProfiles.find((p) => p.id === e.target.value);
                if (found) setSelectedNewProfile(found);
              }}
              className="w-full px-4 py-2.5 rounded-2xl bg-slate-50 border border-slate-300 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all cursor-pointer"
            >
              {allAvailableProfiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} {p.expectedWidthMm && p.expectedHeightMm ? `(${p.expectedWidthMm} × ${p.expectedHeightMm} mm)` : '(Formato Livre)'}
                </option>
              ))}
            </select>
          </div>

          {/* Guarantee / Rules Notice */}
          <div className="p-3.5 rounded-2xl bg-blue-50/80 border border-blue-200/80 text-xs text-blue-900 flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-bold">Garantia de Integridade</span>
              <p className="text-blue-800 text-[11px] leading-relaxed">
                O arquivo de trabalho atual será reavaliado pelo Motor 1 contra os requisitos do novo perfil. Nenhuma modificação nos bytes do PDF será aplicada automaticamente.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-200 transition-colors cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isSame}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#0066FF] to-[#7C3AED] hover:opacity-95 text-white font-bold text-xs shadow-md shadow-indigo-500/20 active:scale-[0.98] transition-all disabled:opacity-40 cursor-pointer flex items-center gap-2"
          >
            <span>Alterar e reanalisar</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
