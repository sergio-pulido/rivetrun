import { createContext, useContext } from 'react';
import { MeshBasicMaterial, MeshStandardMaterial, type Material } from 'three';

/** bakeKey: which merged material class a part joins (see bake.tsx). Transparent parts stay on their own. */
export const withBakeKey = <T extends Material>(material: T, key: string): T => {
  material.userData.bakeKey = key;
  return material;
};

const std = (color: string, roughness: number, metalness = 0, extra: Partial<MeshStandardMaterial> = {}): MeshStandardMaterial => {
  const material = Object.assign(new MeshStandardMaterial({ color, roughness, metalness }), extra);
  return extra.transparent ? material : withBakeKey(material, metalness >= 0.2 ? 'metal' : 'matte');
};

const glow = (color: string): MeshBasicMaterial => withBakeKey(new MeshBasicMaterial({ color, toneMapped: false }), 'glow');

/** Shared maker-part materials. One instance each, reused by every robot. */
function createMaterials() {
  return {
    pcb: std('#1f8a4c', 0.42, 0.1),
    pcbDark: std('#14603a', 0.5, 0.1),
    pcbBlue: std('#1d4fb8', 0.45, 0.1),
    pcbPurple: std('#6d3fc4', 0.45, 0.1),
    print: std('#ff7a1a', 0.72),
    printDark: std('#e0640c', 0.78),
    servo: std('#16181d', 0.5, 0.05),
    servoLabel: std('#2f6fe0', 0.6),
    chip: std('#0a0b0e', 0.35, 0.2),
    rubber: std('#131417', 0.96),
    rubberLight: std('#26282d', 0.9),
    hubYellow: std('#f6c51c', 0.55),
    steel: std('#c2c9d1', 0.28, 0.9),
    darkSteel: std('#4a5059', 0.4, 0.8),
    brass: std('#d1a548', 0.3, 0.85),
    gold: std('#f2c14e', 0.25, 0.9),
    lipo: std('#2a5fdb', 0.5, 0.05),
    cell: std('#19b3a6', 0.4, 0.2),
    label: std('#f4d03f', 0.7),
    wireRed: std('#d92b2b', 0.6),
    wireBlack: std('#101114', 0.6),
    wireBlue: std('#3b82f6', 0.6),
    wireYellow: std('#facc15', 0.6),
    hazard: std('#f6c51c', 0.6),
    finRed: std('#c7302b', 0.4, 0.5),
    screen: std('#04070b', 0.12, 0.4),
    head: std('#1b1e24', 0.45, 0.2),
    clear: std('#9fdcff', 0.08, 0.1, { transparent: true, opacity: 0.2, depthWrite: false }),
    cable: std('#8b929b', 0.4, 0.7),
    ledGreen: glow('#5dff8a'),
    ledRed: glow('#ff4d3d'),
    ledOrange: glow('#ffa23d'),
    ledBlue: glow('#5ea8ff'),
    ledCyan: glow('#3fd0e0'),
  } satisfies Record<string, Material>;
}

export type RobotMaterials = Record<keyof ReturnType<typeof createMaterials>, Material>;

let shared: RobotMaterials | null = null;
export function robotMaterials(): RobotMaterials {
  shared ??= createMaterials();
  return shared;
}

const ghostCache = new Map<string, RobotMaterials>();

/** Every part of a ghost robot shares one translucent, desaturated material. */
export function ghostMaterials(tint: string): RobotMaterials {
  const cached = ghostCache.get(tint);
  if (cached) return cached;
  const body = new MeshStandardMaterial({
    color: tint, emissive: tint, emissiveIntensity: 0.25, roughness: 0.6, transparent: true, opacity: 0.3, depthWrite: false,
  });
  const dark = new MeshStandardMaterial({
    color: tint, emissive: tint, emissiveIntensity: 0.05, roughness: 0.8, transparent: true, opacity: 0.42, depthWrite: false,
  });
  const lit = new MeshBasicMaterial({ color: tint, transparent: true, opacity: 0.8, toneMapped: false });
  // Ghost parts merge too, but keep their own translucent material (no shared vertex-colour target).
  withBakeKey(body, `ghost:${tint}:body`);
  withBakeKey(dark, `ghost:${tint}:dark`);
  withBakeKey(lit, `ghost:${tint}:lit`);
  const base = robotMaterials();
  const darkKeys = new Set<string>(['rubber', 'rubberLight', 'servo', 'chip', 'head', 'screen', 'wireBlack']);
  const entries = Object.keys(base).map((key) => [key, key.startsWith('led') ? lit : darkKeys.has(key) ? dark : body]);
  const set = Object.fromEntries(entries) as RobotMaterials;
  ghostCache.set(tint, set);
  return set;
}

export const MaterialsContext = createContext<RobotMaterials | null>(null);

export function useMats(): RobotMaterials {
  return useContext(MaterialsContext) ?? robotMaterials();
}
