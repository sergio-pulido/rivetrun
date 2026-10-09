import Link from 'next/link';
import { MISSIONS } from '@rivetrun/sim';
import { EpisodesLogged } from '@/ui/home/EpisodesLogged';
import { HeroRobot } from '@/ui/home/HeroRobot';
import { MissionRail } from '@/ui/home/MissionRail';
import { Icon, type IconName } from '@/ui/Icon';
import { PointsChip } from '@/ui/PointsChip';

const TILES: readonly { href: string; label: string; note: string; icon: IconName }[] = [
  { href: '/workshop', label: 'Workshop', note: 'Swap parts', icon: 'wrench' },
  { href: '/leaderboard', label: 'Leaderboard', note: 'Top 20', icon: 'trophy' },
];

const ROOM = MISSIONS.M5;

const FIRST = MISSIONS.M1;
const FIRST_LENGTH_M = FIRST.track.segments.reduce((sum, segment) => sum + segment.lengthM, 0);

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-4 pb-[max(20px,env(safe-area-inset-bottom))] pt-[max(14px,env(safe-area-inset-top))]">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-safety text-slate-deep shadow-[0_2px_0_var(--color-safety-lo)]">
            <Icon name="cpu" size={17} />
          </span>
          <span className="font-mono text-sm font-bold tracking-[0.28em]">
            RIVET<span className="text-safety">RUN</span>
          </span>
        </div>
        <PointsChip />
      </header>

      <div className="rr-rise mt-2" style={{ ['--i' as string]: 0 }}>
        <HeroRobot />
      </div>

      <section className="rr-rise mt-1" style={{ ['--i' as string]: 1 }}>
        <h1 className="text-[34px] font-bold leading-[1.02] tracking-tight">
          You build the body.
          <br />
          <span className="text-safety">AI drives it.</span>
        </h1>
        <p className="mt-2.5 text-[15px] leading-snug text-slate-300">
          Bolt a robot together from maker parts. An AI decision model pilots it, and you watch every decision it makes.
        </p>
      </section>

      <nav className="mt-5 flex flex-col gap-3">
        <Link
          href={`/run/${FIRST.id}`}
          className="rr-btn rr-btn-primary rr-sheen rr-rise !min-h-[68px] !justify-between !rounded-2xl !px-5"
          style={{ ['--i' as string]: 2 }}
        >
          <span className="flex flex-col items-start">
            <span className="text-2xl font-bold leading-none tracking-tight">Play</span>
            <span className="mt-1.5 font-mono text-[11px] font-medium leading-none opacity-75">{FIRST.id} · {FIRST.name.toUpperCase()} · {FIRST_LENGTH_M} M</span>
          </span>
          <span className="grid h-11 w-11 place-items-center rounded-full bg-slate-deep text-safety">
            <Icon name="play" size={22} />
          </span>
        </Link>

        <Link
          href={`/brief/${ROOM.id}`}
          className="rr-btn rr-btn-secondary rr-rise !min-h-[64px] !justify-start !gap-3.5 !rounded-2xl !px-4"
          style={{ ['--i' as string]: 3 }}
        >
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-safety/15 text-safety">
            <Icon name="users" size={22} />
          </span>
          <span className="flex min-w-0 flex-1 flex-col items-start">
            <span className="text-[17px] font-semibold leading-none">{ROOM.name}</span>
            <span className="mt-1.5 font-mono text-[10px] font-normal uppercase leading-none tracking-wider text-dim">
              {ROOM.id} · {ROOM.weather} · same seed for everyone
            </span>
          </span>
          <span className="text-dim">
            <Icon name="next" size={18} />
          </span>
        </Link>

        <div className="rr-rise grid grid-cols-2 gap-3" style={{ ['--i' as string]: 4 }}>
          {TILES.map((tile) => (
            <Link key={tile.href} href={tile.href} className="rr-btn rr-btn-secondary !min-h-[56px] !justify-start !gap-3 !px-3.5">
              <span className="text-safety">
                <Icon name={tile.icon} size={22} />
              </span>
              <span className="flex flex-col items-start">
                <span className="text-[15px] font-semibold leading-none">{tile.label}</span>
                <span className="mt-1.5 font-mono text-[9px] font-normal uppercase leading-none tracking-wider text-dim">{tile.note}</span>
              </span>
            </Link>
          ))}
        </div>
      </nav>

      <div className="rr-rise mt-4" style={{ ['--i' as string]: 5 }}>
        <EpisodesLogged />
      </div>

      <section className="rr-rise mt-6" style={{ ['--i' as string]: 6 }}>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="rr-label">Missions</h2>
          <span className="rr-label !tracking-wider">swipe</span>
        </div>
        <MissionRail />
      </section>

      <footer className="mt-auto pt-6 text-center">
        <div className="rr-hazard mx-auto h-1.5 w-24 rounded-full opacity-80" />
        <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.2em] text-dim">Today a game. Tomorrow a benchmark.</p>
      </footer>
    </main>
  );
}
