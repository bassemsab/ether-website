import { writable } from "svelte/store";

export const isStudioNavigating = writable(false);

let safetyTimer: ReturnType<typeof setTimeout> | null = null;

export function startStudioNavigation() {
  isStudioNavigating.set(true);
  if (safetyTimer) clearTimeout(safetyTimer);
  // Safety fallback: if navigation takes longer than 15s or fails silently, reset
  safetyTimer = setTimeout(() => {
    isStudioNavigating.set(false);
  }, 15000);
}

export function stopStudioNavigation() {
  if (safetyTimer) {
    clearTimeout(safetyTimer);
    safetyTimer = null;
  }
  isStudioNavigating.set(false);
}
