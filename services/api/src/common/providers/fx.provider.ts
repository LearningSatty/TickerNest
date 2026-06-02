import { Money } from '../types/money';

export interface FxRate {
  from: 'USD' | 'INR';
  to: 'USD' | 'INR';
  rate: Money;
  asOf: Date;
}

export abstract class FxProvider {
  abstract getRate(from: 'USD' | 'INR', to: 'USD' | 'INR'): Promise<FxRate>;
  abstract readonly name: string;
}
