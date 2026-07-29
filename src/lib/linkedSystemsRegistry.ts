import { promises as fs } from 'fs';
import crypto from 'crypto';
import { dirname, resolve } from 'path';
import { getRuntimeRoot, isWithin } from '@/lib/runtimePaths';

export interface RegisteredLinkedSystem {
  id: string;
  name: string;
  rootPath?: string;
  accessMode: 'runtime' | 'handle' | 'structural';
  entryCount: number;
  entries: Array<{ name: string; type: 'file' | 'dir'; size?: number }>;
  linkedAt: string;
}

interface RegistryDocument {
  version: 1;
  systems: RegisteredLinkedSystem[];
}

let registryQueue: Promise<unknown> = Promise.resolve();

function registryPath() {
  return resolve(getRuntimeRoot(), 'linked-systems.json');
}

async function readDocument(): Promise<RegistryDocument> {
  try {
    const parsed = JSON.parse(await fs.readFile(registryPath(), 'utf-8')) as RegistryDocument;
    return { version: 1, systems: Array.isArray(parsed.systems) ? parsed.systems : [] };
  } catch {
    return { version: 1, systems: [] };
  }
}

async function writeDocument(document: RegistryDocument) {
  const target = registryPath();
  await fs.mkdir(dirname(target), { recursive: true });
  const temporary = `${target}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(document, null, 2)}\n`, 'utf-8');
  await fs.rename(temporary, target);
}

function serialized<T>(operation: () => Promise<T>): Promise<T> {
  const next = registryQueue.then(operation, operation);
  registryQueue = next.catch(() => undefined);
  return next;
}

export async function listRegisteredSystems(): Promise<RegisteredLinkedSystem[]> {
  return (await readDocument()).systems;
}

export async function registerLinkedSystem(input: {
  id?: string;
  name: string;
  rootPath?: string;
  accessMode: RegisteredLinkedSystem['accessMode'];
  entryCount?: number;
  entries?: Array<{ name: string; type: 'file' | 'dir'; size?: number }>;
}): Promise<RegisteredLinkedSystem> {
  return serialized(async () => {
    const document = await readDocument();
    const rootPath = input.accessMode === 'runtime' && input.rootPath ? resolve(input.rootPath) : undefined;
    if (input.accessMode === 'runtime') {
      if (!rootPath || !(await fs.stat(rootPath).catch(() => null))?.isDirectory()) {
        throw new Error('Runtime-backed systems require an existing directory');
      }
    }
    const existing = document.systems.find((system) =>
      (rootPath && system.rootPath === rootPath) || (input.id && system.id === input.id),
    );
    const system: RegisteredLinkedSystem = {
      id: existing?.id || input.id || `system-${crypto.randomUUID()}`,
      name: input.name.trim().slice(0, 160),
      rootPath,
      accessMode: input.accessMode,
      entryCount: Math.max(0, Number(input.entryCount || 0)),
      entries: Array.isArray(input.entries) ? input.entries.slice(0, 256) : existing?.entries || [],
      linkedAt: existing?.linkedAt || new Date().toISOString(),
    };
    document.systems = [...document.systems.filter((candidate) => candidate.id !== system.id), system];
    await writeDocument(document);
    return system;
  });
}

export async function unregisterLinkedSystem(id: string): Promise<boolean> {
  return serialized(async () => {
    const document = await readDocument();
    const next = document.systems.filter((system) => system.id !== id);
    if (next.length === document.systems.length) return false;
    await writeDocument({ version: 1, systems: next });
    return true;
  });
}

export async function resolveRegisteredSystemFile(systemId: string, filePath: string): Promise<string | null> {
  const system = (await listRegisteredSystems()).find((candidate) => candidate.id === systemId);
  if (!system?.rootPath || system.accessMode !== 'runtime') return null;
  const candidate = resolve(system.rootPath, filePath);
  return isWithin(system.rootPath, candidate) ? candidate : null;
}
