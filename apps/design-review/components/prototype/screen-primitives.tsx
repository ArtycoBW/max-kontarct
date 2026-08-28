"use client";

import type { ReactNode } from "react";
import { ArrowLeft, ChevronRight, FileText } from "lucide-react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ConceptSlug } from "@/lib/types";
import { usePrototypeConcept } from "@/components/prototype/prototype-concept-context";

export function PhoneStatusBar() {
  return (
    <div className="phone-status" aria-hidden="true">
      <span className="phone-status-time">9:41</span>
      <span className="phone-status-system">
        <svg className="phone-status-signal" viewBox="0 0 17 11">
          <rect x="0" y="8" width="2.4" height="3" rx=".7" />
          <rect x="4.2" y="6" width="2.4" height="5" rx=".7" />
          <rect x="8.4" y="3.5" width="2.4" height="7.5" rx=".7" />
          <rect x="12.6" y=".5" width="2.4" height="10.5" rx=".7" />
        </svg>
        <svg className="phone-status-wifi" viewBox="0 0 17 12" fill="none">
          <path d="M1.4 4.1a10.7 10.7 0 0 1 14.2 0" />
          <path d="M4 7a6.7 6.7 0 0 1 9 0" />
          <path d="M6.8 9.7a2.7 2.7 0 0 1 3.4 0" />
          <circle cx="8.5" cy="10.4" r=".8" fill="currentColor" stroke="none" />
        </svg>
        <span className="phone-status-battery"><i /></span>
      </span>
    </div>
  );
}

export function ScreenScaffold({
  children,
  footer,
  bottomNav,
  className,
}: {
  children: ReactNode;
  footer?: ReactNode;
  bottomNav?: ReactNode;
  className?: string;
}) {
  const concept = usePrototypeConcept();
  return (
    <div className={cn("app-screen", `app-screen--${concept}`, className)}>
      <PhoneStatusBar />
      <div className="app-screen-scroll">{children}</div>
      {footer ? <div className="app-footer">{footer}</div> : null}
      {bottomNav}
      <div className="phone-home-indicator" aria-hidden="true" />
    </div>
  );
}

export function ScreenHeader({
  title,
  eyebrow,
  onBack,
  action,
}: {
  title: string;
  eyebrow?: string;
  onBack?: () => void;
  action?: ReactNode;
}) {
  const concept = usePrototypeConcept();
  return (
    <div className={cn("screen-head", `screen-head--${concept}`)}>
      <div className="min-w-0">
        {eyebrow && <div className="screen-eyebrow mb-2">{eyebrow}</div>}
        <div className="flex items-center gap-2">
          {onBack && (
            <button type="button" onClick={onBack} className="-ml-2 grid size-8 shrink-0 place-items-center rounded-full hover:bg-[var(--app-surface-soft)]" aria-label="Назад">
              <ArrowLeft size={18} />
            </button>
          )}
          <h1 className={cn("screen-title", title.length >= 17 && "screen-title-long", title.length >= 23 && "screen-title-wrap")}>{title}</h1>
        </div>
      </div>
      {action}
    </div>
  );
}

export function AppButton({
  children,
  variant = "primary",
  className,
  ...props
}: Omit<ButtonProps, "variant"> & { variant?: "primary" | "secondary" | "ghost" }) {
  return (
    <Button variant="ghost" type="button" className={cn("app-button h-auto shadow-none hover:bg-transparent", variant, className)} {...props}>
      {children}
    </Button>
  );
}

export function AppCard({ children, className, tint = false, ...props }: React.HTMLAttributes<HTMLDivElement> & { tint?: boolean }) {
  const concept = usePrototypeConcept();
  return <Card data-card-system={concept} className={cn("app-card text-[var(--app-text)] shadow-none", tint && "tint", className)} {...props}>{children}</Card>;
}

export function AppInput({ className, ...props }: React.ComponentProps<typeof Input>) {
  return <Input className={cn("app-input h-auto shadow-none focus-visible:ring-0 focus-visible:ring-offset-0", className)} {...props} />;
}

export function AppTextarea({ className, ...props }: React.ComponentProps<typeof Textarea>) {
  return <Textarea className={cn("app-textarea shadow-none focus-visible:ring-0 focus-visible:ring-offset-0", className)} {...props} />;
}

