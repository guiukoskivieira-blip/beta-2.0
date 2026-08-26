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
  const lastProcessedRef = useRef<{ name: string; size: number; timestamp: number } | null>(null);

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

    // Prevent rapid duplicate file submissions
    const now = Date.now();
    if (
      lastProcessedRef.current &&
      lastProcessedRef.current.name === file.name &&
      lastProcessedRef.current.size === file.size &&
      now - lastProcessedRef.current.timestamp < 1000
    ) {
      return;
    }
    lastProcessedRef.current = { name: file.name, size: file.size, timestamp: now };

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
      // Reset input value to allow re-selecting the same file if needed
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto my-8 px-4 select-none">
      <label
        htmlFor="pdf-upload-input"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative block border-2 border-dashed rounded-3xl p-10 sm:p-14 text-center cursor-pointer transition-all duration-200 focus-within:ring-2 focus-within:ring-[#2563EB] focus-within:ring-offset-2 focus-within:border-[#2563EB] ${
          isDragOver
            ? 'border-[#2563EB] bg-[#EFF6FF] scale-[1.01]'
            : 'border-slate-300 bg-white hover:border-[#2563EB]/60 hover:bg-slate-50/50'
        } ${disabled ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''} shadow-xs`}
      >
        <input
          id="pdf-upload-input"
          ref={fileInputRef}
          type="file"
          accept=".pdf,application/pdf"
          onChange={handleFileInputChange}
          disabled={disabled}
          aria-label="Selecionar arquivo PDF para análise"
          className="sr-only"
        />

        <div className="flex flex-col items-center justify-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-[#EFF6FF] border border-[#BFDBFE] flex items-center justify-center text-[#2563EB] shadow-xs">
            <UploadCloud className="w-8 h-8" />
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
            <span className="inline-flex items-center px-3 py-1 rounded-xl bg-slate-100 border border-slate-200 font-semibold">
              <FileText className="w-3.5 h-3.5 mr-1.5 text-[#2563EB]" /> PDF até 50 MB
            </span>
            <span className="inline-flex items-center px-3 py-1 rounded-xl bg-slate-100 border border-slate-200 font-semibold">
              <ShieldCheck className="w-3.5 h-3.5 mr-1.5 text-[#059669]" /> Análise Determinística
            </span>
            <span className="inline-flex items-center px-3 py-1 rounded-xl bg-slate-100 border border-slate-200 font-semibold">
              <Sparkles className="w-3.5 h-3.5 mr-1.5 text-[#7C3AED]" /> Assistente de Produção
            </span>
          </div>

          {errorMsg && (
            <div className="mt-4 flex items-center text-xs text-[#B91C1C] bg-[#FEE2E2] px-4 py-2 rounded-xl border border-red-200 font-medium">
              <AlertCircle className="w-4 h-4 mr-2 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>
      </label>
    </div>
  );
};
