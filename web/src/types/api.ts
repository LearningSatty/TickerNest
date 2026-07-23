/**
 * Shared API types — these match the NestJS DTOs / DB rows.
 * Money values arrive as strings (NUMERIC). The frontend keeps them as
 * strings until display, then formats via formatMoney() / formatPct().
 */

export type Money = string;

export interface Broker {
  id: string;
  name: string;
  displayName: string;
  currency: 'INR' | 'USD';
  sortOrder: number;
  exchangeDefault: string;
}

export interface BrokerHolding {
  brokerId: string;
  ticker: string;
  qty: Money;
  avgCost: Money;
  // server-joined for the broker page:
  name?: string;
  sector?: string | null;
  sectorDomain?: string | null;
  marketType?: string | null;
  currentPrice?: Money;
  prevClose?: Money;
  peRatio?: Money | null;
}

export interface PerBrokerCell {
  brokerId: string;
  brokerName: string;
  qty: Money;
  avgCost: Money;
}

export interface ConsolidatedRow {
  ticker: string;
  name?: string;
  sector?: string | null;
  totalQty: Money;
  currentPrice: Money;
  currentValue: Money;
  finalAvgValue: Money;
  investedValue: Money;
  totalPnl: Money;
  totalPnlPct: Money;
  todaysChange: Money;
  todaysChangePct: Money;
  percentOfPortfolio: Money;
  perBroker: PerBrokerCell[];
}

export interface ConsolidatedResponse {
  rows: ConsolidatedRow[];
  brokers: Broker[];
  totalInvested: Money;
  totalCurrentValue: Money;
  overallProfit: Money;
  overallProfitPct: Money;
  todaysTotalProfit: Money;
}

export interface SoldShare {
  id: string;
  brokerId: string;
  ticker: string;
  qty: Money;
  costBasisAtSell: Money;
  soldPrice: Money | null;
  reason: string | null;
  mistake: string | null;
  soldAt: string; // ISO
}

export interface CsvImportPreview {
  importId: string;
  adds: number;
  updates: number;
  unchanged: number;
  removes: number;
  rejected: number;
  rows: Array<{
    ticker: string;
    kind: 'ADD' | 'UPDATE' | 'UNCHANGED' | 'REMOVE';
    current: { qty: Money; avgCost: Money } | null;
    staged: { qty: Money; avgCost: Money } | null;
  }>;
}

export interface UpsertHoldingPayload {
  qty: Money;
  avgCost: Money;
  soldPrice?: Money;
  reason?: string;
  mistake?: string;
}

export interface UpsertHoldingResponse {
  replay: boolean;
  holding: BrokerHolding | null;
  soldShareId: string | null;
}
