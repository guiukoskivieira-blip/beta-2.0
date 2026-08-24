import React from 'react';
import { ShieldCheck } from 'lucide-react';

export const Footer: React.FC = () => {
  return (
    <footer className="w-full border-t border-slate-200/80 bg-white py-6 px-6 sm:px-8 mt-auto select-none">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between text-xs text-[#64748B] gap-4">
        <div className="flex items-center space-x-2">
          <ShieldCheck className="w-4 h-4 text-[#059669]" />
          <span className="font-semibold text-[#334155]">ArteCheck • Agente de Impressão & Pré-impressão Comercial</span>
        </div>
        <p className="text-[11px] text-[#94A3B8] font-medium">
          Processamento seguro e volátil em memória. Em conformidade com ISO 12647 e normas PDF/X.
        </p>
      </div>
    </footer>
  );
};
