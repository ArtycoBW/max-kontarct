import { MiniAppShell } from "@/components/app/mini-app-shell";

export const dynamic = "force-dynamic";

export default function HomePage() {
  return <MiniAppShell showEnvironmentBadge={process.env.NODE_ENV !== "production"} />;
}
