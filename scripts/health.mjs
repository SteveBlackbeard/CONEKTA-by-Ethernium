import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const requiredPaths = [
  'package.json',
  'next.config.ts',
  'eslint.config.mjs',
  'src/app/page.tsx',
  'src/lib/localAdapters.ts',
  'src/proxy.ts',
  'test/frugal-boundary.test.mjs',
  'docs/ADAPTER_CONTRACT.md',
];

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

for (const relativePath of requiredPaths) {
  if (!existsSync(join(process.cwd(), relativePath))) {
    console.error(`Missing required path: ${relativePath}`);
    process.exit(1);
  }
}

run('npm', ['test']);

console.log('Ethernium Personal Conekta health check passed.');
