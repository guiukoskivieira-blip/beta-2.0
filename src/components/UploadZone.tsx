import React, { useRef, useState } from 'react';
import { UploadCloud, FileText, AlertCircle, Sparkles, ShieldCheck } from 'lucide-react';
import { LIMITS } from '../config/limits';

interface UploadZoneProps {
  onFileSelected: (file: File) => void;
  disabled?: boolean;
}

export const UploadZone: React.FC<UploadZoneProps> = ({ onFileSelected, disabled = false }) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (disabled) return;
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const validateAndSelect = (file: File) => {
    setErrorMsg(null);
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setErrorMsg('Apenas arquivos no formato PDF são suportados.');
      return;
    }
    if (file.size > LIMITS.MAX_UPLOAD_BYTES) {
      setErrorMsg(`O arquivo excede o limite máximo permitido de ${LIMITS.MAX_UPLOAD_MB} MB.`);
      return;
    }
    onFileSelected(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (disabled) return;
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      validateAndSelect(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      validateAndSelect(e.target.files[0]);
    }
  };

  return (
    <div className="w-full my-6 select-none">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !disabled && fileInputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-3xl p-10 sm:p-14 text-center cursor-pointer transition-all duration-200 bg-white shadow-xs ${
          isDragOver
            ? 'border-[#2563EB] bg-[#EFF6FF] scale-[1.01]'
            : 'border-slate-200 hover:border-[#2563EB]/60 hover:bg-slate-50/50'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,application/pdf"
          onChange={handleFileInputChange}
          disabled={disabled}
          className="hidden"
        />

        <div className="flex flex-col items-center justify-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-[#EFF6FF] text-[#2563EB] flex items-center justify-center shadow-xs">
            <UploadCloud className="w-8 h-8 stroke-[2]" />
          </div>

          <div className="space-y-1">
            <h3 className="text-xl sm:text-2xl font-black text-[#0F172A] tracking-tight">
              Arraste seu arquivo PDF aqui
            </h3>
            <p className="text-sm text-[#64748B] font-medium">
              ou clique para selecionar do seu computador
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2 pt-2 text-xs text-[#64748B]">
            <span className="inline-flex items-center px-3 py-1 rounded-xl bg-slate-100/80 border border-slate-200/60 font-semibold text-[#475569]">
              <FileText className="w-3.5 h-3.5 mr-1.5 text-[#2563EB]" /> PDF até 50 MB
            </span>
            <span className="inline-flex items-center px-3 py-1 rounded-xl bg-slate-100/80 border border-slate-200/60 font-semibold text-[#475569]">
              <ShieldCheck className="w-3.5 h-3.5 mr-1.5 text-[#10B981]" /> Verificação Determinística
            </span>
            <span className="inline-flex items-center px-3 py-1 rounded-xl bg-slate-100/80 border border-slate-200/60 font-semibold text-[#475569]">
              <Sparkles className="w-3.5 h-3.5 mr-1.5 text-[#8B5CF6]" /> Preparação PDF/X-4
            </span>
          </div>

          {errorMsg && (
            <div className="mt-4 flex items-center text-xs text-[#EF4444] bg-[#FEE2E2] px-4 py-2 rounded-xl border border-[#FCA5A5] font-semibold">
              <AlertCircle className="w-4 h-4 mr-2 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
