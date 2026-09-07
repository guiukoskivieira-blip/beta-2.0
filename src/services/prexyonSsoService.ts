// src/services/prexyonSsoService.ts
import type { SupabaseClient, Session } from '@supabase/supabase-js';

/** Reads the SSO code from the callback URL, accepting `code` or legacy `sso_code`. */
export function readPrexyonCode(searchParams: URLSearchParams): string {
  const code = searchParams.get('code') || searchParams.get('sso_code');
  if (!code) {
    throw new Error('Missing SSO code in callback URL');
  }
  return code.trim();
}

/** Exchanges the SSO code via the Edge Function `prexyon-sso-exchange` and verifies OTP.
 * Returns a valid Supabase Session.
 */
export async function exchangePrexyonCode(
  client: SupabaseClient,
  code: string,
  audience: string
): Promise<Session> {
  // Invoke Edge Function
  const { data: fnData, error: fnError } = await client.functions.invoke('prexyon-sso-exchange', {
    body: JSON.stringify({ code, audience }),
  });
  if (fnError) {
    throw new Error('Prexyon SSO exchange failed');
  }
  const { token_hash, verification_type } = fnData as any;
  if (!token_hash || !verification_type) {
    throw new Error('Invalid response from prexyon-sso-exchange');
  }
  // Verify OTP to obtain session
  const { data: otpData, error: otpError } = await client.auth.verifyOtp({
    token_hash,
    type: verification_type,
  });
  if (otpError) {
    throw new Error('OTP verification failed');
  }
  if (!otpData?.session) {
    throw new Error('OTP verification did not return a session');
  }
  return otpData.session;
}

/**
 * Initiates single sign-on transition to another Prexyon ecosystem product
 * (e.g. 'orcagraf' or 'arteflow').
 * Invokes the canonical Supabase RPC `prexyon_generate_sso_code` for the given
 * organization and target product, generating an authorization code, and returns
 * the destination redirect URL (`${productUrl}/auth/prexyon?code=...&org=...`).
 */
export async function startPrexyonProductSso(
  client: SupabaseClient | null,
  organizationId: string,
  targetProduct: 'orcagraf' | 'arteflow',
  productBaseUrl: string
): Promise<{ success: boolean; redirectUrl?: string; error?: string }> {
  if (!client || !organizationId || !productBaseUrl) {
    return {
      success: false,
      error: 'Parâmetros insuficientes para iniciar o SSO do produto.',
    };
  }

  try {
    const { data, error } = await (client.rpc as any)('prexyon_generate_sso_code', {
      p_organization_id: organizationId,
      p_product_code: targetProduct,
    });

    if (error) {
      let userFriendlyMsg = 'Não foi possível autorizar o acesso ao produto.';
      if (error.message?.includes('ORGANIZATION_INACTIVE')) {
        userFriendlyMsg = 'A organização está inativa ou suspensa.';
      } else if (error.message?.includes('MEMBERSHIP_INACTIVE')) {
        userFriendlyMsg = 'Usuário inativo ou bloqueado nesta organização.';
      } else if (error.message?.includes('INVALID_PRODUCT_CODE')) {
        userFriendlyMsg = 'Produto não suportado pelo ecossistema Prexyon.';
      }
      return {
        success: false,
        error: userFriendlyMsg,
      };
    }

    const code = (data as any)?.code;
    if (!code) {
      return {
        success: false,
        error: 'Código de autorização não retornado pelo servidor.',
      };
    }

    const destination = new URL(
      productBaseUrl.endsWith('/')
        ? `${productBaseUrl}auth/prexyon`
        : `${productBaseUrl}/auth/prexyon`
    );
    destination.searchParams.set('code', code);
    destination.searchParams.set('org', organizationId);

    return {
      success: true,
      redirectUrl: destination.toString(),
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Erro inesperado ao gerar autorização de login único.',
    };
  }
}

