import React from 'react';
import { Bell, Plus, RotateCcw } from 'lucide-react';
import { LogoWordmark } from './BrandLogos';
import type { BetaUser } from '../domain/beta';

interface HeaderProps {
  onReset: () => void;
  canReset: boolean;
  onOpenHistory?: () => void;
  onOpenAbout?: () => void;
  currentUser?: BetaUser | null;
  onOpenAuth?: () => void;
  onSignOut?: () => void;
  onOpenProfiles?: () => void;
  onOpenPlans?: () => void;
  notificationCount?: number;
}

export const Header: React.FC<HeaderProps> = ({ 
  onReset, 
  canReset,
  notificationCount = 3,
}) => {
  return (
    <header className="sticky top-0 z-20 w-full bg-white/95 backdrop-blur-xs border-b border-slate-200/80 px-6 sm:px-8 py-3.5 flex items-center justify-between shadow-2xs">
      {/* Left spacing to balance or mobile trigger */}
      <div className="flex items-center w-36">
        {/* Placeholder to keep center logo perfectly centered */}
      </div>

      {/* Center Wordmark Logo */}
      <div className="flex items-center justify-center">
        <LogoWordmark height={32} />
      </div>

      {/* Right Actions: Notifications & "+ Novo Arquivo" */}
      <div className="flex items-center gap-3 w-36 justify-end">
        {/* Notification Bell with Badge */}
        <button
          type="button"
          className="relative p-2 rounded-xl text-[#64748B] hover:text-[#0F172A] hover:bg-slate-100 transition-colors cursor-pointer"
          title="Notificações e alertas"
        >
          <Bell className="w-5 h-5" />
          {notificationCount > 0 && (
            <span className="absolute top-1.5 right-1.5 min-w-[17px] h-[17px] flex items-center justify-center bg-[#8B5CF6] text-white text-[10px] font-bold rounded-full px-1 shadow-xs ring-2 ring-white">
              {notificationCount}
            </span>
          )}
        </button>

        {/* Primary "+ Novo Arquivo" Gradient Button */}
        <button
          type="button"
          onClick={onReset}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold text-white bg-gradient-to-r from-[#0066FF] via-[#5B21B6] to-[#7C3AED] hover:opacity-95 shadow-md shadow-indigo-500/20 active:scale-[0.98] transition-all cursor-pointer select-none"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          <span>Novo Arquivo</span>
        </button>
      </div>
    </header>
  );
};
