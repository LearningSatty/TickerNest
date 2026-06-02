/**
 * Global stock search bar — sits below the MarketStrip on every page that
 * isn't /import/excel or /broker/:id (configured in AppShell).
 *
 *   [ Market ▼ ]  [ search box (autocomplete) ]
 *
 * On pick → navigates to /stock/:ticker which renders the dedicated detail
 * page (chart + key stats + news + Add-to-Watchlist).
 */
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import TickerSearch, { Market } from '@/components/TickerSearch';

export default function GlobalStockSearch() {
  const nav = useNavigate();
  const [market, setMarket] = useState<Market>('IN');

  return (
    <div className="border-b border-line/60 bg-bg-soft/40 px-4 py-2 flex items-center gap-2 relative z-30">
      <select
        value={market}
        onChange={(e) => setMarket(e.target.value as Market)}
        className="bg-bg border border-line rounded-md px-2.5 py-1.5 text-xs focus:outline-none focus:border-accent shrink-0"
        title="Filter search by market"
      >
        <option value="IN">🇮🇳 Indian</option>
        <option value="US">🇺🇸 US</option>
      </select>
      <div className="flex-1 min-w-0 max-w-2xl">
        <TickerSearch
          market={market}
          onPick={(h) => nav(`/stock/${encodeURIComponent(h.ticker)}`)}
          placeholder={
            market === 'IN'
              ? 'Quick search any NSE/BSE stock…'
              : 'Quick search any US stock…'
          }
        />
      </div>
    </div>
  );
}
