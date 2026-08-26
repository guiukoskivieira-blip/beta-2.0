import React from 'react';
import { RotateCcw, X, Check, Loader2 } from 'lucide-react';
import { useModalAccessibility } from '../hooks/useModalAccessibility';

interface RotateConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isFixingInProgress?: boolean;
  sourceWidthMm: number;
  sourceHeightMm: number;
  targetWidthMm: number;
  targetHeightMm: number;
}

export const RotateConfirmationModal: React.FC<RotateConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  isFixingInProgress = false,
  sourceWidthMm,
  sourceHeightMm,
  targetWidthMm,
  targetHeightMm,
}) => {
  const { closeButtonRef, handleBackdropClick, handleContentClick } = useModalAccessibility({
    isOpen,
    onClose,
    isProcessing: isFixingInProgress,
  });

  if (!isOpen) return null;

  const sourceOrientation = sourceWidthMm > sourceHeightMm ? 'Horizontal' : 'Vertical';
  const targetOrientation = targetWidthMm > targetHeightMm ? 'Horizontal' : 'Vertical';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="rotate-confirmation-title"
    >
      <div
        className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden"
        onClick={handleContentClick}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 bg-gradient-to-r from-amber-50/50 to-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 text-amber-600 flex items-center justify-center shrink-0">
              <RotateCcw className="w-5 h-5" />
            </div>
            <div>
              <h2 id="rotate-confirmation-title" className="text-base font-bold text-slate-900">
                Girar página 90°?
              </h2>
              <p className="text-xs text-slate-500">Ajuste de orientação geométrica do documento</p>
            </div>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            disabled={isFixingInProgress}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {/* Estado Atual */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                Arquivo Atual
              </span>
              <div className="text-sm font-bold text-slate-800">
                {sourceWidthMm.toFixed(0)} × {sourceHeightMm.toFixed(0)} mm
              </div>
              <span className="inline-block mt-1 px-2 py-0.5 rounded-md bg-slate-200/60 text-slate-700 text-[10px] font-semibold">
                {sourceOrientation}
              </span>
            </div>

            {/* Resultado Esperado */}
            <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200/80">
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 block mb-1">
                Resultado
              </span>
              <div className="text-sm font-bold text-amber-900">
                {targetWidthMm} × {targetHeightMm} mm
              </div>
              <span className="inline-block mt-1 px-2 py-0.5 rounded-md bg-amber-200/70 text-amber-900 text-[10px] font-semibold">
                {targetOrientation}
              </span>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-2">
            <div className="flex items-start gap-2.5">
              <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 mt-0.5">
                <Check className="w-3 h-3 stroke-[3]" />
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                A arte será rotacionada de forma vetorial e determinística via pdf-lib, preservando todos os textos, vetores, imagens e fontes sem distorção.
              </p>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 bg-slate-50 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            disabled={isFixingInProgress}
            className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 hover:text-slate-900 text-xs font-semibold transition-all cursor-pointer disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isFixingInProgress}
            className="px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 active:scale-[0.98] text-white text-xs font-bold shadow-xs transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {isFixingInProgress ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Girando documento...</span>
              </>
            ) : (
              <>
                <RotateCcw className="w-4 h-4" />
                <span>Girar página</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
