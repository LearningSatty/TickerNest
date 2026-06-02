import { D } from '../../common/types/money';
import { computeImportDiff, CurrentHolding, StagedRow } from '../import.diff';

const c = (ticker: string, qty: number, avg: number): CurrentHolding => ({
  ticker,
  qty: D(qty),
  avgCost: D(avg),
});
const s = (ticker: string, qty: number, avg: number): StagedRow => ({
  ticker,
  qty: D(qty),
  avgCost: D(avg),
});

describe('computeImportDiff', () => {
  describe('REPLACE mode', () => {
    it('classifies a brand-new ticker as ADD', () => {
      const d = computeImportDiff([], [s('INFY', 10, 1500)], 'REPLACE');
      expect(d.rows).toHaveLength(1);
      const r = d.rows[0]!;
      expect(r.kind).toBe('ADD');
      expect(r.qtyDelta.toString()).toBe('10');
      expect(r.newAvgCost.toString()).toBe('1500');
    });

    it('classifies a missing ticker as REMOVE in REPLACE mode', () => {
      const d = computeImportDiff([c('OLDCO', 5, 100)], [], 'REPLACE');
      expect(d.removes).toBe(1);
      expect(d.rows[0]!.qtyDelta.toString()).toBe('-5');
    });

    it('UNCHANGED when qty AND avg both match', () => {
      const d = computeImportDiff(
        [c('INFY', 10, 1500)],
        [s('INFY', 10, 1500)],
        'REPLACE',
      );
      expect(d.unchanged).toBe(1);
      expect(d.rows[0]!.kind).toBe('UNCHANGED');
    });

    it('UPDATE when qty changed (positive delta = bought more); newAvgCost = staged avg', () => {
      const d = computeImportDiff(
        [c('INFY', 10, 1500)],
        [s('INFY', 15, 1550)],
        'REPLACE',
      );
      expect(d.updates).toBe(1);
      const r = d.rows[0]!;
      expect(r.kind).toBe('UPDATE');
      expect(r.qtyDelta.toString()).toBe('5');
      expect(r.newAvgCost.toString()).toBe('1550');
    });

    it('UPDATE with negative delta carries staged avg as newAvgCost (user may also have edited it)', () => {
      const d = computeImportDiff(
        [c('INFY', 10, 1500)],
        [s('INFY', 7, 1500)],
        'REPLACE',
      );
      expect(d.updates).toBe(1);
      const r = d.rows[0]!;
      expect(r.qtyDelta.toString()).toBe('-3');
      expect(r.newAvgCost.toString()).toBe('1500');
    });

    it('UPDATE when qty same but avg changed (broker corrected average)', () => {
      const d = computeImportDiff(
        [c('INFY', 10, 1500)],
        [s('INFY', 10, 1480)],
        'REPLACE',
      );
      expect(d.updates).toBe(1);
    });
  });

  describe('MERGE mode', () => {
    it('does NOT classify missing tickers as REMOVE', () => {
      const d = computeImportDiff(
        [c('OLDCO', 5, 100)],
        [s('INFY', 1, 1500)],
        'MERGE',
      );
      expect(d.removes).toBe(0);
      expect(d.adds).toBe(1);
    });
  });

  describe('idempotency', () => {
    it('re-running the same diff gives an all-UNCHANGED result', () => {
      const cur = [c('INFY', 10, 1500), c('TCS', 5, 3500)];
      const stg = [s('INFY', 10, 1500), s('TCS', 5, 3500)];
      const d = computeImportDiff(cur, stg, 'REPLACE');
      expect(d.unchanged).toBe(2);
      expect(d.adds + d.updates + d.removes).toBe(0);
    });
  });

  describe('counts add up', () => {
    it('every row falls into exactly one bucket', () => {
      const cur = [c('A', 1, 1), c('B', 2, 2), c('C', 3, 3)];
      const stg = [s('B', 2, 2), s('C', 4, 3), s('D', 1, 1)];
      const d = computeImportDiff(cur, stg, 'REPLACE');
      expect(d.adds + d.updates + d.unchanged + d.removes).toBe(d.rows.length);
      expect(d.adds).toBe(1); // D
      expect(d.removes).toBe(1); // A
      expect(d.unchanged).toBe(1); // B
      expect(d.updates).toBe(1); // C
    });
  });
});
