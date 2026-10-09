import Link from 'next/link';
import { Bench } from '@/ui/home/Bench';
import { EpisodesLogged } from '@/ui/home/EpisodesLogged';
import { MissionRail } from '@/ui/home/MissionRail';
import { PlayNow } from '@/ui/home/PlayNow';
import { Icon } from '@/ui/Icon';

const HEADLINE = 'font-display text-[40px] font-bold leading-[1.02]';
const TILE = 'rr-btn rr-btn-secondary !min-h-14 !text-[15px]';

export default function HomePage() {
  return (
    <main className="blueprint mx-auto max-w-[430px]">
      <section className="flex min-h-dvh flex-col gap-[18px] px-5 pb-6 pt-[max(28px,env(safe-area-inset-top))]">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
              <circle cx="14" cy="14" r="11" fill="none" stroke="#FF7A1A" strokeWidth="3" />
              <circle cx="14" cy="14" r="4.5" fill="#FF7A1A" />
            </svg>
            <span className="font-display text-2xl font-bold tracking-[3px]">RIVETRUN</span>
          </div>
          <Link href="/leaderboard" aria-label="Leaderboard" className="rr-iconbtn bg-panel-2">
            <Icon name="trophy" />
          </Link>
        </header>

        <h1 className="rr-rise mt-1.5 flex flex-col gap-0.5">
          <span className={HEADLINE}>Build the body.</span>
          <span className={`${HEADLINE} text-cyan`}>Brief the brain.</span>
          <span className={`${HEADLINE} text-orange`}>Watch it drive.</span>
        </h1>

        <div className="rr-rise" style={{ ['--i' as string]: 1 }}>
          <Bench />
        </div>

        <nav className="rr-rise mt-auto flex flex-col gap-2.5" style={{ ['--i' as string]: 2 }}>
          <PlayNow />
          <div className="grid grid-cols-2 gap-2.5">
            <Link href="/workshop" className={TILE}>
              <Icon name="wrench" size={18} />
              Workshop
            </Link>
            <Link href="/race" className={TILE}>
              <Icon name="users" size={18} />
              Room Race
            </Link>
          </div>
        </nav>

        <footer className="flex items-center justify-between font-mono text-[11px] font-medium tracking-[1px] text-muted">
          <EpisodesLogged />
          <span>DECISIONS BY JEV</span>
        </footer>
      </section>

      <section className="px-5 pb-[max(28px,env(safe-area-inset-bottom))]">
        <h2 className="rr-label mb-2.5">Missions · Room Challenge is 05</h2>
        <MissionRail />
      </section>
    </main>
  );
}
