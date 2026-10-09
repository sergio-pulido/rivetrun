'use client';

import { BRIEFING_MAX_CHARS, BRIEFING_PRESETS, NicknameSchema, type Build } from '@rivetrun/contracts';
import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { useProgressStore } from '@/state/progress';
import { matchPreset, partsOf } from '@/ui/buildStats';
import { RobotGlyph } from '../_lib/RobotGlyph';

export interface JoinRequest {
  readonly nickname: string;
  readonly briefing: string;
}

interface JoinFormProps {
  readonly code: string;
  readonly build: Build;
  readonly busy: boolean;
  readonly error: string | null;
  readonly onJoin: (request: JoinRequest) => void;
}

/** Nickname, the robot the player already built, and the briefing Jev will drive by. */
export function JoinForm({ code, build, busy, error, onJoin }: JoinFormProps) {
  const savedNickname = useProgressStore((store) => store.nickname);
  const setSavedNickname = useProgressStore((store) => store.setNickname);
  const [nickname, setNickname] = useState('');
  const [briefing, setBriefing] = useState('');
  useEffect(() => {
    if (savedNickname) setNickname((current) => current || savedNickname);
  }, [savedNickname]);

  const parsedNickname = NicknameSchema.safeParse(nickname);
  const preset = matchPreset(build);

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (!parsedNickname.success || busy) return;
    setSavedNickname(parsedNickname.data);
    onJoin({ nickname: parsedNickname.data, briefing: briefing.trim() });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div>
        <p className="rr-label text-blueprint">Room Race · {code}</p>
        <h1 className="mt-2 font-mono text-3xl font-black leading-tight text-safety">Join the race</h1>
        <p className="mt-1 text-sm text-slate-300">Your robot, your briefing. Jev drives. Watch the big screen.</p>
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
          <p className="mt-1 truncate text-lg font-bold">{preset ? preset.name : 'Custom build'}</p>
          <p className="truncate font-mono text-[11px] text-dim">{partsOf(build).map((part) => part.name).join(' · ')}</p>
        </div>
        <Link href="/workshop" className="rr-chip shrink-0">
          Change
        </Link>
      </div>

      <div className="rr-panel flex flex-col gap-3 p-4">
        <div>
          <p className="rr-label">Brief the brain</p>
          <p className="mt-1 text-sm text-slate-300">Tell Jev how to drive. It reads this before every decision.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {BRIEFING_PRESETS.map((preset) => {
            const active = briefing === preset.text;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => setBriefing(active ? '' : preset.text)}
                aria-pressed={active}
                className={`min-h-12 rounded-xl border px-4 text-sm font-bold ${
                  active ? 'border-safety bg-safety text-slate-deep' : 'border-slate-line bg-slate-deep text-slate-200'
                }`}
              >
                {preset.name}
              </button>
            );
          })}
        </div>
        <textarea
          value={briefing}
          onChange={(event) => setBriefing(event.target.value.slice(0, BRIEFING_MAX_CHARS))}
          rows={2}
          placeholder="Or write your own instructions…"
          aria-label="Briefing"
          className="resize-none rounded-xl border border-slate-line bg-slate-deep px-3 py-2 text-sm outline-none placeholder:text-slate-500 focus:border-led"
        />
        <p className="text-right font-mono text-[10px] text-dim">
          {briefing.length}/{BRIEFING_MAX_CHARS}
        </p>
      </div>

      {error ? <p className="rounded-lg border border-bad/60 bg-bad/10 px-3 py-2 text-sm text-red-200">{error}</p> : null}

      <button type="submit" disabled={!parsedNickname.success || busy} className="rr-btn rr-btn-primary text-lg">
        {busy ? 'Joining…' : 'Join the race'}
      </button>
    </form>
  );
}
