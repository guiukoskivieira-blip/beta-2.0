import React from 'react';
import { Loader2, CheckCircle2, AlertCircle, Crown } from 'lucide-react';

interface ProcessingStateProps {
  status: 'uploading' | 'extracting' | 'analyzing' | 'error';
  errorMessage?: string;
  onRetry?: () => void;
  onUpgrade?: () => void;
}

export const ProcessingState: React.FC<ProcessingStateProps> = ({
  status,
  errorMessage,
  onRetry,
  onUpgrade,
}) => {
  const steps = [
    { id: 'uploading', label: 'Envio seguro em memória (Zero Storage)' },
    { id: 'extracting', label: 'Extração estrutural determinística de objetos' },
    { id: 'analyzing', label: 'Avaliação das regras de pré-impressão' },
  ];

  const getCurrentStepIndex = () => {
    switch (status) {
      case 'uploading': return 0;
      case 'extracting': return 1;
      case 'analyzing': return 2;
      default: return 0;
    }
  };

  const currentIndex = getCurrentStepIndex();

  if (status === 'error') {
    const isEncrypted =
      errorMessage?.toLowerCase().includes('criptografia') ||
      errorMessage?.toLowerCase().includes('protegido') ||
      errorMessage?.toLowerCase().includes('senha') ||
      errorMessage?.includes('PDF_ENCRYPTED');

    return (
      <div className="w-full max-w-2xl mx-auto my-12 p-8 bg-white border border-red-200 rounded-3xl text-center shadow-xs select-none">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-[#FEE2E2] text-[#EF4444] flex items-center justify-center mb-4 shadow-2xs">
          <AlertCircle className="w-7 h-7 stroke-[2]" />
        </div>
        <h3 className="text-xl font-black text-[#0F172A] mb-2 tracking-tight">
          {isEncrypted ? 'PDF Protegido por Senha' : 'Falha no Processamento'}
        </h3>
        <p className="text-xs sm:text-sm text-[#64748B] mb-6 max-w-md mx-auto leading-relaxed">
          {errorMessage || 'Ocorreu um erro ao processar e avaliar o arquivo PDF.'}
        </p>
        <div className="flex items-center justify-center gap-3">
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="px-6 py-2.5 bg-gradient-to-r from-[#0066FF] to-[#7C3AED] hover:opacity-95 text-white font-bold text-xs sm:text-sm rounded-xl transition-all shadow-md shadow-indigo-500/20 cursor-pointer"
            >
              Tentar Novamente
            </button>
          )}
          {onUpgrade && (
            <button
              type="button"
              onClick={onUpgrade}
              className="px-6 py-2.5 bg-gradient-to-r from-[#A855F7] to-[#7C3AED] hover:opacity-95 text-white font-bold text-xs sm:text-sm rounded-xl transition-all shadow-md inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Crown className="w-4 h-4" />
              <span>Fazer Upgrade</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl mx-auto my-12 p-8 bg-white border border-slate-200/90 rounded-3xl text-center shadow-xs select-none">
      <div className="w-14 h-14 mx-auto rounded-2xl bg-[#EFF6FF] text-[#2563EB] flex items-center justify-center mb-6 shadow-2xs">
        <Loader2 className="w-7 h-7 animate-spin stroke-[2.5]" />
      </div>

      <h3 className="text-xl font-black text-[#0F172A] mb-1 tracking-tight">Analisando Arquivo PDF</h3>
      <p className="text-xs sm:text-sm text-[#64748B] mb-8 font-medium">
        Executando preflight determinístico e checagem dimensional.
      </p>

      <div className="space-y-3 max-w-md mx-auto text-left">
        {steps.map((step, idx) => {
          const isDone = idx < currentIndex;
          const isCurrent = idx === currentIndex;

          return (
            <div
              key={step.id}
              className={`flex items-center space-x-3.5 p-3.5 rounded-2xl border transition-all ${
                isCurrent
                  ? 'border-[#2563EB] bg-[#EFF6FF] text-[#0F172A] font-semibold shadow-2xs'
                  : isDone
                  ? 'border-[#10B981]/30 bg-[#ECFDF5] text-[#059669]'
                  : 'border-slate-100 bg-slate-50 text-[#94A3B8]'
              }`}
            >
              {isDone ? (
                <CheckCircle2 className="w-5 h-5 text-[#10B981] shrink-0" />
              ) : isCurrent ? (
                <Loader2 className="w-5 h-5 text-[#2563EB] animate-spin shrink-0" />
              ) : (
                <div className="w-5 h-5 rounded-full border border-slate-300 shrink-0 flex items-center justify-center text-[10px] font-bold text-slate-400">
                  {idx + 1}
                </div>
              )}
              <span className="text-xs sm:text-sm font-medium">{step.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
