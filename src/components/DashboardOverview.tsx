import React from 'react';
import { AlertTriangle, CheckCircle2, Clock3, FilePlus2, Files, XCircle, ChevronRight } from 'lucide-react';
import type { AnalysisRecordSummary } from '../domain/beta';
import { UploadZone } from './UploadZone';

interface DashboardOverviewProps {
  history: AnalysisRecordSummary[];
  onFileSelected: (file: File) => void;
  onOpenHistory: () => void;
}

export const DashboardOverview: React.FC<DashboardOverviewProps> = ({ history, onFileSelected, onOpenHistory }) => {
  const total = history.length;
  const ready = history.filter((item) => item.status === 'approved').length;
  const review = history.filter((item) => item.status === 'review').length;
  const blocked = Math.max(0, total - ready - review);
  const recent = history.slice(0, 4);
  const denominator = Math.max(1, total);

  const cards = [
    { label: 'Arquivos analisados', value: total, icon: Files, tone: 'violet' },
    { label: 'Prontos para produção', value: ready, icon: CheckCircle2, tone: 'green' },
    { label: 'Com pendências', value: review, icon: AlertTriangle, tone: 'amber' },
    { label: 'Precisam de revisão', value: blocked, icon: XCircle, tone: 'red' },
  ] as const;

  const toneClasses = {
    violet: 'text-violet-700 bg-violet-100 border-violet-500',
    green: 'text-emerald-700 bg-emerald-100 border-emerald-500',
    amber: 'text-amber-700 bg-amber-100 border-amber-500',
    red: 'text-red-700 bg-red-100 border-red-500',
  };

  return (
    <div className="space-y-7 animate-in fade-in duration-200">
      <section className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-3xl sm:text-4xl font-black tracking-[-0.035em] text-[#11182c]">Visão geral de pré-impressão</h1>
          <p className="mt-2 text-sm sm:text-base font-medium text-slate-500">Verifique seus arquivos antes de enviar para a produção.</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <label htmlFor="dashboard-upload" className="inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-700 to-purple-600 px-7 text-sm font-bold text-white shadow-lg shadow-violet-600/20 transition hover:-translate-y-0.5">
            <FilePlus2 className="h-5 w-5" /> Nova análise
          </label>
          <button type="button" onClick={onOpenHistory} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border-2 border-violet-600 bg-white px-7 text-sm font-bold text-violet-700 transition hover:bg-violet-50">
            <Clock3 className="h-5 w-5" /> Ver histórico
          </button>
        </div>
      </section>

      <input id="dashboard-upload" type="file" accept="application/pdf,.pdf" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) onFileSelected(file); event.currentTarget.value = ''; }} />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(({ label, value, icon: Icon, tone }) => (
          <article key={label} className={`rounded-2xl border border-slate-200 border-b-2 ${toneClasses[tone].split(' ')[2]} bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.06)]`}>
            <div className="flex items-center gap-4">
              <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full ${toneClasses[tone].split(' ').slice(0, 2).join(' ')}`}><Icon className="h-7 w-7" /></div>
              <div><p className="text-sm font-medium text-slate-600">{label}</p><strong className="mt-1 block text-4xl leading-none text-[#11182c]">{value}</strong></div>
            </div>
          </article>
        ))}
      </section>

      <section className="grid gap-5 xl:grid-cols-[0.9fr_1.3fr]">
        <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_10px_30px_rgba(15,23,42,0.05)]">
          <h2 className="text-lg font-black text-[#11182c]">Status das últimas análises</h2>
          <div className="mt-7 space-y-6">
            {[
              ['Prontos', ready, 'bg-emerald-500', CheckCircle2, 'text-emerald-600'],
              ['Ajustáveis', review, 'bg-amber-500', AlertTriangle, 'text-amber-600'],
              ['Revisão manual', blocked, 'bg-red-500', XCircle, 'text-red-600'],
            ].map(([label, value, bar, Icon, iconColor]) => {
              const count = value as number;
              return <div key={label as string} className="grid grid-cols-[140px_1fr_86px] items-center gap-3 text-sm"><span className="flex items-center gap-2 font-semibold text-slate-700"><Icon className={`h-5 w-5 ${iconColor}`} />{label as string}</span><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${bar}`} style={{ width: `${Math.round((count / denominator) * 100)}%` }} /></div><span className="text-right font-bold text-slate-700">{count} ({Math.round((count / denominator) * 100)}%)</span></div>;
            })}
          </div>
          <p className="mt-9 border-t border-slate-100 pt-5 text-xs text-slate-500">Percentuais calculados com base nas análises salvas neste navegador.</p>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_10px_30px_rgba(15,23,42,0.05)]">
          <h2 className="text-lg font-black text-[#11182c]">Arquivos recentes</h2>
          <div className="mt-4 divide-y divide-slate-100 border-y border-slate-100">
            {recent.length ? recent.map((item) => {
              const status = item.status === 'approved' ? ['Pronto', 'bg-emerald-50 text-emerald-700'] : item.status === 'review' ? ['Ajustável', 'bg-amber-50 text-amber-700'] : ['Revisão manual', 'bg-red-50 text-red-700'];
              return <button key={item.id} type="button" onClick={onOpenHistory} className="flex w-full items-center gap-3 py-4 text-left transition hover:bg-slate-50"><div className="flex h-11 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-[10px] font-black text-red-600">PDF</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-[#11182c]">{item.fileName}</p><p className="mt-0.5 text-xs text-slate-500">{item.approvedCount} verificações aprovadas · {item.warningCount} alertas</p></div><span className={`hidden rounded-lg px-3 py-1.5 text-xs font-bold sm:inline ${status[1]}`}>{status[0]}</span><ChevronRight className="h-5 w-5 text-slate-500" /></button>;
            }) : <div className="py-10 text-center text-sm text-slate-500">Suas análises recentes aparecerão aqui.</div>}
          </div>
          <button type="button" onClick={onOpenHistory} className="mt-4 flex w-full items-center justify-center gap-2 py-2 text-sm font-bold text-violet-700">Ver todas as análises <ChevronRight className="h-4 w-4" /></button>
        </article>
      </section>

      <section className="rounded-2xl border border-violet-100 bg-white p-4 shadow-sm">
        <UploadZone onFileSelected={onFileSelected} />
      </section>
    </div>
  );
};
