import { heuristicBrain, MISSION_IDS, MISSIONS, PRESETS, runHeadless } from '@rivetrun/sim';
import type { BrainQuestion } from '@rivetrun/contracts';
import { describe, expect, it } from 'vitest';
import { buildArenaPrompt } from './arena/prompt';
import { buildJevRequest, jevQuestionVersion, VERDICT_WORDS } from './index';

// docs/QA.md Q20: the game's question states which option the fixed rules rate as correct. The facts-only wording
// gives the same state, options and predicted numbers and says what things cost, and rates nothing.
describe('facts-only rail question', () => {
  it('holds no verdict word on any question of any mission, for Jev and for the arena prompt', async () => {
    const questions: BrainQuestion[] = [];
    for (const id of MISSION_IDS) {
      for (const build of [PRESETS.all_rounder.build, { ...PRESETS.all_rounder.build, extras: [...PRESETS.all_rounder.build.extras, 'piston_jump'] }]) {
        await runHeadless(MISSIONS[id], 1001, build, { decide: (question) => (questions.push(question), heuristicBrain.decide(question)) }, { priority: 0.5, briefing: 'Careful over the gap.' });
      }
    }
    expect(questions.length).toBeGreaterThan(200);
    expect(questions.some((q) => q.options.includes('scan'))).toBe(true);
    expect(questions.some((q) => q.options.includes('jump'))).toBe(true);
    for (const question of questions) {
      const action = buildJevRequest(question, undefined, 'facts').questions.action;
      const said = `${action.instructions} ${Object.values(action.criteria).join(' ')} ${buildArenaPrompt(question, 'facts').user}`.replace('Careful over the gap.', '');
      const hit = VERDICT_WORDS.exec(said);
      expect(hit?.[0], hit ? `"…${said.slice(Math.max(0, hit.index - 70), hit.index + 40)}…"` : '').toBeUndefined();
      // Same options and the same predicted numbers as the game's wording.
      const game = buildJevRequest(question).questions.action;
      expect(Object.keys(action.criteria)).toEqual(Object.keys(game.criteria));
      // Every option keeps the game's description and numbers, then adds the sim's facts about that option.
      for (const [id, text] of Object.entries(action.criteria)) expect((text ?? "").startsWith(game.criteria[id] ?? "?"), id).toBe(true);
      expect(VERDICT_WORDS.test(game.instructions)).toBe(true);
    }
    expect(jevQuestionVersion('facts')).toMatch(new RegExp(`^${jevQuestionVersion()}-facts`));
  });

  it('still states what a scan zone costs: the hold time on it and the penalty for driving past', async () => {
    const seen: string[] = [];
    await runHeadless(MISSIONS.M1, 1001, PRESETS.all_rounder.build, { decide: (question) => (seen.push(buildJevRequest(question, undefined, 'facts').questions.action.instructions), heuristicBrain.decide(question)) }, { priority: 0.5 });
    expect(seen.some((text) => /m ahead and this robot can scan it.*10 s time penalty/.test(text))).toBe(true);
    expect(seen.some((text) => /under the robot right now.*holds the robot on the zone for 1\.5 s/.test(text))).toBe(true);
  });

  it('puts the cost of passing a scan pad on the options that pass it', async () => {
    const said: string[] = [];
    await runHeadless(MISSIONS.M1, 1001, PRESETS.all_rounder.build, { decide: (question) => (said.push(...Object.values(buildJevRequest(question, undefined, "facts").questions.action.criteria).map((text) => text ?? "")), heuristicBrain.decide(question)) }, { priority: 0.5 });
    expect(said.some((text) => /Scan zone "[^"]+": .*the zone is lost, \+10 s on the clock/.test(text))).toBe(true);
    expect(said.some((text) => /can still stop on the pad|completes the scan inside the window|scan is in progress/.test(text))).toBe(true);
  });
});
