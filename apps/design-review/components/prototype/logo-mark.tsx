import { cn } from "@/lib/utils";
import { FileSignature } from "lucide-react";

export function LogoMark({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <div className={cn("app-logo", className)} aria-label="Макс-Контракт">
      <span className="app-logo-mark" aria-hidden="true">
        <FileSignature className="app-logo-jeton-symbol" />
        <span className="app-logo-mercury-symbol">
          <span className="app-logo-mercury-orbit" />
          <span className="app-logo-mercury-node" />
        </span>
        <span className="app-logo-manifesto-symbol">
          <span className="app-logo-manifesto-star" />
        </span>
      </span>
      {!compact && (
        <span className="app-logo-copy">
          <span>МАКС</span><span>КОНТРАКТ</span>
        </span>
      )}
    </div>
  );
}
