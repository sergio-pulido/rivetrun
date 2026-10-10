import type { Simplification } from './simplified';

/** "Simplified": the sim's own sentences on what the game has simplified here. Nothing when there is nothing to say. */
export function SimplifiedNote({ entries, className = '' }: { readonly entries: readonly Simplification[]; readonly className?: string }) {
  if (entries.length === 0) return null;
  return (
    <div className={`flex flex-col gap-1 border-t border-line pt-2 ${className}`} aria-label="Simplified in the game">
      <span className="font-mono text-[9px] font-medium uppercase tracking-[1.5px] text-faint">Simplified in the game</span>
      {entries.map((entry) => (
        <p key={entry.id} className="text-[11px] leading-snug text-muted">
          {entry.sentence}
        </p>
      ))}
    </div>
  );
}
