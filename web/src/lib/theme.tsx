/**
 * Theme provider.
 *
 * Stores the active theme in localStorage('tn:theme') and applies it as
 * `data-theme="light"` on <html>.  The dark theme is the default (no
 * attribute set).  We also support 'system' which follows the OS pref.
 *
 * Why `data-theme` instead of a Tailwind class? Tailwind's `darkMode: 'class'`
 * forces every themed style to live behind a `dark:` prefix; here we want
 * full token swapping (gain/loss tones, accent shade, page gradient, …) which
 * is much cleaner with CSS variables driven by a single attribute.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

export type Theme = 'light' | 'dark' | 'system';

interface ThemeContextValue {
  theme: Theme;          // user's choice
  resolved: 'light' | 'dark'; // what's actually applied right now
  setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);
const STORAGE_KEY = 'tn:theme';

function readStored(): Theme {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch {
    /* ignore */
  }
  return 'dark';
}

function applyToDocument(resolved: 'light' | 'dark') {
  const html = document.documentElement;
  if (resolved === 'light') html.setAttribute('data-theme', 'light');
  else html.removeAttribute('data-theme');
  // Hint to UA-styled controls (scrollbars, form elements, etc.)
  html.style.colorScheme = resolved;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readStored);
  const [systemPref, setSystemPref] = useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined') return 'dark';
    return window.matchMedia('(prefers-color-scheme: light)').matches
      ? 'light'
      : 'dark';
  });

  // Track the OS-level preference so 'system' updates live.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const handler = (e: MediaQueryListEvent) =>
      setSystemPref(e.matches ? 'light' : 'dark');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const resolved: 'light' | 'dark' = theme === 'system' ? systemPref : theme;

  // Apply on every change.
  useEffect(() => {
    applyToDocument(resolved);
  }, [resolved]);

  const setTheme = useCallback((t: Theme) => {
    try {
      localStorage.setItem(STORAGE_KEY, t);
    } catch {
      /* ignore */
    }
    setThemeState(t);
  }, []);

  const value = useMemo(
    () => ({ theme, resolved, setTheme }),
    [theme, resolved, setTheme],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}

/** Apply the saved theme as early as possible — call before React renders to
 *  avoid an FOUC flash. Imported by main.tsx. */
export function bootTheme(): void {
  const t = readStored();
  let resolved: 'light' | 'dark';
  if (t === 'system') {
    resolved =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: light)').matches
        ? 'light'
        : 'dark';
  } else {
    resolved = t;
  }
  applyToDocument(resolved);
}
