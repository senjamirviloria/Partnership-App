"use client";

import { useEffect, useRef, type ReactNode } from "react";

type Props = {
  title: string;
  children: ReactNode;
  onClose: () => void;
  drawer?: boolean;
  busy?: boolean;
};

export const Modal = ({
  title,
  children,
  onClose,
  drawer = false,
  busy = false,
}: Props) => {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog?.showModal();
    return () => {
      dialog?.close();
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`app-dialog ${drawer ? "app-drawer" : ""}`}
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div className="dialog-content">
        <header className="dialog-heading">
          <h2>{title}</h2>
          <button
            type="button"
            className="icon-button"
            aria-label={`Close ${title}`}
            disabled={busy}
            onClick={onClose}
          >
            ×
          </button>
        </header>
        {children}
      </div>
    </dialog>
  );
};
