"use client";

import type { AdminFileReviewItem, DealFileReviewStatus } from "@max-contract/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  CircleAlert,
  Download,
  FileCheck2,
  RefreshCw,
  ShieldCheck,
  X,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  getAdminFileDownloadUrl,
  getAdminFileReviews,
  reviewAdminFile,
} from "@/lib/api/admin";
import { queryKeys } from "@/lib/api/query-keys";

export function AdminFileReviewsView({ canReview }: { canReview: boolean }) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<AdminFileReviewItem | null>(null);
  const [comment, setComment] = useState("");
  const files = useQuery({
    queryFn: getAdminFileReviews,
    queryKey: queryKeys.admin.files(),
    refetchInterval: 5_000,
    refetchOnWindowFocus: true,
    retry: false,
  });
  const review = useMutation({
    mutationFn: ({ fileId, status }: { fileId: string; status: "ACCEPTED" | "REJECTED" }) =>
      reviewAdminFile(fileId, { comment: comment.trim() || null, status }),
    onError: (error: Error) => toast.error(error.message),
    onSuccess: async (_, variables) => {
      toast.success(variables.status === "ACCEPTED" ? "Материал принят" : "Материал отклонён");
      setSelected(null);
      setComment("");
      await queryClient.invalidateQueries({ queryKey: queryKeys.admin.files() });
    },
  });

  if (files.isPending) return <div className="admin-list-loading"><Skeleton /><Skeleton /><Skeleton /></div>;
  if (files.error || !files.data) {
    return <Card className="admin-inline-error"><CircleAlert size={24} /><span><strong>Не удалось загрузить материалы</strong><small>Проверьте соединение и повторите попытку.</small></span><Button onClick={() => void files.refetch()} variant="outline"><RefreshCw size={15} /> Повторить</Button></Card>;
  }
  const pending = files.data.items.filter(({ reviewStatus }) => reviewStatus === "PENDING").length;
  return (
    <div className="admin-file-reviews">
      <div className="admin-summary-grid">
        <Card><span>Материалов</span><strong>{files.data.total}</strong></Card>
        <Card><span>Ожидают проверки</span><strong>{pending}</strong><small>Только ручное решение</small></Card>
        <Card><span>Автопроверка личности</span><strong>Нет</strong><small>Биометрия не используется</small></Card>
      </div>
      {files.data.items.length === 0 ? (
        <Card className="center-state"><span className="state-icon"><FileCheck2 size={30} /></span><h2>Материалов пока нет</h2><p>Загруженные пользователями файлы появятся здесь.</p></Card>
      ) : null}
      <div className="admin-file-review-list">
        {files.data.items.map((file) => (
          <Card className="admin-file-review-card" key={file.id}>
            <header>
              <span><FileCheck2 size={18} /></span>
              <i><small>{file.requirementTitle ?? "Материал сделки"}</small><strong>{file.originalName}</strong><em>{file.dealTitle} · {file.ownerDisplayName}</em></i>
              <b className={`admin-review-status is-${file.reviewStatus.toLowerCase()}`}>{reviewStatusLabel(file.reviewStatus)}</b>
            </header>
            <div className="admin-file-meta"><span>{formatBytes(file.sizeBytes)}</span><span>{mimeTypeLabel(file.mimeType)}</span><span>{file.visibility === "OWNER_ONLY" ? "Только владелец" : "Участники сделки"}</span></div>
            <div
              aria-label={file.reviewComment ? "Комментарий к проверке" : undefined}
              aria-hidden={file.reviewComment ? undefined : true}
              className={`admin-file-review-comment${file.reviewComment ? "" : " is-empty"}`}
            >
              {file.reviewComment ? <><CircleAlert size={14} /><span>{file.reviewComment}</span></> : null}
            </div>
            <footer>
              {canReview ? <Button asChild variant="outline"><a href={getAdminFileDownloadUrl(file.id)}><Download size={15} /> Скачать</a></Button> : null}
              {canReview ? <Button onClick={() => { setSelected(file); setComment(file.reviewComment ?? ""); }}><ShieldCheck size={15} /> Проверить</Button> : <small>Только администратор может открыть файл и принять решение.</small>}
            </footer>
          </Card>
        ))}
      </div>

      {selected ? (
        <div className="admin-editor-backdrop" role="presentation">
          <Card aria-labelledby="file-review-title" aria-modal="true" className="admin-file-review-dialog" role="dialog">
            <header><span><small>Ручная проверка</small><h2 id="file-review-title">{selected.originalName}</h2></span><Button aria-label="Закрыть" onClick={() => setSelected(null)} size="icon" variant="ghost"><X size={18} /></Button></header>
            <p>Откройте файл, сопоставьте его с требованием и зафиксируйте решение. Система не делает выводов о личности автоматически.</p>
            <Button asChild variant="outline"><a href={getAdminFileDownloadUrl(selected.id)}><Download size={15} /> Скачать материал</a></Button>
            <label>Комментарий<Textarea maxLength={1000} onChange={(event) => setComment(event.target.value)} placeholder="Обязателен при отклонении" rows={4} value={comment} /></label>
            <footer>
              <Button disabled={review.isPending || comment.trim().length < 3} onClick={() => review.mutate({ fileId: selected.id, status: "REJECTED" })} variant="outline"><X size={15} /> Отклонить</Button>
              <Button disabled={review.isPending} onClick={() => review.mutate({ fileId: selected.id, status: "ACCEPTED" })}><Check size={15} /> Принять</Button>
            </footer>
          </Card>
        </div>
      ) : null}
    </div>
  );
}

function reviewStatusLabel(status: DealFileReviewStatus): string {
  return { ACCEPTED: "Принят", PENDING: "Ожидает", REJECTED: "Отклонён" }[status];
}

function formatBytes(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} МБ` : `${Math.ceil(bytes / 1024)} КБ`;
}

function mimeTypeLabel(mimeType: string): string {
  return {
    "application/pdf": "Документ PDF",
    "image/jpeg": "Изображение JPEG",
    "image/png": "Изображение PNG",
    "image/webp": "Изображение WebP",
  }[mimeType] ?? "Файл";
}
