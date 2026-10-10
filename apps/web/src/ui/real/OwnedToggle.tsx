import { Icon } from '@/ui/Icon';

interface OwnedToggleProps {
  readonly owned: boolean;
  /** The part's name, for the button's accessible label. */
  readonly name: string;
  readonly onToggle: () => void;
  /** The word under the tick once it is in hand: bought parts are "Have it", printed ones "Printed". */
  readonly doneLabel?: string;
}

/** "My parts" tick on one line of the real-build list: the player already has this one. */
export function OwnedToggle({ owned, name, onToggle, doneLabel = 'Have it' }: OwnedToggleProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={owned}
      aria-label={`I have ${name}`}
      onClick={onToggle}
      className={`flex w-[52px] shrink-0 flex-col items-center justify-center gap-0.5 self-stretch rounded-r-[12px] border-l font-mono text-[8px] font-medium uppercase tracking-[0.5px] ${
        owned ? 'border-ok/40 text-ok' : 'border-[#1E232A] text-faint'
      }`}
    >
      <span className={`grid h-6 w-6 place-items-center rounded-md border ${owned ? 'border-ok bg-ok text-ground' : 'border-line-3'}`}>{owned ? <Icon name="check" size={14} /> : null}</span>
      {owned ? doneLabel : 'Have it?'}
    </button>
  );
}
