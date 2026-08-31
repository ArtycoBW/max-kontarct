import type { PublicDealInvitationResponse } from "@max-contract/contracts";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PublicInvitationPage } from "@/components/invitations/public-invitation-page";

export const dynamic = "force-dynamic";

type InvitationRouteProps = {
  params: Promise<{ publicCode: string }>;
};

async function loadInvitation(publicCode: string): Promise<PublicDealInvitationResponse | null> {
  if (!/^[A-Za-z0-9_-]{12}$/.test(publicCode)) return null;
  const baseUrl =
    process.env.API_INTERNAL_BASE_URL ?? "http://127.0.0.1:3001/api/v1";
  try {
    const response = await fetch(
      `${baseUrl.replace(/\/$/, "")}/public/invitations/${encodeURIComponent(publicCode)}`,
      { cache: "no-store" },
    );
    return response.ok ? (await response.json()) as PublicDealInvitationResponse : null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: InvitationRouteProps): Promise<Metadata> {
  const { publicCode } = await params;
  const invitation = await loadInvitation(publicCode);
  if (!invitation) return { title: "Приглашение недоступно — Макс-Контракт" };
  const title = `${invitation.templateTitle} — приглашение в Макс-Контракт`;
  const description = `Безопасно ознакомьтесь с условиями версии ${invitation.versionNumber} и продолжите оформление в MAX.`;
  return {
    description,
    openGraph: {
      description,
      siteName: "Макс-Контракт",
      title,
      type: "website",
    },
    robots: { follow: false, index: false },
    title,
  };
}

export default async function InvitationRoute({ params }: InvitationRouteProps) {
  const { publicCode } = await params;
  const invitation = await loadInvitation(publicCode);
  if (!invitation) notFound();
  return <PublicInvitationPage invitation={invitation} />;
}
