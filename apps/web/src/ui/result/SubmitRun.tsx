'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { ApiErrorSchema, NicknameSchema, SubmitRunResponseSchema, type Episode } from '@rivetrun/contracts';
import { useProgressStore } from '@/state/progress';
import { Icon } from '@/ui/Icon';

type Status = { kind: 'idle' } | { kind: 'sending' } | { kind: 'error'; message: string } | { kind: 'done'; rank: number | null };

async function submit(nickname: string, episode: Episode): Promise<Status> {
  try {
    const response = await fetch('/api/runs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ nickname, episode }),
    });
    const body: unknown = await response.json();
    if (!response.ok) {
      const error = ApiErrorSchema.safeParse(body);
      return { kind: 'error', message: error.success ? error.data.error : `The server said ${response.status}.` };
    }
    const parsed = SubmitRunResponseSchema.safeParse(body);
    return { kind: 'done', rank: parsed.success ? (parsed.data.rank ?? null) : null };
  } catch {
    return { kind: 'error', message: 'Could not reach the server. Try again.' };
  }
}

/** Nickname + Submit: logs the episode and puts the run on the mission's board. */
export function SubmitRun({ episode, leaderboard }: { readonly episode: Episode; readonly leaderboard: boolean }) {
  const saved = useProgressStore((store) => store.nickname);
  const setNickname = useProgressStore((store) => store.setNickname);
  const [draft, setDraft] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const nickname = draft ?? saved;

  const onSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    const parsed = NicknameSchema.safeParse(nickname);
    if (!parsed.success) {
      setStatus({ kind: 'error', message: 'Use 1 to 16 letters, numbers, spaces or _ . -' });
      return;
    }
    setNickname(parsed.data);
    setStatus({ kind: 'sending' });
    setStatus(await submit(parsed.data, episode));
  };

  if (status.kind === 'done') {
    return (
      <section className="flex h-12 items-center gap-2.5 rounded-xl border border-cyan-line bg-cyan-deep px-3">
        <Icon name="check" size={18} className="shrink-0 text-cyan" />
        <span className="min-w-0 flex-1 truncate font-mono text-[13px]">
          {nickname}
          {status.rank !== null ? <span className="text-cyan"> · rank #{status.rank}</span> : null}
          <span className="text-cyan-muted"> · {episode.decisions.length} decisions logged</span>
        </span>
        {leaderboard ? (
          <Link href="/leaderboard" className="shrink-0 font-mono text-[11px] font-medium tracking-[1px] text-orange-soft">
            BOARD
          </Link>
        ) : null}
      </section>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <div className="flex gap-2">
        <label htmlFor="nickname" className="sr-only">
          Nickname
        </label>
        <input
          id="nickname"
          name="nickname"
          value={nickname}
          onChange={(event) => {
            setDraft(event.target.value);
            if (status.kind === 'error') setStatus({ kind: 'idle' });
          }}
          maxLength={16}
          autoComplete="nickname"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="nickname"
          className="h-12 min-w-0 flex-1 rounded-xl border border-line-3 bg-panel-2 px-3 font-mono text-sm outline-none placeholder:text-faint focus:border-orange"
        />
        <button type="submit" disabled={status.kind === 'sending'} className="rr-btn rr-btn-primary !min-h-12 shrink-0 !rounded-xl">
          {status.kind === 'sending' ? 'Sending' : 'Submit'}
        </button>
      </div>
      {status.kind === 'error' ? (
        <p role="alert" className="mt-2 text-[13px] text-bad">
          {status.message}
        </p>
      ) : null}
    </form>
  );
}
