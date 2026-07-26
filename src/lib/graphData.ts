// Graph data model for the Nexus constellation.
// Defines node families, hierarchy, and the dynamic layout used by the dashboard.
import { Language, translations } from './i18n';

export type NodeCluster = 'dashboard' | 'agents' | 'documents' | 'tools' | 'system' | 'linked-root';
export type NodeImportance = 'primary' | 'secondary' | 'tertiary';
export type NodeMotionProfile = 'static' | 'living' | 'sentinel-linked';

export interface GraphNodeAssetStageOverride {
  src: string;
  enabled?: boolean;
  scale?: number;
  offset?: [number, number, number];
  rotation?: [number, number, number];
  animatedMaterial?: boolean;
  autoplay?: boolean;
  animationClip?: string | '__auto';
  opacity?: number;
  label?: string;
}

export interface GraphNodeAssetOverride {
  appearance?: GraphNodeAssetStageOverride | null;
  effect?: GraphNodeAssetStageOverride | null;
}

export interface GraphNode {
  id: string;
  label: string;
  position: [number, number, number];
  type: 'core' | 'engine' | 'edition' | 'module' | 'file' | 'folder' | 'link-placeholder';
  shape: 'octahedron' | 'tetrahedron' | 'sphere' | 'document' | 'folder-icon';
  size: number;
  parentId: string | null;
  action?: string;
  tooltip: string;
  color?: string;
  filePath?: string;
  cluster?: NodeCluster;
  orbitLevel?: number;
  importance?: NodeImportance;
  systemId?: string | null;
  motionProfile?: NodeMotionProfile;
  assetOverride?: GraphNodeAssetOverride;
}

export interface GraphEdge {
  from: string;
  to: string;
}

export interface ScannedEntry {
  name: string;
  type: 'file' | 'dir';
  size?: number;
}

export interface LinkedSystem {
  id: string;
  name: string;
  rootPath: string;
  entries: ScannedEntry[];
  accessMode?: 'runtime' | 'handle' | 'structural';
}

const CLUSTER_ORDER: Exclude<NodeCluster, 'linked-root'>[] = ['dashboard', 'agents', 'documents', 'tools', 'system'];

export const GRAPH_CLUSTER_CONFIG: Record<NodeCluster, { label: string; color: string; tooltip: string }> = {
  'linked-root': {
    label: 'LINKED_SYSTEM',
    color: '#ffffff',
    tooltip: 'Linked sovereign system gateway.',
  },
  dashboard: {
    label: 'DASHBOARD',
    color: '#38bdf8',
    tooltip: 'Interface, UI surface, and presentation layer.',
  },
  agents: {
    label: 'AGENTS',
    color: '#a78bfa',
    tooltip: 'Agents, orchestration, and automation workers.',
  },
  documents: {
    label: 'DOCUMENTS',
    color: '#e2e8f0',
    tooltip: 'Knowledge, manifests, contexts, and narrative records.',
  },
  tools: {
    label: 'TOOLS',
    color: '#f59e0b',
    tooltip: 'Runtime tools, scripts, APIs, and operational utilities.',
  },
  system: {
    label: 'SYSTEM',
    color: '#22d3ee',
    tooltip: 'Residual runtime structure and uncategorized system assets.',
  },
};

// Helper: distribute children around a parent in 3D.
function fanPositions(
  center: [number, number, number],
  count: number,
  radius: number,
  yOffset = 0,
  startAngle = 0,
): [number, number, number][] {
  const positions: [number, number, number][] = [];
  for (let i = 0; i < count; i++) {
    const angle = startAngle + (i / Math.max(count, 1)) * Math.PI * 2;
    positions.push([
      center[0] + Math.cos(angle) * radius,
      center[1] + yOffset,
      center[2] + Math.sin(angle) * radius,
    ]);
  }
  return positions;
}

function normalizeEntryName(name: string) {
  return name.toLowerCase().trim();
}

function classifyEntry(entry: ScannedEntry): Exclude<NodeCluster, 'linked-root'> {
  const lowerName = normalizeEntryName(entry.name);
  const ext = lowerName.includes('.') ? lowerName.split('.').pop() || '' : '';

  const dashboardHints = ['dashboard', 'app', 'src', 'public', 'components', 'ui', 'pages', 'web', 'frontend'];
  const agentHints = ['agents', 'agent', '.agents', 'bots', 'workers', 'skills', 'mcp', 'automation'];
  const documentHints = ['docs', 'readme', 'context', 'manifest', 'notes', 'changelog'];
  const toolHints = ['tools', 'scripts', 'bin', 'cli', 'lib', 'utils', 'api', 'server'];

  if (dashboardHints.some((hint) => lowerName.includes(hint))) return 'dashboard';
  if (agentHints.some((hint) => lowerName.includes(hint))) return 'agents';
  if (documentHints.some((hint) => lowerName.includes(hint)) || ['md', 'txt', 'pdf'].includes(ext)) return 'documents';
  if (toolHints.some((hint) => lowerName.includes(hint)) || ['py', 'json', 'ts', 'tsx', 'js', 'sh'].includes(ext)) return 'tools';
  return 'system';
}

