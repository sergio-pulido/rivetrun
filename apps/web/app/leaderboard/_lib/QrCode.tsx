import qrcode from 'qrcode-generator';

interface QrCodeProps {
  readonly value: string;
  readonly className?: string;
}

const QUIET_ZONE = 2;

/** QR as one SVG path: dark modules on a white plate, so any phone camera reads it. */
export function QrCode({ value, className }: QrCodeProps) {
  const qr = qrcode(0, 'M');
  qr.addData(value);
  qr.make();
  const count = qr.getModuleCount();
  const size = count + QUIET_ZONE * 2;
  const cells: string[] = [];
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (qr.isDark(row, col)) cells.push(`M${col + QUIET_ZONE} ${row + QUIET_ZONE}h1v1h-1z`);
    }
  }
  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label={`QR code for ${value}`}
      className={className}
    >
      <rect width={size} height={size} fill="#ffffff" />
      <path d={cells.join('')} fill="#0f141b" />
    </svg>
  );
}
