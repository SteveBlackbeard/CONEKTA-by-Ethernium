"use client";
import React, { useCallback, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Html, Octahedron, Sphere, Text } from '@react-three/drei';
import { GraphNode } from '@/lib/graphData';
import { getNodeAssetProfile, nodeUsesExternalAsset, NodeAssetFamilyOverrides } from '@/lib/nodeAssets';
import { createNodeGlyphTexture, DocumentGlyphKind } from '@/lib/nodeGlyphTextures';
import { DashboardSignals } from '@/lib/telemetry';
import NodeAssetRig from '../NodeAssetRig';
import { NodeAssetErrorBoundary } from './errorBoundaries';
import { AssetStageSlot, capturePointer, releasePointer, ThreePointerEvent, ZoomTier } from './types';
import { getNodeAccent, getNodeBadge, inferMotionProfile, NodeActivityState, shouldRenderNodeLabel } from './nodeUtils';

function NodeGlyphSprite({
  kind,
  accent,
  scale,
  opacity = 1,
}: {
  kind: DocumentGlyphKind;
  accent: string;
  scale: number;
  opacity?: number;
}) {
  const texture = useMemo(() => createNodeGlyphTexture(kind, accent), [accent, kind]);
  const aspect = kind === 'folder' ? 0.86 : 1;
  return (
    <sprite scale={[scale * aspect, scale, 1]}>
      <spriteMaterial
        map={texture}
        transparent
        depthWrite={false}
        opacity={opacity}
        color="#ffffff"
      />
    </sprite>
  );
}

function NodeAnchor({
  position,
  children,
}: {
  position: [number, number, number];
  children: React.ReactNode;
}) {
  return <group position={position}>{children}</group>;
}

function NodeLabel({
  badge,
  label,
  color,
  compact = false,
  opacity = 0.94,
}: {
  badge: string;
  label: string;
  color: string;
  compact?: boolean;
  opacity?: number;
}) {
  return (
    <group position={[0, 0.06, 0]}>
      <Text
        position={[0, 0, compact ? -0.34 : -0.42]}
        rotation={[-Math.PI / 2, 0, 0]}
        color="#cbd5e1"
        fontSize={compact ? 0.12 : 0.13}
        anchorX="center"
        anchorY="middle"
        maxWidth={compact ? 4.4 : 5.6}
        outlineWidth={0.012}
        outlineColor="#020617"
        fillOpacity={Math.max(0.34, opacity * 0.74)}
      >
        {badge}
      </Text>
      <Text
        position={[0, 0, compact ? -0.08 : -0.18]}
        rotation={[-Math.PI / 2, 0, 0]}
        color={color}
        fontSize={compact ? 0.17 : 0.2}
        anchorX="center"
        anchorY="middle"
        maxWidth={compact ? 4.6 : 5.8}
        outlineWidth={0.016}
        outlineColor="#020617"
        fillOpacity={opacity}
      >
        {label}
      </Text>
    </group>
  );
}

