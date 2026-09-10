import * as React from "react";
import { cn } from "@/lib/utils";

const Alert = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & { variant?: "default" | "destructive" }>(
  ({ className, variant = "default", ...props }, ref) => <div ref={ref} role="alert" className={cn("alert", variant === "destructive" && "alert-destructive", className)} {...props} />,
);
Alert.displayName = "Alert";
const AlertTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => <h3 ref={ref} className={cn("alert-title", className)} {...props} />,
);
AlertTitle.displayName = "AlertTitle";
const AlertDescription = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn("alert-description", className)} {...props} />,
);
AlertDescription.displayName = "AlertDescription";
export { Alert, AlertTitle, AlertDescription };
