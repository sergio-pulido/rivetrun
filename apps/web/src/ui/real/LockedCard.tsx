import Link from 'next/link';
import { Icon } from '@/ui/Icon';

export interface LockedPart {
  readonly key: string;
  readonly name: string;
  readonly manufacturer: string | null;
  readonly scenario: string | null;
  readonly category: string;
  readonly render: string | null;
}

/** A real part the game does not have yet: greyed, locked, readable, with the scenario it is waiting for. Opens its sheet; nothing here can be fitted. */
export function LockedCard({ part }: { readonly part: LockedPart }) {
  return (
    <Link href={`/workshop/real/${part.key}`} aria-label={`${part.name}: coming soon, details`} className="flex h-[166px] flex-col gap-1 rounded-[14px] border border-dashed border-line-3 bg-[#111418] p-2.5 text-muted">
      <span className="flex h-[54px] items-center justify-center opacity-60 grayscale">
        {part.render ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={part.render} alt="" className="h-full object-contain" />
        ) : (
          <Icon name="lock" size={28} />
        )}
      </span>
      <span className="line-clamp-2 font-display text-[14px] font-semibold leading-tight text-text-2">{part.name}</span>
      <span className="truncate font-mono text-[10px]">{part.manufacturer ?? part.category}</span>
      {part.scenario ? (
        <span className="truncate text-xs">
          <span className="font-mono text-[10px] font-medium uppercase tracking-[1px] text-cyan-muted">Needs:</span> {part.scenario}
        </span>
      ) : null}
      <span className="mt-auto flex h-[30px] items-center gap-1.5 font-mono text-[10px] font-medium tracking-[1px]">
        <Icon name="lock" size={12} />
        COMING SOON
      </span>
    </Link>
  );
}
