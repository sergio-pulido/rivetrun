'use client';

import { useEffect, useState } from 'react';
import { parseHumans, type ArenaHumans as Humans } from './humans';

interface ArenaHumansProps {
  /** Mission id → name, from the server page, so this list does not pull the sim into the page's script. */
  readonly missionNames: Readonly<Record<string, string>>;
}

/**
 * Humans beside the brains: the best verified Drive run on each mission. Live server memory, asked for after mount;
 * nothing is shown while there is no verified run (or the server cannot be reached).
 */
export function ArenaHumans({ missionNames }: ArenaHumansProps) {
  const [humans, setHumans] = useState<Humans | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/arena/humans', { signal: controller.signal, cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: unknown) => setHumans(parseHumans(body)))
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  if (!humans || humans.rows.length === 0) return null;
  const otherBuild = humans.rows.some((row) => !row.sameBuild);
  return (
    <div className="flex flex-col gap-1.5" data-testid="arena-humans">
      <h3 className="rr-label">Humans · best verified run on each mission</h3>
      <ul className="flex flex-col">
        {humans.rows.map((row) => (
          <li key={row.missionId} className="grid grid-cols-[1fr_auto_auto] items-baseline gap-x-3 border-t border-tag py-1.5 first:border-t-0">
            <span className="min-w-0">
              <span className="block truncate font-display text-[13px] font-semibold lg:text-[15px]">
                <span className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ background: 'var(--color-ok)' }} />
                {row.nickname}
              </span>
              <span className="block truncate pl-3.5 font-mono text-[10px] text-muted lg:text-xs">
                {row.missionId}
                {missionNames[row.missionId] ? ` ${missionNames[row.missionId]}` : ''} · <span className={row.sameBuild ? '' : 'text-warn'}>{row.build}</span>
              </span>
            </span>
            <span className={`font-mono text-xs tabular-nums lg:text-sm ${row.result === 'DNF' ? 'text-warn' : ''}`}>{row.result}</span>
            <span className="font-mono text-xs font-semibold tabular-nums lg:text-sm">{row.score}</span>
          </li>
        ))}
      </ul>
      <p className="text-[11px] leading-snug text-muted lg:text-[13px]">
        One player per mission: the best Drive run the server could verify by replaying its inputs and getting the same time and score ({humans.verified} verified
        {humans.rejected > 0 ? `, ${humans.rejected} rejected` : ''} since the server started). Driven on Drive&apos;s seed, not the arena&apos;s three, so not directly comparable with the rows above.
        {otherBuild ? ' A build in amber is not the robot the brains drove.' : ''}
      </p>
    </div>
  );
}
