"use client";
import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { PointMaterial, Points } from '@react-three/drei';
import { BeamMaterialRef } from './types';
import './materials';

function LinkParticleStream({
  start,
  end,
  color = '#ffffff',
  count = 10,
  chromatic = true,
  emphasis = 0.8,
}: {
  start: [number, number, number];
  end: [number, number, number];
  color?: string;
  count?: number;
  chromatic?: boolean;
  emphasis?: number;
}) {
  const baseRef = useRef<THREE.Points>(null!);
  const cyanRef = useRef<THREE.Points>(null!);
  const redRef = useRef<THREE.Points>(null!);

  const [basePositions, cyanPositions, redPositions] = useMemo(
    () => [new Float32Array(count * 3), new Float32Array(count * 3), new Float32Array(count * 3)],
    [count],
  );

  const vectors = useMemo(() => {
    const startVec = new THREE.Vector3(...start);
    const endVec = new THREE.Vector3(...end);
    const direction = endVec.clone().sub(startVec);
    const tangent = direction.clone().normalize();
    const normal = new THREE.Vector3(-tangent.z, 0, tangent.x);
    if (normal.lengthSq() < 0.0001) {
      normal.set(0, 1, 0).cross(tangent);
    }
    normal.normalize();
    const binormal = new THREE.Vector3().crossVectors(tangent, normal).normalize();
    return {
      start: startVec.toArray() as [number, number, number],
      direction: direction.toArray() as [number, number, number],
      normal: normal.toArray() as [number, number, number],
      binormal: binormal.toArray() as [number, number, number],
    };
  }, [end, start]);

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    const flowSpeed = 0.38 + emphasis * 0.34;
    const split = 0.08 + emphasis * 0.06;
    const sway = 0.04 + emphasis * 0.03;
    const [sx, sy, sz] = vectors.start;
    const [dx, dy, dz] = vectors.direction;
    const [nx, ny, nz] = vectors.normal;
    const [bx, by, bz] = vectors.binormal;

    const updateStream = (ref: React.MutableRefObject<THREE.Points>, phase: number, lateralBias: number, wobbleSign: number) => {
      if (!ref.current) return;
      const positions = ref.current.geometry.attributes.position.array as Float32Array;
      for (let i = 0; i < count; i++) {
        const index = i * 3;
        const progress = (t * flowSpeed + phase + i / Math.max(count, 1)) % 1;
        const envelope = Math.sin(progress * Math.PI);
        const lateral = lateralBias + Math.sin(t * 4.8 + i * 0.72) * split * 0.18 * envelope;
        const wobble = Math.cos(t * 3.4 + i * 0.54) * sway * wobbleSign * envelope;

        positions[index] = sx + dx * progress + nx * lateral + bx * wobble;
        positions[index + 1] = sy + dy * progress + ny * lateral + by * wobble;
        positions[index + 2] = sz + dz * progress + nz * lateral + bz * wobble;
      }
      ref.current.geometry.attributes.position.needsUpdate = true;
    };

    updateStream(baseRef, 0, 0, 1);
    if (chromatic) {
      updateStream(cyanRef, 0.16, split, 1);
      updateStream(redRef, 0.3, -split, -1);
    }
  });

  return (
    <group>
      <Points ref={baseRef} positions={basePositions} stride={3} frustumCulled={false}>
        <PointMaterial
          transparent
          color={color}
          size={0.085 + emphasis * 0.035}
          sizeAttenuation
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          opacity={0.72}
        />
      </Points>
      {chromatic && (
        <>
          <Points ref={cyanRef} positions={cyanPositions} stride={3} frustumCulled={false}>
            <PointMaterial
              transparent
              color="#67e8f9"
              size={0.07 + emphasis * 0.028}
              sizeAttenuation
              depthWrite={false}
              blending={THREE.AdditiveBlending}
              opacity={0.44}
            />
          </Points>
          <Points ref={redRef} positions={redPositions} stride={3} frustumCulled={false}>
            <PointMaterial
              transparent
              color="#fb7185"
              size={0.07 + emphasis * 0.028}
              sizeAttenuation
              depthWrite={false}
              blending={THREE.AdditiveBlending}
              opacity={0.34}
            />
          </Points>
        </>
      )}
    </group>
  );
}

// CONNECTION BEAM
export function ConnectionBeam({
  start,
  end,
  color = '#ffffff',
  streamParticles = 0,
  chromaticParticles = false,
  emphasis = 0.8,
}: {
  start: [number, number, number];
  end: [number, number, number];
  color?: string;
  streamParticles?: number;
  chromaticParticles?: boolean;
  emphasis?: number;
}) {
  const count = 20;
  const matRef = useRef<BeamMaterialRef>(null!);
  
  useFrame((state) => {
    if (matRef.current) {
      matRef.current.u_time = state.clock.elapsedTime;
      matRef.current.u_color.set(color);
    }
  });

  const { points, progress } = useMemo(() => {
    const p = new Float32Array(count * 3);
    const pr = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const t = i / (count - 1);
      p[i * 3] = start[0] + (end[0] - start[0]) * t;
      p[i * 3 + 1] = start[1] + (end[1] - start[1]) * t;
      p[i * 3 + 2] = start[2] + (end[2] - start[2]) * t;
      pr[i] = t;
    }
    return { points: p, progress: pr };
  }, [start, end, count]);

  return (
    <group>
      <Points positions={points} stride={3}>
        <bufferAttribute attach="geometry-attributes-aProgress" args={[progress, 1]} />
        <beamShaderMaterial ref={matRef} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
      </Points>
      {streamParticles > 0 && (
        <LinkParticleStream
          start={start}
          end={end}
          color={color}
          count={streamParticles}
          chromatic={chromaticParticles}
          emphasis={emphasis}
        />
      )}
    </group>
  );
}