export function ConceptSelect({
  concept,
  defaultValue,
  value,
  onValueChange,
  options,
  placeholder,
}: {
  concept: ConceptSlug;
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  placeholder?: string;
}) {
  const contentClass = {
    jeton: "border-[#dce5f2] bg-white text-[#17243a] rounded-xl",
    caldera: "border-[#e4e4e7] bg-white text-[#18181b] rounded-xl font-medium",
    contractbook: "mercury-select-content rounded-xl border-[#70707d] bg-[#1e1e2a] font-normal text-[#ededf3] shadow-none",
    auros: "editorial-select-content rounded-2xl border-[#e6d8cf] bg-[#fffaf6] font-medium text-[#1c1714] shadow-lg",
  }[concept];
  return (
    <Select defaultValue={defaultValue} value={value} onValueChange={onValueChange}>
      <SelectTrigger className="app-select h-auto min-h-11 shadow-none focus:ring-0 focus:ring-offset-0">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent position="popper" sideOffset={6} className={cn("z-[100] p-1", concept === "contractbook" ? "shadow-none" : "shadow-xl", contentClass)}>
        {options.map((option) => <SelectItem key={option.value} value={option.value} className={cn("rounded-lg py-2.5 text-xs focus:text-current", concept === "contractbook" ? "focus:bg-[#272735]" : concept === "auros" ? "focus:bg-[#fbe1d1]" : "focus:bg-black/[.055]")}>{option.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

export function ActionFooter({ children }: { children: ReactNode }) {
  return <div className="grid gap-2">{children}</div>;
}

export function DetailRow({
  icon,
  label,
  value,
  onClick,
  accent = false,
}: {
  icon?: ReactNode;
  label: string;
  value?: string;
  onClick?: () => void;
  accent?: boolean;
}) {
  const concept = usePrototypeConcept();
  const rowClass = cn("detail-row flex items-center gap-3 rounded-[var(--app-radius-input)] p-2", `detail-row--${concept}`);
  const content = (
    <>
      {icon && <span className={cn("app-icon-tile grid size-9 shrink-0 place-items-center rounded-xl", accent && "text-[var(--app-icon)]")}>{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className="block text-[12px] font-bold leading-snug">{label}</span>
        {value && <span className="mt-1 block line-clamp-2 text-[10px] leading-relaxed text-[var(--app-muted)]">{value}</span>}
      </span>
      {onClick && <ChevronRight size={16} className="text-[var(--app-muted)]" />}
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} className={cn(rowClass,"w-full text-left hover:bg-[var(--app-surface-soft)]")}>{content}</button>
  ) : (
    <div className={rowClass}>{content}</div>
  );
}

export function DocumentRow({ name, meta, status, onClick }: { name: string; meta: string; status?: string; onClick?: () => void }) {
  const concept = usePrototypeConcept();
  const content = (
    <>
      <span className="app-icon-tile grid size-9 shrink-0 place-items-center rounded-xl"><FileText size={17} /></span>
      <span className="min-w-0 flex-1"><span className="line-clamp-2 block text-[11px] font-bold leading-snug">{name}</span><span className="mt-1 block text-[10px] leading-snug text-[var(--app-muted)]">{meta}</span></span>
      {status && <span className="status-pill shrink-0 rounded-full bg-[color-mix(in_srgb,var(--app-success)_12%,transparent)] px-2 py-1 text-[9px] font-bold text-[var(--app-success)]">{status}</span>}
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} className={cn("document-row flex w-full items-center gap-3 rounded-[var(--app-radius-input)] p-3 text-left",`document-row--${concept}`)}>
      {content}
    </button>
  ) : (
    <div className={cn("document-row flex w-full items-center gap-3 rounded-[var(--app-radius-input)] p-3 text-left",`document-row--${concept}`)}>
      {content}
    </div>
  );
}

export function FormField({ label, children }: { label: string; children: ReactNode }) {
  return <label className="app-label"><span>{label}</span>{children}</label>;
}

export function StateIcon({ children, tone = "primary" }: { children: ReactNode; tone?: "primary" | "success" | "danger" | "warning" }) {
  const concept = usePrototypeConcept();
  const toneClass = {
    primary: "bg-[var(--app-icon-surface)] text-[var(--app-icon)]",
    success: "bg-[color-mix(in_srgb,var(--app-success)_12%,transparent)] text-[var(--app-success)]",
    danger: "bg-[color-mix(in_srgb,var(--app-danger)_12%,transparent)] text-[var(--app-danger)]",
    warning: "bg-[#fff0d7] text-[#c77600]",
  }[tone];
  return <motion.div initial={{ scale: .88, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className={cn("state-icon mx-auto grid size-20 place-items-center rounded-full", `state-icon--${concept}`, `state-icon-${tone}`, toneClass)}>{children}</motion.div>;
}
