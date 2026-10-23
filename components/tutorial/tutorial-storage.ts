export type TutorialKind = "admin" | "workspace";
export type TutorialProgress = {
  status: "active" | "completed" | "skipped";
  step: number;
};

const memory = new Map<string, TutorialProgress>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

export const subscribeTutorial = (listener: () => void) => {
  listeners.add(listener);
  const changed = (event: StorageEvent) => {
    if (event.key?.startsWith("partnership:tutorial:v1:")) {
      memory.delete(event.key);
      notify();
    } else if (event.key === null) {
      memory.clear();
      notify();
    }
  };
  window.addEventListener("storage", changed);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", changed);
  };
};
export const tutorialKey = (userId: string, kind: TutorialKind) =>
  `partnership:tutorial:v1:${encodeURIComponent(userId)}:${kind}`;

/** Keep browser failures from preventing sign-in or workspace use. */
export const readTutorial = (key: string): TutorialProgress => {
  const cached = memory.get(key);
  if (cached) return cached;
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? "null");
    if (
      value &&
      ["active", "completed", "skipped"].includes(value.status) &&
      Number.isInteger(value.step) && value.step >= 0
    ) {
      memory.set(key, value);
      return value;
    }
  } catch {
    // Fall back to this document's memory when storage is unavailable.
  }
  const initial: TutorialProgress = { status: "active", step: 0 };
  memory.set(key, initial);
  return initial;
};

export const writeTutorial = (key: string, value: TutorialProgress) => {
  memory.set(key, value);
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Memory remains available across client-side navigation in this document.
  }
  notify();
};
