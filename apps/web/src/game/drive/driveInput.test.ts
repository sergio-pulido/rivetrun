import { describe, expect, it } from 'vitest';
import { createDriveInput } from './driveInput';

describe('drive input store', () => {
  it('clamps pedals to 0–1 and still takes booleans', () => {
    const drive = createDriveInput();
    drive.setThrottle(1.4);
    drive.setBrake(true);
    expect(drive.read()).toMatchObject({ throttle: 1, brake: 1 });
    drive.setThrottle(-2);
    drive.setBrake(false);
    expect(drive.read()).toMatchObject({ throttle: 0, brake: 0 });
  });

  it('a tap jump is read once; a held jump is read for as long as it is held', () => {
    const drive = createDriveInput();
    drive.jump();
    expect(drive.read().special).toBe('jump');
    expect(drive.read().special).toBeUndefined();
    drive.setJumpHeld(true);
    expect(drive.read().jumpHeld).toBe(true);
    expect(drive.read().jumpHeld).toBe(true);
    drive.setJumpHeld(false);
    expect(drive.read().jumpHeld).toBeUndefined();
  });

  it('losing focus lets go of what is held but keeps climb mode', () => {
    const drive = createDriveInput();
    drive.toggleClimb();
    drive.setThrottle(0.8);
    drive.setWinch(true);
    drive.setJumpHeld(true);
    drive.release();
    expect(drive.peek()).toMatchObject({ throttle: 0, brake: 0, winch: false, jumpHeld: false, climb: true });
    expect(drive.read().special).toBe('climb');
  });

  it('the end of a run leaves nothing for the next one', () => {
    const drive = createDriveInput();
    drive.toggleClimb();
    drive.jump();
    drive.setThrottle(1);
    drive.reset();
    expect(drive.peek()).toEqual({ throttle: 0, brake: 0, climb: false, winch: false, jumpHeld: false, jumpAt: 0 });
    expect(drive.read()).toEqual({ throttle: 0, brake: 0 });
  });

  it('tells its listeners only when something changed', () => {
    const drive = createDriveInput();
    let calls = 0;
    const stop = drive.subscribe(() => { calls += 1; });
    drive.setThrottle(0.5);
    drive.setThrottle(0.5);
    drive.reset();
    drive.reset();
    stop();
    drive.setThrottle(1);
    expect(calls).toBe(2);
  });
});
