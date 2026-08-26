import React from 'react';
import { 
  LayoutDashboard, 
  FolderOpen, 
  CheckSquare, 
  FileSpreadsheet, 
  History, 
  Settings,
  Sparkles,
  User,
  LogOut
} from 'lucide-react';
import type { BetaUser } from '../domain/beta';

interface SidebarProps {
  activeTab?: string;
  onSelectTab?: (tab: string) => void;
  billingStatus?: {
    planCode: string;
    used: number;
    limit: number;
    remaining: number;
  };
  currentUser?: BetaUser | null;
  onOpenUpgradeModal?: () => void;
  onOpenLogin?: () => void;
  onLogout?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab = 'dashboard',
  onSelectTab,
  billingStatus,
  currentUser,
  onOpenUpgradeModal,
  onOpenLogin,
  onLogout,
}) => {
  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'files', label: 'Arquivos & Análises', icon: FolderOpen },
    { id: 'verifications', label: 'Verificações', icon: CheckSquare },
    { id: 'reports', label: 'Relatórios', icon: FileSpreadsheet },
    { id: 'history', label: 'Histórico', icon: History },
    { id: 'settings', label: 'Configurações', icon: Settings },
  ];

  const planName = currentUser
    ? billingStatus?.planCode === 'professional'
      ? 'Profissional'
      : billingStatus?.planCode === 'professional_launch'
      ? 'Lançamento Pro'
      : 'Plano Grátis'
    : 'Acesso Visitante';

  const used = currentUser ? billingStatus?.used || 0 : 0;
  const limit = currentUser ? billingStatus?.limit || 15 : 15;
  const percentage = currentUser ? Math.min(100, Math.round((used / limit) * 100)) : 0;

  const userDisplayName = currentUser?.displayName || currentUser?.name || currentUser?.companyName || (currentUser?.email ? currentUser.email.split('@')[0] : null);
  const userInitial = userDisplayName ? userDisplayName.charAt(0).toUpperCase() : (currentUser?.email ? currentUser.email.charAt(0).toUpperCase() : 'U');

  return (
    <aside className="w-64 shrink-0 bg-white border-r border-slate-200/90 flex flex-col justify-between p-4 min-h-[calc(100vh-61px)] select-none">
      {/* Top Section: Nav Items */}
      <div className="space-y-4">
        {/* Navigation Links */}
        <nav className="space-y-1">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab && onSelectTab(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-bold text-xs transition-all cursor-pointer ${
                  isActive
                    ? 'bg-[#EFF6FF] text-[#2563EB]'
                    : 'text-[#64748B] hover:bg-slate-50 hover:text-[#0F172A]'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-[#2563EB]' : 'text-[#64748B]'}`} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom Section: Plan usage & User Profile */}
      <div className="space-y-3 pt-4 border-t border-slate-100">
        {/* Subscription Plan Card */}
        {currentUser ? (
          <div className="p-3.5 rounded-2xl bg-gradient-to-br from-slate-50 to-blue-50/40 border border-slate-200/80 shadow-2xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-black uppercase tracking-wider text-[#0F172A]">
                {planName}
              </span>
              <span className="text-[10px] font-bold text-[#64748B]">
                {used}/{limit} análises
              </span>
            </div>

            {/* Progress Bar */}
            <div className="w-full h-1.5 rounded-full bg-slate-200 overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-[#0066FF] to-[#7C3AED] rounded-full transition-all duration-300"
                style={{ width: `${percentage}%` }}
              />
            </div>

            <button
              type="button"
              onClick={onOpenUpgradeModal}
              className="w-full py-1 text-center text-[11px] font-bold text-[#2563EB] hover:text-[#1D4ED8] transition-colors cursor-pointer"
            >
              Fazer Upgrade →
            </button>
          </div>
        ) : (
          <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2 text-center">
            <span className="text-xs font-bold text-[#0F172A] block">
              Conta não conectada
            </span>
            <p className="text-[10px] text-[#64748B]">
              Faça login para salvar análises e gerenciar seu plano.
            </p>
            {onOpenLogin && (
              <button
                type="button"
                onClick={onOpenLogin}
                className="w-full py-1.5 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-xs transition-colors cursor-pointer"
              >
                Fazer Login
              </button>
            )}
          </div>
        )}

        {/* User Card */}
        {currentUser ? (
          <div className="flex items-center justify-between p-2 rounded-xl hover:bg-slate-50 transition-colors">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-full bg-[#EFF6FF] text-[#2563EB] flex items-center justify-center font-bold text-xs shrink-0 border border-blue-100">
                {userInitial}
              </div>
              <div className="min-w-0">
                <span className="text-xs font-bold text-[#0F172A] truncate block">
                  {userDisplayName || 'Usuário'}
                </span>
                <span className="text-[10px] text-[#64748B] truncate block">
                  {currentUser.email}
                </span>
              </div>
            </div>

            {onLogout && (
              <button
                type="button"
                onClick={onLogout}
                className="p-1.5 rounded-lg text-[#94A3B8] hover:text-[#EF4444] hover:bg-red-50 transition-colors cursor-pointer"
                title="Encerrar sessão"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-between p-2 rounded-xl bg-slate-50/80 border border-slate-200/60">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-500 flex items-center justify-center font-bold text-xs shrink-0">
                <User className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <span className="text-xs font-bold text-slate-700 truncate block">
                  Não autenticado
                </span>
                <span className="text-[10px] text-slate-500 truncate block">
                  Sessão anônima
                </span>
              </div>
            </div>

            {onOpenLogin && (
              <button
                type="button"
                onClick={onOpenLogin}
                className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 transition-colors cursor-pointer"
              >
                Entrar
              </button>
            )}
          </div>
        )}
      </div>
    </aside>
  );
};
