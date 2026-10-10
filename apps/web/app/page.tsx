import Link from 'next/link';
import { resolveSiteUrl } from './leaderboard/_lib/siteUrl';
import { PLAY_MISSION } from '@/play/playMission';
import { Bench } from '@/ui/home/Bench';
import { HOME_MISSION, homeCta } from '@/ui/home/cta';
import { EpisodesLogged } from '@/ui/home/EpisodesLogged';
import { Lineup } from '@/ui/home/Lineup';
import { LiveProof } from '@/ui/home/LiveProof';
import { MissionRail } from '@/ui/home/MissionRail';
import { MissionStrip } from '@/ui/home/MissionStrip';
import { OnlyWhen } from '@/ui/home/OnlyWhen';
import { PlayNow, PlayNowPicker } from '@/ui/home/PlayNow';
import { playQrUrl } from '@/ui/home/scan';
import { ScanCard } from '@/ui/home/ScanCard';
import { Tagline } from '@/ui/home/Tagline';
import { AppHeader } from '@/ui/AppHeader';
import { Icon } from '@/ui/Icon';
import { ModeSwitch } from '@/ui/ModeSwitch';

// Three across on a phone: the labels alone, on one line; the icons join them from 1024 px.
const TILE = 'rr-btn rr-btn-secondary !min-h-14 !gap-1.5 whitespace-nowrap !px-1.5 !text-[13px] lg:!text-[15px]';

// Desktop and projector (1024 px and wider): the first screen is a grid of headline and call to action beside the
// robots, with a band of scan code, live figures and missions pinned to its bottom edge. The bench and the full
// mission cards follow below the fold. Phones keep their own first screen: headline, bench, call to action.
// On a tall screen the spare height is shared: a third of it goes above the headline and the robots, the rest above the band.
const LIFT = 'lg:mt-[clamp(0px,calc((100dvh-760px)/3),140px)]';
const FIRST_SCREEN = 'lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:grid-rows-[auto_auto_auto_1fr] lg:gap-x-10 lg:gap-y-4 lg:px-8 lg:pb-3';

export default async function HomePage({ searchParams }: { searchParams: Promise<{ cta?: string | string[] }> }) {
  const cta = homeCta((await searchParams).cta);
  // The same address the big screen's QR uses; null when it is one only this machine can open.
  const scanUrl = playQrUrl(await resolveSiteUrl());
  return (
    <main className="blueprint mx-auto max-w-[430px] lg:max-w-[1360px]">
      <section className={`flex min-h-dvh flex-col gap-[18px] px-5 pb-6 pt-[max(18px,env(safe-area-inset-top))] ${FIRST_SCREEN}`}>
        <AppHeader className="lg:col-span-2" />

        <div className={`contents lg:col-start-1 lg:row-start-2 lg:flex lg:flex-col lg:gap-2.5 ${LIFT}`}>
          <Tagline />
          <p className="hidden text-lg leading-snug text-text-2 lg:block" data-testid="home-line">
            {cta === 'play' ? 'Pick a robot, a brain and a plan. Race it in 30 s.' : 'Straight onto the track with the robot on the bench.'}
          </p>
        </div>

        {/* Phones: the bench is part of the first screen. On a desktop it is mounted below the fold instead. */}
        <div className="rr-rise lg:hidden" style={{ ['--i' as string]: 1 }}>
          <OnlyWhen wide={false}>
            <Bench />
          </OnlyWhen>
        </div>

        <Lineup className={`lg:col-start-2 lg:row-span-2 lg:row-start-2 lg:self-center ${LIFT}`} />

        <nav className="rr-rise mt-auto flex flex-col gap-2.5 lg:col-start-1 lg:row-start-3 lg:mt-0" style={{ ['--i' as string]: 2 }}>
          {/* On /play the agent is picked inside it, so the YOU DRIVE / JEV DRIVES switch has nothing left to say here. */}
          {cta === 'play' ? (
            <PlayNowPicker />
          ) : (
            <>
              <ModeSwitch />
              <PlayNow missionId={HOME_MISSION} />
            </>
          )}
          <div className="grid grid-cols-3 gap-2">
            <Link href="/workshop" className={TILE}>
              <Icon name="wrench" size={16} className="hidden lg:block" />
              Workshop
            </Link>
            <Link href="/race" className={TILE}>
              <Icon name="users" size={16} className="hidden lg:block" />
              Room race
            </Link>
            <Link href="/lab" className={TILE}>
              <Icon name="cpu" size={16} className="hidden lg:block" />
              Lab
            </Link>
          </div>
        </nav>

        {/* The band at the bottom of the first screen, desktop and projector only. */}
        <div className={`hidden lg:col-span-2 lg:row-start-4 lg:grid lg:items-stretch lg:gap-4 lg:self-end ${scanUrl ? 'lg:grid-cols-[auto_minmax(0,1fr)_minmax(0,1.5fr)]' : 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]'}`} data-testid="home-band">
          {scanUrl ? <ScanCard url={scanUrl} /> : null}
          <LiveProof />
          <MissionStrip playMission={PLAY_MISSION} />
        </div>

        <footer className="flex items-center justify-between font-mono text-[11px] font-medium tracking-[1px] text-muted lg:hidden">
          <EpisodesLogged />
          <span>DECISIONS BY JEV</span>
        </footer>
      </section>

      <section className="px-5 pb-[max(28px,env(safe-area-inset-bottom))] lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-start lg:gap-x-10 lg:px-8 lg:pt-6">
        <div className="hidden lg:block">
          <OnlyWhen wide>
            <Bench />
          </OnlyWhen>
        </div>
        <div>
          <h2 className="rr-label mb-2.5">Missions · Room Challenge is 05</h2>
          <MissionRail />
          <p className="mt-6 hidden font-mono text-[11px] font-medium tracking-[1px] text-muted lg:block">DECISIONS BY JEV</p>
        </div>
      </section>
    </main>
  );
}
