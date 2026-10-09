import type { Action, DnfReason, Policy, TerrainId, Weather } from '@rivetrun/contracts';

/** Maker-workshop palette shared by the 3D scenes and the HUD. */
export const UI = {
  ink: '#0f141b',
  panel: '#161d27',
  panelHi: '#1f2935',
  line: '#2b3644',
  text: '#e6ebf2',
  dim: '#8494a7',
  safety: '#ff6a13',
  safetyHi: '#ff9a4d',
  blueprint: '#3b82c4',
  ok: '#4ade80',
  warn: '#fbbf24',
  bad: '#f8514a',
  led: '#5ef2ff',
} as const;

export interface TerrainLook {
  readonly label: string;
  /** Top surface base colour. */
  readonly top: string;
  /** Lip colour on the cut face. */
  readonly lip: string;
  /** Kick-up particle colour. */
  readonly dust: string;
  /** Flat colour used in HUD strips and chips. */
  readonly hud: string;
  readonly roughness: number;
  readonly metalness: number;
  /** Land colour behind the strip. */
  readonly land: string;
}

export const TERRAIN_LOOK: Readonly<Record<TerrainId, TerrainLook>> = {
  asphalt: { label: 'Asphalt', top: '#4a4f58', lip: '#2f333a', dust: '#9a9da3', hud: '#6b7280', roughness: 0.92, metalness: 0, land: '#4d7a3c' },
  grass: { label: 'Grass', top: '#5fae3f', lip: '#3f8a2c', dust: '#8fbf5a', hud: '#5fae3f', roughness: 1, metalness: 0, land: '#4d8a38' },
  sand: { label: 'Sand', top: '#e8c77d', lip: '#cfa95c', dust: '#f0d9a0', hud: '#e8c77d', roughness: 1, metalness: 0, land: '#d9b970' },
  mud: { label: 'Mud', top: '#5d3d26', lip: '#402817', dust: '#6b4428', hud: '#8a5a36', roughness: 0.22, metalness: 0.05, land: '#5a5a34' },
  ice: { label: 'Ice', top: '#cdefff', lip: '#8fd0ee', dust: '#f2fbff', hud: '#a5e4ff', roughness: 0.06, metalness: 0.25, land: '#dfeef5' },
  water: { label: 'Water', top: '#2f8fd6', lip: '#b89a5e', dust: '#cfeaff', hud: '#3b9eea', roughness: 0.08, metalness: 0.2, land: '#c9b47a' },
  rock: { label: 'Rock', top: '#858a93', lip: '#5f646c', dust: '#a9adb4', hud: '#9aa0aa', roughness: 0.85, metalness: 0.05, land: '#7b7f78' },
};

export const ACTION_LABEL: Readonly<Record<Action, string>> = {
  cruise: 'Cruise',
  accelerate: 'Accelerate',
  slow_down: 'Slow down',
  brake: 'Brake',
  reverse: 'Reverse',
  climb_mode: 'Climb mode',
  deploy_winch: 'Deploy winch',
};

export const POLICY_LABEL: Readonly<Record<Policy, string>> = {
  jev: 'JEV',
  heuristic: 'HEURISTIC',
  random: 'RANDOM',
};

/** Ghost tints: pale and desaturated so the player robot stays the hero. */
export const POLICY_TINT: Readonly<Record<Policy, string>> = {
  jev: '#ff6a13',
  heuristic: '#9fd8ef',
  random: '#cdb4f0',
};

export const DNF_LABEL: Readonly<Record<DnfReason, string>> = {
  damage: 'Wrecked',
  battery: 'Battery flat',
  stuck: 'Stuck',
  timeout: 'Out of time',
};

/** Depth layout of the track strip. The camera looks down −Z. */
export const LANES = {
  player: 0,
  heuristic: -1.9,
  random: -3.8,
  zFront: 1.5,
  zBack: -5.2,
} as const;

export const laneZ = (policy: Policy): number => (policy === 'jev' ? LANES.player : LANES[policy]);

export interface SkyLook {
  readonly top: string;
  readonly mid: string;
  readonly horizon: string;
  readonly fog: string;
  readonly sun: string;
  readonly sunIntensity: number;
  readonly hemiSky: string;
  readonly hemiGround: string;
  readonly hemiIntensity: number;
  readonly hills: readonly [string, string, string];
}

export const SKY: Readonly<Record<Weather, SkyLook>> = {
  clear: {
    top: '#24467e', mid: '#5b8fd0', horizon: '#ffcf9a', fog: '#f1c9a0', sun: '#fff0d2', sunIntensity: 2.6,
    hemiSky: '#bcd9ff', hemiGround: '#6b5a3a', hemiIntensity: 0.95, hills: ['#7fa06a', '#8fb0a0', '#b9c7c9'],
  },
  rain: {
    top: '#1a222e', mid: '#3a4a5c', horizon: '#7d8c99', fog: '#6f7e8b', sun: '#cfdbe6', sunIntensity: 1.5,
    hemiSky: '#9fb2c6', hemiGround: '#3c4038', hemiIntensity: 1.05, hills: ['#4f6657', '#586b72', '#6b7a86'],
  },
  cold: {
    top: '#2b4a72', mid: '#7fb0d8', horizon: '#e8f4fb', fog: '#dcecf5', sun: '#ffffff', sunIntensity: 2.2,
    hemiSky: '#d6ecff', hemiGround: '#8fa3b5', hemiIntensity: 1.1, hills: ['#aebfca', '#c3d3de', '#dbe8f0'],
  },
};
