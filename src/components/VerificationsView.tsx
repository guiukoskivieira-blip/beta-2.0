import React from 'react';
import { 
  CheckSquare, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  Layers, 
  Crop, 
  Droplet, 
  Type, 
  ShieldCheck, 
  Image as ImageIcon,
  ArrowLeft,
  Wand2,
  FileCheck2
} from 'lucide-react';
import type { PreflightAnalysis } from '../types';
import type { ProductionProfile } from '../utils/productionProfiles';

interface VerificationsViewProps {
  analysis: PreflightAnalysis | null;
  profile: ProductionProfile;
  onGoToDashboard: () => void;
  onScrollToFixes?: () => void;
  onOpenReportModal: () => void;
  onReset: () => void;
}

export const VerificationsView: React.FC<VerificationsViewProps> = ({
  analysis,
  profile,
  onGoToDashboard,
  onScrollToFixes,
  onOpenReportModal,
  onReset,
}) => {
  if (!analysis) {
    return (
      <div className="p-12 text-center bg-white rounded-3xl border border-slate-200 shadow-2xs space-y-4 max-w-lg mx-auto my-12 select-none">
        <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-[#4F46E5] flex items-center justify-center mx-auto border border-indigo-100">
          <CheckSquare className="w-6 h-6" />
        </div>
        <h3 className="text-base font-black text-[#0F172A]">Nenhuma Verificação Ativa</h3>
        <p className="text-xs text-[#64748B] font-medium leading-relaxed">
          Envie um arquivo PDF na tela principal para inspecionar todas as regras e diagnósticos do Motor 1.
        </p>
        <button
          type="button"
          onClick={onReset}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-[#0066FF] to-[#7C3AED] hover:opacity-95 shadow-sm transition-all cursor-pointer"
        >
          <span>Analisar Novo Arquivo</span>
        </button>
      </div>
    );
  }

  const { results, approvedCount, warningCount, errorCount, scoreSummary } = analysis.ruleResults;

  // Categorize rules
  const dimensionRules = results.filter(r => r.ruleId.includes('DIM') || r.ruleId.includes('BLD'));
  const dpiRules = results.filter(r => r.ruleId.includes('DPI'));
  const colorRules = results.filter(r => r.ruleId.includes('CLR'));
  const fontRules = results.filter(r => r.ruleId.includes('FNT'));
  const isoRules = results.filter(r => r.ruleId.includes('ISO') || r.ruleId.includes('PDFX'));
  const otherRules = results.filter(r => !dimensionRules.includes(r) && !dpiRules.includes(r) && !colorRules.includes(r) && !fontRules.includes(r) && !isoRules.includes(r));

  const categories = [
    { title: 'Dimensões & Caixas de Corte (Trim/Bleed)', icon: Crop, rules: dimensionRules },
    { title: 'Resolução e Nitidez de Imagens (DPI)', icon: ImageIcon, rules: dpiRules },
    { title: 'Espaço de Cores & Separações (CMYK/RGB/Spot)', icon: Droplet, rules: colorRules },
    { title: 'Fontes & Tipografia Incorporada', icon: Type, rules: fontRules },
    { title: 'Norma PDF/X & Output Intent (ISO 15930)', icon: ShieldCheck, rules: isoRules },
    { title: 'Outras Validações Estruturais', icon: Layers, rules: otherRules },
  ].filter(c => c.rules.length > 0);

  return (
    <div className="space-y-6 select-none animate-in fade-in duration-150">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h2 className="text-xl font-black text-[#0F172A] tracking-tight flex items-center gap-2.5">
            <CheckSquare className="w-6 h-6 text-[#2563EB]" />
            Auditoria e Verificações Técnicas
          </h2>
          <p className="text-xs text-[#64748B] font-medium mt-1">
            Diagnóstico determinístico calculado pelo Motor 1 baseado no perfil <strong>{profile.name}</strong>.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onGoToDashboard}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-bold shadow-xs transition-all cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Voltar para Inspeção</span>
          </button>
          <button
            type="button"
            onClick={onOpenReportModal}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-[#4F46E5] text-xs font-bold border border-indigo-200 transition-all cursor-pointer"
          >
            <FileCheck2 className="w-4 h-4" />
            <span>Relatório Completo</span>
          </button>
        </div>
      </div>

      {/* Summary Score Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-2xs space-y-1">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Score Global</span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-3xl font-black text-[#0F172A]">{scoreSummary.score}</span>
            <span className="text-xs text-slate-400 font-bold">/ 100</span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-emerald-50/60 border border-emerald-100 shadow-2xs space-y-1">
          <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider">Aprovadas</span>
          <div className="text-3xl font-black text-emerald-700">{approvedCount}</div>
        </div>

        <div className="p-4 rounded-2xl bg-amber-50/60 border border-amber-100 shadow-2xs space-y-1">
          <span className="text-[11px] font-bold text-amber-700 uppercase tracking-wider">Avisos Técnicos</span>
          <div className="text-3xl font-black text-amber-700">{warningCount}</div>
        </div>

        <div className="p-4 rounded-2xl bg-rose-50/60 border border-rose-100 shadow-2xs space-y-1">
          <span className="text-[11px] font-bold text-rose-700 uppercase tracking-wider">Erros Críticos</span>
          <div className="text-3xl font-black text-rose-700">{errorCount}</div>
        </div>
      </div>

      {/* Categorized Rules List */}
      <div className="space-y-6">
        {categories.map((cat, cIdx) => {
          const Icon = cat.icon;
          return (
            <div key={cIdx} className="p-6 rounded-3xl bg-white border border-slate-200/90 shadow-2xs space-y-4">
              <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100">
                <div className="p-2 rounded-xl bg-slate-100 text-slate-700">
                  <Icon className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-black text-[#0F172A] tracking-tight uppercase">
                  {cat.title} ({cat.rules.length})
                </h3>
              </div>

              <div className="space-y-3">
                {cat.rules.map((r, rIdx) => {
                  const isPassed = r.status === 'passed';
                  const isWarn = r.status === 'warning';
                  const isError = r.status === 'error';

                  return (
                    <div
                      key={rIdx}
                      className="p-4 rounded-2xl bg-slate-50/70 border border-slate-200/80 flex items-start gap-3 shadow-2xs"
                    >
                      <div className="mt-0.5 shrink-0">
                        {isPassed && <CheckCircle2 className="w-5 h-5 text-emerald-500" />}
                        {isWarn && <AlertTriangle className="w-5 h-5 text-amber-500" />}
                        {isError && <XCircle className="w-5 h-5 text-rose-500" />}
                      </div>

                      <div className="space-y-1.5 flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className="text-xs font-bold text-[#0F172A]">{r.ruleName}</span>
                          <span className="text-[10px] font-mono text-slate-400">{r.ruleId}</span>
                        </div>
                        <p className="text-xs text-[#64748B]">{r.description}</p>
                        <div className="text-[11px] bg-white p-2.5 rounded-xl border border-slate-200/80 font-mono text-slate-700">
                          <strong>Evidência:</strong> {r.evidence}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
