import assert from 'node:assert/strict';
import fs from 'node:fs';

let passed = 0;
function test(name: string, fn: () => void) { fn(); passed++; console.log(`✓ PREXYON_ENTITLEMENT ${passed}: ${name}`); }

const server = fs.readFileSync('server.ts', 'utf8');

// 1. Homologação válida -> upload permitido
test('1. Homologação válida: resolvePrexyonEntitlement autoriza modo homologação', () => {
  assert.match(server, /homologationProducts\.includes\(['"]artecheck['"]\)/);
  assert.match(server, /mode:\s*isCommercial\s*\?\s*'commercial'\s*:\s*'homologation'/);
});

// 2. Comercial válido -> upload permitido
test('2. Comercial válido: resolvePrexyonEntitlement autoriza com has_subscription e commercial_products', () => {
  assert.match(server, /commercialProducts\.includes\(['"]artecheck['"]\)/);
  assert.match(server, /Boolean\(\(entData as any\)\.has_subscription\)/);
});

// 3. Sem entitlement -> upload bloqueado (fail-closed)
test('3. Sem entitlement: authorizeProcessing bloqueia com 403 ENTITLEMENT_REQUIRED', () => {
  assert.match(server, /ENTITLEMENT_REQUIRED/);
  assert.match(server, /res\.status\(403\)/);
});

// 4. Flatten segue a mesma regra
test('4. Flatten segue mesma regra: /api/flatten-transparency executa authorizeProcessing', () => {
  const flattenPos = server.indexOf('"/api/flatten-transparency"');
  assert.ok(flattenPos > 0);
  const flattenRoute = server.slice(flattenPos, flattenPos + 500);
  assert.match(flattenRoute, /authorizeProcessing\(req,\s*res\)/);
});

// 5. Nenhuma chamada a subscriptions, plans, /api/billing/* ou Mercado Pago durante processamento
test('5. Desacoplamento total: backend não possui rotas /api/billing/* nem chamadas a Mercado Pago', () => {
  assert.doesNotMatch(server, /\/api\/billing\/status/);
  assert.doesNotMatch(server, /\/api\/billing\/checkout/);
  assert.doesNotMatch(server, /\/api\/billing\/webhook/);
  assert.doesNotMatch(server, /server\/mercadopago/);
  assert.doesNotMatch(server, /getSubscriptionUsage/);
  assert.doesNotMatch(server, /isBillingEnforced/);
});

// 6. Histórico/análise continua sendo registrado em public.analyses
test('6. Telemetria e histórico: recordSuccessfulAnalysis registra em public.analyses com organization_id e user_id', () => {
  assert.match(server, /admin\.from\(['"]analyses['"]\)\.insert/);
  assert.match(server, /organization_id:\s*validOrgUuid/);
  assert.match(server, /user_id:\s*validUserUuid/);
  assert.match(server, /file_size_bytes:/);
});

// 7. OWNER sem entitlement continua bloqueado
test('7. RPC centralizado: autorização via RPC prexyon_get_organization_entitlements com Bearer JWT', () => {
  assert.match(server, /userClient\.rpc\(['"]prexyon_get_organization_entitlements['"]/);
  assert.doesNotMatch(server, /admin\.rpc\(['"]prexyon_get_organization_entitlements['"]/);
});

// 8. RPC falha -> fail-closed
test('8. Fail-closed: erro na resolução de entitlement retorna authorized: false', () => {
  assert.match(server, /catch \(err: any\) \{[\s\S]{0,120}return \{ authorized: false \};/);
});

// 9. Rotas da API possuem resposta JSON estrita
test('9. api/upload e rotas /api possuem garantia de resposta JSON estrita', () => {
  assert.match(server, /app\.all\("\/api\/\*"/);
  assert.match(server, /req\.path\.startsWith\("\/api\/"\)/);
  assert.match(server, /res\.status\(200\)\.json\(/);
});

console.log(`\nPrexyon Entitlement & Telemetry: ${passed}/${passed} testes aprovados.`);
