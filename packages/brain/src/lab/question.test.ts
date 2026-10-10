import { describe, expect, it } from 'vitest';
import { buildLabJevRequest, buildLabTextPrompt, parseLabAnswer, type LabQuestionLike } from './question';

const question: LabQuestionLike = {
  scenarioId: 'maze',
  objective: 'Find the exit of the maze.',
  t: 12.5,
  trigger: { label: 'LIDAR · junction: west and north open' },
  knew: ['CORE · battery 64 % · 38 tiles of range', 'LIDAR · north 4 tiles free then wall', 'LIDAR · west 2 tiles free then unexplored'],
  unknown: ['objects and labels: no camera'],
  energy: { batteryPct: 64, projectedPct: 8, rangeTiles: 38 },
  objectives: [{ id: 'exit', label: 'Reach the exit', done: false, have: 0, need: 1 }],
  options: [
    { id: 'explore:N', kind: 'explore', label: 'Explore north', description: '4 tiles free, then a wall.', predicted: { steps: 4, energyPct: 6, marginAfterPct: 2 }, visited: true },
    { id: 'explore:W', kind: 'explore', label: 'Explore west', description: '2 tiles free, then unexplored ground.', predicted: { steps: 2, energyPct: 3, marginAfterPct: -4, assumed: true }, towardTiles: 5 },
    { id: 'wait', kind: 'wait', label: 'Wait', description: 'Hold position.' },
  ],
  observation: { blind: false, exploredPct: 31, carrying: [], damagePct: 0, pace: 'full' },
};

describe('lab question', () => {
  const request = buildLabJevRequest(question);
  const { instructions, criteria } = request.questions.action;

  it('is one Choice over the option ids, built from the lab question alone', () => {
    expect(Object.keys(criteria)).toEqual(['explore:N', 'explore:W', 'wait']);
    expect(request.state.sensors).toEqual(question.knew);
    expect(instructions).toContain('Mission: Find the exit of the maze.');
    expect(instructions).toContain('something changed: LIDAR · junction: west and north open');
  });

  it('says what is unknown, what is open and where the energy stands', () => {
    expect(instructions).toContain('Unknown to this robot: objects and labels: no camera');
    expect(instructions).toContain('Reach the exit (0 of 1)');
    expect(instructions).toContain('battery is at 64 %, enough for about 38 tiles');
    expect(instructions).toContain('8 % left (critical)');
  });

  it('describes each option with its prediction and flags guesses over unseen ground', () => {
    expect(criteria['explore:N']).toContain('charge left after driving on to the end point 2 % (critical)');
    expect(criteria['explore:N']).toContain('has been driven before');
    expect(criteria['explore:W']).toContain('-4 % (would not get back)');
    expect(criteria['explore:W']).toContain('ground the robot has not seen');
  });

  it('gives an LLM the same text and reads back only an option id', () => {
    const prompt = buildLabTextPrompt(question);
    expect(prompt.user).toContain(instructions);
    expect(prompt.user).toContain(`- explore:W: ${criteria['explore:W']}`);
    expect(parseLabAnswer('{"choice":"explore:N","confidence":0.7}', prompt.optionIds)).toEqual({ choice: 'explore:N', confidence: 0.7 });
    expect(() => parseLabAnswer('{"choice":"north","confidence":1}', prompt.optionIds)).toThrow();
  });
});
