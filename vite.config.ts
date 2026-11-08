import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const packageVersion = (JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }).version;
let appVersion = packageVersion;
try {
  const commitCount = execFileSync('git', ['rev-list', '--count', 'HEAD'], { encoding: 'utf8' }).trim();
  const versionPrefix = packageVersion.split('.').slice(0, 2).join('.');
  if (/^\d+$/.test(commitCount) && /^\d+\.\d+$/.test(versionPrefix)) appVersion = `${versionPrefix}.${commitCount}`;
} catch {
  // Source archives without Git metadata use the package version as fallback.
}

export default defineConfig({
  // GitHub Pages serves this repository below /cherware-genogram/.
  // Keep local development and non-Pages builds rooted at /.
  base: process.env.GITHUB_ACTIONS === 'true' ? '/cherware-genogram/' : '/',
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(appVersion) },
  optimizeDeps: {
    exclude: ['@sqlite.org/sqlite-wasm'],
  },
});
