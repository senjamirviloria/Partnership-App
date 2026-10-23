"use client";

import { useEffect, useSyncExternalStore } from "react";

const STORAGE_KEY = "partnership_app:theme";
type Theme = "system" | "light" | "dark";
let memoryPreference: Theme | null = null;

const getPreference = (): Theme => {
  if (memoryPreference) return memoryPreference;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : "system";
  } catch {
    return "system";
  }
};

const getSnapshot = () => {
  const preference = getPreference();
  const dark =
    preference === "dark" ||
    (preference === "system" &&
      matchMedia("(prefers-color-scheme: dark)").matches);
  return `${preference}:${dark ? "dark" : "light"}`;
};

const subscribe = (notify: () => void) => {
  const media = matchMedia("(prefers-color-scheme: dark)");
  const update = () => {
    document.documentElement.classList.toggle(
      "dark",
      getSnapshot().endsWith(":dark"),
    );
    notify();
  };
  const storage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === null) {
      memoryPreference = null;
      update();
    }
  };
  media.addEventListener("change", update);
  window.addEventListener("storage", storage);
  window.addEventListener("partnership-theme", update);
  update();
  return () => {
    media.removeEventListener("change", update);
    window.removeEventListener("storage", storage);
    window.removeEventListener("partnership-theme", update);
  };
};

export const ThemeControl = () => {
  const snapshot = useSyncExternalStore(
    subscribe,
    getSnapshot,
    () => "system:light",
  );
  useEffect(() => {
    document.documentElement.classList.toggle(
      "dark",
      getSnapshot().endsWith(":dark"),
    );
  }, []);
  return (
    <label className="theme-control">
      <span>Appearance</span>
      <select
        aria-label="Appearance"
        value={snapshot.split(":")[0]}
        onChange={(event) => {
          const preference = event.target.value as Theme;
          memoryPreference = preference;
          try {
            if (preference === "system") localStorage.removeItem(STORAGE_KEY);
            else localStorage.setItem(STORAGE_KEY, preference);
          } catch {
            /* Keep the preference for this page when storage is unavailable. */
          }
          window.dispatchEvent(new Event("partnership-theme"));
        }}
      >
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </label>
  );
};
