import type { AnalysisRecordSummary, UsageRecord } from '../domain/beta';
import { getArteCheckSessionPermissions } from '../auth/arteCheckPermissions';

export interface StorageProvider {
  saveAnalysis(analysis: AnalysisRecordSummary): Promise<void>;
  getAnalysis(id: string): Promise<AnalysisRecordSummary | null>;
  listAnalyses(): Promise<AnalysisRecordSummary[]>;
  deleteAnalysis(id: string): Promise<void>;
  getUsage(period: string): Promise<UsageRecord>;
  incrementUsage(period: string, bytesUploaded: number): Promise<UsageRecord>;
}

/**
 * Safely removes legacy unpartitioned global history keys from localStorage
 * without migrating unproven records into tenant partitions.
 */
export function cleanupLegacyGlobalStorage(): void {
  if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
    try {
      window.localStorage.removeItem('artecheck_analyses_history');
      window.localStorage.removeItem('artecheck_usage_tracking');
    } catch {}
  }
}

export class LocalStorageProvider implements StorageProvider {
  private explicitOrgId?: string;
  private explicitUserId?: string;
  private inMemoryAnalyses: Map<string, AnalysisRecordSummary> = new Map();
  private inMemoryUsage: Map<string, UsageRecord> = new Map();

  constructor(organizationId?: string, userId?: string) {
    this.explicitOrgId = organizationId;
    this.explicitUserId = userId;
  }

  /**
   * Resolves the active tenant namespace partition (organizationId:userId).
   * Prioritizes explicit constructor parameters, then falls back to in-memory session permissions.
   */
  public getTenantNamespace(): { orgId: string; userId: string } {
    const session = getArteCheckSessionPermissions();
    const orgId = (this.explicitOrgId || session?.organizationId || 'unassigned_org').trim();
    const userId = (this.explicitUserId || session?.userId || 'unassigned_user').trim();
    return { orgId, userId };
  }

  /**
   * Returns the partitioned localStorage key for analysis history.
   * Format: `artecheck_analyses_history:<organizationId>:<userId>`
   */
  public getAnalysesKey(): string {
    const { orgId, userId } = this.getTenantNamespace();
    return `artecheck_analyses_history:${orgId}:${userId}`;
  }

  /**
   * Returns the partitioned localStorage key for usage tracking.
   * Format: `artecheck_usage_tracking:<organizationId>:<userId>_<period>`
   */
  public getUsageKey(period: string): string {
    const { orgId, userId } = this.getTenantNamespace();
    return `artecheck_usage_tracking:${orgId}:${userId}_${period}`;
  }

  private hasLocalStorage(): boolean {
    return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
  }

  async saveAnalysis(analysis: AnalysisRecordSummary): Promise<void> {
    const key = this.getAnalysesKey();
    const memoryKey = `${key}:${analysis.id}`;
    this.inMemoryAnalyses.set(memoryKey, analysis);
    if (this.hasLocalStorage()) {
      try {
        const list = await this.listAnalyses();
        const filtered = list.filter((a) => a.id !== analysis.id);
        filtered.unshift(analysis);
        window.localStorage.setItem(key, JSON.stringify(filtered.slice(0, 100)));
      } catch {}
    }
  }

  async getAnalysis(id: string): Promise<AnalysisRecordSummary | null> {
    const key = this.getAnalysesKey();
    const memoryKey = `${key}:${id}`;
    if (this.inMemoryAnalyses.has(memoryKey)) {
      return this.inMemoryAnalyses.get(memoryKey) || null;
    }
    if (this.hasLocalStorage()) {
      try {
        const list = await this.listAnalyses();
        return list.find((a) => a.id === id) || null;
      } catch {}
    }
    return null;
  }

  async listAnalyses(): Promise<AnalysisRecordSummary[]> {
    const key = this.getAnalysesKey();
    if (this.hasLocalStorage()) {
      try {
        const raw = window.localStorage.getItem(key);
        return raw ? JSON.parse(raw) : [];
      } catch {}
    }
    const prefix = `${key}:`;
    const results: AnalysisRecordSummary[] = [];
    for (const [k, v] of this.inMemoryAnalyses.entries()) {
      if (k.startsWith(prefix)) {
        results.push(v);
      }
    }
    return results;
  }

  async deleteAnalysis(id: string): Promise<void> {
    const key = this.getAnalysesKey();
    const memoryKey = `${key}:${id}`;
    this.inMemoryAnalyses.delete(memoryKey);
    if (this.hasLocalStorage()) {
      try {
        const list = await this.listAnalyses();
        const filtered = list.filter((a) => a.id !== id);
        window.localStorage.setItem(key, JSON.stringify(filtered));
      } catch {}
    }
  }

  async getUsage(period: string): Promise<UsageRecord> {
    const key = this.getUsageKey(period);
    if (this.inMemoryUsage.has(key)) {
      return this.inMemoryUsage.get(key)!;
    }
    if (this.hasLocalStorage()) {
      try {
        const raw = window.localStorage.getItem(key);
        if (raw) return JSON.parse(raw);
      } catch {}
    }
    return { period, analyses: 0, bytesUploaded: 0 };
  }

  async incrementUsage(period: string, bytesUploaded: number): Promise<UsageRecord> {
    const key = this.getUsageKey(period);
    const current = await this.getUsage(period);
    const updated: UsageRecord = {
      period,
      analyses: current.analyses + 1,
      bytesUploaded: current.bytesUploaded + bytesUploaded,
    };
    this.inMemoryUsage.set(key, updated);
    if (this.hasLocalStorage()) {
      try {
        window.localStorage.setItem(key, JSON.stringify(updated));
      } catch {}
    }
    return updated;
  }
}
