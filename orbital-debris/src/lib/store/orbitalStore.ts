import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

// ── Types ──────────────────────────────────────────────────────────────────
export type ThreatLevel = 'safe' | 'warning' | 'critical';

export interface DebrisObject {
  id: string;
  noradId: number;
  name: string;
  x: number; y: number; z: number;         // ECI km
  vx: number; vy: number; vz: number;      // km/s
  threatLevel: ThreatLevel;
  conjunctionProbability: number;           // 0–1
  altitude: number;                         // km
}

export interface ConjunctionEvent {
  id: string;
  debrisId: string;
  debrisName: string;
  targetSatellite: string;
  tca: string;                              // Time of Closest Approach (ISO)
  missDistance: number;                     // km
  collisionProbability: number;
  recommendedManeuver?: ManeuverRecommendation;
}

export interface ManeuverRecommendation {
  type: 'prograde' | 'retrograde' | 'radial' | 'normal';
  deltaV: number;                           // m/s
  burnDuration: number;                     // seconds
  executionWindow: string;                  // ISO
  riskReduction: number;                    // percentage
}

export interface SatelliteTarget {
  id: string;
  name: string;
  noradId: number;
  x: number; y: number; z: number;
  altitude: number;
  inclination: number;
}

type SimulationMode = 'realtime' | 'fast-forward' | 'paused';

interface OrbitalStore {
  // Scene state
  debrisField:        DebrisObject[];
  conjunctions:       ConjunctionEvent[];
  targetSatellite:    SatelliteTarget | null;
  selectedDebris:     DebrisObject | null;
  activeSection:      number;              // 0=hero, 1=threat, 2=satellite, 3=features, 4=cta

  // Simulation
  simMode:            SimulationMode;
  simTimeOffset:      number;             // hours ahead
  simSpeed:           number;             // 1 = realtime, 72 = 72hr in 1 min
  currentSimTime:     Date;

  // UI
  wsConnected:        boolean;
  dataLoaded:         boolean;
  alertCount:         number;
  selectedManeuver:   ManeuverRecommendation | null;

  // Camera
  cameraTarget:       [number, number, number];
  cameraFov:          number;

  // Actions
  setDebrisField:        (debris: DebrisObject[]) => void;
  updateDebrisPositions: (updates: Pick<DebrisObject, 'id' | 'x' | 'y' | 'z'>[]) => void;
  setConjunctions:       (events: ConjunctionEvent[]) => void;
  setTargetSatellite:    (sat: SatelliteTarget) => void;
  selectDebris:          (debris: DebrisObject | null) => void;
  setActiveSection:      (section: number) => void;
  setSimMode:            (mode: SimulationMode) => void;
  setSimSpeed:           (speed: number) => void;
  advanceSimTime:        (hours: number) => void;
  setWsConnected:        (connected: boolean) => void;
  setDataLoaded:         (loaded: boolean) => void;
  selectManeuver:        (m: ManeuverRecommendation | null) => void;
  setCameraTarget:       (target: [number, number, number]) => void;
  setCameraFov:          (fov: number) => void;
}

export const useOrbitalStore = create<OrbitalStore>()(
  subscribeWithSelector((set, get) => ({
    // Initial state
    debrisField:      [],
    conjunctions:     [],
    targetSatellite:  null,
    selectedDebris:   null,
    activeSection:    0,
    simMode:          'realtime',
    simTimeOffset:    0,
    simSpeed:         1,
    currentSimTime:   new Date(),
    wsConnected:      false,
    dataLoaded:       false,
    alertCount:       0,
    selectedManeuver: null,
    cameraTarget:     [0, 0, 0],
    cameraFov:        60,

    // Actions
    setDebrisField: (debris) => set({
      debrisField: debris,
      alertCount:  debris.filter(d => d.threatLevel === 'critical').length,
      dataLoaded:  true,
    }),

    updateDebrisPositions: (updates) => set((state) => ({
      debrisField: state.debrisField.map(d => {
        const upd = updates.find(u => u.id === d.id);
        return upd ? { ...d, x: upd.x, y: upd.y, z: upd.z } : d;
      }),
    })),

    setConjunctions: (events) => set({ conjunctions: events }),
    setTargetSatellite: (sat) => set({ targetSatellite: sat }),
    selectDebris: (debris) => set({ selectedDebris: debris }),
    setActiveSection: (section) => set({ activeSection: section }),
    setSimMode: (mode) => set({ simMode: mode }),
    setSimSpeed: (speed) => set({ simSpeed: speed }),

    advanceSimTime: (hours) => set((state) => ({
      simTimeOffset: state.simTimeOffset + hours,
      currentSimTime: new Date(state.currentSimTime.getTime() + hours * 3600000),
    })),

    setWsConnected: (connected) => set({ wsConnected: connected }),
    setDataLoaded:  (loaded)    => set({ dataLoaded: loaded }),
    selectManeuver: (m)         => set({ selectedManeuver: m }),
    setCameraTarget: (target)   => set({ cameraTarget: target }),
    setCameraFov:    (fov)      => set({ cameraFov: fov }),
  }))
);
