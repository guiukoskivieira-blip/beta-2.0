import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AuthDiagnostics } from '../src/components/AuthDiagnostics';
import { getAuthDiagnostics, observeAuthCallback, observeUrlCleanup } from '../src/auth/authDiagnostics';
import { initializeAuthSession, resetAuthInitFlight } from '../src/auth/initAuthSession';

test('real init observes callback even when client is unavailable, without retaining its value', async () => {
  resetAuthInitFlight();
  await initializeAuthSession(null, '?code=synthetic-sensitive-value');
  assert.deepEqual(getAuthDiagnostics(), {
    callbackDetected: true, urlCleanupAttempted: false, urlCleanupSucceeded: false,
  });
  const html = renderToStaticMarkup(<AuthDiagnostics bootstrapped={false} isOwner={false} hasCreate={false} />);
  assert.match(html, /initStage: failed/);
  assert.match(html, /callbackDetected: true/);
  assert.match(html, /hasCreate: false/);
  assert.doesNotMatch(html, /synthetic-sensitive-value|JWT|cookie|email/);
});

test('panel reflects the App props and only the permitted diagnostic fields', () => {
  observeAuthCallback(true);
  observeUrlCleanup(false);
  assert.equal(getAuthDiagnostics().urlCleanupAttempted, true);
  assert.equal(getAuthDiagnostics().urlCleanupSucceeded, false);
  observeUrlCleanup(true);
  const html = renderToStaticMarkup(<AuthDiagnostics bootstrapped isOwner hasCreate />);
  const content = html.replace(/<[^>]*>/g, '').trim();
  assert.deepEqual(content.split('\n').map(line => line.split(':')[0]), [
    'build', 'initStage', 'session', 'bootstrapped', 'isOwner', 'hasCreate',
    'callbackDetected', 'urlCleanupAttempted', 'urlCleanupSucceeded',
  ]);
  assert.match(content, /hasCreate: true/);
  assert.match(content, /urlCleanupSucceeded: true/);
  observeAuthCallback(false);
  assert.deepEqual(getAuthDiagnostics(), {
    callbackDetected: false, urlCleanupAttempted: false, urlCleanupSucceeded: false,
  });
});
