import type { DebrisObject, SatelliteTarget, ConjunctionEvent } from '@/lib/store/orbitalStore';

const EARTH_RADIUS_KM = 6371;

// Spherical to Cartesian (ECI approximation)
function sphericalToCartesian(
  altKm: number,
  inclinationDeg: number,
  raanDeg: number,
  trueLongDeg: number
): { x: number; y: number; z: number } {
  const r = EARTH_RADIUS_KM + altKm;
  const inc = (inclinationDeg * Math.PI) / 180;
  const raan = (raanDeg * Math.PI) / 180;
  const nu = (trueLongDeg * Math.PI) / 180;

  // Simple orbital position in ECI
  const xOrb = r * Math.cos(nu);
  const yOrb = r * Math.sin(nu);

  const x = xOrb * (Math.cos(raan) * Math.cos(0) - Math.sin(raan) * Math.sin(0) * Math.cos(inc))
          - yOrb * (Math.cos(raan) * Math.sin(0) + Math.sin(raan) * Math.cos(0) * Math.cos(inc));
  const y = xOrb * (Math.sin(raan) * Math.cos(0) + Math.cos(raan) * Math.sin(0) * Math.cos(inc))
          + yOrb * (Math.cos(raan) * Math.cos(0) * Math.cos(inc) - Math.sin(raan) * Math.sin(0));
  const z = xOrb * Math.sin(0) * Math.sin(inc) + yOrb * Math.cos(0) * Math.sin(inc);

  return { x, y, z };
}

// Orbital velocity approximation
function orbitalVelocity(altKm: number): number {
  const MU = 398600.4418; // km^3/s^2
  const r = EARTH_RADIUS_KM + altKm;
  return Math.sqrt(MU / r);
}

export function generateDebrisField(count: number = 2700): DebrisObject[] {
  const debris: DebrisObject[] = [];
  const debrisCategories = [
    // Defunct satellites / rocket bodies: 400–600km, high inclination
    { altMin: 400, altMax: 600, incMin: 50, incMax: 98, weight: 0.25, namePrefix: 'COSMOS' },
    // Iridium constellation debris: ~780km, 86.4° inc
    { altMin: 750, altMax: 810, incMin: 84, incMax: 88, weight: 0.12, namePrefix: 'IRIDIUM DEB' },
    // Fengyun-1C debris cloud: 800–850km, polar
    { altMin: 790, altMax: 860, incMin: 96, incMax: 100, weight: 0.20, namePrefix: 'FENGYUN' },
    // ISS/Shenzhou region: 380–420km, ~51.6° inc
    { altMin: 375, altMax: 425, incMin: 50, incMax: 53, weight: 0.10, namePrefix: 'FRAG' },
    // General LEO belt: 550–700km, mixed inclinations
    { altMin: 550, altMax: 700, incMin: 28, incMax: 110, weight: 0.33, namePrefix: 'DEBRIS' },
  ];

  for (let i = 0; i < count; i++) {
    // Pick category based on weighted distribution
    const rand = Math.random();
    let cumWeight = 0;
    let cat = debrisCategories[4];
    for (const c of debrisCategories) {
      cumWeight += c.weight;
      if (rand < cumWeight) { cat = c; break; }
    }

    const alt = cat.altMin + Math.random() * (cat.altMax - cat.altMin);
    const inc = cat.incMin + Math.random() * (cat.incMax - cat.incMin);
    const raan = Math.random() * 360;
    const trueLong = Math.random() * 360;

    const { x, y, z } = sphericalToCartesian(alt, inc, raan, trueLong);

    // Velocity vector (tangential to orbit, randomized slightly)
    const v = orbitalVelocity(alt);
    const vAngle = (trueLong + 90) * (Math.PI / 180);
    const vx = v * Math.cos(vAngle) * (1 + (Math.random() - 0.5) * 0.01);
    const vy = v * Math.sin(vAngle) * (1 + (Math.random() - 0.5) * 0.01);
    const vz = v * Math.sin(inc * Math.PI / 180) * (Math.random() - 0.5) * 0.1;

    // Threat level: proximity to ISS orbit gets higher threat
    const issAlt = 408;
    const altDiff = Math.abs(alt - issAlt);
    let threatLevel: 'safe' | 'warning' | 'critical';
    let conjProb: number;

    if (altDiff < 15 && Math.random() < 0.08) {
      threatLevel = 'critical';
      conjProb = 0.15 + Math.random() * 0.85;
    } else if (altDiff < 40 && Math.random() < 0.15) {
      threatLevel = 'warning';
      conjProb = 0.05 + Math.random() * 0.14;
    } else {
      threatLevel = 'safe';
      conjProb = Math.random() * 0.04;
    }

    debris.push({
      id: `debris-${10000 + i}`,
      noradId: 10000 + i,
      name: `${cat.namePrefix} ${i.toString().padStart(4, '0')}`,
      x, y, z, vx, vy, vz,
      threatLevel,
      conjunctionProbability: conjProb,
      altitude: alt,
    });
  }

  return debris;
}

