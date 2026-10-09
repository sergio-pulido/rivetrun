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
      <section className="rr-panel flex items-center gap-3 border-ok/50 p-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-ok text-slate-deep">
          <Icon name="check" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">
            Logged as {nickname}
            {status.rank !== null ? <span className="text-safety"> · rank #{status.rank}</span> : null}
          </div>
          <div className="font-mono text-[11px] text-dim">Episode saved with all {episode.decisions.length} decisions.</div>
        </div>
        {leaderboard ? (
          <Link href="/leaderboard" className="rr-btn rr-btn-secondary !min-h-11 shrink-0 !rounded-xl !px-3 text-sm">
            Board
          </Link>
        ) : null}
      </section>
    );
  }

  return (
    <form onSubmit={onSubmit} className="rr-panel p-3" noValidate>
      <label htmlFor="nickname" className="rr-label">
        {leaderboard ? 'Put this run on the leaderboard' : 'Log this episode'}
      </label>
      <div className="mt-2 flex gap-2">
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
          className="h-[52px] min-w-0 flex-1 rounded-xl border border-slate-line bg-slate-deep px-3.5 font-mono text-base outline-none placeholder:text-slate-600 focus:border-safety"
        />
        <button type="submit" disabled={status.kind === 'sending'} className="rr-btn rr-btn-primary shrink-0 !px-5">
          {status.kind === 'sending' ? 'Sending…' : 'Submit'}
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
