'use client';
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useOrbitalStore } from '@/lib/store/orbitalStore';

const SPEED_PRESETS = [1, 10, 72, 720] as const;

function RadarIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28">
      <circle cx="14" cy="14" r="12" stroke="rgba(0,245,255,0.2)" strokeWidth="1" fill="none" />
      <circle cx="14" cy="14" r="8"  stroke="rgba(0,245,255,0.15)" strokeWidth="1" fill="none" />
      <circle cx="14" cy="14" r="4"  stroke="rgba(0,245,255,0.15)" strokeWidth="1" fill="none" />
      <circle cx="14" cy="14" r="1.5" fill="#00f5ff" opacity="0.9" />
      {/* Sweep line */}
      <line
        x1="14" y1="14" x2="14" y2="2"
        stroke="url(#sweep)"
        strokeWidth="1.5"
        strokeLinecap="round"
        style={{
          transformOrigin: '14px 14px',
          animation: spinning ? 'radar-sweep 2s linear infinite' : 'none',
        }}
      />
      <defs>
        <linearGradient id="sweep" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#00f5ff" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#00f5ff" stopOpacity="0.1" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export default function SimulationControls() {
  const {
    simMode, simSpeed, simTimeOffset, currentSimTime,
    setSimMode, setSimSpeed, advanceSimTime,
  } = useOrbitalStore();

  const [scrubValue, setScrubValue] = useState(0);

  // Keep scrubber in sync with sim time
  useEffect(() => {
    setScrubValue(Math.min(simTimeOffset / 72, 1));
  }, [simTimeOffset]);

  const handleSpeedSelect = (speed: number) => {
    setSimSpeed(speed);
    setSimMode(speed === 1 ? 'realtime' : 'fast-forward');
  };

  const handlePause = () => {
    setSimMode(simMode === 'paused' ? 'realtime' : 'paused');
  };

  const handleScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
    const pct = parseFloat(e.target.value);
    const targetHours = pct * 72;
    advanceSimTime(targetHours - simTimeOffset);
    setScrubValue(pct);
  };

  const isPaused = simMode === 'paused';
  const isFF     = simMode === 'fast-forward';

  return (
    <motion.div
      initial={{ y: 80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: 1.2, type: 'spring', damping: 25 }}
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 pointer-events-auto"
    >
      <div
        className="glass-panel rounded-2xl px-5 py-3 flex items-center gap-5"
        style={{ minWidth: 480 }}
      >
        {/* Radar */}
        <RadarIcon spinning={!isPaused} />

        {/* Play / Pause */}
        <button
          onClick={handlePause}
          className="w-8 h-8 rounded-lg flex items-center justify-center transition-all"
          style={{
            background: isPaused ? 'rgba(0,245,255,0.15)' : 'rgba(255,255,255,0.06)',
            border: `1px solid ${isPaused ? 'rgba(0,245,255,0.4)' : 'rgba(255,255,255,0.12)'}`,
            color: isPaused ? '#00f5ff' : 'rgba(255,255,255,0.6)',
          }}
          title={isPaused ? 'Resume' : 'Pause'}
        >
          {isPaused
            ? <svg width="10" height="12" viewBox="0 0 10 12" fill="currentColor"><polygon points="0,0 10,6 0,12" /></svg>
            : <svg width="10" height="12" viewBox="0 0 10 12" fill="currentColor"><rect x="0" y="0" width="3.5" height="12" /><rect x="6.5" y="0" width="3.5" height="12" /></svg>
          }
        </button>

        {/* Timeline scrubber */}
        <div className="flex flex-col gap-1 flex-1">
          <div className="flex items-center justify-between">
            <span className="mono text-xs text-white/30">T+0h</span>
            <span className="mono text-xs text-white/50 tabular-nums">
              {simTimeOffset > 0 ? `T+${simTimeOffset.toFixed(1)}h` : 'NOW'}
            </span>
            <span className="mono text-xs text-white/30">T+72h</span>
          </div>
          <div className="relative">
            <input
              type="range"
              min={0} max={1} step={0.001}
              value={scrubValue}
              onChange={handleScrub}
              className="w-full h-1 appearance-none cursor-pointer"
              style={{
                background: `linear-gradient(to right, #00f5ff ${scrubValue * 100}%, rgba(255,255,255,0.1) ${scrubValue * 100}%)`,
                borderRadius: 4,
                outline: 'none',
                accentColor: '#00f5ff',
              }}
            />
          </div>
        </div>

        {/* Speed presets */}
        <div className="flex items-center gap-1">
          {SPEED_PRESETS.map(speed => (
            <button
              key={speed}
              onClick={() => handleSpeedSelect(speed)}
              className="px-2 py-1 rounded mono text-xs transition-all"
              style={{
                background: simSpeed === speed && !isPaused
                  ? 'rgba(0,245,255,0.15)'
                  : 'rgba(255,255,255,0.04)',
                border: `1px solid ${simSpeed === speed && !isPaused ? 'rgba(0,245,255,0.4)' : 'rgba(255,255,255,0.08)'}`,
                color: simSpeed === speed && !isPaused ? '#00f5ff' : 'rgba(255,255,255,0.4)',
                boxShadow: simSpeed === speed && !isPaused ? '0 0 12px rgba(0,245,255,0.15)' : 'none',
              }}
            >
              {speed === 1 ? '1×' : speed === 720 ? '720×' : `${speed}×`}
            </button>
          ))}
        </div>

        {/* 72hr fast-forward shortcut */}
        <button
          onClick={() => { setSimMode('fast-forward'); setSimSpeed(72); advanceSimTime(72 - simTimeOffset); }}
          className="px-3 py-1.5 rounded-lg mono text-xs font-semibold tracking-wider transition-all"
          style={{
            background: isFF ? 'rgba(255,183,3,0.15)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${isFF ? 'rgba(255,183,3,0.4)' : 'rgba(255,255,255,0.08)'}`,
            color: isFF ? '#ffb703' : 'rgba(255,255,255,0.4)',
            whiteSpace: 'nowrap',
          }}
        >
          72H PROJ
        </button>
      </div>
    </motion.div>
  );
}
