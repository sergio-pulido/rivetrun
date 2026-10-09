import type { Terrain, TerrainId } from '@rivetrun/contracts';

// v0 values. Tuned later by scripts/balance.ts.
export const TERRAINS: Readonly<Record<TerrainId, Terrain>> = {
  asphalt: { id: 'asphalt', name: 'Asphalt', baseFriction: 0.9, rollingResistance: 0.02, sinkage: 0, impactRisk: 0.3, waterDamage: 0 },
  grass: { id: 'grass', name: 'Grass', baseFriction: 0.6, rollingResistance: 0.08, sinkage: 0.05, impactRisk: 0.2, waterDamage: 0 },
  sand: { id: 'sand', name: 'Sand', baseFriction: 0.45, rollingResistance: 0.2, sinkage: 0.35, impactRisk: 0.1, waterDamage: 0 },
  mud: { id: 'mud', name: 'Mud', baseFriction: 0.3, rollingResistance: 0.3, sinkage: 0.6, impactRisk: 0.1, waterDamage: 0.5 },
  ice: { id: 'ice', name: 'Ice', baseFriction: 0.1, rollingResistance: 0.01, sinkage: 0, impactRisk: 0.5, waterDamage: 0 },
  water: { id: 'water', name: 'Shallow water', baseFriction: 0.4, rollingResistance: 0.25, sinkage: 0.2, impactRisk: 0.1, waterDamage: 2 },
  rock: { id: 'rock', name: 'Rock', baseFriction: 0.7, rollingResistance: 0.12, sinkage: 0, impactRisk: 0.8, waterDamage: 0 },
};

export const TERRAIN_IDS = Object.keys(TERRAINS) as readonly TerrainId[];
