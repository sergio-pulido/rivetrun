import { describe, expect, it } from 'vitest';
import { PlanSchema, type Plan } from '@rivetrun/contracts';
import { PRESETS } from '@rivetrun/sim';
import { clampBriefing, parsePlanFile, planCaption, planFallback, planParts, readPlanAnswer, standInPlan } from './plan';

const PLAN: Plan = {
  build: PRESETS.mud_crawler.build,
  presetId: 'mud_crawler',
  priority: 0.7,
  briefing: 'Crawl the mud, brake before rocks.',
  rationale: 'Long mud and two rocks: tracks and torque, a distance sensor to see the rocks.',
  partsWhy: [{ partId: 'tracks', why: 'never sinks in the mud' }],
  generatedBy: { provider: 'openai', model: 'gpt-6.1-sol', ms: 18_420, at: '2026-10-10T13:20:00+02:00' },
};

describe('readPlanAnswer', () => {
  it('reads a plan as the body or wrapped', () => {
    expect(readPlanAnswer(PLAN)).toEqual(PLAN);
    expect(readPlanAnswer({ plan: PLAN })).toEqual(PLAN);
    expect(readPlanAnswer({ data: PLAN })).toEqual(PLAN);
  });

  it('is null for anything that is not a valid plan', () => {
    expect(readPlanAnswer({ ...PLAN, briefing: 'x'.repeat(141) })).toBeNull();
    expect(readPlanAnswer({ error: 'billing' })).toBeNull();
    expect(readPlanAnswer(null)).toBeNull();
  });
});

describe('planFallback', () => {
  it('says when the route handed back the committed plan, and why', () => {
    expect(planFallback({ plan: PLAN, source: 'pregenerated', fellBackBecause: 'the spending cap for live model calls is reached' })).toEqual({ pregenerated: true, because: 'the spending cap for live model calls is reached' });
    expect(planFallback({ plan: PLAN, source: 'model' })).toEqual({ pregenerated: false, because: null });
    expect(planFallback(PLAN)).toEqual({ pregenerated: false, because: null });
  });
});

describe('parsePlanFile', () => {
  it('reads the three shapes a pregenerated file may have', () => {
    expect(parsePlanFile({ plans: { mud_crawler: PLAN } })).toEqual({ mud_crawler: PLAN });
    expect(parsePlanFile({ mud_crawler: PLAN })).toEqual({ mud_crawler: PLAN });
    expect(parsePlanFile([PLAN])).toEqual({ mud_crawler: PLAN });
    expect(parsePlanFile({ model: 'x', plans: [PLAN] })).toEqual({ mud_crawler: PLAN });
  });

  it('drops what is not a plan for a known preset', () => {
    expect(parsePlanFile({ plans: { mud_crawler: { ...PLAN, priority: 3 }, hovercraft: PLAN } })).toEqual({});
    expect(parsePlanFile('nothing')).toEqual({});
  });
});

describe('the stand-in', () => {
  it('is a valid plan that says it is not one', () => {
    const plan = standInPlan('all_rounder', '2026-10-10T13:00:00+02:00');
    expect(PlanSchema.safeParse(plan).success).toBe(true);
    expect(plan.build).toEqual(PRESETS.all_rounder.build);
    expect(plan.generatedBy.model).toBe('no model (stand-in)');
    expect(plan.rationale).toContain('No model was asked');
    expect(planCaption(plan, 'stand-in')).toBe('Stand-in: no model was asked. The driver only sees what its sensors report.');
  });
});

describe('the card', () => {
  it('lists every part of the build with the reason beside the ones the planner explained', () => {
    const parts = planParts(PLAN);
    expect(parts.map((part) => part.partId)).toEqual(['tracks', 'motor_torque', 'battery_large', 'imu', 'waterproof_case']);
    expect(parts[0]).toEqual({ partId: 'tracks', name: 'Tracks', slot: 'locomotion', why: 'never sinks in the mud' });
    expect(parts[1]?.why).toBeNull();
  });

  it('names the real model and the time it took', () => {
    expect(planCaption(PLAN, 'live')).toBe('Plan by gpt-6.1-sol in 18.4 s. The driver only sees what its sensors report.');
    expect(planCaption(PLAN, 'pregenerated')).toBe('Pregenerated plan by gpt-6.1-sol (2026-10-10), not asked now. The driver only sees what its sensors report.');
  });

  it('never lets the briefing pass 140 characters', () => {
    expect(clampBriefing('x'.repeat(200))).toHaveLength(140);
    expect(clampBriefing('short')).toBe('short');
  });
});
