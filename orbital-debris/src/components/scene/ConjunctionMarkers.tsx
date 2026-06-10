'use client';
import { Html } from '@react-three/drei';
import { useOrbitalStore } from '@/lib/store/orbitalStore';

const SCALE = 1 / 1000;

function eciToScene(x: number, y: number, z: number): [number, number, number] {
  return [x * SCALE, z * SCALE, -y * SCALE];
}

function threatColor(prob: number): string {
  if (prob > 0.3)  return '#ef4444';
  if (prob > 0.08) return '#ffb703';
  return '#00f5ff';
}

export default function ConjunctionMarkers() {
  const { conjunctions, debrisField, selectDebris } = useOrbitalStore();

  // Find high-priority conjunctions
  const topConjunctions = conjunctions
    .sort((a, b) => b.collisionProbability - a.collisionProbability)
    .slice(0, 6);

  return (
    <>
      {topConjunctions.map((event) => {
        const debris = debrisField.find(d => d.id === event.debrisId);
        if (!debris) return null;

        const pos = eciToScene(debris.x, debris.y, debris.z);
        const color = threatColor(event.collisionProbability);
        const isCritical = event.collisionProbability > 0.3;

        return (
          <group key={event.id} position={pos}>
            {/* 3D marker sphere */}
            <mesh>
              <sphereGeometry args={[0.04, 8, 8]} />
              <meshBasicMaterial color={color} transparent opacity={0.8} />
            </mesh>

            {/* HTML overlay label */}
            <Html
              distanceFactor={12}
              occlude={false}
              style={{ pointerEvents: 'auto' }}
            >
              <button
                onClick={() => selectDebris(debris)}
                style={{
                  background: isCritical
                    ? 'rgba(20,4,4,0.85)'
                    : 'rgba(20,12,0,0.80)',
                  backdropFilter: 'blur(12px)',
                  border: `1px solid ${color}40`,
                  borderRadius: '6px',
                  padding: '6px 10px',
                  color: '#fff',
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: '10px',
                  whiteSpace: 'nowrap',
                  cursor: 'pointer',
                  lineHeight: 1.5,
                  boxShadow: `0 0 20px ${color}20`,
                  transition: 'all 0.15s',
                  transform: 'translateX(-50%)',
                }}
              >
                <div style={{ color, fontWeight: 600, marginBottom: 2 }}>
                  {isCritical ? '⚠ CRITICAL' : '⚡ WARNING'}
                </div>
                <div style={{ color: 'rgba(255,255,255,0.7)' }}>
                  {event.debrisName.substring(0, 14)}
                </div>
                <div style={{ color: 'rgba(255,255,255,0.5)' }}>
                  Pc: {(event.collisionProbability * 100).toFixed(2)}%
                </div>
                <div style={{ color: 'rgba(255,255,255,0.5)' }}>
                  Miss: {event.missDistance.toFixed(2)} km
                </div>
              </button>
            </Html>

            {/* Connecting line to surface */}
            <lineSegments>
              <bufferGeometry>
                <bufferAttribute
                  attach="attributes-position"
                  args={[new Float32Array([0, 0, 0, 0, -0.3, 0]), 3]}
                />
              </bufferGeometry>
              <lineBasicMaterial color={color} transparent opacity={0.4} />
            </lineSegments>
          </group>
        );
      })}
    </>
  );
}
