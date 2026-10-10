// The MK-II bill of materials (docs/inputs/bom-mk2.json), as the UI uses it.
// Pure functions only: which real components a game build maps to, and what can honestly be said about their price.
// Nothing here invents a part, a price or a link: every string shown comes from the file.
import type { Build } from '@rivetrun/contracts';
import { BUILD_TUNING } from '@rivetrun/sim';

export type BomStatus = 'verified' | 'unverified' | 'experimental' | 'design';
export type BomGroup = 'core' | 'game' | 'alt' | 'locked' | 'tool';
export type SpecValue = string | number | boolean | readonly (string | number)[];

export interface BomItem {
  readonly key: string;
  readonly gameId: string | null;
  readonly group: BomGroup;
  readonly category: string;
  readonly name: string;
  readonly manufacturer: string | null;
  readonly model: string | null;
  /** How many of `unit` one rover needs. Tools have none. */
  readonly qty: number | null;
  readonly unit: string | null;
  /** The manufacturer's page or official store, or null when none was verified. */
  readonly url: string | null;
  /** Copied from the page as displayed, in its own currency. Null = the page showed no price. */
  readonly priceShown: string | null;
  readonly specs: Readonly<Record<string, SpecValue>>;
  readonly status: BomStatus;
  readonly notes: string;
  /** Locked parts: the mission scenario they are meant for. */
  readonly scenario: string | null;
  /** Tools: what the tool is for on this build. */
  readonly usedFor: string | null;
}

export interface BomSelect {
  readonly core: readonly string[];
  readonly byCells: Readonly<Record<string, { readonly driver: string; readonly switch: string; readonly motorVoltage: string; readonly warning?: string }>>;
  readonly motor: Readonly<Record<string, Readonly<Record<string, string>>>>;
  readonly battery: Readonly<Record<string, Readonly<Record<string, string | null>>>>;
  readonly wheelByGameMm: Readonly<Record<string, string>>;
  readonly wheelNote: string;
  readonly locomotion: Readonly<Record<string, string | readonly string[]>>;
  readonly parts: Readonly<Record<string, string>>;
}

/** The BOM, or the slice of it a screen needs. Plain data: safe to pass from a server page to a client component. */
export interface Bom {
  /** The day every link was opened and matched to its product (YYYY-MM-DD). */
  readonly checkedAt: string;
  readonly select: BomSelect;
  readonly items: Readonly<Record<string, BomItem>>;
}

export interface RealLine {
  readonly item: BomItem;
  /** The game part this component stands for, e.g. "motor_torque". Null for the core kit. */
  readonly gameId: string | null;
}

export interface RealPlan {
  /** Electronics and hardware every rover needs, with the driver and switch that fit the cell count. */
  readonly core: readonly RealLine[];
  /** The components behind the parts the player chose. */
  readonly chosen: readonly RealLine[];
  /** Things the file says about this exact combination: voltage warnings, wheel size mapping, parts with no real match. */
  readonly notes: readonly string[];
}

const NO_PACK = 'No real pack at this size';
const WHEEL_TOKEN = 'wheelByGameMm';

const cellsOf = (build: Build): number => build.batteryCells ?? BUILD_TUNING.stockCells;
const wheelOf = (build: Build): number => build.wheelSizeMm ?? BUILD_TUNING.stockWheelMm;
/** The game's large wheel was 100 mm before the BOM fixed it at 90 mm; the file keys it as "100". */
const wheelKey = (bom: Bom, sizeMm: number): string | undefined => bom.select.wheelByGameMm[String(sizeMm)] ?? (sizeMm === 90 ? bom.select.wheelByGameMm['100'] : undefined);
const isLargeWheel = (sizeMm: number): boolean => sizeMm >= 90;

const lines = (bom: Bom, keys: readonly (string | undefined | null)[], gameId: string | null): RealLine[] =>
  keys.flatMap((key) => {
    const item = key ? bom.items[key] : undefined;
    return item ? [{ item, gameId }] : [];
  });

