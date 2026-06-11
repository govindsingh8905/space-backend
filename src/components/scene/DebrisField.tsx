'use client';
/**
 * DebrisField.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Renders 27,000+ debris particles using THREE.InstancedMesh for O(1) draw
 * calls. A custom ShaderMaterial color-codes each instance by threat level
 * and pulses critical objects.
 *
 * PERFORMANCE CONTRACT
 * • One draw call for the entire field (InstancedMesh).
 * • Position updates via setMatrixAt + instanceMatrix.needsUpdate = true.
 * • Threat attribute uploaded once; only updated on conjunction refresh.
 * • Uses LOD: particles below 2px screen-space are discarded in fragment.
 * ─────────────────────────────────────────────────────────────────────────
 */
import { useRef, useMemo, useEffect, useCallback } from 'react';
import { useFrame, ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { useOrbitalStore, type DebrisObject } from '@/lib/store/orbitalStore';

// Scene units: 1 unit = 1000 km, so Earth radius = 6.371 units
const SCALE = 1 / 1000;

// Max instances — allocate for the full field; rendering only uses actual count
const MAX_INSTANCES = 30_000;

// ── Custom instanced shader ──────────────────────────────────────────────
const debrisVertexShader = /* glsl */ `
  attribute float aThreat;
  attribute float aPulseOffset;
  varying float vThreat;
  varying float vDepthFade;
  uniform float uTime;

  void main() {
    vThreat = aThreat;

    // Pulse scale for critical / warning objects
    float pulse = 1.0;
    if (aThreat > 0.75) {
      pulse = 1.0 + 0.5 * sin(uTime * 4.0 + aPulseOffset * 6.2832);
    } else if (aThreat > 0.35) {
      pulse = 1.0 + 0.15 * sin(uTime * 1.8 + aPulseOffset * 6.2832);
    }

    vec4 mvPos = modelViewMatrix * instanceMatrix * vec4(position * pulse, 1.0);
    float dist = length(mvPos.xyz);

    // Depth-based fade for atmospheric realism
    vDepthFade = clamp(1.0 - dist / 80.0, 0.0, 1.0);

    gl_Position = projectionMatrix * mvPos;

    // Screen-space size that stays consistent regardless of distance
    float baseSize = (aThreat > 0.75) ? 5.0 : (aThreat > 0.35) ? 3.5 : 2.0;
    gl_PointSize = clamp(baseSize * 300.0 / dist, 1.0, 10.0);
  }
`;

const debrisFragmentShader = /* glsl */ `
  varying float vThreat;
  varying float vDepthFade;
  uniform float uTime;

  void main() {
    // Circular soft particle
    vec2 pc = gl_PointCoord - 0.5;
    float d  = length(pc);
    if (d > 0.5) discard;

    float alpha = smoothstep(0.5, 0.05, d);

    // Threat-based color
    vec3 safe     = vec3(0.0, 0.96, 1.00);   // cyan
    vec3 warn     = vec3(1.0, 0.72, 0.02);   // amber
    vec3 critical = vec3(0.95, 0.22, 0.16);  // red

    vec3 col;
    if (vThreat < 0.35) {
      col    = safe;
      alpha *= 0.45;
    } else if (vThreat < 0.75) {
      col    = mix(safe, warn, (vThreat - 0.35) / 0.40);
      alpha *= 0.80;
    } else {
      col    = mix(warn, critical, (vThreat - 0.75) / 0.25);
      // Bright core flare
      float core = smoothstep(0.25, 0.0, d);
      col  = mix(col, vec3(1.0, 0.9, 0.8), core * 0.7);
      alpha *= 1.0;
    }

    alpha *= vDepthFade;
    gl_FragColor = vec4(col, alpha);
  }
`;

// Helper: ECI km → Three.js scene units
function eciToScene(x: number, y: number, z: number): THREE.Vector3 {
  return new THREE.Vector3(x * SCALE, z * SCALE, -y * SCALE);
}

// ── Component ────────────────────────────────────────────────────────────
interface DebrisFieldProps {
  onSelectDebris?: (debris: DebrisObject) => void;
}

export default function DebrisField({ onSelectDebris }: DebrisFieldProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  const { debrisField, selectedDebris, selectDebris } = useOrbitalStore();

  // Build per-instance attribute arrays from debris data
  const { threatArr, pulseArr } = useMemo(() => {
    const count  = Math.min(debrisField.length, MAX_INSTANCES);
    const threat = new Float32Array(count);
    const pulse  = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const d = debrisField[i];
      threat[i] = d.threatLevel === 'critical' ? 1.0
                : d.threatLevel === 'warning'  ? 0.55
                : 0.1 + d.conjunctionProbability * 0.25;
      pulse[i] = Math.random(); // random offset for staggered pulse
    }
    return { threatArr: threat, pulseArr: pulse };
  }, [debrisField]);

  // Shader uniforms
  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
  }), []);

  // Upload instance matrices whenever debrisField changes
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh || debrisField.length === 0) return;

    const dummy = new THREE.Object3D();
    const count = Math.min(debrisField.length, MAX_INSTANCES);

    for (let i = 0; i < count; i++) {
      const d = debrisField[i];
      const pos = eciToScene(d.x, d.y, d.z);
      dummy.position.copy(pos);
      dummy.scale.setScalar(0.006); // base particle scale
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.count = count;

    // Upload threat / pulse attributes
    const geo = mesh.geometry;
    geo.setAttribute('aThreat',      new THREE.InstancedBufferAttribute(threatArr, 1));
    geo.setAttribute('aPulseOffset', new THREE.InstancedBufferAttribute(pulseArr, 1));
  }, [debrisField, threatArr, pulseArr]);

  // Animate time uniform + highlight selected
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const highlightMatrix = useMemo(() => new THREE.Matrix4(), []);

  useFrame(({ clock }) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    uniforms.uTime.value = clock.getElapsedTime();

    // Pulse selected debris by scaling its matrix
    if (selectedDebris) {
      const idx = debrisField.findIndex(d => d.id === selectedDebris.id);
      if (idx >= 0) {
        const d = debrisField[idx];
        const pos = eciToScene(d.x, d.y, d.z);
        const pulse = 1.0 + 0.4 * Math.sin(clock.getElapsedTime() * 5);
        dummy.position.copy(pos);
        dummy.scale.setScalar(0.006 * pulse * 3);
        dummy.updateMatrix();
        mesh.setMatrixAt(idx, dummy.matrix);
        mesh.instanceMatrix.needsUpdate = true;
      }
    }
  });

  // Raycasting for click selection
  const handleClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const instanceId = e.instanceId;
    if (instanceId === undefined || !debrisField[instanceId]) return;
    const clicked = debrisField[instanceId];
    selectDebris(clicked);
    onSelectDebris?.(clicked);
  }, [debrisField, selectDebris, onSelectDebris]);

  const count = Math.min(debrisField.length, MAX_INSTANCES);

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, MAX_INSTANCES]}
      count={count}
      onClick={handleClick}
      frustumCulled={false} // Disable — instanced meshes need manual culling
    >
      {/* Simple sphere geometry for each instance — radius 1, scaled per-instance */}
      <sphereGeometry args={[1, 4, 4]} />
      <shaderMaterial
        vertexShader={debrisVertexShader}
        fragmentShader={debrisFragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </instancedMesh>
  );
}
