'use client';
import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useOrbitalStore } from '@/lib/store/orbitalStore';

const QUICK_TARGETS = [
  { id: 'ISS-25544',     label: 'ISS (ZARYA)',         norad: 25544 },
  { id: 'HST-20580',     label: 'Hubble Space Telescope', norad: 20580 },
  { id: 'STARLINK-LEAD', label: 'Starlink (cluster)',   norad: 44713 },
  { id: 'TERRA-27424',   label: 'Terra EOS AM-1',       norad: 25994 },
];

export default function SearchBar() {
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const [scanning, setScanning] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { debrisField, selectDebris } = useOrbitalStore();

  const results = query.length > 1
    ? debrisField
        .filter(d =>
          d.name.toLowerCase().includes(query.toLowerCase()) ||
          d.noradId.toString().includes(query)
        )
        .slice(0, 5)
    : [];

  const handleScan = () => {
    if (!query) return;
    setScanning(true);
    setTimeout(() => {
      const match = debrisField.find(
        d => d.name.toLowerCase().includes(query.toLowerCase()) ||
             d.noradId.toString() === query
      );
      if (match) selectDebris(match);
      setScanning(false);
      setFocused(false);
    }, 800);
  };

  return (
    <motion.div
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: 0.5 }}
      className="fixed top-12 left-1/2 -translate-x-1/2 z-50 w-full max-w-md px-4 pointer-events-auto"
    >
      {/* Input */}
      <div
        className="glass-panel rounded-xl overflow-hidden transition-all"
        style={{
          border: focused
            ? '1px solid rgba(0,245,255,0.4)'
            : '1px solid rgba(0,245,255,0.12)',
          boxShadow: focused ? '0 0 30px rgba(0,245,255,0.12)' : 'none',
        }}
      >
        <div className="flex items-center px-4 py-2.5 gap-3">
          {/* Icon */}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(0,245,255,0.6)" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>

          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 200)}
            onKeyDown={e => e.key === 'Enter' && handleScan()}
            placeholder="Enter Satellite ID or TLE Data…"
            className="flex-1 bg-transparent outline-none mono text-sm text-white placeholder-white/20"
          />

          {/* Scan button */}
          <button
            onClick={handleScan}
            disabled={scanning}
            className="px-3 py-1 rounded-lg mono text-xs font-semibold tracking-wider transition-all"
            style={{
              background: scanning ? 'rgba(0,245,255,0.2)' : 'rgba(0,245,255,0.12)',
              border: '1px solid rgba(0,245,255,0.3)',
              color: '#00f5ff',
              minWidth: 80,
            }}
          >
            {scanning ? (
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                SCAN…
              </span>
            ) : 'SCAN →'}
          </button>
        </div>

        {/* Scanning progress bar */}
        <AnimatePresence>
          {scanning && (
            <motion.div
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              exit={{ scaleX: 0, opacity: 0 }}
              style={{
                height: 1,
                background: 'linear-gradient(90deg, transparent, #00f5ff, transparent)',
                transformOrigin: 'left',
              }}
            />
          )}
        </AnimatePresence>
      </div>

      {/* Dropdown results */}
      <AnimatePresence>
        {focused && (results.length > 0 || query.length === 0) && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="glass-panel rounded-xl mt-1.5 overflow-hidden"
          >
            {query.length === 0 && (
              <>
                <div className="px-4 py-2 mono text-xs text-white/30 tracking-widest border-b border-white/5">
                  QUICK TARGETS
                </div>
                {QUICK_TARGETS.map(t => (
                  <button
                    key={t.id}
                    className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-white/5 transition-colors"
                    onClick={() => { setQuery(t.label); }}
                  >
                    <span className="mono text-xs text-white/70">{t.label}</span>
                    <span className="mono text-xs text-white/30">{t.norad}</span>
                  </button>
                ))}
              </>
            )}

            {results.map(d => (
              <button
                key={d.id}
                className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-white/5 transition-colors"
                onClick={() => { selectDebris(d); setFocused(false); setQuery(d.name); }}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{
                      background: d.threatLevel === 'critical' ? '#ef4444'
                                : d.threatLevel === 'warning'  ? '#ffb703'
                                : '#00f5ff',
                    }}
                  />
                  <span className="mono text-xs text-white/70">{d.name}</span>
                </div>
                <span className="mono text-xs text-white/30">{d.noradId}</span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
