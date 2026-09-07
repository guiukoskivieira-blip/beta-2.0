// src/components/Header.tsx
import React, { useState, useRef, useEffect, useSyncExternalStore } from 'react';
import { Building2, LogOut, LayoutGrid, ChevronDown, ExternalLink } from 'lucide-react';
import { subscribeArteCheckPermissions, getArteCheckSessionPermissions } from '../auth/arteCheckPermissions';
import { PrexyonSSOProvider } from '../auth/PrexyonSSOProvider';
import { getSupabaseClient } from '../lib/supabaseClient';
import { getPrexyonPortalUrl, getPrexyonProducts, PrexyonProductItem } from '../config/prexyon';
import { startPrexyonProductSso } from '../services/prexyonSsoService';

export interface HeaderProps {
  portalUrl?: string;
  onLogout?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  portalUrl = getPrexyonPortalUrl(),
  onLogout,
}) => {
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isProductMenuOpen, setIsProductMenuOpen] = useState(false);
  const [switchingProduct, setSwitchingProduct] = useState<string | null>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const productMenuRef = useRef<HTMLDivElement>(null);

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

  const products = getPrexyonProducts();

  // Close dropdowns on click outside or Escape key
  useEffect(() => {
    if (!isUserMenuOpen && !isProductMenuOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (userMenuRef.current && !userMenuRef.current.contains(target)) {
        setIsUserMenuOpen(false);
      }
      if (productMenuRef.current && !productMenuRef.current.contains(target)) {
        setIsProductMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsUserMenuOpen(false);
        setIsProductMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isUserMenuOpen, isProductMenuOpen]);

  const handleProductSwitch = async (product: PrexyonProductItem) => {
    if (product.active || product.id === 'artecheck') {
      setIsProductMenuOpen(false);
      return;
    }

    const targetOrgId = sessionPerms?.organizationId;
    const client = getSupabaseClient();

    // If no organization or client available, redirect to Portal Prexyon
    if (!targetOrgId || !client) {
      setIsProductMenuOpen(false);
      if (typeof window !== 'undefined') {
        window.location.href = portalUrl;
      }
      return;
    }

    try {
      setSwitchingProduct(product.id);
      const res = await startPrexyonProductSso(
        client,
        targetOrgId,
        product.id as 'orcagraf' | 'arteflow',
        product.url
      );

      if (res.success && res.redirectUrl) {
        if (typeof window !== 'undefined') {
          window.location.href = res.redirectUrl;
        }
        return;
      }

      // If SSO generation fails (e.g. permission or plan not entitled), fallback safely to Portal
      if (typeof window !== 'undefined') {
        window.location.href = portalUrl;
      }
    } catch {
      if (typeof window !== 'undefined') {
        window.location.href = portalUrl;
      }
    } finally {
      setSwitchingProduct(null);
      setIsProductMenuOpen(false);
    }
  };

  const handleSignOut = async () => {
    setIsUserMenuOpen(false);
    setIsProductMenuOpen(false);
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
      {/* Left: Prexyon Identity + Product Ecosystem Selector */}
      <div className="flex min-w-0 items-center gap-3 sm:gap-4">
        {/* Prexyon Official Brand Logo */}
        <a
          href={portalUrl}
          title="Ir para o Portal Prexyon"
          className="group flex shrink-0 items-center rounded-xl pr-3 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 sm:border-r sm:border-white/15 sm:pr-4"
        >
          <img
            src="/prexyon-logo-white.png"
            alt="Prexyon"
            className="h-9 sm:h-10 w-auto max-w-[150px] sm:max-w-[180px] object-contain object-left transition group-hover:opacity-90"
          />
        </a>

        {/* Product Selector Dropdown (OrçaGraf, ArteFlow, ArteCheck) */}
        <div className="relative" ref={productMenuRef}>
          <button
            type="button"
            onClick={() => {
              setIsProductMenuOpen((prev) => !prev);
              setIsUserMenuOpen(false);
            }}
            aria-expanded={isProductMenuOpen}
            aria-haspopup="true"
            aria-label="Selecionar produto Prexyon"
            className="flex h-10 items-center gap-2 rounded-xl border border-white/15 bg-white/[0.04] px-3 text-sm font-bold tracking-tight text-white shadow-inner transition hover:bg-white/[0.08] hover:border-white/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 sm:px-3.5"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-lg border border-violet-400/60 bg-violet-500/20 text-[11px] font-black text-violet-300">
              AC
            </span>
            <span>ArteCheck</span>
            <ChevronDown
              className={`h-3.5 w-3.5 text-slate-400 transition-transform duration-150 ${
                isProductMenuOpen ? 'rotate-180' : ''
              }`}
            />
          </button>

          {/* Product Selector Dropdown Menu */}
          {isProductMenuOpen && (
            <div className="absolute left-0 mt-2 w-72 origin-top-left rounded-2xl border border-white/15 bg-[#071933] p-2 text-slate-100 shadow-2xl shadow-black/60 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-100 z-50">
              <div className="border-b border-white/10 px-3 py-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Ecossistema Prexyon
                </p>
              </div>

              <div className="my-1.5 space-y-1">
                {products.map((product) => {
                  const isCurrent = product.active;
                  const isTargetSwitching = switchingProduct === product.id;
                  const tagClasses =
                    product.id === 'orcagraf'
                      ? 'border-amber-400/60 bg-amber-500/20 text-amber-300'
                      : product.id === 'arteflow'
                      ? 'border-teal-400/60 bg-teal-500/20 text-teal-300'
                      : 'border-violet-400/60 bg-violet-500/20 text-violet-300';

                  if (isCurrent) {
                    return (
                      <button
                        key={product.id}
                        type="button"
                        onClick={() => setIsProductMenuOpen(false)}
                        className="flex w-full items-center justify-between gap-2.5 rounded-xl border border-white/15 bg-white/[0.08] p-2.5 text-left transition cursor-default"
                      >
                        <div className="flex min-w-0 items-center gap-2.5">
                          <span
                            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border text-xs font-black ${tagClasses}`}
                          >
                            {product.tag}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-xs font-bold text-white">
                              {product.name}
                            </p>
                            <p className="truncate text-[11px] text-slate-400">
                              {product.description}
                            </p>
                          </div>
                        </div>
                        <span className="shrink-0 rounded-full border border-violet-400/40 bg-violet-500/25 px-2 py-0.5 text-[10px] font-bold text-violet-300">
                          Ativo
                        </span>
                      </button>
                    );
                  }

                  return (
                    <button
                      key={product.id}
                      type="button"
                      disabled={switchingProduct !== null}
                      onClick={() => handleProductSwitch(product)}
                      className="group flex w-full items-center justify-between gap-2.5 rounded-xl border border-transparent p-2.5 text-left transition hover:border-white/10 hover:bg-white/10 disabled:opacity-50"
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span
                          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border text-xs font-black ${tagClasses}`}
                        >
                          {product.tag}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-xs font-bold text-slate-200 group-hover:text-white">
                            {product.name}
                          </p>
                          <p className="truncate text-[11px] text-slate-400">
                            {isTargetSwitching ? 'Iniciando acesso SSO...' : product.description}
                          </p>
                        </div>
                      </div>
                      <ExternalLink className="h-3.5 w-3.5 shrink-0 text-slate-400 group-hover:text-slate-200" />
                    </button>
                  );
                })}
              </div>
            </div>
          )}
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
        <div className="relative" ref={userMenuRef}>
          <button
            type="button"
            onClick={() => {
              setIsUserMenuOpen((prev) => !prev);
              setIsProductMenuOpen(false);
            }}
            aria-expanded={isUserMenuOpen}
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

            <ChevronDown className={`h-3.5 w-3.5 text-slate-400 transition-transform duration-150 ${isUserMenuOpen ? 'rotate-180' : ''}`} />
          </button>

          {/* Dropdown Menu */}
          {isUserMenuOpen && (
            <div className="absolute right-0 mt-2 w-72 origin-top-right rounded-2xl border border-white/15 bg-[#071933] p-2 text-slate-100 shadow-2xl shadow-black/60 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-100 z-50">
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
                  onClick={() => setIsUserMenuOpen(false)}
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
