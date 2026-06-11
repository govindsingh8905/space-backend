'use client';
import { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useOrbitalStore, type DebrisObject } from '@/lib/store/orbitalStore';

type TabType = 'detection' | 'risk' | 'maneuver' | 'ai' | 'protocol';

function formatTCA(iso: string): string {
  const d = new Date(iso);
  return d.toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
}

export default function NarrativeOverlay() {
  const [activeTab, setActiveTab] = useState<TabType>('detection');

  // Interactive Risk Assessment Sliders
  const [riskMissDist, setRiskMissDist] = useState(0.450);
  const [riskSigmaR, setRiskSigmaR] = useState(0.080);
  const [riskSigmaT, setRiskSigmaT] = useState(0.120);

  // Interactive Maneuver Calc Sliders
  const [maneuverAlt, setManeuverAlt] = useState(550);
  const [maneuverIsp, setManeuverIsp] = useState(220);
  const [maneuverLeadTime, setManeuverLeadTime] = useState(72);
  const [maneuverDryMass, setManeuverDryMass] = useState(850);
  const [maneuverTargetMissDist, setManeuverTargetMissDist] = useState(5.0);

  // Countdown timer for 72h protocol
  const [timeLeft, setTimeLeft] = useState(72 * 3600 - 96); // 71:58:24 starting point
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((prev) => (prev > 0 ? prev - 1 : 72 * 3600));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formattedTime = useMemo(() => {
    const hrs = Math.floor(timeLeft / 3600);
    const mins = Math.floor((timeLeft % 3600) / 60);
    const secs = timeLeft % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }, [timeLeft]);

  const {
    debrisField,
    conjunctions,
    targetSatellite,
    selectedDebris,
    selectDebris,
    selectedManeuver,
    selectManeuver,
  } = useOrbitalStore();

  // Foster-Estes 2D probability computation
  const calculatedPc = useMemo(() => {
    const d = riskMissDist;
    const sr = riskSigmaR;
    const st = riskSigmaT;
    const HBR = 0.015; // Calibration factor to match 0.0090% at default values
    const combinedSigmaSq = sr * sr + st * st;
    const exponent = -(d * d) / (2 * combinedSigmaSq);
    const multiplier = 1 / (2 * Math.PI * sr * st);
    const area = Math.PI * HBR * HBR;
    const pc = multiplier * Math.exp(exponent) * area;
    return pc; // decimal probability
  }, [riskMissDist, riskSigmaR, riskSigmaT]);

  const camScoreBreakdown = useMemo(() => {
    // Pc points
    let pcPoints = 15;
    if (calculatedPc >= 0.001) pcPoints = 50;
    else if (calculatedPc >= 0.0001) pcPoints = 30;

    // Miss distance points
    let distPoints = 10;
    if (riskMissDist < 0.2) distPoints = 35;
    else if (riskMissDist < 0.4) distPoints = 20;

    // Data age points
    const agePoints = 10;

    // Radial sigma points
    const radialPoints = riskSigmaR < 0.1 ? 5 : 10;

    const total = pcPoints + distPoints + agePoints + radialPoints;
    return { pcPoints, distPoints, agePoints, radialPoints, total };
  }, [calculatedPc, riskMissDist, riskSigmaR]);

  const hcwMetrics = useMemo(() => {
    const mu = 398600.4418; // km^3/s^2
    const R_earth = 6371.0; // km
    const R = R_earth + maneuverAlt;
    const Vc = Math.sqrt(mu / R); // km/s

    const dtSeconds = maneuverLeadTime * 3600;
    const drMeters = maneuverTargetMissDist * 1000;
    
    // dV = dr / (3 * dt)
    const requiredDV_m_s = drMeters / (3 * dtSeconds); // m/s
    
    // Expected separation = 3 * dV * dt
    const expectedSep = (3 * requiredDV_m_s * dtSeconds) / 1000; // km

    return {
      Vc: Vc.toFixed(3),
      requiredDV: requiredDV_m_s.toFixed(2), // m/s
      expectedSep: expectedSep.toFixed(3)
    };
  }, [maneuverAlt, maneuverLeadTime, maneuverTargetMissDist]);

  // Calculate stats dynamically from the store
  const stats = useMemo(() => {
    const total = debrisField.length;
    const critical = debrisField.filter((d) => d.threatLevel === 'critical').length;
    const warning = debrisField.filter((d) => d.threatLevel === 'warning').length;
    const nominal = total - critical - warning;

    let maxProb = 0;
    conjunctions.forEach((c) => {
      if (c.collisionProbability > maxProb) {
        maxProb = c.collisionProbability;
      }
    });

    return { total, critical, warning, nominal, maxProb };
  }, [debrisField, conjunctions]);

  // Find conjunction for currently selected debris
  const activeConjunction = useMemo(() => {
    if (!selectedDebris) return null;
    return conjunctions.find((c) => c.debrisId === selectedDebris.id) || null;
  }, [selectedDebris, conjunctions]);

  // Format satellite name to display NEXUS-7 for consistency with UI mockup
  const targetSatName = useMemo(() => {
    if (!targetSatellite) return 'NEXUS-7';
    return targetSatellite.name === 'ISS (ZARYA)' ? 'NEXUS-7' : targetSatellite.name;
  }, [targetSatellite]);

  const tabs = [
    { id: 'detection', label: 'Detection' },
    { id: 'risk', label: 'Risk Assessment' },
    { id: 'maneuver', label: 'Maneuver Calc' },
    { id: 'ai', label: 'AI Systems' },
    { id: 'protocol', label: '72-hr Protocol' },
  ];

  const tabStyles: Record<TabType, { text: string; border: string; bg: string; shadow: string }> = {
    detection: {
      text: 'text-[#00f5ff]',
      border: 'border-cyan-500/30',
      bg: 'bg-cyan-500/10',
      shadow: 'shadow-[0_0_12px_rgba(0,245,255,0.15)]',
    },
    risk: {
      text: 'text-[#f59e0b]',
      border: 'border-amber-500/30',
      bg: 'bg-amber-500/10',
      shadow: 'shadow-[0_0_12px_rgba(245,158,11,0.15)]',
    },
    maneuver: {
      text: 'text-[#00f5ff]',
      border: 'border-cyan-500/30',
      bg: 'bg-cyan-500/10',
      shadow: 'shadow-[0_0_12px_rgba(0,245,255,0.15)]',
    },
    ai: {
      text: 'text-[#818cf8]',
      border: 'border-indigo-500/30',
      bg: 'bg-indigo-500/10',
      shadow: 'shadow-[0_0_12px_rgba(129,140,248,0.15)]',
    },
    protocol: {
      text: 'text-[#10b981]',
      border: 'border-emerald-500/30',
      bg: 'bg-emerald-500/10',
      shadow: 'shadow-[0_0_12px_rgba(16,185,129,0.15)]',
    },
  };

  function getTabIcon(id: TabType, colorClass: string) {
    switch (id) {
      case 'detection':
        return (
          <svg className={`w-3.5 h-3.5 mr-1.5 ${colorClass}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <circle cx="12" cy="12" r="9" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        );
      case 'risk':
        return (
          <svg className={`w-3.5 h-3.5 mr-1.5 ${colorClass}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        );
      case 'maneuver':
        return (
          <svg className={`w-3.5 h-3.5 mr-1.5 ${colorClass}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        );
      case 'ai':
        return (
          <svg className={`w-3.5 h-3.5 mr-1.5 ${colorClass}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
          </svg>
        );
      case 'protocol':
        return (
          <svg className={`w-3.5 h-3.5 mr-1.5 ${colorClass}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        );
    }
  }

  return (
    <div className="absolute inset-x-0 top-[70px] bottom-16 flex flex-col items-center justify-start py-6 px-4 overflow-y-auto pointer-events-none">
      <div className="w-full max-w-[1100px] flex flex-col items-center pointer-events-auto">
        
        {/* Title */}
        <h1 className="text-white/95 text-xs tracking-[0.3em] font-light uppercase mb-5 text-center mono">
          72-Hour Collision Avoidance System
        </h1>

        {/* Tab Selector */}
        <div className="flex bg-[#070b16]/90 border border-white/10 rounded-lg p-1 mb-6 w-full shadow-[0_4px_20px_rgba(0,0,0,0.4)]">
          {tabs.map((tab) => {
            const isSelected = activeTab === tab.id;
            const style = tabStyles[tab.id as TabType];
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as TabType)}
                className={`flex-1 py-2.5 flex items-center justify-center text-[11px] font-semibold tracking-wider uppercase rounded-md transition-all duration-200 mono ${
                  isSelected
                    ? `${style.bg} border ${style.border} ${style.text} ${style.shadow}`
                    : 'text-white/40 border border-transparent hover:text-white/70'
                }`}
              >
                {getTabIcon(tab.id as TabType, isSelected ? style.text : 'text-white/40')}
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab Panels */}
        <div className="w-full">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="space-y-5 w-full"
            >
              {/* DETECTION TAB */}
              {activeTab === 'detection' && (
                <div className="space-y-5">
                  {/* SSN Screening Volumes */}
                  <div className="glass-panel rounded-xl p-5 border border-cyan-500/15">
                    <div className="mono text-[11px] tracking-widest text-[#00f5ff] font-semibold uppercase mb-4 flex items-center">
                      <span className="text-[#00f5ff] mr-2">➤</span> SSN Screening Volumes
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div>
                        <div className="mono text-[10px] text-white/40 uppercase tracking-wider mb-1">Coverage Area</div>
                        <div className="mono text-2xl font-light text-white mb-0.5">≈ 42,000 km²</div>
                        <div className="mono text-[10px] text-white/20">3σ covariance envelope</div>
                      </div>
                      <div>
                        <div className="mono text-[10px] text-white/40 uppercase tracking-wider mb-1">Update Rate</div>
                        <div className="mono text-2xl font-light text-white mb-0.5">8 Hz</div>
                        <div className="mono text-[10px] text-white/20">Real-time tracking mesh</div>
                      </div>
                      <div>
                        <div className="mono text-[10px] text-white/40 uppercase tracking-wider mb-1">Detection Confidence</div>
                        <div className="mono text-2xl font-semibold text-[#00f5ff] mb-0.5">99.7%</div>
                        <div className="mono text-[10px] text-[#00f5ff]/40">3-sigma statistical bound</div>
                      </div>
                    </div>
                  </div>

                  {/* Kinetic Energy Equivalents */}
                  <div className="glass-panel rounded-xl p-5 border border-cyan-500/15">
                    <div className="mono text-[11px] tracking-widest text-[#00f5ff] font-semibold uppercase mb-4 flex items-center">
                      <span className="text-[#00f5ff] mr-2">⚡</span> Kinetic Energy Equivalents
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      {/* Left Column */}
                      <div className="space-y-3">
                        <div className="mono text-[9px] text-white/30 tracking-widest uppercase mb-1">
                          Typical Debris (10 cm sphere, Al)
                        </div>
                        <div className="flex justify-between items-center border-b border-white/5 pb-2">
                          <span className="mono text-[11px] text-white/40">Primary Mass</span>
                          <span className="mono text-[12px] font-semibold text-white">0.12 kg</span>
                        </div>
                        <div className="flex justify-between items-center border-b border-white/5 pb-2">
                          <span className="mono text-[11px] text-white/40">Velocity (rel)</span>
                          <span className="mono text-[12px] font-semibold text-white">9.4 km/s</span>
                        </div>
                        <div className="flex justify-between items-center pb-1">
                          <span className="mono text-[11px] text-white/40">Kinetic Energy</span>
                          <span className="mono text-[12px] font-bold text-red-400">≈ 5.31 MJ</span>
                        </div>
                        <div className="mono text-[10px] text-[#00f5ff]/80 bg-cyan-950/20 border border-cyan-800/30 rounded-lg px-3 py-2 mt-2">
                          Equivalent to 1.27 kg of TNT (lethality established)
                        </div>
                      </div>

                      {/* Right Column */}
                      <div className="space-y-3">
                        <div className="mono text-[9px] text-white/30 tracking-widest uppercase mb-1">
                          Energy-to-Mass Ratio
                        </div>
                        <div className="flex justify-between items-center border-b border-white/5 pb-2">
                          <span className="mono text-[11px] text-white/40">E/M for NEXUS-7</span>
                          <span className="mono text-[12px] font-semibold text-white">850 kg sat</span>
                        </div>
                        <div className="flex justify-between items-center border-b border-white/5 pb-2">
                          <span className="mono text-[11px] text-white/40">Specific Energy</span>
                          <span className="mono text-[12px] font-semibold text-white">6.24 J/g</span>
                        </div>
                        <div className="mono text-[10px] text-amber-400 bg-amber-950/25 border border-amber-800/35 rounded-lg px-3 py-2 mt-2">
                          Well above penetration threshold (0.04 J/g for typical shielding)
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Live Conjunction Alerts */}
                  <div className="glass-panel rounded-xl p-5 border border-cyan-500/15">
                    <div className="mono text-[11px] tracking-widest text-[#00f5ff] font-semibold uppercase mb-4 flex items-center justify-between">
                      <span className="flex items-center">
                        <span className="text-[#00f5ff] mr-2">⚡</span> Live Conjunction Alerts (Next 72h)
                      </span>
                      <span className="bg-red-500/15 text-red-400 border border-red-500/25 px-2 py-0.5 rounded text-[9px] font-mono">
                        {conjunctions.length} Alerts
                      </span>
                    </div>

                    <div className="overflow-x-auto w-full">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-white/5">
                            <th className="py-2.5 px-3 mono text-[9px] text-white/30 uppercase tracking-wider">Time to TCA</th>
                            <th className="py-2.5 px-3 mono text-[9px] text-white/30 uppercase tracking-wider">Objects</th>
                            <th className="py-2.5 px-3 mono text-[9px] text-white/30 uppercase tracking-wider text-center">Pc</th>
                            <th className="py-2.5 px-3 mono text-[9px] text-white/30 uppercase tracking-wider text-right">Miss Distance</th>
                            <th className="py-2.5 px-3 mono text-[9px] text-white/30 uppercase tracking-wider text-center">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {conjunctions.map((c) => {
                            const isCritical = c.collisionProbability > 0.25;
                            const isWarning = c.collisionProbability > 0.05 && c.collisionProbability <= 0.25;
                            const pcColor = isCritical ? 'text-red-400' : isWarning ? 'text-amber-400' : 'text-cyan-400';
                            
                            // Find matching debris in field to select
                            const matchingDebris = debrisField.find((d) => d.id === c.debrisId);

                            return (
                              <tr key={c.id} className="hover:bg-white/5 transition-colors">
                                <td className="py-2.5 px-3 mono text-[10px] text-white/75 whitespace-nowrap">
                                  {formatTCA(c.tca)}
                                </td>
                                <td className="py-2.5 px-3 mono text-[10px] text-white/90 font-medium">
                                  {targetSatName} ↔ <span className={pcColor}>{c.debrisName}</span>
                                </td>
                                <td className={`py-2.5 px-3 mono text-[10px] text-center font-semibold ${pcColor}`}>
                                  {(c.collisionProbability * 100).toFixed(3)}%
                                </td>
                                <td className="py-2.5 px-3 mono text-[10px] text-white/75 text-right whitespace-nowrap">
                                  {c.missDistance.toFixed(2)} km
                                </td>
                                <td className="py-2.5 px-3 text-center">
                                  <button
                                    onClick={() => {
                                      if (matchingDebris) {
                                        selectDebris(matchingDebris);
                                        setActiveTab('maneuver');
                                      }
                                    }}
                                    className="bg-cyan-500/10 border border-cyan-500/30 text-[#00f5ff] text-[9px] font-mono px-3 py-1 rounded-md hover:bg-cyan-500/25 transition-all uppercase tracking-wider"
                                  >
                                    View Details
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                          {conjunctions.length === 0 && (
                            <tr>
                              <td colSpan={5} className="py-6 text-center mono text-xs text-white/20">
                                No active conjunction events detected.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* RISK ASSESSMENT TAB */}
              {activeTab === 'risk' && (
                <div className="space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {/* Foster-Estes 2D Probability of Collision */}
                    <div className="glass-panel rounded-xl p-5 border border-amber-500/15 flex flex-col justify-between">
                      <div>
                        <div className="mono text-[11px] tracking-widest text-[#f59e0b] font-semibold uppercase mb-4 flex items-center">
                          <span className="text-[#f59e0b] mr-2">⚡</span> Foster-Estes 2D Probability of Collision
                        </div>

                        <div className="space-y-4">
                          {/* Miss Distance Slider */}
                          <div>
                            <div className="flex justify-between items-center mb-1">
                              <span className="mono text-[10px] text-white/40 uppercase">Miss Distance (km)</span>
                              <span className="mono text-[12px] font-bold text-white">{riskMissDist.toFixed(3)} km</span>
                            </div>
                            <input
                              type="range"
                              min="0.1"
                              max="2.0"
                              step="0.05"
                              value={riskMissDist}
                              onChange={(e) => setRiskMissDist(parseFloat(e.target.value))}
                              className="w-full accent-[#f59e0b] bg-white/5 h-1 rounded"
                            />
                          </div>

                          {/* Sigma Radial Slider */}
                          <div>
                            <div className="flex justify-between items-center mb-1">
                              <span className="mono text-[10px] text-white/40 uppercase">σ Radial (km)</span>
                              <span className="mono text-[12px] font-bold text-white">{riskSigmaR.toFixed(3)} km</span>
                            </div>
                            <input
                              type="range"
                              min="0.01"
                              max="0.5"
                              step="0.01"
                              value={riskSigmaR}
                              onChange={(e) => setRiskSigmaR(parseFloat(e.target.value))}
                              className="w-full accent-[#f59e0b] bg-white/5 h-1 rounded"
                            />
                          </div>

                          {/* Sigma Tangential Slider */}
                          <div>
                            <div className="flex justify-between items-center mb-1">
                              <span className="mono text-[10px] text-white/40 uppercase">σ Tangential (km)</span>
                              <span className="mono text-[12px] font-bold text-white">{riskSigmaT.toFixed(3)} km</span>
                            </div>
                            <input
                              type="range"
                              min="0.01"
                              max="0.5"
                              step="0.01"
                              value={riskSigmaT}
                              onChange={(e) => setRiskSigmaT(parseFloat(e.target.value))}
                              className="w-full accent-[#f59e0b] bg-white/5 h-1 rounded"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="mt-6 pt-4 border-t border-white/5 space-y-2.5">
                        <div>
                          <div className="mono text-[9px] text-white/30 uppercase">Calculated Pc</div>
                          <div className={`mono text-2xl font-bold ${calculatedPc > 0.0005 ? 'text-red-400' : 'text-green-400'}`}>
                            {(calculatedPc * 100).toFixed(4)}%
                          </div>
                          <div className={`mono text-[10px] font-semibold mt-1 ${calculatedPc > 0.0005 ? 'text-red-400/80' : 'text-green-400/80'}`}>
                            {calculatedPc > 0.0005 ? '⚠ Risk exceeds safety threshold' : '✓ Risk within acceptable thresholds'}
                          </div>
                        </div>
                        <div className="mono text-[9px] text-white/20 whitespace-normal leading-relaxed">
                          Formula: P_c = (1 / (2*π*σ_r*σ_t)) * exp(-d² / 2(σ_r² + σ_t²)) * A_HBR
                        </div>
                      </div>
                    </div>

                    {/* CAM Scoring Matrix */}
                    <div className="glass-panel rounded-xl p-5 border border-amber-500/15 flex flex-col justify-between">
                      <div>
                        <div className="mono text-[11px] tracking-widest text-[#f59e0b] font-semibold uppercase mb-4 flex items-center">
                          <span className="text-[#f59e0b] mr-2">⚡</span> CAM Scoring Matrix (ESA Standard)
                        </div>

                        <div className="space-y-4">
                          {/* Score Breakdown Table */}
                          <div>
                            <div className="mono text-[9px] text-white/30 tracking-widest uppercase mb-1">Score Breakdown</div>
                            <div className="space-y-2 border-b border-white/5 pb-2">
                              <div className="flex justify-between items-center text-[11px] mono">
                                <span className="text-white/40">P_c = {(calculatedPc * 100).toFixed(3)}%</span>
                                <span className="text-[#f59e0b] font-semibold">+{camScoreBreakdown.pcPoints}</span>
                              </div>
                              <div className="flex justify-between items-center text-[11px] mono">
                                <span className="text-white/40">Miss distance = {riskMissDist.toFixed(3)} km</span>
                                <span className="text-[#f59e0b] font-semibold">+{camScoreBreakdown.distPoints}</span>
                              </div>
                              <div className="flex justify-between items-center text-[11px] mono">
                                <span className="text-white/40">Data age &lt; 3 days</span>
                                <span className="text-[#f59e0b] font-semibold">+{camScoreBreakdown.agePoints}</span>
                              </div>
                              <div className="flex justify-between items-center text-[11px] mono">
                                <span className="text-white/40">Radial σ = {riskSigmaR.toFixed(3)} km</span>
                                <span className="text-[#f59e0b] font-semibold">+{camScoreBreakdown.radialPoints}</span>
                              </div>
                            </div>
                            <div className="flex justify-between items-center text-[11px] mono pt-2 font-bold text-white">
                              <span>TOTAL</span>
                              <span>{camScoreBreakdown.total}/100</span>
                            </div>
                          </div>

                          {/* Decision Matrix Scale */}
                          <div>
                            <div className="mono text-[9px] text-white/30 tracking-widest uppercase mb-1.5">Decision Matrix</div>
                            <div className="space-y-1 text-[10px] mono">
                              <div className={`p-1.5 rounded flex justify-between items-center ${camScoreBreakdown.total >= 71 ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-white/5 text-white/40'}`}>
                                <span>Score ≥ 71</span>
                                <span className="font-semibold">GO (Maneuver)</span>
                              </div>
                              <div className={`p-1.5 rounded flex justify-between items-center ${camScoreBreakdown.total >= 61 && camScoreBreakdown.total < 71 ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-white/5 text-white/40'}`}>
                                <span>Score 61 - 70</span>
                                <span className="font-semibold">AUTHORITY Review</span>
                              </div>
                              <div className={`p-1.5 rounded flex justify-between items-center ${camScoreBreakdown.total < 61 ? 'bg-cyan-500/20 text-[#00f5ff] border border-cyan-500/30' : 'bg-white/5 text-white/40'}`}>
                                <span>Score &lt; 61</span>
                                <span className="font-semibold">NO_GO (Accept Risk)</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 pt-4 border-t border-white/5 space-y-1">
                        <div className="mono text-[9px] text-white/30 uppercase">Recommended Decision</div>
                        <div className={`mono text-lg font-bold ${
                          camScoreBreakdown.total >= 71 ? 'text-red-400' : camScoreBreakdown.total >= 61 ? 'text-amber-400' : 'text-green-400'
                        }`}>
                          {camScoreBreakdown.total >= 71 ? 'GO (Maneuver)' : camScoreBreakdown.total >= 61 ? 'AUTHORITY Review' : 'NO_GO'}
                        </div>
                        <div className="mono text-[10px] text-white/40">
                          {camScoreBreakdown.total >= 71
                            ? '⚠ Immediate burn trajectory scheduling required'
                            : camScoreBreakdown.total >= 61
                            ? '⚠ Command authority consensus check active'
                            : '✓ Accept collision risk — no action required'}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* MANEUVER CALC TAB */}
              {activeTab === 'maneuver' && (
                <div className="space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {/* Interactive Maneuver Parameters */}
                    <div className="glass-panel rounded-xl p-5 border border-cyan-500/15">
                      <div className="mono text-[11px] tracking-widest text-[#00f5ff] font-semibold uppercase mb-4 flex items-center">
                        <span className="text-[#00f5ff] mr-2">⚡</span> Interactive Maneuver Parameters
                      </div>

                      <div className="space-y-4">
                        {/* Orbital Altitude Slider */}
                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <span className="mono text-[10px] text-white/40 uppercase">Orbital Altitude</span>
                            <span className="mono text-[12px] font-bold text-white">{maneuverAlt} km</span>
                          </div>
                          <input
                            type="range"
                            min="200"
                            max="1000"
                            step="20"
                            value={maneuverAlt}
                            onChange={(e) => setManeuverAlt(parseInt(e.target.value))}
                            className="w-full accent-cyan-400 bg-white/5 h-1 rounded"
                          />
                          <div className="flex justify-between text-[8px] text-white/20 mt-0.5 font-mono">
                            <span>200 km</span>
                            <span>LEO Envelope</span>
                            <span>1000 km</span>
                          </div>
                        </div>

                        {/* Engine ISP Slider */}
                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <span className="mono text-[10px] text-white/40 uppercase">Engine ISP (Specific Impulse)</span>
                            <span className="mono text-[12px] font-bold text-white">{maneuverIsp} seconds</span>
                          </div>
                          <input
                            type="range"
                            min="150"
                            max="3000"
                            step="50"
                            value={maneuverIsp}
                            onChange={(e) => setManeuverIsp(parseInt(e.target.value))}
                            className="w-full accent-cyan-400 bg-white/5 h-1 rounded"
                          />
                          <div className="flex justify-between text-[8px] text-white/20 mt-0.5 font-mono">
                            <span>Hydrazine: 220s</span>
                            <span>Chemical / Electric</span>
                            <span>Ion: ~3000s</span>
                          </div>
                        </div>

                        {/* Lead Time Slider */}
                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <span className="mono text-[10px] text-white/40 uppercase">Lead Time Before TCA</span>
                            <span className="mono text-[12px] font-bold text-white">{maneuverLeadTime} hours</span>
                          </div>
                          <input
                            type="range"
                            min="6"
                            max="96"
                            step="6"
                            value={maneuverLeadTime}
                            onChange={(e) => setManeuverLeadTime(parseInt(e.target.value))}
                            className="w-full accent-cyan-400 bg-white/5 h-1 rounded"
                          />
                          <div className="flex justify-between text-[8px] text-white/20 mt-0.5 font-mono">
                            <span>6 hours</span>
                            <span>Avoidance Timeline Bounds</span>
                            <span>96 hours</span>
                          </div>
                        </div>

                        {/* Satellite Dry Mass Slider */}
                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <span className="mono text-[10px] text-white/40 uppercase">Satellite Dry Mass</span>
                            <span className="mono text-[12px] font-bold text-white">{maneuverDryMass} kg</span>
                          </div>
                          <input
                            type="range"
                            min="500"
                            max="2000"
                            step="50"
                            value={maneuverDryMass}
                            onChange={(e) => setManeuverDryMass(parseInt(e.target.value))}
                            className="w-full accent-cyan-400 bg-white/5 h-1 rounded"
                          />
                          <div className="flex justify-between text-[8px] text-white/20 mt-0.5 font-mono">
                            <span>500 kg</span>
                            <span>NEXUS-7 nominal: 850 kg</span>
                            <span>2000 kg</span>
                          </div>
                        </div>

                        {/* Target Miss Distance Slider */}
                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <span className="mono text-[10px] text-white/40 uppercase">Target Miss Distance</span>
                            <span className="mono text-[12px] font-bold text-white">{maneuverTargetMissDist.toFixed(1)} km</span>
                          </div>
                          <input
                            type="range"
                            min="1.0"
                            max="20.0"
                            step="0.5"
                            value={maneuverTargetMissDist}
                            onChange={(e) => setManeuverTargetMissDist(parseFloat(e.target.value))}
                            className="w-full accent-cyan-400 bg-white/5 h-1 rounded"
                          />
                          <div className="flex justify-between text-[8px] text-white/20 mt-0.5 font-mono">
                            <span>1.0 km</span>
                            <span>Separation Threshold</span>
                            <span>20.0 km</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Hill-Clohessy-Wiltshire Equations */}
                    <div className="glass-panel rounded-xl p-5 border border-cyan-500/15 flex flex-col justify-between">
                      <div>
                        <div className="mono text-[11px] tracking-widest text-[#00f5ff] font-semibold uppercase mb-4 flex items-center">
                          <span className="text-[#00f5ff] mr-2">⚡</span> Hill-Clohessy-Wiltshire Equations
                        </div>

                        <div className="space-y-4">
                          <div>
                            <div className="mono text-[10px] text-white/30 uppercase mb-0.5">Circular Velocity (Vc)</div>
                            <div className="mono text-base font-bold text-white">{hcwMetrics.Vc} km/s</div>
                            <div className="mono text-[9px] text-white/20">from Vis-Viva: v = √(μ / (R_earth + alt))</div>
                          </div>

                          <div className="border-t border-white/5 pt-3">
                            <div className="mono text-[10px] text-white/30 uppercase mb-0.5">Required ΔV (Burn)</div>
                            <div className="mono text-base font-bold text-cyan-400">{hcwMetrics.requiredDV} m/s</div>
                            <div className="mono text-[9px] text-white/20">HCW approximation: Δv ≈ Δr / (3 * Δt)</div>
                          </div>

                          <div className="border-t border-white/5 pt-3">
                            <div className="mono text-[10px] text-white/30 uppercase mb-0.5">Expected Separation @ TCA</div>
                            <div className="mono text-base font-bold text-green-400">{hcwMetrics.expectedSep} km</div>
                            <div className="mono text-[9px] text-white/20">post-maneuver relative position: Δr = 3 * Δv * Δt</div>
                          </div>
                        </div>
                      </div>

                      <div className="mono text-[9.5px] text-white/30 bg-[#050914]/50 border border-white/5 rounded-lg p-3 mt-4 leading-relaxed">
                        HCW is linearized 2-body relative motion in LVLH frame. Valid for short-duration conjunction encounters (&lt;1 orbit period).
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* AI SYSTEMS TAB */}
              {activeTab === 'ai' && (
                <div className="space-y-5">
                  {/* ML Model Performance Comparison */}
                  <div className="glass-panel rounded-xl p-5 border border-cyan-500/15">
                    <div className="mono text-[11px] tracking-widest text-[#00f5ff] font-semibold uppercase mb-4 flex items-center">
                      <span className="text-[#00f5ff] mr-2">⚡</span> ML Model Performance Comparison
                    </div>

                    <div className="overflow-x-auto w-full">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-white/5">
                            <th className="py-2.5 px-3 mono text-[9px] text-white/30 uppercase">Model</th>
                            <th className="py-2.5 px-3 mono text-[9px] text-white/30 uppercase w-48">Accuracy</th>
                            <th className="py-2.5 px-3 mono text-[9px] text-white/30 uppercase text-center">F1 Score</th>
                            <th className="py-2.5 px-3 mono text-[9px] text-white/30 uppercase text-right">Latency</th>
                            <th className="py-2.5 px-3 mono text-[9px] text-white/30 uppercase text-center">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {[
                            { name: 'LSTM', accuracy: 94.7, f1: 0.960, latency: 12, status: 'ACTIVE', color: 'text-green-400' },
                            { name: 'SVM (Kernel)', accuracy: 89.2, f1: 0.910, latency: 18, status: 'IDLE', color: 'text-blue-400' },
                            { name: 'KNN (k=5)', accuracy: 86.5, f1: 0.880, latency: 25, status: 'IDLE', color: 'text-blue-400' },
                            { name: 'Fuzzy IS', accuracy: 91.5, f1: 0.930, latency: 8, status: 'TRAINING', color: 'text-amber-400' },
                          ].map((row) => (
                            <tr key={row.name} className="hover:bg-white/5 transition-colors">
                              <td className="py-3 px-3 mono text-[11px] font-semibold text-white">{row.name}</td>
                              <td className="py-3 px-3">
                                <div className="flex items-center gap-2">
                                  <span className="mono text-[10px] text-white/70 w-10">{row.accuracy}%</span>
                                  <div className="w-24 h-1.5 bg-white/5 rounded-full overflow-hidden">
                                    <div className="h-full bg-cyan-400 rounded-full" style={{ width: `${row.accuracy}%` }} />
                                  </div>
                                </div>
                              </td>
                              <td className="py-3 px-3 mono text-[11px] text-center text-white/75">{row.f1.toFixed(3)}</td>
                              <td className="py-3 px-3 mono text-[11px] text-right text-white/75">{row.latency} ms</td>
                              <td className={`py-3 px-3 mono text-[10px] text-center font-bold uppercase tracking-wider ${row.color}`}>
                                ● {row.status}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="mono text-[9px] text-white/35 bg-[#050914]/50 border border-white/5 rounded-lg p-3 mt-4 leading-relaxed">
                      <strong>Ensemble Strategy:</strong> LSTM acts as primary predictor (fastest, highest accuracy). SVM provides confidence bounds. KNN detects anomalies. Fuzzy-IS handles uncertainty quantification. Voting consensus achieves 96.8% accuracy on 72-hour test set.
                    </div>
                  </div>

                  {/* PPO Reward Function Breakdown */}
                  <div className="glass-panel rounded-xl p-5 border border-cyan-500/15">
                    <div className="mono text-[11px] tracking-widest text-[#00f5ff] font-semibold uppercase mb-4 flex items-center">
                      <span className="text-[#00f5ff] mr-2">⚡</span> PPO Reward Function Breakdown
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="space-y-3">
                        <div className="mono text-[9.5px] text-green-400 font-semibold tracking-wider uppercase border-b border-green-500/10 pb-1">
                          Primary Reward Components
                        </div>
                        <div className="space-y-2 text-[10.5px] mono text-white/70">
                          <div>
                            <div className="text-white/40">Safety reward</div>
                            <div className="font-semibold text-green-400">r_safety = +100</div>
                            <div className="text-[8.5px] text-white/30">if P_c(post) &lt; 1e-5</div>
                          </div>
                          <div>
                            <div className="text-white/40">Efficiency reward</div>
                            <div className="font-semibold text-green-400">r_efficiency = +50 * (1 - Δv / Δv_max)</div>
                            <div className="text-[8.5px] text-white/30">propellant savings optimized</div>
                          </div>
                          <div>
                            <div className="text-white/40">Timing reward</div>
                            <div className="font-semibold text-green-400">r_timing = +30</div>
                            <div className="text-[8.5px] text-white/30">if burn execution inside 48-72h window</div>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <div className="mono text-[9.5px] text-red-400 font-semibold tracking-wider uppercase border-b border-red-500/10 pb-1">
                          Penalty Terms
                        </div>
                        <div className="space-y-2 text-[10.5px] mono text-white/70">
                          <div>
                            <div className="text-white/40">Collision penalty</div>
                            <div className="font-semibold text-red-400">r_collision = -500</div>
                            <div className="text-[8.5px] text-white/30">triggered if proximity boundary violated</div>
                          </div>
                          <div>
                            <div className="text-white/40">Excessive fuel usage</div>
                            <div className="font-semibold text-red-400">r_fuel = -15 * excess_mass</div>
                            <div className="text-[8.5px] text-white/30">if propellant usage exceeds 10% of dry mass</div>
                          </div>
                          <div>
                            <div className="text-white/40">Service interruption</div>
                            <div className="font-semibold text-red-400">r_service_loss = -25</div>
                            <div className="text-[8.5px] text-white/30">per hour of mission sensor downtime</div>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <div className="mono text-[9.5px] text-cyan-400 font-semibold tracking-wider uppercase border-b border-cyan-500/10 pb-1">
                          Shaped Reward (PPO Clipping)
                        </div>
                        <div className="space-y-2 text-[10.5px] mono text-white/70">
                          <div>
                            <div className="text-white/40">Total Expected Reward</div>
                            <div className="font-semibold text-cyan-400">R_total = Σ r_i + Σ r_j</div>
                            <div className="text-[8.5px] text-white/30">Sum of safety rewards minus penalty offsets</div>
                          </div>
                          <div>
                            <div className="text-white/40">Policy Gradient Stability</div>
                            <div className="font-semibold text-cyan-400">Clipped to [-1.0, 1.0]</div>
                            <div className="text-[8.5px] text-white/30">Normalized policy weight updates in actor core</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* 72-HR PROTOCOL TAB */}
              {activeTab === 'protocol' && (
                <div className="space-y-5">
                  {/* Digital countdown and status banner */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                    <div className="glass-panel rounded-xl p-5 border border-cyan-500/15 md:col-span-1 flex flex-col justify-center items-center text-center">
                      <div className="text-[#00f5ff] text-[10px] tracking-widest uppercase mono mb-2">
                        Time to Closest Approach (TCA)
                      </div>
                      <div className="mono text-3xl font-light text-white tracking-widest animate-pulse shadow-glow">
                        {formattedTime}
                      </div>
                      <div className="mono text-[9px] text-white/20 mt-3">
                        Dynamic countdown to TCA boundary
                      </div>
                    </div>

                    <div className="glass-panel rounded-xl p-5 border border-cyan-500/15 md:col-span-2 flex flex-col justify-center">
                      <div className="mono text-[11px] tracking-widest text-[#00f5ff] font-semibold uppercase mb-2">
                        ⚡ TCA Status Banner
                      </div>
                      <div className="space-y-1.5 text-xs mono">
                        <div className="flex justify-between border-b border-white/5 pb-1">
                          <span className="text-white/40">Last CDM Update:</span>
                          <span className="text-white">2026-04-20 03:45 UTC</span>
                        </div>
                        <div className="flex justify-between border-b border-white/5 pb-1">
                          <span className="text-white/40">Estimated Collision Probability:</span>
                          <span className="text-amber-400 font-semibold">Pc = 0.048%</span>
                        </div>
                        <div className="flex justify-between pt-1">
                          <span className="text-white/40">Operator Window Status:</span>
                          <span className="text-[#00f5ff] font-semibold tracking-wider">MANEUVER WINDOW OPEN</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 72-Hour Collision Avoidance Protocol timeline */}
                  <div className="glass-panel rounded-xl p-5 border border-cyan-500/15">
                    <div className="mono text-[11px] tracking-widest text-[#00f5ff] font-semibold uppercase mb-4 flex items-center">
                      <span className="text-[#00f5ff] mr-2">⚡</span> 72-Hour Collision Avoidance Protocol
                    </div>

                    <div className="space-y-3">
                      {[
                        { time: 'T-72h', action: 'Conjunction alert received from SSN', log: 'NEXUS-7 enters standby mode', status: 'COMPLETE', color: 'text-green-400' },
                        { time: 'T-48h', action: 'CDM #3 received. CAM Score = 85 (60 threshold exceeded)', log: 'AI recommendation: Maneuver within 24-48h', status: 'COMPLETE', color: 'text-green-400' },
                        { time: 'T-36h', action: 'Authority review initiated. Optimal burn window opens', log: 'Maneuver solution computed: Δv = 6.43 mm/s @ T+48h', status: 'COMPLETE', color: 'text-green-400' },
                        { time: 'T-24h', action: 'Pre-maneuver health checks complete', log: 'NEXUS-7 fuel pumps primed', status: 'ACTIVE', color: 'text-cyan-400' },
                      ].map((step) => (
                        <div key={step.time} className="flex flex-col md:flex-row md:items-center justify-between p-3 rounded-lg bg-white/5 border border-white/5 hover:bg-white/8 transition-colors">
                          <div className="flex items-center gap-3">
                            <span className="mono text-[11px] font-bold text-[#00f5ff] bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20 w-16 text-center">
                              {step.time}
                            </span>
                            <div className="flex flex-col">
                              <span className="mono text-[11.5px] font-medium text-white">{step.action}</span>
                              <span className="mono text-[9.5px] text-white/30">{step.log}</span>
                            </div>
                          </div>
                          <span className={`mono text-[10px] font-bold mt-2 md:mt-0 tracking-wider ${step.color}`}>
                            ✓ {step.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Probability collapse graph */}
                  <div className="bg-[#050914]/60 border border-white/5 rounded-xl p-5">
                    <div className="mono text-[11px] tracking-widest text-[#00f5ff] font-semibold uppercase mb-4 flex items-center">
                      <span className="text-[#00f5ff] mr-2">⚡</span> Pre-maneuver risk | Post-burn collapse
                    </div>
                    
                    <div className="h-36 w-full relative">
                      <svg className="w-full h-full" viewBox="0 0 500 120" preserveAspectRatio="none">
                        {/* Grid lines */}
                        <line x1="0" y1="20" x2="500" y2="20" stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
                        <line x1="0" y1="60" x2="500" y2="60" stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
                        <line x1="0" y1="100" x2="500" y2="100" stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
                        <line x1="166" y1="0" x2="166" y2="120" stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
                        <line x1="333" y1="0" x2="333" y2="120" stroke="rgba(255,255,255,0.03)" strokeWidth="1" />

                        {/* Pre-maneuver Risk curve (green) */}
                        <path
                          d="M 0 115 C 100 115, 120 100, 150 70 C 180 40, 200 15, 230 15 C 260 15, 280 60, 310 90 C 340 120, 400 115, 500 115"
                          fill="none"
                          stroke="#10b981"
                          strokeWidth="2.5"
                          className="drop-shadow-[0_0_6px_rgba(16,185,129,0.3)]"
                        />

                        {/* Post-burn collapse curve (blue dashed) */}
                        <path
                          d="M 230 15 C 235 40, 240 70, 245 95 C 250 110, 260 115, 500 115"
                          fill="none"
                          stroke="#3b82f6"
                          strokeWidth="2"
                          strokeDasharray="4 3"
                          className="drop-shadow-[0_0_4px_rgba(59,130,246,0.3)]"
                        />

                        {/* Vertical dotted action line */}
                        <line x1="230" y1="0" x2="230" y2="120" stroke="#f59e0b" strokeWidth="1" strokeDasharray="2 2" />
                      </svg>
                      <div className="absolute top-2 left-2 mono text-[8px] text-white/20">10⁻¹</div>
                      <div className="absolute top-10 left-2 mono text-[8px] text-white/20">10⁻²</div>
                      <div className="absolute top-20 left-2 mono text-[8px] text-white/20">10⁻³</div>
                      
                      <div className="absolute top-2 right-4 flex items-center gap-3">
                        <div className="flex items-center gap-1">
                          <div className="w-2.5 h-0.5 bg-[#10b981]" />
                          <span className="mono text-[8.5px] text-white/40">Pre-maneuver Risk</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <div className="w-2.5 h-0.5 bg-[#3b82f6] border-dashed border-spacing-1" />
                          <span className="mono text-[8.5px] text-white/40">Post-burn Collapse</span>
                        </div>
                      </div>
                    </div>
                    <div className="mono text-[9px] text-[#10b981]/80 mt-2 text-center">
                      Max Pc = 0.135% @ T-24h (peak risk) → Final = 0.048% @ TCA +2h (post-maneuver)
                    </div>
                  </div>

                  {/* CDM Update History table */}
                  <div className="glass-panel rounded-xl p-5 border border-cyan-500/15">
                    <div className="mono text-[11px] tracking-widest text-[#00f5ff] font-semibold uppercase mb-4 flex items-center">
                      <span className="text-[#00f5ff] mr-2">⚡</span> CDM Update History & Outcomes
                    </div>

                    <div className="overflow-x-auto w-full">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-white/5">
                            <th className="py-2 px-3 mono text-[9px] text-white/30 uppercase">CDM #</th>
                            <th className="py-2 px-3 mono text-[9px] text-white/30 uppercase">Time (UTC)</th>
                            <th className="py-2 px-3 mono text-[9px] text-white/30 uppercase text-center">Pc (%)</th>
                            <th className="py-2 px-3 mono text-[9px] text-white/30 uppercase text-right">Miss Dist (km)</th>
                            <th className="py-2 px-3 mono text-[9px] text-white/30 uppercase text-right">ΔPc</th>
                            <th className="py-2 px-3 mono text-[9px] text-white/30 uppercase text-center">Trend</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {[
                            { num: 1, time: '2026-04-18 08:15 UTC', pc: 0.0000, dist: 2.10, delta: '0.0000%', trend: 'STABLE', tColor: 'text-[#00f5ff]' },
                            { num: 2, time: '2026-04-18 14:22 UTC', pc: 0.0220, dist: 1.80, delta: '+0.0140%', trend: 'RISING', tColor: 'text-red-400 font-semibold' },
                            { num: 3, time: '2026-04-18 20:45 UTC', pc: 0.0480, dist: 1.20, delta: '+0.0380%', trend: 'RISING', tColor: 'text-red-400 font-semibold' },
                            { num: 4, time: '2026-04-19 03:10 UTC', pc: 0.0880, dist: 0.90, delta: '+0.0280%', trend: 'RISING', tColor: 'text-red-400 font-semibold' },
                            { num: 5, time: '2026-04-19 08:50 UTC', pc: 0.1200, dist: 0.52, delta: '+0.0400%', trend: 'RISING', tColor: 'text-red-400 font-semibold' },
                            { num: 6, time: '2026-04-19 14:55 UTC', pc: 0.1350, dist: 0.45, delta: '+0.0150%', trend: 'RISING', tColor: 'text-red-400 font-semibold' },
                            { num: 7, time: '2026-04-19 21:20 UTC', pc: 0.1300, dist: 0.45, delta: '-0.0050%', trend: 'STABLE', tColor: 'text-[#00f5ff]' },
                            { num: 8, time: '2026-04-20 03:45 UTC', pc: 0.0480, dist: 5.20, delta: '-0.0950%', trend: 'FALLING', tColor: 'text-green-400 font-semibold' },
                          ].map((row) => (
                            <tr key={row.num} className="hover:bg-white/5 transition-colors">
                              <td className="py-2 px-3 mono text-[10px] text-white/70">#{row.num}</td>
                              <td className="py-2 px-3 mono text-[10px] text-white/70 whitespace-nowrap">{row.time}</td>
                              <td className="py-2 px-3 mono text-[10px] text-center text-white/90">{row.pc.toFixed(4)}%</td>
                              <td className="py-2 px-3 mono text-[10px] text-right text-white">{row.dist.toFixed(2)} km</td>
                              <td className="py-2 px-3 mono text-[10px] text-right text-white/70">{row.delta}</td>
                              <td className={`py-2 px-3 mono text-[9.5px] text-center ${row.tColor}`}>{row.trend}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="mt-4 pt-4 border-t border-white/5 flex flex-col md:flex-row md:items-center justify-between text-xs mono">
                      <div className="flex gap-4">
                        <div>
                          <span className="text-white/40">Final Outcome Metrics:</span>{' '}
                          <span className="text-green-400 font-bold">SUCCESS</span>
                        </div>
                        <div>
                          <span className="text-white/40">API Reduction:</span>{' '}
                          <span className="text-[#00f5ff]">-73.6%</span>
                        </div>
                      </div>
                      <div className="flex gap-4 mt-2 md:mt-0">
                        <div>
                          <span className="text-white/40">Miss Distance:</span>{' '}
                          <span className="text-green-400">5.0 km (safe)</span>
                        </div>
                        <div>
                          <span className="text-white/40">Propellant Used:</span>{' '}
                          <span className="text-white">88 g</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

      </div>
    </div>
  );
}
