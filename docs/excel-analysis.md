# TickerNest — Excel Analysis (My Portfolio.xlsx)

42 sheets total. Categorized below.

## Broker sheets (10)
Same 17-column body schema across all of them, header row at r5:
Ticker | Name | Sector | Sector-Domain | Market Type | Total Holding | Avg. Price |
Current Price | Prev. Close | Change | Change % | Today's P/L | Invested Cost |
Current Cost | Overall Change % | Overall P/L | PE Ratio
Header strip (r1-r3) holds: Client ID, Demat, DP ID, Last Updated, Total Tickers,
Value At Cost, Current Value, Overall P/L, Today's Change, Today's Change%,
Overall Gain%, distribution buckets (-15/-30/-50/-70 loss, +15/+30/+50/+75/+100 profit),
sector aggregates.

Brokers: ICICI Direct, IIFL, Groww, Kite-Juhi, AngelOne-Mom, Groww-Papa,
IND-Money, IND-Money JUHI, AngelOne-Satty, MStock.

## Summary sheets (3)
- Summary (1075r x 42c): per-ticker pivot with one (qty, avgPrice) pair per broker,
  Final Avg Value, Today's Change, Today's Change%, INDEX, Invested Value,
  Total P/L, Total P/L%, % of My portfolio (by current value).
- Summary(Sector) (981r x 34c): same pivot grouped/sorted by Sector & Sector-Domain.
- Summary-All (12r x 8c): cross-asset rollup — Equity-Cash, Mutual Funds, PPF,
  US Equity, Crypto, FD, Gold, EPF.

## Watchlist sheets (12)
NIFTY50, NIFTY_Nxt_50, NIFTYIT, NIFTY FMCG, Consume ex-FMCG, Semiconductor,
NBFC/Insur, CapMkt n Exch, PSUs & Dividend Best, To Sell, IPO, plus the
Summary/Summary(Sector) above used as watchlists too.
Header at r5:
Ticker | Name | Current Price | (Today's High in some) | Prev. Close | Change % |
Change | Fall % From 52wk High | (Up % from listing) | Today's Volume |
Avg. Volume | Volume Diff. | PE Ratio | Today's Low | Today's High | 52wk High |
52wk Low | No. of Stocks | Current Value | <per-broker (qty, avg) repeated>
Header strip: Watchlist Name, Amount Invested, Today Change, Sector's Link.

## Activity / log sheets
- Sold Shares: Ticker, Name, Sector, Sector-Domain, Sold Qty, Broker Account,
  Sold At, Sold Date, Loss After Selling, Current Price, Current Cost,
  52wk High price, Time Since Sold, Reason, Mistake Description.
- Dividend: Ticker, Name, Quantity, Dividend, Earning, Ex-Date, Bank Deposit Date,
  Dividend History Avg, Good Dividend History, Year, Dividend per year, Account.
- IPO: same shape as watchlist + Listing Age, Is>52wkHigh, Is<ListDate,
  Total Subscription.
- To Sell: same shape as watchlist (sell-candidates).

## Other asset classes
- Mutual Funds ULIP: Scheme Code, Fund Name, Goal, Type, Target, SIP Required,
  SIP Amount, NAV, Avg NAV, Units, Current Value, Total Invested, Expense Ratio,
  Churn Ratio, CAGR, Nominee, Broker. Also has Maturity Date, totals.
- U.S. Invest: Mode (Package/Manual), Ticker, Name, Sector, Market Type, Qty,
  Avg, Current, Prev Close, Change, Change%, PE, Final P/L, Current Cost,
  Current Cost(INR), CAGR, Broker Name. Header has Exchange Rate and Quarter
  windows for ESPP.
- Gold-Physical: purity reference (Gold 999/995/958/916/750/585/500), price
  source links (MCX, IBJA).
- Crypto: list of coins (Bitcoin, Etherium, Ripple, LiteCoin, ...).
- EPF, PPF: contribution / balance tracking.

## Reference / journaling sheets
- SIP: planned recurring investments (Real Estate, Portfolio Rebalancing, Tax
  loss Harvesting, Gold Physical, SGB).
- Daily Practices: checklist text.
- Trading: trading rules / quotes.
- Learning, Events Reasons, Calculator, Personal Details, Ayurvedic, Dictionary.
- Calculator: average-price recompute helper, broker-wise.

## Schema observations / invariants
- Same 17-col holding schema repeats across all 10 brokers => single Holding
  table is the right model.
- Summary sheet's per-broker columns are dynamic — driven by broker list.
- INDEX column on Summary maps a ticker to one of: NIFTY 50, NIFTY Next 50,
  NIFTY IT, NIFTY FMCG, Semiconductor watchlist, etc. This is a *watchlist
  membership* column, not a separate index field.
- Loss/profit bucket counters (15/30/50/70 loss, 15/30/50/75/100 profit) are
  computed metrics worth surfacing on the broker page.
- Day-averages strip (5/15/30 day avg) appears on every broker sheet — implies
  the user wants short-term moving averages on each holding.
- "Time Since Sold" + "Mistake Description" on Sold Shares = retrospective
  journaling — should be first-class.
- US Investing has its own FX layer (Exchange Rate -> Current Cost(INR)).
