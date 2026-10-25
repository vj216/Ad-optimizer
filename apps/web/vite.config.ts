import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Any request starting with /api is forwarded to our Node server on port 3001.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { '/api': { target: 'http://localhost:3001', rewrite: (p) => p.replace(/^\/api/, '') } },
  },
});
