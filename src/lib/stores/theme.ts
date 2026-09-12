import { writable } from "svelte/store";
import { browser } from "$app/environment";

export type Theme = "light" | "dark";

function getInitialTheme(): Theme {
  if (!browser) return "light";
  const isStudio = window.location.pathname.startsWith("/studio");
  if (!isStudio) return "light";
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
        const isStudio = window.location.pathname.startsWith("/studio");
        if (isStudio && t === "dark") {
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
          const isStudio = window.location.pathname.startsWith("/studio");
          if (isStudio && next === "dark") {
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
        const isStudio = window.location.pathname.startsWith("/studio");
        if (!isStudio) {
          document.documentElement.classList.remove("dark");
          set("light");
          return;
        }
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
