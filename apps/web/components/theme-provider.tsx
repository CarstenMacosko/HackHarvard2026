"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

export type ThemePreference = "system" | "light" | "dark";
type Resolved = "light" | "dark";

const STORAGE_KEY = "streamcare-theme";

type ThemeContextValue = {
  preference: ThemePreference;
  resolved: Resolved;
  setPreference: (p: ThemePreference) => void;
  toggle: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function systemTheme(): Resolved {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyClass(resolved: Resolved) {
  document.documentElement.classList.toggle("dark", resolved === "dark");
}

function readStored(): ThemePreference {
  try {
    const v = sessionStorage.getItem(STORAGE_KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    /* ignore */
  }
  return "system";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>("system");
  const [resolved, setResolved] = useState<Resolved>("light");

  const resolve = useCallback((pref: ThemePreference): Resolved => {
    return pref === "system" ? systemTheme() : pref;
  }, []);

  const setPreference = useCallback(
    (pref: ThemePreference) => {
      setPreferenceState(pref);
      try {
        if (pref === "system") sessionStorage.removeItem(STORAGE_KEY);
        else sessionStorage.setItem(STORAGE_KEY, pref);
      } catch {
        /* ignore */
      }
      const next = resolve(pref);
      setResolved(next);
      applyClass(next);
    },
    [resolve],
  );

  const toggle = useCallback(() => {
    setPreference(resolved === "dark" ? "light" : "dark");
  }, [resolved, setPreference]);

  useEffect(() => {
    const pref = readStored();
    setPreferenceState(pref);
    const next = resolve(pref);
    setResolved(next);
    applyClass(next);

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      const current = readStored();
      if (current === "system") {
        const sys = systemTheme();
        setResolved(sys);
        applyClass(sys);
      }
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [resolve]);

  return <ThemeContext.Provider value={{ preference, resolved, setPreference, toggle }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
