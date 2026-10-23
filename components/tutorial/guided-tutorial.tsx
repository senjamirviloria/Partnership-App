"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { Modal } from "@/components/modal";
import { otherInteractionOpen, useTutorialEnvironment } from "./tutorial-provider";
import { readTutorial, setTutorialPreference, subscribeTutorial, tutorialKey, writeTutorial, type TutorialKind, type TutorialProgress } from "./tutorial-storage";

export type TutorialStep = {
  id: string;
  title: string;
  description: string;
  target: string;
  ready?: boolean;
  hint?: string;
};

type Props = {
  kind: TutorialKind;
  eligible: boolean;
  title: string;
  introduction: string;
  steps: TutorialStep[];
  canStart?: boolean;
  unavailableMessage?: string;
  onStep?: (id: string) => void;
  finishLabel?: string;
  onFinish?: () => void;
};

/** Resumable guidance: native welcome dialog, then non-modal coaching. */
export const GuidedTutorial = ({
  kind, eligible, title, introduction, steps, canStart = true,
  unavailableMessage, onStep, finishLabel = "Finish tutorial", onFinish,
}: Props) => {
  const { enabled, userId, blocked, replay } = useTutorialEnvironment();
  const key = tutorialKey(userId, kind);
  const record = useSyncExternalStore(
    subscribeTutorial,
    () => enabled ? readTutorial(key) : null,
    () => null,
  );
  const panel = useRef<HTMLElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const handledReplay = useRef(0);
  const stepCallback = useRef(onStep);
  useEffect(() => { stepCallback.current = onStep; }, [onStep]);

  useEffect(() => {
    if (!enabled) return;
    const url = new URL(window.location.href);
    if (kind === "workspace" && url.searchParams.get("tutorial") === "start") {
      const initial: TutorialProgress = { status: "active", step: 0 };
      url.searchParams.delete("tutorial");
      window.history.replaceState(window.history.state, "", url);
      writeTutorial(key, initial);
    }
  }, [enabled, key, kind]);

  useEffect(() => {
    if (!enabled || !eligible || !replay || handledReplay.current === replay || blocked) return;
    handledReplay.current = replay;
    const initial: TutorialProgress = { status: "active", step: 0 };
    writeTutorial(key, initial);
  }, [enabled, eligible, replay, blocked, key]);

  const active = enabled && eligible && record?.show === true;
  const index = Math.min(record?.step ?? 0, steps.length);
  const step = index > 0 ? steps[index - 1] : null;
  const visible = active && !blocked;
  const stepId = step?.id;
  const stepTarget = step?.target;

  const update = (next: TutorialProgress) => {
    writeTutorial(key, next);
  };
  const skip = () => update({ status: "skipped", step: index });

  useEffect(() => {
    if (!active) return;
    previousFocus.current = document.activeElement as HTMLElement | null;
    return () => {
      const previous = previousFocus.current;
      if (previous?.isConnected && previous !== document.body) previous.focus();
      else document.querySelector<HTMLButtonElement>(".tutorial-replay")?.focus();
    };
  }, [active]);

  useEffect(() => {
    if (!visible || !stepId) return;
    stepCallback.current?.(stepId);
    panel.current?.focus({ preventScroll: true });
  }, [visible, stepId]);

  useEffect(() => {
    if (!visible || !stepTarget) return;
    let target: HTMLElement | null = null;
    let frame = 0;
    const position = (scroll = false) => {
      target?.classList.remove("tutorial-target");
      target = [...document.querySelectorAll<HTMLElement>(stepTarget)]
        .find((element) => element.getClientRects().length > 0) ?? null;
      target?.classList.add("tutorial-target");
      if (scroll && target) target.scrollIntoView({ block: "start", behavior: "instant" });
      const height = panel.current?.getBoundingClientRect().height ?? 240;
      const save = document.querySelector<HTMLElement>(".mobile-save-bar");
      const saveHeight = save?.getClientRects().length ? save.getBoundingClientRect().height : 0;
      document.documentElement.style.setProperty("--tutorial-height", `${height}px`);
      document.documentElement.style.setProperty("--tutorial-save-height", `${saveHeight}px`);
    };
    const refresh = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => position());
    };
    document.documentElement.classList.add("tutorial-open");
    frame = requestAnimationFrame(() => position(true));
    const observer = new ResizeObserver(refresh);
    if (panel.current) observer.observe(panel.current);
    const save = document.querySelector(".mobile-save-bar");
    if (save) observer.observe(save);
    window.addEventListener("resize", refresh);
    window.addEventListener("scroll", refresh, true);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", refresh);
      window.removeEventListener("scroll", refresh, true);
      target?.classList.remove("tutorial-target");
      document.documentElement.classList.remove("tutorial-open");
      document.documentElement.style.removeProperty("--tutorial-height");
      document.documentElement.style.removeProperty("--tutorial-save-height");
    };
  }, [visible, stepTarget, stepId]);

  useEffect(() => {
    if (!visible || !stepId) return;
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !otherInteractionOpen()) {
        event.preventDefault();
        writeTutorial(key, { status: "skipped", step: index });
      }
    };
    document.addEventListener("keydown", keydown);
    return () => document.removeEventListener("keydown", keydown);
  }, [visible, stepId, key, index]);

  if (!visible) return null;
  const rememberChoice = (
    <label className="tutorial-remember">
      <input type="checkbox" checked={record?.dontShowAgain ?? true} onChange={(event) => setTutorialPreference(key, event.target.checked)} />
      <span>Don&apos;t show this tutorial again.</span>
    </label>
  );
  return (
    <div data-tutorial-root>
      {!step ? (
        <Modal title={title} onClose={skip}>
          <p className="tutorial-description">{introduction}</p>
          {!canStart && <p role="status" className="notice">{unavailableMessage}</p>}
          {rememberChoice}
          <div className="tutorial-actions">
            <button type="button" className="button-secondary" onClick={skip}>Skip tutorial</button>
            <button type="button" className="button-primary" disabled={!canStart} onClick={() => update({ status: "active", step: 1 })}>Start tutorial</button>
          </div>
        </Modal>
      ) : (
        <section ref={panel} className="tutorial-coach" role="dialog" aria-modal="false" aria-labelledby="tutorial-heading" aria-describedby="tutorial-description" tabIndex={-1}>
          <div className="tutorial-heading-row">
            <span className="eyebrow">Step {index} of {steps.length}</span>
            <button type="button" className="tutorial-skip" onClick={skip}>Skip tutorial</button>
          </div>
          <h2 id="tutorial-heading">{step.title}</h2>
          <p id="tutorial-description">{step.description}</p>
          <p role="status" className="tutorial-hint">{step.ready === false ? step.hint : "Ready to continue."}</p>
          {rememberChoice}
          <div className="tutorial-actions">
            <button type="button" className="button-secondary" onClick={() => update({ status: "active", step: index - 1 })}>Back</button>
            <button type="button" className="button-primary" disabled={step.ready === false} onClick={() => {
              if (index < steps.length) update({ status: "active", step: index + 1 });
              else {
                update({ status: "completed", step: index });
                onFinish?.();
              }
            }}>{index === steps.length ? finishLabel : "Next"}</button>
          </div>
        </section>
      )}
    </div>
  );
};
