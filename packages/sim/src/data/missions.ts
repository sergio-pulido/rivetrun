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
        { terrain: 'asphalt', lengthM: 10, slopeDeg: 0 },
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
        { terrain: 'grass', lengthM: 6, slopeDeg: -4 },
      ],
    },
  },
  M4: {
    id: 'M4', name: 'Frozen Pass', description: 'Cold. Asphalt, a 12° ice slope, a rock field and more ice.',
    weather: 'cold', starThreshold: 650, leaderboard: false,
    track: {
      segments: [
        { terrain: 'asphalt', lengthM: 8, slopeDeg: 0 },
        { terrain: 'ice', lengthM: 12, slopeDeg: 12 },
        { terrain: 'rock', lengthM: 6, slopeDeg: 0, obstacle: 'rock' },
        { terrain: 'rock', lengthM: 6, slopeDeg: 0, obstacle: 'rock' },
        { terrain: 'ice', lengthM: 14, slopeDeg: -6 },
        { terrain: 'asphalt', lengthM: 4, slopeDeg: 0 },
      ],
    },
  },
  M5: {
    id: 'M5', name: 'Room Challenge', description: 'Rain. Every terrain. Same seed for everyone in the room.',
    weather: 'rain', starThreshold: 600, leaderboard: true, fixedSeed: 20261010,
    track: {
      segments: [
        { terrain: 'asphalt', lengthM: 8, slopeDeg: 0 },
        { terrain: 'grass', lengthM: 8, slopeDeg: 5 },
        { terrain: 'sand', lengthM: 10, slopeDeg: 0 },
        { terrain: 'water', lengthM: 6, slopeDeg: 0, depthCm: 10 },
        { terrain: 'mud', lengthM: 10, slopeDeg: 10, depthCm: 8 },
        { terrain: 'rock', lengthM: 8, slopeDeg: 0, obstacle: 'log' },
        { terrain: 'ice', lengthM: 10, slopeDeg: -5 },
        { terrain: 'asphalt', lengthM: 4, slopeDeg: 0, obstacle: 'step' },
        { terrain: 'grass', lengthM: 6, slopeDeg: 0 },
      ],
    },
  },
};

export const MISSION_IDS = Object.keys(MISSIONS) as readonly MissionId[];
