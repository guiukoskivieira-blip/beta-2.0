import React from 'react';
import { X, Info, ShieldCheck, Cpu } from 'lucide-react';

interface AboutBetaModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AboutBetaModal: React.FC<AboutBetaModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs select-none">
      <div className="bg-white rounded-3xl border border-slate-200 w-full max-w-lg p-6 shadow-2xl relative animate-in fade-in zoom-in-95 duration-150">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-5 right-5 text-slate-400 hover:text-slate-600 p-1.5 rounded-xl hover:bg-slate-100 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="mb-5 flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-indigo-50 text-[#4F46E5] border border-indigo-100">
            <Info className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-black text-[#0F172A] tracking-tight">
              Sobre o ArteCheck IA
            </h3>
            <p className="text-xs text-[#64748B] font-medium mt-0.5">
              Plataforma de validação técnica determinística de PDF para a indústria gráfica.
            </p>
          </div>
        </div>

        <div className="space-y-3.5 text-xs text-[#334155] leading-relaxed">
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-1">
            <h4 className="font-bold text-[#0F172A] flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              Zero Armazenamento Permanente
            </h4>
            <p className="text-[#64748B]">
              Seus arquivos PDF são inspecionados em buffers de memória volátil e descartados imediatamente após a extração da estrutura geométrica. Nenhuma arte gráfica de cliente é mantida em disco.
            </p>
          </div>

          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-1">
            <h4 className="font-bold text-[#0F172A] flex items-center gap-1.5">
              <Cpu className="w-4 h-4 text-[#2563EB]" />
              Motor Determinístico de Regras
            </h4>
            <p className="text-[#64748B]">
              A validação de caixas de corte (MediaBox, TrimBox, BleedBox), espaços de cor (CMYK/RGB/Spot) e resolução efetiva (DPI) é calculada por fórmulas matemáticas exatas, sem alucinações.
            </p>
          </div>

          <p className="text-[11px] text-[#94A3B8] text-center pt-2 font-medium">
            ArteCheck IA • Agente de Impressão • Desenvolvido para Gráficas e Agências
          </p>
        </div>
      </div>
    </div>
  );
};
