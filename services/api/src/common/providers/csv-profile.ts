import { z } from 'zod';

/**
 * Per-broker CSV column mapping. Persisted in `broker.csv_profile` JSONB.
 * The CsvParser validates uploads against the profile + a strict zod schema
 * before any holding/trade is touched.
 *
 * Built-in profiles ship for the brokers found in My-Portfolio.xlsx:
 *   ICICI Direct, IIFL, Groww, Kite (Zerodha Console), Angel One, IND-Money,
 *   MStock.
 * Users can override any profile by re-saving the column map in the UI.
 */

export const BrokerCsvProfileSchema = z.object({
  brokerKey: z.enum([
    'icici-direct',
    'iifl',
    'groww',
    'kite',
    'angelone',
    'ind-money',
    'mstock',
    'custom',
  ]),
  /** delimiter (almost always ','), encoding, header row index */
  parser: z.object({
    delimiter: z.string().default(','),
    encoding: z.string().default('utf-8'),
    headerRow: z.number().int().min(0).default(0),
    skipRows: z.number().int().min(0).default(0),
  }),
  /** column name in the source CSV → canonical field */
  columns: z.object({
    ticker: z.string(),
    name: z.string().optional(),
    quantity: z.string(),
    avgPrice: z.string(),
    currentPrice: z.string().optional(),
    investedCost: z.string().optional(),
    currentCost: z.string().optional(),
    sector: z.string().optional(),
    sectorDomain: z.string().optional(),
    marketType: z.string().optional(),
    isin: z.string().optional(),
    exchange: z.string().optional(),
  }),
  /** symbol normalisation: e.g. some brokers quote "INFY-EQ", others "NSE:INFY" */
  tickerTransform: z
    .object({
      stripSuffix: z.array(z.string()).default([]), // ['-EQ', '-BE']
      stripPrefix: z.array(z.string()).default([]), // ['NSE:', 'BOM:']
      uppercase: z.boolean().default(true),
    })
    .default({}),
});

export type BrokerCsvProfile = z.infer<typeof BrokerCsvProfileSchema>;

export const BUILT_IN_PROFILES: Record<BrokerCsvProfile['brokerKey'], BrokerCsvProfile> = {
  groww: {
    brokerKey: 'groww',
    parser: { delimiter: ',', encoding: 'utf-8', headerRow: 0, skipRows: 0 },
    columns: {
      ticker: 'Stock Name',
      name: 'Company Name',
      quantity: 'Quantity',
      avgPrice: 'Average buy price',
      currentPrice: 'Current price',
      investedCost: 'Invested',
      isin: 'ISIN',
    },
    tickerTransform: { stripSuffix: ['-EQ'], stripPrefix: [], uppercase: true },
  },
  kite: {
    brokerKey: 'kite',
    parser: { delimiter: ',', encoding: 'utf-8', headerRow: 0, skipRows: 0 },
    columns: {
      ticker: 'Symbol',
      quantity: 'Quantity Available',
      avgPrice: 'Average Price',
      currentPrice: 'Previous Closing Price',
      isin: 'ISIN',
      exchange: 'Exchange',
    },
    tickerTransform: { stripSuffix: [], stripPrefix: [], uppercase: true },
  },
  'icici-direct': {
    brokerKey: 'icici-direct',
    parser: { delimiter: ',', encoding: 'utf-8', headerRow: 7, skipRows: 0 },
    columns: {
      ticker: 'Stock Symbol',
      name: 'Stock Name',
      quantity: 'Quantity',
      avgPrice: 'Average Cost Price',
      currentPrice: 'Current Market Price',
      investedCost: 'Total Investment Value',
      currentCost: 'Current Value',
    },
    tickerTransform: { stripSuffix: [], stripPrefix: [], uppercase: true },
  },
  iifl: {
    brokerKey: 'iifl',
    parser: { delimiter: ',', encoding: 'utf-8', headerRow: 0, skipRows: 0 },
    columns: {
      ticker: 'Symbol',
      name: 'Company',
      quantity: 'Qty',
      avgPrice: 'Avg Cost',
      currentPrice: 'LTP',
    },
    tickerTransform: { stripSuffix: [], stripPrefix: [], uppercase: true },
  },
  angelone: {
    brokerKey: 'angelone',
    parser: { delimiter: ',', encoding: 'utf-8', headerRow: 0, skipRows: 0 },
    columns: {
      ticker: 'Symbol',
      name: 'Company Name',
      quantity: 'Quantity',
      avgPrice: 'Avg. Buy Price',
      currentPrice: 'LTP',
    },
    tickerTransform: { stripSuffix: ['-EQ'], stripPrefix: [], uppercase: true },
  },
  'ind-money': {
    brokerKey: 'ind-money',
    parser: { delimiter: ',', encoding: 'utf-8', headerRow: 0, skipRows: 0 },
    columns: {
      ticker: 'Ticker',
      name: 'Stock Name',
      quantity: 'Holding',
      avgPrice: 'Avg Price',
      currentPrice: 'Current Price',
    },
    tickerTransform: { stripSuffix: [], stripPrefix: [], uppercase: true },
  },
  mstock: {
    brokerKey: 'mstock',
    parser: { delimiter: ',', encoding: 'utf-8', headerRow: 0, skipRows: 0 },
    columns: {
      ticker: 'Symbol',
      quantity: 'Net Qty',
      avgPrice: 'Avg Buy Price',
      currentPrice: 'LTP',
    },
    tickerTransform: { stripSuffix: [], stripPrefix: [], uppercase: true },
  },
  custom: {
    brokerKey: 'custom',
    parser: { delimiter: ',', encoding: 'utf-8', headerRow: 0, skipRows: 0 },
    columns: {
      ticker: 'Ticker',
      quantity: 'Quantity',
      avgPrice: 'Avg Price',
    },
    tickerTransform: { stripSuffix: [], stripPrefix: [], uppercase: true },
  },
};
