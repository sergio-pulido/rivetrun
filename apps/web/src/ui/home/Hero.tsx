import Link from 'next/link';
import { Icon } from '@/ui/Icon';
import { WidePicture } from '@/ui/WidePicture';

const RENDER = '/renders/mk2/default_build_hero.png';

/** Desktop and projector only: the MK-II render beside the entry points. Phones keep the bench and do not download it. */
export function Hero({ className = '' }: { readonly className?: string }) {
  return (
    <figure className={`relative hidden overflow-hidden rounded-[18px] border border-[#262B33] bg-panel lg:block ${className}`}>
      <WidePicture src={RENDER} alt="The RivetRun MK-II rover: an orange printed chassis on four off-road wheels, with its controller board and sensors on top" className="absolute inset-0 h-full w-full -translate-y-[6%] scale-[1.32] object-contain" />
      <figcaption className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 bg-gradient-to-t from-ground/90 to-transparent px-5 pb-4 pt-10">
        <span className="flex flex-col gap-1">
          <span className="font-mono text-xs font-medium uppercase tracking-[1.5px] text-orange-soft">RivetRun MK-II</span>
          <span className="text-sm leading-snug text-text-2">3D render of the default build: the robot you can build for real.</span>
        </span>
        <Link href="/workshop/real" className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-[10px] border border-line-3 bg-ground px-3.5 font-display text-sm font-semibold">
          Build it for real
          <Icon name="next" size={16} className="text-orange" />
        </Link>
      </figcaption>
    </figure>
  );
}
