"use client";

import type { DealSigningStateResponse, IssueSigningOtpResponse } from "@max-contract/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, CheckCircle2, Clock3, KeyRound, LockKeyhole, RefreshCw, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { queryKeys } from "@/lib/api/query-keys";
import { confirmDealSignature, getDealSigningState, issueDealSigningOtp } from "@/lib/api/signing";

export function SigningFlow({ dealId }: { dealId: string }) {
  const queryClient = useQueryClient();
  const [accepted, setAccepted] = useState(false);
  const [delivery, setDelivery] = useState<IssueSigningOtpResponse | null>(null);
  const [digits, setDigits] = useState(["", "", "", ""]);
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const signing = useQuery({
    queryFn: () => getDealSigningState(dealId),
    queryKey: queryKeys.deals.signing(dealId),
    refetchInterval: (query) => {
      const state = query.state.data;
      return state?.currentUserSigned && state.totalSignatures < state.requiredSignatures ? 6_000 : false;
    },
  });
  const issue = useMutation({
    mutationFn: () => {
      if (!signing.data) throw new Error("Версия договора ещё загружается");
      return issueDealSigningOtp(dealId, { pepAccepted: true, versionId: signing.data.versionId });
    },
    onError: (error: Error) => toast.error("Код не отправлен", { description: apiMessage(error) }),
    onSuccess: (value) => {
      setDelivery(value);
      setDigits(["", "", "", ""]);
      toast.success(value.channel === "MAX_TEST" ? "Код отправлен в личное сообщение MAX" : "Код отправлен");
      window.setTimeout(() => refs.current[0]?.focus(), 0);
    },
  });
  const confirm = useMutation({
    mutationFn: () => {
      if (!signing.data) throw new Error("Версия договора ещё загружается");
      return confirmDealSignature(dealId, { code: digits.join(""), versionId: signing.data.versionId });
    },
    onError: (error: Error) => toast.error("Подпись не подтверждена", { description: apiMessage(error) }),
    onSuccess: async (state) => {
      setDelivery(null);
      toast.success(state.totalSignatures >= state.requiredSignatures ? "Договор подписан обеими сторонами" : "Ваша подпись сохранена");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.deals.signing(dealId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.deals.workspace(dealId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.deals.list() }),
      ]);
    },
  });

  if (signing.isPending) return <SigningState title="Готовим подписание" copy="Проверяем замороженную версию и подписи сторон." />;
  if (signing.isError || !signing.data) {
    return <SigningState title="Подписание недоступно" copy={apiMessage(signing.error)} action={<Button onClick={() => void signing.refetch()}><RefreshCw size={17} /> Повторить</Button>} />;
  }
  if (signing.data.currentUserSigned) return <SignedState state={signing.data} />;
  if (delivery) {
    return (
      <OtpStep
        delivery={delivery}
        digits={digits}
        isConfirming={confirm.isPending}
        isResending={issue.isPending}
        onBack={() => setDelivery(null)}
        onConfirm={() => confirm.mutate()}
        onDigit={(index, value) => {
          const digit = value.replace(/\D/g, "").slice(-1);
          setDigits((current) => current.map((item, itemIndex) => itemIndex === index ? digit : item));
          if (digit && index < 3) refs.current[index + 1]?.focus();
        }}
        onKeyDown={(index, key) => {
          if (key === "Backspace" && !digits[index] && index > 0) refs.current[index - 1]?.focus();
        }}
        onResend={() => issue.mutate()}
        refs={refs}
      />
    );
  }
  return <AgreementStep accepted={accepted} onAccepted={setAccepted} onIssue={() => issue.mutate()} pending={issue.isPending} state={signing.data} />;
}

