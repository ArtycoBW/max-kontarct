"use client";

import type { DealSigningStateResponse, IssueSigningOtpResponse } from "@max-contract/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, CheckCircle2, ChevronDown, Clock3, Download, KeyRound, LockKeyhole, RefreshCw, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { REGEXP_ONLY_DIGITS } from "input-otp";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { queryKeys } from "@/lib/api/query-keys";
import { ACTIVE_DEAL_REFRESH_MS } from "@/lib/api/deal-refresh";
import { confirmDealSignature, getDealSigningState, issueDealSigningOtp } from "@/lib/api/signing";
import { FilePreviewButton } from "@/components/files/file-preview";

export function SigningFlow({ dealId }: { dealId: string }) {
  const queryClient = useQueryClient();
  const [accepted, setAccepted] = useState(false);
  const [delivery, setDelivery] = useState<IssueSigningOtpResponse | null>(null);
  const [code, setCode] = useState("");
  const signing = useQuery({
    queryFn: () => getDealSigningState(dealId),
    queryKey: queryKeys.deals.signing(dealId),
    refetchInterval: (query) => {
      const state = query.state.data;
      return state?.status === "COMPLETED" && state.finalPdf && state.evidencePackage ? false : ACTIVE_DEAL_REFRESH_MS;
    },
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    staleTime: 0,
  });
  const issue = useMutation({
    mutationFn: () => {
      if (!signing.data) throw new Error("Версия договора ещё загружается");
      return issueDealSigningOtp(dealId, { pepAccepted: true, versionId: signing.data.versionId });
    },
    onError: (error: Error) => toast.error("Код не отправлен", { description: apiMessage(error) }),
    onSuccess: (value) => {
      setDelivery(value);
      setCode("");
      toast.success(value.channel === "MAX_TEST" ? "Код отправлен в личное сообщение MAX" : "Код отправлен");
    },
  });
  const confirm = useMutation({
    mutationFn: () => {
      if (!signing.data) throw new Error("Версия договора ещё загружается");
      return confirmDealSignature(dealId, { code, versionId: signing.data.versionId });
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

  if (signing.isPending) return <SigningState title="Готовим подписание" copy="Загружаем согласованный договор и подписи сторон." />;
  if (signing.isError || !signing.data) {
    return <SigningState title="Подписание недоступно" copy={apiMessage(signing.error)} action={<Button onClick={() => void signing.refetch()}><RefreshCw size={17} /> Повторить</Button>} />;
  }
  if (signing.data.currentUserSigned) return <SignedState state={signing.data} />;
  if (delivery) {
    return (
      <OtpStep
        delivery={delivery}
        code={code}
        isConfirming={confirm.isPending}
        isResending={issue.isPending}
        onBack={() => setDelivery(null)}
        onConfirm={() => confirm.mutate()}
        onCode={setCode}
        onResend={() => issue.mutate()}
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
      <div className="signing-title"><p>Соглашение о ПЭП</p><h2>Простая электронная подпись</h2><span>Одноразовый код подпишет только договор № {state.contractNumber}.</span></div>
      <Card className="signing-agreement">
        <strong>{state.pepAgreement.title}</strong>
        {state.pepAgreement.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
        <dl><dt>Подписываемая редакция</dt><dd>Версия № {state.versionNumber}</dd></dl>
        <Collapsible className="signing-fingerprint"><CollapsibleTrigger asChild><Button variant="unstyled" className="collapsible-trigger" type="button">Контрольный отпечаток (SHA-256)<ChevronDown className="collapsible-chevron" size={16} aria-hidden="true" /></Button></CollapsibleTrigger><CollapsibleContent><p>Этот отпечаток связывает подпись с неизменным текстом и данными договора. Это не код из сообщения.</p><code>{state.documentHash}</code><small>Версия соглашения: {state.pepAgreement.version}</small></CollapsibleContent></Collapsible>
      </Card>
      <label className="signing-consent">
        <Checkbox checked={accepted} onCheckedChange={value => onAccepted(value === true)} />
        <span>Я принимаю соглашение и согласен использовать одноразовый код как простую электронную подпись.</span>
      </label>
      <Button className="full-width" disabled={!accepted || pending} onClick={onIssue}>
        <LockKeyhole size={17} /> {pending ? "Отправляем код…" : "Получить код подписи"}
      </Button>
    </section>
  );
}

function OtpStep({ delivery, code, isConfirming, isResending, onBack, onConfirm, onCode, onResend }: {
  delivery: IssueSigningOtpResponse;
  code: string;
  isConfirming: boolean;
  isResending: boolean;
  onBack: () => void;
  onConfirm: () => void;
  onCode: (value: string) => void;
  onResend: () => void;
}) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    const initial = window.setTimeout(() => setNow(Date.now()), 0);
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => { window.clearTimeout(initial); window.clearInterval(timer); };
  }, []);
  const resendSeconds = now === 0 ? 60 : Math.max(0, Math.ceil((new Date(delivery.resendAvailableAt).getTime() - now) / 1_000));
  const expiresSeconds = now === 0 ? 300 : Math.max(0, Math.ceil((new Date(delivery.expiresAt).getTime() - now) / 1_000));
  return (
    <section className="signing-flow signing-otp" aria-label="Код подписи">
      <div className="signing-state-icon"><KeyRound size={32} /></div>
      <div className="signing-title"><p>Подписание договора</p><h2>Введите код</h2><span>{delivery.channel === "MAX_TEST" ? "Отправили 4 цифры в личное сообщение MAX" : `Отправили 4 цифры на номер ${delivery.maskedPhone}`}</span></div>
      <div className="signing-otp-inputs">
        <InputOTP aria-label="Код подписи из 4 цифр" autoFocus maxLength={4} pattern={REGEXP_ONLY_DIGITS}
          value={code} onChange={onCode} disabled={isConfirming || isResending || expiresSeconds === 0}>
          <InputOTPGroup>{[0, 1, 2, 3].map(index => <InputOTPSlot key={index} index={index} />)}</InputOTPGroup>
        </InputOTP>
      </div>
      <div className="signing-resend"><Clock3 size={14} /><span>Код действует ещё {formatTimer(expiresSeconds)}</span></div>
      <Button className="full-width" disabled={code.length !== 4 || isConfirming || isResending || expiresSeconds === 0} onClick={onConfirm}>
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
  const documentReady = Boolean(state.finalPdf);
  const dealCompleted = state.status === "COMPLETED";
  return (
    <section className="signing-flow signing-signed" aria-live="polite">
      <div className="signing-state-icon is-success"><CheckCircle2 size={36} /></div>
      <div className="signing-title"><p>{dealCompleted ? "Сделка завершена" : completed ? "Подписано обеими сторонами" : "Ваша подпись сохранена"}</p><h2>{dealCompleted ? "Договор и материалы готовы" : documentReady ? "Итоговый документ готов" : completed ? "Готовим итоговый документ" : "Ждём вторую сторону"}</h2><span>{dealCompleted ? "Договор подписан обеими сторонами. Скачайте документы сейчас или вернитесь к ним в любое время." : documentReady ? "Подписанный договор сохранён и доступен участникам сделки." : completed ? "Собираем подписанный договор и материалы сделки." : "Сообщим в MAX, когда контрагент подпишет эту же версию."}</span></div>
      <Card className="signing-party-list">
        {state.parties.map((party) => <div key={`${party.role}-${party.displayName}`}><span>{party.signedAt ? <CheckCircle2 size={17} /> : <Clock3 size={17} />}<strong>{party.displayName}{party.isCurrentUser ? " · вы" : ""}</strong></span><small>{party.signedAt ? `Подписано ${formatDateTime(party.signedAt)}` : "Ожидаем подпись"}</small></div>)}
      </Card>
      {state.finalPdf ? <FilePreviewButton file={{ ...state.finalPdf, url: state.finalPdf.downloadUrl }} label="Просмотреть подписанный договор" /> : null}
      {state.finalPdf ? <Button asChild className="full-width"><a href={state.finalPdf.downloadUrl}><Download size={17} /> Скачать подписанный PDF</a></Button> : null}
      {state.evidencePackage ? <Button asChild className="full-width" variant="secondary"><a href={state.evidencePackage.downloadUrl}><Download size={17} /> Скачать пакет материалов</a></Button> : null}
      {state.evidencePackage ? <p className="signing-package-note">В архиве — подписанный договор, общие вложения, история сделки и сведения о подписях.</p> : null}
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
