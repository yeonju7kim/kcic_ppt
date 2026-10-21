import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/kcic_ppt/',
  plugins: [react()],
  test: {
    environment: 'node',
  },
});
