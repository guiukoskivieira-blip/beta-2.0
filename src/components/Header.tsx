// src/components/Header.tsx
import React, { useState, useRef, useEffect, useSyncExternalStore } from 'react';
import { ShieldCheck, Building2, LogOut, LayoutGrid, ChevronDown, ExternalLink } from 'lucide-react';
import { subscribeArteCheckPermissions, getArteCheckSessionPermissions } from '../auth/arteCheckPermissions';
import { PrexyonSSOProvider } from '../auth/PrexyonSSOProvider';
import { getSupabaseClient } from '../lib/supabaseClient';

export interface HeaderProps {
  portalUrl?: string;
  onLogout?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  portalUrl = 'https://portal.prexyon.com',
  onLogout,
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Read reactive session and permissions directly from in-memory store
  const sessionPerms = useSyncExternalStore(
    subscribeArteCheckPermissions,
    getArteCheckSessionPermissions,
    getArteCheckSessionPermissions,
  );

  const isOwner = sessionPerms?.isOwner ?? false;
  const orgName = sessionPerms?.organizationName || 'Organização';
  const userName = sessionPerms?.userDisplayName || 'Usuário';
  const userEmail = sessionPerms?.userEmail || '';
  const isBootstrapped = sessionPerms?.bootstrapped ?? false;

  // Compute initials for avatar (e.g. "GU" or "U")
  const initials = userName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'U';

  // Close dropdown on click outside or Escape key
  useEffect(() => {
    if (!isMenuOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isMenuOpen]);

  const handleSignOut = async () => {
    setIsMenuOpen(false);
    if (onLogout) {
      onLogout();
      return;
    }
    try {
      const client = getSupabaseClient();
      const ssoProvider = new PrexyonSSOProvider(client);
      await ssoProvider.signOut();
    } catch {
      // Ignore signOut errors
    }
    // Redirect to Portal Prexyon
    if (typeof window !== 'undefined') {
      window.location.href = portalUrl;
    }
  };

  return (
    <header className="sticky top-0 z-50 flex h-[72px] min-h-[72px] w-full items-center justify-between border-b border-white/10 bg-[#031225] px-4 text-white shadow-lg shadow-black/20 sm:px-6 lg:px-8">
      {/* Left: Prexyon Identity + Product Module */}
      <div className="flex min-w-0 items-center gap-3 sm:gap-4">
        {/* Prexyon Brand Logo */}
        <a
          href={portalUrl}
          title="Ir para o Portal Prexyon"
          className="group flex shrink-0 items-center gap-2.5 rounded-xl pr-3 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 sm:border-r sm:border-white/15 sm:pr-4"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 shadow-md shadow-blue-500/20 transition group-hover:scale-105">
            <span className="text-lg font-black text-white">P</span>
          </div>
          <span className="hidden text-xl font-black tracking-tight text-white transition group-hover:text-slate-100 sm:inline">
            pre<span className="text-cyan-400">x</span>yon
          </span>
        </a>

        {/* Current Product Badge: ArteCheck */}
        <div className="flex h-10 items-center gap-2.5 rounded-xl border border-white/15 bg-white/[0.04] px-3 text-sm font-bold tracking-tight text-white shadow-inner sm:px-3.5">
          <ShieldCheck className="h-5 w-5 text-violet-400" />
          <span>ArteCheck</span>
        </div>

        {/* Active Organization (Desktop only) */}
        {isBootstrapped && (
          <div className="hidden items-center gap-2 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-1.5 text-xs text-slate-300 md:flex">
            <Building2 className="h-3.5 w-3.5 text-slate-400" />
            <span className="max-w-[140px] truncate font-medium text-slate-200 lg:max-w-[200px]" title={orgName}>
              {orgName}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                isOwner
                  ? 'bg-amber-400/15 text-amber-300 border border-amber-400/30'
                  : 'bg-slate-400/15 text-slate-300 border border-slate-400/20'
              }`}
            >
              {isOwner ? 'Proprietário' : 'Membro'}
            </span>
          </div>
        )}
      </div>

      {/* Right: Portal Shortcut + User Profile Dropdown */}
      <div className="flex items-center gap-2.5 sm:gap-3">
        {/* Return to Prexyon Portal Button (Desktop / Tablet) */}
        <a
          href={portalUrl}
          className="hidden h-9 items-center gap-2 rounded-xl border border-white/15 bg-white/[0.05] px-3.5 text-xs font-semibold text-slate-200 transition hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 lg:flex"
        >
          <LayoutGrid className="h-3.5 w-3.5 text-cyan-400" />
          <span>Portal Prexyon</span>
        </a>

        {/* User Profile Menu */}
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setIsMenuOpen((prev) => !prev)}
            aria-expanded={isMenuOpen}
            aria-haspopup="true"
            className="flex h-10 items-center gap-2 rounded-xl border border-white/15 bg-white/[0.05] p-1.5 pr-2.5 transition hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
          >
            {/* Avatar */}
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 text-xs font-black text-white shadow-sm">
              {initials}
            </div>

            {/* User Name (Desktop) */}
            <div className="hidden max-w-[120px] truncate text-left text-xs font-semibold text-slate-200 sm:block lg:max-w-[160px]">
              <span className="block truncate">{userName}</span>
            </div>

            <ChevronDown className={`h-3.5 w-3.5 text-slate-400 transition-transform duration-150 ${isMenuOpen ? 'rotate-180' : ''}`} />
          </button>

          {/* Dropdown Menu */}
          {isMenuOpen && (
            <div className="absolute right-0 mt-2 w-72 origin-top-right rounded-2xl border border-white/15 bg-[#071933] p-2 text-slate-100 shadow-2xl shadow-black/60 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-100">
              {/* User Header Details */}
              <div className="rounded-xl bg-white/[0.04] p-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 text-sm font-black text-white shadow-md">
                    {initials}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-white">{userName}</p>
                    {userEmail && <p className="truncate text-xs text-slate-400">{userEmail}</p>}
                  </div>
                </div>

                {/* Org & Role Info in Dropdown */}
                {isBootstrapped && (
                  <div className="mt-2.5 flex items-center justify-between border-t border-white/10 pt-2 text-xs">
                    <span className="flex items-center gap-1.5 truncate text-slate-300" title={orgName}>
                      <Building2 className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                      <span className="truncate">{orgName}</span>
                    </span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                        isOwner
                          ? 'bg-amber-400/20 text-amber-300 border border-amber-400/30'
                          : 'bg-slate-400/20 text-slate-300 border border-slate-400/20'
                      }`}
                    >
                      {isOwner ? 'Proprietário' : 'Membro'}
                    </span>
                  </div>
                )}
              </div>

              {/* Navigation Actions */}
              <div className="my-1.5 space-y-1">
                <a
                  href={portalUrl}
                  onClick={() => setIsMenuOpen(false)}
                  className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/10 hover:text-white"
                >
                  <LayoutGrid className="h-4 w-4 text-cyan-400" />
                  <span className="flex-1">Ir para o Portal Prexyon</span>
                  <ExternalLink className="h-3 w-3 text-slate-400" />
                </a>
              </div>

              {/* Sign Out Action */}
              <div className="border-t border-white/10 pt-1.5">
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-bold text-red-400 transition hover:bg-red-500/15 hover:text-red-300"
                >
                  <LogOut className="h-4 w-4 text-red-400" />
                  <span>Sair da conta</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
