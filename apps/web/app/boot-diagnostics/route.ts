import { handleBootReport } from "@/lib/diagnostics/boot-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const POST = handleBootReport;
// Reports are only available in the server's protected service log.
export function GET() { return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } }); }
