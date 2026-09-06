// src/services/resolveArteCheckPermissions.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ArteCheckSessionPermissions } from '../auth/arteCheckPermissions';

/**
 * Resolves effective ArteCheck permissions for a given user within an organization.
 *
 * Resolution logic (precedence: deny > allow, fail-closed):
 * 1. Fetch all ArteCheck permission definitions (product_code = 'artecheck').
 * 2. Fetch role grants for the user's ArteCheck role in this org (prexyon_user_product_roles
 *    → prexyon_role_permissions → permission_key = allow).
 * 3. Fetch user-level overrides (prexyon_user_permission_overrides) for this user and org.
 * 4. Merge: override effect always wins over role grant.
 * 5. Identify owner role for bypass flag.
 *
 * Throws on any DB error — caller must fail-close.
 */
export async function resolveArteCheckPermissions(
  client: SupabaseClient,
  userId: string,
  organizationId: string,
): Promise<ArteCheckSessionPermissions> {
  // 1. Fetch all ArteCheck permission definitions
  const { data: defRows, error: defErr } = await client
    .from('prexyon_permission_definitions')
    .select('id, permission_key')
    .eq('product_code', 'artecheck');

  if (defErr) {
    throw new Error(`resolveArteCheckPermissions: failed to fetch definitions: ${defErr.message}`);
  }
  if (!defRows || defRows.length === 0) {
    // No definitions registered — no permissions granted; fail-closed
    return { resolved: {}, isOwner: false, bootstrapped: true };
  }

  // Build id→key map
  const defMap: Record<string, string> = {};
  for (const row of defRows as Array<{ id: string; permission_key: string }>) {
    defMap[row.id] = row.permission_key;
  }
  const defIds = Object.keys(defMap);

  // 2. Check if user is owner in org
  const { data: memberRow, error: memberErr } = await client
    .from('organization_members')
    .select('role')
    .eq('organization_id', organizationId)
    .eq('user_id', userId)
    .maybeSingle();

  if (memberErr) {
    throw new Error(`resolveArteCheckPermissions: failed to fetch membership: ${memberErr.message}`);
  }
  const isOwner = (memberRow as any)?.role === 'owner';

  // 3. Fetch role grants: user's product role → role permissions → allow for artecheck
  const resolved: Record<string, 'allow' | 'deny'> = {};

  const { data: userRoleRow, error: roleErr } = await client
    .from('prexyon_user_product_roles')
    .select('role_id')
    .eq('organization_id', organizationId)
    .eq('user_id', userId)
    .eq('product_code', 'artecheck')
    .maybeSingle();

  if (roleErr) {
    throw new Error(`resolveArteCheckPermissions: failed to fetch user role: ${roleErr.message}`);
  }

  if (userRoleRow && (userRoleRow as any).role_id) {
    const roleId = (userRoleRow as any).role_id as string;
    const { data: rolePerms, error: rpErr } = await client
      .from('prexyon_role_permissions')
      .select('permission_definition_id')
      .eq('role_id', roleId)
      .in('permission_definition_id', defIds);

    if (rpErr) {
      throw new Error(`resolveArteCheckPermissions: failed to fetch role permissions: ${rpErr.message}`);
    }

    for (const rp of (rolePerms || []) as Array<{ permission_definition_id: string }>) {
      const key = defMap[rp.permission_definition_id];
      if (key) {
        resolved[key] = 'allow'; // role grants are always 'allow'
      }
    }
  }

  // 4. Fetch user-level overrides (effect: 'allow' | 'deny') — override wins
  const { data: overrides, error: ovErr } = await client
    .from('prexyon_user_permission_overrides')
    .select('permission_definition_id, effect')
    .eq('organization_id', organizationId)
    .eq('user_id', userId)
    .in('permission_definition_id', defIds);

  if (ovErr) {
    throw new Error(`resolveArteCheckPermissions: failed to fetch overrides: ${ovErr.message}`);
  }

  for (const ov of (overrides || []) as Array<{ permission_definition_id: string; effect: string }>) {
    const key = defMap[ov.permission_definition_id];
    if (key) {
      // Override always wins; deny always wins
      resolved[key] = ov.effect === 'deny' ? 'deny' : 'allow';
    }
  }

  return { resolved, isOwner, bootstrapped: true };
}
