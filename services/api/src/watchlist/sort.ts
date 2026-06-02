/**
 * Watchlist sorting — pure function over rows. Server never re-sorts on
 * subscribed quote ticks; the frontend resorts in place. We expose this
 * here only so import paths and unit tests live in one place.
 */
import { Money, ZERO } from '../common/types/money';

export type SortMode =
  | 'DEFAULT'
  | 'ALPHABETICAL'
  | 'DAY_CHANGE'
  | 'DAY_CHANGE_PCT'
  | 'GROUP_BY_SUBSECTION';

export interface SortableRow {
  ticker: string;
  name: string;
  position: number; // manual order
  subsectionPosition: number; // for grouping
  dayChange: Money;
  dayChangePct: Money;
}

export const sortRows = (
  rows: readonly SortableRow[],
  mode: SortMode,
  groupBy?: SortMode,
): SortableRow[] => {
  const arr = [...rows];

  if (mode === 'GROUP_BY_SUBSECTION') {
    // group by subsectionPosition asc, then by `groupBy` inside each group.
    const inner =
      groupBy && groupBy !== 'GROUP_BY_SUBSECTION' ? groupBy : 'DEFAULT';
    arr.sort((a, b) => {
      if (a.subsectionPosition !== b.subsectionPosition)
        return a.subsectionPosition - b.subsectionPosition;
      return compareBy(a, b, inner);
    });
    return arr;
  }

  arr.sort((a, b) => compareBy(a, b, mode));
  return arr;
};

const compareBy = (a: SortableRow, b: SortableRow, mode: SortMode): number => {
  switch (mode) {
    case 'DEFAULT':
      return a.position - b.position;
    case 'ALPHABETICAL':
      return a.name.localeCompare(b.name);
    case 'DAY_CHANGE':
      return b.dayChange.cmp(a.dayChange); // desc
    case 'DAY_CHANGE_PCT':
      return b.dayChangePct.cmp(a.dayChangePct); // desc
    case 'GROUP_BY_SUBSECTION':
      return a.subsectionPosition - b.subsectionPosition;
  }
};
