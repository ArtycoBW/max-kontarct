"use client";

import { ArrowRight, PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const steps = [
  { title: "Опишите свою сделку", text: "Расскажите, о чём хотите договориться. ИИ предложит подходящий шаблон или индивидуальный проект." },
  { title: "Пригласите вторую сторону", text: "Отправьте приглашение с основными условиями. Второй участник сможет ознакомиться с предложением и заполнить свои данные." },
  { title: "Проверьте условия вместе", text: "Сверьте предмет договора, стоимость, сроки и приложения. Обе стороны согласуют одну итоговую редакцию." },
  { title: "Подпишите и сохраните", text: "Подтвердите согласованный договор одноразовым кодом. Сохраните договор и приложения к нему." },
];

export function StartScreen({ onStart, showEnvironmentBadge }: {
  onStart: () => void;
  showEnvironmentBadge: boolean;
}) {
  return <main className="app-viewport">
    <section className="mini-app start-screen" aria-label="Начало работы">
      {showEnvironmentBadge ? <span className="environment-badge">ТЕСТ</span> : null}
      <div className="start-screen-scroll">
        <div className="start-overview">
          <header className="start-overview-brand">
            <span className="start-screen-brand-mark"><PenLine size={18} /></span>
            <strong>МАКС-КОНТРАКТ</strong>
          </header>
          <div className="start-overview-heading">
            <p className="screen-eyebrow">Частные сделки без лишней сложности</p>
            <h1>Подготовьте договор вместе</h1>
            <p>От первого описания до согласования и подписания — четыре понятных этапа.</p>
          </div>
          <ol className="start-overview-steps" aria-label="Этапы оформления договора">
            {steps.map((step, index) => <li key={step.title}>
              <Card className="start-overview-step">
                <span className="start-overview-number" aria-hidden="true">0{index + 1}</span>
                <div><h2>{step.title}</h2><p>{step.text}</p></div>
              </Card>
            </li>)}
          </ol>
          <footer className="start-overview-footer">
            <Button aria-label="Начать работу с Макс-Контракт" className="full-width" onClick={onStart}>
              Начать работу <ArrowRight size={18} />
            </Button>
          </footer>
        </div>
      </div>
    </section>
  </main>;
}
