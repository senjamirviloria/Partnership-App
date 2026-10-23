"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import Icon from "@mdi/react";
import { mdiHelpCircleOutline } from "@mdi/js";

export const otherInteractionOpen = () =>
  !!document.querySelector(".maximized-panel") ||
  [...document.querySelectorAll("dialog[open]")].some(
    (dialog) => !dialog.closest("[data-tutorial-root]"),
  );

const TutorialContext = createContext({
  enabled: false, userId: "", admin: false, blocked: false,
  replay: 0, requestReplay: () => {},
});

export const useTutorialEnvironment = () => useContext(TutorialContext);

export const TutorialProvider = ({ enabled, userId, admin, children }: {
  enabled: boolean; userId: string; admin: boolean; children: ReactNode;
}) => {
  const [replay, setReplay] = useState(0);
  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    const update = () => setBlocked(otherInteractionOpen());
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.body, {
      subtree: true, childList: true, attributes: true, attributeFilter: ["open", "class"],
    });
    return () => observer.disconnect();
  }, [enabled]);
  return (
    <TutorialContext.Provider value={{ enabled, userId, admin, blocked, replay, requestReplay: () => setReplay((value) => value + 1) }}>
      {children}
    </TutorialContext.Provider>
  );
};

export const ReplayTutorialButton = () => {
  const { enabled, admin, blocked, requestReplay } = useTutorialEnvironment();
  const pathname = usePathname();
  const router = useRouter();
  if (!enabled) return null;
  return (
    <button type="button" className="icon-button tutorial-replay" aria-label="Replay tutorial" title="Replay tutorial" disabled={blocked} onClick={() => {
      requestReplay();
      if (admin && pathname !== "/admin") router.push("/admin");
    }}>
      <Icon path={mdiHelpCircleOutline} size={0.9} aria-hidden />
    </button>
  );
};
