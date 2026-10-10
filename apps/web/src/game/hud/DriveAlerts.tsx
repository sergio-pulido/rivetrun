'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Build, Mission, Observation, SimState } from '@rivetrun/contracts';
import { SCAN_RULES, deriveSpec, safeContactSpeedMps } from '@rivetrun/sim';
import { WARN_AHEAD_S, hazardWarning, type HazardWarning } from '../drive/hazard';
import { UI } from '../palette';

const BOX = 'rounded-lg px-3 py-2 text-center font-mono text-[12px] font-semibold leading-snug tracking-[1px]';
const BACK = 'rgb(14 16 19 / 0.88)';

const WHAT: Readonly<Record<HazardWarning['what'], string>> = { rock: 'ROCK', log: 'LOG', step: 'STEP', obstacle: 'OBSTACLE', gap: 'GAP' };

/** The next hazard the robot's sensors report, about 3 s ahead, with its safe speed. Red while the robot is over it. */
function HazardChip({ warning, canJump }: { warning: HazardWarning; canJump: boolean }) {
  const color = warning.over ? UI.bad : UI.warn;
  return (
    <span className={BOX} style={{ border: `2px solid ${color}`, background: BACK, color }}>
      {WHAT[warning.what]}
      {warning.widthM === undefined ? '' : ` ${warning.widthM.toFixed(1)} m`} in {warning.distanceM.toFixed(1)} m
      <span className="block text-[11px] tabular-nums" style={{ color: warning.over ? UI.bad : UI.text }}>
        {warning.safeMps !== undefined ? `${warning.over ? 'SLOW DOWN · ' : ''}SAFE ${warning.safeMps.toFixed(1)} m/s` : canJump ? 'JUMP IT' : 'NO PISTON · BRAKE'}
      </span>
    </span>
  );
}

const RING_R = 15;
const RING_LENGTH = 2 * Math.PI * RING_R;

/** The 1.5 s hold of a scan: a ring that fills. */
function ScanRing({ label, progress }: { label: string; progress: number }) {
  return (
    <span className={`${BOX} flex items-center gap-2.5`} style={{ border: `2px solid ${UI.cyan}`, background: BACK, color: UI.cyan }}>
      <svg width="36" height="36" viewBox="0 0 36 36" aria-hidden>
        <circle cx="18" cy="18" r={RING_R} fill="none" stroke="rgb(63 208 224 / 0.25)" strokeWidth="4" />
        <circle cx="18" cy="18" r={RING_R} fill="none" stroke={UI.cyan} strokeWidth="4" strokeLinecap="round" strokeDasharray={RING_LENGTH} strokeDashoffset={RING_LENGTH * (1 - progress)} transform="rotate(-90 18 18)" />
      </svg>
      <span className="text-left">
        SCANNING · {label.toUpperCase()}
        <span className="block text-[11px] tabular-nums" style={{ color: UI.text }}>
          HOLD STILL · {Math.round(progress * 100)} %
        </span>
      </span>
    </span>
  );
}

interface ZoneAhead {
  readonly label: string;
  readonly distanceM: number;
  readonly canScan: boolean;
  /** The robot is on the pad: stopping here scans it. */
  readonly onPad: boolean;
  readonly needs: string;
}

const NEEDS_WORD: Readonly<Record<string, string>> = { camera: 'camera', scout_drone: 'scout drone', moisture: 'moisture probe', ultrasonic: 'ranger', imu: 'IMU' };

/** The scan zone the driver should be thinking about: on it, or coming up within a few seconds. */
function zoneAhead(mission: Mission, observation: Observation | null, speedMps: number): ZoneAhead | null {
  if (!observation) return null;
  const pace = Math.max(Math.abs(speedMps), 0.5);
  for (const zone of observation.scanZones) {
    if (zone.done || zone.missed) continue;
    const plan = mission.scanZones?.find((candidate) => candidate.id === zone.id);
    const reach = (plan?.halfLengthM ?? 0.5) + SCAN_RULES.reachM;
    const onPad = Math.abs(zone.distanceM) <= reach;
    if (!onPad && (zone.distanceM < 0 || zone.distanceM / pace > WARN_AHEAD_S + 1)) continue;
    return { label: zone.label, distanceM: zone.distanceM, canScan: zone.canScan, onPad, needs: (plan?.needs ?? []).map((need) => NEEDS_WORD[need] ?? need).join(' or ') };
  }
  return null;
}

