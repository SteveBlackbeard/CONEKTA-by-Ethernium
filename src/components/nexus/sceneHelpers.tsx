"use client";
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { PointMaterial, Points, Sphere, Text } from '@react-three/drei';
import { GraphNode, GRAPH_CLUSTER_CONFIG } from '@/lib/graphData';
import { DashboardSignals } from '@/lib/telemetry';
import { tt } from '@/lib/i18n';
import { AggregateBadge, CameraMode, OrbitControlsRef, ZoomTier } from './types';
import { deriveZoomTier } from './nodeUtils';

export function AggregateClusterBadge({
  badge,
  dictionary,
}: {
  badge: AggregateBadge;
  dictionary: Record<string, string>;
}) {
  const translatedLabel = tt(dictionary, `graph.cluster.${badge.cluster}`, GRAPH_CLUSTER_CONFIG[badge.cluster].label);
  const badgeColor = badge.active ? badge.color : new THREE.Color(badge.color).lerp(new THREE.Color('#94a3b8'), 0.38).getStyle();

  return (
    <group position={badge.position}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.46, 0.56, 48]} />
        <meshBasicMaterial
          color={badgeColor}
          transparent
          opacity={badge.active ? 0.34 : 0.2}
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
        />
      </mesh>
      <Sphere args={[0.18, 16, 16]}>
        <meshBasicMaterial color={badgeColor} transparent opacity={badge.active ? 0.3 : 0.18} />
      </Sphere>
      <Text
        position={[0, 0.05, -0.26]}
        rotation={[-Math.PI / 2, 0, 0]}
        color="#e2e8f0"
        fontSize={0.13}
        anchorX="center"
        anchorY="middle"
        maxWidth={4.8}
        outlineWidth={0.012}
        outlineColor="#020617"
        fillOpacity={badge.active ? 0.92 : 0.72}
      >
        {translatedLabel}
      </Text>
      <Text
        position={[0, 0.05, 0.02]}
        rotation={[-Math.PI / 2, 0, 0]}
        color={badgeColor}
        fontSize={0.19}
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.016}
        outlineColor="#020617"
        fillOpacity={badge.active ? 1 : 0.78}
      >
        {`${badge.count}`}
      </Text>
    </group>
  );
}

export function SceneRig({
  signals,
  reducedMotion,
  cameraMode,
  focusedNode,
  controlsRef,
  sceneBounds,
}: {
  signals: DashboardSignals;
  reducedMotion: boolean;
  cameraMode: CameraMode;
  focusedNode: GraphNode | null;
  controlsRef: React.MutableRefObject<OrbitControlsRef | null>;
  sceneBounds: { minX: number; maxX: number; minZ: number; maxZ: number };
}) {
  // Mutating the three.js camera inside useFrame is the intended imperative
  // escape hatch; keep the React compiler away from this component.
  'use no memo';
  const { camera } = useThree();
  const positionRef = useRef(new THREE.Vector3(0, 34, 0.001));
  const lookAtRef = useRef(new THREE.Vector3(0, 0, 0));
  const zoomRef = useRef(30);

  useFrame((_state, delta) => {
    if (cameraMode === 'manual') {
      if (controlsRef.current?.target) {
        const marginX = 10;
        const marginZ = 10;
        const target = controlsRef.current.target as THREE.Vector3;
        const clampedX = THREE.MathUtils.clamp(target.x, sceneBounds.minX - marginX, sceneBounds.maxX + marginX);
        const clampedZ = THREE.MathUtils.clamp(target.z, sceneBounds.minZ - marginZ, sceneBounds.maxZ + marginZ);
        const deltaX = clampedX - target.x;
        const deltaZ = clampedZ - target.z;
        if (deltaX !== 0 || deltaZ !== 0) {
          target.set(clampedX, 0, clampedZ);
          // eslint-disable-next-line react-hooks/immutability -- imperative three.js camera control
          camera.position.x += deltaX;
          camera.position.z += deltaZ;
          controlsRef.current.update();
        }
      }
      return;
    }
    const topHeight = signals.mode === 'INCIDENT'
      ? 36
      : signals.mode === 'AUDIT'
      ? 34
      : signals.mode === 'SEAL'
      ? 33
      : 35;

    if (cameraMode === 'focus' && focusedNode) {
      lookAtRef.current.set(focusedNode.position[0], 0, focusedNode.position[2]);
      positionRef.current.set(focusedNode.position[0], topHeight, focusedNode.position[2] + 0.001);
      zoomRef.current = focusedNode.type === 'core'
        ? 44
        : focusedNode.type === 'edition' || focusedNode.type === 'module'
        ? 36
        : 32;
    } else {
      lookAtRef.current.set(0, 0, 0);
      positionRef.current.set(0, topHeight, 0.001);
      zoomRef.current = signals.mode === 'INCIDENT' ? 26 : signals.mode === 'AUDIT' ? 28 : 30;
    }

    const lerpFactor = 1 - Math.exp(-delta * (reducedMotion ? 1.4 : 2.2));
    camera.position.lerp(positionRef.current, lerpFactor);
    camera.up.set(0, 0, -1);

    if (controlsRef.current?.target) {
      controlsRef.current.target.lerp(lookAtRef.current, 1 - Math.exp(-delta * 3.2));
      controlsRef.current.update();
    }

    if ('zoom' in camera) {
      const orthoCamera = camera as THREE.OrthographicCamera;
      // eslint-disable-next-line react-hooks/immutability -- imperative three.js camera control
      orthoCamera.zoom = THREE.MathUtils.lerp(orthoCamera.zoom, zoomRef.current, 1 - Math.exp(-delta * 2.2));
      orthoCamera.updateProjectionMatrix();
    }
    if (!controlsRef.current?.target) {
      camera.lookAt(lookAtRef.current);
    }
  });

  return null;
}

