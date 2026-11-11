"use client";

import { Moon, Sun } from "lucide-react";

function isDark() {
  const t = document.documentElement.getAttribute("data-theme");
  if (t) return t === "dark";
  return true; // dark is the default
}

export function ThemeToggle() {
  function toggle() {
    const next = isDark() ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("theme", next);
    } catch {}
  }
  // Both icons render; CSS picks one, so server and client HTML match.
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Toggle dark mode"
      className="inline-flex size-9 items-center justify-center rounded-full border-[1.5px] border-ink hover:bg-ink hover:text-paper transition-colors"
    >
      <Sun size={18} className="theme-sun" />
      <Moon size={18} className="theme-moon" />
    </button>
  );
}
