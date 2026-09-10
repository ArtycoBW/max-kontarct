"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogPortal = DialogPrimitive.Portal;
const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<React.ElementRef<typeof DialogPrimitive.Overlay>, React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>>(
  ({ className, ...props }, ref) => <DialogPrimitive.Overlay ref={ref} className={cn("dialog-overlay", className)} {...props} />,
);
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const DialogContent = React.forwardRef<React.ElementRef<typeof DialogPrimitive.Content>, React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { showCloseButton?: boolean }>(
  ({ className, children, showCloseButton = true, ...props }, ref) => <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content ref={ref} className={cn("dialog-content", className)} {...props}>
      {children}
      {showCloseButton ? <DialogClose asChild><Button className="dialog-close" variant="ghost" size="icon" type="button" aria-label="Закрыть окно"><X size={20} /></Button></DialogClose> : null}
    </DialogPrimitive.Content>
  </DialogPortal>,
);
DialogContent.displayName = DialogPrimitive.Content.displayName;

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("dialog-header", className)} {...props} />;
}
function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("dialog-footer", className)} {...props} />;
}
const DialogTitle = React.forwardRef<React.ElementRef<typeof DialogPrimitive.Title>, React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>>(
  ({ className, ...props }, ref) => <DialogPrimitive.Title ref={ref} className={cn("dialog-title", className)} {...props} />,
);
DialogTitle.displayName = DialogPrimitive.Title.displayName;
const DialogDescription = React.forwardRef<React.ElementRef<typeof DialogPrimitive.Description>, React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>>(
  ({ className, ...props }, ref) => <DialogPrimitive.Description ref={ref} className={cn("dialog-description", className)} {...props} />,
);
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export { Dialog, DialogTrigger, DialogPortal, DialogClose, DialogOverlay, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription };
