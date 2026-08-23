import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseCorsAllowedOrigins, isOriginAllowed } from '../server/cors';

describe('CORS Configuration and Origin Evaluation Tests', () => {
  it('1. Origem configurada via CORS_ALLOWED_ORIGINS => permitida', () => {
    const raw = 'https://ais-dev-7xenthspykzlanofjyqnhw-188016399707.us-east1.run.app';
    const allowed = parseCorsAllowedOrigins(raw);
    assert.deepEqual(allowed, ['https://ais-dev-7xenthspykzlanofjyqnhw-188016399707.us-east1.run.app']);
    assert.equal(isOriginAllowed('https://ais-dev-7xenthspykzlanofjyqnhw-188016399707.us-east1.run.app', allowed), true);
  });

  it('2. Duas origens separadas por vírgula => ambas permitidas e normalizadas (trim, sem vazias)', () => {
    const raw = '  https://beta-20-production.up.railway.app  ,  https://meu-artecheck.com.br ,  ';
    const allowed = parseCorsAllowedOrigins(raw);
    assert.deepEqual(allowed, [
      'https://beta-20-production.up.railway.app',
      'https://meu-artecheck.com.br',
    ]);
    assert.equal(isOriginAllowed('https://beta-20-production.up.railway.app', allowed), true);
    assert.equal(isOriginAllowed('https://meu-artecheck.com.br', allowed), true);
  });

  it('3. Origem não configurada => bloqueada', () => {
    const allowed = parseCorsAllowedOrigins('https://confiavel.com');
    assert.equal(isOriginAllowed('https://malicioso.com', allowed), false);
    assert.equal(isOriginAllowed('https://outro-site.org', allowed), false);
  });

  it('4. Localhost => permitido (com ou sem porta, http ou https)', () => {
    const allowed = parseCorsAllowedOrigins('');
    assert.equal(isOriginAllowed('http://localhost', allowed), true);
    assert.equal(isOriginAllowed('http://localhost:3000', allowed), true);
    assert.equal(isOriginAllowed('http://localhost:5173', allowed), true);
    assert.equal(isOriginAllowed('https://localhost:8080', allowed), true);
    assert.equal(isOriginAllowed('http://localhost.evil.com', allowed), false);
  });

  it('5. bolt.host legado => permitido', () => {
    const allowed = parseCorsAllowedOrigins('');
    assert.equal(isOriginAllowed('https://guiukoskivieira-blip-e2zm.bolt.host', allowed), true);
    assert.equal(isOriginAllowed('https://preview-12345.bolt.host', allowed), true);
    assert.equal(isOriginAllowed('http://bolt.host.evil.com', allowed), false);
  });

  it('6. *.run.app não configurado => bloqueado (não há liberação genérica)', () => {
    const allowed = parseCorsAllowedOrigins('https://especifico.com');
    assert.equal(isOriginAllowed('https://random-app-123.us-east1.run.app', allowed), false);
    assert.equal(isOriginAllowed('https://outro-projeto.run.app', allowed), false);
  });

  it('7. *.railway.app não configurado => bloqueado (não há liberação genérica)', () => {
    const allowed = parseCorsAllowedOrigins('https://especifico.com');
    assert.equal(isOriginAllowed('https://meu-app-teste.up.railway.app', allowed), false);
    assert.equal(isOriginAllowed('https://random.railway.app', allowed), false);
  });

  it('8. Wildcard global (*) não é permitido como matching implícito', () => {
    const allowed = parseCorsAllowedOrigins('');
    assert.equal(isOriginAllowed('https://qualquer-coisa.com', allowed), false);
    assert.equal(isOriginAllowed('https://google.com', allowed), false);
  });

  it('9. OPTIONS / preflight headers logic funciona para origem permitida', () => {
    const configuredOrigins = ['https://beta-20-production.up.railway.app'];
    const origin = 'https://beta-20-production.up.railway.app';

    const headers: Record<string, string> = {};
    let status = 0;

    const req = {
      method: 'OPTIONS',
      header: (name: string) => (name.toLowerCase() === 'origin' ? origin : undefined),
    };

    const res = {
      header: (name: string, val: string) => {
        headers[name] = val;
      },
      sendStatus: (code: number) => {
        status = code;
      },
    };

    const reqOrigin = req.header('origin');
    if (reqOrigin && isOriginAllowed(reqOrigin, configuredOrigins)) {
      res.header('Access-Control-Allow-Origin', reqOrigin);
      res.header('Vary', 'Origin');
    }
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, X-Request-ID');

    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
    }

    assert.equal(status, 204, 'OPTIONS preflight retorna status 204');
    assert.equal(headers['Access-Control-Allow-Origin'], 'https://beta-20-production.up.railway.app');
    assert.equal(headers['Vary'], 'Origin');
    assert.equal(headers['Access-Control-Allow-Methods'], 'GET, POST, OPTIONS');
  });

  it('10. Request sem Origin (server-to-server / healthcheck) funciona sem crash', () => {
    const configuredOrigins = ['https://beta-20-production.up.railway.app'];
    const headers: Record<string, string> = {};
    let nextCalled = false;

    const req = {
      method: 'GET',
      header: (_name: string) => undefined, // sem origin
    };

    const res = {
      header: (name: string, val: string) => {
        headers[name] = val;
      },
    };

    const next = () => {
      nextCalled = true;
    };

    const reqOrigin = req.header('origin');
    if (reqOrigin && isOriginAllowed(reqOrigin, configuredOrigins)) {
      res.header('Access-Control-Allow-Origin', reqOrigin);
      res.header('Vary', 'Origin');
    }
    res.header('Cache-Control', 'no-store');
    res.header('X-Content-Type-Options', 'nosniff');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method !== 'OPTIONS') {
      next();
    }

    assert.equal(nextCalled, true, 'Next foi chamado sem crash para requisição sem origin');
    assert.equal(headers['Access-Control-Allow-Origin'], undefined, 'Não anexa allow origin para origin ausente');
  });
});
