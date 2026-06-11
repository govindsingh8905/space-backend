'use client';
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useOrbitalStore } from '@/lib/store/orbitalStore';

function Blinker({ active }: { active: boolean }) {
  return (
    <span className={`inline-block w-1.5 h-1.5 rounded-full ${active ? 'bg-cyan-neon animate-pulse' : 'bg-gray-600'}`}
      style={active ? { boxShadow: '0 0 8px #00f5ff' } : {}} />
  );
}

export default function HudTopBar() {
  const { wsConnected, alertCount, dataLoaded, currentSimTime, simMode, simSpeed } = useOrbitalStore();
  const [tick, setTick] = useState(0);

  // Clock tick
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const timeStr = currentSimTime.toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
  const simLabel = simMode === 'fast-forward' ? `×${simSpeed} FFWD` : simMode === 'paused' ? 'PAUSED' : 'LIVE';
  const simColor = simMode === 'fast-forward' ? '#ffb703' : simMode === 'paused' ? '#6b7280' : '#00f5ff';

  return (
    <div className="fixed top-0 left-0 right-0 z-50 pointer-events-none">
      <div className="glass-panel border-b border-cyan-neon/10 px-6 py-2 flex items-center justify-between">
        {/* Left: Logo + system name */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <div className="w-6 h-6 rounded border border-cyan-neon/40 flex items-center justify-center"
              style={{ boxShadow: '0 0 12px rgba(0,245,255,0.2)' }}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <circle cx="6" cy="6" r="5" stroke="#00f5ff" strokeWidth="1" opacity="0.6" />
                <circle cx="6" cy="6" r="2" fill="#00f5ff" opacity="0.9" />
                <line x1="6" y1="1" x2="6" y2="3" stroke="#00f5ff" strokeWidth="0.8" />
                <line x1="6" y1="9" x2="6" y2="11" stroke="#00f5ff" strokeWidth="0.8" />
                <line x1="1" y1="6" x2="3" y2="6" stroke="#00f5ff" strokeWidth="0.8" />
                <line x1="9" y1="6" x2="11" y2="6" stroke="#00f5ff" strokeWidth="0.8" />
              </svg>
            </div>
            <span className="mono text-xs font-semibold tracking-widest text-neon-cyan">NEXUS</span>
          </div>
          <span className="text-white/20 text-xs">|</span>
          <span className="mono text-xs text-white/40 tracking-wider">ORBITAL DEBRIS DETECTION v2.4.1</span>
        </div>

        {/* Center: Sim time */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Blinker active={wsConnected && simMode === 'realtime'} />
            <span className="mono text-xs tracking-wider" style={{ color: simColor }}>{simLabel}</span>
          </div>
          <span className="mono text-xs text-white/60 tabular-nums">{timeStr}</span>
        </div>

        {/* Right: Status indicators */}
        <div className="flex items-center gap-4">
          {/* Data feed */}
          <div className="flex items-center gap-1.5">
            <Blinker active={dataLoaded} />
            <span className="mono text-xs text-white/40">TLE FEED</span>
            <span className="mono text-xs" style={{ color: dataLoaded ? '#00f5ff' : '#6b7280' }}>
              {dataLoaded ? 'NOMINAL' : 'ACQUIRING'}
            </span>
          </div>

          {/* WS connection */}
          <div className="flex items-center gap-1.5">
            <Blinker active={wsConnected} />
            <span className="mono text-xs" style={{ color: wsConnected ? '#4ade80' : '#f87171' }}>
              {wsConnected ? 'STREAM OK' : 'OFFLINE'}
            </span>
          </div>

          {/* Alert count */}
          <AnimatePresence>
            {alertCount > 0 && (
              <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                className="flex items-center gap-1.5 px-2.5 py-0.5 rounded"
                style={{
                  background: 'rgba(239,68,68,0.15)',
                  border: '1px solid rgba(239,68,68,0.4)',
                  boxShadow: '0 0 16px rgba(239,68,68,0.15)',
                }}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                <span className="mono text-xs text-red-400 font-semibold">{alertCount} CRITICAL</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
