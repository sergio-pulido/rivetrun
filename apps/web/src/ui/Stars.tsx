import { Icon } from './Icon';

interface StarsProps {
  /** 0–3. */
  readonly count: number;
  readonly size?: number;
  /** Earned stars pop in one after the other. */
  readonly animate?: boolean;
}

export function Stars({ count, size = 20, animate = false }: StarsProps) {
  return (
    <span className="inline-flex items-center gap-1" role="img" aria-label={`${count} of 3 stars`}>
      {[0, 1, 2].map((index) => {
        const earned = index < count;
        return (
          <span
            key={index}
            className={earned ? `text-warn drop-shadow-[0_0_10px_rgb(251_191_36/0.55)] ${animate ? 'rr-pop' : ''}` : 'text-slate-line'}
            style={{ ['--i' as string]: index }}
          >
            <Icon name="star" size={size} />
          </span>
        );
      })}
    </span>
  );
}
