// src/services/resolveArteCheckPermissions.ts
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Retrieves ArteCheck specific permissions for a given user (and organization).
 * Returns an array of permission codes (e.g., 'artecheck.analysis.view').
 * Throws if the permission definitions cannot be fetched or are empty.
 */
export async function resolveArteCheckPermissions(
  client: SupabaseClient,
  userId: string,
  organizationId: string
): Promise<string[]> {
  // Query permission definitions filtered by product_code = 'artecheck'.
  const { data, error } = await client
    .from('prexyon_permission_definitions')
    .select('permission_code')
    .eq('product_code', 'artecheck')
    .eq('organization_id', organizationId);

  if (error) {
    throw new Error(`Failed to fetch permission definitions: ${error.message}`);
  }

  const perms = (data as any[]).map((row) => row.permission_code);
  if (!perms || perms.length === 0) {
    throw new Error('No ArteCheck permissions found for organization');
  }
  // Currently return all permissions; further filtering by user can be added.
  return perms;
}
