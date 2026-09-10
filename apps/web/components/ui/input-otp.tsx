"use client";

import * as React from "react";
import { OTPInput, OTPInputContext } from "input-otp";
import { cn } from "@/lib/utils";

const InputOTP = React.forwardRef<React.ElementRef<typeof OTPInput>, React.ComponentPropsWithoutRef<typeof OTPInput>>(
  ({ className, containerClassName, ...props }, ref) => <OTPInput ref={ref} containerClassName={cn("input-otp", containerClassName)} className={className} {...props} />,
);
InputOTP.displayName = "InputOTP";
const InputOTPGroup = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<"div">>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn("input-otp-group", className)} {...props} />,
);
InputOTPGroup.displayName = "InputOTPGroup";
const InputOTPSlot = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<"div"> & { index: number }>(
  ({ index, className, ...props }, ref) => {
    const { char, hasFakeCaret, isActive } = React.useContext(OTPInputContext).slots[index] ?? {};
    return <div ref={ref} className={cn("input-otp-slot", isActive && "is-active", className)} {...props}>
      {char}
      {hasFakeCaret ? <span className="input-otp-caret" aria-hidden="true" /> : null}
    </div>;
  },
);
InputOTPSlot.displayName = "InputOTPSlot";
export { InputOTP, InputOTPGroup, InputOTPSlot };
