// Shared types and pointer helpers for the Nexus scene modules.
import * as THREE from 'three';
import { ThreeEvent } from '@react-three/fiber';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { GraphNodeAssetOverride, LinkedSystem, NodeCluster } from '@/lib/graphData';
import { NodeAssetFamilyOverrides } from '@/lib/nodeAssets';

export type QualityTier = 'ultra' | 'balanced' | 'safe';
export type OpenDocState = { fileName: string; filePath: string; content: string; truncated: boolean };
export type ChatMessage = { id: string; role: 'user' | 'assistant' | 'system'; content: string };
export type CameraMode = 'overview' | 'focus' | 'manual';
export type ZoomTier = 'detail' | 'cluster' | 'overview';
export type MerkleReplayEntry = { id: number; hash: string; eventType: string; chainTrust: number; drift: number; timestamp: number };
export type AggregateBadge = {
  id: string;
  parentId: string;
  label: string;
  count: number;
  color: string;
  cluster: Exclude<NodeCluster, 'linked-root'>;
  position: [number, number, number];
  active: boolean;
};

export type AssetStageSlot = 'appearance' | 'effect';
export type NodeAccessMode = LinkedSystem['accessMode'] | 'none';
export type NodeCapabilityKind = 'engine' | 'document' | 'folder' | 'system' | 'access' | 'passive';
export type NodeCapabilities = {
  kind: NodeCapabilityKind;
  accessMode: NodeAccessMode;
  system: LinkedSystem | null;
  canExecute: boolean;
  canOpenDocument: boolean;
  canAssignAsset: boolean;
  canClearAsset: boolean;
  canFocus: boolean;
  blockReason: string | null;
};

export type NodeAssetEditState = {
  enabled: boolean;
};

export type EditModeSessionBaseline = {
  overrides: Record<string, GraphNodeAssetOverride>;
  familyProfiles: NodeAssetFamilyOverrides;
};

export const EDIT_MODE_SECRET_CODES = [
  83, 73, 67, 77, 86, 78, 68, 86, 83, 67, 82, 69, 65, 84, 86, 83, 69, 83, 84,
] as const;

export type PendingAssetTarget =
  | { nodeId: string; slot: AssetStageSlot; family?: undefined }
  | { family: 'sentinel'; slot: AssetStageSlot; nodeId?: undefined };
export type ThreePointerEvent = ThreeEvent<PointerEvent>;
export type OrbitControlsRef = OrbitControlsImpl;
export type BeamMaterialRef = THREE.ShaderMaterial & {
  u_time: number;
  u_color: THREE.Color;
};

export function capturePointer(event: ThreePointerEvent) {
  const target = event.target as EventTarget & { setPointerCapture?: (pointerId: number) => void };
  target.setPointerCapture?.(event.pointerId);
}

export function releasePointer(event: ThreePointerEvent) {
  const target = event.target as EventTarget & { releasePointerCapture?: (pointerId: number) => void };
  target.releasePointerCapture?.(event.pointerId);
}

