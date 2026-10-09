import Link from 'next/link';
import { Bench } from '@/ui/home/Bench';
import { EpisodesLogged } from '@/ui/home/EpisodesLogged';
import { MissionRail } from '@/ui/home/MissionRail';
import { PlayNow } from '@/ui/home/PlayNow';
import { Tagline } from '@/ui/home/Tagline';
import { AppHeader } from '@/ui/AppHeader';
import { Icon } from '@/ui/Icon';
import { ModeSwitch } from '@/ui/ModeSwitch';

const TILE = 'rr-btn rr-btn-secondary !min-h-14 !text-[15px]';

export default function HomePage() {
  return (
    <main className="blueprint mx-auto max-w-[430px]">
      <section className="flex min-h-dvh flex-col gap-[18px] px-5 pb-6 pt-[max(18px,env(safe-area-inset-top))]">
        <AppHeader />

        <Tagline />

        <div className="rr-rise" style={{ ['--i' as string]: 1 }}>
          <Bench />
        </div>

        <nav className="rr-rise mt-auto flex flex-col gap-2.5" style={{ ['--i' as string]: 2 }}>
          <ModeSwitch />
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
