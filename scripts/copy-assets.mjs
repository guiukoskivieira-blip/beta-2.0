/**
 * ARTECHECK — Cross-Platform Build Asset Copy Script
 *
 * Copies required binary and ICC assets to dist/ without shell or OS-specific dependencies.
 * Works uniformly on Windows, Linux, and macOS.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const distDir = path.join(rootDir, 'dist');
const distIccsDir = path.join(distDir, 'iccs');

console.log('📦 ArteCheck: Copiando ativos de build multiplataforma...');

// 1. Ensure dist directory exists
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// 2. Copy lcms.wasm
const lcmsWasmSource = path.join(rootDir, 'node_modules', 'lcms-wasm', 'dist', 'lcms.wasm');
const lcmsWasmDest = path.join(distDir, 'lcms.wasm');

if (!fs.existsSync(lcmsWasmSource)) {
  console.error(`❌ Erro: Arquivo obrigatório não encontrado: ${lcmsWasmSource}`);
  process.exit(1);
}

fs.copyFileSync(lcmsWasmSource, lcmsWasmDest);
console.log(`  ✓ Copiado: node_modules/lcms-wasm/dist/lcms.wasm -> dist/lcms.wasm`);

// 3. Ensure dist/iccs directory exists
if (!fs.existsSync(distIccsDir)) {
  fs.mkdirSync(distIccsDir, { recursive: true });
}

// 4. Copy all .icc profiles from server/iccs
const serverIccsDir = path.join(rootDir, 'server', 'iccs');

if (!fs.existsSync(serverIccsDir)) {
  console.error(`❌ Erro: Diretório de perfis ICC não encontrado: ${serverIccsDir}`);
  process.exit(1);
}

const iccFiles = fs.readdirSync(serverIccsDir).filter((file) => file.toLowerCase().endsWith('.icc'));

if (iccFiles.length === 0) {
  console.warn(`⚠️ Aviso: Nenhum arquivo .icc encontrado em ${serverIccsDir}`);
} else {
  for (const iccFile of iccFiles) {
    const srcPath = path.join(serverIccsDir, iccFile);
    const destPath = path.join(distIccsDir, iccFile);
    fs.copyFileSync(srcPath, destPath);
    console.log(`  ✓ Copiado perfil ICC: ${iccFile} -> dist/iccs/`);
  }
}

console.log('✅ ArteCheck: Ativos copiados com sucesso!');
