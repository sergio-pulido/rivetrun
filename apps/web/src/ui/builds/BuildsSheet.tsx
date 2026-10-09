'use client';

import { useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { useBuildStore } from '@/state/build';
import { BUILD_NAME_MAX, SAVED_BUILDS_MAX, useSavedBuildsStore, type SavedBuild } from '@/state/savedBuilds';
import { BUDGET_EUR, buildName, buildStats, sameBuild } from '@/ui/buildStats';
import { Icon } from '@/ui/Icon';

const FIELD = 'h-11 min-w-0 flex-1 rounded-[10px] border border-line-3 bg-panel-2 px-3 text-sm outline-none placeholder:text-faint focus:border-orange';
const SMALL = 'h-11 shrink-0 rounded-[10px] border px-3 font-mono text-[11px] font-medium tracking-[1px]';

interface RowProps {
  readonly saved: SavedBuild;
  readonly active: boolean;
  readonly onLoad: () => void;
}

/** One saved build: load it, rename it, or delete it (delete asks once more). */
function Row({ saved, active, onLoad }: RowProps) {
  const rename = useSavedBuildsStore((store) => store.rename);
  const remove = useSavedBuildsStore((store) => store.remove);
  const [draft, setDraft] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stats = buildStats(saved.build);

  const submitRename = (event: FormEvent): void => {
    event.preventDefault();
    if (draft === null) return;
    if (!rename(saved.id, draft)) {
      setError('Pick a name no other build has.');
      return;
    }
    setDraft(null);
    setError(null);
  };

  if (draft !== null) {
    return (
      <li className="flex flex-col gap-1.5 rounded-[14px] border border-line bg-panel-2 p-2">
        <form onSubmit={submitRename} className="flex gap-1.5">
          <label htmlFor={`rename-${saved.id}`} className="sr-only">
            New name for {saved.name}
          </label>
          <input id={`rename-${saved.id}`} autoFocus value={draft} maxLength={BUILD_NAME_MAX} onChange={(event) => setDraft(event.target.value)} className={FIELD} />
          <button type="submit" className={`${SMALL} border-orange text-orange-soft`}>
            SAVE
          </button>
          <button type="button" onClick={() => setDraft(null)} className={`${SMALL} border-line-3 text-muted`}>
            CANCEL
          </button>
        </form>
        {error ? <p className="px-1 text-xs text-warn">{error}</p> : null}
      </li>
    );
  }

  return (
    <li className={`flex items-center gap-1.5 rounded-[14px] border p-2 ${active ? 'border-orange bg-orange-deep' : 'border-line bg-panel-2'}`}>
      <button type="button" onClick={onLoad} className="flex min-h-11 min-w-0 flex-1 flex-col justify-center px-1 text-left" aria-label={`Load ${saved.name}`}>
        <span className="truncate font-display text-[15px] font-semibold leading-tight">{saved.name}</span>
        <span className="truncate font-mono text-[10px] text-muted">
          {buildName(saved.build)} · €{stats.costEur}
          {stats.overBudgetEur > 0 ? ` · over €${BUDGET_EUR}` : ''} · {stats.massKg.toFixed(1)} kg{active ? ' · on the bench' : ''}
        </span>
      </button>
      {confirming ? (
        <>
          <button type="button" onClick={() => remove(saved.id)} className={`${SMALL} border-bad text-bad`}>
            DELETE
          </button>
          <button type="button" onClick={() => setConfirming(false)} className={`${SMALL} border-line-3 text-muted`}>
            KEEP
          </button>
        </>
      ) : (
        <>
          <button type="button" onClick={() => setDraft(saved.name)} className={`${SMALL} border-line-3 text-text-2`} aria-label={`Rename ${saved.name}`}>
            RENAME
          </button>
          <button type="button" onClick={() => setConfirming(true)} className="rr-iconbtn text-muted" aria-label={`Delete ${saved.name}`}>
            <Icon name="close" size={16} />
          </button>
        </>
      )}
    </li>
  );
}

/** "My builds": save the robot on the bench under a name; load, rename or delete the saved ones. Kept on this device. */
export function BuildsSheet({ onClose }: { readonly onClose: () => void }) {
  const build = useBuildStore((store) => store.build);
  const setBuild = useBuildStore((store) => store.setBuild);
  const builds = useSavedBuildsStore((store) => store.builds);
  const save = useSavedBuildsStore((store) => store.save);
  const [name, setName] = useState('');
  const [note, setNote] = useState<string | null>(null);

  const onSave = (event: FormEvent): void => {
    event.preventDefault();
    const outcome = save(name, build);
    if (!outcome.ok) {
      setNote(outcome.reason === 'name' ? 'Give the build a name first.' : `That is ${SAVED_BUILDS_MAX} builds. Delete one, or save over a name you already have.`);
      return;
    }
    setNote(outcome.replaced ? 'Saved over the build with that name.' : 'Saved.');
    setName('');
  };

  // On <body>, so an animated ancestor cannot trap the fixed overlay.
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="My builds" className="fixed inset-0 z-50 flex items-end justify-center">
      <button type="button" aria-label="Close" tabIndex={-1} onClick={onClose} className="absolute inset-0 cursor-default bg-ground/85 backdrop-blur-sm" />
      <div className="rr-rise relative flex max-h-[86dvh] w-full max-w-[430px] flex-col gap-3 rounded-t-[22px] border border-b-0 border-line-2 bg-panel px-4 pb-[max(18px,env(safe-area-inset-bottom))] pt-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-bold uppercase tracking-[2px]">My builds</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rr-iconbtn !h-9 !w-9">
            <Icon name="close" size={16} />
          </button>
        </div>

        <form onSubmit={onSave} className="flex flex-col gap-1.5">
          <label htmlFor="build-name" className="rr-label">
            Save the robot on the bench
          </label>
          <div className="flex gap-1.5">
            <input
              id="build-name"
              value={name}
              maxLength={BUILD_NAME_MAX}
              onChange={(event) => {
                setName(event.target.value);
                setNote(null);
              }}
              placeholder="Name it"
              autoComplete="off"
              className={FIELD}
            />
            <button type="submit" className="rr-btn rr-btn-primary !min-h-11 shrink-0 !rounded-[10px]">
              Save
            </button>
          </div>
          {note ? (
            <p role="status" className="px-1 text-xs text-muted">
              {note}
            </p>
          ) : null}
        </form>

        {builds.length === 0 ? (
          <p className="rounded-[14px] border border-dashed border-line-3 px-3 py-4 text-center text-[13px] text-muted">No saved builds yet. They stay on this device.</p>
        ) : (
          <ul className="flex min-h-0 flex-col gap-1.5 overflow-y-auto">
            {builds.map((saved) => (
              <Row
                key={saved.id}
                saved={saved}
                active={sameBuild(saved.build, build)}
                onLoad={() => {
                  setBuild(saved.build);
                  onClose();
                }}
              />
            ))}
          </ul>
        )}
        <p className="font-mono text-[10px] text-faint">
          {builds.length} of {SAVED_BUILDS_MAX} · saved on this device only
        </p>
      </div>
    </div>,
    document.body,
  );
}
