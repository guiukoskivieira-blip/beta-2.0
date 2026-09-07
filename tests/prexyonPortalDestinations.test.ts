import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  getPrexyonPortalUrl,
  getPrexyonOrcagrafUrl,
  getPrexyonArteflowUrl,
  getPrexyonArtecheckUrl,
  getPrexyonProducts,
  DEFAULT_PREXYON_PORTAL_URL,
  DEFAULT_PREXYON_ORCAGRAF_URL,
  DEFAULT_PREXYON_ARTEFLOW_URL,
} from '../src/config/prexyon.ts';
import { startPrexyonProductSso } from '../src/services/prexyonSsoService.ts';

const headerPath = new URL('../src/components/Header.tsx', import.meta.url);

test('destinos padrao do ecossistema Prexyon sao resolvidos corretamente', () => {
  assert.equal(getPrexyonPortalUrl(), DEFAULT_PREXYON_PORTAL_URL);
  assert.equal(getPrexyonOrcagrafUrl(), DEFAULT_PREXYON_ORCAGRAF_URL);
  assert.equal(getPrexyonArteflowUrl(), DEFAULT_PREXYON_ARTEFLOW_URL);
});

test('getPrexyonProducts retorna os 3 produtos com ArteCheck ativo', () => {
  const products = getPrexyonProducts();
  assert.equal(products.length, 3);

  const [orcagraf, arteflow, artecheck] = products;

  assert.equal(orcagraf.id, 'orcagraf');
  assert.match(orcagraf.name, /^Or.*Graf$/i);
  assert.equal(orcagraf.tag, 'OG');
  assert.equal(orcagraf.active, false);
  assert.equal(orcagraf.url, DEFAULT_PREXYON_ORCAGRAF_URL);

  assert.equal(arteflow.id, 'arteflow');
  assert.equal(arteflow.name, 'ArteFlow');
  assert.equal(arteflow.tag, 'AF');
  assert.equal(arteflow.active, false);
  assert.equal(arteflow.url, DEFAULT_PREXYON_ARTEFLOW_URL);

  assert.equal(artecheck.id, 'artecheck');
  assert.equal(artecheck.name, 'ArteCheck');
  assert.equal(artecheck.tag, 'AC');
  assert.equal(artecheck.active, true);
});

test('startPrexyonProductSso gera codigo de autorizacao via RPC e redireciona para /auth/prexyon', async () => {
  const mockRpcCalls: any[] = [];
  const fakeClient: any = {
    rpc: async (fnName: string, params: any) => {
      mockRpcCalls.push({ fnName, params });
      if (params.p_product_code === 'arteflow') {
        return { data: { success: true, code: 'sso_code_arteflow_123', expires_at: '2026-09-07T12:00:00Z' }, error: null };
      }
      if (params.p_product_code === 'orcagraf') {
        return { data: { success: true, code: 'sso_code_orcagraf_456', expires_at: '2026-09-07T12:00:00Z' }, error: null };
      }
      return { data: null, error: new Error('INVALID_PRODUCT_CODE') };
    },
  };

  // 1. ArteFlow
  const res1 = await startPrexyonProductSso(
    fakeClient,
    'org-abc-123',
    'arteflow',
    'https://arteflow-10-production.up.railway.app'
  );
  assert.equal(res1.success, true);
  const url1 = new URL(res1.redirectUrl!);
  assert.equal(url1.pathname, '/auth/prexyon');
  assert.equal(url1.searchParams.get('code'), 'sso_code_arteflow_123');
  assert.equal(url1.searchParams.get('org'), 'org-abc-123');
  assert.equal(url1.searchParams.has('access_token'), false);

  // 2. OrcaGraf
  const res2 = await startPrexyonProductSso(
    fakeClient,
    'org-abc-123',
    'orcagraf',
    'https://or-agraf-bete-20-production.up.railway.app'
  );
  assert.equal(res2.success, true);
  const url2 = new URL(res2.redirectUrl!);
  assert.equal(url2.pathname, '/auth/prexyon');
  assert.equal(url2.searchParams.get('code'), 'sso_code_orcagraf_456');
  assert.equal(url2.searchParams.get('org'), 'org-abc-123');
  assert.equal(url2.searchParams.has('access_token'), false);

  // Verificar RPC calls
  assert.equal(mockRpcCalls.length, 2);
  assert.deepEqual(mockRpcCalls[0], { fnName: 'prexyon_generate_sso_code', params: { p_organization_id: 'org-abc-123', p_product_code: 'arteflow' } });
  assert.deepEqual(mockRpcCalls[1], { fnName: 'prexyon_generate_sso_code', params: { p_organization_id: 'org-abc-123', p_product_code: 'orcagraf' } });
});

test('Header renderiza a logo oficial branca e o seletor acoplado ao SSO', async () => {
  const header = await readFile(headerPath, 'utf8');

  // A. Logo oficial branca sem recriacao manual
  assert.match(header, /\/prexyon-logo-white\.png/);
  assert.doesNotMatch(header, /<img[^>]*prexyon[^>]*opacity-(?:40|50)/);

  // B. Produto ativo ArteCheck
  assert.match(header, /<span>ArteCheck<\/span>/);
  assert.match(header, /AC/);

  // C. Seletor de produtos utiliza startPrexyonProductSso e configuracao centralizada
  assert.match(header, /startPrexyonProductSso/);
  assert.match(header, /getPrexyonProducts/);
  assert.match(header, /Ecossistema Prexyon/);
  assert.doesNotMatch(header, /href=\{product\.url\}/);

  // D. Portal e Logout preservados
  assert.match(header, /Portal Prexyon/);
  assert.match(header, /handleSignOut/);
  assert.match(header, /Sair da conta/);
});
