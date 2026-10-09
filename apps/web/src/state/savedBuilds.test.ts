import { beforeEach, describe, expect, it } from 'vitest';
import { PRESETS } from '@rivetrun/sim';
import { BUILD_NAME_MAX, SAVED_BUILDS_MAX, cleanBuildName, useSavedBuildsStore } from './savedBuilds';

const { all_rounder, speedster } = PRESETS;
const store = () => useSavedBuildsStore.getState();

beforeEach(() => useSavedBuildsStore.setState({ builds: [] }));

describe('saved builds', () => {
  it('saves newest first and trims the name', () => {
    expect(store().save('  Mud  runner ', all_rounder.build)).toMatchObject({ ok: true, replaced: false });
    store().save('Sprinter', speedster.build);
    expect(store().builds.map((saved) => saved.name)).toEqual(['Sprinter', 'Mud runner']);
  });

  it('replaces a build saved under the same name, whatever the letter case', () => {
    const first = store().save('Racer', all_rounder.build);
    const second = store().save('racer', speedster.build);
    expect(second).toMatchObject({ ok: true, replaced: true });
    expect(first.ok && second.ok && first.id === second.id).toBe(true);
    expect(store().builds).toHaveLength(1);
    expect(store().builds[0]?.build).toEqual(speedster.build);
  });

  it('refuses an empty name and a full shelf', () => {
    expect(store().save('   ', all_rounder.build)).toEqual({ ok: false, reason: 'name' });
    for (let i = 0; i < SAVED_BUILDS_MAX; i += 1) store().save(`Build ${i}`, all_rounder.build);
    expect(store().save('One too many', all_rounder.build)).toEqual({ ok: false, reason: 'full' });
    // Saving over an existing name still works when full.
    expect(store().save('build 3', speedster.build)).toMatchObject({ ok: true, replaced: true });
  });

  it('renames unless the name is empty or taken, and deletes', () => {
    const a = store().save('Alpha', all_rounder.build);
    store().save('Beta', speedster.build);
    if (!a.ok) throw new Error('save failed');
    expect(store().rename(a.id, 'Beta')).toBe(false);
    expect(store().rename(a.id, ' ')).toBe(false);
    expect(store().rename(a.id, 'Gamma')).toBe(true);
    expect(store().builds.map((saved) => saved.name).sort()).toEqual(['Beta', 'Gamma']);
    store().remove(a.id);
    expect(store().builds.map((saved) => saved.name)).toEqual(['Beta']);
  });

  it('cuts names to the limit', () => {
    expect(cleanBuildName('x'.repeat(60))).toHaveLength(BUILD_NAME_MAX);
    expect(cleanBuildName('')).toBeNull();
  });
});
