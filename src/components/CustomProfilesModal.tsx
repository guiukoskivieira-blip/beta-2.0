import React, { useState } from 'react';
import { X, Plus, Trash2, CheckCircle2, Sliders, Ruler, Droplet, Layers } from 'lucide-react';
import type { StoredProductionProfile } from '../domain/beta';
import {
  getLocalCustomProfiles,
  saveLocalCustomProfile,
  deleteLocalCustomProfile,
  validateCustomProfile,
} from '../utils/customProfilesStorage';
import { useModalAccessibility } from '../hooks/useModalAccessibility';

interface CustomProfilesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectProfile?: (profile: StoredProductionProfile) => void;
}

export const CustomProfilesModal: React.FC<CustomProfilesModalProps> = ({
  isOpen,
  onClose,
  onSelectProfile,
}) => {
  const { closeButtonRef, handleBackdropClick, handleContentClick } = useModalAccessibility({
    isOpen,
    onClose,
  });

  const [profiles, setProfiles] = useState<StoredProductionProfile[]>(() => getLocalCustomProfiles());
  const [isCreating, setIsCreating] = useState(false);
  const [name, setName] = useState('');
  const [widthMm, setWidthMm] = useState<number>(210);
  const [heightMm, setHeightMm] = useState<number>(297);
  const [bleedMm, setBleedMm] = useState<number>(3);
  const [dpi, setDpi] = useState<number>(300);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const newProfile: StoredProductionProfile = {
      id: `custom_${Date.now()}`,
      name,
      category: 'custom',
      rules: {
        dimensions: {
          targetWidthMm: Number(widthMm),
          targetHeightMm: Number(heightMm),
        },
        dpi: {
          recommendedDpi: Number(dpi),
          criticalDpi: Math.max(72, Number(dpi) * 0.66),
        },
        bleed: {
          requiredBleedMm: Number(bleedMm),
        },
        colors: {
          allowedModes: ['CMYK'],
          rgbPolicy: 'error',
        },
      },
    };

    const val = validateCustomProfile(newProfile);
    if (!val.valid) {
      setErrorMsg(val.errors.join(' '));
      return;
    }

    saveLocalCustomProfile(newProfile);
    setProfiles(getLocalCustomProfiles());
    setIsCreating(false);
    setName('');
  };

  const handleDelete = (id: string) => {
    deleteLocalCustomProfile(id);
    setProfiles(getLocalCustomProfiles());
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs select-none"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="custom-profiles-title"
    >
      <div
        className="bg-white rounded-3xl border border-slate-200 w-full max-w-xl p-6 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        onClick={handleContentClick}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-indigo-50 text-[#4F46E5] border border-indigo-100 shrink-0">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h3 id="custom-profiles-title" className="text-lg font-black text-[#0F172A] tracking-tight">
                Perfis de Produção Personalizados
              </h3>
              <p className="text-xs text-[#64748B] font-medium">
                Configure gabaritos de cortes, sangrias e exigências de DPI da sua gráfica.
              </p>
            </div>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {errorMsg && (
          <div className="my-3 text-xs text-rose-700 bg-rose-50 border border-rose-200 p-3 rounded-xl">
            {errorMsg}
          </div>
        )}

        {/* Content list / Form */}
        <div className="py-4 overflow-y-auto flex-1 space-y-4">
          {!isCreating ? (
            <>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700">Perfis cadastrados ({profiles.length})</span>
                <button
                  type="button"
                  onClick={() => setIsCreating(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-bold shadow-2xs transition-all cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Novo Perfil</span>
                </button>
              </div>

              {profiles.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-xs bg-slate-50 rounded-2xl border border-slate-200/80">
                  Nenhum perfil personalizado criado ainda. Utilize o botão acima para cadastrar novos gabaritos.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {profiles.map((p) => (
                    <div
                      key={p.id}
                      className="p-4 rounded-2xl bg-slate-50/70 border border-slate-200/80 flex items-center justify-between gap-3 shadow-2xs"
                    >
                      <div className="space-y-1">
                        <span className="text-xs font-bold text-[#0F172A] block">{p.name}</span>
                        <div className="flex items-center gap-3 text-[11px] text-[#64748B]">
                          <span>{p.rules.dimensions?.targetWidthMm} × {p.rules.dimensions?.targetHeightMm} mm</span>
                          <span>•</span>
                          <span>Sangria: {p.rules.bleed?.requiredBleedMm} mm</span>
                          <span>•</span>
                          <span>DPI mín: {p.rules.dpi?.recommendedDpi}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {onSelectProfile && (
                          <button
                            type="button"
                            onClick={() => { onSelectProfile(p); onClose(); }}
                            className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 text-xs font-bold text-[#2563EB] shadow-2xs transition-colors cursor-pointer"
                          >
                            Usar
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDelete(p.id)}
                          className="p-1.5 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                          title="Excluir perfil"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <form onSubmit={handleSave} className="space-y-4 bg-slate-50 p-4 rounded-2xl border border-slate-200/80">
              <h4 className="text-xs font-black uppercase tracking-wider text-[#0F172A]">Cadastrar Novo Perfil</h4>
              
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Nome do Perfil</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Cartão de Visita 90x50mm"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-white border border-slate-300 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Largura (mm)</label>
                  <input
                    type="number"
                    step="0.1"
                    required
                    value={widthMm}
                    onChange={(e) => setWidthMm(parseFloat(e.target.value))}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-white border border-slate-300 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Altura (mm)</label>
                  <input
                    type="number"
                    step="0.1"
                    required
                    value={heightMm}
                    onChange={(e) => setHeightMm(parseFloat(e.target.value))}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-white border border-slate-300 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Sangria Obrigatória (mm)</label>
                  <input
                    type="number"
                    step="0.5"
                    required
                    value={bleedMm}
                    onChange={(e) => setBleedMm(parseFloat(e.target.value))}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-white border border-slate-300 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">DPI Mínimo Recomendado</label>
                  <input
                    type="number"
                    required
                    value={dpi}
                    onChange={(e) => setDpi(parseInt(e.target.value, 10))}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-white border border-slate-300 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="px-3 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-200 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-bold shadow-xs transition-all"
                >
                  Salvar Perfil
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
