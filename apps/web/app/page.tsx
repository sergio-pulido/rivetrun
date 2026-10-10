import Link from 'next/link';
import { resolveSiteUrl } from './leaderboard/_lib/siteUrl';
import { PLAY_MISSION } from '@/play/playMission';
import { HOME_MISSION, homeCta } from '@/ui/home/cta';
import { EpisodesLogged } from '@/ui/home/EpisodesLogged';
import { LiveProof } from '@/ui/home/LiveProof';
import { Missions } from '@/ui/home/Missions';
import { PlayNow, PlayNowPicker } from '@/ui/home/PlayNow';
import { playQrUrl } from '@/ui/home/scan';
import { ScanCard } from '@/ui/home/ScanCard';
import { Tagline } from '@/ui/home/Tagline';
import { VehicleCarousel } from '@/ui/home/VehicleCarousel';
import { AppHeader } from '@/ui/AppHeader';
import { Icon } from '@/ui/Icon';
import { ModeSwitch } from '@/ui/ModeSwitch';

// Three across on a phone: the labels alone, on one line; the icons join them from 1024 px.
const TILE = 'rr-btn rr-btn-secondary !min-h-14 !gap-1.5 whitespace-nowrap !px-1.5 !text-[13px] lg:!text-[15px]';

// Desktop and projector (1024 px and wider): headline and call to action beside the vehicle carousel, and right under
// them a band with the scan code, the live figures and the missions. Nothing on Home is shown twice, and nothing
// that matters is below the first screen. Phones stack the same pieces; the missions are a row to swipe.
const FIRST_SCREEN = 'lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:content-start lg:gap-x-10 lg:gap-y-4 lg:px-8 lg:pb-3';
// On a tall screen the content sits lower, about centred, instead of leaving all the spare height at the bottom.
const LIFT = 'lg:mt-[clamp(0px,calc((100dvh-740px)/2),200px)]';

export default async function HomePage({ searchParams }: { searchParams: Promise<{ cta?: string | string[] }> }) {
  const cta = homeCta((await searchParams).cta);
  // The same address the big screen's QR uses; null when it is one only this machine can open.
  const scanUrl = playQrUrl(await resolveSiteUrl());
  return (
    <main className="blueprint mx-auto max-w-[430px] lg:max-w-[1360px]">
      <section className={`flex min-h-dvh flex-col gap-[18px] px-5 pb-[max(28px,env(safe-area-inset-bottom))] pt-[max(18px,env(safe-area-inset-top))] ${FIRST_SCREEN}`}>
        <AppHeader className="lg:col-span-2" />

        <div className={`contents lg:col-start-1 lg:row-start-2 lg:flex lg:flex-col lg:gap-2.5 ${LIFT}`}>
          <Tagline />
          <p className="hidden text-lg leading-snug text-text-2 lg:block" data-testid="home-line">
            {cta === 'play' ? 'Pick a robot, a brain and a plan. Race it in 30 s.' : 'Straight onto the track with the robot on the bench.'}
          </p>
        </div>

        <VehicleCarousel cta={cta} className={`lg:col-start-2 lg:row-span-2 lg:row-start-2 lg:self-center ${LIFT}`} />

        <nav className="rr-rise flex flex-col gap-2.5 lg:col-start-1 lg:row-start-3" style={{ ['--i' as string]: 2 }}>
          {/* On /play the agent is picked inside it, so the YOU DRIVE / JEV DRIVES switch has nothing left to say here. */}
          {cta === 'play' ? (
            <PlayNowPicker missionId={PLAY_MISSION} />
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

        <footer className="flex items-center justify-between font-mono text-[11px] font-medium tracking-[1px] text-muted lg:hidden">
          <EpisodesLogged />
          <span>DECISIONS BY JEV</span>
        </footer>

        {/* The band: scan code and live figures on a desktop, and the one missions list everywhere. */}
        <div className={`flex flex-col lg:col-span-2 lg:row-start-4 lg:grid lg:items-stretch lg:gap-4 ${scanUrl ? 'lg:grid-cols-[auto_minmax(0,1fr)_minmax(0,2fr)]' : 'lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]'}`} data-testid="home-band">
          {scanUrl ? <ScanCard url={scanUrl} /> : null}
          <LiveProof />
          <Missions playMission={PLAY_MISSION} className="lg:rounded-[14px] lg:border lg:border-line lg:bg-panel lg:p-3" />
        </div>
      </section>
    </main>
  );
}
