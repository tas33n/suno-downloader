import { build } from 'esbuild';
import { copyFile, mkdir, rm } from 'node:fs/promises';

await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
await Promise.all(['esm', 'cjs'].map(format => build({
  entryPoints: ['src/index.mjs'], bundle: true, platform: 'node', target: 'node22',
  format, outfile: `dist/index.${format === 'esm' ? 'js' : 'cjs'}`, sourcemap: true,
})));
await copyFile('src/index.d.ts', 'dist/index.d.ts');
await copyFile('src/index.d.ts', 'dist/index.d.cts');
