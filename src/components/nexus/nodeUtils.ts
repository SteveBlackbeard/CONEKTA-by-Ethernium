// Pure helpers for node classification, capabilities, and zoom behavior.
import { GraphNode, GraphNodeAssetOverride, GraphNodeAssetStageOverride, LinkedSystem, NodeCluster } from '@/lib/graphData';
import { DashboardSignals } from '@/lib/telemetry';
import { NodeAccessMode, NodeCapabilities, ZoomTier } from './types';

export function mergeGraphNodeAssetOverride(
  base?: GraphNodeAssetOverride,
  draft?: GraphNodeAssetOverride,
): GraphNodeAssetOverride | undefined {
  if (!base && !draft) return undefined;
  const mergedAppearance = (base?.appearance || draft?.appearance)
    ? {
        ...(base?.appearance || {}),
        ...(draft?.appearance || {}),
      }
    : undefined;
  const mergedEffect = (base?.effect || draft?.effect)
    ? {
        ...(base?.effect || {}),
        ...(draft?.effect || {}),
      }
    : undefined;
  return {
    ...base,
    ...draft,
    appearance: mergedAppearance?.src ? (mergedAppearance as GraphNodeAssetStageOverride) : base?.appearance,
    effect: mergedEffect?.src ? (mergedEffect as GraphNodeAssetStageOverride) : base?.effect,
  };
}

export function deriveZoomTier(zoom: number): ZoomTier {
  if (zoom >= 34) return 'detail';
  if (zoom >= 24) return 'cluster';
  return 'overview';
}

export function inferAggregateCluster(node: GraphNode): Exclude<NodeCluster, 'linked-root'> {
  if (node.cluster && node.cluster !== 'linked-root') return node.cluster;

  if (node.type === 'folder') return 'system';

  const lower = node.label.toLowerCase();
  if (lower.endsWith('.md') || lower.endsWith('.txt') || lower.endsWith('.pdf')) return 'documents';
  if (lower.endsWith('.py') || lower.endsWith('.json') || lower.endsWith('.ts') || lower.endsWith('.tsx') || lower.endsWith('.js') || lower.endsWith('.sh')) {
    return 'tools';
  }
  return 'system';
}

export function shouldRenderNodeForZoomTier(
  node: GraphNode,
  zoomTier: ZoomTier,
  highlightedIds: Set<string>,
) {
  if (highlightedIds.has(node.id)) return true;
  return true;
}

export function shouldRenderNodeLabel(
  node: GraphNode,
  zoomTier: ZoomTier,
  hovered: boolean,
  isSelected: boolean,
) {
  if (hovered || isSelected) return true;

  if (zoomTier === 'detail') {
    return node.type === 'core' || node.type === 'engine' || node.type === 'edition' || node.type === 'module';
  }

  if (zoomTier === 'cluster') {
    return node.type === 'core' || node.type === 'engine' || node.type === 'edition' || node.type === 'module';
  }

  return node.type === 'core' || node.type === 'edition' || node.cluster === 'linked-root';
}

export function getNodeBadge(node: GraphNode) {
  const lowerLabel = node.label.toLowerCase();
  if (node.id === 'imperium') return 'IMPERIUM_NODE';
  if (node.cluster === 'linked-root') return 'LINKED_SYSTEM';
  if (node.cluster === 'dashboard' && node.orbitLevel === 2) return 'DASHBOARD_CORE';
  if (node.cluster === 'agents' && node.orbitLevel === 2) return 'AGENT_CORE';
  if (node.cluster === 'documents' && node.orbitLevel === 2) return 'DOCUMENT_CORE';
  if (node.cluster === 'tools' && node.orbitLevel === 2) return 'TOOL_CORE';
  if (node.cluster === 'system' && node.orbitLevel === 2) return 'SYSTEM_CORE';
  if (node.type === 'core') return 'SOVEREIGN_CORE';
  if (node.type === 'engine') return 'ACTIVE_ENGINE';
  if (node.type === 'edition') return 'EDITION_NODE';
  if (node.type === 'module') return 'LINKED_MODULE';
  if (node.type === 'folder') return 'DIRECTORY_OBJECT';
  if (node.type === 'link-placeholder') return 'ACCESS_PORT';
  if (lowerLabel.endsWith('.py')) return 'PY_EXEC';
  if (lowerLabel.endsWith('.json')) return 'JSON_STATE';
  if (lowerLabel.endsWith('.md')) return 'MARKDOWN';
  return 'FILE_OBJECT';
}

