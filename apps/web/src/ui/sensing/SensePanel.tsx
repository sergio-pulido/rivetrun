'use client';

import { useMemo } from 'react';
import type { Build } from '@rivetrun/contracts';
import { Icon } from '@/ui/Icon';
import { sensing } from './sensing';

/**
 * "What your robot can sense", and what it cannot. Every brain that drives this build (Jev, the built-in driver,
 * the hints on the HUD) knows only this: what the fitted sensors report, plus the core kit.
 */
export function SensePanel({ build }: { readonly build: Build }) {
  const { core, can, cannot } = useMemo(() => sensing(build), [build]);
  return (
    <section className="rr-card flex flex-col gap-2.5 p-3" aria-label="What your robot can sense">
      <div className="flex flex-col gap-0.5">
        <h3 className="rr-label !text-cyan">What your robot can sense</h3>
        <span className="text-[11px] leading-snug text-muted">Whoever drives it, Jev or the built-in driver, knows only this.</span>
      </div>

      {can.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {can.map((row) => (
            <li key={row.id} className="flex items-start gap-2 text-[13px] leading-snug">
              <Icon name="check" size={14} className="mt-0.5 shrink-0 text-cyan" />
              <span className="min-w-0 flex-1">{row.text}</span>
              {row.source ? <span className="shrink-0 font-mono text-[10px] uppercase tracking-[1px] text-cyan-muted">{row.source}</span> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[13px] leading-snug text-warn">No sensors fitted: beyond its own wheels and battery, this robot drives blind.</p>
      )}

      {cannot.length > 0 ? (
        <div className="flex flex-col gap-1.5 border-t border-line pt-2.5">
          <span className="rr-label">Cannot sense</span>
          <ul className="flex flex-col gap-1.5">
            {cannot.map((row) => (
              <li key={row.id} className="flex items-start gap-2 text-xs leading-snug text-text-2">
                <Icon name="close" size={13} className="mt-0.5 shrink-0 text-faint" />
                <span className="min-w-0">
                  {row.text}
                  {row.fit ? <span className="text-muted"> · needs {row.fit}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="border-t border-line pt-2.5 text-[11px] leading-snug text-muted">
        <span className="font-mono text-[10px] tracking-[1px] text-text-2">CORE KIT · EVERY BUILD</span>
        <br />
        {core.join(' · ')}. Power sensing is part of the core kit.
      </p>
    </section>
  );
}
