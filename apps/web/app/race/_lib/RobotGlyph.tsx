import type { Build } from '@rivetrun/contracts';

interface RobotGlyphProps {
  readonly build: Build;
  readonly color: string;
  readonly className?: string;
  /** Greyed out: the robot did not finish. */
  readonly wrecked?: boolean;
}

/** Side-on maker robot made of primitives: coloured printed chassis, PCB, LED eye, wheels or tracks. */
export function RobotGlyph({ build, color, className, wrecked = false }: RobotGlyphProps) {
  const tracks = build.locomotion === 'tracks';
  const chunky = build.locomotion === 'offroad_wheels';
  const body = wrecked ? '#566273' : color;
  return (
    <svg viewBox="0 0 64 44" className={className} aria-hidden="true">
      <ellipse cx="32" cy="42" rx="26" ry="2" fill="#000" opacity="0.35" />
      {/* antenna + sensor mast */}
      <rect x="15" y="4" width="2" height="12" fill="#c5cfdb" />
      <circle cx="16" cy="4" r="2.5" fill={wrecked ? '#566273' : '#5ef2ff'} />
      {/* chassis */}
      <rect x="8" y="15" width="48" height="16" rx="4" fill={body} stroke="#0a0e13" strokeWidth="2" />
      <rect x="14" y="11" width="24" height="7" rx="1.5" fill="#1f7a4d" stroke="#0a0e13" strokeWidth="1.5" />
      <rect x="18" y="13" width="5" height="3" fill="#0a0e13" />
      <rect x="27" y="13" width="7" height="3" fill="#d9b23a" />
      {/* face */}
      <rect x="44" y="18" width="10" height="7" rx="2" fill="#0a0e13" />
      <circle cx="50" cy="21.5" r="2" fill={wrecked ? '#566273' : '#5ef2ff'} />
      {tracks ? (
        <g>
          <rect x="5" y="28" width="54" height="13" rx="6.5" fill="#12171e" stroke="#0a0e13" strokeWidth="2" />
          <circle cx="13" cy="34.5" r="3.5" fill="#566273" />
          <circle cx="32" cy="34.5" r="3.5" fill="#566273" />
          <circle cx="51" cy="34.5" r="3.5" fill="#566273" />
        </g>
      ) : (
        <g>
          {[16, 48].map((cx) => (
            <g key={cx}>
              <circle cx={cx} cy="33" r={chunky ? 9 : 7.5} fill="#12171e" stroke="#0a0e13" strokeWidth="2" strokeDasharray={chunky ? '3 2' : undefined} />
              <circle cx={cx} cy="33" r="3" fill="#8494a7" />
            </g>
          ))}
        </g>
      )}
    </svg>
  );
}
