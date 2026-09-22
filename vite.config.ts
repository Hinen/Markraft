import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

function componentInventory(): Plugin {
  return {
    name: 'markraft-component-inventory',
    apply: 'build',
    generateBundle(_options, bundle) {
      const packages = new Map<string, { name: string; version: string; license: string }>();
      for (const output of Object.values(bundle)) {
        if (output.type !== 'chunk') continue;
        for (const id of Object.keys(output.modules)) {
          const normalized = id.replaceAll('\0', '').replaceAll('\\', '/');
          const marker = normalized.lastIndexOf('/node_modules/');
          if (marker < 0) continue;
          const tail = normalized.slice(marker + 14).split('/');
          const name = tail[0].startsWith('@') ? tail.slice(0, 2).join('/') : tail[0];
          const manifest = path.join(normalized.slice(0, marker + 14), name, 'package.json');
          const pkg = JSON.parse(fs.readFileSync(manifest, 'utf8'));
          if (!pkg.license) this.error(`Missing license metadata: ${name}`);
          packages.set(name, { name, version: pkg.version, license: pkg.license });
        }
      }
      if (packages.has('caniuse-lite'))
        this.error('Build-only caniuse-lite entered the application bundle');
      this.emitFile({
        type: 'asset',
        fileName: 'frontend-components.json',
        source:
          JSON.stringify(
            {
              scope:
                'npm packages with modules in emitted frontend JavaScript; excludes Rust, system runtimes, and build-only tools',
              packages: [...packages.values()].sort((a, b) => a.name.localeCompare(b.name)),
            },
            null,
            2,
          ) + '\n',
      });
    },
  };
}
export default defineConfig({
  plugins: [react(), componentInventory()],
  server: {
    port: 1420,
    strictPort: true,
    // Rust build outputs can be exclusively locked on Windows. Tauri watches Rust itself.
    watch: { ignored: ['**/src-tauri/**'] },
  },
  clearScreen: false,
  test: { environment: 'jsdom', include: ['tests/**/*.test.ts'], testTimeout: 30000 },
});
