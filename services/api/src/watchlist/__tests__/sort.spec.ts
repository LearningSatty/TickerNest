import { D } from '../../common/types/money';
import { sortRows, SortableRow } from '../sort';

const row = (
  ticker: string,
  name: string,
  position: number,
  subsection: number,
  dayChange: number,
  dayChangePct: number,
): SortableRow => ({
  ticker,
  name,
  position,
  subsectionPosition: subsection,
  dayChange: D(dayChange),
  dayChangePct: D(dayChangePct),
});

describe('sortRows', () => {
  const rows = [
    row('B', 'Beta', 2, 1, -10, -0.01),
    row('A', 'Alpha', 1, 1, 50, 0.05),
    row('C', 'Charlie', 3, 2, 20, 0.02),
    row('D', 'Delta', 4, 2, -30, -0.03),
  ];

  it('DEFAULT respects manual position', () => {
    expect(sortRows(rows, 'DEFAULT').map((r) => r.ticker)).toEqual([
      'A',
      'B',
      'C',
      'D',
    ]);
  });

  it('ALPHABETICAL sorts by name', () => {
    expect(sortRows(rows, 'ALPHABETICAL').map((r) => r.ticker)).toEqual([
      'A',
      'B',
      'C',
      'D',
    ]);
  });

  it('DAY_CHANGE desc', () => {
    expect(sortRows(rows, 'DAY_CHANGE').map((r) => r.ticker)).toEqual([
      'A', // +50
      'C', // +20
      'B', // -10
      'D', // -30
    ]);
  });

  it('DAY_CHANGE_PCT desc', () => {
    expect(sortRows(rows, 'DAY_CHANGE_PCT').map((r) => r.ticker)).toEqual([
      'A',
      'C',
      'B',
      'D',
    ]);
  });

  it('GROUP_BY_SUBSECTION with inner ALPHABETICAL', () => {
    expect(
      sortRows(rows, 'GROUP_BY_SUBSECTION', 'ALPHABETICAL').map(
        (r) => r.ticker,
      ),
    ).toEqual(['A', 'B', 'C', 'D']);
  });

  it('GROUP_BY_SUBSECTION with inner DAY_CHANGE', () => {
    expect(
      sortRows(rows, 'GROUP_BY_SUBSECTION', 'DAY_CHANGE').map((r) => r.ticker),
    ).toEqual(['A', 'B', 'C', 'D']); // sub1: A>B (50, -10); sub2: C>D (20, -30)
  });
});
