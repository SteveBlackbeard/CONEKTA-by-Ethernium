import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const requiredPaths = [
  'package.json',
  'next.config.ts',
  'eslint.config.mjs',
  'src/app/page.tsx',
  'src/lib/localAdapters.ts',
  'docs/ADAPTER_CONTRACT.md',
  'docs/PRODUCT_CONTRACT.md',
  'src/lib/filesystemSecurity.ts',
  'src/lib/linkedSystemsRegistry.ts',
  'vitest.config.ts',
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

run('npm', ['run', 'lint']);
run('npm', ['run', 'test']);
run('npm', ['run', 'build']);

console.log('Continuity Conekta health check passed.');
