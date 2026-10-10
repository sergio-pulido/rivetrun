// Server-side reader for the pregenerated plans (apps/web/data/plans/<missionId>.json). A mission without a file,
// or with a file that does not parse, simply has no pregenerated plan: nothing is made up.
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import type { Plan, PresetId } from '@rivetrun/contracts';
import { parsePlanFile } from './plan';

const DIR = path.join(process.cwd(), 'data', 'plans');

export type PlansByMission = Readonly<Record<string, Partial<Record<PresetId, Plan>>>>;

export function pregeneratedPlans(): PlansByMission {
  let files: readonly string[];
  try {
    files = readdirSync(DIR).filter((file) => /^[A-Za-z0-9_-]+\.json$/.test(file));
  } catch {
    return {}; // No plans directory yet.
  }
  return files.reduce<Record<string, Partial<Record<PresetId, Plan>>>>((all, file) => {
    try {
      const plans = parsePlanFile(JSON.parse(readFileSync(path.join(DIR, file), 'utf8')));
      return Object.keys(plans).length > 0 ? { ...all, [file.replace(/\.json$/, '')]: plans } : all;
    } catch {
      return all;
    }
  }, {});
}
