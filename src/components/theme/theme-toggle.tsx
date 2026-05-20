"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

type ThemeMode = "light" | "dark";

const THEME_STORAGE_KEY = "sb.theme";

function readInitialTheme(): ThemeMode {
  if (typeof window === "undefined") return "light";
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyTheme(mode: ThemeMode) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", mode === "dark");
}

export function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>(() => readInitialTheme());

  useEffect(() => {
    applyTheme(mode);
  }, [mode]);

  const toggle = () => {
    const next = mode === "dark" ? "light" : "dark";
    setMode(next);
    applyTheme(next);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  };

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={toggle}
      title={mode === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      aria-label={mode === "dark" ? "Switch to light mode" : "Switch to dark mode"}
    >
      {mode === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
      {mode === "dark" ? "Light" : "Dark"}
    </Button>
  );
}