function buildEntryNode(
  base: {
    projectId: string;
    systemId: string | null;
    rootPath: string;
    parentId: string;
    entry: ScannedEntry;
    position: [number, number, number];
    cluster: Exclude<NodeCluster, 'linked-root'>;
    size: number;
    orbitLevel: number;
  },
): GraphNode {
  const accent = GRAPH_CLUSTER_CONFIG[base.cluster].color;
  return {
    id: `${base.projectId}-${base.parentId}-${base.entry.name}`,
    label: base.entry.name,
    position: base.position,
    type: base.entry.type === 'dir' ? 'folder' : 'file',
    shape: base.entry.type === 'dir' ? 'folder-icon' : 'document',
    size: base.size,
    parentId: base.parentId,
    tooltip: base.entry.type === 'dir'
      ? `Directory cluster member: ${base.entry.name}/`
      : `File cluster member: ${base.entry.name}`,
    color: accent,
    filePath: base.entry.type === 'file' ? `${base.rootPath.replace(/\\/g, '/')}/${base.entry.name}` : undefined,
    cluster: base.cluster,
    orbitLevel: base.orbitLevel,
    importance: 'tertiary',
    systemId: base.systemId,
    motionProfile: base.entry.type === 'dir' ? 'living' : 'static',
  };
}

const linkProjectPosition: [number, number, number] = [-18, -0.8, 0];

function getLinkedSystemPosition(index: number, totalSystems: number): [number, number, number] {
  if (totalSystems <= 1) return linkProjectPosition;
  if (index === 0) return linkProjectPosition;

  const satelliteCount = Math.max(totalSystems - 1, 1);
  const orbitRadius = 10.2 + Math.max(0, totalSystems - 4) * 1.45;
  const satellites = fanPositions(
    [linkProjectPosition[0] - 6.6, linkProjectPosition[1], linkProjectPosition[2]],
    satelliteCount,
    orbitRadius,
    0.18,
    Math.PI / 8,
  );
  return satellites[Math.min(index - 1, satellites.length - 1)];
}

export function buildStaticGraph(lang: Language, linkedSystemCount = 0): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const t = translations[lang];
  const nodes: GraphNode[] = [{
    id: 'core',
    label: 'ETHERNIUM FRUGAL',
    position: [0, 0, 0],
    type: 'core',
    shape: 'octahedron',
    size: 1.95,
    parentId: null,
    tooltip: 'Sole cognitive runtime and authority of Ethernium Personal.',
    color: '#ffffff',
    orbitLevel: 0,
    importance: 'primary',
    systemId: null,
    motionProfile: 'sentinel-linked',
  }];
  const edges: GraphEdge[] = [];

  const positions = fanPositions([0, 0, 0], 5, 9.8, 0.4, Math.PI / 8);
  const components: Array<{
    id: string;
    label: string;
    tooltip: string;
    color: string;
    type: GraphNode['type'];
  }> = [
    {
      id: 'seneschal',
      label: 'SENESCHAL',
      tooltip: 'Real consultative MCP preflight. It cannot mutate or become cognitive authority.',
      color: '#a78bfa',
      type: 'engine',
    },
    {
      id: 'chronolith',
      label: 'CHRONOLITH',
      tooltip: 'Read-only release and integrity evidence verifier.',
      color: '#f59e0b',
      type: 'engine',
    },
    {
      id: 'thestral',
      label: 'THESTRAL',
      tooltip: 'Same-origin browser gateway and visual runtime selector.',
      color: '#38bdf8',
      type: 'module',
    },
    {
      id: 'invictvs',
      label: 'INVICTVS',
      tooltip: 'Visual-only WebGL mask. Every cognitive request delegates to FRUGAL.',
      color: '#22d3ee',
      type: 'module',
    },
    {
      id: 'conekta',
      label: 'CONEKTA',
      tooltip: 'This federated read/request surface; it does not own cognition.',
      color: '#4ade80',
      type: 'module',
    },
  ];

  components.forEach((component, index) => {
    nodes.push({
      id: component.id,
      label: component.label,
      position: positions[index],
      type: component.type,
      shape: component.type === 'engine' ? 'tetrahedron' : 'sphere',
      size: 1.05,
      parentId: 'core',
      tooltip: component.tooltip,
      color: component.color,
      orbitLevel: 1,
      importance: 'secondary',
      systemId: null,
      motionProfile: 'living',
    });
    edges.push({ from: 'core', to: component.id });
  });

  const aetherPosition = fanPositions(positions[2], 1, 4.2, -0.7, Math.PI / 3)[0];
  nodes.push({
    id: 'aether-lite',
    label: 'AETHER LITE',
    position: aetherPosition,
    type: 'module',
    shape: 'sphere',
    size: 0.62,
    parentId: 'thestral',
    tooltip: '80-particle Canvas 2D fallback; presentation only, never a cognitive runtime.',
    color: '#94a3b8',
    orbitLevel: 2,
    importance: 'tertiary',
    systemId: null,
    motionProfile: 'living',
  });
  edges.push({ from: 'thestral', to: 'aether-lite' });
  edges.push({ from: 'thestral', to: 'invictvs' });

  nodes.push({
    id: 'link-project-control',
    label: t['graph.link.label'] || 'LINK PROJECT',
    position: getLinkedSystemPosition(linkedSystemCount, linkedSystemCount + 1),
    type: 'link-placeholder',
    shape: 'sphere',
    size: 0.92,
    parentId: null,
    tooltip: t['graph.link.tooltip'] || 'Click to link an external project directory.',
    color: '#64748b',
    cluster: 'linked-root',
    orbitLevel: 1,
    importance: 'secondary',
    systemId: null,
    motionProfile: 'living',
  });

  return { nodes, edges };
}

