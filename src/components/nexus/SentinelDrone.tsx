"use client";
import { useCallback, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { GraphNode } from '@/lib/graphData';
import { getSentinelAssetProfile, NodeAssetFamilyOverrides, NodeAssetProfile, NodeAssetStage } from '@/lib/nodeAssets';
import NodeAssetRig from '../NodeAssetRig';
import { NodeAssetErrorBoundary } from './errorBoundaries';
import { capturePointer, releasePointer, ThreePointerEvent } from './types';

// DATA SENTINEL (Autonomous Drone)
export function SentinelDrone({
  index = 0,
  drift = 0,
  anchor = [0, 0, 0],
  color = '#cbd5e1',
  familyAssetOverrides,
  assetStage,
  editMode = false,
  isSelected = false,
  onSelectForEdit,
  onOpenAssetPicker,
  onDraftAssetRotation,
  onCommitAssetRotation,
  onDraftAssetScale,
  onCommitAssetScale,
}: {
  index?: number;
  drift?: number;
  anchor?: [number, number, number];
  color?: string;
  familyAssetOverrides?: NodeAssetFamilyOverrides;
  assetStage?: NodeAssetStage;
  editMode?: boolean;
  isSelected?: boolean;
  onSelectForEdit?: (index: number) => void;
  onOpenAssetPicker?: () => void;
  onDraftAssetRotation?: (rotation: [number, number, number]) => void;
  onCommitAssetRotation?: () => void;
  onDraftAssetScale?: (scale: number) => void;
  onCommitAssetScale?: () => void;
}) {
  const groupRef = useRef<THREE.Group>(null!);
  const visualRef = useRef<THREE.Group>(null!);
  const previousPositionRef = useRef(new THREE.Vector3(anchor[0], 0, anchor[2]));
  const previousHeadingRef = useRef(0);
  const rotatingRef = useRef(false);
  const scalingRef = useRef(false);
  const isAlert = drift > 0.1;
  const sentinelNode = useMemo<GraphNode>(() => ({
    id: `sentinel-${index}`,
    label: `SENTINEL-${index + 1}`,
    position: [0, 0, 0],
    type: 'module',
    shape: 'tetrahedron',
    size: 0.32,
    parentId: null,
    tooltip: 'Autonomous sentinel patrol.',
    color,
    cluster: 'system',
    orbitLevel: 0,
    importance: 'secondary',
    systemId: null,
    motionProfile: 'sentinel-linked',
  }), [color, index]);
  const sentinelAssetProfile = useMemo<NodeAssetProfile>(() => {
    const baseProfile = getSentinelAssetProfile(familyAssetOverrides);
    return {
      ...baseProfile,
      preserveFallback: false,
      appearance: {
        ...baseProfile.appearance,
        ...(assetStage || {}),
        enabled: true,
        offset: [0, 0, 0],
        scale: (assetStage?.scale ?? baseProfile.appearance.scale ?? 1) * (isAlert ? 1.08 : 0.88),
      }
    };
  }, [assetStage, familyAssetOverrides, isAlert]);
  const assetResetKey = `${sentinelNode.id}:${sentinelAssetProfile.appearance.src}`;
  const assetRotation = useMemo(
    () => assetStage?.rotation || sentinelAssetProfile.appearance.rotation || [0, 0, 0],
    [assetStage?.rotation, sentinelAssetProfile.appearance.rotation],
  );
  const editRingRadius = 0.9;
  const editHandlePosition: [number, number, number] = [
    Math.sin(assetRotation[1] || 0) * editRingRadius,
    0.08,
    Math.cos(assetRotation[1] || 0) * editRingRadius,
  ];
  const scaleHandlePosition: [number, number, number] = [
    Math.sin((assetRotation[1] || 0) + Math.PI / 2) * (editRingRadius + 0.28),
    0.08,
    Math.cos((assetRotation[1] || 0) + Math.PI / 2) * (editRingRadius + 0.28),
  ];
  const proceduralFallback = (
    <mesh>
      <tetrahedronGeometry args={[0.3, 0]} />
      <meshStandardMaterial
        color={isAlert ? '#ef4444' : color}
        emissive={isAlert ? '#ef4444' : color}
        emissiveIntensity={isAlert ? 0.28 : 0.1}
        metalness={0.94}
        roughness={0.18}
        transparent
        opacity={isAlert ? 0.88 : 0.72}
      />
    </mesh>
  );
  const startRotate = useCallback((event: ThreePointerEvent) => {
    if (!editMode) return;
    rotatingRef.current = true;
    event.stopPropagation();
    capturePointer(event);
    onSelectForEdit?.(index);
  }, [editMode, index, onSelectForEdit]);
  const moveRotate = useCallback((event: ThreePointerEvent) => {
    if (!rotatingRef.current || !editMode) return;
    event.stopPropagation();
    const dx = event.point.x - groupRef.current.position.x;
    const dz = event.point.z - groupRef.current.position.z;
    const nextHeading = Math.atan2(dx, dz);
    onDraftAssetRotation?.([assetRotation[0] || 0, nextHeading, assetRotation[2] || 0]);
  }, [assetRotation, editMode, onDraftAssetRotation]);
  const endRotate = useCallback((event: ThreePointerEvent) => {
    if (!rotatingRef.current) return;
    rotatingRef.current = false;
    event.stopPropagation();
    releasePointer(event);
    onCommitAssetRotation?.();
  }, [onCommitAssetRotation]);
  const startScale = useCallback((event: ThreePointerEvent) => {
    if (!editMode) return;
    scalingRef.current = true;
    event.stopPropagation();
    capturePointer(event);
    onSelectForEdit?.(index);
  }, [editMode, index, onSelectForEdit]);
  const moveScale = useCallback((event: ThreePointerEvent) => {
    if (!scalingRef.current || !editMode) return;
    event.stopPropagation();
    const dx = event.point.x - groupRef.current.position.x;
    const dz = event.point.z - groupRef.current.position.z;
    const distance = Math.max(0.15, Math.sqrt(dx * dx + dz * dz));
    onDraftAssetScale?.(THREE.MathUtils.clamp(distance / editRingRadius, 0.18, 6));
  }, [editMode, onDraftAssetScale]);
  const endScale = useCallback((event: ThreePointerEvent) => {
    if (!scalingRef.current) return;
    scalingRef.current = false;
    event.stopPropagation();
    releasePointer(event);
    onCommitAssetScale?.();
  }, [onCommitAssetScale]);
  useFrame((state) => {
    if (!groupRef.current) return;
    const t = state.clock.elapsedTime * (isAlert ? 0.54 : 0.34) + index * 0.8;
    const orbitRadius = 5.8 + (index % 3) * 1.6 + Math.min(1.8, drift * 12);
    const radialWave = Math.sin(t * 1.8 + index) * 0.42;
    const nextPosition = new THREE.Vector3(
      anchor[0] + Math.cos(t) * (orbitRadius + radialWave),
      0.14 + Math.sin(t * 2.2 + index * 0.3) * 0.08,
      anchor[2] + Math.sin(t * 0.96) * (orbitRadius * 0.78),
    );
    const travelVector = nextPosition.clone().sub(previousPositionRef.current);
    const heading = travelVector.lengthSq() > 0.000001
      ? Math.atan2(travelVector.x, travelVector.z)
      : previousHeadingRef.current;
    const normalizedTurn = Math.atan2(
      Math.sin(heading - previousHeadingRef.current),
      Math.cos(heading - previousHeadingRef.current),
    );
    const speed = travelVector.length();
    const bank = THREE.MathUtils.clamp(-normalizedTurn * 2.8, -0.32, 0.32);
    const pitch = THREE.MathUtils.clamp(speed * 3.2, 0, 0.18);

    groupRef.current.position.copy(nextPosition);
    previousPositionRef.current.copy(nextPosition);
    previousHeadingRef.current = heading;

    if (visualRef.current) {
      visualRef.current.rotation.set(
        pitch,
        heading,
        bank + (isAlert ? Math.sin(t * 2.1) * 0.04 : Math.sin(t * 1.6) * 0.018),
      );
    }
  });

  return (
    <group ref={groupRef}>
      <mesh
        visible={false}
        onClick={(event) => {
          event.stopPropagation();
          onSelectForEdit?.(index);
        }}
      >
        <sphereGeometry args={[0.82, 18, 18]} />
      </mesh>
      <group ref={visualRef}>
        <NodeAssetErrorBoundary resetKey={assetResetKey} fallback={proceduralFallback}>
          <NodeAssetRig
            node={sentinelNode}
            accent={isAlert ? '#ef4444' : color}
            scale={0.575}
            pulsing
            selected={isAlert}
            profile={sentinelAssetProfile}
          />
        </NodeAssetErrorBoundary>
      </group>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.34, 0.39, 24]} />
        <meshBasicMaterial
          color={isAlert ? '#fb7185' : color}
          transparent
          opacity={isAlert ? 0.24 : 0.14}
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
        />
      </mesh>
      {editMode && (
        <Html center position={[0, 0.42, -1.05]} style={{ pointerEvents: 'auto' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px', borderRadius: '999px', background: 'rgba(2,6,23,0.9)', border: '1px solid rgba(255,255,255,0.14)', boxShadow: '0 10px 28px rgba(0,0,0,0.28)' }}>
            <button
              onClick={(event) => {
                event.stopPropagation();
                onSelectForEdit?.(index);
              }}
              className="btn-nexus"
              style={{ padding: '5px 8px', fontSize: '0.42rem', letterSpacing: '1.4px' }}
            >
              EDIT
            </button>
            <button
              onClick={(event) => {
                event.stopPropagation();
                onSelectForEdit?.(index);
                onOpenAssetPicker?.();
              }}
              className="btn-nexus"
              style={{ padding: '5px 8px', fontSize: '0.42rem', letterSpacing: '1.4px' }}
            >
              GLB
            </button>
          </div>
        </Html>
      )}
      {editMode && isSelected && (
        <group>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.06, 0]}>
            <ringGeometry args={[editRingRadius - 0.03, editRingRadius + 0.03, 48]} />
            <meshBasicMaterial color={color} transparent opacity={0.44} />
          </mesh>
          <mesh position={editHandlePosition} onPointerDown={startRotate} onPointerMove={moveRotate} onPointerUp={endRotate} onPointerLeave={endRotate}>
            <sphereGeometry args={[0.12, 18, 18]} />
            <meshBasicMaterial color="#f8fafc" transparent opacity={0.92} />
          </mesh>
          <mesh position={scaleHandlePosition} onPointerDown={startScale} onPointerMove={moveScale} onPointerUp={endScale} onPointerLeave={endScale}>
            <boxGeometry args={[0.18, 0.18, 0.18]} />
            <meshBasicMaterial color="#fbbf24" transparent opacity={0.9} />
          </mesh>
          <mesh position={[0, 0.07, 0]}>
            <sphereGeometry args={[0.06, 14, 14]} />
            <meshBasicMaterial color={color} transparent opacity={0.82} />
          </mesh>
        </group>
      )}
    </group>
  );
}

