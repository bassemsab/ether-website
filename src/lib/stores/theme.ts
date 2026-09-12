import { writable } from "svelte/store";
import { browser } from "$app/environment";

export type Theme = "light" | "dark";

function getInitialTheme(): Theme {
  if (!browser) return "light";
  if (document.documentElement.classList.contains("dark")) return "dark";
  const saved = localStorage.getItem("ether_theme");
  if (saved === "dark" || saved === "light") return saved;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function createThemeStore() {
  const { subscribe, set, update } = writable<Theme>(getInitialTheme());

  return {
    subscribe,
    setTheme: (t: Theme) => {
      if (browser) {
        localStorage.setItem("ether_theme", t);
        if (t === "dark") {
          document.documentElement.classList.add("dark");
        } else {
          document.documentElement.classList.remove("dark");
        }
      }
      set(t);
    },
    toggle: () => {
      update((current) => {
        const next = current === "dark" ? "light" : "dark";
        if (browser) {
          localStorage.setItem("ether_theme", next);
          if (next === "dark") {
            document.documentElement.classList.add("dark");
          } else {
            document.documentElement.classList.remove("dark");
          }
        }
        return next;
      });
    },
    init: () => {
      if (browser) {
        const t = getInitialTheme();
        if (t === "dark") {
          document.documentElement.classList.add("dark");
        } else {
          document.documentElement.classList.remove("dark");
        }
        set(t);
      }
    },
  };
}

export const theme = createThemeStore();
