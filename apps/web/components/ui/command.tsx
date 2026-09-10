"use client";

import * as React from "react";
import { Command as CommandPrimitive } from "cmdk";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

const Command = React.forwardRef<React.ElementRef<typeof CommandPrimitive>, React.ComponentPropsWithoutRef<typeof CommandPrimitive>>(
  ({ className, ...props }, ref) => <CommandPrimitive ref={ref} className={cn("command", className)} {...props} />,
);
Command.displayName = CommandPrimitive.displayName;
const CommandInput = React.forwardRef<React.ElementRef<typeof CommandPrimitive.Input>, React.ComponentPropsWithoutRef<typeof CommandPrimitive.Input>>(
  ({ className, ...props }, ref) => <div className="command-input-wrapper"><Search size={16} aria-hidden="true" /><CommandPrimitive.Input ref={ref} className={cn("input command-input", className)} {...props} /></div>,
);
CommandInput.displayName = CommandPrimitive.Input.displayName;
const CommandList = React.forwardRef<React.ElementRef<typeof CommandPrimitive.List>, React.ComponentPropsWithoutRef<typeof CommandPrimitive.List>>(
  ({ className, ...props }, ref) => <CommandPrimitive.List ref={ref} className={cn("command-list", className)} {...props} />,
);
CommandList.displayName = CommandPrimitive.List.displayName;
const CommandItem = React.forwardRef<React.ElementRef<typeof CommandPrimitive.Item>, React.ComponentPropsWithoutRef<typeof CommandPrimitive.Item>>(
  ({ className, ...props }, ref) => <CommandPrimitive.Item ref={ref} className={cn("command-item", className)} {...props} />,
);
CommandItem.displayName = CommandPrimitive.Item.displayName;
export { Command, CommandInput, CommandList, CommandItem };
