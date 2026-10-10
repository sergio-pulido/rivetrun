import { describe, expect, it } from 'vitest';
import { MISSIONS } from '@rivetrun/sim';
import { HOME_CTA, HOME_MISSION, homeCta } from './cta';

describe('Home call to action', () => {
  it('follows the switch unless the address asks for one of the two versions', () => {
    expect(homeCta(undefined)).toBe(HOME_CTA);
    expect(homeCta('nonsense')).toBe(HOME_CTA);
    expect(homeCta(['play'])).toBe(HOME_CTA);
    expect(homeCta('play')).toBe('play');
    expect(homeCta('mission')).toBe('mission');
  });

  it('starts a mission that exists', () => {
    expect(MISSIONS[HOME_MISSION].id).toBe(HOME_MISSION);
  });
});