export function generateTargetSatellite(): SatelliteTarget {
  const alt = 408;
  const { x, y, z } = sphericalToCartesian(alt, 51.6, 120, 45);
  return {
    id: 'iss-25544',
    name: 'ISS (ZARYA)',
    noradId: 25544,
    x, y, z,
    altitude: alt,
    inclination: 51.6,
  };
}

export function generateConjunctionEvents(
  debris: DebrisObject[],
  target: SatelliteTarget
): ConjunctionEvent[] {
  const criticals = debris.filter(d => d.threatLevel === 'critical').slice(0, 12);
  const warnings  = debris.filter(d => d.threatLevel === 'warning').slice(0, 8);

  const maneuverTypes: Array<'prograde' | 'retrograde' | 'radial' | 'normal'> = [
    'retrograde', 'prograde', 'radial', 'normal',
  ];

  return [...criticals, ...warnings].map((d, i) => {
    const hoursAhead = 2 + Math.random() * 70;
    const tca = new Date(Date.now() + hoursAhead * 3600000).toISOString();
    const missKm = d.threatLevel === 'critical'
      ? 0.05 + Math.random() * 0.9
      : 1 + Math.random() * 4;

    const mType = maneuverTypes[Math.floor(Math.random() * maneuverTypes.length)];

    return {
      id: `conj-${i}`,
      debrisId: d.id,
      debrisName: d.name,
      targetSatellite: target.name,
      tca,
      missDistance: missKm,
      collisionProbability: d.conjunctionProbability,
      recommendedManeuver: {
        type: mType,
        deltaV: 0.5 + Math.random() * 3.5,
        burnDuration: 1.5 + Math.random() * 8.5,
        executionWindow: new Date(Date.now() + (hoursAhead - 2) * 3600000).toISOString(),
        riskReduction: 94 + Math.random() * 5.9,
      },
    };
  });
}

// Animate debris positions along simplified Keplerian orbits
export function propagateDebris(
  debris: DebrisObject[],
  deltaTimeSeconds: number
): DebrisObject[] {
  return debris.map(d => {
    const r = Math.sqrt(d.x ** 2 + d.y ** 2 + d.z ** 2);
    const alt = r - EARTH_RADIUS_KM;
    const v = orbitalVelocity(alt);

    // Angular velocity (rad/s)
    const omega = v / r;

    // Rotation angle this frame
    const theta = omega * deltaTimeSeconds;

    // Rotate position around Z-axis (simplified 2D orbital plane rotation)
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);
    const newX = d.x * cosT - d.y * sinT;
    const newY = d.x * sinT + d.y * cosT;
    const newZ = d.z; // Z preserved for inclined orbits (simplification)

    return { ...d, x: newX, y: newY, z: newZ };
  });
}
