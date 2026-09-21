import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  server: {
    port: 1420,
    strictPort: true,
    // Rust build outputs can be exclusively locked on Windows. Tauri watches Rust itself.
    watch: { ignored: ['**/src-tauri/**'] },
  },
  clearScreen: false,
  test: { environment: 'jsdom', include: ['tests/**/*.test.ts'], testTimeout: 30000 },
});
