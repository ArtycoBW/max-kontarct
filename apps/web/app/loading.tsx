import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <main className="app-viewport">
      <section className="mini-app loading-screen" aria-label="Загрузка приложения">
        <div className="loading-content">
          <Skeleton className="loading-header" />
          <Skeleton className="loading-title" />
          <Skeleton className="loading-card" />
          <Skeleton className="loading-row" />
        </div>
      </section>
    </main>
  );
}
