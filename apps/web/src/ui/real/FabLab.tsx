import Link from 'next/link';
import { Icon } from '@/ui/Icon';
import { priceText } from './RealComponent';
import type { BomItem } from './bom';

interface FabLabProps {
  /** The bill of materials' tools. */
  readonly tools: readonly BomItem[];
  /** Tool key → render, when one exists. */
  readonly renders: Readonly<Record<string, string | null>>;
}

/** The fab lab strip: the tools the build needs, each opening its sheet. */
export function FabLab({ tools, renders }: FabLabProps) {
  if (tools.length === 0) return null;
  return (
    <section className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        <h3 className="rr-label">Fab lab · {tools.length} tools</h3>
        <span className="rr-label !tracking-wider lg:hidden">swipe</span>
      </div>
      <ul className="rr-scroll-x -mx-4 flex gap-2 px-4 pb-1 lg:mx-0 lg:grid lg:grid-cols-[repeat(auto-fill,minmax(140px,1fr))] lg:overflow-visible lg:px-0">
        {tools.map((tool) => (
          <li key={tool.key} className="w-[150px] shrink-0 snap-start lg:w-auto">
            <Link href={`/workshop/real/${tool.key}`} className="flex h-full flex-col gap-1 rounded-[14px] border border-line bg-panel p-2.5 active:bg-panel-2">
              <span className="grid h-[72px] place-items-center overflow-hidden rounded-lg bg-stage">
                {renders[tool.key] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={renders[tool.key] ?? undefined} alt="" className="h-full w-full object-contain" />
                ) : (
                  <Icon name="wrench" size={24} className="text-faint" />
                )}
              </span>
              <span className="line-clamp-2 font-display text-[13px] font-semibold leading-tight">{tool.name}</span>
              {tool.usedFor ? <span className="line-clamp-3 text-[11px] leading-snug text-muted">{tool.usedFor}</span> : null}
              <span className="mt-auto truncate pt-1 font-mono text-[10px] text-text-2">{priceText(tool)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
