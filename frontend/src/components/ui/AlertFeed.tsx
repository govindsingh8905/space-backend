'use client';
import { motion, AnimatePresence } from 'framer-motion';
import { useOrbitalStore } from '@/lib/store/orbitalStore';

function formatTCA(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const hrs = (d.getTime() - now.getTime()) / 3600000;
  if (hrs < 0)  return 'PASSED';
  if (hrs < 1)  return `${Math.round(hrs * 60)}m`;
  if (hrs < 24) return `${hrs.toFixed(1)}h`;
  return `${(hrs / 24).toFixed(1)}d`;
}

function threatColor(prob: number) {
  if (prob > 0.25) return { color: '#ef4444', bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.3)' };
  if (prob > 0.05) return { color: '#ffb703', bg: 'rgba(255,183,3,0.06)',  border: 'rgba(255,183,3,0.25)' };
  return              { color: '#00f5ff', bg: 'rgba(0,245,255,0.04)',   border: 'rgba(0,245,255,0.15)' };
}

export default function AlertFeed() {
  const { conjunctions, debrisField, selectDebris, alertCount } = useOrbitalStore();

  const sorted = [...conjunctions].sort((a, b) => b.collisionProbability - a.collisionProbability);

  return (
    <motion.div
      initial={{ x: -320, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ delay: 0.8, type: 'spring', damping: 28 }}
      className="fixed left-4 top-16 bottom-20 z-40 w-64 flex flex-col gap-2 pointer-events-auto"
    >
      {/* Header */}
      <div className="glass-panel rounded-xl px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"
            style={{ boxShadow: '0 0 8px rgba(239,68,68,0.6)' }} />
          <span className="mono text-xs font-semibold tracking-widest text-white/70">CONJUNCTION LOG</span>
        </div>
        <span
          className="mono text-xs font-bold px-2 py-0.5 rounded-full"
          style={{
            background: 'rgba(239,68,68,0.15)',
            border: '1px solid rgba(239,68,68,0.3)',
            color: '#ef4444',
          }}
        >
          {alertCount}
        </span>
      </div>

      {/* Feed */}
      <div className="flex-1 overflow-y-auto space-y-2 pr-1 scrollbar-thin" style={{ scrollbarWidth: 'none' }}>
        <AnimatePresence initial={false}>
          {sorted.map((event, i) => {
            const tc = threatColor(event.collisionProbability);
            const debris = debrisField.find(d => d.id === event.debrisId);

            return (
              <motion.button
                key={event.id}
                initial={{ x: -40, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: -40, opacity: 0 }}
                transition={{ delay: i * 0.04 }}
                onClick={() => debris && selectDebris(debris)}
                className="w-full text-left rounded-xl p-3 transition-all group"
                style={{
                  background: tc.bg,
                  border: `1px solid ${tc.border}`,
                }}
              >
                {/* Top row */}
                <div className="flex items-start justify-between mb-1.5">
                  <div className="mono text-xs font-semibold text-white leading-tight" style={{ maxWidth: 130 }}>
                    {event.debrisName.substring(0, 16)}
                  </div>
                  <div
                    className="mono text-xs font-bold px-1.5 py-0.5 rounded"
                    style={{
                      background: `${tc.color}15`,
                      color: tc.color,
                      fontSize: '0.65rem',
                    }}
                  >
                    TCA {formatTCA(event.tca)}
                  </div>
                </div>

                {/* Data rows */}
                <div className="space-y-0.5">
                  <div className="flex justify-between">
                    <span className="mono text-xs text-white/30">Pc</span>
                    <span className="mono text-xs font-medium" style={{ color: tc.color }}>
                      {(event.collisionProbability * 100).toFixed(3)}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="mono text-xs text-white/30">Miss</span>
                    <span className="mono text-xs text-white/70">
                      {event.missDistance.toFixed(2)} km
                    </span>
                  </div>
                  {event.recommendedManeuver && (
                    <div className="flex justify-between mt-1">
                      <span className="mono text-xs text-white/20">ΔV</span>
                      <span className="mono text-xs text-neon-cyan">
                        {event.recommendedManeuver.deltaV.toFixed(2)} m/s
                      </span>
                    </div>
                  )}
                </div>

                {/* Hover indicator */}
                <div
                  className="mt-2 h-px w-0 group-hover:w-full transition-all duration-300 rounded"
                  style={{ background: tc.color, opacity: 0.4 }}
                />
              </motion.button>
            );
          })}
        </AnimatePresence>

        {conjunctions.length === 0 && (
          <div className="glass-panel rounded-xl p-4 text-center">
            <div className="mono text-xs text-white/30">No conjunction events in 72h window</div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
