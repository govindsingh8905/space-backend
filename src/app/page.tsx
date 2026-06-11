'use client';
import { useEffect, useRef, Suspense } from 'react';
import dynamic from 'next/dynamic';
import { motion } from 'framer-motion';
import { useOrbitalStore } from '@/lib/store/orbitalStore';
import {
  generateDebrisField,
  generateTargetSatellite,
  generateConjunctionEvents,
} from '@/lib/utils/mockData';
import { useWebSocket } from '@/lib/hooks/useWebSocket';

// Dynamic imports — Three.js must be client-side only
const Scene            = dynamic(() => import('@/components/scene/Scene'),            { ssr: false });
const HudTopBar        = dynamic(() => import('@/components/ui/HudTopBar'),           { ssr: false });
const AlertFeed        = dynamic(() => import('@/components/ui/AlertFeed'),            { ssr: false });
const DebrisDetailPanel = dynamic(() => import('@/components/ui/DebrisDetailPanel'),  { ssr: false });
const SimulationControls = dynamic(() => import('@/components/ui/SimulationControls'), { ssr: false });
const StatsPanel       = dynamic(() => import('@/components/ui/StatsPanel'),          { ssr: false });
const SearchBar        = dynamic(() => import('@/components/ui/SearchBar'),            { ssr: false });
const NarrativeOverlay = dynamic(() => import('@/components/overlays/NarrativeOverlay'), { ssr: false });

// Loading screen component
function LoadingScreen({ progress }: { progress: number }) {
  return (
    <div className="fixed inset-0 z-[200] bg-[#030712] flex flex-col items-center justify-center">
      {/* Animated orbital ring */}
      <div className="relative w-24 h-24 mb-8">
        <svg viewBox="0 0 96 96" className="w-full h-full animate-spin-slow">
          <circle cx="48" cy="48" r="40" stroke="rgba(0,245,255,0.1)" strokeWidth="1" fill="none" />
          <circle cx="48" cy="48" r="40" stroke="url(#grad)" strokeWidth="1.5" fill="none"
            strokeDasharray="251.2" strokeDashoffset={251.2 * (1 - progress / 100)} strokeLinecap="round" />
          <defs>
            <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%"   stopColor="#00f5ff" stopOpacity="0" />
              <stop offset="100%" stopColor="#00f5ff" stopOpacity="1" />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-2 h-2 rounded-full bg-cyan-400"
            style={{ boxShadow: '0 0 12px #00f5ff, 0 0 24px #00f5ff' }} />
        </div>
      </div>

      <div className="mono text-xs tracking-widest text-neon-cyan mb-2">NEXUS SYSTEM</div>
      <div className="mono text-xs text-white/30 mb-8">INITIALIZING ORBITAL SCAN ENGINE</div>

      {/* Progress bar */}
      <div className="w-64 h-px bg-white/8 relative overflow-hidden">
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ background: 'linear-gradient(90deg, transparent, #00f5ff)' }}
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>
      <div className="mono text-xs text-white/20 mt-3">{progress}% — LOADING TLE DATABASE</div>

      {/* Status lines */}
      <div className="mt-8 space-y-1.5 text-left w-64">
        {[
          { done: progress > 10, text: 'Initializing SGP4 propagator' },
          { done: progress > 30, text: 'Loading 27,000+ debris objects' },
          { done: progress > 60, text: 'Generating threat assessments' },
          { done: progress > 80, text: 'Calibrating conjunction engine' },
          { done: progress > 95, text: 'Rendering orbital visualization' },
        ].map(({ done, text }) => (
          <div key={text} className="flex items-center gap-2">
            <span className={`w-1 h-1 rounded-full ${done ? 'bg-cyan-400' : 'bg-white/15'}`}
              style={done ? { boxShadow: '0 0 6px #00f5ff' } : {}} />
            <span className={`mono text-xs ${done ? 'text-white/50' : 'text-white/15'}`}>{text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function HomePage() {
  useWebSocket();
  const {
    setDebrisField, setTargetSatellite, setConjunctions,
    dataLoaded, selectDebris,
  } = useOrbitalStore();

  const loadProgress = useRef(0);
  const progressState = useRef<{ value: number; setter: ((v: number) => void) | null }>({
    value: 0, setter: null,
  });

  // Initialize mock data with staggered progress simulation
  useEffect(() => {
    let progress = 0;
    const interval = setInterval(() => {
      progress = Math.min(progress + Math.random() * 8 + 2, 95);
      loadProgress.current = progress;
    }, 120);

    // Generate full debris field in chunks to avoid blocking
    setTimeout(() => {
      const target  = generateTargetSatellite();
      setTargetSatellite(target);

      const debris  = generateDebrisField(2700);
      setDebrisField(debris);

      const conjunctions = generateConjunctionEvents(debris, target);
      setConjunctions(conjunctions);

      clearInterval(interval);
      loadProgress.current = 100;
    }, 2200);

    return () => clearInterval(interval);
  }, [setDebrisField, setTargetSatellite, setConjunctions]);

  // Show loading screen until data loads
  if (!dataLoaded) {
    return <ProgressLoader />;
  }

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-[#030712]">
      {/* ── 3D Canvas — fills entire viewport ── */}
      <div className="absolute inset-0 z-0">
        <Suspense fallback={null}>
          <Scene onSelectDebris={selectDebris} />
        </Suspense>
      </div>

      {/* ── Tabbed Dashboard Overlay ── */}
      <div className="absolute inset-0 z-20 pointer-events-none">
        <NarrativeOverlay />
      </div>
    </main>
  );
}

// Separate component to handle progress display with state
function ProgressLoader() {
  const [progress, setProgress] = [
    useRef(0).current,
    (v: number) => {},
  ];

  // Animate progress
  const [displayProgress, setDisplayProgress] =
    typeof window !== 'undefined'
      ? // eslint-disable-next-line react-hooks/rules-of-hooks
        (() => { const { useState } = require('react'); return useState(0); })()
      : [0, () => {}];

  useEffect(() => {
    const id = setInterval(() => {
      setDisplayProgress((p: number) => Math.min(p + Math.random() * 7 + 1.5, 98));
    }, 150);
    return () => clearInterval(id);
  }, [setDisplayProgress]);

  return <LoadingScreen progress={Math.round(displayProgress)} />;
}