export function buildProjectNodes(
  system: LinkedSystem,
  lang: Language,
  slotIndex = 0,
  totalSystems = 1,
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const t = translations[lang];
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  const projectCenter = getLinkedSystemPosition(slotIndex, totalSystems);
  const projectId = `project-${system.id}`;
  const entries = system.entries;

  nodes.push({
    id: projectId,
    label: system.name.toUpperCase(),
    position: projectCenter,
    type: 'module',
    shape: 'sphere',
    size: 1.34,
    parentId: 'core',
    tooltip: `Linked project: ${system.name}`,
    color: GRAPH_CLUSTER_CONFIG['linked-root'].color,
    cluster: 'linked-root',
    orbitLevel: 1,
    importance: 'primary',
    systemId: system.id,
    motionProfile: 'sentinel-linked',
  });
  edges.push({ from: 'core', to: projectId });

  const buckets: Record<Exclude<NodeCluster, 'linked-root'>, ScannedEntry[]> = {
    dashboard: [],
    agents: [],
    documents: [],
    tools: [],
    system: [],
  };

  entries.forEach((entry) => {
    buckets[classifyEntry(entry)].push(entry);
  });

  const nonEmptyBuckets = CLUSTER_ORDER.filter((cluster) => buckets[cluster].length > 0).length;
  const adaptiveRings = entries.length >= 8 && nonEmptyBuckets >= 3;

  if (!adaptiveRings) {
    const childRadius = Math.max(7.1, 6.8 + Math.min(entries.length, 10) * 0.22);
    const childPositions = fanPositions(projectCenter, entries.length, childRadius, 0.18, Math.PI / 8);

    entries.forEach((entry, i) => {
      const cluster = classifyEntry(entry);
      const node = buildEntryNode({
        projectId,
        systemId: system.id,
        rootPath: system.rootPath,
        parentId: projectId,
        entry,
        position: childPositions[i],
        cluster,
        size: entry.type === 'dir' ? 0.54 : 0.36,
        orbitLevel: 1,
      });
      nodes.push(node);
      edges.push({ from: projectId, to: node.id });
    });

    return { nodes, edges };
  }

    const clusterPositions = fanPositions(projectCenter, CLUSTER_ORDER.length, 7.85, 0.22, Math.PI / 1.92);

  CLUSTER_ORDER.forEach((cluster, clusterIndex) => {
    const bucket = buckets[cluster];
    const config = GRAPH_CLUSTER_CONFIG[cluster];
    const translatedLabel = t[`graph.cluster.${cluster}`] || config.label;
    const translatedTooltip = t[`graph.cluster.${cluster}.tooltip`] || config.tooltip;
    const clusterId = `${projectId}-${cluster}`;
    const clusterHasPayload = bucket.length > 0;

    nodes.push({
      id: clusterId,
      label: translatedLabel,
      position: clusterPositions[clusterIndex],
      type: 'module',
      shape: 'sphere',
      size: clusterHasPayload ? 0.84 : 0.62,
      parentId: projectId,
      tooltip: clusterHasPayload ? `${translatedTooltip} [${bucket.length}]` : translatedTooltip,
      color: clusterHasPayload ? config.color : '#475569',
      cluster,
      orbitLevel: 2,
      importance: 'secondary',
      systemId: system.id,
      motionProfile: clusterHasPayload ? 'living' : 'static',
    });
    edges.push({ from: projectId, to: clusterId });

    if (!clusterHasPayload) return;

    const miniRadius = Math.max(3.55, 3.1 + Math.min(bucket.length, 8) * 0.24);
    const childPositions = fanPositions(
      clusterPositions[clusterIndex],
      bucket.length,
      miniRadius,
      -0.2,
      Math.PI / 6 + clusterIndex * 0.24,
    );

    bucket.forEach((entry, entryIndex) => {
      const node = buildEntryNode({
        projectId,
        systemId: system.id,
        rootPath: system.rootPath,
        parentId: clusterId,
        entry,
        position: childPositions[entryIndex],
        cluster,
        size: entry.type === 'dir' ? 0.48 : 0.34,
        orbitLevel: 3,
      });
      nodes.push(node);
      edges.push({ from: clusterId, to: node.id });
    });
  });

  return { nodes, edges };
}
