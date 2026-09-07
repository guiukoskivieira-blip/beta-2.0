import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { LocalStorageProvider, cleanupLegacyGlobalStorage } from '../src/storage/LocalStorageProvider.ts';
import { setArteCheckSessionPermissions, clearArteCheckSessionPermissions } from '../src/auth/arteCheckPermissions.ts';
import type { AnalysisRecordSummary } from '../src/domain/beta.ts';

const analysisDetailPath = new URL('../src/components/AnalysisDetailModal.tsx', import.meta.url);

// Mock browser window and localStorage for node test runner
class MockLocalStorage {
  private store: Map<string, string> = new Map();
  getItem(key: string): string | null {
    return this.store.get(key) || null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  clear(): void {
    this.store.clear();
  }
  get length(): number {
    return this.store.size;
  }
}

(globalThis as any).window = {
  localStorage: new MockLocalStorage(),
};

test('P2-01: AnalysisDetailModal nunca utiliza "1 página (estimada)" quando pageCount está ausente', async () => {
  const code = await readFile(analysisDetailPath, 'utf8');

  // A. Ausência de "1 página (estimada)"
  assert.doesNotMatch(code, /1 página (estimada)/);
  assert.doesNotMatch(code, /estimada/i);

  // B. Renderização correta de 'Não informado'
  assert.match(code, /Não informado/);
});

test('P2-02: LocalStorageProvider particiona chaves por organizationId e userId', () => {
  const storage1 = new LocalStorageProvider('org-111', 'user-aaa');
  assert.equal(storage1.getAnalysesKey(), 'artecheck_analyses_history:org-111:user-aaa');
  assert.equal(storage1.getUsageKey('2026-09'), 'artecheck_usage_tracking:org-111:user-aaa_2026-09');

  const storage2 = new LocalStorageProvider('org-222', 'user-bbb');
  assert.equal(storage2.getAnalysesKey(), 'artecheck_analyses_history:org-222:user-bbb');
  assert.equal(storage2.getUsageKey('2026-09'), 'artecheck_usage_tracking:org-222:user-bbb_2026-09');
});

test('P2-02: Mesmo usuário em organizações distintas possui namespaces segregados', () => {
  const storageOrgA = new LocalStorageProvider('org-AAA', 'user-123');
  const storageOrgB = new LocalStorageProvider('org-BBB', 'user-123');

  assert.notEqual(storageOrgA.getAnalysesKey(), storageOrgB.getAnalysesKey());
  assert.equal(storageOrgA.getAnalysesKey(), 'artecheck_analyses_history:org-AAA:user-123');
  assert.equal(storageOrgB.getAnalysesKey(), 'artecheck_analyses_history:org-BBB:user-123');
});

test('P2-02: Usuário A/Org A grava histórico e Usuário B/Org B NÃO tem acesso (Zero Cross-Tenant)', async () => {
  (globalThis as any).window.localStorage.clear();

  const storageA = new LocalStorageProvider('org-alpha', 'user-alice');
  const storageB = new LocalStorageProvider('org-beta', 'user-bob');

  const analysisA: AnalysisRecordSummary = {
    id: 'analysis-alice-001',
    createdAt: Date.now(),
    fileName: 'documento_confidencial_alpha.pdf',
    fileSizeBytes: 102400,
    segmentName: 'Cartões',
    productName: 'Cartão de Visita',
    variantName: 'Padrão',
    productionProfileId: 'profile-1',
    status: 'approved',
    score: 100,
    approvedCount: 10,
    warningCount: 0,
    errorCount: 0,
  };

  // Alice salva análise
  await storageA.saveAnalysis(analysisA);

  // Alice pode listar e obter
  const aliceList = await storageA.listAnalyses();
  assert.equal(aliceList.length, 1);
  assert.equal(aliceList[0].id, 'analysis-alice-001');

  // Bob NÃO vê o histórico da Alice
  const bobList = await storageB.listAnalyses();
  assert.equal(bobList.length, 0);

  const bobDirectGet = await storageB.getAnalysis('analysis-alice-001');
  assert.equal(bobDirectGet, null);
});

test('P2-02: LocalStorageProvider resolve dinamicamente tenant do in-memory session permissions', async () => {
  (globalThis as any).window.localStorage.clear();

  setArteCheckSessionPermissions({
    resolved: { 'artecheck.analysis.view': 'allow' },
    isOwner: false,
    bootstrapped: true,
    userId: 'user-session-999',
    organizationId: 'org-session-777',
    organizationName: 'Gráfica Exemplo',
    userEmail: 'session@exemplo.com',
  });

  const dynamicStorage = new LocalStorageProvider();
  assert.equal(dynamicStorage.getAnalysesKey(), 'artecheck_analyses_history:org-session-777:user-session-999');

  const item: AnalysisRecordSummary = {
    id: 'dyn-001',
    createdAt: Date.now(),
    fileName: 'teste_dinamico.pdf',
    fileSizeBytes: 50000,
    segmentName: 'Flyers',
    productName: 'Flyer A5',
    variantName: 'Padrão',
    productionProfileId: 'profile-2',
    status: 'approved',
    score: 95,
    approvedCount: 9,
    warningCount: 1,
    errorCount: 0,
  };

  await dynamicStorage.saveAnalysis(item);
  const list = await dynamicStorage.listAnalyses();
  assert.equal(list.length, 1);
  assert.equal(list[0].id, 'dyn-001');

  // Sign out
  clearArteCheckSessionPermissions();
  const unauthStorage = new LocalStorageProvider();
  assert.equal(unauthStorage.getAnalysesKey(), 'artecheck_analyses_history:unassigned_org:unassigned_user');

  const unauthList = await unauthStorage.listAnalyses();
  assert.equal(unauthList.length, 0);
});

test('P2-02: cleanupLegacyGlobalStorage remove chaves globais legadas sem migrar para tenants', () => {
  const ls = (globalThis as any).window.localStorage;
  ls.setItem('artecheck_analyses_history', JSON.stringify([{ id: 'legacy-leak' }]));
  ls.setItem('artecheck_usage_tracking', JSON.stringify({ period: '2026-08', analyses: 5 }));

  assert.notEqual(ls.getItem('artecheck_analyses_history'), null);
  assert.notEqual(ls.getItem('artecheck_usage_tracking'), null);

  cleanupLegacyGlobalStorage();

  assert.equal(ls.getItem('artecheck_analyses_history'), null);
  assert.equal(ls.getItem('artecheck_usage_tracking'), null);
});
