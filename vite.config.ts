import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { cloudflare } from '@cloudflare/vite-plugin';

export default defineConfig({
  plugins: [react(), cloudflare()],
  server: { port: 5173 },
  build: {
    sourcemap: false,
    target: 'es2022',
    chunkSizeWarningLimit: 1200
  }
});
