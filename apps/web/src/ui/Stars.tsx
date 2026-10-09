import { Icon } from './Icon';

interface StarsProps {
  /** 0–3. */
  readonly count: number;
  readonly size?: number;
  /** Earned stars pop in one after the other. */
  readonly animate?: boolean;
}

/** Earned stars are solid orange; the rest are outlines. */
export function Stars({ count, size = 20, animate = false }: StarsProps) {
  return (
    <span className="inline-flex items-center gap-1.5" role="img" aria-label={`${count} of 3 stars`}>
      {[0, 1, 2].map((index) => {
        const earned = index < count;
        return (
          <span key={index} className={earned ? `text-orange ${animate ? 'rr-pop' : ''}` : 'text-line-3'} style={{ ['--i' as string]: index }}>
            <Icon name={earned ? 'star' : 'starOutline'} size={size} />
          </span>
        );
      })}
    </span>
  );
}
