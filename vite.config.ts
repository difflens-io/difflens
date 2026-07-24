import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/project/difflens/',
  build: {
    outDir: 'dist',
    emptyOutDir: true
  },
  plugins: [react()]
});
