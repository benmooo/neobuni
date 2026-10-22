import { createContext, useContext, useEffect, useState } from "react";

export type Theme =
  | "neutral"
  | "blossom"
  | "lavender"
  | "peach"
  | "matcha"
  | "midnight";

export interface ThemeConfig {
  dark: boolean;
  theme: Theme;
}

interface ThemeContextValue extends ThemeConfig {
  setDark: (dark: boolean) => void;
  setTheme: (theme: Theme) => void;
}

const STORAGE_KEY = "buni-theme";

const defaultConfig: ThemeConfig = { theme: "neutral", dark: false };

function readStorage(): ThemeConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return defaultConfig;
    }
    return { ...defaultConfig, ...JSON.parse(raw) };
  } catch {
    return defaultConfig;
  }
}

function applyToDOM(config: ThemeConfig) {
  const html = document.documentElement;
  if (config.theme === "neutral") {
    html.removeAttribute("data-theme");
  } else {
    html.setAttribute("data-theme", config.theme);
  }
  html.classList.toggle("dark", config.dark);
}

const ThemeContext = createContext<ThemeContextValue>({
  ...defaultConfig,
  setTheme: () => {},
  setDark: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<ThemeConfig>(() => {
    const initial = readStorage();
    applyToDOM(initial);
    return initial;
  });

  const setTheme = (theme: Theme) => {
    const next = { ...config, theme };
    applyToDOM(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setConfig(next);
  };

  const setDark = (dark: boolean) => {
    const next = { ...config, dark };
    applyToDOM(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setConfig(next);
  };

  useEffect(() => {
    applyToDOM(config);
  }, [config]);

  return (
    <ThemeContext.Provider value={{ ...config, setTheme, setDark }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
