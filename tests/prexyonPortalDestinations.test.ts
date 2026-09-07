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

test('Header renderiza a logo oficial branca e o seletor dos 3 produtos', async () => {
  const header = await readFile(headerPath, 'utf8');

  assert.match(header, /\/prexyon-logo-white\.png/);
  assert.doesNotMatch(header, /opacity-50|opacity-40|bg-white.*prexyon/);
  assert.match(header, /<span>ArteCheck<\/span>/);
  assert.match(header, /AC/);
  assert.match(header, /getPrexyonProducts/);
  assert.match(header, /Ecossistema Prexyon/);
  assert.doesNotMatch(header, /https:\/\/or-agraf/);
  assert.doesNotMatch(header, /https:\/\/arteflow/);
  assert.match(header, /Portal Prexyon/);
  assert.match(header, /handleSignOut/);
  assert.match(header, /Sair da conta/);
});
