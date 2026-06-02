import { parseCsvLine } from '../watchlist.controller';

describe('parseCsvLine', () => {
  it('splits a simple comma-separated line', () => {
    expect(parseCsvLine('RELIANCE.NS,Energy')).toEqual(['RELIANCE.NS', 'Energy']);
  });
  it('handles single-column rows', () => {
    expect(parseCsvLine('AAPL')).toEqual(['AAPL']);
  });
  it('returns empty strings for empty cells', () => {
    expect(parseCsvLine('A,,C')).toEqual(['A', '', 'C']);
  });
  it('respects quoted fields with embedded commas', () => {
    expect(parseCsvLine('AAPL,"Tech, Inc."')).toEqual(['AAPL', 'Tech, Inc.']);
  });
  it('handles escaped quotes inside quoted fields ("" → ")', () => {
    expect(parseCsvLine('A,"He said ""hi"""')).toEqual(['A', 'He said "hi"']);
  });
  it('preserves trailing empty cell', () => {
    expect(parseCsvLine('AAPL,')).toEqual(['AAPL', '']);
  });
});
