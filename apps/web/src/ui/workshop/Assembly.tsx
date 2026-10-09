'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { Build } from '@rivetrun/contracts';
import { PARTS_BY_ID } from '@rivetrun/sim';
import { useBuildStore } from '@/state/build';
import { buildActions, buildProperties, buildSenses } from '@/ui/buildStats';
import { Icon } from '@/ui/Icon';
import { Shell } from '@/ui/Shell';
import { ExplodedCanvas } from '@/ui/three';
import { explodedLayers, screenTop, type LayerKey } from '@/ui/three/exploded';

const STAGE_HEIGHT = 290;

const names = (ids: readonly string[]): string => ids.map((id) => PARTS_BY_ID.get(id)?.name.toLowerCase() ?? id).join(' · ');

/** Title and contents of each exploded layer, top to bottom. */
function layerText(build: Build): Readonly<Record<LayerKey, { title: string; detail: string }>> {
  const top = [...build.sensors, ...build.extras];
  return {
    sensors: { title: 'SENSORS + EXTRAS', detail: top.length > 0 ? names(top) : 'nothing fitted' },
    board: { title: 'BRAIN BOARD', detail: 'controller · face' },
    chassis: { title: 'CHASSIS', detail: '3D-printed deck' },
    power: { title: 'DRIVE + POWER', detail: names([build.motor, build.battery]) },
    wheels: { title: 'WHEELS', detail: names([build.locomotion]) },
  };
}

/** Assembly & properties: the build pulled apart in five layers, its numbers, and what it lets the brain do and sense. */
export function Assembly() {
  const build = useBuildStore((store) => store.build);
  const missionId = useBuildStore((store) => store.missionId);
  const text = layerText(build);
  const layers = explodedLayers(build);
  const [ready, setReady] = useState(false);

  return (
    <Shell
      back="/workshop"
      title="Assembly"
      footer={
        <Link href={`/brief/${missionId}`} className="rr-btn rr-btn-primary w-full !min-h-[54px] !text-[15px]">
          Brief the brain
          <Icon name="next" size={18} />
        </Link>
      }
    >
      <section className="rr-stage shrink-0 !bg-stage" style={{ height: STAGE_HEIGHT }} aria-label={`Exploded view in five layers: ${layers.map((layer) => text[layer.key].title.toLowerCase()).join(', ')}`}>
        {ready ? null : <span className="rr-label rr-blink pointer-events-none absolute inset-y-0 left-0 grid w-[55%] place-items-center">Pulling it apart</span>}
        <div className="absolute inset-0">
          <ExplodedCanvas build={build} onReady={() => setReady(true)} />
        </div>
        <ol className="pointer-events-none absolute inset-y-0 right-0 w-[45%]">
          {layers.map((layer, index) => (
            <li key={layer.key} className="absolute inset-x-0 flex -translate-y-1/2 items-center gap-1.5 pr-2.5" style={{ top: `${screenTop(build, layer.anchorY) * 100}%` }}>
              <span className="h-px w-6 shrink-0 bg-[#5E8FB8]" />
              <span className="min-w-0 font-mono text-[10px] font-medium leading-[1.25]">
                <span className="block truncate text-[#CFE0EE]">
                  {index + 1} {text[layer.key].title}
                </span>
                <span className="line-clamp-2 text-[#7F96AA]">{text[layer.key].detail}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <dl className="rr-card flex flex-col px-3.5 py-1">
        {buildProperties(build).map((property, index, all) => (
          <div key={property.label} className={`flex h-8 items-center justify-between ${index < all.length - 1 ? 'border-b border-tag' : ''}`}>
            <dt className="text-[13px] text-[#B8C0C9]">{property.label}</dt>
            <dd className="font-mono text-[13px] font-semibold tabular-nums">{property.value}</dd>
          </div>
        ))}
      </dl>

      <section className="flex flex-col gap-2">
        <h2 className="rr-label !text-cyan">This build lets the brain</h2>
        <ul className="flex flex-wrap gap-1.5" aria-label="Actions">
          {buildActions(build).map((action) => (
            <li key={action.label} className={`rr-chip !normal-case ${action.on ? 'rr-chip-on' : 'rr-chip-off'}`}>
              {action.label}
              {action.on ? '' : ` · needs ${action.needs}`}
            </li>
          ))}
        </ul>
        <ul className="flex flex-wrap gap-1.5" aria-label="Senses">
          {buildSenses(build).map((sense) => (
            <li
              key={sense.label}
              className={`rounded-lg border px-[9px] py-[5px] text-[11px] leading-[1.3] ${sense.on ? 'border-line-2 text-[#D7DBE0]' : 'border-dashed border-line-3 text-[#8A929C]'}`}
            >
              {sense.on ? '✓' : '?'} {sense.label}
              {sense.on ? '' : ` · needs ${sense.needs}`}
            </li>
          ))}
        </ul>
      </section>
    </Shell>
  );
}
