import Link from 'next/link';
import type { ReactNode } from 'react';

interface PlaceholderProps {
  title: string;
  note: string;
  children?: ReactNode;
}

/** Scaffold-only page shell. The ui session replaces every screen. */
export function Placeholder({ title, note, children }: PlaceholderProps) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 p-4">
      <header className="flex items-center justify-between">
        <Link href="/" className="font-mono text-sm tracking-widest text-safety">
          RIVETRUN
        </Link>
        <span className="rounded border border-slate-line px-2 py-1 font-mono text-xs text-slate-400">scaffold</span>
      </header>
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="text-sm text-slate-400">{note}</p>
      {children}
    </main>
  );
}
