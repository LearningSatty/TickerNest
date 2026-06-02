import { D } from '../../common/types/money';
import { planHoldingUpsert, HoldingState } from '../holding.upsert';

const s = (qty: number, avg: number): HoldingState => ({
  qty: D(qty),
  avgCost: D(avg),
});

describe('planHoldingUpsert', () => {
  describe('insertion', () => {
    it('plans INSERT for a brand-new holding', () => {
      const p = planHoldingUpsert(null, { desired: s(10, 700) });
      expect(p.kind).toBe('INSERT');
      if (p.kind === 'INSERT') {
        expect(p.next.qty.toString()).toBe('10');
        expect(p.next.avgCost.toString()).toBe('700');
      }
    });

    it('rejects inserting a zero-qty holding (NOOP)', () => {
      const p = planHoldingUpsert(null, { desired: s(0, 700) });
      expect(p.kind).toBe('NOOP');
    });
  });

  describe('idempotency', () => {
    it('NOOP when qty AND avg are unchanged', () => {
      const p = planHoldingUpsert(s(10, 700), { desired: s(10, 700) });
      expect(p.kind).toBe('NOOP');
    });
  });

  describe('qty increase (user buys more)', () => {
    it('UPDATE with no SoldShare', () => {
      const p = planHoldingUpsert(s(10, 700), { desired: s(15, 712) });
      expect(p.kind).toBe('UPDATE');
      if (p.kind === 'UPDATE') {
        expect(p.next).toEqual(s(15, 712));
        expect(p.soldShare).toBeUndefined();
      }
    });

    it('avg-only change (user manually corrected avg) is UPDATE without SoldShare', () => {
      const p = planHoldingUpsert(s(10, 700), { desired: s(10, 705) });
      expect(p.kind).toBe('UPDATE');
      if (p.kind === 'UPDATE') {
        expect(p.soldShare).toBeUndefined();
      }
    });
  });

  describe('qty decrease (user sells some)', () => {
    it('UPDATE with a SoldShare snapshotting OLD avg as cost basis', () => {
      const p = planHoldingUpsert(s(10, 700), { desired: s(7, 700) });
      expect(p.kind).toBe('UPDATE');
      if (p.kind === 'UPDATE' && p.soldShare) {
        expect(p.soldShare.qty.toString()).toBe('3');
        expect(p.soldShare.costBasisAtSell.toString()).toBe('700');
        expect(p.soldShare.soldPrice).toBeNull();
        expect(p.soldShare.reason).toBeNull();
      }
    });

    it('cost basis is the OLD avg, not the new one (history is immutable)', () => {
      // user reduces qty AND updates the running avg in the same edit
      const p = planHoldingUpsert(s(10, 700), { desired: s(6, 750) });
      if (p.kind === 'UPDATE' && p.soldShare) {
        expect(p.soldShare.costBasisAtSell.toString()).toBe('700');
      } else {
        fail('expected UPDATE with soldShare');
      }
    });

    it('passes through soldPrice / reason / mistake when supplied', () => {
      const p = planHoldingUpsert(s(10, 700), {
        desired: s(7, 700),
        soldPrice: D(820),
        reason: 'Profit booking',
      });
      if (p.kind === 'UPDATE' && p.soldShare) {
        expect(p.soldShare.soldPrice!.toString()).toBe('820');
        expect(p.soldShare.reason).toBe('Profit booking');
        expect(p.soldShare.mistake).toBeNull();
      } else {
        fail('expected UPDATE with soldShare');
      }
    });
  });

  describe('qty to zero (full exit)', () => {
    it('DELETE with a SoldShare for the full prior qty', () => {
      const p = planHoldingUpsert(s(10, 700), { desired: s(0, 700) });
      expect(p.kind).toBe('DELETE');
      if (p.kind === 'DELETE') {
        expect(p.soldShare.qty.toString()).toBe('10');
        expect(p.soldShare.costBasisAtSell.toString()).toBe('700');
      }
    });
  });
});
