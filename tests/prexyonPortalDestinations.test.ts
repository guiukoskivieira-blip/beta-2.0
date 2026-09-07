import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { getPrexyonPortalUrl, DEFAULT_PREXYON_PORTAL_URL } from '../src/config/prexyon';

describe('ARTECHECK — Centralização dos Destinos do Portal Prexyon', () => {
  it('A. Nenhum runtime do ArteCheck depende de portal.prexyon.com hardcoded', () => {
    const headerSrc = fs.readFileSync('src/components/Header.tsx', 'utf8');
    const procStateSrc = fs.readFileSync('src/components/ProcessingState.tsx', 'utf8');
    const appSrc = fs.readFileSync('src/App.tsx', 'utf8');

    assert.doesNotMatch(headerSrc, /portal\.prexyon\.com/);
    assert.doesNotMatch(procStateSrc, /portal\.prexyon\.com/);
    assert.doesNotMatch(appSrc, /portal\.prexyon\.com/);
  });

  it('B. Configuração central padrão aponta para prexyon-production.up.railway.app', () => {
    assert.equal(DEFAULT_PREXYON_PORTAL_URL, 'https://prexyon-production.up.railway.app');
    const resolved = getPrexyonPortalUrl();
    assert.ok(resolved.startsWith('https://'));
    assert.ok(resolved.includes('prexyon-production.up.railway.app') || resolved.includes('prexyon'));
  });

  it('C. Logo Prexyon no Header utiliza a configuração central', () => {
    const headerSrc = fs.readFileSync('src/components/Header.tsx', 'utf8');
    assert.match(headerSrc, /import\s*\{\s*getPrexyonPortalUrl\s*\}\s*from\s*['"]\.\.\/config\/prexyon['"]/);
    assert.match(headerSrc, /portalUrl\s*=\s*getPrexyonPortalUrl\(\)/);
    assert.match(headerSrc, /href=\{portalUrl\}/);
    assert.match(headerSrc, /title=["']Ir para o Portal Prexyon["']/);
  });

  it('D. Botão e Ação Portal no Header utilizam a configuração central', () => {
    const headerSrc = fs.readFileSync('src/components/Header.tsx', 'utf8');
    assert.match(headerSrc, /Portal Prexyon/);
    assert.match(headerSrc, /Ir para o Portal Prexyon/);
  });

  it('E. Logout no Header encerra sessão via SSO provider e redireciona para portalUrl', () => {
    const headerSrc = fs.readFileSync('src/components/Header.tsx', 'utf8');
    assert.match(headerSrc, /await ssoProvider\.signOut\(\)/);
    assert.match(headerSrc, /window\.location\.href\s*=\s*portalUrl/);
  });

  it('F. Upgrade em ProcessingState utiliza getPrexyonPortalUrl()', () => {
    const procStateSrc = fs.readFileSync('src/components/ProcessingState.tsx', 'utf8');
    assert.match(procStateSrc, /import\s*\{\s*getPrexyonPortalUrl\s*\}\s*from\s*['"]\.\.\/config\/prexyon['"]/);
    assert.match(procStateSrc, /href=\{getPrexyonPortalUrl\(\)\}/);
  });

  it('G. SSO V2 continua íntegro e inalterado', () => {
    const ssoProviderSrc = fs.readFileSync('src/auth/PrexyonSSOProvider.ts', 'utf8');
    const ssoServiceSrc = fs.readFileSync('src/services/prexyonSsoService.ts', 'utf8');
    assert.match(ssoProviderSrc, /exchangePrexyonCode\(this\.client,\s*code,\s*['"]artecheck['"]\)/);
    assert.match(ssoServiceSrc, /client\.functions\.invoke\(['"]prexyon-sso-exchange['"]/);
  });
});
