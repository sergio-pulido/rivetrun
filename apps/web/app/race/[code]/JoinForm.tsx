'use client';

import { NicknameSchema, type Build } from '@rivetrun/contracts';
import { useEffect, useState, type FormEvent } from 'react';
import { useProgressStore } from '@/state/progress';
import { buildName, partsOf } from '@/ui/buildStats';
import { RobotGlyph } from '../_lib/RobotGlyph';

interface JoinFormProps {
  readonly code: string;
  readonly build: Build;
  readonly busy: boolean;
  readonly error: string | null;
  readonly onJoin: (nickname: string) => void;
}

/** Nickname and the robot the player arrives with. The build can still change in the BUILD phase. */
export function JoinForm({ code, build, busy, error, onJoin }: JoinFormProps) {
  const savedNickname = useProgressStore((store) => store.nickname);
  const setSavedNickname = useProgressStore((store) => store.setNickname);
  const [nickname, setNickname] = useState('');
  useEffect(() => {
    if (savedNickname) setNickname((current) => current || savedNickname);
  }, [savedNickname]);

  const parsed = NicknameSchema.safeParse(nickname);
  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (!parsed.success || busy) return;
    setSavedNickname(parsed.data);
    onJoin(parsed.data);
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div>
        <p className="rr-label text-blueprint">Room Race · {code}</p>
        <h1 className="mt-2 font-mono text-3xl font-black leading-tight text-safety">Join the race</h1>
        <p className="mt-1 text-sm text-slate-300">You build it, you drive it. Beat the others, and beat Jev.</p>
      </div>

      <label className="rr-panel flex flex-col gap-2 p-4">
        <span className="rr-label">Nickname</span>
        <input
          value={nickname}
          onChange={(event) => setNickname(event.target.value.slice(0, 16))}
          autoComplete="nickname"
          placeholder="e.g. SolderSam"
          className="h-14 rounded-xl border border-slate-line bg-slate-deep px-4 text-xl font-bold outline-none placeholder:text-slate-500 focus:border-led"
        />
      </label>

      <div className="rr-panel flex items-center gap-3 p-4">
        <RobotGlyph build={build} color="#ff6a13" className="h-16 w-auto shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="rr-label">Your robot</p>
          <p className="mt-1 truncate text-lg font-bold">{buildName(build)}</p>
          <p className="truncate font-mono text-[11px] text-dim">{partsOf(build).map((part) => part.name).join(' · ')}</p>
        </div>
      </div>
      <p className="text-sm text-slate-300">Before the start you get 45 seconds to rebuild it for the track.</p>

      {error ? <p role="alert" className="rounded-lg border border-bad/60 bg-bad/10 px-3 py-2 text-sm text-red-200">{error}</p> : null}

      <button type="submit" disabled={!parsed.success || busy} className="rr-btn rr-btn-primary text-lg">
        {busy ? 'Joining…' : 'Join the race'}
      </button>
    </form>
  );
}