// SYSTEM NODE
export function SystemNode({
  node, isPulsing, isSelected = false, drift = 0.0, signals, zoomTier, reducedMotion = false, familyAssetOverrides, activityState = 'neutral', editMode, onHover, onUnhover, onClick, onOpenAssetPicker, onSelectForEdit, onDraftAssetOffset, onCommitAssetOffset, onDraftAssetRotation, onCommitAssetRotation, onDraftAssetScale, onCommitAssetScale, imperiumOrbit,
}: {
  node: GraphNode;
  isPulsing?: boolean;
  isSelected?: boolean;
  drift?: number;
  signals: DashboardSignals;
  zoomTier: ZoomTier;
  reducedMotion?: boolean;
  familyAssetOverrides?: NodeAssetFamilyOverrides;
  activityState?: NodeActivityState;
  editMode?: boolean;
  onHover: (n: GraphNode) => void;
  onUnhover: () => void;
  onClick: (n: GraphNode) => void;
  onOpenAssetPicker?: (node: GraphNode, slot: AssetStageSlot) => void;
  onSelectForEdit?: (node: GraphNode) => void;
  onDraftAssetOffset?: (nodeId: string, offset: [number, number, number]) => void;
  onCommitAssetOffset?: (nodeId: string) => void;
  onDraftAssetRotation?: (nodeId: string, rotation: [number, number, number]) => void;
  onCommitAssetRotation?: (nodeId: string) => void;
  onDraftAssetScale?: (nodeId: string, scale: number) => void;
  onCommitAssetScale?: (nodeId: string) => void;
  imperiumOrbit?: { center: [number, number, number]; radius: number };
}) {
  const [hovered, setHovered] = useState(false);
  const groupRef = useRef<THREE.Group>(null!);
  const anchorRef = useRef<THREE.Group>(null!);
  const draggingRef = useRef(false);
  const rotatingRef = useRef(false);
  const scalingRef = useRef(false);
  const isImperium = node.id === 'imperium';
  const isLinkPlaceholder = node.type === 'link-placeholder';
  const baseColor = node.color || '#888';
  const activeColor = isLinkPlaceholder
    ? (hovered ? '#94a3b8' : baseColor)
    : hovered
    ? '#93c5fd'
    : isSelected
    ? signals.palette.warning
    : baseColor;
  const materialColor = activeColor;
  const familyAccent = getNodeAccent(node, signals, materialColor);
  const badge = getNodeBadge(node);
  const isMuted = activityState === 'muted';
  const severityBoost = signals.mode === 'INCIDENT' ? 1 + signals.severity * 0.08 : 1;
  const importanceBoost = node.importance === 'primary' ? 1.08 : node.importance === 'secondary' ? 1 : 0.94;
  const activityBoost = activityState === 'active' ? 1.05 : isMuted ? 0.94 : 1;
  const interactionScale = isLinkPlaceholder ? (hovered ? 1.03 : 1) : hovered ? 1.11 : isSelected ? 1.06 : activityState === 'active' ? 1.02 : 1;
  const scale = (node.size * interactionScale * activityBoost) * (isPulsing ? 1.08 : 1) * severityBoost * importanceBoost;
  const labelOpacity = isLinkPlaceholder ? (hovered ? 0.9 : 0.8) : isMuted ? 0.46 : activityState === 'active' ? 1 : 0.94;
  const showLabel = shouldRenderNodeLabel(node, zoomTier, hovered, isSelected);
  const motionProfile = inferMotionProfile(node);

  const resolvedAssetProfile = getNodeAssetProfile(node, familyAssetOverrides);
  const usesExternalAsset = nodeUsesExternalAsset(node, familyAssetOverrides);
  const showEditOverlay = Boolean(editMode && usesExternalAsset && node.type !== 'file' && node.type !== 'folder');
  const assetResetKey = `${node.id}:${resolvedAssetProfile.appearance.src}:${resolvedAssetProfile.effect?.src || ''}`;
  const pOver = useCallback(() => { setHovered(true); onHover(node); }, [node, onHover]);
  const pOut = useCallback(() => { setHovered(false); onUnhover(); }, [onUnhover]);
  const pClick = useCallback(() => onClick(node), [node, onClick]);
  const assetOffsetY = resolvedAssetProfile.appearance.offset?.[1] ?? 0;
  const assetRotation = useMemo(
    () => resolvedAssetProfile.appearance.rotation || [0, 0, 0],
    [resolvedAssetProfile.appearance.rotation],
  );
  const editRingRadius = Math.max(scale * 1.08, 0.8);
  const editHandlePosition: [number, number, number] = [
    Math.sin(assetRotation[1] || 0) * editRingRadius,
    0.04,
    Math.cos(assetRotation[1] || 0) * editRingRadius,
  ];
  const scaleHandlePosition: [number, number, number] = [
    Math.sin((assetRotation[1] || 0) + Math.PI / 2) * (editRingRadius + 0.34),
    0.04,
    Math.cos((assetRotation[1] || 0) + Math.PI / 2) * (editRingRadius + 0.34),
  ];
  const startDrag = useCallback((event: ThreePointerEvent) => {
    if (!editMode || !usesExternalAsset) return;
    draggingRef.current = true;
    event.stopPropagation();
    capturePointer(event);
    onSelectForEdit?.(node);
  }, [editMode, node, onSelectForEdit, usesExternalAsset]);
  const moveDrag = useCallback((event: ThreePointerEvent) => {
    if (!draggingRef.current || !editMode || !usesExternalAsset) return;
    event.stopPropagation();
    const nextOffset: [number, number, number] = [
      event.point.x - node.position[0],
      assetOffsetY,
      event.point.z - node.position[2],
    ];
    onDraftAssetOffset?.(node.id, nextOffset);
  }, [assetOffsetY, editMode, node.id, node.position, onDraftAssetOffset, usesExternalAsset]);
  const endDrag = useCallback((event: ThreePointerEvent) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    event.stopPropagation();
    releasePointer(event);
    onCommitAssetOffset?.(node.id);
  }, [node.id, onCommitAssetOffset]);
  const startRotate = useCallback((event: ThreePointerEvent) => {
    if (!editMode || !usesExternalAsset) return;
    rotatingRef.current = true;
    event.stopPropagation();
    capturePointer(event);
    onSelectForEdit?.(node);
  }, [editMode, node, onSelectForEdit, usesExternalAsset]);
  const moveRotate = useCallback((event: ThreePointerEvent) => {
    if (!rotatingRef.current || !editMode || !usesExternalAsset) return;
    event.stopPropagation();
    const dx = event.point.x - node.position[0];
    const dz = event.point.z - node.position[2];
    const nextHeading = Math.atan2(dx, dz);
    const nextRotation: [number, number, number] = [assetRotation[0] || 0, nextHeading, assetRotation[2] || 0];
    onDraftAssetRotation?.(node.id, nextRotation);
  }, [assetRotation, editMode, node.id, node.position, onDraftAssetRotation, usesExternalAsset]);
  const endRotate = useCallback((event: ThreePointerEvent) => {
    if (!rotatingRef.current) return;
    rotatingRef.current = false;
    event.stopPropagation();
    releasePointer(event);
    onCommitAssetRotation?.(node.id);
  }, [node.id, onCommitAssetRotation]);
  const startScale = useCallback((event: ThreePointerEvent) => {
    if (!editMode || !usesExternalAsset) return;
    scalingRef.current = true;
    event.stopPropagation();
    capturePointer(event);
    onSelectForEdit?.(node);
  }, [editMode, node, onSelectForEdit, usesExternalAsset]);
  const moveScale = useCallback((event: ThreePointerEvent) => {
    if (!scalingRef.current || !editMode || !usesExternalAsset) return;
    event.stopPropagation();
    const dx = event.point.x - node.position[0];
    const dz = event.point.z - node.position[2];
    const distance = Math.max(0.15, Math.sqrt(dx * dx + dz * dz));
    const nextScale = THREE.MathUtils.clamp(distance / Math.max(editRingRadius, 0.0001), 0.18, 6);
    onDraftAssetScale?.(node.id, nextScale);
  }, [editMode, editRingRadius, node.id, node.position, onDraftAssetScale, usesExternalAsset]);
  const endScale = useCallback((event: ThreePointerEvent) => {
    if (!scalingRef.current) return;
    scalingRef.current = false;
    event.stopPropagation();
    releasePointer(event);
    onCommitAssetScale?.(node.id);
  }, [node.id, onCommitAssetScale]);
  const solidOpacity = isLinkPlaceholder
    ? (hovered ? 0.42 : 0.26)
    : isSelected
    ? 0.92
    : hovered
    ? 0.88
    : isMuted
    ? 0.42
    : 0.74;
  const wireOpacity = isLinkPlaceholder
    ? 0.08
    : isSelected
    ? 0.24
    : hovered
    ? 0.18
    : 0.12;

  const assetFallback = (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[Math.max(scale * 0.34, 0.18), Math.max(scale * 0.5, 0.26), 42]} />
        <meshBasicMaterial color={familyAccent} transparent opacity={Math.max(0.32, solidOpacity * 0.72)} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <circleGeometry args={[Math.max(scale * 0.28, 0.14), 42]} />
        <meshBasicMaterial color={familyAccent} transparent opacity={Math.max(0.2, solidOpacity * 0.44)} />
      </mesh>
    </group>
  );
  const assetSupportVisual = (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
        <ringGeometry args={[Math.max(scale * 0.42, 0.22), Math.max(scale * 0.62, 0.32), 48]} />
        <meshBasicMaterial color={familyAccent} transparent opacity={Math.max(0.18, solidOpacity * 0.42)} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.03, 0]}>
        <circleGeometry args={[Math.max(scale * 0.18, 0.1), 32]} />
        <meshBasicMaterial color={familyAccent} transparent opacity={Math.max(0.14, solidOpacity * 0.2)} />
      </mesh>
    </group>
  );
  const assetHybridBody = node.shape === 'octahedron'
    ? (
      <group>
        <Octahedron args={[scale * 0.72, 0]}>
          <meshBasicMaterial color={familyAccent} transparent opacity={Math.max(0.26, solidOpacity * 0.52)} />
        </Octahedron>
        <Octahedron args={[scale * 0.76, 0]}>
          <meshBasicMaterial color={familyAccent} transparent opacity={Math.max(0.14, wireOpacity * 1.2)} wireframe />
        </Octahedron>
      </group>
    )
    : node.shape === 'tetrahedron'
    ? (
      <group>
        <mesh>
          <tetrahedronGeometry args={[scale * 0.72, 0]} />
          <meshStandardMaterial
            color={familyAccent}
            emissive={familyAccent}
            emissiveIntensity={0.12 + (hovered || isSelected ? 0.08 : 0)}
            metalness={0.88}
            roughness={0.22}
            transparent
            opacity={Math.max(0.24, solidOpacity * 0.46)}
          />
        </mesh>
        <mesh>
          <tetrahedronGeometry args={[scale * 0.76, 0]} />
          <meshBasicMaterial color={familyAccent} transparent opacity={Math.max(0.1, wireOpacity * 1.2)} wireframe />
        </mesh>
      </group>
    )
    : node.shape === 'sphere'
    ? (
      <group>
        <Sphere args={[scale * 0.38, 24, 24]}>
          <meshStandardMaterial
            color={familyAccent}
            emissive={familyAccent}
            emissiveIntensity={0.08 + (hovered || isSelected ? 0.08 : 0)}
            metalness={0.62}
            roughness={0.34}
            transparent
            opacity={Math.max(0.22, solidOpacity * 0.34)}
          />
        </Sphere>
        <Sphere args={[scale * 0.42, 20, 20]}>
          <meshBasicMaterial color={familyAccent} transparent opacity={Math.max(0.1, wireOpacity)} wireframe />
        </Sphere>
      </group>
    )
    : node.shape === 'document'
    ? (
      <NodeGlyphSprite
        kind={
          node.label.toLowerCase().endsWith('.py')
            ? 'python'
            : node.label.toLowerCase().endsWith('.json')
            ? 'json'
            : node.label.toLowerCase().endsWith('.md')
            ? 'markdown'
            : 'generic'
        }
        accent={familyAccent}
        scale={scale * 1.36}
        opacity={Math.max(0.34, labelOpacity * 0.8)}
      />
    )
    : node.shape === 'folder-icon'
    ? <NodeGlyphSprite kind="folder" accent={familyAccent} scale={scale * 1.28} opacity={Math.max(0.34, labelOpacity * 0.8)} />
    : null;

  const wrapWithAnchor = (children: React.ReactNode) =>
    isImperium ? <group ref={anchorRef}>{children}</group> : <NodeAnchor position={node.position}>{children}</NodeAnchor>;

  useFrame((state) => {
    if (!isImperium || !imperiumOrbit || !anchorRef.current) return;
    const t = state.clock.elapsedTime;
    const angle = t * 0.08;
    anchorRef.current.position.set(
      imperiumOrbit.center[0] + Math.cos(angle) * imperiumOrbit.radius,
      node.position[1],
      imperiumOrbit.center[2] + Math.sin(angle) * imperiumOrbit.radius,
    );
  });

  useFrame((state, delta) => {
    if (!groupRef.current) return;
    const t = state.clock.elapsedTime + node.id.length * 0.09;
    const motionEnergy = reducedMotion ? 0 : motionProfile === 'sentinel-linked' ? 0.72 : motionProfile === 'living' ? 0.42 : 0.14;
    const pulse = isPulsing ? 0.032 : hovered || isSelected ? 0.022 : 0.012;
    const driftWave = Math.min(0.012, drift * 0.06);
    const zoomDamp = zoomTier === 'overview' ? 0.4 : zoomTier === 'cluster' ? 0.7 : 1;
    const baseVerticalDrift = node.shape === 'sphere'
      ? 0.009
      : node.type === 'file' || node.type === 'folder'
      ? 0.004
      : 0.006;
    const anchorLerp = 1 - Math.exp(-delta * 7.5);
    const organicScale = 1 + (Math.sin(t * (node.shape === 'sphere' ? 1.8 : 2.4)) * pulse + driftWave) * motionEnergy * zoomDamp;
    const targetX = 0;
    const targetZ = 0;
    const targetY = node.shape === 'sphere'
      ? Math.sin(t * 1.16 + node.size) * baseVerticalDrift * motionEnergy
      : Math.sin(t * 1.5 + node.position[2] * 0.2) * baseVerticalDrift * motionEnergy;
    groupRef.current.scale.setScalar(organicScale);
    groupRef.current.position.x = THREE.MathUtils.lerp(groupRef.current.position.x, targetX, anchorLerp);
    groupRef.current.position.z = THREE.MathUtils.lerp(groupRef.current.position.z, targetZ, anchorLerp);
    groupRef.current.position.y = THREE.MathUtils.lerp(groupRef.current.position.y, targetY, anchorLerp);
    groupRef.current.rotation.y = (node.shape === 'octahedron' || node.shape === 'tetrahedron')
      ? Math.sin(t * 0.9) * 0.1 * motionEnergy
      : Math.sin(t * 0.42) * 0.04 * motionEnergy;
    groupRef.current.rotation.x = node.shape === 'tetrahedron'
      ? 0.05 + Math.cos(t * 1.1) * 0.04 * motionEnergy
      : 0;
  });

  if (usesExternalAsset) {
    return wrapWithAnchor(
      <group ref={groupRef} onPointerOver={pOver} onPointerOut={pOut} onClick={pClick}>
          <mesh visible={false} onClick={pClick} onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerLeave={endDrag}>
            <sphereGeometry args={[scale * 0.84, 18, 18]} />
          </mesh>
          {resolvedAssetProfile.preserveFallback !== false && assetHybridBody}
          {resolvedAssetProfile.preserveFallback !== false && assetSupportVisual}
          <NodeAssetErrorBoundary resetKey={assetResetKey} fallback={assetFallback}>
            <NodeAssetRig
              node={node}
              accent={familyAccent}
              scale={scale * 1.02}
              pulsing={Boolean(isPulsing)}
              selected={isSelected}
              profile={resolvedAssetProfile}
            />
          </NodeAssetErrorBoundary>
          {showLabel && (
            <group position={[0, 0, -(scale * 0.7 + 1.0)]}>
              <NodeLabel badge={badge} label={node.label} color={familyAccent} opacity={labelOpacity} />
            </group>
          )}
          {showEditOverlay && isSelected && (
            <group>
              <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
                <ringGeometry args={[editRingRadius - 0.03, editRingRadius + 0.03, 48]} />
                <meshBasicMaterial color={familyAccent} transparent opacity={0.44} />
              </mesh>
              <mesh position={editHandlePosition} onPointerDown={startRotate} onPointerMove={moveRotate} onPointerUp={endRotate} onPointerLeave={endRotate}>
                <sphereGeometry args={[0.12, 18, 18]} />
                <meshBasicMaterial color="#f8fafc" transparent opacity={0.9} />
              </mesh>
              <mesh position={scaleHandlePosition} onPointerDown={startScale} onPointerMove={moveScale} onPointerUp={endScale} onPointerLeave={endScale}>
                <boxGeometry args={[0.18, 0.18, 0.18]} />
                <meshBasicMaterial color={signals.palette.warning} transparent opacity={0.9} />
              </mesh>
              <mesh position={[0, 0.03, 0]}>
                <sphereGeometry args={[0.06, 14, 14]} />
                <meshBasicMaterial color={familyAccent} transparent opacity={0.82} />
              </mesh>
            </group>
          )}
          {showEditOverlay && (
            <Html center position={[0, 0.2, -(scale * 0.92 + 0.58)]} style={{ pointerEvents: 'auto' }}>
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '4px',
                borderRadius: '999px',
                background: 'rgba(2,6,23,0.9)',
                border: `1px solid ${signals.palette.border}`,
                boxShadow: '0 10px 28px rgba(0,0,0,0.28)',
              }}>
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelectForEdit?.(node);
                  }}
                  className="btn-nexus"
                  style={{ padding: '5px 8px', fontSize: '0.42rem', letterSpacing: '1.4px' }}
                >
                  EDIT
                </button>
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelectForEdit?.(node);
                    onOpenAssetPicker?.(node, 'appearance');
                  }}
                  className="btn-nexus"
                  style={{ padding: '5px 8px', fontSize: '0.42rem', letterSpacing: '1.4px' }}
                >
                  GLB
                </button>
              </div>
            </Html>
          )}
      </group>,
    );
  }

  // 3D SHAPES
  if (node.shape === 'octahedron') {
    return wrapWithAnchor(
      <group ref={groupRef} onPointerOver={pOver} onPointerOut={pOut} onClick={pClick}>
          {/* 3D Invisible Hitbox for Guaranteed Selection */}
          <mesh visible={false} onClick={pClick}>
            <sphereGeometry args={[scale * 0.8, 16, 16]} />
          </mesh>
          <Octahedron args={[scale * 0.95, 0]}>
            <meshBasicMaterial color={familyAccent} transparent opacity={solidOpacity} />
          </Octahedron>
          <Octahedron args={[scale, 0]}>
            <meshBasicMaterial color={familyAccent} transparent opacity={wireOpacity} wireframe />
          </Octahedron>
          {showLabel && (
            <group position={[0, 0, -(scale + 1.0)]}>
              <NodeLabel badge={badge} label={node.label} color={familyAccent} opacity={labelOpacity} />
            </group>
          )}
      </group>,
    );
  }

  if (node.shape === 'tetrahedron') {
    return wrapWithAnchor(
      <group ref={groupRef} onPointerOver={pOver} onPointerOut={pOut} onClick={pClick}>
          <mesh visible={false} onClick={pClick}>
            <sphereGeometry args={[scale * 0.8, 16, 16]} />
          </mesh>
          <mesh>
            <tetrahedronGeometry args={[scale * 0.95, 0]} />
            <meshStandardMaterial color={familyAccent} emissive={familyAccent} emissiveIntensity={0.08 + (hovered || isSelected ? 0.12 : 0)} metalness={0.92} roughness={0.18} transparent opacity={solidOpacity} />
          </mesh>
          <mesh>
            <tetrahedronGeometry args={[scale, 0]} />
            <meshBasicMaterial color={familyAccent} transparent opacity={wireOpacity} wireframe />
          </mesh>
          {showLabel && (
            <group position={[0, 0, -(scale + 0.6)]}>
              <NodeLabel badge={badge} label={node.label} color={familyAccent} opacity={labelOpacity} />
            </group>
          )}
      </group>,
    );
  }

  if (node.shape === 'sphere') {
    return wrapWithAnchor(
      <group ref={groupRef} onPointerOver={pOver} onPointerOut={pOut} onClick={pClick}>
          <mesh visible={false} onClick={pClick}>
            <sphereGeometry args={[scale * 0.6, 16, 16]} />
          </mesh>
          {/* Hyper-Fidelity Sphere segments: 32x32 */}
          <Sphere args={[scale * 0.55, 32, 32]}>
            <meshStandardMaterial color={familyAccent} emissive={familyAccent} emissiveIntensity={0.06 + (hovered || isSelected ? 0.08 : 0)} metalness={0.68} roughness={0.32} transparent opacity={solidOpacity} />
          </Sphere>
          <Sphere args={[scale * 0.48, 24, 24]}>
            <meshBasicMaterial color={familyAccent} transparent opacity={Math.min(0.38, solidOpacity * 0.46)} />
          </Sphere>
          <Sphere args={[scale * 0.6, 32, 32]}>
            <meshBasicMaterial color={familyAccent} transparent opacity={wireOpacity} wireframe />
          </Sphere>
          {showLabel && (
            <group position={[0, 0, -(scale * 0.6 + 1.2)]}>
              <NodeLabel badge={badge} label={node.label} color={familyAccent} opacity={labelOpacity} />
            </group>
          )}
      </group>,
    );
  }

  // DOCUMENT SHAPE (Restored Forensic Files)
  if (node.shape === 'document') {
    const lowerLabel = node.label.toLowerCase();
    const isPy = lowerLabel.endsWith('.py');
    const isJson = lowerLabel.endsWith('.json');
    const isMd = lowerLabel.endsWith('.md');
    const glyphKind: DocumentGlyphKind = isPy
      ? 'python'
      : isJson
      ? 'json'
      : isMd
      ? 'markdown'
      : 'generic';

    return wrapWithAnchor(
      <group ref={groupRef} onPointerOver={pOver} onPointerOut={pOut} onClick={pClick}>
          <mesh visible={false} onClick={pClick}>
            <sphereGeometry args={[scale * 0.8, 16, 16]} />
          </mesh>
          <NodeGlyphSprite kind={glyphKind} accent={familyAccent} scale={scale * 1.95} opacity={labelOpacity} />
          
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <ringGeometry args={[scale * 0.45, scale * 0.52, 32]} />
            <meshBasicMaterial color={familyAccent} transparent opacity={wireOpacity} />
          </mesh>
          {showLabel && (
            <group position={[0, 0, -(scale * 1.34)]}>
              <NodeLabel badge={badge} label={node.label} color={familyAccent} compact opacity={labelOpacity} />
            </group>
          )}
      </group>,
    );
  }

  // FOLDER SHAPE
  if (node.shape === 'folder-icon') {
    return wrapWithAnchor(
      <group ref={groupRef} onPointerOver={pOver} onPointerOut={pOut} onClick={pClick}>
          <mesh visible={false} onClick={pClick}>
            <sphereGeometry args={[scale * 0.8, 16, 16]} />
          </mesh>
          <NodeGlyphSprite kind="folder" accent={familyAccent} scale={scale * 1.74} opacity={labelOpacity} />
          {showLabel && (
            <group position={[0, 0, -(scale * 1.08)]}>
              <NodeLabel badge={badge} label={`/${node.label}`} color={familyAccent} compact opacity={labelOpacity} />
            </group>
          )}
      </group>,
    );
  }

  return null;
}

