import { Controller, Get } from '@nestjs/common';
import { QuoteCache } from '../quote/quote.cache';

const INDICES: { symbol: string; name: string }[] = [
  { symbol: '^NSEI',    name: 'NIFTY 50' },
  { symbol: '^BSESN',   name: 'SENSEX' },
  { symbol: '^NSEBANK', name: 'NIFTY BANK' },
  { symbol: '^GSPC',    name: 'S&P 500' },
  { symbol: '^IXIC',    name: 'NASDAQ' },
  { symbol: '^DJI',     name: 'DOW' },
];

@Controller('indices')
export class IndicesController {
  constructor(private readonly quotes: QuoteCache) {}

  @Get()
  async list() {
    const symbols = INDICES.map((i) => i.symbol);
    const map = await this.quotes.getMany(symbols);
    return INDICES.map((i) => {
      const q = map.get(i.symbol);
      return {
        symbol: i.symbol,
        name: i.name,
        ltp: q ? q.ltp.toFixed(4) : '0',
        changePct: q && !q.prevClose.isZero()
          ? q.ltp.sub(q.prevClose).div(q.prevClose).toString()
          : '0',
      };
    });
  }
}
