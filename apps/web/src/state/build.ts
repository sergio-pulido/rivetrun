'use client';

import { BuildSchema, MissionIdSchema, PrioritySchema, type Build, type MissionId } from '@rivetrun/contracts';
import { DEFAULT_PRESET_ID, PARTS_BY_ID, PRESETS } from '@rivetrun/sim';
import { create } from 'zustand';
import { z } from 'zod';
import { DEFAULT_PRIORITY, useRunStore } from './run';
import { readJson, writeJson } from './storage';

const STORAGE_KEY = 'rivetrun.loadout.v1';
const DEFAULT_MISSION: MissionId = 'M1';

const LoadoutSchema = z.object({
  build: BuildSchema,
  priority: PrioritySchema,
  missionId: MissionIdSchema,
});
type Loadout = z.infer<typeof LoadoutSchema>;

interface BuildStore extends Loadout {
  /** The robot the next run deploys. */
  readonly setBuild: (build: Build) => void;
  /** 0 = speed, 1 = safety. */
  readonly setPriority: (priority: number) => void;
  /** The mission Workshop and Result send the player back to. */
  readonly setMission: (missionId: MissionId) => void;
  /** Loads the saved loadout. Called once on the client after mount. */
  readonly hydrate: () => void;
}

const slotOf = (id: string): string | undefined => PARTS_BY_ID.get(id)?.slot;

/** A saved build is only usable when every part still exists in its slot. */
export function isValidBuild(build: Build): boolean {
  return (
    slotOf(build.locomotion) === 'locomotion' &&
    slotOf(build.motor) === 'motor' &&
    slotOf(build.battery) === 'battery' &&
    build.sensors.every((id) => slotOf(id) === 'sensor') &&
    build.extras.every((id) => slotOf(id) === 'extra')
  );
}

// The run page reads build and priority from the run store: keep it in step.
const mirror = (loadout: Loadout): void => {
  const run = useRunStore.getState();
  run.setBuild(loadout.build);
  run.setPriority(loadout.priority);
};

const save = (state: Loadout): void =>
  writeJson(STORAGE_KEY, { build: state.build, priority: state.priority, missionId: state.missionId });

export const useBuildStore = create<BuildStore>((set, get) => {
  const commit = (patch: Partial<Loadout>): void => {
    set(patch);
    const next = get();
    mirror(next);
    save(next);
  };
  return {
    build: PRESETS[DEFAULT_PRESET_ID].build,
    priority: DEFAULT_PRIORITY,
    missionId: DEFAULT_MISSION,
    setBuild: (build) => commit({ build }),
    setPriority: (priority) => commit({ priority: Math.min(1, Math.max(0, priority)) }),
    setMission: (missionId) => commit({ missionId }),
    hydrate: () => {
      const parsed = LoadoutSchema.safeParse(readJson(STORAGE_KEY));
      if (!parsed.success || !isValidBuild(parsed.data.build)) return;
      set(parsed.data);
      mirror(parsed.data);
    },
  };
});
