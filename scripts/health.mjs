import { existsSync, readFileSync } from 'node:fs';
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
  'vitest.config.mts',
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

function verifyOutputTrace() {
  const tracePath = join(
    process.cwd(),
    '.next',
    'server',
    'app',
    'api',
    'actions',
    'read',
    'route.js.nft.json',
  );

  if (!existsSync(tracePath)) {
    console.error('Missing production output trace for /api/actions/read.');
    process.exit(1);
  }

  const trace = JSON.parse(readFileSync(tracePath, 'utf8'));
  const forbidden = trace.files.filter((file) => {
    const portablePath = file.replaceAll('\\', '/');
    return /\/scripts\//.test(portablePath) || /\/src\/.*\.test\.[cm]?[jt]sx?$/.test(portablePath);
  });

  if (forbidden.length > 0) {
    console.error('Production output trace contains development-only files:');
    for (const file of forbidden) console.error(`- ${file}`);
    process.exit(1);
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
verifyOutputTrace();

console.log('Continuity Conekta health check passed.');
