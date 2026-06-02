/**
 * Settings page — presently theme switching only.  Designed to grow:
 * future toggles (display currency, default market, etc.) drop into
 * additional Section blocks.
 */
import { Theme, useTheme } from '@/lib/theme';
import { cn } from '@/lib/cn';

const THEME_OPTIONS: Array<{
  key: Theme;
  label: string;
  hint: string;
  preview: string;
}> = [
  {
    key: 'dark',
    label: 'Dark',
    hint: 'Default. Easier on the eyes during after-market hours.',
    preview: '🌙',
  },
  {
    key: 'light',
    label: 'Light',
    hint: 'Higher contrast for daytime use and bright displays.',
    preview: '☀️',
  },
  {
    key: 'system',
    label: 'Match system',
    hint: 'Follows your OS appearance preference.',
    preview: '🖥️',
  },
];

export default function Settings() {
  const { theme, resolved, setTheme } = useTheme();

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <header>
        <h1 className="text-xl font-semibold">Settings</h1>
        <p className="text-2xs text-ink-muted">
          Personalise how TickerNest looks and behaves.
        </p>
      </header>

      <Section
        title="Appearance"
        subtitle={`Currently showing the ${resolved} theme.`}
      >
        <div className="grid sm:grid-cols-3 gap-3">
          {THEME_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setTheme(opt.key)}
              className={cn(
                'card text-left p-4 transition-colors hover:border-accent/60',
                theme === opt.key && 'border-accent bg-accent/10',
              )}
            >
              <div className="flex items-center justify-between">
                <span className="text-base">{opt.preview}</span>
                {theme === opt.key && (
                  <span className="text-2xs text-accent">✓ active</span>
                )}
              </div>
              <div className="text-sm font-medium mt-2">{opt.label}</div>
              <div className="text-2xs text-ink-muted mt-1">{opt.hint}</div>
            </button>
          ))}
        </div>
      </Section>
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        {subtitle && <p className="text-2xs text-ink-muted">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}
