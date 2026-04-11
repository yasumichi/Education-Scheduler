import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig({
  base: './',
  plugins: [preact()],
  server: {
    host: true, // Listen on all local IP addresses (0.0.0.0)
    port: 5173
  }
});
