export type TutorialKind = "admin" | "workspace";
export type TutorialProgress = {
  status: "active" | "completed" | "skipped";
  step: number;
  dismissedLoginId?: string;
};
type TutorialSnapshot = TutorialProgress & { dontShowAgain: boolean; show: boolean };

const memory = new Map<string, TutorialSnapshot>();
const savedProgress = new Map<string, TutorialProgress>();
const preferences = new Map<string, boolean>();
const logins = new Map<string, string>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());
const preferenceKey = (key: string) => `${key}:dont-show-again`;
const loginKey = (key: string) => `${key.slice(0, key.lastIndexOf(":"))}:login`;
export const tutorialKey = (userId: string, kind: TutorialKind) =>
  `partnership:tutorial:v1:${encodeURIComponent(userId)}:${kind}`;

const currentLogin = (key: string) => {
  const markerKey = loginKey(key);
  const cached = logins.get(markerKey);
  if (cached) return cached;
  try {
    const value = localStorage.getItem(markerKey);
    if (value) return value;
  } catch {
    // No authentication information is stored here; this is only a reminder marker.
  }
  return logins.get(markerKey) ?? "existing-session";
};

/** Called only after a successful, tutorial-enabled sign-in. */
export const markTutorialLogin = (userId: string) => {
  const key = loginKey(tutorialKey(userId, "workspace"));
  const marker = window.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  logins.set(key, marker);
  try { localStorage.setItem(key, marker); } catch { /* Keep the in-memory marker. */ }
  memory.delete(tutorialKey(userId, "admin"));
  memory.delete(tutorialKey(userId, "workspace"));
  notify();
};

export const subscribeTutorial = (listener: () => void) => {
  listeners.add(listener);
  const changed = (event: StorageEvent) => {
    if (event.key?.startsWith("partnership:tutorial:v1:")) {
      // A preference or sign-in change may affect either snapshot for this account.
      memory.clear();
      savedProgress.clear();
      preferences.clear();
      logins.clear();
      notify();
    } else if (event.key === null) {
      memory.clear();
      savedProgress.clear();
      preferences.clear();
      logins.clear();
      notify();
    }
  };
  window.addEventListener("storage", changed);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", changed);
  };
};

/** Reconcile saved progress with preferences only when opening a document/account. */
export const readTutorial = (key: string): TutorialSnapshot => {
  const cached = memory.get(key);
  if (cached) return cached;
  let stored: TutorialProgress | null = savedProgress.get(key) ?? null;
  let preference = preferences.get(key);
  try {
    const rawPreference = preference === undefined ? localStorage.getItem(preferenceKey(key)) : null;
    if (rawPreference === "true" || rawPreference === "false") preference = rawPreference === "true";
    const value = stored === null ? JSON.parse(localStorage.getItem(key) ?? "null") : null;
    if (value && ["active", "completed", "skipped"].includes(value.status) && Number.isInteger(value.step) && value.step >= 0) {
      stored = { status: value.status, step: value.step,
        dismissedLoginId: typeof value.dismissedLoginId === "string" ? value.dismissedLoginId : undefined };
    }
  } catch {
    // Storage is optional; cached state remains usable during client-side navigation.
  }
  if (stored) savedProgress.set(key, stored);
  const dontShowAgain = preference ?? true;
  let progress = stored ?? { status: "active" as const, step: 0 };
  if (progress.status === "skipped" && !dontShowAgain && progress.dismissedLoginId !== currentLogin(key)) {
    progress = { status: "active", step: 0 };
  }
  const snapshot: TutorialSnapshot = {
    ...progress, dontShowAgain,
    // Legacy active records still resume. An explicit checked preference suppresses later automatic visits.
    show: progress.status === "active" && preference !== true,
  };
  memory.set(key, snapshot);
  return snapshot;
};

export const writeTutorial = (key: string, value: TutorialProgress) => {
  const previous = readTutorial(key);
  const progress: TutorialProgress = { status: value.status, step: value.step,
    dismissedLoginId: value.status === "skipped" ? currentLogin(key) : undefined };
  const snapshot = { ...progress, dontShowAgain: previous.dontShowAgain, show: value.status === "active" };
  memory.set(key, snapshot);
  savedProgress.set(key, progress);
  preferences.set(key, snapshot.dontShowAgain);
  try {
    localStorage.setItem(key, JSON.stringify(progress));
    localStorage.setItem(preferenceKey(key), String(snapshot.dontShowAgain));
  } catch {
    // Memory remains available across client-side navigation in this document.
  }
  notify();
};

/** Persist the checkbox without changing the currently open tutorial's visibility. */
export const setTutorialPreference = (key: string, dontShowAgain: boolean) => {
  const current = readTutorial(key);
  memory.set(key, { ...current, dontShowAgain });
  writeTutorial(key, current);
};
