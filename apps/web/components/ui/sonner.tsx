"use client";

import { Toaster as Sonner, type ToasterProps } from "sonner";

export function Toaster(props: ToasterProps) {
  return (
    <Sonner
      className="toaster"
      closeButton
      containerAriaLabel="Уведомления"
      position="top-center"
      richColors
      toastOptions={{
        closeButtonAriaLabel: "Закрыть уведомление",
        classNames: {
          description: "app-toast-description",
          error: "app-toast-error",
          success: "app-toast-success",
          toast: "app-toast",
          title: "app-toast-title",
        },
      }}
      {...props}
    />
  );
}
