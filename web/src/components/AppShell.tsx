/**
 * AppShell — global frame.
 *
 *   ┌──────────────────────────────────────────────────────────────────────────┐
 *   │ ☰  TickerNest  │  NIFTY 50 -1.5%  …  NIFTY IT  …  │  ADV/DEC 1.4         │
 *   │   user@x.com   │                                                         │
 *   ├──────┬───────────────────────────────────────────────────────────────────┤
 *   │ ▤    │                                                                   │
 *   │ DASH │   Outlet (page content)                                           │
 *   │ PORT │                                                                   │
 *   │ …    │                                                                   │
 *   └──────┴───────────────────────────────────────────────────────────────────┘
 *
 * Sidebar drawer:
 *   - Width: 220px expanded, 56px collapsed (icon-only).
 *   - Toggle: hamburger button in the top bar.
 *   - State persisted in localStorage('tn:nav-collapsed').
 *   - Smooth 200ms transition; labels fade out when collapsing.
 */
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useBrokers, usePortfolioRealtime } from '@/hooks/usePortfolio';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/cn';
import { supabase } from '@/lib/supabase';
import MarketStrip from '@/components/MarketStrip';
import GlobalStockSearch from '@/components/GlobalStockSearch';

const COLLAPSE_KEY = 'tn:nav-collapsed';

// Tiny inline SVG icons — keeps the bundle small.
const Icon = {
  Dashboard: '📊',
  Portfolio: '💼',
  Sector: '🏷️',
  Watchlist: '👁',
  Sold: '💸',
  Broker: '🏦',
  Excel: '📥',
  Settings: '⚙',
  Logout: '↩',
  Hamburger: '☰',
};

interface NavLinkDef {
  to: string;
  label: string;
  icon: string;
}
interface NavGroupDef {
  title: string;
  items: NavLinkDef[];
}

export default function AppShell() {
  const { user } = useAuth();
  const { data: brokers = [] } = useBrokers();
  usePortfolioRealtime(user?.id);
  const loc = useLocation();
  // Hide the global stock search bar on pages where it'd be redundant or
  // distracting: Excel onboarding (drag-drop UI) and broker detail.
  const hideSearch =
    loc.pathname.startsWith('/import/excel') ||
    loc.pathname.startsWith('/broker/');

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === '1';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0');
    } catch {
      /* ignore quota / privacy-mode errors */
    }
  }, [collapsed]);

  const groups: NavGroupDef[] = [
    {
      title: '',
      items: [
        { to: '/dashboard', label: 'Dashboard', icon: Icon.Dashboard },
        { to: '/portfolio', label: 'Consolidated', icon: Icon.Portfolio },
        { to: '/portfolio/sector', label: 'By Sector', icon: Icon.Sector },
        { to: '/watchlists', label: 'Watchlists', icon: Icon.Watchlist },
        { to: '/sold', label: 'Sold Shares', icon: Icon.Sold },
      ],
    },
    {
      title: 'Brokers',
      items: brokers.map((b) => ({
        to: `/broker/${b.id}`,
        label: b.displayName,
        icon: Icon.Broker,
      })),
    },
    {
      title: 'Tools',
      items: [
        { to: '/import/excel', label: 'Excel Onboarding', icon: Icon.Excel },
        { to: '/settings', label: 'Settings', icon: Icon.Settings },
      ],
    },
  ];

  return (
    <div className="grid grid-rows-[auto_1fr] h-full w-full overflow-hidden">
      {/* ─── Top bar ─── */}
      <header className="border-b border-line/60 bg-bg-soft/40 flex items-stretch min-w-0 overflow-hidden">
        <div
          className={cn(
            'shrink-0 flex items-center gap-3 px-3 border-r border-line/60 transition-[width] duration-200 ease-out',
            collapsed ? 'w-[56px] justify-center' : 'w-[220px]',
          )}
        >
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-line/40 text-base"
          >
            {Icon.Hamburger}
          </button>
          <div
            className={cn(
              'min-w-0 transition-opacity duration-200',
              collapsed ? 'opacity-0 pointer-events-none w-0' : 'opacity-100',
            )}
          >
            <div className="text-base font-semibold text-accent leading-tight">
              TickerNest
            </div>
            <div className="text-2xs text-ink-muted truncate">
              {user?.email ?? 'guest'}
            </div>
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <MarketStrip compact />
        </div>
      </header>

      {/* ─── Body ─── */}
      <div className="grid grid-cols-[auto_1fr] min-h-0 min-w-0 overflow-hidden">
        <aside
          className={cn(
            'border-r border-line/60 bg-bg-soft/40 flex flex-col overflow-hidden transition-[width] duration-200 ease-out',
            collapsed ? 'w-[56px]' : 'w-[220px]',
          )}
        >
          <nav className="flex-1 overflow-y-auto overflow-x-hidden p-2 space-y-0.5 text-sm">
            {groups.map((g, gi) => (
              <div key={g.title || `g-${gi}`}>
                {g.title && (
                  <SectionHeader title={g.title} collapsed={collapsed} />
                )}
                {g.items.map((it) => (
                  <DrawerLink
                    key={it.to}
                    to={it.to}
                    label={it.label}
                    icon={it.icon}
                    collapsed={collapsed}
                  />
                ))}
              </div>
            ))}
          </nav>
          <div className="p-2 border-t border-line/60">
            <button
              onClick={() => supabase.auth.signOut()}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-1.5 rounded-md text-2xs text-ink-muted hover:text-ink hover:bg-line/40',
                collapsed && 'justify-center',
              )}
              title={collapsed ? 'Sign out' : ''}
            >
              <span className="text-base">{Icon.Logout}</span>
              <span
                className={cn(
                  'transition-opacity duration-200',
                  collapsed && 'opacity-0 w-0 pointer-events-none',
                )}
              >
                Sign out
              </span>
            </button>
          </div>
        </aside>
        <div className="flex flex-col min-w-0 bg-bg-lift overflow-hidden">
          {!hideSearch && <GlobalStockSearch />}
          <main className="flex-1 overflow-auto min-w-0">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}

// ─── Drawer link with icon-only / icon+label modes ──────────────────────────
function DrawerLink({
  to,
  label,
  icon,
  collapsed,
}: {
  to: string;
  label: string;
  icon: string;
  collapsed: boolean;
}) {
  return (
    <NavLink
      to={to}
      title={collapsed ? label : ''}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 px-3 py-1.5 rounded-md hover:bg-line/40',
          collapsed ? 'justify-center' : 'truncate',
          isActive && 'bg-accent/15 text-accent',
        )
      }
    >
      <span className="text-base shrink-0 w-5 text-center">{icon}</span>
      <span
        className={cn(
          'transition-opacity duration-200 truncate',
          collapsed && 'opacity-0 w-0 pointer-events-none',
        )}
      >
        {label}
      </span>
    </NavLink>
  );
}

function SectionHeader({
  title,
  collapsed,
}: {
  title: string;
  collapsed: boolean;
}) {
  if (collapsed) {
    // Show a thin separator line for grouped sections in collapsed mode.
    return <div className="my-2 mx-2 h-px bg-line/60" />;
  }
  return (
    <div className="px-3 py-2 mt-3 text-2xs uppercase tracking-wide text-ink-muted">
      {title}
    </div>
  );
}
