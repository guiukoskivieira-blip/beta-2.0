import React from 'react';
import { FileText, X, ArrowRight, Loader2 } from 'lucide-react';
import { formatBytes } from '../../server/pdfExtractor';

interface FileSelectedProps {
  file: File;
  onClear: () => void;
  onAnalyze: () => void;
  isLoading?: boolean;
}

export const FileSelected: React.FC<FileSelectedProps> = ({
  file,
  onClear,
  onAnalyze,
  isLoading = false,
}) => {
  return (
    <div className="w-full my-6 select-none">
      <div className="bg-white border border-slate-200/90 rounded-3xl p-6 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center space-x-4 w-full sm:w-auto">
          <div className="w-12 h-12 rounded-2xl bg-[#EFF6FF] text-[#2563EB] flex items-center justify-center shrink-0 shadow-2xs">
            <FileText className="w-6 h-6 stroke-[2]" />
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="text-base font-extrabold text-[#0F172A] truncate max-w-[280px] sm:max-w-md">
              {file.name}
            </h4>
            <p className="text-xs text-[#64748B] font-medium mt-0.5">
              {formatBytes(file.size)} • Documento PDF
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3 w-full sm:w-auto justify-end">
          <button
            type="button"
            onClick={onClear}
            disabled={isLoading}
            className="p-2 text-[#94A3B8] hover:text-[#0F172A] hover:bg-slate-100 rounded-xl transition-colors disabled:opacity-50 cursor-pointer"
            title="Remover arquivo"
          >
            <X className="w-5 h-5" />
          </button>

          <button
            type="button"
            onClick={onAnalyze}
            disabled={isLoading}
            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-[#0066FF] via-[#5B21B6] to-[#7C3AED] hover:opacity-95 text-white font-bold text-xs sm:text-sm transition-all shadow-md shadow-indigo-500/20 active:scale-[0.98] disabled:opacity-50 cursor-pointer"
          >
            {isLoading ? (
              <span className="inline-flex items-center">
                <Loader2 className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" />
                Processando...
              </span>
            ) : (
              <>
                <span>Iniciar Análise</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
