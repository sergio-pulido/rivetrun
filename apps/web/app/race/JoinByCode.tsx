'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { RACE_CODE_LENGTH, RaceCodeSchema } from './_lib/protocol';

/** Typed entry for phones that cannot scan the QR on the big screen. */
export function JoinByCode() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const parsed = RaceCodeSchema.safeParse(code);

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (parsed.success) router.push(`/race/${parsed.data}`);
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-5 px-4 py-6">
      <div>
        <p className="rr-label text-blueprint">Room Race</p>
        <h1 className="mt-2 font-mono text-3xl font-black leading-tight text-safety">Enter the room code</h1>
        <p className="mt-2 text-sm text-slate-300">It is the four letters on the big screen. Everyone races the same track at the same time.</p>
      </div>
      <form onSubmit={submit} className="rr-panel flex flex-col gap-4 p-4">
        <input
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, RACE_CODE_LENGTH))}
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="off"
          autoFocus
          aria-label="Room code"
          placeholder="ABCD"
          className="h-20 w-full rounded-xl border border-slate-line bg-slate-deep text-center font-mono text-5xl font-black tracking-[0.35em] text-safety outline-none placeholder:text-slate-line focus:border-led"
        />
        <button type="submit" disabled={!parsed.success} className="rr-btn rr-btn-primary text-lg">
          Join the room
        </button>
      </form>
      <Link href="/" className="rr-btn rr-btn-secondary">
        Back to home
      </Link>
    </main>
  );
}
