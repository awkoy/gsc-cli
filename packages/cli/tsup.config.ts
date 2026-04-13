import { readFileSync } from 'node:fs';
import { defineConfig } from 'tsup';

const pkg = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf-8'),
) as { version: string };

export default defineConfig({
  entry: ['src/bin.ts'],
  format: ['esm'],
  dts: false,
  sourcemap: true,
  clean: true,
  target: 'node20',
  platform: 'node',
  splitting: false,
  minify: false,
  banner: {
    js: '#!/usr/bin/env node',
  },
  define: {
    __PACKAGE_VERSION__: JSON.stringify(pkg.version),
  },
});
