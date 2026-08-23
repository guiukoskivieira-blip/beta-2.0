import type { BetaUser, UserSession } from '../domain/beta';

export interface AuthProvider {
  getCurrentUser(): Promise<BetaUser | null>;
  getSession(): Promise<UserSession | null>;
  signIn(email: string, password?: string): Promise<UserSession>;
  signUp(
    email: string,
    password?: string,
    displayName?: string,
    companyName?: string
  ): Promise<UserSession>;
  signOut(): Promise<void>;
  onAuthStateChange?(callback: (session: UserSession | null) => void): () => void;
}
