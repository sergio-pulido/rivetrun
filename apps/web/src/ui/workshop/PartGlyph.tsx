import type { ReactNode } from 'react';

const WHEEL = (cx: number, dashed: boolean, r = 13): ReactNode => (
  <g key={cx}>
    <circle cx={cx} cy="24" r={r} fill="#17191D" stroke="#2C3038" strokeWidth="5" strokeDasharray={dashed ? '5 3' : undefined} />
    <circle cx={cx} cy="24" r="4.5" fill="#8A929C" />
  </g>
);

const PINS = (y: number, xs: readonly number[]): ReactNode => xs.map((x) => <rect key={x} x={x} y={y} width="3" height="3" fill="#E3B341" />);

/** Flat part drawings in the mockup palette, on a 90 × 48 sheet. */
const GLYPHS: Readonly<Record<string, ReactNode>> = {
  wheels: [WHEEL(27, false), WHEEL(63, false)],
  offroad_wheels: [WHEEL(26, true, 15), WHEEL(64, true, 15)],
  tracks: (
    <>
      <rect x="8" y="10" width="74" height="28" rx="14" fill="#17191D" stroke="#2C3038" strokeWidth="5" strokeDasharray="4 3" />
      <circle cx="22" cy="24" r="6" fill="#8A929C" />
      <circle cx="45" cy="24" r="4" fill="#5B6470" />
      <circle cx="68" cy="24" r="6" fill="#8A929C" />
    </>
  ),
  motor_light: (
    <>
      <rect x="14" y="14" width="46" height="20" rx="3" fill="#E3B341" />
      <rect x="20" y="14" width="3" height="20" fill="#B88A1E" />
      <rect x="60" y="17" width="10" height="14" rx="2" fill="#D9DDE2" />
      <rect x="70" y="22" width="12" height="4" rx="1" fill="#F2F4F6" />
    </>
  ),
  motor_torque: (
    <>
      <rect x="10" y="12" width="36" height="24" rx="4" fill="#5B6470" />
      <rect x="46" y="10" width="22" height="28" rx="3" fill="#C9CED6" stroke="#8A929C" strokeWidth="2" />
      <rect x="68" y="21" width="14" height="6" rx="1" fill="#E3B341" />
      <circle cx="52" cy="16" r="1.5" fill="#5B6470" />
      <circle cx="62" cy="32" r="1.5" fill="#5B6470" />
    </>
  ),
  battery_small: (
    <>
      <rect x="20" y="16" width="46" height="16" rx="8" fill="#3B82C4" />
      <rect x="66" y="21" width="5" height="6" rx="1" fill="#D9DDE2" />
      <rect x="28" y="16" width="4" height="16" fill="#2A5E91" />
    </>
  ),
  battery_large: (
    <>
      <rect x="16" y="8" width="54" height="14" rx="7" fill="#3B82C4" />
      <rect x="16" y="26" width="54" height="14" rx="7" fill="#3B82C4" />
      <rect x="70" y="12" width="5" height="6" rx="1" fill="#D9DDE2" />
      <rect x="70" y="30" width="5" height="6" rx="1" fill="#D9DDE2" />
      <rect x="26" y="8" width="4" height="32" fill="#2A5E91" />
    </>
  ),
  ultrasonic: (
    <>
      <rect x="2" y="8" width="86" height="32" rx="3" fill="#2F6FD6" />
      <circle cx="24" cy="24" r="12" fill="#C9CED6" stroke="#8A929C" strokeWidth="3" />
      <circle cx="66" cy="24" r="12" fill="#C9CED6" stroke="#8A929C" strokeWidth="3" />
      <circle cx="24" cy="24" r="5" fill="#9AA3AE" />
      <circle cx="66" cy="24" r="5" fill="#9AA3AE" />
      <rect x="40" y="11" width="10" height="5" rx="1" fill="#D9DDE2" />
    </>
  ),
  imu: (
    <>
      <rect x="16" y="8" width="58" height="32" rx="3" fill="#7B4FD6" />
      <rect x="36" y="16" width="18" height="16" rx="2" fill="#141518" />
      <circle cx="22" cy="14" r="2.5" fill="#E3B341" />
      <circle cx="68" cy="14" r="2.5" fill="#E3B341" />
      {PINS(35, [22, 29, 36, 43, 50, 57, 64])}
    </>
  ),
  camera: (
    <>
      <rect x="20" y="4" width="50" height="32" rx="3" fill="#2E9D63" />
      <rect x="34" y="9" width="22" height="22" rx="3" fill="#141518" />
      <circle cx="45" cy="20" r="7" fill="#22303C" stroke="#4B6275" strokeWidth="2" />
      <circle cx="43" cy="18" r="2" fill="#8FB8D6" />
      <rect x="32" y="36" width="26" height="10" fill="#D8B26A" />
    </>
  ),
  moisture_probe: (
    <>
      <rect x="8" y="14" width="26" height="20" rx="3" fill="#141518" stroke="#2E9D63" strokeWidth="2" />
      {PINS(22, [14, 20, 26])}
      <rect x="34" y="15" width="48" height="6" rx="3" fill="#D8B26A" />
      <rect x="34" y="27" width="48" height="6" rx="3" fill="#D8B26A" />
    </>
  ),
  scout_drone: (
    <>
      <line x1="10" y1="18" x2="80" y2="18" stroke="#5B6470" strokeWidth="4" />
      <ellipse cx="14" cy="12" rx="13" ry="3" fill="#8A929C" />
      <ellipse cx="76" cy="12" rx="13" ry="3" fill="#8A929C" />
      <rect x="32" y="15" width="26" height="14" rx="5" fill="#23272E" stroke="#3FD0E0" strokeWidth="1.5" />
      <circle cx="45" cy="34" r="5" fill="#141518" stroke="#4B6275" strokeWidth="2" />
    </>
  ),
  winch: (
    <>
      <rect x="14" y="30" width="44" height="6" rx="2" fill="#FF7A1A" />
      <rect x="20" y="10" width="6" height="22" rx="1" fill="#5B6470" />
      <rect x="46" y="10" width="6" height="22" rx="1" fill="#5B6470" />
      <rect x="26" y="13" width="20" height="16" rx="2" fill="#C9CED6" />
      <path d="M26 17h20M26 21h20M26 25h20" stroke="#8A929C" strokeWidth="1.5" />
      <path d="M52 21h18a6 6 0 1 1-6 6" fill="none" stroke="#D9DDE2" strokeWidth="2.5" strokeLinecap="round" />
    </>
  ),
  waterproof_case: (
    <>
      <rect x="16" y="14" width="58" height="26" rx="4" fill="#23272E" stroke="#4B6275" strokeWidth="2" />
      <rect x="13" y="8" width="64" height="9" rx="3" fill="#8FB8D6" opacity="0.85" />
      <rect x="24" y="15" width="6" height="8" rx="1" fill="#FF7A1A" />
      <rect x="60" y="15" width="6" height="8" rx="1" fill="#FF7A1A" />
      <circle cx="45" cy="29" r="4" fill="none" stroke="#3FD0E0" strokeWidth="1.5" />
    </>
  ),
  bumper: (
    <>
      <path d="M14 14h50a14 10 0 0 1 0 20H14z" fill="#FF7A1A" />
      <path d="M24 14l-8 20M38 14l-8 20M52 14l-8 20M66 15l-8 19" stroke="#160B03" strokeWidth="4" opacity="0.55" />
      <rect x="8" y="18" width="8" height="12" rx="1" fill="#5B6470" />
    </>
  ),
};

interface PartGlyphProps {
  readonly id: string;
  readonly width?: number;
  readonly className?: string;
}

export function PartGlyph({ id, width = 96, className }: PartGlyphProps) {
  return (
    <svg viewBox="0 0 90 48" width={width} aria-hidden="true" className={className}>
      {GLYPHS[id] ?? <rect x="20" y="12" width="50" height="24" rx="4" fill="#23272E" stroke="#3A414C" strokeWidth="2" />}
    </svg>
  );
}
