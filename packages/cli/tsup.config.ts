import { defineConfig } from 'tsup';

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
});
