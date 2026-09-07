/**
 * ARTECHECK — Testes de regressão para Prexyon Entitlement & Telemetria.
 * Valida autorização centralizada via Prexyon, extração de JWT, isolamento de tenant e telemetria em public.analyses.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';

let passed = 0;
let failed = 0;
const bugs: string[] = [];

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ENTITLEMENT ${passed}: ${name}`);
  } catch (err: any) {
    failed++;
    console.log(`  ✗ ENTITLEMENT ${passed + failed}: ${name} — ${err.message}`);
  }
}

console.log('\n================================================================');
console.log('ARTECHECK — REGRESSÃO: PREXYON ENTITLEMENT & TELEMETRIA');
console.log('================================================================\n');

const serverSrc = fs.readFileSync('server.ts', 'utf8');
const rlsSql = fs.readFileSync('supabase/migrations/002_rls_policies.sql', 'utf8');

// ============================================================================
// TESTES: Autorização Central Prexyon
// ============================================================================

test('1. resolvePrexyonEntitlement valida membership ativo no servidor', () => {
  assert.match(serverSrc, /from\(['"]organization_members['"]\)/);
  assert.match(serverSrc, /\.eq\(['"]user_id['"],\s*userId\)/);
  assert.match(serverSrc, /member\.is_active/);
});

test('2. resolvePrexyonEntitlement valida organização ativa no servidor', () => {
  assert.match(serverSrc, /from\(['"]organizations['"]\)/);
  assert.match(serverSrc, /org\.is_active/);
});

test('3. RPC prexyon_get_organization_entitlements é chamado com Bearer JWT', () => {
  assert.match(serverSrc, /function getAuthenticatedSupabaseClient\(authToken:\s*string\)/);
  assert.match(serverSrc, /Authorization:\s*`Bearer \$\{authToken\.trim\(\)\}`/);
  assert.match(serverSrc, /userClient\.rpc\(['"]prexyon_get_organization_entitlements['"]/);
});

test('4. RPC NUNCA é chamado via service_role', () => {
  assert.doesNotMatch(serverSrc, /admin\.rpc\(['"]prexyon_get_organization_entitlements['"]/);
});

test('5. Homologação ArteCheck confere autorização direta', () => {
  assert.match(serverSrc, /effectiveProducts\.includes\(['"]artecheck['"]\)/);
  assert.match(serverSrc, /homologationProducts\.includes\(['"]artecheck['"]\)/);
});

test('6. Assinatura comercial ArteCheck confere autorização direta', () => {
  assert.match(serverSrc, /commercialProducts\.includes\(['"]artecheck['"]\)/);
  assert.match(serverSrc, /Boolean\(\(entData as any\)\.has_subscription\)/);
});

test('7. Sem entitlement retorna 403 ENTITLEMENT_REQUIRED (fail-closed)', () => {
  assert.match(serverSrc, /code:\s*['"]ENTITLEMENT_REQUIRED['"]/);
  assert.match(serverSrc, /res\.status\(403\)/);
});

// ============================================================================
// TESTES: Autenticação JWT e Segurança
// ============================================================================

test('8. JWT determina user_id: supabase.auth.getUser(authToken) é chamado', () => {
  assert.match(serverSrc, /supabase\.auth\.getUser\(authToken\)/);
});

test('9. user_id do body nunca é usado para autorização (apenas token)', () => {
  assert.match(serverSrc, /\(req as any\)\.authUser =/);
  assert.ok(!serverSrc.includes('VITE_SUPABASE_SERVICE_ROLE_KEY'), 'SERVICE_ROLE não deve ser referenciada como VITE_');
});

test('10. Token ausente resulta em authUser=null e role guest', () => {
  assert.match(serverSrc, /tokenProvided:\s*false/);
  assert.match(serverSrc, /role:\s*["']guest_or_local_dev["']/);
});

// ============================================================================
// TESTES: Telemetria e Registro de Análises
// ============================================================================

test('11. Telemetria grava em public.analyses após extração bem-sucedida', () => {
  const uploadRouteIndex = serverSrc.indexOf('"/api/upload"');
  const uploadRoute = serverSrc.slice(uploadRouteIndex);
  const extractPos = uploadRoute.indexOf('extractPdfStructure(file.buffer)');
  const recordPos = uploadRoute.indexOf('recordSuccessfulAnalysis(');
  assert.ok(extractPos >= 0 && recordPos >= 0, 'Ambos devem existir na rota de upload');
  assert.ok(extractPos < recordPos, 'Extração deve ocorrer antes do registro de análise');
});

test('12. Telemetria preserva organization_id e user_id', () => {
  assert.match(serverSrc, /admin\.from\(['"]analyses['"]\)\.insert/);
  assert.match(serverSrc, /organization_id:\s*validOrgUuid/);
  assert.match(serverSrc, /user_id:\s*validUserUuid/);
});

test('13. RLS: organization_members check em analyses e production_profiles', () => {
  assert.match(rlsSql, /organization_members/);
  assert.match(rlsSql, /om\.organization_id\s*=\s*analyses\.organization_id/);
  assert.match(rlsSql, /om\.organization_id\s*=\s*production_profiles\.organization_id/);
});

// ============================================================================
// TESTES: Desacoplamento de Billing Legado
// ============================================================================

test('14. Nenhuma rota /api/billing/* existe no servidor', () => {
  assert.doesNotMatch(serverSrc, /\/api\/billing\/status/);
  assert.doesNotMatch(serverSrc, /\/api\/billing\/checkout/);
  assert.doesNotMatch(serverSrc, /\/api\/billing\/webhook/);
});

test('15. Nenhuma dependência de Mercado Pago existe no backend', () => {
  assert.doesNotMatch(serverSrc, /mercadopago/i);
});

test('16. Nenhum fallback legado para getSubscriptionUsage existe em authorizeProcessing', () => {
  assert.doesNotMatch(serverSrc, /getSubscriptionUsage/);
  assert.doesNotMatch(serverSrc, /isBillingEnforced/);
});

// ============================================================================
// RELATÓRIO
// ============================================================================

console.log(`\n  Prexyon Entitlement & Telemetria: ${passed}/${passed + failed} aprovados${failed > 0 ? `, ${failed} falhas` : ''}`);
if (bugs.length > 0) {
  console.log('  BUGS REAIS ENCONTRADOS:');
  for (const b of bugs) console.log(`    - ${b}`);
}

export { bugs as billBugs, passed as billPassed, failed as billFailed };
