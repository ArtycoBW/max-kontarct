"use client";

import { CircleAlert, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function ErrorBoundary({ reset }: { reset: () => void }) {
  return (
    <main className="app-viewport">
      <section className="mini-app error-screen">
        <div className="center-state">
          <span className="state-icon is-error">
            <CircleAlert size={31} />
          </span>
          <h1>Не удалось открыть приложение</h1>
          <p>Попробуйте ещё раз. Если ошибка повторится, вернитесь позже.</p>
          <Button onClick={reset}>
            <RefreshCw size={17} /> Повторить
          </Button>
        </div>
      </section>
    </main>
  );
}
