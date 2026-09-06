// src/auth/arteCheckPermissions.ts
// ---------------------------------------------------------------------------
// In-memory permission store for the current SSO session.
// NEVER persisted to localStorage, sessionStorage, or cookies.
// Populated exclusively by bootstrapUserContext after Prexyon SSO exchange.
// Cleared on sign-out.
// ---------------------------------------------------------------------------

/** Resolved ArteCheck permission state for the current session user. */
export interface ArteCheckSessionPermissions {
  /** Raw permission keys with their resolved effect (from role grants + user overrides, deny wins). */
  resolved: Record<string, 'allow' | 'deny'>;
  /** Whether the user is an org owner (eligible for owner bypass). */
  isOwner: boolean;
  /** Whether bootstrap completed successfully. null = not yet bootstrapped. */
  bootstrapped: boolean;
}

type PermissionListener = (perms: ArteCheckSessionPermissions | null) => void;
const _listeners = new Set<PermissionListener>();

let _store: ArteCheckSessionPermissions | null = null;

function notifyListeners(): void {
  _listeners.forEach((listener) => {
    try {
      listener(_store);
    } catch {
      // Ignore listener error
    }
  });
}

/**
 * Subscribes to changes in the in-memory permissions store.
 * Returns an unsubscribe function.
 */
export function subscribeArteCheckPermissions(listener: PermissionListener): () => void {
  _listeners.add(listener);
  return () => {
    _listeners.delete(listener);
  };
}

/**
 * Store the resolved permissions after a successful bootstrap.
 * Must only be called from bootstrapUserContext.
 */
export function setArteCheckSessionPermissions(perms: ArteCheckSessionPermissions): void {
  _store = perms;
  notifyListeners();
}

/**
 * Returns the current in-memory permissions.
 * Returns null if bootstrap has not been completed.
 */
export function getArteCheckSessionPermissions(): ArteCheckSessionPermissions | null {
  return _store;
}

/**
 * Clears the in-memory permissions.
 * Must be called on sign-out.
 */
export function clearArteCheckSessionPermissions(): void {
  _store = null;
  notifyListeners();
}

/**
 * Returns true if the user has explicit allow for the given permission key
 * AND no deny override. Fail-closed: returns false if bootstrap has not run.
 *
 * Owner bypass: if isOwner is true and no explicit deny exists, return true.
 */
export function hasPermission(key: string): boolean {
  if (!_store || !_store.bootstrapped) return false;
  const effect = _store.resolved[key];
  // Explicit deny always wins
  if (effect === 'deny') return false;
  // Owner bypass: owner gets all permissions unless explicitly denied
  if (_store.isOwner) return true;
  // Regular user: must have explicit allow
  return effect === 'allow';
}
