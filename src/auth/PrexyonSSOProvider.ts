// src/auth/PrexyonSSOProvider.ts
import type { AuthProvider } from './AuthProvider';
import type { UserSession, BetaUser } from '../domain/beta';
import { getSupabaseClient } from '../lib/supabaseClient';
import { bootstrapUserContext } from './bootstrapUserContext';
import { exchangePrexyonCode } from '../services/prexyonSsoService';
import { clearArteCheckSessionPermissions } from './arteCheckPermissions';

/**
 * AuthProvider that handles Prexyon SSO V2 flow.
 * It reads the code/sso_code from the callback URL, invokes the Edge Function
 * `prexyon-sso-exchange` with audience "artecheck", verifies the OTP and bootstraps
 * the user context (including ArteCheck permission resolution into memory).
 */
export class PrexyonSSOProvider implements AuthProvider {
  private client: any;

  constructor(customClient?: any) {
    this.client = customClient !== undefined ? customClient : getSupabaseClient();
  }

  /** Handles the callback URL containing `code` (or legacy `sso_code`). */
  async handleSSOCallback(rawCode: string): Promise<void> {
    if (!this.client) {
      throw new Error('Supabase client not configured');
    }
    const code = rawCode.trim();
    try {
      const session = await exchangePrexyonCode(this.client, code, 'artecheck');
      await bootstrapUserContext(this.client, session);
    } catch (err) {
      // Fail-closed: ensure user is signed out and rethrow
      await this.signOut();
      throw err;
    }
  }

  async getCurrentUser(): Promise<BetaUser | null> {
    const { data, error } = await this.client?.auth.getUser() ?? { data: null, error: new Error('No client') };
    if (error) return null;
    const user = data?.user;
    if (!user) return null;
    const meta = user.user_metadata || {};
    return {
      id: user.id,
      email: user.email || '',
      displayName: meta.display_name || meta.displayName || meta.full_name || user.email?.split('@')[0] || 'Usuário',
      companyName: meta.company_name || meta.companyName,
      role: (user.app_metadata?.role as string) || (user.role as string) || 'authenticated',
    };
  }

  async getSession(): Promise<UserSession | null> {
    if (!this.client) return null;
    const { data, error } = await this.client.auth.getSession();
    if (error || !data?.session) return null;
    const user = await this.getCurrentUser();
    return { user, accessToken: data.session.access_token };
  }

  async signIn(_email: string, _password?: string): Promise<UserSession> {
    throw new Error('SSO flow does not support manual signIn.');
  }

  async signUp(_email: string, _password?: string, _displayName?: string, _companyName?: string): Promise<UserSession> {
    throw new Error('SSO flow does not support signUp.');
  }

  async signOut(): Promise<void> {
    if (!this.client) return;
    clearArteCheckSessionPermissions();
    await this.client.auth.signOut();
  }

  onAuthStateChange?(callback: (session: UserSession | null) => void): () => void {
    if (!this.client) return () => {};
    const { data } = this.client.auth.onAuthStateChange((_event, session) => {
      (async () => {
        if (!session) {
          clearArteCheckSessionPermissions();
        }
        const user = session ? await this.getCurrentUser() : null;
        callback(user ? { user, accessToken: session.access_token } : null);
      })();
    });
    return () => {
      data.subscription.unsubscribe();
    };
  }
}
