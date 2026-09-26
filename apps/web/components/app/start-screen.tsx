"use client";

import { ArrowRight } from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/button";

export function StartScreen({ onStart, showEnvironmentBadge }: {
  onStart: () => void;
  showEnvironmentBadge: boolean;
}) {
  return <main className="app-viewport">
    <section className="mini-app start-screen start-welcome" aria-label="Начало работы">
      {showEnvironmentBadge ? <span className="environment-badge">ТЕСТ</span> : null}
      <header className="start-screen-brand welcome-brand" aria-label="Макс-Контракт">
        <Image className="start-story-logo" src="/images/max-contract-app-icon.jpg" width={38} height={38} alt="" />
        <span>МАКС<br />КОНТРАКТ</span>
      </header>
      <div className="welcome-scene">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="welcome-photo" alt="" src="/images/start-screen/frame-001.webp" fetchPriority="high" />
        <div className="welcome-panel">
          <span className="start-screen-kicker">Договор под рукой</span>
          <ol className="welcome-steps" aria-label="Этапы оформления договора">
            <li><h1>Опишите свою сделку</h1></li>
            <li><h2>Проверьте условия вместе</h2></li>
            <li><h2>Подпишите и сохраните</h2></li>
          </ol>
          <Button aria-label="Начать работу с Макс-Контракт" className="full-width" type="button" onClick={onStart}>
            Начать работу <ArrowRight size={18} aria-hidden="true" />
          </Button>
        </div>
      </div>
    </section>
  </main>;
}
