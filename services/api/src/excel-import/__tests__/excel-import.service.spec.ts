import { D } from '../../common/types/money';
import { ExcelImportService } from '../excel-import.service';
import { ExcelBrokerSheet } from '../excel.parser';

describe('ExcelImportService.computeDiffsForOnboarding', () => {
  it('produces a diff per broker sheet using REPLACE semantics', () => {
    // computeDiffsForOnboarding is a pure helper; DbService is unused.
    const svc = new ExcelImportService(null as never);
    const sheets: ExcelBrokerSheet[] = [
      {
        brokerHint: 'Groww',
        rejected: [],
        rows: [
          { ticker: 'INFY', qty: D(10), avgCost: D(1500) },
          { ticker: 'TCS', qty: D(5), avgCost: D(3500) },
        ],
      },
      {
        brokerHint: 'Kite-Juhi',
        rejected: [],
        rows: [{ ticker: 'INFY', qty: D(4), avgCost: D(1450) }],
      },
    ];
    // user already has TCS in Groww (so it'll be UNCHANGED) and nothing in Kite-Juhi
    const current = new Map([
      ['Groww', [{ ticker: 'TCS', qty: D(5), avgCost: D(3500) }]],
    ]);
    const out = svc.computeDiffsForOnboarding(sheets, current);
    expect(out).toHaveLength(2);
    const groww = out.find((x) => x.brokerHint === 'Groww')!;
    expect(groww.diff.adds).toBe(1); // INFY
    expect(groww.diff.unchanged).toBe(1); // TCS
    const kite = out.find((x) => x.brokerHint === 'Kite-Juhi')!;
    expect(kite.diff.adds).toBe(1);
  });
});
