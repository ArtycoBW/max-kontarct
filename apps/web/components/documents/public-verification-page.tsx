import type { PublicDocumentVerificationResponse } from "@max-contract/contracts";
import { CalendarClock, CheckCircle2, FileCheck2, Fingerprint, ShieldCheck, TriangleAlert } from "lucide-react";

import { Card } from "@/components/ui/card";

export function PublicVerificationPage({ verification }: { verification: PublicDocumentVerificationResponse }) {
  const valid = verification.integrity === "VALID";
  return (
    <main className="public-invite-page public-verify-page">
      <section className="public-invite-shell public-verify-shell">
        <header className="public-invite-brand">
          <span className="public-invite-brand-mark"><ShieldCheck size={20} /></span>
          <span><strong>МАКС-КОНТРАКТ</strong><small>Проверка документа</small></span>
        </header>

        <div className="public-invite-heading public-verify-heading">
          <p className="screen-eyebrow">Публичная проверка</p>
          <h1>{valid ? "Целостность подтверждена" : "Нужна проверка"}</h1>
          <p>{integrityDescription(verification.integrity)}</p>
        </div>

        <Card className={`public-verify-result ${valid ? "is-valid" : "is-warning"}`}>
          {valid ? <CheckCircle2 size={23} /> : <TriangleAlert size={23} />}
          <span><strong>{valid ? "Контрольная сумма совпадает" : "Целостность не подтверждена"}</strong><small>Результат сверки файла с сохранённой контрольной суммой.</small></span>
        </Card>

        <section className="public-invite-section">
          <div className="public-invite-section-title"><FileCheck2 size={18} /><h2>Сведения о документе</h2></div>
          <dl className="public-verify-details">
            <div><dt>Номер документа</dt><dd>{verification.contractNumber}</dd></div>
            <div><dt>Статус</dt><dd>{verification.documentStatus === "COMPLETED" ? "Сделка завершена" : "Подписан обеими сторонами"}</dd></div>
            <div><dt><CalendarClock size={14} />Дата подписания</dt><dd>{formatDateTime(verification.signedAt)}</dd></div>
          </dl>
        </section>

        <section className="public-verify-fingerprint">
          <h2><Fingerprint size={18} /> SHA-256 итогового PDF</h2>
          <code>{verification.sha256}</code>
          <p>Страница не раскрывает персональные данные, реквизиты сторон и вложения сделки.</p>
        </section>
      </section>
    </main>
  );
}

function integrityDescription(value: PublicDocumentVerificationResponse["integrity"]): string {
  if (value === "VALID") return "Файл в хранилище совпадает с контрольной суммой, зафиксированной при создании итогового PDF.";
  if (value === "INVALID") return "Контрольная сумма файла отличается от зафиксированной. Не используйте этот экземпляр до выяснения.";
  return "Хранилище временно недоступно. Повторите проверку позже.";
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit", hour: "2-digit", minute: "2-digit", month: "long", timeZone: "Europe/Moscow", year: "numeric",
  }).format(new Date(value));
}
