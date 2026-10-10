// "My parts": what the player already has, set against the list for the robot on the bench.
import { printedKey } from '@/state/inventory';
import { subtotal, type RealLine, type Subtotal } from './bom';

export interface Stock {
  /** Lines to buy plus printed designs. */
  readonly total: number;
  readonly have: number;
  /** Lines of the list not in hand yet. */
  readonly toBuy: readonly RealLine[];
  /** What those cost, per currency: never converted or added across currencies. */
  readonly toBuySum: Subtotal;
  /** Printed designs not in hand yet. */
  readonly toPrint: number;
  /** Every line and every printed part is in hand: the rover can be built today. */
  readonly ready: boolean;
}

/** Where the player stands on one rover's list: what is in hand, what is left to buy and to print. */
export function stock(lines: readonly RealLine[], printed: readonly { readonly id: string }[], owned: readonly string[]): Stock {
  const has = new Set(owned);
  const toBuy = lines.filter((line) => !has.has(line.item.key));
  const toPrint = printed.filter((part) => !has.has(printedKey(part.id))).length;
  const total = lines.length + printed.length;
  return { total, have: total - toBuy.length - toPrint, toBuy, toBuySum: subtotal(toBuy), toPrint, ready: total > 0 && toBuy.length === 0 && toPrint === 0 };
}
