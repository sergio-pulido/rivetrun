'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';

const MENU: readonly { href: string; label: string }[] = [
  { href: '/', label: 'Home' },
  { href: '/workshop', label: 'Workshop' },
  { href: '/leaderboard', label: 'Leaderboard' },
  { href: '/race', label: 'Room Race' },
  { href: '/lab', label: 'Lab' },
  { href: '/scenarios', label: 'Lab Missions' },
];

/** The run screen belongs to the HUD while a robot is on track: no header there. */
const HUD_ONLY = /^\/run(\/|$)/;

const isCurrent = (pathname: string, href: string): boolean => (href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`));

function Mark({ size }: { readonly size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden="true" className="shrink-0">
      <circle cx="14" cy="14" r="11" fill="none" stroke="#FF7A1A" strokeWidth="3" />
      <circle cx="14" cy="14" r="4.5" fill="#FF7A1A" />
    </svg>
  );
}

interface LogoProps {
  readonly small?: boolean;
  /** The page's name, set under the wordmark. */
  readonly label?: string;
  readonly className?: string;
}

/** The RivetRun mark and wordmark. Always a link to Home. */
function Logo({ small = false, label, className = '' }: LogoProps) {
  return (
    <Link href="/" aria-label="RivetRun home" className={`flex min-h-11 min-w-0 items-center gap-2 ${className}`}>
      <Mark size={small ? 20 : 24} />
      <span className="flex min-w-0 flex-col justify-center">
        <span className={`font-display font-bold leading-none text-text ${small ? 'text-sm tracking-[2px]' : 'text-[17px] tracking-[2.5px]'}`}>RIVETRUN</span>
        {label ? <span className="mt-1 truncate font-mono text-[9px] font-medium uppercase leading-none tracking-[1.5px] text-muted">{label}</span> : null}
      </span>
    </Link>
  );
}

const CHEVRON = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M15 6l-6 6 6 6" />
  </svg>
);

interface FullHeaderProps {
  readonly variant?: 'full';
  /** Where the back chevron goes. Without it the chevron goes back in history, or Home when there is none. */
  readonly back?: string;
  /** The page's name, shown small under the wordmark. */
  readonly label?: string;
  /** One compact item left of the menu, e.g. the Workshop's budget. */
  readonly right?: ReactNode;
  readonly className?: string;
}

interface LogoHeaderProps {
  readonly variant: 'logo';
  readonly className?: string;
}

export type AppHeaderProps = FullHeaderProps | LogoHeaderProps;

/**
 * The one app header.
 * - "full" (phones): back chevron everywhere but Home, the logo (links Home), and a compact menu:
 *   Home, Workshop, Leaderboard, Room Race. 44 px targets. Renders nothing on /run.
 * - "logo" (big screen): the small logo alone, linking Home, on a transparent background.
 */
export function AppHeader(props: AppHeaderProps) {
  if (props.variant === 'logo') return <Logo small className={props.className} />;
  return <FullHeader {...props} />;
}

function FullHeader({ back, label, right, className = '' }: FullHeaderProps) {
  const pathname = usePathname() ?? '/';
  const router = useRouter();
  const [open, setOpen] = useState(false);

  // Any navigation closes the menu; so does Escape.
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (HUD_ONLY.test(pathname)) return null;
  const home = pathname === '/';

  return (
    <header className={`relative z-30 flex h-11 shrink-0 items-center gap-2 ${className}`}>
      {home ? null : back ? (
        <Link href={back} aria-label="Back" className="rr-iconbtn">
          {CHEVRON}
        </Link>
      ) : (
        <button type="button" aria-label="Back" className="rr-iconbtn" onClick={() => (window.history.length > 1 ? router.back() : router.push('/'))}>
          {CHEVRON}
        </button>
      )}
      <Logo label={label} className="flex-1" />
      {right}
      <button type="button" aria-label="Menu" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((current) => !current)} className={`rr-iconbtn ${open ? 'bg-panel-2' : ''}`}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
        </svg>
      </button>
      {open ? (
        <>
          <button type="button" aria-label="Close menu" tabIndex={-1} onClick={() => setOpen(false)} className="fixed inset-0 z-30 cursor-default bg-ground/60" />
          <nav role="menu" aria-label="RivetRun" className="absolute right-0 top-[52px] z-40 flex w-[220px] flex-col rounded-[14px] border border-line-2 bg-panel p-1.5 shadow-[0_18px_40px_rgb(0_0_0/0.55)]">
            {MENU.map((item) => {
              const current = isCurrent(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  role="menuitem"
                  aria-current={current ? 'page' : undefined}
                  onClick={() => setOpen(false)}
                  className={`flex h-11 items-center justify-between rounded-[10px] px-3 font-display text-[15px] font-semibold uppercase tracking-[1px] ${
                    current ? 'bg-orange-deep text-orange-soft' : 'text-text active:bg-panel-2'
                  }`}
                >
                  {item.label}
                  {current ? <span className="h-1.5 w-1.5 rounded-full bg-orange" /> : null}
                </Link>
              );
            })}
          </nav>
        </>
      ) : null}
    </header>
  );
}
