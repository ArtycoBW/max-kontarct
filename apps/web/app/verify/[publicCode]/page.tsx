import type { PublicDocumentVerificationResponse } from "@max-contract/contracts";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PublicVerificationPage } from "@/components/documents/public-verification-page";

export const dynamic = "force-dynamic";

type VerificationRouteProps = { params: Promise<{ publicCode: string }> };

async function loadVerification(publicCode: string): Promise<PublicDocumentVerificationResponse | null> {
  if (!/^[A-Za-z0-9_-]{20}$/.test(publicCode)) return null;
  const baseUrl = process.env.API_INTERNAL_BASE_URL ?? "http://127.0.0.1:3001/api/v1";
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/public/documents/${encodeURIComponent(publicCode)}`, { cache: "no-store" });
    return response.ok ? (await response.json()) as PublicDocumentVerificationResponse : null;
  } catch {
    return null;
  }
}

export async function generateMetadata(): Promise<Metadata> {
  return {
    description: "Проверка целостности итогового документа Макс-Контракт по SHA-256.",
    robots: { follow: false, index: false },
    title: "Проверка документа — Макс-Контракт",
  };
}

export default async function VerificationRoute({ params }: VerificationRouteProps) {
  const { publicCode } = await params;
  const verification = await loadVerification(publicCode);
  if (!verification) notFound();
  return <PublicVerificationPage verification={verification} />;
}