export function ZoomTierTracker({
  onZoomTierChange,
  onZoomChange,
}: {
  onZoomTierChange: (tier: ZoomTier) => void;
  onZoomChange?: (zoom: number) => void;
}) {
  const { camera } = useThree();
  const tierRef = useRef<ZoomTier>(deriveZoomTier(('zoom' in camera ? (camera as THREE.OrthographicCamera).zoom : 30)));
  const lastZoomRef = useRef<number>('zoom' in camera ? (camera as THREE.OrthographicCamera).zoom : 30);

  useFrame(() => {
    if (!('zoom' in camera)) return;
    const zoom = (camera as THREE.OrthographicCamera).zoom;
    const nextTier = deriveZoomTier(zoom);
    if (nextTier !== tierRef.current) {
      tierRef.current = nextTier;
      onZoomTierChange(nextTier);
    }
    if (onZoomChange && Math.abs(zoom - lastZoomRef.current) > 0.01) {
      lastZoomRef.current = zoom;
      onZoomChange(zoom);
    }
  });

  return null;
}

export function CanvasBackgroundSync({
  background,
}: {
  background: string;
  fog: string;
}) {
  // Synchronizing the imperative three.js scene with React state.
  'use no memo';
  const { gl, scene } = useThree();

  useEffect(() => {
    gl.setClearColor(background || '#020617', 1);
    // eslint-disable-next-line react-hooks/immutability -- imperative three.js scene sync
    scene.background = new THREE.Color(background || '#020617');
    scene.fog = null;
  }, [background, gl, scene]);

  return null;
}

export function DotsBackdrop({ color = '#ffffff' }: { color?: string }) {
  const points = useMemo(() => {
    const count = 1400;
    const radius = 140;
    const positions = new Float32Array(count * 3);
    // Deterministic LCG so the starfield is stable across renders (and the
    // component stays pure for the React compiler).
    let seed = 0x9e3779b9;
    const next = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0xffffffff;
    };
    for (let i = 0; i < count; i++) {
      const angle = next() * Math.PI * 2;
      const dist = Math.sqrt(next()) * radius;
      positions[i * 3] = Math.cos(angle) * dist;
      positions[i * 3 + 1] = Math.sin(angle) * dist;
      positions[i * 3 + 2] = 0;
    }
    return positions;
  }, []);

  return (
    <group rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.4, 0]}>
      <Points positions={points} stride={3} frustumCulled>
        <PointMaterial
          size={0.38}
          color={color}
          transparent
          opacity={0.7}
          depthWrite={false}
          depthTest={false}
          sizeAttenuation={false}
          blending={THREE.AdditiveBlending}
        />
      </Points>
    </group>
  );
}

