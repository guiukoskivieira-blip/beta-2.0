import React from 'react';
import { FileText, X, ArrowRight, Loader2, Sliders, CheckCircle2, Ruler, Crop, Eye, Sparkles } from 'lucide-react';
import { formatBytes } from '../../server/pdfExtractor';
import type { ProductionProfile } from '../utils/productionProfiles';
import { COMMERCIAL_PRINT_300DPI_PROFILE } from '../utils/productionProfiles';

interface FileSelectedProps {
  file: File;
  onClear: () => void;
  onAnalyze: () => void;
  isLoading?: boolean;
  selectedProfile: ProductionProfile;
  onOpenProfilesModal: () => void;
  onSelectProfile?: (profile: ProductionProfile) => void;
}

export const FileSelected: React.FC<FileSelectedProps> = ({
  file,
  onClear,
  onAnalyze,
  isLoading = false,
  selectedProfile,
  onOpenProfilesModal,
  onSelectProfile,
}) => {
  const isGeneric = Boolean(
    selectedProfile.isGeneric ||
    (!selectedProfile.expectedWidthMm && !selectedProfile.expectedHeightMm)
  );

  return (
    <div className="w-full max-w-4xl mx-auto my-6 px-4 select-none animate-in fade-in zoom-in-95 duration-200">
      <div className="bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-8 shadow-md space-y-6">
        {/* Top: File Information */}
        <div className="flex items-center justify-between gap-4 pb-5 border-b border-slate-100">
          <div className="flex items-center space-x-4 min-w-0">
            <div className="w-12 h-12 rounded-2xl bg-[#EFF6FF] border border-[#BFDBFE] flex items-center justify-center text-[#2563EB] shrink-0 shadow-xs">
              <FileText className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-md bg-[#EF4444] text-white text-[10px] font-black uppercase tracking-wider">
                  PDF
                </span>
                <h4 className="text-base sm:text-lg font-black text-[#0F172A] truncate max-w-xs sm:max-w-md">
                  {file.name}
                </h4>
              </div>
              <p className="text-xs text-[#64748B] font-medium mt-0.5">
                {formatBytes(file.size)} • Pronto para pré-impressão
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClear}
            disabled={isLoading}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors disabled:opacity-50 cursor-pointer shrink-0"
            title="Remover arquivo"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Middle: Production Profile Selection Contract */}
        <div className="p-5 rounded-2xl bg-gradient-to-br from-indigo-50/50 via-slate-50 to-white border border-indigo-100/80 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-700 block">
                Perfil de Produção da Análise
              </span>
              <h3 className="text-base font-black text-[#0F172A] mt-0.5">
                {selectedProfile.name}
              </h3>
            </div>

            <button
              type="button"
              onClick={onOpenProfilesModal}
              disabled={isLoading}
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-white hover:bg-indigo-50 text-indigo-700 border border-indigo-200 text-xs font-bold shadow-2xs hover:shadow-xs transition-all cursor-pointer disabled:opacity-50 self-start sm:self-auto"
            >
              <Sliders className="w-3.5 h-3.5 text-indigo-600" />
              <span>Escolher outro perfil</span>
            </button>
          </div>

          {/* Profile Contract Summary Tags */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
            <div className="p-2.5 rounded-xl bg-white border border-slate-200/80 shadow-2xs">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
                <Ruler className="w-3.5 h-3.5 text-blue-600" />
                <span>Formato</span>
              </div>
              <div className="text-xs font-black text-[#0F172A] mt-1 truncate">
                {selectedProfile.expectedWidthMm && selectedProfile.expectedHeightMm
                  ? `${selectedProfile.expectedWidthMm} × ${selectedProfile.expectedHeightMm} mm`
                  : 'Formato Livre'}
              </div>
            </div>

            <div className="p-2.5 rounded-xl bg-white border border-slate-200/80 shadow-2xs">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
                <Crop className="w-3.5 h-3.5 text-emerald-600" />
                <span>Sangria</span>
              </div>
              <div className="text-xs font-black text-[#0F172A] mt-1">
                {selectedProfile.expectedBleedMm !== undefined ? `${selectedProfile.expectedBleedMm} mm` : 'Sem restrição'}
              </div>
            </div>

            <div className="p-2.5 rounded-xl bg-white border border-slate-200/80 shadow-2xs">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
                <Eye className="w-3.5 h-3.5 text-amber-600" />
                <span>DPI Mínimo</span>
              </div>
              <div className="text-xs font-black text-[#0F172A] mt-1">
                {selectedProfile.minEffectiveDpi} DPI
              </div>
            </div>

            <div className="p-2.5 rounded-xl bg-white border border-slate-200/80 shadow-2xs">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
                <CheckCircle2 className="w-3.5 h-3.5 text-purple-600" />
                <span>Padrão de Cor</span>
              </div>
              <div className="text-xs font-black text-[#0F172A] mt-1">
                CMYK / PDF/X-4
              </div>
            </div>
          </div>

          {/* Quick link to generic profile if a specific one is selected */}
          {!isGeneric && onSelectProfile && (
            <div className="flex items-center justify-end pt-1">
              <button
                type="button"
                onClick={() => onSelectProfile(COMMERCIAL_PRINT_300DPI_PROFILE)}
                disabled={isLoading}
                className="text-[11px] font-semibold text-slate-500 hover:text-indigo-600 underline cursor-pointer"
              >
                Usar análise geral sem formato fixo
              </button>
            </div>
          )}
        </div>

        {/* Bottom CTA Action Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
          <p className="text-xs text-[#64748B] font-medium text-center sm:text-left">
            O Motor 1 avaliará este arquivo estritamente contra as especificações do perfil selecionado.
          </p>

          <button
            type="button"
            onClick={onAnalyze}
            disabled={isLoading}
            className="w-full sm:w-auto inline-flex items-center justify-center px-8 py-3 rounded-2xl bg-gradient-to-r from-[#0066FF] via-[#5B21B6] to-[#7C3AED] hover:opacity-95 text-white font-black text-sm transition-all shadow-md shadow-indigo-500/25 active:scale-[0.98] disabled:opacity-50 cursor-pointer"
          >
            {isLoading ? (
              <span className="inline-flex items-center">
                <Loader2 className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" />
                Analisando arquivo...
              </span>
            ) : (
              <span className="inline-flex items-center">
                Analisar arquivo
                <ArrowRight className="w-4 h-4 ml-2 stroke-[2.5]" />
              </span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
