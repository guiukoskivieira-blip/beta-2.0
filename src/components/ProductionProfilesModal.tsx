import React, { useState, useMemo } from 'react';
import { 
  X, 
  Search, 
  Sliders, 
  Check, 
  Plus, 
  Trash2
} from 'lucide-react';
import { 
  STANDARD_PROFILES, 
  ProductionProfile,
  COMMERCIAL_PRINT_300DPI_PROFILE,
  BUSINESS_CARD_90X50_PROFILE,
  BUSINESS_CARD_85X55_PROFILE,
  BADGE_PVC_85X54_PROFILE,
  FLYER_A6_PROFILE,
  FLYER_A5_PROFILE,
  A4_COMMERCIAL_FLYER_PROFILE,
  POSTER_A3_PROFILE,
  FOLDER_A4_OPEN_PROFILE,
  MENU_A4_PROFILE,
  MENU_A3_PROFILE,
  LARGE_FORMAT_BANNER_PROFILE
} from '../utils/productionProfiles';
import type { StoredProductionProfile } from '../domain/beta';
import {
  getLocalCustomProfiles,
  saveLocalCustomProfile,
  deleteLocalCustomProfile,
  validateCustomProfile,
} from '../utils/customProfilesStorage';
import { useModalAccessibility } from '../hooks/useModalAccessibility';

interface ProductionProfilesModalProps {
  initialDimensions?: { widthMm: number; heightMm: number } | null;
  isOpen: boolean;
  onClose: () => void;
  selectedProfile: ProductionProfile;
  onSelectProfile: (profile: ProductionProfile) => void;
  embedded?: boolean;
}

type CategoryTab = 'popular' | 'commercial' | 'large_format' | 'generic' | 'custom';

