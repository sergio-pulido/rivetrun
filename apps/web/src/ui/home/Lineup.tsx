import Link from 'next/link';
import { Icon } from '@/ui/Icon';
import { WidePicture } from '@/ui/WidePicture';

const RENDER = '/renders/presets/lineup.webp';

/** Desktop and projector only: the four robots a player can pick, rendered from their exact builds. Phones do not download it. */
export function Lineup({ className = '' }: { readonly className?: string }) {
  return (
    <figure className={`hidden flex-col gap-2 lg:flex ${className}`} data-testid="home-lineup">
      <WidePicture src={RENDER} alt="The four robots to pick from: Speedster, Mud Crawler, All-rounder and Deep Diver" className="max-h-[40vh] w-full object-contain" />
      <figcaption className="flex items-center justify-between gap-4">
        <span className="font-mono text-[11px] font-medium uppercase tracking-[1.5px] text-muted">Speedster · Mud Crawler · All-rounder · Deep Diver</span>
        <Link href="/workshop/real" className="flex min-h-10 shrink-0 items-center gap-1.5 rounded-[10px] border border-line-3 bg-ground px-3.5 font-display text-sm font-semibold">
          Build it for real
          <Icon name="next" size={16} className="text-orange" />
        </Link>
      </figcaption>
    </figure>
  );
}
