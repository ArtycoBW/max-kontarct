"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

/** Native top layer: stays inside MAX's viewport, with a fixed header and scrolling body. */
export function Modal({ open, onClose, title, children, footer }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return <dialog ref={ref} className="app-modal" aria-labelledby={titleId}
    onCancel={onClose} onClose={onClose} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="app-modal-panel">
      <header className="app-modal-header"><h2 id={titleId}>{title}</h2>
        <button className="app-modal-close" type="button" aria-label="Закрыть окно" onClick={onClose}><X size={20} /></button>
      </header>
      <div className="app-modal-body">{children}</div>
      {footer ? <footer className="app-modal-footer">{footer}</footer> : null}
    </div>
  </dialog>;
}
