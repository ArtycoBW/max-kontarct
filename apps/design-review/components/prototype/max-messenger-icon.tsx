import { cn } from "@/lib/utils";

export function MaxMessengerIcon({ className }: { className?: string }) {
  return (
    <svg className={cn("max-messenger-icon", className)} viewBox="0 0 1000 1000" role="img" aria-label="MAX">
      <defs>
        <linearGradient id="max-logo-main" x1="118" x2="1000" y1="761" y2="500" gradientUnits="userSpaceOnUse">
          <stop stopColor="#44ccff" />
          <stop offset=".662" stopColor="#5533ee" />
          <stop offset="1" stopColor="#9933dd" />
        </linearGradient>
        <radialGradient id="max-logo-depth" cx="0" cy="1" r="1" gradientTransform="translate(0 1000) rotate(-43) scale(760 1000)" gradientUnits="userSpaceOnUse">
          <stop stopColor="#0000ff" />
          <stop offset="1" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="1000" height="1000" rx="250" fill="url(#max-logo-main)" />
      <rect width="1000" height="1000" rx="250" fill="url(#max-logo-depth)" />
      <path fill="#fff" fillRule="evenodd" d="M508 878c-75 0-110-11-170-55-38 49-160 88-165 22 0-49-11-91-24-136-14-57-31-119-31-210 0-216 177-379 388-379 211 0 376 171 376 381 1 208-166 376-374 377Zm3-571c-102-5-182 66-200 177-14 92 12 204 34 210 10 3 37-19 53-36a190 190 0 0 0 93 33c106 5 197-76 204-181 4-107-78-197-184-203Z" clipRule="evenodd" />
    </svg>
  );
}
