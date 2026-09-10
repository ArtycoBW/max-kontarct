import { randomBytes } from "node:crypto";

import { MiniAppShell } from "@/components/app/mini-app-shell";
import { isBootProbe } from "@/lib/diagnostics/boot-schema";
import { createBootScript } from "@/lib/diagnostics/boot-script";
import { recordBootDocument } from "@/lib/diagnostics/boot-server";

export const dynamic = "force-dynamic";

export default async function HomePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const probe = (await searchParams).WebAppStartParam;
  const run = isBootProbe(probe) ? randomBytes(8).toString("hex") : null;
  if (run) recordBootDocument(run);
  return <>
    {run ? <script id="max-boot-diagnostic" dangerouslySetInnerHTML={{ __html: createBootScript(run) }} /> : null}
    <MiniAppShell showEnvironmentBadge={process.env.NODE_ENV !== "production"} />
  </>;
}
