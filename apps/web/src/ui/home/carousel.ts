// Home's vehicle carousel: which vehicle comes next, and the missions pager. Pure, so the wrap-around is tested.

/** Steps round a ring of `count` items in either direction. */
export const step = (index: number, by: number, count: number): number => (count <= 0 ? 0 : (((index + by) % count) + count) % count);

/** A horizontal drag counts as a swipe past this many pixels; less is a tap or a scroll. */
export const SWIPE_PX = 40;

/** -1 = show the previous one, 1 = the next, 0 = not a swipe. A swipe to the left moves on. */
export const swipe = (startX: number, endX: number): -1 | 0 | 1 => (endX - startX <= -SWIPE_PX ? 1 : endX - startX >= SWIPE_PX ? -1 : 0);

/** The Play mission first, then the others in their own order. */
export const playFirst = <T extends string>(ids: readonly T[], first: T): readonly T[] => (ids.includes(first) ? [first, ...ids.filter((id) => id !== first)] : ids);

export const pageCount = (items: number, perPage: number): number => Math.max(1, Math.ceil(items / Math.max(1, perPage)));

/** The page an item is on (0-based). */
export const pageOf = (index: number, perPage: number): number => Math.floor(index / Math.max(1, perPage));
