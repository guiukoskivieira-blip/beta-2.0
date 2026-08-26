import React, { useState } from 'react';
import { X, Mail, Lock, User, ArrowRight, Loader2, Sparkles } from 'lucide-react';
import { auth } from '../auth';
import type { BetaUser } from '../domain/beta';
import { useModalAccessibility } from '../hooks/useModalAccessibility';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (user: BetaUser) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { closeButtonRef, handleBackdropClick, handleContentClick } = useModalAccessibility({
    isOpen,
    onClose,
    isProcessing: loading,
  });

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (mode === 'login') {
        const session = await auth.signIn(email, password);
        if (session?.user) {
          onSuccess(session.user);
          onClose();
        }
      } else {
        const session = await auth.signUp(email, password, name);
        if (session?.user) {
          onSuccess(session.user);
          onClose();
        }
      }
    } catch (err: any) {
      console.error('Auth error:', err);
      setError(err?.message || 'Falha na autenticação. Verifique os dados informados.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs select-none"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
    >
      <div
        className="bg-white rounded-3xl border border-slate-200 w-full max-w-md p-6 shadow-2xl relative animate-in fade-in zoom-in-95 duration-150"
        onClick={handleContentClick}
      >
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          disabled={loading}
          className="absolute top-5 right-5 text-slate-400 hover:text-slate-600 p-1.5 rounded-xl hover:bg-slate-100 transition-colors disabled:opacity-50 cursor-pointer"
          aria-label="Fechar"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="mb-6 space-y-1">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-100 text-[#4F46E5] text-[11px] font-bold mb-2">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Acesso Seguro</span>
          </div>
          <h3 id="auth-modal-title" className="text-xl font-black text-[#0F172A] tracking-tight">
            {mode === 'login' ? 'Entrar no ArteCheck' : 'Criar Nova Conta'}
          </h3>
          <p className="text-xs text-[#64748B] font-medium">
            {mode === 'login'
              ? 'Acesse suas análises salvas, relatórios técnicos e limites contratados.'
              : 'Cadastre sua gráfica para iniciar a validação automatizada de PDFs.'}
          </p>
        </div>

        {error && (
          <div className="mb-4 text-xs text-rose-700 bg-rose-50 border border-rose-200 p-3 rounded-xl" role="alert">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs font-medium">
          {mode === 'register' && (
            <div>
              <label htmlFor="auth-name" className="block text-slate-700 font-bold mb-1">Nome Completo / Empresa</label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  id="auth-name"
                  type="text"
                  required
                  placeholder="Ex: Gráfica Express"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                />
              </div>
            </div>
          )}

          <div>
            <label htmlFor="auth-email" className="block text-slate-700 font-bold mb-1">E-mail Profissional</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                id="auth-email"
                type="email"
                required
                placeholder="operacao@grafica.com.br"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
              />
            </div>
          </div>

          <div>
            <label htmlFor="auth-password" className="block text-slate-700 font-bold mb-1">Senha de Acesso</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                id="auth-password"
                type="password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-[#0066FF] to-[#7C3AED] hover:opacity-95 text-white font-bold text-xs shadow-md shadow-blue-500/20 flex items-center justify-center gap-2 cursor-pointer transition-all disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <span>{mode === 'login' ? 'Acessar Painel' : 'Concluir Cadastro'}</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <div className="mt-6 pt-4 border-t border-slate-100 text-center text-xs text-slate-500">
          {mode === 'login' ? (
            <p>
              Não possui uma conta?{' '}
              <button
                type="button"
                onClick={() => setMode('register')}
                className="text-indigo-600 font-bold hover:underline cursor-pointer"
              >
                Cadastre sua gráfica
              </button>
            </p>
          ) : (
            <p>
              Já tem uma conta cadastrada?{' '}
              <button
                type="button"
                onClick={() => setMode('login')}
                className="text-indigo-600 font-bold hover:underline cursor-pointer"
              >
                Fazer login
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
