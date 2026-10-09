import type { Policy } from '@rivetrun/contracts';

export const POLICY_LABEL: Readonly<Record<Policy, string>> = { jev: 'JEV', heuristic: 'HEURISTIC', random: 'RANDOM' };

export const formatScore = (score: number): string => Math.round(score).toLocaleString('en-US');
export const formatTime = (timeS: number): string => `${timeS.toFixed(1)} s`;
export const formatDamage = (damagePct: number): string => `${Math.round(damagePct)} %`;
