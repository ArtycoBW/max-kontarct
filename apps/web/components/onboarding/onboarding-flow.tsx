"use client";

import type {
  ConsentType,
  OnboardingStateResponse,
  RecordConsentsRequest,
} from "@max-contract/contracts";
import { useMutation } from "@tanstack/react-query";
import {
  ArrowLeft,
  Bell,
  CircleAlert,
  FileText,
  LockKeyhole,
  Phone,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { LegalDocuments } from "./legal-documents";
import {
  recordConsents,
  verifyDevelopmentPhone,
  verifyMaxPhone,
} from "@/lib/api/onboarding";
import {
  MaxContactBridgeError,
  requestMaxContact,
} from "@/lib/max/bridge";

type OnboardingStep = "consents" | "phone";

interface OnboardingFlowProps {
  onStateChange: (state: OnboardingStateResponse) => void;
  showEnvironmentBadge: boolean;
  state: OnboardingStateResponse;
}

interface ConsentRowDefinition {
  copy: string;
  icon: LucideIcon;
  label: string;
  required: boolean;
  type: ConsentType;
}

const consentRows: ConsentRowDefinition[] = [
  {
    copy: "Данные используются только для работы сервиса",
    icon: ShieldCheck,
    label: "Обработка персональных данных",
    required: true,
    type: "PERSONAL_DATA",
  },
  {
    copy: "Правила работы Макс-Контракт",
    icon: FileText,
    label: "Условия использования",
    required: true,
    type: "TERMS_OF_USE",
  },
  {
    copy: "Сообщения о приглашениях, согласовании и готовности документов",
    icon: Bell,
    label: "Уведомления о статусах",
    required: false,
    type: "STATUS_NOTIFICATIONS",
  },
];

export function OnboardingFlow({
  onStateChange,
  showEnvironmentBadge,
  state,
}: OnboardingFlowProps) {
  const [step, setStep] = useState<OnboardingStep>(
    state.requiredConsentsAccepted ? "phone" : "consents",
  );
  const [consents, setConsents] = useState<Record<ConsentType, boolean>>(() =>
    Object.fromEntries(
      state.consents.map(({ granted, type }) => [type, granted]),
    ) as Record<ConsentType, boolean>,
  );

  const consentMutation = useMutation({
    mutationFn: () =>
      recordConsents({
        personalData: consents.PERSONAL_DATA,
        statusNotifications: consents.STATUS_NOTIFICATIONS,
        termsOfUse: consents.TERMS_OF_USE,
      } satisfies RecordConsentsRequest),
    onSuccess: (nextState) => {
      onStateChange(nextState);
      setStep("phone");
    },
  });
  const phoneMutation = useMutation({
    mutationFn: async () => {
      if (process.env.NODE_ENV !== "production") {
        await requestMaxContact();
        return verifyDevelopmentPhone();
      }

      const result = await requestMaxContact();
      if (result.kind !== "max") {
        throw new Error("MAX не передал номер телефона. Повторите подтверждение.");
      }
      return verifyMaxPhone(result.contact);
    },
    onSuccess: onStateChange,
    retry: false,
  });

  const requiredAccepted =
    consents.PERSONAL_DATA && consents.TERMS_OF_USE;

  return (
    <main className="app-viewport">
      <section className="mini-app onboarding-shell" aria-label="Настройка профиля">
        {showEnvironmentBadge ? (
          <span className="environment-badge">ТЕСТ</span>
        ) : null}
        {step === "consents" ? (
          <ConsentScreen
            consents={consents}
            error={consentMutation.error}
            isPending={consentMutation.isPending}
            onChange={(type, checked) =>
              setConsents((current) => ({ ...current, [type]: checked }))
            }
            onContinue={() => consentMutation.mutate()}
            requiredAccepted={requiredAccepted}
          />
        ) : (
          <PhoneScreen
            error={phoneMutation.error}
            isPending={phoneMutation.isPending}
            onBack={() => {
              phoneMutation.reset();
              setStep("consents");
            }}
            onRequest={() => phoneMutation.mutate()}
          />
        )}
      </section>
    </main>
  );
}

function OnboardingHeader({
  eyebrow,
  onBack,
  title,
}: {
  eyebrow: string;
  onBack?: () => void;
  title: string;
}) {
  return (
    <header className="onboarding-header">
      <p className="screen-eyebrow">{eyebrow}</p>
      <div>
        {onBack ? (
          <Button
            aria-label="Назад к согласиям"
            onClick={onBack}
            size="icon"
            type="button"
            variant="ghost"
          >
            <ArrowLeft size={21} />
          </Button>
        ) : null}
        <h1>{title}</h1>
      </div>
    </header>
  );
}

function ConsentScreen({
  consents,
  error,
  isPending,
  onChange,
  onContinue,
  requiredAccepted,
}: {
  consents: Record<ConsentType, boolean>;
  error: Error | null;
  isPending: boolean;
  onChange: (type: ConsentType, checked: boolean) => void;
  onContinue: () => void;
  requiredAccepted: boolean;
}) {
  return (
    <div className="onboarding-screen">
      <div className="onboarding-content">
        <OnboardingHeader eyebrow="Шаг 1 из 2" title="Согласия" />
        <p className="onboarding-copy">
          Для начала работы подтвердите обязательные условия.
        </p>

        <div className="consent-list">
          {consentRows.map(({ copy, icon: Icon, label, required, type }) => {
            const switchId = `consent-${type.toLowerCase()}`;
            return (
              <Card className="consent-card" key={type} role="group" aria-labelledby={`${switchId}-title`} data-accepted={consents[type]}>
                <div className="consent-card-heading">
                  <span className="consent-icon" aria-hidden="true"><Icon size={20} /></span>
                  <label htmlFor={switchId}>
                    <strong id={`${switchId}-title`}>{label}</strong>
                    <small id={`${switchId}-description`}>{copy}</small>
                  </label>
                </div>
                <div className="consent-card-footer">
                  <LegalDocuments type={type} label="Ознакомиться" describedBy={`${switchId}-title`} />
                  <div className="consent-control">
                    <label htmlFor={switchId}>{required ? "Обязательно" : "По желанию"}</label>
                    <Switch
                      aria-label={label}
                      aria-describedby={`${switchId}-description`}
                      checked={consents[type]}
                      disabled={isPending}
                      id={switchId}
                      onCheckedChange={(checked) => onChange(type, checked)}
                    />
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        <Card className="consent-card consent-signature-card" role="group" aria-labelledby="signature-document-title">
          <div className="consent-card-heading">
            <span className="consent-icon" aria-hidden="true"><LockKeyhole size={20} /></span>
            <div>
              <strong id="signature-document-title">Простая электронная подпись</strong>
              <small>Соглашение принимается отдельно перед подписанием договора.</small>
            </div>
          </div>
          <div className="consent-card-footer">
            <LegalDocuments type="ELECTRONIC_SIGNATURE" label="Ознакомиться" describedBy="signature-document-title" />
          </div>
        </Card>
        <p className="consent-note">На стенде опубликованы проекты документов.</p>

        {error ? (
          <p className="onboarding-inline-error" role="alert">
            <CircleAlert size={15} /> {error.message}
          </p>
        ) : null}
      </div>

      <footer className="onboarding-footer">
        <Button
          className="full-width"
          disabled={!requiredAccepted || isPending}
          onClick={onContinue}
          type="button"
        >
          {isPending ? "Сохраняем…" : "Принять и продолжить"}
        </Button>
      </footer>
    </div>
  );
}

function PhoneScreen({
  error,
  isPending,
  onBack,
  onRequest,
}: {
  error: Error | null;
  isPending: boolean;
  onBack: () => void;
  onRequest: () => void;
}) {
  const errorCopy = getPhoneErrorCopy(error);

  return (
    <div className="onboarding-screen">
      <div className="onboarding-content phone-onboarding-content">
        <OnboardingHeader
          eyebrow="Безопасный вход"
          onBack={onBack}
          title="Ваш номер телефона"
        />
        <p className="onboarding-copy">
          Разрешите MAX передать ваш номер для входа и подтверждения подписи.
        </p>

        <div className="phone-hero" aria-hidden="true">
          <span>
            <Phone size={35} />
          </span>
        </div>

        <Card className="phone-source-card">
          <ShieldCheck size={18} />
          <span>
            <strong>Только номер из MAX</strong>
            <small>Подтвердим номер, связанный с вашим аккаунтом.</small>
          </span>
        </Card>

        {errorCopy ? (
          <Card className="phone-error-state" role="alert">
            <CircleAlert size={18} />
            <span>
              <strong>{errorCopy.title}</strong>
              <small>{errorCopy.copy}</small>
            </span>
          </Card>
        ) : null}

        <div className="phone-privacy-note">
          <LockKeyhole size={15} />
          Подтверждённый номер понадобится для подписания договора.
        </div>
      </div>

      <footer className="onboarding-footer">
        <Button
          className="full-width"
          disabled={isPending}
          onClick={onRequest}
          type="button"
        >
          {isPending ? "Открываем MAX…" : "Подтвердить через MAX"}
        </Button>
      </footer>
    </div>
  );
}

function getPhoneErrorCopy(error: Error | null) {
  if (!error) {
    return null;
  }

  if (error instanceof MaxContactBridgeError && error.reason === "refused") {
    return {
      copy: "Без подтверждённого номера продолжить нельзя. Запрос можно повторить.",
      title: "Номер не передан",
    };
  }

  return {
    copy: error.message,
    title: "Не удалось подтвердить номер",
  };
}
