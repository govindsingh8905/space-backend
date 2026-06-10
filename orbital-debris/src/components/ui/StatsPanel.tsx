'use client';
import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useOrbitalStore } from '@/lib/store/orbitalStore';

function Gauge({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = Math.min(value / max, 1);
  return (
    <div className="relative h-1 bg-white/8 rounded-full overflow-hidden">
      <div
        className="absolute left-0 top-0 h-full rounded-full transition-all duration-500"
        style={{
          width: `${pct * 100}%`,
          background: color,
          boxShadow: `0 0 8px ${color}60`,
        }}
      />
    </div>
  );
}

export default function StatsPanel() {
  const { debrisField, conjunctions } = useOrbitalStore();

  const stats = useMemo(() => {
    const critCount = debrisField.filter(d => d.threatLevel === 'critical').length;
    const warnCount = debrisField.filter(d => d.threatLevel === 'warning').length;
    const safeCount = debrisField.length - critCount - warnCount;

    const altBuckets = { leo: 0, meo: 0, geo: 0 };
    debrisField.forEach(d => {
      if (d.altitude < 2000)       altBuckets.leo++;
      else if (d.altitude < 36000) altBuckets.meo++;
      else                         altBuckets.geo++;
    });

    return { critCount, warnCount, safeCount, total: debrisField.length, altBuckets };
  }, [debrisField]);

  return (
    <motion.div
      initial={{ x: -60, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ delay: 1.0, type: 'spring', damping: 26 }}
      className="fixed bottom-20 left-4 z-40 w-52 pointer-events-auto"
    >
      <div className="glass-panel rounded-xl p-4 space-y-4">
        {/* Total */}
        <div>
          <div className="mono text-xs text-white/30 tracking-widest uppercase mb-1">Tracked Objects</div>
          <div className="mono text-2xl font-light text-neon-cyan tabular-nums">
            {stats.total.toLocaleString()}
          </div>
        </div>

        {/* Threat breakdown */}
        <div className="space-y-2">
          <div className="mono text-xs text-white/30 tracking-widest uppercase">Threat Status</div>

          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <span className="mono text-xs text-red-400">CRITICAL</span>
              <span className="mono text-xs font-bold text-red-400">{stats.critCount}</span>
            </div>
            <Gauge value={stats.critCount} max={stats.total} color="#ef4444" />

            <div className="flex justify-between items-center">
              <span className="mono text-xs text-amber-400">WARNING</span>
              <span className="mono text-xs font-bold text-amber-400">{stats.warnCount}</span>
            </div>
            <Gauge value={stats.warnCount} max={stats.total} color="#ffb703" />

            <div className="flex justify-between items-center">
              <span className="mono text-xs text-cyan-400">NOMINAL</span>
              <span className="mono text-xs font-bold text-cyan-400">{stats.safeCount}</span>
            </div>
            <Gauge value={stats.safeCount} max={stats.total} color="#00f5ff" />
          </div>
        </div>

        {/* Altitude distribution */}
        <div className="space-y-1.5">
          <div className="mono text-xs text-white/30 tracking-widest uppercase">Orbit Distribution</div>
          <div className="flex gap-1">
            {[
              { label: 'LEO', count: stats.altBuckets.leo, color: '#00f5ff' },
              { label: 'MEO', count: stats.altBuckets.meo, color: '#ffb703' },
              { label: 'GEO', count: stats.altBuckets.geo, color: '#4ade80' },
            ].map(({ label, count, color }) => (
              <div
                key={label}
                className="flex-1 rounded p-1.5 text-center"
                style={{ background: `${color}0D`, border: `1px solid ${color}20` }}
              >
                <div className="mono text-xs font-bold" style={{ color }}>{count}</div>
                <div className="mono text-xs text-white/30">{label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Active conjunctions */}
        <div className="flex justify-between items-center pt-1 border-t border-white/5">
          <span className="mono text-xs text-white/30">Active Conjunctions</span>
          <span
            className="mono text-xs font-bold px-1.5 py-0.5 rounded"
            style={{
              background: 'rgba(239,68,68,0.12)',
              border: '1px solid rgba(239,68,68,0.3)',
              color: '#ef4444',
            }}
          >
            {conjunctions.length}
          </span>
        </div>
      </div>
    </motion.div>
  );
}
