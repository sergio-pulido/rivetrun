import type { Part } from '@rivetrun/contracts';
import { SimplifiedNote } from '@/ui/honesty/SimplifiedNote';
import { simplifiedForPart } from '@/ui/honesty/simplified';
import { Icon } from '@/ui/Icon';
import { weatherNotesFor } from './partNotes';

/**
 * "In weather": where this part matters when it rains, freezes or goes dark, and what the game has simplified about the
 * part. Nothing for a part the weather leaves alone and that has no simplification of its own.
 */
export function PartWeather({ part }: { readonly part: Part }) {
  const notes = weatherNotesFor(part);
  const simplified = simplifiedForPart(part, notes.length > 0);
  if (notes.length === 0 && simplified.length === 0) return null;
  return (
    <section className="flex flex-col gap-1.5 rounded-[14px] border border-line bg-panel px-3 py-2.5" aria-label="In weather">
      {notes.length > 0 ? (
        <>
          <h2 className="rr-label flex items-center gap-1.5 !text-[#8FB8D6]">
            <Icon name="rain" size={14} />
            In weather
          </h2>
          <ul className="flex flex-col gap-1">
            {notes.map((note) => (
              <li key={note} className="text-xs leading-snug text-text-2">
                {note}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <SimplifiedNote entries={simplified} className={notes.length === 0 ? '!border-t-0 !pt-0' : ''} />
    </section>
  );
}
