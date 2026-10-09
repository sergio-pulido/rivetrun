interface MeterProps {
  /** 0–1. */
  readonly fill: number;
  readonly color: string;
  readonly className?: string;
}

export function Meter({ fill, color, className }: MeterProps) {
  const width = `${Math.min(100, Math.max(0, fill * 100))}%`;
  return (
    <div className={`rr-meter ${className ?? ''}`}>
      <span style={{ width, backgroundColor: color }} />
    </div>
  );
}
