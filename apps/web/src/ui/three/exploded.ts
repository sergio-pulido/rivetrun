import type { Build } from '@rivetrun/contracts';
import { locomotionGeometry } from '@/game/robot/drive';

/** World-space gap between two exploded layers. */
export const LAYER_GAP = 0.9;
/** World height the stage shows; the canvas zoom and the DOM labels both derive from it. */
export const VIEW_HEIGHT = 5.5;
/** Camera elevation above the horizon, radians. */
export const ELEVATION = 0.3;
/** The model sits left of centre so the layer labels have the right-hand side. */
export const MODEL_SHIFT_X = -1.45;

export type LayerKey = 'sensors' | 'board' | 'chassis' | 'power' | 'wheels';

export interface Layer {
  readonly key: LayerKey;
  /** Lift of the layer's deck frame above its assembled position. */
  readonly lift: number;
  /** World height the label line points at. */
  readonly anchorY: number;
}

/** Five layers, top to bottom, for a build. Wheels stay on the ground; everything above is lifted in steps. */
export function explodedLayers(build: Build): readonly Layer[] {
  const { deckY, radius } = locomotionGeometry(build.locomotion);
  const at = (step: number, offset: number): Layer['anchorY'] => deckY + step * LAYER_GAP + offset;
  return [
    { key: 'sensors', lift: 4 * LAYER_GAP, anchorY: at(4, 0.42) },
    { key: 'board', lift: 3 * LAYER_GAP, anchorY: at(3, 0.2) },
    { key: 'chassis', lift: 2 * LAYER_GAP, anchorY: at(2, 0) },
    { key: 'power', lift: LAYER_GAP, anchorY: at(1, 0) },
    { key: 'wheels', lift: 0, anchorY: radius },
  ];
}

/** Vertical centre of the exploded stack, where the camera looks. */
export const stackCentreY = (build: Build): number => {
  const layers = explodedLayers(build);
  return (layers[0]!.anchorY + 0.5) / 2;
};

/** Top offset (0–1 of the stage height) of a world height, matching the orthographic camera in ExplodedCanvas. */
export const screenTop = (build: Build, worldY: number): number => 0.5 - ((worldY - stackCentreY(build)) * Math.cos(ELEVATION)) / VIEW_HEIGHT;
