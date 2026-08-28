import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export const buttonVariants = cva("", {
  defaultVariants: {
    size: "default",
    variant: "primary",
  },
  variants: {
    size: {
      default: "button-default",
      icon: "button-icon",
      sm: "button-sm",
    },
    variant: {
      ghost: "button button-ghost",
      outline: "button button-outline",
      primary: "button button-primary",
      secondary: "button button-secondary",
      unstyled: "button-unstyled",
    },
  },
});

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export function Button({
  asChild = false,
  className,
  size,
  variant,
  ...props
}: ButtonProps) {
  const Component = asChild ? Slot : "button";
  return (
    <Component
      className={cn(buttonVariants({ size, variant }), className)}
      {...props}
    />
  );
}
