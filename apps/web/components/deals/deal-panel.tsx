"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

/** One scroll surface for reading, with actions kept outside the document text. */
export function DealPanel({ title, description, icon, children, footer, className = "" }: {
  title: string; description: string; icon: ReactNode; children: ReactNode; footer?: ReactNode; className?: string;
}) {
  const [open, setOpen] = useState(false);
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild><Button variant="outline" className="deal-panel-trigger">
      <span className="deal-panel-icon" aria-hidden="true">{icon}</span>
      <span><strong>{title}</strong><small>{description}</small></span>
      <span className="deal-panel-open">Открыть</span>
    </Button></DialogTrigger>
    <DialogContent className={`deal-panel-dialog ${className}`}>
      <DialogHeader className="deal-panel-header"><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>
      <div className="deal-panel-body">{children}</div>
      {footer ? <div className="deal-panel-footer">{footer}</div> : null}
    </DialogContent>
  </Dialog>;
}
