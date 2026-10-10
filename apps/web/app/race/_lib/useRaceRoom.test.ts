import { describe, expect, it } from 'vitest';
import { PHONE_POLL_MS, SCREEN_POLL_MS, pollMsFor, pollOnly } from './useRaceRoom';

describe('race transport (RR-PLAN §6)', () => {
  it('skips the event stream on a quick tunnel, when configured, or when the URL asks; otherwise streams', () => {
    expect(pollOnly('walnut-red-fox.trycloudflare.com', '', undefined)).toBe(true);
    expect(pollOnly('localhost', '', 'poll')).toBe(true);
    expect(pollOnly('localhost', '?transport=poll', undefined)).toBe(true);
    expect(pollOnly('localhost', '', undefined)).toBe(false);
    expect(pollOnly('192.168.0.14', '?mode=play', 'sse')).toBe(false);
    expect(pollOnly('trycloudflare.com.evil.example', '', undefined)).toBe(false);
  });

  it('phones poll once a second, the big screen four times', () => {
    expect([PHONE_POLL_MS, SCREEN_POLL_MS]).toEqual([1000, 250]);
    expect(pollMsFor('/race/ABCD')).toBe(1000);
    expect(pollMsFor('/play')).toBe(1000);
    expect(pollMsFor('/screen')).toBe(250);
  });
});
