import type { ReactNode } from 'react';

const PATHS = {
  play: <path d="M7 4.5v15l13-7.5z" fill="currentColor" stroke="none" />,
  back: <path d="M15 5l-7 7 7 7" />,
  next: <path d="M9 5l7 7-7 7" />,
  wrench: <path d="M14.5 6.5a4 4 0 0 0-5.3 5.1L4 16.8 7.2 20l5.2-5.2a4 4 0 0 0 5.1-5.3l-2.6 2.6-2.2-.6-.6-2.2z" />,
  trophy: (
    <>
      <path d="M8 4h8v5a4 4 0 0 1-8 0z" />
      <path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20h7M10 17h4" />
    </>
  ),
  flag: <path d="M6 21V4M6 5h11l-2.5 3.5L17 12H6" />,
  bolt: <path d="M13 3L5 13.5h6L10 21l8-10.5h-6z" />,
  lock: (
    <>
      <rect x="5.5" y="10.5" width="13" height="9.5" rx="2" />
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
    </>
  ),
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  retry: <path d="M19 12a7 7 0 1 1-2.3-5.2M19 4v4h-4" />,
  share: (
    <>
      <path d="M12 15V4M8 7.5L12 4l4 3.5" />
      <path d="M6 11v8h12v-8" />
    </>
  ),
  download: (
    <>
      <path d="M12 4v11M8 11.5l4 3.5 4-3.5" />
      <path d="M5 19.5h14" />
    </>
  ),
  eye: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="2.8" />
    </>
  ),
  warn: (
    <>
      <path d="M12 4L2.8 19.5h18.4z" />
      <path d="M12 10v4.5M12 17.2v.3" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="3.8" />
      <path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8" />
    </>
  ),
  rain: (
    <>
      <path d="M7 14.5a4 4 0 0 1 .6-7.9 5 5 0 0 1 9.6 1.2 3.4 3.4 0 0 1-.2 6.7z" />
      <path d="M8.5 17.5l-1 3M12.5 17.5l-1 3M16.5 17.5l-1 3" />
    </>
  ),
  cold: <path d="M12 2.5v19M4 7l16 10M20 7L4 17M9.5 4l2.5 2 2.5-2M9.5 20l2.5-2 2.5 2" />,
  dice: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="3.5" />
      <path d="M8.5 8.5v.1M15.5 8.5v.1M12 12v.1M8.5 15.5v.1M15.5 15.5v.1" strokeWidth="2.6" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8.5" r="3" />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0M15.5 5.8a3 3 0 0 1 0 5.6M17 14.2a5.5 5.5 0 0 1 3.5 4.8" />
    </>
  ),
  star: <path d="M12 2.8l2.8 6 6.5.8-4.8 4.5 1.3 6.5L12 17.3l-5.8 3.3 1.3-6.5L2.7 9.6l6.5-.8z" fill="currentColor" stroke="none" />,
  wheel: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M12 3.5v6M12 14.5v6M3.5 12h6M14.5 12h6" />
    </>
  ),
  motor: (
    <>
      <rect x="4" y="7.5" width="12" height="9" rx="2" />
      <path d="M16 12h4.5M7.5 7.5v9M11 7.5v9" />
    </>
  ),
  battery: (
    <>
      <rect x="3.5" y="7.5" width="15" height="9" rx="2" />
      <path d="M20.5 10.5v3M7 10.5v3M10.5 10.5v3" />
    </>
  ),
  sensor: (
    <>
      <circle cx="12" cy="12" r="2" />
      <path d="M7.5 7.5a6.4 6.4 0 0 0 0 9M16.5 7.5a6.4 6.4 0 0 1 0 9M4.6 4.6a10.5 10.5 0 0 0 0 14.8M19.4 4.6a10.5 10.5 0 0 1 0 14.8" />
    </>
  ),
  extra: (
    <>
      <path d="M12 3l7.5 3v5.5c0 4.5-3.2 7.8-7.5 9.5-4.3-1.7-7.5-5-7.5-9.5V6z" />
      <path d="M12 8.5v6M9 11.5h6" />
    </>
  ),
  cpu: (
    <>
      <rect x="6.5" y="6.5" width="11" height="11" rx="2" />
      <path d="M10 2.8v3.7M14 2.8v3.7M10 17.5v3.7M14 17.5v3.7M2.8 10h3.7M2.8 14h3.7M17.5 10h3.7M17.5 14h3.7" />
    </>
  ),
} as const satisfies Record<string, ReactNode>;

export type IconName = keyof typeof PATHS;

interface IconProps {
  readonly name: IconName;
  readonly size?: number;
  readonly className?: string;
}

/** Hand-drawn 24 px stroke icons. Colour follows the text colour. */
export function Icon({ name, size = 20, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {PATHS[name]}
    </svg>
  );
}