function AgreementStep({ accepted, onAccepted, onIssue, pending, state }: {
  accepted: boolean;
  onAccepted: (value: boolean) => void;
  onIssue: () => void;
  pending: boolean;
  state: DealSigningStateResponse;
}) {
  return (
    <section className="signing-flow" aria-label="Подписание договора">
      <div className="signing-state-icon"><KeyRound size={32} /></div>
      <div className="signing-title"><p>ПЭП · версия {state.pepAgreement.version}</p><h2>Простая электронная подпись</h2><span>Одноразовый код подпишет только договор № {state.contractNumber}.</span></div>
      <Card className="signing-agreement">
        <strong>{state.pepAgreement.title}</strong>
        {state.pepAgreement.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
        <dl><dt>Версия договора</dt><dd>{state.versionNumber}</dd><dt>SHA-256</dt><dd title={state.documentHash}>{shortHash(state.documentHash)}</dd></dl>
      </Card>
      <label className="signing-consent">
        <input checked={accepted} onChange={(event) => onAccepted(event.target.checked)} type="checkbox" />
        <span>Я принимаю соглашение и согласен использовать одноразовый код как простую электронную подпись.</span>
      </label>
      <Button className="full-width" disabled={!accepted || pending} onClick={onIssue}>
        <LockKeyhole size={17} /> {pending ? "Отправляем код…" : "Получить код подписи"}
      </Button>
    </section>
  );
}

function OtpStep({ delivery, digits, isConfirming, isResending, onBack, onConfirm, onDigit, onKeyDown, onResend, refs }: {
  delivery: IssueSigningOtpResponse;
  digits: string[];
  isConfirming: boolean;
  isResending: boolean;
  onBack: () => void;
  onConfirm: () => void;
  onDigit: (index: number, value: string) => void;
  onKeyDown: (index: number, key: string) => void;
  onResend: () => void;
  refs: React.RefObject<Array<HTMLInputElement | null>>;
}) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    const initial = window.setTimeout(() => setNow(Date.now()), 0);
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => { window.clearTimeout(initial); window.clearInterval(timer); };
  }, []);
  const resendSeconds = Math.max(0, Math.ceil((new Date(delivery.resendAvailableAt).getTime() - now) / 1_000));
  const expiresSeconds = Math.max(0, Math.ceil((new Date(delivery.expiresAt).getTime() - now) / 1_000));
  return (
    <section className="signing-flow signing-otp" aria-label="Код подписи">
      <div className="signing-state-icon"><KeyRound size={32} /></div>
      <div className="signing-title"><p>Подписание договора</p><h2>Введите код</h2><span>{delivery.channel === "MAX_TEST" ? "Отправили 4 цифры в личное сообщение MAX" : `Отправили 4 цифры на номер ${delivery.maskedPhone}`}</span></div>
      <div className="signing-otp-inputs">
        {digits.map((digit, index) => (
          <input aria-label={`Цифра ${index + 1}`} inputMode="numeric" key={index} maxLength={1} onChange={(event) => onDigit(index, event.target.value)} onKeyDown={(event) => onKeyDown(index, event.key)} ref={(node) => { refs.current[index] = node; }} value={digit} />
        ))}
      </div>
      <div className="signing-resend"><Clock3 size={14} /><span>Код действует ещё {formatTimer(expiresSeconds)}</span></div>
      <Button className="full-width" disabled={digits.some((digit) => !digit) || isConfirming || expiresSeconds === 0} onClick={onConfirm}>
        <Check size={18} /> {isConfirming ? "Проверяем код…" : "Подписать договор"}
      </Button>
      <Button className="full-width" disabled={resendSeconds > 0 || isResending} onClick={onResend} variant="ghost">
        {resendSeconds > 0 ? `Новый код через ${formatTimer(resendSeconds)}` : "Отправить новый код"}
      </Button>
      <Button className="full-width" disabled={isConfirming} onClick={onBack} variant="secondary">Вернуться к соглашению</Button>
    </section>
  );
}

function SignedState({ state }: { state: DealSigningStateResponse }) {
  const completed = state.totalSignatures >= state.requiredSignatures;
  return (
    <section className="signing-flow signing-signed" aria-live="polite">
      <div className="signing-state-icon is-success"><CheckCircle2 size={36} /></div>
      <div className="signing-title"><p>{completed ? "Подписано обеими сторонами" : "Ваша подпись сохранена"}</p><h2>{completed ? "Готовим итоговый документ" : "Ждём вторую сторону"}</h2><span>{completed ? "PDF и технический пакет материалов формируются на сервере." : "Сообщим в MAX, когда контрагент подпишет эту же версию."}</span></div>
      <Card className="signing-party-list">
        {state.parties.map((party) => <div key={`${party.role}-${party.displayName}`}><span>{party.signedAt ? <CheckCircle2 size={17} /> : <Clock3 size={17} />}<strong>{party.displayName}{party.isCurrentUser ? " · вы" : ""}</strong></span><small>{party.signedAt ? `Подписано ${formatDateTime(party.signedAt)}` : "Ожидаем подпись"}</small></div>)}
      </Card>
      <p className="signing-integrity"><ShieldCheck size={16} />Подписи связаны с версией {state.versionNumber} и SHA-256 {shortHash(state.documentHash)}.</p>
    </section>
  );
}

function SigningState({ action, copy, title }: { action?: React.ReactNode; copy: string; title: string }) {
  return <Card className="form-message"><strong>{title}</strong><span>{copy}</span>{action}</Card>;
}

function apiMessage(error: unknown): string { return error instanceof Error ? error.message : "Повторите попытку"; }
function shortHash(value: string): string { return `${value.slice(0, 12)}…${value.slice(-8)}`; }
function formatTimer(seconds: number): string { return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`; }
function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", hour: "2-digit", minute: "2-digit", month: "short", timeZone: "Europe/Moscow" }).format(new Date(value));
}
