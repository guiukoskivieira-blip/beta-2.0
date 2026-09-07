// src/auth/bootstrapUserContext.ts
import type { SupabaseClient, Session } from '@supabase/supabase-js';
import { resolveArteCheckPermissions } from '../services/resolveArteCheckPermissions';
import { setArteCheckSessionPermissions } from './arteCheckPermissions';

/**
 * Performs the post-SSO bootstrap validation.
 * Steps (fail-closed on any error):
 *   1. Verify that a user is authenticated (session.user).
 *   2. Retrieve the organization membership for that user.
 *   3. Ensure the membership is active (not blocked).
 *   4. Verify the organization is active.
 *   5. Call the RPC `prexyon_get_organization_entitlements` and ensure
 *      `effective_products` includes "artecheck".
 *   6. Verify `organization_member_product_access` contains a record with
 *      `product_key = 'artecheck'` and `is_enabled = true` for the user.
 *   7. Resolve ArteCheck permissions via `resolveArteCheckPermissions` and
 *      store them in the in-memory permission store.
 *
 * On any failure the function throws, allowing the caller to perform a
 * fail-closed sign-out.
 */
export async function bootstrapUserContext(
  client: SupabaseClient,
  session: Session,
): Promise<void> {
  // 1. User existence
  const user = session.user;
  if (!user) {
    throw new Error('Bootstrap failed: no authenticated user');
  }

  // 2. Membership lookup
  const { data: member, error: memberErr } = await client
    .from('organization_members')
    .select('organization_id, role, is_active')
    .eq('user_id', user.id)
    .single();
  if (memberErr || !member) {
    throw new Error('Bootstrap failed: organization membership not found');
  }

  // 3. Membership active check
  if (!(member as any).is_active) {
    throw new Error('Bootstrap failed: inactive organization membership');
  }

  const orgId = (member as any).organization_id;

  // 4. Organization active
  // NOTE: select only columns whose GRANT is guaranteed in production (id, is_active).
  // The 'name' column is NOT selected here to avoid a 42501 privilege error if the
  // production Supabase GRANT on 'organizations' does not expose that column.
  // Display name is resolved from user_metadata instead (see step 7).
  const { data: org, error: orgErr } = await client
    .from('organizations')
    .select('id, is_active')
    .eq('id', orgId)
    .single();
  if (orgErr || !org) {
    throw new Error('Bootstrap failed: organization not found');
  }
  if (!(org as any).is_active) {
    throw new Error('Bootstrap failed: organization is inactive');
  }

  // 5. Entitlements via RPC
  const { data: entData, error: entErr } = await client.rpc('prexyon_get_organization_entitlements', {
    p_org_id: orgId,
  });
  if (entErr || !entData) {
    throw new Error('Bootstrap failed: unable to fetch entitlements');
  }
  const effectiveProducts: string[] = (entData as any).effective_products || [];
  if (!effectiveProducts.includes('artecheck')) {
    throw new Error('Bootstrap failed: artecheck not in effective products');
  }

  // 6. Product access check
  const { data: prodAccess, error: prodErr } = await client
    .from('organization_member_product_access')
    .select('product_key, is_enabled')
    .eq('organization_id', orgId)
    .eq('user_id', user.id)
    .eq('product_key', 'artecheck')
    .single();
  if (prodErr || !prodAccess) {
    throw new Error('Bootstrap failed: artecheck product access missing');
  }
  if (!(prodAccess as any).is_enabled) {
    throw new Error('Bootstrap failed: artecheck product access disabled');
  }

  // 7. Resolve and store permissions in memory (no localStorage/sessionStorage)
  // org.name is intentionally NOT read here — the column is not selected (see step 4).
  // Organization display name is derived from user_metadata to avoid column privilege errors.
  const meta = user.user_metadata || {};
  const displayName = meta.display_name || meta.displayName || meta.full_name || user.email?.split('@')[0] || 'Usuário';
  const orgName = meta.company_name || meta.companyName || meta.organization_name || meta.organizationName || 'Organização';
  const memberRole = (member as any)?.role || 'member';

  const perms = await resolveArteCheckPermissions(client, user.id, orgId);
  setArteCheckSessionPermissions({
    ...perms,
    userId: user.id,
    organizationName: orgName,
    organizationId: orgId,
    userEmail: user.email || '',
    userDisplayName: displayName,
    userRole: memberRole,
  });
}
