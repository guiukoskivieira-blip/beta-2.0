import React from 'react';
import { FilePlus2, Files, HelpCircle, History, LayoutDashboard, Settings, Sliders } from 'lucide-react';

export interface SidebarProps { activeTab?: string; onSelectTab?: (tab: string) => void; }

export const Sidebar: React.FC<SidebarProps> = ({ activeTab = 'dashboard', onSelectTab }) => {
  const menuItems = [
    { id: 'dashboard', label: 'Visão geral', icon: LayoutDashboard }, { id: 'files', label: 'Nova análise', icon: FilePlus2 },
    { id: 'history', label: 'Histórico', icon: History }, { id: 'profiles', label: 'Perfis de produção', icon: Sliders },
    { id: 'verifications', label: 'Verificações', icon: Files }, { id: 'report', label: 'Relatório técnico', icon: Settings },
  ];
  return <>
    <aside className="hidden w-[272px] shrink-0 flex-col bg-gradient-to-b from-[#5223bd] via-[#3420a7] to-[#14247f] px-5 py-7 text-white shadow-xl md:flex">
      <div className="flex min-h-full flex-col">
        <img src="/brand/artecheck-logo-white.png" alt="ArteCheck — Pré-impressão inteligente" className="mb-10 h-auto w-full max-w-[215px] object-contain object-left" />
        <nav className="space-y-2">{menuItems.map(({ id, label, icon: Icon }) => { const active = activeTab === id; return <button key={id} type="button" onClick={() => onSelectTab?.(id)} className={`flex min-h-12 w-full items-center gap-3 rounded-xl px-4 text-left text-sm font-bold transition ${active ? 'bg-white/20 text-white shadow-inner ring-1 ring-white/10' : 'text-violet-50 hover:bg-white/10'}`}><Icon className="h-5 w-5" /><span>{label}</span></button>; })}</nav>
        <div className="mt-auto rounded-2xl border border-white/20 bg-white/[0.07] p-4"><div className="flex items-center gap-2 text-sm font-bold"><HelpCircle className="h-5 w-5" />Central de ajuda</div><p className="mt-2 text-xs leading-relaxed text-violet-100">Tutoriais, guias e boas práticas de pré-impressão.</p></div>
      </div>
    </aside>
    <nav className="fixed bottom-0 left-0 right-0 z-40 grid grid-cols-6 border-t border-slate-200 bg-white/95 px-1 py-1.5 shadow-2xl backdrop-blur-md md:hidden">{menuItems.map(({ id, label, icon: Icon }) => <button key={id} type="button" onClick={() => onSelectTab?.(id)} aria-label={label} className={`flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-lg px-1 ${activeTab === id ? 'bg-violet-50 text-violet-700' : 'text-slate-500'}`}><Icon className="h-4 w-4" /><span className="max-w-full truncate text-[8px] font-bold">{label.split(' ')[0]}</span></button>)}</nav>
  </>;
};
