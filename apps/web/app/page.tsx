import Link from 'next/link';
import { DEFAULT_PRESET_ID, PRESETS } from '@rivetrun/sim';

const LINKS = [
  { href: '/run/M1', label: 'Play', primary: true },
  { href: '/run/M5', label: 'Room Challenge', primary: false },
  { href: '/workshop', label: 'Workshop', primary: false },
  { href: '/leaderboard', label: 'Leaderboard', primary: false },
] as const;

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 p-4">
      <div>
        <h1 className="font-mono text-4xl font-black tracking-tight text-safety">RivetRun</h1>
        <p className="mt-2 text-lg">You build the body. AI drives it.</p>
      </div>
      <nav className="flex flex-col gap-3">
        {LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={
              link.primary
                ? 'flex min-h-14 items-center justify-center rounded-lg bg-safety text-lg font-bold text-slate-ink'
                : 'flex min-h-12 items-center justify-center rounded-lg border border-slate-line bg-slate-panel font-semibold'
            }
          >
            {link.label}
          </Link>
        ))}
      </nav>
      <p className="font-mono text-xs text-slate-400">
        Scaffold build · default preset: {PRESETS[DEFAULT_PRESET_ID].name}
      </p>
    </main>
  );
}