function ZoneChip({ zone }: { zone: ZoneAhead }) {
  if (!zone.canScan) {
    return (
      <span className={BOX} style={{ border: '2px dashed #4a525d', background: BACK, color: UI.dim }}>
        SCAN ZONE · {zone.label.toUpperCase()}
        <span className="block text-[11px]">cannot scan: needs {zone.needs}</span>
      </span>
    );
  }
  return (
    <span className={BOX} style={{ border: `2px solid ${UI.cyan}`, background: BACK, color: UI.cyan }}>
      {zone.onPad ? `STOP HERE · SCAN ${zone.label.toUpperCase()}` : `SCAN ZONE · ${zone.label.toUpperCase()} in ${Math.max(0, zone.distanceM).toFixed(1)} m`}
      <span className="block text-[11px]" style={{ color: UI.text }}>
        {zone.onPad ? 'brake to a stop on the pad' : 'stop on the pad for 1.5 s'}
      </span>
    </span>
  );
}

/** "SCANNED" / "SCAN MISSED · +10 s", for a moment, when the sim's counts change. */
function useScanNews(state: SimState | null): { readonly text: string; readonly good: boolean } | null {
  const done = state?.scansDone ?? 0;
  const missed = state?.scansMissed ?? 0;
  const [news, setNews] = useState<{ text: string; good: boolean; key: number } | null>(null);
  const [seen, setSeen] = useState({ done, missed });
  if (done !== seen.done || missed !== seen.missed) {
    setSeen({ done, missed });
    if (done > seen.done) setNews({ text: 'SCANNED', good: true, key: done * 100 + missed });
    else if (missed > seen.missed) setNews({ text: `SCAN MISSED · +${SCAN_RULES.missPenaltyS} s`, good: false, key: done * 100 + missed });
  }
  useEffect(() => {
    if (!news) return undefined;
    const id = window.setTimeout(() => setNews(null), 1800);
    return () => window.clearTimeout(id);
  }, [news]);
  return news;
}

export interface DriveAlertsProps {
  mission: Mission;
  build: Build;
  state: SimState | null;
  observation: Observation | null;
}

/**
 * What the driver has to act on right now (gameplay v3): the scan under way, the scan zone coming
 * up, the next hazard with its safe speed. All of it from the robot's own Observation: a build that
 * cannot sense something is not warned about it.
 */
export function DriveAlerts({ mission, build, state, observation }: DriveAlertsProps) {
  const safeContactMps = useMemo(() => safeContactSpeedMps(deriveSpec(build)), [build]);
  const news = useScanNews(state);
  const speed = state?.v ?? 0;
  const warning = hazardWarning(observation, speed, safeContactMps);
  const zone = zoneAhead(mission, observation, speed);
  const scanning = state?.scan;
  const scanLabel = scanning ? (mission.scanZones?.find((candidate) => candidate.id === scanning.zoneId)?.label ?? 'zone') : '';
  return (
    <>
      {news && (
        <span className={BOX} style={{ border: `2px solid ${news.good ? UI.ok : UI.bad}`, background: BACK, color: news.good ? UI.ok : UI.bad }}>
          {news.text}
        </span>
      )}
      {scanning ? <ScanRing label={scanLabel} progress={scanning.progress} /> : zone ? <ZoneChip zone={zone} /> : null}
      {warning && !scanning ? <HazardChip warning={warning} canJump={build.extras.includes('piston_jump')} /> : null}
    </>
  );
}
