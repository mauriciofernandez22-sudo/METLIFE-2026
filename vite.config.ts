import { defineConfig } from 'vite';

export default defineConfig({
  // Para GitHub Pages cambia esto por '/nombre-del-repositorio/'
  base: './',
  build: { outDir: 'dist', emptyOutDir: true }
});
