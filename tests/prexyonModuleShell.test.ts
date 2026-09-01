import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const appPath = new URL('../src/App.tsx', import.meta.url);
const sidebarPath = new URL('../src/components/Sidebar.tsx', import.meta.url);
const fixesPath = new URL('../src/components/AvailableFixesSection.tsx', import.meta.url);
const headerPath = new URL('../src/components/Header.tsx', import.meta.url);

test('shell Prexyon não renderiza login, planos ou confirmação de rotação', async () => {
  const app = await readFile(appPath, 'utf8');
  assert.doesNotMatch(app, /AuthModal|PlansModal|RotateConfirmationModal/);
  assert.doesNotMatch(app, /setIsAuthOpen|setIsPlansOpen|setIsRotateModalOpen/);
});

test('barra global Prexyon não contém ações operacionais do ArteCheck', async () => {
  const header = await readFile(headerPath, 'utf8');
  assert.doesNotMatch(header, /Nova análise|selectedProfile|onReset|onOpenChangeProfile/);
  assert.match(header, /pre.*x.*yon/s);
  assert.match(header, /<span>ArteCheck<\/span>/);
});

test('histórico, perfis e relatório são áreas embutidas da navegação', async () => {
  const app = await readFile(appPath, 'utf8');
  const sidebar = await readFile(sidebarPath, 'utf8');
  assert.match(app, /<HistoryModal isOpen embedded/);
  assert.match(app, /<ProductionProfilesModal[\s\S]*?embedded/);
  assert.match(app, /<TechnicalReportModal isOpen embedded/);
  assert.match(sidebar, /id: 'history'/);
  assert.match(sidebar, /id: 'profiles'/);
  assert.match(sidebar, /id: 'report'/);
  assert.doesNotMatch(sidebar, /Fazer Login|Fazer Upgrade|Plano Grátis/);
});

test('orientação incompatível é manual e não oferece rotação automática', async () => {
  const fixes = await readFile(fixesPath, 'utf8');
  assert.match(fixes, /A rotação automática está desativada/);
  assert.doesNotMatch(fixes, /Girar página 90°/);
  assert.doesNotMatch(fixes, /onRequestDimensionFix\?\.\('rotate_90'\)/);
});
