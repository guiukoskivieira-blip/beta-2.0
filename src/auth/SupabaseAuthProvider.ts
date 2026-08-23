import type { User, Session, SupabaseClient } from '@supabase/supabase-js';
import type { BetaUser, UserSession } from '../domain/beta';
import type { AuthProvider } from './AuthProvider';
import { getSupabaseClient } from '../lib/supabaseClient';

export class SupabaseAuthProvider implements AuthProvider {
  private customClient?: SupabaseClient;

  constructor(customClient?: SupabaseClient) {
    this.customClient = customClient;
  }

  private getClient(): SupabaseClient {
    const client = this.customClient || getSupabaseClient();
    if (!client) {
      throw new Error('Supabase client não está inicializado.');
    }
    return client;
  }

  private formatUser(user: User | null): BetaUser | null {
    if (!user) return null;
    const meta = user.user_metadata || {};
    return {
      id: user.id,
      email: user.email || '',
      displayName: meta.display_name || meta.displayName || meta.full_name || user.email?.split('@')[0] || 'Usuário',
      companyName: meta.company_name || meta.companyName || undefined,
      role: (user.app_metadata?.role as string) || (user.role as string) || 'authenticated',
    };
  }

  private formatSession(session: Session | null): UserSession {
    if (!session || !session.user) {
      return { user: null };
    }
    return {
      user: this.formatUser(session.user),
      accessToken: session.access_token,
    };
  }

  async getCurrentUser(): Promise<BetaUser | null> {
    const supabase = this.getClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) {
      return null;
    }
    return this.formatUser(user);
  }

  async getSession(): Promise<UserSession | null> {
    const supabase = this.getClient();
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error || !session) {
      return null;
    }
    return this.formatSession(session);
  }

  async signIn(email: string, password?: string): Promise<UserSession> {
    if (!password) {
      throw new Error('Senha é obrigatória para autenticação.');
    }

    const supabase = this.getClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      throw error;
    }

    return this.formatSession(data.session);
  }

  async signUp(
    email: string,
    password?: string,
    displayName?: string,
    companyName?: string
  ): Promise<UserSession> {
    if (!password) {
      throw new Error('Senha é obrigatória para cadastro.');
    }

    const supabase = this.getClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: displayName || email.split('@')[0],
          company_name: companyName || '',
          displayName: displayName || email.split('@')[0],
          companyName: companyName || '',
        },
      },
    });

    if (error) {
      throw error;
    }

    if (data.session) {
      return this.formatSession(data.session);
    }

    if (data.user) {
      return {
        user: this.formatUser(data.user),
        accessToken: undefined,
      };
    }

    return { user: null };
  }

  async signOut(): Promise<void> {
    const supabase = this.getClient();
    const { error } = await supabase.auth.signOut();
    if (error) {
      throw error;
    }
  }

  onAuthStateChange(callback: (session: UserSession | null) => void): () => void {
    const supabase = this.getClient();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      callback(this.formatSession(session));
    });

    return () => {
      subscription.unsubscribe();
    };
  }
}
