/// <reference types="vitest" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// Identificador de esta compilación: la app lo compara con version.json para saber si hay otra nueva
const BUILD = process.env.GITHUB_SHA?.slice(0, 12) || Date.now().toString(36);

const versionFile = (): Plugin => ({
  name: 'version-file',
  apply: 'build',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: BUILD }) });
  },
});

// base relativa: funciona igual en GitHub Pages (subcarpeta) que en local
export default defineConfig({
  base: './',
  define: { __BUILD__: JSON.stringify(BUILD) },
  plugins: [react(), versionFile()],
  // Vitest solo para las pruebas de lógica; las de interfaz (e2e/) son de Playwright
  test: { include: ['src/**/*.test.ts'] },
});
