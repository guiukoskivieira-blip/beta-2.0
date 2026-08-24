import React, { useState } from 'react';
import { 
  LayoutDashboard, 
  Folder, 
  CheckCircle2, 
  FileText, 
  History, 
  Settings, 
  Sparkles, 
  ChevronDown, 
  LogOut, 
  LogIn, 
  Sliders, 
  CreditCard, 
  Info, 
  Building 
} from 'lucide-react';
import { LogoIcon } from './BrandLogos';
import type { BetaUser } from '../domain/beta';
import type { BillingStatus } from '../domain/billing';
import type { ProductionProfile } from '../utils/productionProfiles';

interface SidebarProps {
  activeTab?: string;
  onTabChange?: (tab: string) => void;
  currentUser?: BetaUser | null;
  billingStatus?: BillingStatus | null;
  onOpenHistory?: () => void;
  onOpenAbout?: () => void;
  onOpenAuth?: () => void;
  onSignOut?: () => void;
  onOpenProfiles?: () => void;
  onOpenPlans?: () => void;
  selectedProfile?: ProductionProfile;
  onSelectProfile?: (profile: ProductionProfile) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab = 'dashboard',
  onTabChange,
  currentUser,
  billingStatus,
  onOpenHistory,
  onOpenAbout,
  onOpenAuth,
  onSignOut,
  onOpenProfiles,
  onOpenPlans,
}) => {
  const [showUserMenu, setShowUserMenu] = useState(false);

  // Determine usage percentage for the plan card
  const used = billingStatus?.usedAnalyses ?? 0;
  const limit = billingStatus?.limitAnalyses ?? 50;
  const usagePct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const planName = billingStatus?.plan || (currentUser ? 'Plano Pro' : 'Plano Gratuito');

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'files', label: 'Arquivos', icon: Folder },
    { id: 'verifications', label: 'Verificações', icon: CheckCircle2 },
    { id: 'reports', label: 'Relatórios', icon: FileText, onClick: onOpenHistory },
    { id: 'history', label: 'Histórico', icon: History, onClick: onOpenHistory },
    { id: 'settings', label: 'Configurações', icon: Settings, onClick: onOpenProfiles },
  ];

  return (
    <aside className="w-64 shrink-0 bg-white border-r border-slate-200/80 min-h-screen flex flex-col justify-between p-4 select-none z-30">
      <div className="space-y-6">
        {/* Brand Icon */}
        <div className="pt-2 px-2 flex items-center">
          <LogoIcon size={46} />
        </div>

        {/* Navigation Menu */}
        <nav className="space-y-1.5 pt-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  if (item.onClick) {
                    item.onClick();
                  } else if (onTabChange) {
                    onTabChange(item.id);
                  }
                }}
                className={`w-full flex items-center gap-3.5 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer ${
                  isActive
                    ? 'bg-[#EFF6FF] text-[#2563EB] font-semibold'
                    : 'text-[#64748B] hover:bg-slate-50 hover:text-[#0F172A]'
                }`}
              >
                <Icon className={`w-5 h-5 ${isActive ? 'text-[#2563EB]' : 'text-[#94A3B8]'}`} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom Cards: Plan & User */}
      <div className="space-y-3 pt-4 border-t border-slate-100">
        {/* Plan Subscription Card */}
        <div 
          onClick={onOpenPlans}
          className="p-3.5 rounded-2xl bg-gradient-to-b from-slate-50 to-white border border-slate-200/90 shadow-2xs hover:border-[#8B5CF6]/50 transition-all cursor-pointer group"
          title="Ver detalhes do plano e cotas"
        >
          <div className="flex items-center gap-2 mb-1.5">
            <span className="p-1 rounded-md bg-[#FAF5FF] text-[#9333EA]">
              <Sparkles className="w-3.5 h-3.5" />
            </span>
            <span className="text-xs font-bold text-[#7E22CE] tracking-tight">
              {planName}
            </span>
          </div>

          <div className="text-[11px] text-[#64748B] mb-2 font-medium">
            {billingStatus?.periodEnd 
              ? `Renova em ${Math.max(1, Math.ceil((new Date(billingStatus.periodEnd).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))} dias` 
              : 'Renova em 24 dias'}
          </div>

          {/* Gradient Progress Bar */}
          <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden mb-1.5">
            <div 
              className="h-full rounded-full bg-gradient-to-r from-[#3B82F6] to-[#8B5CF6] transition-all duration-500"
              style={{ width: `${Math.max(8, usagePct)}%` }}
            />
          </div>

          <div className="text-[11px] text-[#94A3B8] font-medium flex justify-between items-center">
            <span>{usagePct}% do limite utilizado</span>
            {limit > 0 && <span>{used}/{limit}</span>}
          </div>
        </div>

        {/* User Account / Profile Dropdown Card */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="w-full flex items-center justify-between p-2 rounded-xl hover:bg-slate-50 border border-transparent hover:border-slate-200 transition-all cursor-pointer text-left"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#A855F7] to-[#7C3AED] text-white flex items-center justify-center font-bold text-xs shadow-2xs shrink-0">
                {currentUser?.name?.charAt(0).toUpperCase() || 'G'}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold text-[#0F172A] truncate">
                  {currentUser?.companyName || 'Gráfica Exemplo'}
                </div>
                <div className="text-[11px] text-[#64748B] truncate">
                  {currentUser?.name || 'Maria Silva'}
                </div>
              </div>
            </div>
            <ChevronDown className={`w-4 h-4 text-[#94A3B8] transition-transform ${showUserMenu ? 'rotate-180' : ''}`} />
          </button>

          {/* Dropdown Menu */}
          {showUserMenu && (
            <div className="absolute bottom-full left-0 mb-2 w-full bg-white rounded-xl shadow-xl border border-slate-200 p-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
              {onOpenProfiles && (
                <button
                  type="button"
                  onClick={() => { setShowUserMenu(false); onOpenProfiles(); }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-[#334155] hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                >
                  <Sliders className="w-3.5 h-3.5 text-[#64748B]" />
                  <span>Perfis de Produção</span>
                </button>
              )}
              {onOpenPlans && (
                <button
                  type="button"
                  onClick={() => { setShowUserMenu(false); onOpenPlans(); }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-[#334155] hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                >
                  <CreditCard className="w-3.5 h-3.5 text-[#00C185]" />
                  <span>Planos e Assinaturas</span>
                </button>
              )}
              {onOpenAbout && (
                <button
                  type="button"
                  onClick={() => { setShowUserMenu(false); onOpenAbout(); }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-[#334155] hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                >
                  <Info className="w-3.5 h-3.5 text-[#64748B]" />
                  <span>Sobre o ArteCheck</span>
                </button>
              )}
              <div className="my-1 border-t border-slate-100" />
              {currentUser ? (
                <button
                  type="button"
                  onClick={() => { setShowUserMenu(false); onSignOut?.(); }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-[#EF4444] hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sair da conta</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => { setShowUserMenu(false); onOpenAuth?.(); }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-[#2563EB] hover:bg-blue-50 rounded-lg transition-colors cursor-pointer font-semibold"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>Entrar / Cadastrar</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};
