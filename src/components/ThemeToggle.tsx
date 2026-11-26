import { useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

const STORAGE_KEY = 'theme';

function systemTheme(): Theme {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  document.documentElement.style.colorScheme = theme;
}

function currentTheme(): Theme {
  try {
    return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

function SunIcon() {
  return (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
      <path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
    </svg>
  );
}

/**
 * Sun/moon theme toggle for the application header. Follows the system
 * preference until the user picks a theme manually; the choice persists in
 * localStorage and is applied by the inline bootstrap script in index.html.
 */
export function ThemeToggle() {
  // The inline bootstrap script has already applied the theme class to <html>.
  const [theme, setTheme] = useState<Theme>(currentTheme);

  useEffect(() => {
    let media: MediaQueryList;
    try {
      media = window.matchMedia('(prefers-color-scheme: dark)');
    } catch {
      return;
    }
    const onChange = () => {
      try {
        // A manual selection wins over later system changes.
        if (localStorage.getItem(STORAGE_KEY)) return;
      } catch {
        /* fall through: follow the system preference */
      }
      setTheme(systemTheme());
    };
    media.addEventListener?.('change', onChange);
    return () => media.removeEventListener?.('change', onChange);
  }, []);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const next: Theme = theme === 'dark' ? 'light' : 'dark';

  const toggle = () => {
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* theme still applies for this session */
    }
    setTheme(next);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
      className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-foreground p-2 text-foreground"
    >
      {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}
