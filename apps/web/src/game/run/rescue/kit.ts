// Earthquake Rescue (M7) environment art: three backdrop layers and a prop kit, served from public/env/m7.
// The values are those of docs/inputs/m7-env.json (the delivery's manifest, which the app does not serve): file
// names, parallax factors, depths and each prop's envelope. When the manifest changes, this table follows it.

export const ENV_BASE = '/env/m7';

/** One backdrop picture: transparent artwork over the game's sky, all three framed by the same 15° side camera. */
export interface LayerSpec {
  readonly id: string;
  readonly file: string;
  /** How fast the layer passes compared with the track: 1 = with the track, 0 = fixed to the camera. */
  readonly parallax: number;
  /** World depth of the layer. */
  readonly z: number;
  /** Dropped with ?quality=low and on weak devices. */
  readonly nearest?: boolean;
}

/** Far → near: the order they are drawn in. */
export const LAYERS: readonly LayerSpec[] = [
  { id: 'far_skyline', file: 'far_skyline.webp', parallax: 0.12, z: -140 },
  { id: 'mid_ruins', file: 'mid_ruins.webp', parallax: 0.35, z: -95 },
  { id: 'near_rubble', file: 'near_rubble.webp', parallax: 0.65, z: -60, nearest: true },
];

/** Width / height of every layer picture (4096 × 1024). */
export const LAYER_ASPECT = 4;
/** Where the far ground meets the sky in the pictures, from the top. */
export const LAYER_HORIZON = 0.4;

export type PropId =
  | 'cracked_slab_01'
  | 'cracked_slab_02'
  | 'cracked_slab_03'
  | 'slab_rebar'
  | 'rubble_pile_01'
  | 'rubble_pile_02'
  | 'collapsed_wall'
  | 'crash_barrier'
  | 'warning_tape_posts'
  | 'emergency_tripod_light'
  | 'rescue_beacon';

/** A prop: origin at the middle of its base, +Y up, long axis along +X (the street), native size in metres. */
export interface PropSpec {
  readonly file: string;
  /** Size along the street, height, depth. Placement keeps this box clear of everything the sim owns. */
  readonly envelope: readonly [number, number, number];
}

export const PROPS: Readonly<Record<PropId, PropSpec>> = {
  cracked_slab_01: { file: 'props/cracked_slab_01.glb', envelope: [1.499, 0.186, 0.996] },
  cracked_slab_02: { file: 'props/cracked_slab_02.glb', envelope: [1.211, 0.311, 0.884] },
  cracked_slab_03: { file: 'props/cracked_slab_03.glb', envelope: [1.884, 0.483, 0.954] },
  slab_rebar: { file: 'props/slab_rebar.glb', envelope: [2.39, 1.04, 1.709] },
  rubble_pile_01: { file: 'props/rubble_pile_01.glb', envelope: [2.505, 1.134, 2.09] },
  rubble_pile_02: { file: 'props/rubble_pile_02.glb', envelope: [2.554, 1.367, 2.477] },
  collapsed_wall: { file: 'props/collapsed_wall.glb', envelope: [2.758, 2.715, 0.577] },
  crash_barrier: { file: 'props/crash_barrier.glb', envelope: [2.9, 0.903, 0.335] },
  warning_tape_posts: { file: 'props/warning_tape_posts.glb', envelope: [2.92, 1.163, 0.32] },
  emergency_tripod_light: { file: 'props/emergency_tripod_light.glb', envelope: [0.88, 2.252, 1.001] },
  rescue_beacon: { file: 'props/rescue_beacon.glb', envelope: [0.34, 0.57, 0.309] },
};

export const PROP_IDS = Object.keys(PROPS) as PropId[];
