'use client';

import { useMemo } from 'react';
import { quality } from '../../quality';
import type { TrackLayout } from '../../track';
import { RescueDressing } from '../RescueDressing';
import { placeRescueKit, type ScanSpan } from './placement';
import { RescueKit, useRescueKit } from './RescueKit';
import { useSettled } from './useSettled';

export interface RescueSiteProps {
  layout: TrackLayout;
  /** The mission's scan zones: beacons mark them and tall pieces keep clear of their labels. */
  zones: readonly ScanSpan[];
  lanes?: readonly number[];
  /** 0–1: 1 is everything; below it (weak devices, ?quality=low) fewer props, no dust and no halos. */
  budget?: number;
}

/**
 * Earthquake Rescue's street. The prop kit (public/env/m7/props) is placed from the sim's geometry; grit and dust are
 * drawn here either way. Until the kit has loaded only the grit shows, and if it cannot be loaded at all the
 * street is built from the procedural slabs, walls and cordons instead.
 */
export function RescueSite({ layout, zones, lanes, budget = 1 }: RescueSiteProps) {
  // The kit starts to load once the scene is drawing: it never delays a run's first frame.
  const kit = useRescueKit(useSettled());
  const clear = useMemo(() => zones.map((zone) => ({ s0: zone.atM - zone.halfLengthM, s1: zone.atM + zone.halfLengthM })), [zones]);
  const placements = useMemo(() => placeRescueKit({ layout, zones, lanes, budget }), [layout, zones, lanes, budget]);
  return (
    <>
      <RescueDressing layout={layout} clear={clear} budget={budget} full={kit.status === 'failed'} />
      {kit.status === 'ready' && <RescueKit kit={kit.kit} placements={placements} shadows={!quality().weak} halos={budget >= 1} />}
    </>
  );
}
