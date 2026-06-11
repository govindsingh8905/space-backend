'use client';
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const STAR_COUNT = 8000;

export default function Starfield() {
  const pointsRef = useRef<THREE.Points>(null);

  const { positions, sizes, colors } = useMemo(() => {
    const pos    = new Float32Array(STAR_COUNT * 3);
    const sizes  = new Float32Array(STAR_COUNT);
    const colors = new Float32Array(STAR_COUNT * 3);

    for (let i = 0; i < STAR_COUNT; i++) {
      // Random point on sphere surface (far away)
      const theta = Math.random() * Math.PI * 2;
      const phi   = Math.acos(2 * Math.random() - 1);
      const r     = 800 + Math.random() * 400;

      pos[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      pos[i * 3 + 2] = r * Math.cos(phi);

      sizes[i] = 0.5 + Math.random() * 2.5;

      // Star color tint: mostly white-blue, some warm
      const warm = Math.random() < 0.15;
      colors[i * 3]     = warm ? 1.0 : 0.8 + Math.random() * 0.2;
      colors[i * 3 + 1] = warm ? 0.7 + Math.random() * 0.2 : 0.85 + Math.random() * 0.15;
      colors[i * 3 + 2] = warm ? 0.3 + Math.random() * 0.3 : 0.9 + Math.random() * 0.1;
    }
    return { positions: pos, sizes, colors };
  }, []);

  // Very slow drift
  useFrame(({ clock }) => {
    if (pointsRef.current) {
      pointsRef.current.rotation.y = clock.getElapsedTime() * 0.002;
    }
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-size"     args={[sizes,     1]} />
        <bufferAttribute attach="attributes-color"    args={[colors,    3]} />
      </bufferGeometry>
      <pointsMaterial
        vertexColors
        transparent
        opacity={0.85}
        sizeAttenuation
        size={0.8}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}
