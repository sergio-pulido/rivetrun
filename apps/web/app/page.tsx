import Link from 'next/link';
import { Bench } from '@/ui/home/Bench';
import { HOME_MISSION, homeCta } from '@/ui/home/cta';
import { EpisodesLogged } from '@/ui/home/EpisodesLogged';
import { Hero } from '@/ui/home/Hero';
import { MissionRail } from '@/ui/home/MissionRail';
import { PlayNow, PlayNowPicker } from '@/ui/home/PlayNow';
import { Tagline } from '@/ui/home/Tagline';
import { AppHeader } from '@/ui/AppHeader';
import { Icon } from '@/ui/Icon';
import { ModeSwitch } from '@/ui/ModeSwitch';

const TILE = 'rr-btn rr-btn-secondary !min-h-14 !text-[15px] lg:!min-h-16 lg:!text-lg';

// Desktop and projector (1024 px and wider): both sections dissolve into one grid on the page, so the first screen is
// the headline and the entry points beside the MK-II render; the bench and the missions follow below.
const WIDE_PAGE = 'lg:grid lg:max-w-[1360px] lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:grid-rows-[auto_auto_1fr_auto_auto] lg:gap-x-10 lg:gap-y-[18px] lg:px-8 lg:pb-8 lg:pt-[18px]';
const HERO_BOX = 'lg:col-start-2 lg:row-span-3 lg:row-start-2 lg:h-[min(calc(100dvh-124px),720px)] lg:min-h-[440px]';

export default async function HomePage({ searchParams }: { searchParams: Promise<{ cta?: string | string[] }> }) {
  const cta = homeCta((await searchParams).cta);
  return (
    <main className={`blueprint mx-auto max-w-[430px] ${WIDE_PAGE}`}>
      <section className="flex min-h-dvh flex-col gap-[18px] px-5 pb-6 pt-[max(18px,env(safe-area-inset-top))] lg:contents">
        <AppHeader className="lg:col-span-2" />

        <div className="contents lg:col-start-1 lg:row-start-2 lg:block">
          <Tagline />
        </div>

        <div className="rr-rise lg:col-start-1 lg:row-start-5" style={{ ['--i' as string]: 1 }}>
          <Bench />
        </div>

        <Hero className={HERO_BOX} />

        <nav className="rr-rise mt-auto flex flex-col gap-2.5 lg:col-start-1 lg:row-start-3 lg:mt-0 lg:self-end" style={{ ['--i' as string]: 2 }}>
          {/* On /play the agent is picked inside it, so the YOU DRIVE / JEV DRIVES switch has nothing left to say here. */}
          {cta === 'play' ? (
            <PlayNowPicker />
          ) : (
            <>
              <ModeSwitch />
              <PlayNow missionId={HOME_MISSION} />
            </>
          )}
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

        <footer className="flex items-center justify-between font-mono text-[11px] font-medium tracking-[1px] text-muted lg:col-start-1 lg:row-start-4">
          <EpisodesLogged />
          <span>DECISIONS BY JEV</span>
        </footer>
      </section>

      <section className="px-5 pb-[max(28px,env(safe-area-inset-bottom))] lg:col-start-2 lg:row-start-5 lg:p-0">
        <h2 className="rr-label mb-2.5">Missions · Room Challenge is 05</h2>
        <MissionRail />
      </section>
    </main>
  );
}
