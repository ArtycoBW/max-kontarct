import { MiniAppShell } from "@/components/app/mini-app-shell";

export default function HomePage() {
  return <MiniAppShell showEnvironmentBadge={process.env.NODE_ENV !== "production"} />;
}
