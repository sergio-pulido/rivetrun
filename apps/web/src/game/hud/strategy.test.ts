import { BRIEFING_PRESETS } from '@rivetrun/contracts';
import { describe, expect, it } from 'vitest';
import { pilotLine, strategyName } from './strategy';

describe('strategy chip text', () => {
  it('names every briefing preset as the picker does', () => {
    for (const preset of BRIEFING_PRESETS) expect(strategyName(preset.id)).toBe(preset.name);
  });

  it("calls the plan Claude's unless another model wrote it", () => {
    expect(strategyName('plan')).toBe("Claude's plan");
    expect(strategyName('plan', 'claude-sonnet-5-5')).toBe("Claude's plan");
    expect(strategyName('plan', 'GPT-6.1 Sol')).toBe("GPT-6.1 Sol's plan");
    expect(strategyName('plan', 'Atlas')).toBe("Atlas' plan");
  });

  it('joins agent and strategy on one line: "+" for a plan, "·" for a preset', () => {
    expect(pilotLine({ agent: 'Jev', strategy: 'plan' })).toBe("Jev + Claude's plan");
    expect(pilotLine({ agent: 'GPT-6 Luna', strategy: 'daredevil' })).toBe('GPT-6 Luna · Daredevil');
    expect(pilotLine({ agent: 'DeepSeek Flash', strategy: 'plan', planModel: 'GPT-6.1 Sol' })).toBe("DeepSeek Flash + GPT-6.1 Sol's plan");
  });
});
