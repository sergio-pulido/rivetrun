import Link from 'next/link';
import { RACE_CODE_LENGTH } from './_lib/protocol';

interface JoinByCodeProps {
  /** What the player typed last time, when the server rejected it. */
  readonly code?: string;
  readonly error?: string;
}

/**
 * Typed entry for phones that cannot scan the QR on the big screen.
 * A plain GET form with no client code: it works before the page hydrates and with JavaScript off.
 * The server validates the code (app/race/page.tsx) and either redirects to the room or shows the error here.
 */
export function JoinByCode({ code = '', error }: JoinByCodeProps) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-5 px-4 py-6">
      <div>
        <p className="rr-label text-blueprint">Room Race</p>
        <h1 className="mt-2 font-mono text-3xl font-black leading-tight text-safety">Enter the room code</h1>
        <p className="mt-2 text-sm text-slate-300">It is the four letters on the big screen. Everyone races the same track at the same time.</p>
      </div>
      <form method="get" action="/race" className="rr-panel flex flex-col gap-4 p-4">
        <input
          name="code"
          defaultValue={code}
          maxLength={RACE_CODE_LENGTH}
          inputMode="text"
          autoCapitalize="characters"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="go"
          aria-label="Room code"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'race-code-error' : undefined}
          placeholder="ABCD"
          className="h-20 w-full rounded-xl border border-slate-line bg-slate-deep text-center font-mono text-5xl font-black uppercase tracking-[0.35em] text-safety outline-none placeholder:text-slate-line focus:border-led"
        />
        {error ? (
          <p id="race-code-error" role="alert" className="rounded-lg border border-bad/60 bg-bad/10 px-3 py-2 text-sm text-red-200">
            {error}
          </p>
        ) : null}
        <button type="submit" className="rr-btn rr-btn-primary text-lg">
          Join the room
        </button>
      </form>
      <Link href="/" className="rr-btn rr-btn-secondary">
        Back to home
      </Link>
    </main>
  );
}
