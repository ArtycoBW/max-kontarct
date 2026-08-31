"use client";

import type { PublicDealInvitationResponse } from "@max-contract/contracts";
import {
  ArrowRight,
  Check,
  Clock3,
  ExternalLink,
  FileCheck2,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32}$/;

export function PublicInvitationPage({
  invitation,
}: {
  invitation: PublicDealInvitationResponse;
}) {
  const [acknowledged, setAcknowledged] = useState(false);
  const [token, setToken] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const fragment = window.location.hash.slice(1);
      setToken(TOKEN_PATTERN.test(fragment) ? fragment : "");
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const deeplink = useMemo(
    () =>
      token
        ? `https://max.ru/${encodeURIComponent(invitation.botUsername)}?startapp=${encodeURIComponent(`invite_${invitation.publicCode}_${token}`)}`
        : "",
    [invitation.botUsername, invitation.publicCode, token],
  );
  const active = invitation.state === "ACTIVE";

  const continueInMax = () => {
    if (!acknowledged) {
      setAcknowledged(true);
      return;
    }
    if (!deeplink) return;
    if (window.WebApp?.openMaxLink) {
      window.WebApp.openMaxLink(deeplink);
      return;
    }
    window.location.assign(deeplink);
  };

  return (
    <main className="public-invite-page">
      <section className="public-invite-shell">
        <header className="public-invite-brand">
          <span className="public-invite-brand-mark"><ShieldCheck size={20} /></span>
          <span><strong>МАКС-КОНТРАКТ</strong><small>Защищённое приглашение</small></span>
        </header>

        <div className="public-invite-heading">
          <p className="screen-eyebrow">Вас приглашают в сделку</p>
          <h1>{invitation.templateTitle}</h1>
          <p>{invitation.templateSummary}</p>
        </div>

        <Card className="public-invite-trust-card">
          <ShieldCheck size={20} />
          <span>
            <strong>Приглашение от {invitation.initiatorMaskedName}</strong>
            <small>Личные данные скрыты до безопасного присоединения.</small>
          </span>
        </Card>

        {active ? (
          <>
            <section className="public-invite-section">
              <div className="public-invite-section-title">
                <FileCheck2 size={18} />
                <h2>Основные условия · версия {invitation.versionNumber}</h2>
              </div>
              <div className="public-invite-terms">
                {invitation.terms.length ? invitation.terms.map((term) => (
                  <div key={term.label}>
                    <span>{term.label}</span>
                    <strong>{term.value}</strong>
                  </div>
                )) : (
                  <p>Подробные условия будут доступны после входа и присоединения.</p>
                )}
              </div>
            </section>

            <section className="public-invite-section">
              <h2>Что даёт этот документ</h2>
              <ul className="public-invite-benefits">
                {invitation.whatItGives.map((item) => (
                  <li key={item}><Check size={16} />{item}</li>
                ))}
              </ul>
            </section>

            <div className="public-invite-expiry">
              <Clock3 size={16} />
              Ссылка действует до {formatDateTime(invitation.expiresAt)}
            </div>

            {!token ? (
              <Card className="public-invite-error" role="alert">
                Ссылка неполная. Откройте исходное сообщение с приглашением в MAX.
              </Card>
            ) : null}

            <div className="public-invite-actions">
              <Button
                className="full-width"
                disabled={!token}
                onClick={continueInMax}
                type="button"
              >
                {acknowledged ? (
                  <>Продолжить оформление <ArrowRight size={18} /></>
                ) : (
                  <>Я ознакомился <Check size={18} /></>
                )}
              </Button>
              {acknowledged ? (
                <p><ExternalLink size={14} /> Оформление продолжится внутри MAX.</p>
              ) : null}
            </div>
          </>
        ) : (
          <Card className="public-invite-error" role="status">
            {stateMessage(invitation.state)}
          </Card>
        )}
      </section>
    </main>
  );
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "long",
    timeZone: "Europe/Moscow",
  }).format(new Date(value));
}

function stateMessage(state: PublicDealInvitationResponse["state"]): string {
  if (state === "ACCEPTED") return "Приглашение уже принято.";
  if (state === "REVOKED") return "Инициатор отозвал это приглашение.";
  return "Срок действия приглашения истёк. Попросите инициатора создать новое.";
}
