import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import { execFileSync } from 'node:child_process';

export default defineConfig(() => {
  let commit = process.env.RAILWAY_GIT_COMMIT_SHA || '';
  if (!/^[a-f0-9]{40}$/i.test(commit)) {
    try { commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); }
    catch { commit = ''; }
  }
  const revision = /^[a-f0-9]{40}$/i.test(commit) ? commit : 'unknown';
  return {
    define: {
      __AUTH_DIAGNOSTIC_BUILD__: JSON.stringify(`auth-diag-2/${revision}/${new Date().toISOString()}`),
    },
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: false,
      watch: null,
      port: 5173,
      host: '0.0.0.0',
    },
  };
});
