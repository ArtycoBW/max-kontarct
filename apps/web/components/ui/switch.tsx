"use client";

import * as SwitchPrimitive from "@radix-ui/react-switch";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

export function Switch({
  className,
  ...props
}: ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn("switch-root", className)}
      data-slot="switch"
      {...props}
    >
      <SwitchPrimitive.Thumb
        className="switch-thumb"
        data-slot="switch-thumb"
      />
    </SwitchPrimitive.Root>
  );
}
