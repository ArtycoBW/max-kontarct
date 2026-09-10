"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "./button";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogClose, DialogFooter } from "./dialog";

/** Shared layout only; focus, portals, dismissal and accessibility belong to shadcn Dialog. */
export function Modal({ open, onClose, title, children, footer, trigger }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; trigger?: ReactNode;
}) {
  return <Dialog open={open} onOpenChange={next => { if (!next) onClose(); }}>
    {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
    <DialogContent className="app-modal" showCloseButton={false} aria-describedby={undefined}>
      <DialogHeader className="app-modal-header"><DialogTitle>{title}</DialogTitle>
        <DialogClose asChild><Button variant="unstyled" className="app-modal-close" type="button" aria-label="Закрыть окно"><X size={20} /></Button></DialogClose>
      </DialogHeader>
      <div className="app-modal-body">{children}</div>
      {footer ? <DialogFooter className="app-modal-footer">{footer}</DialogFooter> : null}
    </DialogContent>
  </Dialog>;
}
