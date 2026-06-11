'use client';
/**
 * CameraController.tsx
 * Uses GSAP ScrollTrigger to drive the Three.js camera through the
 * narrative arc: Hero → Threat → Satellite → Features → CTA
 *
 * Camera keyframes:
 *  0%  → Far orbit (hero): pos [0, 20, 50], fov 55
 *  25% → LEO approach (threat): pos [0, 5, 18], fov 45
 *  50% → ISS proximity (debris cloud): pos [3, 2, 10], fov 38
 *  75% → Satellite explode view: pos [1, 1, 4], fov 32
 * 100% → Pull back (CTA): pos [0, 10, 35], fov 50
 */
import { useRef, useEffect } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useOrbitalStore } from '@/lib/store/orbitalStore';

interface CameraKeyframe {
  x: number; y: number; z: number;
  targetX: number; targetY: number; targetZ: number;
  fov: number;
}

const KEYFRAMES: CameraKeyframe[] = [
  { x: 0,  y: 20, z: 50, targetX: 0, targetY: 0, targetZ: 0, fov: 55 }, // hero
  { x: 0,  y:  5, z: 18, targetX: 0, targetY: 0, targetZ: 0, fov: 45 }, // threat
  { x: 4,  y:  2, z: 12, targetX: 2, targetY: 1, targetZ: 0, fov: 38 }, // debris
  { x: 1,  y:  1, z:  5, targetX: 0, targetY: 0, targetZ: 0, fov: 32 }, // satellite
  { x: 0,  y: 10, z: 35, targetX: 0, targetY: 0, targetZ: 0, fov: 50 }, // cta
];

function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export default function CameraController() {
  const { camera } = useThree();
  const targetPos = useRef(new THREE.Vector3(0, 20, 50));
  const targetLookAt = useRef(new THREE.Vector3(0, 0, 0));
  const targetFov = useRef(55);
  const { activeSection } = useOrbitalStore();

  // Update targets when section changes
  useEffect(() => {
    const kf = KEYFRAMES[Math.min(activeSection, KEYFRAMES.length - 1)];
    targetPos.current.set(kf.x, kf.y, kf.z);
    targetLookAt.current.set(kf.targetX, kf.targetY, kf.targetZ);
    targetFov.current = kf.fov;
  }, [activeSection]);

  // Smooth camera interpolation each frame
  useFrame(({ camera: cam }, delta) => {
    const speed = 2.5 * delta;

    // Lerp position
    cam.position.lerp(targetPos.current, speed);

    // Lerp look-at via a dummy target
    const currentLookAt = new THREE.Vector3();
    cam.getWorldDirection(currentLookAt);
    const desiredDir = targetLookAt.current.clone().sub(cam.position).normalize();
    const blendedDir = currentLookAt.lerp(desiredDir, speed);
    cam.lookAt(cam.position.clone().add(blendedDir));

    // Lerp FOV (PerspectiveCamera)
    if ('fov' in cam) {
      const pc = cam as THREE.PerspectiveCamera;
      pc.fov = lerp(pc.fov, targetFov.current, speed);
      pc.updateProjectionMatrix();
    }
  });

  return null;
}
