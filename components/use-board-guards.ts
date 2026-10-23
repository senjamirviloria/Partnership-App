"use client";

import { useEffect } from "react";

const LEAVE_MESSAGE = "You have unsaved assignments. Leave without saving?";

/** Guard document exits, app links, sign-out, and cancellable history traversal. */
export const useUnsavedBoard = (dirty: boolean) => {
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const confirmLeave = (event: Event) => {
      if (!window.confirm(LEAVE_MESSAGE)) event.preventDefault();
    };
    const linkClick = (event: MouseEvent) => {
      const anchor =
        event.target instanceof Element ? event.target.closest("a") : null;
      if (
        !anchor ||
        anchor.target === "_blank" ||
        anchor.hasAttribute("download") ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const destination = new URL(anchor.href);
      if (
        destination.pathname === location.pathname &&
        destination.search === location.search
      )
        return;
      if (!window.confirm(LEAVE_MESSAGE)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    const navigation = (window as Window & { navigation?: EventTarget })
      .navigation;
    const traverse = (event: Event) => {
      if (
        (event as Event & { navigationType?: string }).navigationType ===
          "traverse" &&
        event.cancelable
      )
        confirmLeave(event);
    };
    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("partnership-before-leave", confirmLeave);
    document.addEventListener("click", linkClick, true);
    navigation?.addEventListener("navigate", traverse);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener("partnership-before-leave", confirmLeave);
      document.removeEventListener("click", linkClick, true);
      navigation?.removeEventListener("navigate", traverse);
    };
  }, [dirty]);
};

/** Keep keyboard focus inside an expanded board panel and restore it on exit. */
export const useFullscreenPanel = (panel: string | null, close: () => void) => {
  useEffect(() => {
    if (!panel) return;
    const element = document.getElementById(`panel-${panel}`);
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    element?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (document.querySelector("dialog[open]")) return;
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
      if (event.key !== "Tab" || !element) return;
      const controls = [
        ...element.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
        ),
      ].filter((control) => control.getClientRects().length > 0);
      const first = controls[0];
      const last = controls.at(-1);
      if (
        event.shiftKey &&
        (document.activeElement === first || document.activeElement === element)
      ) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", keydown);
    return () => {
      document.removeEventListener("keydown", keydown);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [panel, close]);
};
