// Real maker hardware behind each part, read from docs/inputs/real-parts.json.
// Reference copy only: every gameplay number comes from packages/sim, never from this file.
// Import this from server components (the pages) and pass the view down, so the JSON stays out of the client bundle.
import { z } from 'zod';
import rawParts from '../../../../../docs/inputs/real-parts.json';

const SpecValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.union([z.string(), z.number()])),
  z.object({ min: z.number(), max: z.number() }),
]);
type SpecValue = z.infer<typeof SpecValueSchema>;

const WebUrlSchema = z.url().refine((url) => /^https?:\/\//i.test(url), 'http(s) links only');

const RealPartSchema = z.object({
  id: z.string().min(1),
  realClass: z.string().min(1),
  oneLiner: z.string(),
  specs: z.record(z.string(), SpecValueSchema),
  worksWith: z.array(z.string()),
  retailEurRange: z.object({ min: z.number(), max: z.number(), unit: z.string().optional(), status: z.string().optional() }),
  searchTerms: z.array(z.string().min(1)).min(1),
  sources: z.array(z.object({ name: z.string().min(1), url: WebUrlSchema })),
});
type RealPart = z.infer<typeof RealPartSchema>;

export interface RealSpec {
  readonly label: string;
  readonly value: string;
}

export interface WorksWith {
  readonly text: string;
  /** False when the file says the board is not directly compatible. */
  readonly direct: boolean;
}

/** What the part sheet's REAL PART block shows. Plain data: safe to pass from a server page to a client component. */
export interface RealPartView {
  readonly realClass: string;
  /** Short model name for labels and cards, e.g. "HC-SR04". */
  readonly model: string;
  readonly oneLiner: string;
  /** Three or four key specs; fewer when the file only knows fewer. */
  readonly specs: readonly RealSpec[];
  readonly worksWith: readonly WorksWith[];
  /** "≈ €2–6 retail". */
  readonly price: string;
  /** What the price buys: "module", "pair", "chassis kit". */
  readonly priceUnit: string | null;
  readonly shopQuery: string;
  readonly shopUrl: string;
  readonly sources: readonly { readonly name: string; readonly url: string }[];
  /** The file's caveat for this part, when it has one. */
  readonly note: string | null;
}

interface SpecPick {
  readonly key: string;
  readonly label: string;
  readonly unit?: string;
  /** How a list joins: dimensions use ×, ranges use /. */
  readonly join?: string;
  /** The file marks the figure as approximate. */
  readonly approx?: boolean;
}

const WHEEL_SPECS: readonly SpecPick[] = [
  { key: 'diameterMm', label: 'Diameter', unit: 'mm' },
  { key: 'widthMm', label: 'Width', unit: 'mm' },
  { key: 'massGPerWheel', label: 'Mass each', unit: 'g' },
  { key: 'shaftDiameterMm', label: 'Shaft', unit: 'mm' },
];
const MOTOR_SPECS: readonly SpecPick[] = [
  { key: 'nominalVoltageV', label: 'Voltage', unit: 'V' },
  { key: 'gearRatio', label: 'Gear ratio', unit: ':1' },
  { key: 'noLoadSpeedRpm', label: 'No-load', unit: 'rpm' },
  { key: 'stallTorqueKgCm', label: 'Stall torque', unit: 'kg·cm' },
];
const BATTERY_SPECS: readonly SpecPick[] = [
  { key: 'nominalVoltageV', label: 'Voltage', unit: 'V' },
  { key: 'capacityMah', label: 'Capacity', unit: 'mAh' },
  { key: 'nominalEnergyWh', label: 'Energy', unit: 'Wh' },
  { key: 'massG', label: 'Mass', unit: 'g' },
];

/** Which of the file's spec fields the sheet shows for each part, and how to label them. Values always come from the file. */
const KEY_SPECS: Readonly<Record<string, readonly SpecPick[]>> = {
  wheels: WHEEL_SPECS,
  offroad_wheels: WHEEL_SPECS,
  tracks: [
    { key: 'motorSupplyVoltageV', label: 'Motors', unit: 'V' },
    { key: 'assemblyMassG', label: 'Mass', unit: 'g' },
    { key: 'lengthMm', label: 'Length', unit: 'mm' },
    { key: 'widthMm', label: 'Width', unit: 'mm' },
  ],
  motor_light: MOTOR_SPECS,
  motor_torque: MOTOR_SPECS,
  battery_small: BATTERY_SPECS,
  battery_large: BATTERY_SPECS,
  ultrasonic: [
    { key: 'supplyVoltageV', label: 'Supply', unit: 'V' },
    { key: 'maximumRangeCm', label: 'Max range', unit: 'cm' },
    { key: 'ultrasonicFrequencyKhz', label: 'Pulse', unit: 'kHz' },
    { key: 'dimensionsMm', label: 'Size', unit: 'mm', join: ' × ' },
  ],
  imu: [
    { key: 'breakoutSupplyVoltageV', label: 'Supply', unit: 'V' },
    { key: 'interface', label: 'Bus' },
    { key: 'accelerometerRangesG', label: 'Accel ±', unit: 'g', join: '/' },
    { key: 'gyroscopeRangesDegPerSec', label: 'Gyro ±', unit: '°/s', join: '/' },
  ],
  camera: [
    { key: 'sensor', label: 'Sensor' },
    { key: 'resolutionMegapixels', label: 'Resolution', unit: 'MP' },
    { key: 'horizontalFieldOfViewDeg', label: 'Field of view', unit: '°' },
    { key: 'interface', label: 'Bus' },
  ],
  moisture_probe: [
    { key: 'outputType', label: 'Output' },
    { key: 'operatingCurrentMa', label: 'Current', unit: 'mA' },
    { key: 'lengthMmApprox', label: 'Length', unit: 'mm', approx: true },
    { key: 'massG', label: 'Mass', unit: 'g' },
  ],
  scout_drone: [
    { key: 'massG', label: 'Mass', unit: 'g' },
    { key: 'widthMm', label: 'Span', unit: 'mm' },
    { key: 'flightTimeMinutesApprox', label: 'Flight time', unit: 'min', approx: true },
    { key: 'recommendedMaximumPayloadG', label: 'Payload', unit: 'g' },
  ],
  winch: [
    { key: 'motorReferenceClass', label: 'Motor' },
    { key: 'nominalMotorVoltageV', label: 'Voltage', unit: 'V' },
  ],
  waterproof_case: [
    { key: 'ingressProtectionRating', label: 'Rating' },
    { key: 'material', label: 'Material' },
  ],
  bumper: [
    { key: 'numberOfSwitches', label: 'Switches' },
    { key: 'switchType', label: 'Type' },
    { key: 'outputType', label: 'Output' },
    { key: 'massG', label: 'Mass', unit: 'g' },
  ],
};

const MAX_SPECS = 4;
const META_KEYS = new Set(['referenceModel', 'componentType', 'notes', 'sourceStatus']);
const NOT_A_VALUE = new Set(['UNKNOWN', 'NOT APPLICABLE']);

const isKnown = (value: SpecValue | undefined): value is SpecValue => value !== undefined && !(typeof value === 'string' && NOT_A_VALUE.has(value));

function formatValue(value: SpecValue, pick: Pick<SpecPick, 'unit' | 'join' | 'approx'>): string {
  // Degrees and ratios sit against the number; every other unit takes a space.
  const unit = pick.unit ? (/^[:°]/.test(pick.unit) ? pick.unit : ` ${pick.unit}`) : '';
  const prefix = pick.approx ? '≈ ' : '';
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (Array.isArray(value)) return `${prefix}${value.join(pick.join ?? ', ')}${unit}`;
  if (typeof value === 'object') return `${prefix}${value.min}–${value.max}${unit}`;
  return `${prefix}${value}${unit}`;
}

/** "maximumRangeCm" → "maximum range cm": the fallback label for a part with no curated picks. */
const humanise = (key: string): string => key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();

function keySpecs(part: RealPart): readonly RealSpec[] {
  const picks = KEY_SPECS[part.id];
  const curated = (picks ?? []).flatMap((pick): RealSpec[] => {
    const value = part.specs[pick.key];
    return isKnown(value) ? [{ label: pick.label, value: formatValue(value, pick) }] : [];
  });
  if (picks) return curated.slice(0, MAX_SPECS);
  return Object.entries(part.specs)
    .filter(([key, value]) => !META_KEYS.has(key) && isKnown(value))
    .slice(0, MAX_SPECS)
    .map(([key, value]) => ({ label: humanise(key), value: formatValue(value, {}) }));
}

/** "Arduino: NOT DIRECTLY COMPATIBLE" → "Arduino: not directly compatible", flagged as not direct. */
function worksWith(entry: string): WorksWith {
  const direct = !/NOT DIRECTLY COMPATIBLE/i.test(entry);
  return { text: entry.replace(/\b[A-Z]{2,}(?: [A-Z]{2,})+\b/g, (shout) => shout.toLowerCase()), direct };
}

function modelName(part: RealPart): string {
  const model = part.specs.referenceModel;
  if (typeof model !== 'string' || NOT_A_VALUE.has(model)) return part.realClass;
  return model.includes('_') ? model.replace(/_/g, ' ').toLowerCase() : model;
}

function toView(part: RealPart): RealPartView {
  const { min, max, unit } = part.retailEurRange;
  const shopQuery = part.searchTerms[0]!;
  const note = part.specs.notes;
  return {
    realClass: part.realClass,
    model: modelName(part),
    oneLiner: part.oneLiner,
    specs: keySpecs(part),
    worksWith: part.worksWith.map(worksWith),
    price: `≈ €${min}–${max} retail`,
    priceUnit: unit ?? null,
    shopQuery,
    shopUrl: `https://www.google.com/search?q=${encodeURIComponent(shopQuery)}`,
    sources: part.sources.map((source) => ({ name: source.name, url: source.url })),
    note: typeof note === 'string' ? note : null,
  };
}

/** Entries that fail validation are left out: the sheet then simply has no REAL PART block for that part. */
const VIEWS: ReadonlyMap<string, RealPartView> = new Map(
  (Array.isArray(rawParts) ? rawParts : []).flatMap((entry: unknown): [string, RealPartView][] => {
    const parsed = RealPartSchema.safeParse(entry);
    return parsed.success ? [[parsed.data.id, toView(parsed.data)]] : [];
  }),
);

export const realPart = (id: string): RealPartView | null => VIEWS.get(id) ?? null;

/** Part id → short model name, for the Workshop shelf. */
export const realModels = (): Readonly<Record<string, string>> => Object.fromEntries([...VIEWS].map(([id, view]) => [id, view.model]));
