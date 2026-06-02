import { parseCsv } from '../csv.parser';
import { BUILT_IN_PROFILES } from '../../common/providers/csv-profile';

describe('parseCsv', () => {
  it('parses a Groww-style CSV using the built-in profile', () => {
    const csv = [
      'Stock Name,Company Name,Quantity,Average buy price,Current price,Invested,ISIN',
      'INFY-EQ,Infosys Limited,10,1500.50,1602,15005,INE009A01021',
      'TCS,Tata Consultancy Services,5,3200.00,4000,16000,INE467B01029',
    ].join('\n');
    const r = parseCsv(csv, BUILT_IN_PROFILES.groww);
    expect(r.totalRows).toBe(2);
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0]!.ticker).toBe('INFY'); // -EQ stripped
    expect(r.rows[0]!.qty.toString()).toBe('10');
    expect(r.rows[0]!.avgCost.toString()).toBe('1500.5');
  });

  it('strips thousands separators in numbers', () => {
    const csv = [
      'Stock Name,Company Name,Quantity,Average buy price',
      'INFY,Infosys,1,"1,500.50"',
    ].join('\n');
    const r = parseCsv(csv, BUILT_IN_PROFILES.groww);
    expect(r.rows[0]!.avgCost.toString()).toBe('1500.5');
  });

  it('rejects malformed rows without aborting the batch', () => {
    const csv = [
      'Stock Name,Company Name,Quantity,Average buy price',
      'INFY,Infosys,10,1500',
      ',Empty Ticker,5,100',
      'TCS,TCS,not-a-number,3000',
    ].join('\n');
    const r = parseCsv(csv, BUILT_IN_PROFILES.groww);
    expect(r.rows).toHaveLength(1);
    expect(r.rejected).toHaveLength(2);
  });

  it('uppercases tickers', () => {
    const csv =
      'Stock Name,Company Name,Quantity,Average buy price\ninfy,Infosys,1,1';
    const r = parseCsv(csv, BUILT_IN_PROFILES.groww);
    expect(r.rows[0]!.ticker).toBe('INFY');
  });
});
