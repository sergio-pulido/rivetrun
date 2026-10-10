'use client';

import type { Build, Part } from '@rivetrun/contracts';
import { PARTS, PARTS_BY_ID } from '@rivetrun/sim';
import { fitted, isRemovable, withPart } from '@/ui/workshop/slots';
import { bestTerrains, capabilityDiff, capabilityHeadlines, goodFor, type GivesChip } from './gives';
import { capabilityList, partGives, type CapabilityId } from './sim';

/** The abilities worth stating for a part every rover has one of, when it is the one fitted. */
const HEADLINES: Readonly<Record<string, readonly CapabilityId[]>> = {
  locomotion: ['clearance', 'wading', 'climb'],
  motor: ['top_speed', 'pull', 'climb'],
  battery: ['range'],
};

const TONE = {
  better: 'border-cyan-line bg-cyan-deep text-cyan-soft',
  worse: 'border-warn/50 text-warn',
  same: 'border-line-2 bg-panel-2 text-text',
} as const;

function Chip({ chip }: { readonly chip: GivesChip }) {
  return (
    <li className={`flex flex-col gap-0.5 rounded-lg border px-2.5 py-1.5 ${TONE[chip.direction]}`}>
      <span className="text-xs font-semibold leading-tight">{chip.text}</span>
      {chip.without ? <span className="text-[10px] leading-tight text-muted">without: {chip.without.charAt(0).toLowerCase() + chip.without.slice(1)}</span> : null}
    </li>
  );
}

interface GivesYourRoverProps {
  readonly part: Part;
  readonly build: Build;
}

/**
 * "Gives your rover": what the sim says the robot on the bench can do with this part, against the same robot without it
 * (or, for a part every rover needs one of, against the one fitted now). "Good for": the ground and obstacles that helps on.
 * Renders nothing until the sim exports its capabilities.
 */
/** A part that only works alongside another extra, when the build does not carry that one: its name. */
function missingHelper(part: Part, build: Build): string | null {
  const needs = part.effects.requiresExtra;
  if (!needs) return null;
  const helpers = PARTS.filter((candidate) => candidate.effects.extra === needs);
  return helpers.some((helper) => build.extras.includes(helper.id)) ? null : (helpers[0]?.name ?? null);
}

export function GivesYourRover({ part, build }: GivesYourRoverProps) {
  const equipped = fitted(build, part.slot).includes(part.id);
  const withBuild = equipped ? build : withPart(build, part);
  // A sensor or extra can simply come off; a drive, motor or battery can only be compared with the one fitted.
  const withoutBuild = isRemovable(part) ? (equipped ? withPart(build, part) : build) : equipped ? null : build;
  const withCaps = capabilityList(withBuild);
  if (!withCaps) return null;
  const withoutCaps = withoutBuild ? capabilityList(withoutBuild) : null;

  // The fitted drive, motor or battery has nothing on the bench to be compared with: the sim compares it with the plainest one.
  const overPlainest: readonly GivesChip[] = withoutCaps ? [] : (partGives(build, part.id) ?? []).map((item) => ({ id: item.id, text: item.label, without: null, direction: 'better' }));
  const chips = withoutCaps ? capabilityDiff(withCaps, withoutCaps) : overPlainest.length > 0 ? overPlainest : capabilityHeadlines(withCaps, HEADLINES[part.slot] ?? []);
  // Fitting it swaps out the drive, motor or battery; in a full sensor or extra slot it pushes one part off.
  const pushedOut = equipped ? undefined : fitted(build, part.slot).find((id) => !fitted(withBuild, part.slot).includes(id));
  const replaced = pushedOut ? PARTS_BY_ID.get(pushedOut)?.name : undefined;
  const good = withoutCaps || overPlainest.length > 0 ? goodFor(chips) : part.slot === 'locomotion' ? bestTerrains(withCaps, 3) : [];
  const helper = missingHelper(part, withBuild);
  const basis = replaced ? `instead of your ${replaced.toLowerCase()}` : withoutCaps ? 'on the robot on the bench' : overPlainest.length > 0 ? `over the plainest ${part.slot === 'locomotion' ? 'drive' : part.slot}` : 'as fitted now';

  return (
    <section className="rr-card flex flex-col gap-2.5 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="rr-label !text-cyan">Gives your rover</h2>
        <span className="text-right text-[11px] leading-tight text-muted">{basis}</span>
      </div>
      {chips.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {chips.map((chip) => (
            <Chip key={chip.id} chip={chip} />
          ))}
        </ul>
      ) : (
        <p className="text-xs leading-snug text-muted">{helper ? `Does nothing on its own: it needs the ${helper.toLowerCase()} fitted too.` : 'Nothing the sim measures changes with this part on this build.'}</p>
      )}
      {good.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-line pt-2.5">
          <span className="rr-label">Good for</span>
          {good.map((kind) => (
            <span key={kind} className="rr-chip !normal-case">
              {kind}
            </span>
          ))}
        </div>
      ) : null}
    </section>
  );
}
