'use client';
import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, AdaptiveDpr, AdaptiveEvents, Stats } from '@react-three/drei';
import { EffectComposer, Bloom, ChromaticAberration } from '@react-three/postprocessing';
import * as THREE from 'three';
import EarthModel         from './EarthModel';
import DebrisField        from './DebrisField';
import Starfield          from './Starfield';
import ConjunctionMarkers from './ConjunctionMarkers';
import CameraController  from './CameraController';
import type { DebrisObject } from '@/lib/store/orbitalStore';

interface SceneProps {
  onSelectDebris?: (d: DebrisObject) => void;
}

export default function Scene({ onSelectDebris }: SceneProps) {
  return (
    <Canvas
      camera={{ position: [0, 20, 50], fov: 55, near: 0.01, far: 2000 }}
      gl={{
        antialias: true,
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.1,
        powerPreference: 'high-performance',
        alpha: false,
      }}
      dpr={[1, 2]}   // Adaptive DPR: max 2x on high-density displays
      shadows={false} // Disabled for performance — 27k instances
      style={{ background: '#030712' }}
    >
      {/* Adaptive performance helpers */}
      <AdaptiveDpr pixelated />
      <AdaptiveEvents />

      {/* Ambient only — diffuse is handled in custom shaders */}
      <ambientLight intensity={0.04} />
      <directionalLight position={[30, 10, 20]} intensity={0} /> {/* sun direction hint */}

      <Suspense fallback={null}>
        {/* Background stars */}
        <Starfield />

        {/* Earth + atmosphere */}
        <EarthModel />

        {/* The main event: 27,000 instanced debris particles */}
        <DebrisField onSelectDebris={onSelectDebris} />

        {/* HTML conjunction warning overlays */}
        <ConjunctionMarkers />

        {/* Post-processing */}
        <EffectComposer multisampling={0}>
          <Bloom
            intensity={0.8}
            luminanceThreshold={0.6}
            luminanceSmoothing={0.3}
            mipmapBlur
          />
          <ChromaticAberration
            offset={[0.0005, 0.0005] as unknown as THREE.Vector2}
            radialModulation={false}
            modulationOffset={0}
          />
        </EffectComposer>
      </Suspense>

      {/* Scroll-driven camera */}
      <CameraController />

      {/* Dev controls — remove in production */}
      <OrbitControls
        enableDamping
        dampingFactor={0.05}
        rotateSpeed={0.4}
        zoomSpeed={0.6}
        minDistance={7.5}
        maxDistance={80}
      />

      {process.env.NODE_ENV === 'development' && <Stats />}
    </Canvas>
  );
}
