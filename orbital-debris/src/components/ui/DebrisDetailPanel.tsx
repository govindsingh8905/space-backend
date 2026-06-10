'use client';
import { motion, AnimatePresence } from 'framer-motion';
import { useOrbitalStore } from '@/lib/store/orbitalStore';

const THREAT_CONFIG = {
  safe:     { color: '#00f5ff', label: 'NOMINAL',  bg: 'rgba(0,245,255,0.06)'  },
  warning:  { color: '#ffb703', label: 'WARNING',  bg: 'rgba(255,183,3,0.06)'  },
  critical: { color: '#ef4444', label: 'CRITICAL', bg: 'rgba(239,68,68,0.08)'  },
};

function DataRow({ label, value, unit = '', color }: {
  label: string; value: string | number; unit?: string; color?: string;
}) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-white/5">
      <span className="mono text-xs text-white/40 uppercase tracking-wider">{label}</span>
      <span className="mono text-xs font-medium tabular-nums" style={{ color: color || 'rgba(255,255,255,0.85)' }}>
        {value}{unit && <span className="text-white/30 ml-1">{unit}</span>}
      </span>
    </div>
  );
}

export default function DebrisDetailPanel() {
  const { selectedDebris, selectDebris, conjunctions, selectManeuver, selectedManeuver } = useOrbitalStore();

  const conjunction = conjunctions.find(c => c.debrisId === selectedDebris?.id);
  const cfg = selectedDebris ? THREAT_CONFIG[selectedDebris.threatLevel] : null;

  return (
    <AnimatePresence>
      {selectedDebris && cfg && (
        <motion.div
          key="debris-panel"
          initial={{ x: 320, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 320, opacity: 0 }}
          transition={{ type: 'spring', damping: 28, stiffness: 300 }}
          className="fixed right-4 top-16 bottom-4 z-40 w-72 flex flex-col gap-3 pointer-events-auto"
        >
          {/* Header */}
          <div
            className="glass-panel rounded-xl p-4 relative overflow-hidden"
            style={{ borderColor: `${cfg.color}30`, background: cfg.bg }}
          >
            <div className="scan-line" style={{ opacity: 0.4 }} />
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="mono text-xs text-white/40 tracking-widest mb-0.5">OBJECT ID</div>
                <div className="mono text-sm font-semibold text-white">{selectedDebris.noradId}</div>
              </div>
              <button
                onClick={() => selectDebris(null)}
                className="w-6 h-6 rounded border border-white/10 flex items-center justify-center text-white/30 hover:text-white/70 hover:border-white/30 transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="mono text-base font-medium text-white mb-3 leading-tight">
              {selectedDebris.name}
            </div>

            {/* Threat badge */}
            <div
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full"
              style={{ background: `${cfg.color}15`, border: `1px solid ${cfg.color}40` }}
            >
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: cfg.color }} />
              <span className="mono text-xs font-bold tracking-widest" style={{ color: cfg.color }}>
                {cfg.label}
              </span>
            </div>
          </div>

          {/* Orbital parameters */}
          <div className="glass-panel rounded-xl p-4">
            <div className="mono text-xs text-white/30 tracking-widest uppercase mb-3">Orbital Parameters</div>
            <DataRow label="Altitude"    value={selectedDebris.altitude.toFixed(1)} unit="km" />
            <DataRow label="Position X"  value={selectedDebris.x.toFixed(2)}        unit="km" />
            <DataRow label="Position Y"  value={selectedDebris.y.toFixed(2)}        unit="km" />
            <DataRow label="Position Z"  value={selectedDebris.z.toFixed(2)}        unit="km" />
            <DataRow label="Velocity X"  value={selectedDebris.vx.toFixed(3)}       unit="km/s" />
            <DataRow label="Velocity Y"  value={selectedDebris.vy.toFixed(3)}       unit="km/s" />
            <DataRow
              label="Conj. Prob."
              value={(selectedDebris.conjunctionProbability * 100).toFixed(3)}
              unit="%"
              color={cfg.color}
            />
          </div>

          {/* Conjunction event details */}
          {conjunction && (
            <div
              className="glass-panel rounded-xl p-4"
              style={{ borderColor: `${cfg.color}25` }}
            >
              <div className="mono text-xs text-white/30 tracking-widest uppercase mb-3">Conjunction Event</div>
              <DataRow label="Target"      value={conjunction.targetSatellite} />
              <DataRow
                label="Miss Distance"
                value={conjunction.missDistance.toFixed(3)}
                unit="km"
                color={conjunction.missDistance < 1 ? '#ef4444' : '#ffb703'}
              />
              <DataRow
                label="Collision Pc"
                value={(conjunction.collisionProbability * 100).toFixed(4)}
                unit="%"
                color={cfg.color}
              />
              <DataRow label="TCA" value={new Date(conjunction.tca).toISOString().substring(11, 19)} unit="UTC" />
            </div>
          )}

          {/* Maneuver recommendation */}
          {conjunction?.recommendedManeuver && (
            <div className="glass-panel rounded-xl p-4">
              <div className="mono text-xs text-white/30 tracking-widest uppercase mb-3">
                Recommended Maneuver
              </div>
              <div
                className="rounded-lg p-3 mb-3"
                style={{
                  background: 'rgba(0,245,255,0.06)',
                  border: '1px solid rgba(0,245,255,0.2)',
                }}
              >
                <div className="mono text-xs text-white/50 mb-1">TYPE</div>
                <div className="mono text-sm font-bold text-neon-cyan uppercase tracking-wider">
                  {conjunction.recommendedManeuver.type} BURN
                </div>
              </div>

              <DataRow label="ΔV Required"   value={conjunction.recommendedManeuver.deltaV.toFixed(2)}       unit="m/s" />
              <DataRow label="Burn Duration"  value={conjunction.recommendedManeuver.burnDuration.toFixed(1)} unit="sec" />
              <DataRow
                label="Risk Reduction"
                value={conjunction.recommendedManeuver.riskReduction.toFixed(1)}
                unit="%"
                color="#4ade80"
              />
              <DataRow
                label="Exec. Window"
                value={new Date(conjunction.recommendedManeuver.executionWindow).toISOString().substring(11, 19)}
                unit="UTC"
              />

              <button
                onClick={() => selectManeuver(
                  selectedManeuver ? null : conjunction.recommendedManeuver!
                )}
                className="w-full mt-3 py-2 rounded-lg mono text-xs font-semibold tracking-wider transition-all"
                style={{
                  background: selectedManeuver
                    ? 'rgba(74,222,128,0.15)'
                    : 'rgba(0,245,255,0.12)',
                  border: selectedManeuver
                    ? '1px solid rgba(74,222,128,0.4)'
                    : '1px solid rgba(0,245,255,0.3)',
                  color: selectedManeuver ? '#4ade80' : '#00f5ff',
                  boxShadow: selectedManeuver
                    ? '0 0 20px rgba(74,222,128,0.15)'
                    : '0 0 20px rgba(0,245,255,0.1)',
                }}
              >
                {selectedManeuver ? '✓ MANEUVER QUEUED' : 'QUEUE MANEUVER'}
              </button>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