/** The real components for one game part on this build (cell count and wheel size change the answer), plus the file's notes. */
export function realForPart(bom: Bom, build: Build, partId: string, slot: string): { readonly lines: readonly RealLine[]; readonly notes: readonly string[] } {
  const { select } = bom;
  const cells = cellsOf(build);
  const byCells = select.byCells[String(cells)];
  if (slot === 'motor') {
    return { lines: lines(bom, [byCells ? select.motor[partId]?.[byCells.motorVoltage] : undefined], partId), notes: byCells?.warning ? [byCells.warning] : [] };
  }
  if (slot === 'battery') {
    const key = select.battery[partId]?.[String(cells)];
    return { lines: lines(bom, [key], partId), notes: key ? [] : [`${NO_PACK} (${cells}S)`] };
  }
  if (slot === 'locomotion') {
    const rule = select.locomotion[partId];
    const tokens = rule === undefined ? [] : typeof rule === 'string' ? [rule] : rule;
    const usesWheel = tokens.includes(WHEEL_TOKEN);
    const size = wheelOf(build);
    const keys = tokens.map((token) => (token === WHEEL_TOKEN ? wheelKey(bom, size) : token));
    return { lines: lines(bom, keys, partId), notes: usesWheel && isLargeWheel(size) ? [select.wheelNote] : [] };
  }
  return { lines: lines(bom, [select.parts[partId]], partId), notes: [] };
}

/** Everything one rover needs for this build: the core kit and the chosen parts' components. */
export function realPlan(bom: Bom, build: Build): RealPlan {
  const byCells = bom.select.byCells[String(cellsOf(build))];
  const parts: readonly (readonly [string, string])[] = [
    [build.locomotion, 'locomotion'],
    [build.motor, 'motor'],
    [build.battery, 'battery'],
    ...build.sensors.map((id) => [id, 'sensor'] as const),
    ...build.extras.map((id) => [id, 'extra'] as const),
  ];
  const resolved = parts.map(([id, slot]) => realForPart(bom, build, id, slot));
  return {
    core: lines(bom, [...bom.select.core, byCells?.driver, byCells?.switch], null),
    chosen: resolved.flatMap((part) => part.lines),
    notes: [...new Set(resolved.flatMap((part) => part.notes))],
  };
}

export type Currency = 'US$' | '€';

export interface ParsedPrice {
  readonly currency: Currency;
  readonly amount: number;
}

/** "1.814,00" and "1,814.00" → 1814; "9,99" and "9.99" → 9.99. The later separator is the decimal one when both appear. */
function parseAmount(text: string): number | null {
  const lastDot = text.lastIndexOf('.');
  const lastComma = text.lastIndexOf(',');
  const decimalAt = lastDot >= 0 && lastComma >= 0 ? Math.max(lastDot, lastComma) : Math.max(lastDot, lastComma);
  const hasDecimals = decimalAt >= 0 && (lastDot >= 0 && lastComma >= 0 ? true : text.length - decimalAt - 1 === 2);
  const whole = (hasDecimals ? text.slice(0, decimalAt) : text).replace(/[.,]/g, '');
  const amount = Number(hasDecimals ? `${whole}.${text.slice(decimalAt + 1)}` : whole);
  return Number.isFinite(amount) ? amount : null;
}

/**
 * A price that is one plain amount in one currency: "US$29.95", "$12.95 USD", "€9,99", "€ 249".
 * Anything else the page showed ("From: $230.00", "Available from $25", two prices, a bundle name) is not a
 * figure to add up, and returns null. A bare "$" is read as US dollars.
 */
export function parsePrice(priceShown: string | null): ParsedPrice | null {
  const match = priceShown?.trim().match(/^(US\$|\$|€)\s?(\d[\d.,]*)(?:\s?(USD|EUR))?$/);
  if (!match) return null;
  const amount = parseAmount(match[2]!);
  return amount === null ? null : { currency: match[1] === '€' ? '€' : 'US$', amount };
}

