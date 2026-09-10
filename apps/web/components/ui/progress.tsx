"use client";

import * as React from "react";
import * as ProgressPrimitive from "@radix-ui/react-progress";
import { cn } from "@/lib/utils";

const Progress = React.forwardRef<React.ElementRef<typeof ProgressPrimitive.Root>, React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root>>(
  ({ className, value, max = 100, ...props }, ref) => <ProgressPrimitive.Root ref={ref} className={cn("progress", className)} value={value} max={max} {...props}>
    <ProgressPrimitive.Indicator className="progress-indicator" style={{ transform: `translateX(-${100 - Math.min(100, Math.max(0, ((value ?? 0) / max) * 100))}%)` }} />
  </ProgressPrimitive.Root>,
);
Progress.displayName = ProgressPrimitive.Root.displayName;
export { Progress };
