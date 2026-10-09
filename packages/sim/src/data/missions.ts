import type { Mission, MissionId } from '@rivetrun/contracts';

// v0 tracks and thresholds. Tuned later by scripts/balance.ts.
export const MISSIONS: Readonly<Record<MissionId, Mission>> = {
  M1: {
    id: 'M1', name: 'Garage Test', description: 'Asphalt, grass and a small step. Learn to read the Brain HUD.',
    weather: 'clear', starThreshold: 750, leaderboard: false,
    track: {
      segments: [
        { terrain: 'asphalt', lengthM: 12, slopeDeg: 0 },
        { terrain: 'grass', lengthM: 10, slopeDeg: 0 },
        { terrain: 'asphalt', lengthM: 4, slopeDeg: 0, obstacle: 'step' },
        { terrain: 'grass', lengthM: 8, slopeDeg: 4 },
        { terrain: 'asphalt', lengthM: 6, slopeDeg: 0 },
      ],
    },
  },
  M2: {
    id: 'M2', name: 'Beach Run', description: 'Asphalt, sand, a shallow crossing and more sand.',
    weather: 'clear', starThreshold: 700, leaderboard: false,
    track: {
      segments: [
        { terrain: 'asphalt', lengthM: 10, slopeDeg: 0, feature: { type: 'ramp', launchDeg: 12, lengthM: 1.2 } },
        { terrain: 'sand', lengthM: 14, slopeDeg: -3 },
        { terrain: 'water', lengthM: 8, slopeDeg: 0, depthCm: 8 },
        { terrain: 'sand', lengthM: 14, slopeDeg: 5 },
        { terrain: 'asphalt', lengthM: 4, slopeDeg: 0 },
      ],
    },
  },
  M3: {
    id: 'M3', name: 'Mud Run', description: 'Grass, a 15° mud slope, deep mud and rock.',
    weather: 'clear', starThreshold: 650, leaderboard: false,
    track: {
      segments: [
        { terrain: 'grass', lengthM: 10, slopeDeg: 0 },
        { terrain: 'mud', lengthM: 10, slopeDeg: 15, depthCm: 6 },
        { terrain: 'mud', lengthM: 12, slopeDeg: 0, depthCm: 12 },
        { terrain: 'rock', lengthM: 10, slopeDeg: 0, obstacle: 'rock' },
        { terrain: 'grass', lengthM: 6, slopeDeg: -4, feature: { type: 'drop', heightM: 0.6 } },
      ],
    },
  },
  M4: {
    id: 'M4', name: 'Frozen Pass', description: 'Cold. An ice climb, a rock field, then a long ice descent into more rock. Brake early or pay.',
    weather: 'cold', starThreshold: 650, leaderboard: false,
    track: {
      segments: [
        { terrain: 'asphalt', lengthM: 8, slopeDeg: 0 },
        { terrain: 'ice', lengthM: 10, slopeDeg: 5 },
        { terrain: 'rock', lengthM: 6, slopeDeg: 0, obstacle: 'rock' },
        { terrain: 'ice', lengthM: 16, slopeDeg: -5 },
        { terrain: 'rock', lengthM: 6, slopeDeg: 0, obstacle: 'rock' },
        { terrain: 'asphalt', lengthM: 6, slopeDeg: 0 },
      ],
    },
  },
  M5: {
    id: 'M5', name: 'Room Challenge', description: 'Rain. Every terrain. Same seed for everyone in the room.',
    weather: 'rain', starThreshold: 600, leaderboard: true, fixedSeed: 20261010,
    track: {
      segments: [
        { terrain: 'asphalt', lengthM: 8, slopeDeg: 0, feature: { type: 'ramp', launchDeg: 12, lengthM: 1.2 } },
        { terrain: 'grass', lengthM: 8, slopeDeg: 5 },
        { terrain: 'sand', lengthM: 10, slopeDeg: 0 },
        { terrain: 'water', lengthM: 6, slopeDeg: 0, depthCm: 10 },
        { terrain: 'mud', lengthM: 10, slopeDeg: 10, depthCm: 8 },
        { terrain: 'rock', lengthM: 8, slopeDeg: 0, obstacle: 'log' },
        { terrain: 'ice', lengthM: 10, slopeDeg: -5 },
        { terrain: 'asphalt', lengthM: 4, slopeDeg: 0, obstacle: 'step' },
        { terrain: 'grass', lengthM: 6, slopeDeg: 0, feature: { type: 'drop', heightM: 0.5 } },
      ],
    },
  },
  M6: {
    id: 'M6', name: 'Deep Water', description: 'A flooded passage up to 120 cm deep, with a current and submerged debris. Seal the robot and fit thrusters, or sink.',
    weather: 'clear', starThreshold: 500, leaderboard: false,
    track: {
      segments: [
        { terrain: 'asphalt', lengthM: 12, slopeDeg: 0 },
        { terrain: 'rock', lengthM: 8, slopeDeg: -12, obstacle: 'rock' },
        { terrain: 'water', lengthM: 15, slopeDeg: -5, depthCm: 60 },
        { terrain: 'water', lengthM: 20, slopeDeg: 0, depthCm: 90, currentMps: 0.5 },
        { terrain: 'water', lengthM: 15, slopeDeg: 0, depthCm: 120, obstacle: 'log' },
        { terrain: 'water', lengthM: 15, slopeDeg: 8, depthCm: 80 },
        { terrain: 'rock', lengthM: 10, slopeDeg: 12, obstacle: 'step' },
        { terrain: 'asphalt', lengthM: 5, slopeDeg: 0 },
      ],
    },
  },
  M7: {
    id: 'M7', name: 'Scrapyard Jumps', description: 'Ramps, gaps and a drop. Hit the ramps fast, and bring a piston for the gap with no ramp.',
    weather: 'clear', starThreshold: 650, leaderboard: false,
    track: {
      segments: [
        { terrain: 'asphalt', lengthM: 8, slopeDeg: 0 },
        { terrain: 'asphalt', lengthM: 6, slopeDeg: 0, feature: { type: 'ramp', launchDeg: 20, lengthM: 1.5 } },
        { terrain: 'grass', lengthM: 8, slopeDeg: 0, feature: { type: 'gap', widthM: 0.6 } },
        { terrain: 'asphalt', lengthM: 8, slopeDeg: 0, obstacle: 'log' },
        { terrain: 'grass', lengthM: 8, slopeDeg: 0, feature: { type: 'gap', widthM: 0.9 } },
        { terrain: 'asphalt', lengthM: 6, slopeDeg: 0, feature: { type: 'drop', heightM: 0.7 } },
        { terrain: 'asphalt', lengthM: 6, slopeDeg: 0, feature: { type: 'ramp', launchDeg: 15, lengthM: 1.5 } },
        { terrain: 'asphalt', lengthM: 8, slopeDeg: 0, feature: { type: 'gap', widthM: 0.6 } },
        { terrain: 'asphalt', lengthM: 4, slopeDeg: 0 },
      ],
    },
  },
};

/** Drive mode: one seed per mission, so every player races the same Jev ghost and times compare. */
export function driveSeed(mission: Mission): number {
  return mission.fixedSeed ?? 20261010 + Number(mission.id.slice(1));
}

export const MISSION_IDS = Object.keys(MISSIONS) as readonly MissionId[];