export interface Subtotal {
  /** One sum per currency, never converted or added together. */
  readonly byCurrency: readonly ParsedPrice[];
  /** Lines whose page showed no single price: the buyer sees it at the retailer. */
  readonly atRetailer: number;
}

export function subtotal(planLines: readonly RealLine[]): Subtotal {
  const sums = new Map<Currency, number>();
  let atRetailer = 0;
  for (const { item } of planLines) {
    const price = parsePrice(item.priceShown);
    if (!price) atRetailer += 1;
    else sums.set(price.currency, (sums.get(price.currency) ?? 0) + price.amount * (item.qty ?? 1));
  }
  const order: readonly Currency[] = ['US$', '€'];
  return { byCurrency: order.flatMap((currency) => (sums.has(currency) ? [{ currency, amount: sums.get(currency)! }] : [])), atRetailer };
}

export const formatMoney = (price: ParsedPrice): string => `${price.currency} ${price.amount.toFixed(2)}`;

/** "US$ 212.10 + € 37.98", or null when nothing on the list has a plain price. */
export const formatSubtotal = (sum: Subtotal): string | null => (sum.byCurrency.length === 0 ? null : sum.byCurrency.map(formatMoney).join(' + '));

export interface StatusBadge {
  readonly label: string;
  readonly tone: 'ok' | 'warn' | 'muted';
}

export const STATUS_BADGE: Readonly<Record<BomStatus, StatusBadge>> = {
  verified: { label: 'Verified', tone: 'ok' },
  unverified: { label: 'Unverified', tone: 'muted' },
  experimental: { label: 'Not buildable yet', tone: 'warn' },
  design: { label: 'Design proposal', tone: 'warn' },
};

/** A link out is offered only for a product page that was checked. Unverified items never get one. */
export const canBuy = (item: BomItem): boolean => item.url !== null && item.status !== 'unverified';

const UNITS: readonly (readonly [RegExp, string])[] = [
  [/Mah$/, 'mAh'],
  [/Mm$/, 'mm'],
  [/Cm$/, 'cm'],
  [/Kg$/, 'kg'],
  [/Hz$/, 'Hz'],
  [/(?<=[a-z0-9])G$/, 'g'],
  [/(?<=[a-z0-9])V$/, 'V'],
  [/(?<=[a-z0-9])W$/, 'W'],
  [/(?<=[a-z0-9])J$/, 'J'],
];

export interface SpecRow {
  readonly label: string;
  readonly value: string;
}

/** "dimensionsMm": "45 x 20" → Dimensions / "45 x 20 mm". Keys with no unit suffix are only spaced out. */
export function specRow(key: string, value: SpecValue): SpecRow {
  const unit = UNITS.find(([suffix]) => suffix.test(key));
  const base = unit ? key.replace(unit[0], '') : key;
  const words = base.replace(/_/g, '.').replace(/([a-z0-9])([A-Z])/g, '$1 $2');
  const label = words.charAt(0).toUpperCase() + words.slice(1).replace(/ ([A-Z])(?=[a-z])/g, (_m, letter: string) => ` ${letter.toLowerCase()}`);
  const text = Array.isArray(value) ? value.join(' × ') : typeof value === 'boolean' ? (value ? 'yes' : 'no') : String(value);
  return { label, value: unit ? `${text} ${unit[1]}` : text };
}

export const specRows = (item: BomItem): readonly SpecRow[] => Object.entries(item.specs).map(([key, value]) => specRow(key, value));

/** "4 pcs", "2 pair", "1 pack of 100". Null for tools, which are not counted per rover. */
export const quantity = (item: BomItem): string | null => (item.qty === null ? null : `${item.qty} ${item.unit ?? 'pcs'}`);
