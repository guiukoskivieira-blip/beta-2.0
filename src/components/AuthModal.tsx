import React, { useState } from 'react';
import { X, Mail, Lock, User, ArrowRight, Loader2, Sparkles } from 'lucide-react';
import { auth } from '../auth';
import type { BetaUser } from '../domain/beta';

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
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs select-none">
      <div className="bg-white rounded-3xl border border-slate-200 w-full max-w-md p-6 shadow-2xl relative animate-in fade-in zoom-in-95 duration-150">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-5 right-5 text-slate-400 hover:text-slate-600 p-1.5 rounded-xl hover:bg-slate-100 transition-colors"
          aria-label="Fechar"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="mb-6 space-y-1">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-100 text-[#4F46E5] text-[11px] font-bold mb-2">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Acesso Seguro</span>
          </div>
          <h3 className="text-xl font-black text-[#0F172A] tracking-tight">
            {mode === 'login' ? 'Entrar no ArteCheck' : 'Criar Nova Conta'}
          </h3>
          <p className="text-xs text-[#64748B] font-medium">
            {mode === 'login'
              ? 'Acesse suas análises salvas, relatórios técnicos e limites contratados.'
              : 'Cadastre sua gráfica para iniciar a validação automatizada de PDFs.'}
          </p>
        </div>

        {error && (
          <div className="mb-4 text-xs text-rose-700 bg-rose-50 border border-rose-200 p-3 rounded-xl">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs font-medium">
          {mode === 'register' && (
            <div>
              <label className="block text-slate-700 font-bold mb-1">Nome Completo / Empresa</label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
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
            <label className="block text-slate-700 font-bold mb-1">E-mail Profissional</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
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
            <label className="block text-slate-700 font-bold mb-1">Senha de Acesso</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
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
            className="w-full py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-[#0066FF] via-[#5B21B6] to-[#7C3AED] hover:opacity-95 shadow-md shadow-indigo-500/20 active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-2"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <span>{mode === 'login' ? 'Entrar na Plataforma' : 'Criar Minha Conta'}</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <div className="mt-5 pt-4 border-t border-slate-100 text-center text-xs text-[#64748B]">
          {mode === 'login' ? (
            <span>
              Ainda não possui conta?{' '}
              <button
                type="button"
                onClick={() => setMode('register')}
                className="text-[#2563EB] font-bold hover:underline ml-1"
              >
                Cadastre-se grátis
              </button>
            </span>
          ) : (
            <span>
              Já possui conta?{' '}
              <button
                type="button"
                onClick={() => setMode('login')}
                className="text-[#2563EB] font-bold hover:underline ml-1"
              >
                Fazer login
              </button>
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
