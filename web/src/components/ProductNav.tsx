import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/cn';

const PRODUCTS = [
  { label: 'Stocks', to: '/dashboard' },
  { label: 'Mutual Funds', to: '/mf' },
  { label: 'Investments', to: '/investments' },
  { label: 'Assets', to: '/assets' },
] as const;

export function ProductNav() {
  return (
    <nav className="flex items-center gap-6 border-b border-border px-6 py-3 bg-background">
      <div className="w-8 h-8 rounded-full bg-green-500" />
      {PRODUCTS.map((p) => (
        <NavLink
          key={p.to}
          to={p.to}
          className={({ isActive }) =>
            cn(
              'text-sm font-medium transition-colors',
              isActive
                ? 'text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )
          }
        >
          {p.label}
        </NavLink>
      ))}
    </nav>
  );
}
