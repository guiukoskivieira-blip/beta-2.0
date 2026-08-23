import type { BetaUser, UserSession } from '../domain/beta';
import type { AuthProvider } from './AuthProvider';

export class IncompleteConfigAuthProvider implements AuthProvider {
  private errorMessage: string;

  constructor(message?: string) {
    this.errorMessage =
      message ||
      'Configuração do Supabase incompleta ou inválida. Verifique VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no ambiente.';
  }

  async getCurrentUser(): Promise<BetaUser | null> {
    return null;
  }

  async getSession(): Promise<UserSession | null> {
    return null;
  }

  async signIn(_email: string, _password?: string): Promise<UserSession> {
    throw new Error(this.errorMessage);
  }

  async signUp(
    _email: string,
    _password?: string,
    _displayName?: string,
    _companyName?: string
  ): Promise<UserSession> {
    throw new Error(this.errorMessage);
  }

  async signOut(): Promise<void> {
    throw new Error(this.errorMessage);
  }

  onAuthStateChange(): () => void {
    return () => {};
  }
}
