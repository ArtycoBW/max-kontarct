"use client";

import { ArrowRight, PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useStartScroll } from "@/lib/ui/use-start-scroll";

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
  const { scrollerRef, storyRef, canvasRef } = useStartScroll();
  return <main className="app-viewport">
    <section className="mini-app start-screen" aria-label="Начало работы">
      {showEnvironmentBadge ? <span className="environment-badge">ТЕСТ</span> : null}
      <div className="start-screen-scroll" ref={scrollerRef} tabIndex={0} role="region" aria-label="Этапы работы с сервисом">
        <div className="start-story" ref={storyRef}>
          <header className="start-story-brand start-screen-brand" aria-label="Макс-Контракт">
            <span className="start-screen-brand-mark"><PenLine size={17} /></span>
            <span>МАКС<br />КОНТРАКТ</span>
          </header>
          <div className="start-story-scene">
            <div className="start-story-media" aria-hidden="true">
              {/* Original local film frames; poster remains visible until a complete frame paints. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img alt="" src="/images/start-screen/frame-001.webp" fetchPriority="high" decoding="async" />
              <canvas ref={canvasRef} className="start-story-canvas" />
              <span className="start-screen-rule" />
            </div>
            <div className="start-story-content">
              <ol className="start-story-steps" aria-label="Этапы оформления договора">
                {steps.map((step, index) => {
                  const Heading = index === 0 ? "h1" : "h2";
                  return <li className="start-story-step" key={step.title}>
                    <Card className="start-story-card">
                      <span className="start-screen-kicker">{["Частные сделки без лишней сложности", "Вместе с другой стороной", "Понятные условия", "Договор под рукой"][index]}</span>
                      <Heading>{step.title}</Heading><p>{step.text}</p>
                    </Card>
                  </li>;
                })}
              </ol>
              <footer className="start-story-footer">
                <Button aria-label="Начать работу с Макс-Контракт" className="start-screen-action" variant="unstyled" type="button" onClick={onStart}>
                  <span className="start-screen-action-label">Начать работу</span>
                  <span className="start-screen-action-arrow"><ArrowRight size={18} /></span>
                </Button>
              </footer>
            </div>
          </div>
        </div>
      </div>
    </section>
  </main>;
}