export const ProductionProfilesModal: React.FC<ProductionProfilesModalProps> = ({
  isOpen,
  onClose,
  selectedProfile,
  onSelectProfile,
  initialDimensions,
  embedded = false,
}) => {
  const { closeButtonRef, handleBackdropClick, handleContentClick } = useModalAccessibility({
    isOpen: isOpen && !embedded,
    onClose,
  });

  const [activeCategory, setActiveCategory] = useState<CategoryTab>('popular');
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreatingCustom, setIsCreatingCustom] = useState(false);

  // Custom profile form state
  const [customName, setCustomName] = useState('');
  const [customWidthMm, setCustomWidthMm] = useState<number>(100);
  const [customHeightMm, setCustomHeightMm] = useState<number>(100);

  React.useEffect(() => {
    if (isOpen && initialDimensions) {
      setCustomWidthMm(initialDimensions.widthMm);
      setCustomHeightMm(initialDimensions.heightMm);
      setIsCreatingCustom(true);
      setActiveCategory('custom');
    }
  }, [isOpen, initialDimensions]);
  const [customBleedMm, setCustomBleedMm] = useState<number>(3);
  const [customDpi, setCustomDpi] = useState<number>(300);
  const [customError, setCustomError] = useState<string | null>(null);

  const customProfiles = useMemo(() => getLocalCustomProfiles(), [isOpen, isCreatingCustom]);

  // Convert custom profiles to ProductionProfile format
  const convertedCustomProfiles: ProductionProfile[] = useMemo(() => {
    return customProfiles.map((p) => ({
      id: p.id,
      name: p.name,
      category: 'custom',
      description: 'Perfil personalizado configurado pela gráfica.',
      expectedWidthMm: p.rules.dimensions?.targetWidthMm !== undefined && p.rules.dimensions?.targetWidthMm !== null ? Number(p.rules.dimensions.targetWidthMm) : undefined,
      expectedHeightMm: p.rules.dimensions?.targetHeightMm !== undefined && p.rules.dimensions?.targetHeightMm !== null ? Number(p.rules.dimensions.targetHeightMm) : undefined,
      expectedBleedMm: p.rules.bleed?.requiredBleedMm !== undefined && p.rules.bleed?.requiredBleedMm !== null ? Number(p.rules.bleed.requiredBleedMm) : 3,
      minEffectiveDpi: Number(p.rules.dpi?.recommendedDpi) || 300,
      warningDpiThreshold: Number(p.rules.dpi?.criticalDpi) || 200,
      rgbPolicy: p.rules.colors?.rgbPolicy || 'error',
      recommendsPdfX: true,
    }));
  }, [customProfiles]);

  if (!isOpen) return null;

  // Search Normalization and Aliases
  const normalize = (str: string) =>
    str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  const normalizedQuery = normalize(searchQuery.trim());

  // Check alias matches
  const matchesSearch = (p: ProductionProfile) => {
    if (!normalizedQuery) return true;
    const nameNorm = normalize(p.name);
    const descNorm = normalize(p.description);
    const idNorm = normalize(p.id);

    if (nameNorm.includes(normalizedQuery) || descNorm.includes(normalizedQuery) || idNorm.includes(normalizedQuery)) {
      return true;
    }

    // Smart aliases
    if ((normalizedQuery.includes('cartao') || normalizedQuery.includes('visita')) && p.id.includes('business_card')) return true;
    if ((normalizedQuery.includes('cracha') || normalizedQuery.includes('pvc') || normalizedQuery.includes('id1')) && p.id.includes('badge')) return true;
    if ((normalizedQuery.includes('flyer') || normalizedQuery.includes('flayer') || normalizedQuery.includes('panfleto') || normalizedQuery.includes('folheto')) && (p.id.includes('flyer') || p.id.includes('a4'))) return true;
    if ((normalizedQuery.includes('folder') || normalizedQuery.includes('dobra')) && p.id.includes('folder')) return true;
    if ((normalizedQuery.includes('poster') || normalizedQuery.includes('cartaz')) && p.id.includes('poster')) return true;
    if ((normalizedQuery.includes('cardapio') || normalizedQuery.includes('menu')) && p.id.includes('menu')) return true;
    if ((normalizedQuery.includes('lona') || normalizedQuery.includes('banner')) && p.id.includes('banner')) return true;
    if (normalizedQuery.includes('a4') && (p.name.includes('A4') || p.expectedWidthMm === 210)) return true;
    if (normalizedQuery.includes('a5') && (p.name.includes('A5') || p.expectedWidthMm === 148)) return true;
    if (normalizedQuery.includes('a6') && (p.name.includes('A6') || p.expectedWidthMm === 105)) return true;
    if (normalizedQuery.includes('a3') && (p.name.includes('A3') || p.expectedWidthMm === 297)) return true;

    return false;
  };

  // Popular Presets
  const popularProfiles = [
    BUSINESS_CARD_90X50_PROFILE,
    FLYER_A5_PROFILE,
    A4_COMMERCIAL_FLYER_PROFILE,
    BADGE_PVC_85X54_PROFILE,
    MENU_A4_PROFILE,
    FOLDER_A4_OPEN_PROFILE,
    LARGE_FORMAT_BANNER_PROFILE,
  ].filter(Boolean);

  // Filter profiles based on category and search
  const filteredProfiles: ProductionProfile[] = (() => {
    if (normalizedQuery) {
      const all = [...STANDARD_PROFILES, ...convertedCustomProfiles];
      return all.filter(matchesSearch);
    }

    switch (activeCategory) {
      case 'popular':
        return popularProfiles;
      case 'commercial':
        return [
          BUSINESS_CARD_90X50_PROFILE,
          BUSINESS_CARD_85X55_PROFILE,
          BADGE_PVC_85X54_PROFILE,
          FLYER_A6_PROFILE,
          FLYER_A5_PROFILE,
          A4_COMMERCIAL_FLYER_PROFILE,
          POSTER_A3_PROFILE,
          FOLDER_A4_OPEN_PROFILE,
          MENU_A4_PROFILE,
          MENU_A3_PROFILE,
        ];
      case 'large_format':
        return [LARGE_FORMAT_BANNER_PROFILE];
      case 'generic':
        return [COMMERCIAL_PRINT_300DPI_PROFILE, LARGE_FORMAT_BANNER_PROFILE];
      case 'custom':
        return convertedCustomProfiles;
      default:
        return popularProfiles;
    }
  })();

  const handleSelect = (p: ProductionProfile) => {
    onSelectProfile(p);
    onClose();
  };

  const handleSaveCustom = (e: React.FormEvent) => {
    e.preventDefault();
    setCustomError(null);

    const newProfile: StoredProductionProfile = {
      id: `custom_${Date.now()}`,
      name: customName || 'Perfil Personalizado',
      category: 'custom',
      rules: {
        dimensions: {
          targetWidthMm: Number(customWidthMm),
          targetHeightMm: Number(customHeightMm),
        },
        dpi: {
          recommendedDpi: Number(customDpi),
          criticalDpi: Math.max(72, Number(customDpi) * 0.66),
        },
        bleed: {
          requiredBleedMm: Number(customBleedMm),
        },
        colors: {
          allowedModes: ['CMYK'],
          rgbPolicy: 'error',
        },
      },
    };

    const val = validateCustomProfile(newProfile);
    if (!val.valid) {
      setCustomError(val.errors.join(' '));
      return;
    }

    saveLocalCustomProfile(newProfile);
    setIsCreatingCustom(false);
    setCustomName('');

    // Immediately select the created profile
    const converted: ProductionProfile = {
      id: newProfile.id,
      name: newProfile.name,
      category: 'custom',
      description: 'Perfil personalizado configurado pela gráfica.',
      expectedWidthMm: Number(customWidthMm),
      expectedHeightMm: Number(customHeightMm),
      expectedBleedMm: Number(customBleedMm),
      minEffectiveDpi: Number(customDpi),
      warningDpiThreshold: Math.max(72, Number(customDpi) * 0.66),
      rgbPolicy: 'error',
      recommendsPdfX: true,
    };
    handleSelect(converted);
  };

  const handleDeleteCustom = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    deleteLocalCustomProfile(id);
  };

  return (
    <div
      className={embedded ? "w-full select-none" : "fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs select-none"}
      onClick={embedded ? undefined : handleBackdropClick}
      role={embedded ? undefined : "dialog"}
      aria-modal={embedded ? undefined : "true"}
      aria-labelledby="production-profiles-title"
    >
      <div
        className={embedded ? "bg-white rounded-3xl border border-slate-200 w-full shadow-sm flex flex-col min-h-[70vh] overflow-hidden" : "bg-white rounded-3xl border border-slate-200 w-full max-w-4xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150"}
        onClick={embedded ? undefined : handleContentClick}
      >
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-indigo-50 text-[#4F46E5] border border-indigo-100 shrink-0">
              <Sliders className="w-6 h-6" />
            </div>
            <div>
              <h2 id="production-profiles-title" className="text-xl font-black text-[#0F172A] tracking-tight">
                Biblioteca de Perfis de Produção
              </h2>
              <p className="text-xs text-[#64748B] font-medium">
                Selecione o produto gráfico alvo para calibração de corte, sangria, DPI e normas de impressão.
              </p>
            </div>
          </div>
          {!embedded && <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>}
        </div>

        {/* Search Bar & Categories */}
        <div className="p-6 border-b border-slate-100 bg-white space-y-4">
          {/* Search Input */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              type="text"
              placeholder="Buscar por produto (ex: cartão, flyer A5, cardápio, crachá, 90x50, A4)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3.5 top-3 text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Categories Bar */}
          {!searchQuery && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              {[
                { id: 'popular', label: 'Mais Usados' },
                { id: 'commercial', label: 'Impressos Comerciais' },
                { id: 'large_format', label: 'Comunicação Visual' },
                { id: 'generic', label: 'Perfis Genéricos' },
                { id: 'custom', label: `Meus Perfis (${customProfiles.length})` },
              ].map((tab) => {
                const isActive = activeCategory === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => { setActiveCategory(tab.id as any); setIsCreatingCustom(false); }}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                      isActive
                        ? 'bg-[#2563EB] text-white shadow-2xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Profiles Grid */}
        <div className="p-6 overflow-y-auto flex-1 bg-[#F8FAFC]">
          {isCreatingCustom ? (
            <form onSubmit={handleSaveCustom} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs space-y-4 max-w-xl mx-auto">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <h3 className="text-sm font-black text-[#0F172A] uppercase tracking-wider">Novo Perfil Personalizado</h3>
                <button
                  type="button"
                  onClick={() => setIsCreatingCustom(false)}
                  className="text-xs text-slate-500 hover:text-slate-700 font-bold"
                >
                  Voltar
                </button>
              </div>

              {customError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl">
                  {customError}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Nome do Produto</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Adesivo Redondo 100x100mm"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 border border-slate-300 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Largura Final (mm)</label>
                  <input
                    type="number"
                    step="0.1"
                    required
                    value={customWidthMm}
                    onChange={(e) => setCustomWidthMm(parseFloat(e.target.value))}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 border border-slate-300 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Altura Final (mm)</label>
                  <input
                    type="number"
                    step="0.1"
                    required
                    value={customHeightMm}
                    onChange={(e) => setCustomHeightMm(parseFloat(e.target.value))}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 border border-slate-300 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Sangria Mínima (mm)</label>
                  <input
                    type="number"
                    step="0.5"
                    required
                    value={customBleedMm}
                    onChange={(e) => setCustomBleedMm(parseFloat(e.target.value))}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 border border-slate-300 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">DPI Mínimo Recomendado</label>
                  <input
                    type="number"
                    required
                    value={customDpi}
                    onChange={(e) => setCustomDpi(parseInt(e.target.value, 10))}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 border border-slate-300 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreatingCustom(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-xl shadow-xs transition-all"
                >
                  Salvar e Usar Perfil
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-4">
              {/* Quick custom creation CTA */}
              <div className="flex items-center justify-between pb-1">
                <span className="text-xs font-bold text-slate-500">
                  {filteredProfiles.length} opção(ões) disponível(is)
                </span>
                <button
                  type="button"
                  onClick={() => setIsCreatingCustom(true)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-indigo-50 hover:text-[#4F46E5] text-xs font-bold text-slate-700 transition-all cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ Criar Gabarito Personalizado</span>
                </button>
              </div>

              {filteredProfiles.length === 0 ? (
                <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 text-slate-500 text-xs">
                  Nenhum perfil encontrado para a busca informada.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {filteredProfiles.map((p) => {
                    const isSelected = selectedProfile.id === p.id;
                    const hasDimensions = p.expectedWidthMm && p.expectedHeightMm;

                    return (
                      <div
                        key={p.id}
                        onClick={() => handleSelect(p)}
                        className={`p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between group select-none ${
                          isSelected
                            ? 'bg-gradient-to-br from-indigo-50/60 to-white border-[#2563EB] ring-2 ring-blue-500/20 shadow-xs'
                            : 'bg-white hover:bg-slate-50/80 border-slate-200/90 shadow-2xs hover:border-slate-300'
                        }`}
                      >
                        <div className="space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <span className="text-xs font-black text-[#0F172A] block group-hover:text-[#2563EB] transition-colors">
                                {p.name}
                              </span>
                              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                {hasDimensions ? (
                                  <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 text-[10px] font-bold border border-blue-100">
                                    {p.expectedWidthMm} × {p.expectedHeightMm} mm
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[10px] font-bold">
                                    Formato Variável
                                  </span>
                                )}

                                <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[10px] font-bold">
                                  Sangria: {p.expectedBleedMm ?? 0} mm
                                </span>

                                <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[10px] font-bold">
                                  {p.minEffectiveDpi} DPI
                                </span>
                              </div>
                            </div>

                            {isSelected && (
                              <div className="w-6 h-6 rounded-full bg-[#2563EB] text-white flex items-center justify-center shrink-0 shadow-xs">
                                <Check className="w-3.5 h-3.5 stroke-[3]" />
                              </div>
                            )}
                          </div>

                          <p className="text-[11px] text-[#64748B] leading-relaxed line-clamp-2">
                            {p.description}
                          </p>

                          {p.isGeneric && (
                            <p className="text-[10px] text-amber-700 bg-amber-50/80 p-2 rounded-xl border border-amber-100/80 font-medium">
                              ⚠️ Formato final não definido. Análise técnica disponível, mas correções geométricas exigem largura e altura fixas.
                            </p>
                          )}
                        </div>

                        {p.category === 'custom' && (
                          <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
                            <span className="text-slate-400 font-medium">Perfil da gráfica</span>
                            <button
                              type="button"
                              onClick={(e) => handleDeleteCustom(e, p.id)}
                              className="text-slate-400 hover:text-rose-600 p-1"
                              title="Excluir perfil"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
