import React from 'react';
import { Loader2, CheckCircle2, AlertCircle, Sparkles } from 'lucide-react';

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
        <div className="w-14 h-14 mx-auto rounded-2xl bg-[#FEE2E2] border border-red-200 flex items-center justify-center text-[#B91C1C] mb-4">
          <AlertCircle className="w-7 h-7" />
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
              className="px-6 py-2.5 bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-xs sm:text-sm rounded-xl transition-all shadow-xs cursor-pointer"
            >
              Tentar Novamente
            </button>
          )}
          {onUpgrade && (
            <button
              type="button"
              onClick={onUpgrade}
              className="px-6 py-2.5 bg-gradient-to-r from-[#0066FF] to-[#7C3AED] hover:opacity-95 text-white font-bold text-xs sm:text-sm rounded-xl transition-all shadow-xs inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              <span>Fazer Upgrade</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-xl mx-auto my-12 p-8 bg-white border border-slate-200/90 rounded-3xl text-center shadow-xs select-none">
      <div className="w-14 h-14 mx-auto rounded-2xl bg-[#EFF6FF] border border-[#BFDBFE] flex items-center justify-center text-[#2563EB] mb-4">
        <Loader2 className="w-7 h-7 animate-spin" />
      </div>

      <h3 className="text-xl font-black text-[#0F172A] mb-2 tracking-tight">
        Analisando Arquivo
      </h3>
      <p className="text-xs sm:text-sm text-[#64748B] mb-8 font-medium">
        Executando inspeção detalhada conforme normas ISO e perfil gráfico calibrado.
      </p>

      <div className="space-y-4 max-w-md mx-auto text-left">
        {steps.map((step, index) => {
          const isDone = index < currentIndex;
          const isCurrent = index === currentIndex;

          return (
            <div key={step.id} className="flex items-center space-x-3">
              <div className="shrink-0">
                {isDone ? (
                  <CheckCircle2 className="w-5 h-5 text-[#059669]" />
                ) : isCurrent ? (
                  <Loader2 className="w-5 h-5 text-[#2563EB] animate-spin" />
                ) : (
                  <div className="w-5 h-5 rounded-full border-2 border-slate-300" />
                )}
              </div>
              <span
                className={`text-xs font-semibold ${
                  isDone
                    ? 'text-[#059669]'
                    : isCurrent
                    ? 'text-[#0F172A]'
                    : 'text-[#94A3B8]'
                }`}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
