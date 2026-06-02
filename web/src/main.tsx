import '@/index.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
} from 'react-router-dom';
import AppShell from '@/components/AppShell';
import LoadingBar from '@/components/LoadingBar';
import Login from '@/pages/Login';
import Dashboard from '@/pages/Dashboard';
import Portfolio from '@/pages/Portfolio';
import BrokerPage from '@/pages/BrokerPage';
import Watchlist from '@/pages/Watchlist';
import Watchlists from '@/pages/Watchlists';
import StockDetail from '@/pages/StockDetail';
import SoldShares from '@/pages/SoldShares';
import ExcelOnboard from '@/pages/ExcelOnboard';
import Settings from '@/pages/Settings';
import MfPortfolio from '@/pages/mf/MfPortfolio';
import UsHoldings from '@/pages/investments/UsHoldings';
import AssetsList from '@/pages/assets/AssetsList';
import { useAuth } from '@/hooks/useAuth';
import { ThemeProvider, bootTheme } from '@/lib/theme';

// Apply the saved theme synchronously, before React paints, to avoid an
// initial-render colour flash when the user has chosen 'light'.
bootTheme();

const qc = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: false, retry: 1 },
  },
});

function Gate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <QueryClientProvider client={qc}>
        <LoadingBar />
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="/"
              element={
                <Gate>
                  <AppShell />
                </Gate>
              }
            >
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="portfolio" element={<Portfolio />} />
              <Route path="portfolio/sector" element={<Portfolio />} />
              <Route path="broker/:id" element={<BrokerPage />} />
              <Route path="watchlists" element={<Watchlists />} />
              <Route path="watchlists/:id" element={<Watchlists />} />
              <Route path="stock/:ticker" element={<StockDetail />} />
              {/* Backwards compat: old singular path still works. */}
              <Route path="watchlist/:id" element={<Watchlist />} />
              <Route path="mf" element={<MfPortfolio />} />
              <Route path="investments" element={<UsHoldings />} />
              <Route path="assets" element={<AssetsList />} />
              <Route path="sold" element={<SoldShares />} />
              <Route path="import/excel" element={<ExcelOnboard />} />
              <Route path="settings" element={<Settings />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </QueryClientProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