export function getNodeAccent(node: GraphNode, signals: DashboardSignals, materialColor: string) {
  if (node.type === 'core') return signals.palette.emphasis;
  if (node.type === 'engine') return signals.palette.secondary;
  if (node.type === 'edition') return node.color || signals.palette.warning;
  if (node.type === 'module') return node.color || signals.palette.emphasis;
  if (node.type === 'folder') return node.color || signals.palette.accent;
  if (node.type === 'link-placeholder') return node.color || signals.palette.warning;
  return materialColor;
}

export type NodeActivityState = 'neutral' | 'active' | 'muted';

export function resolveLinkedSystemId(nodeId: string, linkedSystems: LinkedSystem[]) {
  for (const system of linkedSystems) {
    const rootId = `project-${system.id}`;
    if (nodeId === rootId || nodeId.startsWith(`${rootId}-`)) {
      return system.id;
    }
  }
  return null;
}

export function inferMotionProfile(node: GraphNode) {
  if (node.motionProfile) return node.motionProfile;
  if (node.type === 'core') return 'sentinel-linked';
  if (node.type === 'engine' || node.type === 'edition' || node.type === 'module' || node.type === 'link-placeholder') {
    return 'living';
  }
  return node.type === 'folder' ? 'living' : 'static';
}

export function getNodeSystem(node: GraphNode, linkedSystems: LinkedSystem[]) {
  const systemId = node.systemId || resolveLinkedSystemId(node.id, linkedSystems);
  return systemId ? linkedSystems.find((system) => system.id === systemId) || null : null;
}

export function getNodeCapabilities(node: GraphNode | null, linkedSystems: LinkedSystem[], hasAssetOverride: boolean): NodeCapabilities {
  if (!node) {
    return {
      kind: 'passive',
      accessMode: 'none',
      system: null,
      canExecute: false,
      canOpenDocument: false,
      canAssignAsset: false,
      canClearAsset: false,
      canFocus: false,
      blockReason: null,
    };
  }

  const system = getNodeSystem(node, linkedSystems);
  const accessMode: NodeAccessMode = system?.accessMode || 'none';

  if (node.type === 'link-placeholder') {
    return {
      kind: 'access',
      accessMode,
      system,
      canExecute: false,
      canOpenDocument: false,
      canAssignAsset: true,
      canClearAsset: hasAssetOverride,
      canFocus: true,
      blockReason: null,
    };
  }

  if (node.action) {
    return {
      kind: 'engine',
      accessMode,
      system,
      canExecute: true,
      canOpenDocument: false,
      canAssignAsset: true,
      canClearAsset: hasAssetOverride,
      canFocus: true,
      blockReason: null,
    };
  }

  if (node.filePath) {
    const blocked = system?.accessMode === 'structural';
    return {
      kind: 'document',
      accessMode,
      system,
      canExecute: false,
      canOpenDocument: !blocked,
      canAssignAsset: true,
      canClearAsset: hasAssetOverride,
      canFocus: true,
      blockReason: blocked ? 'STRUCTURAL_ONLY_LINK' : null,
    };
  }

  if (node.type === 'folder') {
    return {
      kind: 'folder',
      accessMode,
      system,
      canExecute: false,
      canOpenDocument: false,
      canAssignAsset: true,
      canClearAsset: hasAssetOverride,
      canFocus: true,
      blockReason: null,
    };
  }

  return {
    kind: 'system',
    accessMode,
    system,
    canExecute: false,
    canOpenDocument: false,
    canAssignAsset: true,
    canClearAsset: hasAssetOverride,
    canFocus: true,
    blockReason: null,
  };
}

export function formatReplayAge(timestamp: number) {
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h`;
}

